/**
 * 게임 도메인 타입. 판이 도는 동안의 상태가 전부 여기 있다.
 *
 * 이 파일은 ZEP API에 의존하지 않는다 (ScriptWidget 참조는 PlayerTag 한 곳뿐).
 * 덕분에 도메인 로직을 Node에서 그대로 테스트할 수 있다.
 *
 * 여기 없는 것:
 *   Widget.types.ts       - 위젯에 그려 보낼 모양(*View, WidgetLayout)
 *   PlayerStorage.ts      - 판이 끝나도 남는 전적
 * 둘 다 이 파일에 있었다. 셋을 갈라 둔 기준은 수명이다 — 판과 함께 사라지는
 * 것(여기), 화면에 한 번 실려 나가고 마는 것, 저장소에 영구히 남는 것.
 * 수명이 다른 값이 한 파일에 있으면 "이 필드를 지워도 되는가"가 파일을
 * 봐서는 답이 안 나오는 질문이 된다.
 */
import type { ScriptWidget, VignetteEasing, WidgetAlign } from "zep-script";
import type { ChatChannel } from "../domain/chat/ChatChannel.ts";
import type { ChatMessage } from "../domain/chat/ChatMessage.ts";
import type { NightIntent, NightReveal } from "../domain/NightPipeline.ts";
import type { Bucket } from "../domain/RateLimit.ts";
import type { RuleSet } from "../domain/RuleSet.ts";

/**
 * 게임 진행 단계.
 *
 * 기존에는 3000~3006 매직넘버였다. 숫자에는 의미가 없어 로그를 봐도
 * 어떤 상태인지 알 수 없었고, 위젯 프로토콜과도 무관한 서버 내부 값이라
 * 문자열로 바꿔도 호환성 문제가 없다.
 */
export const GamePhase = {
	/** 대기실. 참가/준비/강퇴가 일어나는 유일한 단계 */
	LOBBY: "LOBBY",
	/** 직업 카드 확인 */
	ROLE_REVEAL: "ROLE_REVEAL",
	/** 밤. 역할별 능력 사용 */
	NIGHT: "NIGHT",
	/** 낮. 토론 */
	DAY: "DAY",
	/** 지목 투표 */
	VOTE: "VOTE",
	/** 지목 결과 공개. 여기서 죽는 사람은 없다 — 단상에 세울 뿐이다 */
	VOTE_RESULT: "VOTE_RESULT",
	/** 최후의 반론. 단상에 오른 사람만 말한다 */
	DEFENSE: "DEFENSE",
	/** 찬반투표. 처형이 확정되는 유일한 자리 */
	JUDGEMENT: "JUDGEMENT",
	/** 승패 확정 후 연출 */
	GAME_OVER: "GAME_OVER",
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

/**
 * 직업 식별자.
 *
 * 기존에는 "마피아", "의사" 같은 한글 문자열을 코드 전역에서 직접 비교했다.
 * 오타가 나도 컴파일 시점에 잡히지 않고 조건문이 조용히 false가 된다.
 * 실제로 team 값이 "mafia"인데 "마피아"와 비교하던 코드가 있었다.
 * 화면에 보여줄 한글 이름은 ROLE_DEFS의 displayName이 담당한다.
 */
export const Role = {
	MAFIA: "MAFIA",
	DOCTOR: "DOCTOR",
	POLICE: "POLICE",
	POLITICIAN: "POLITICIAN",
	/** 영매 */
	SHAMAN: "SHAMAN",
	SPY: "SPY",
	/** 자경단원 */
	VIGILANTE: "VIGILANTE",
	/** 군인 */
	SOLDIER: "SOLDIER",
	/** 건달 */
	THUG: "THUG",
	/** 기자 */
	REPORTER: "REPORTER",
	/** 짐승인간 */
	BEAST: "BEAST",
	/** 사기꾼 */
	CON_ARTIST: "CON_ARTIST",
	/** 점쟁이 */
	SEER: "SEER",
	/** 마담. 밤에 한 명을 유혹해 능력과 다음 낮 발언을 막는다 */
	MADAM: "MADAM",
	/** 도둑. 한 밤 훔치고 다음 밤 그 능력을 쓴다 */
	THIEF: "THIEF",
	/** 연인. 반드시 2인 1쌍 */
	LOVER: "LOVER",
	/** 사립탐정. 대상이 누구를 지목했는지 본다 */
	DETECTIVE: "DETECTIVE",
	/** 도굴꾼. 처음 나온 시민 편 사망자의 직업을 가져간다. 판에 한 번뿐이다 */
	GRAVEDIGGER: "GRAVEDIGGER",
	/** 테러리스트. 지목한 상대와 함께 죽는다 */
	TERRORIST: "TERRORIST",
	/** 성직자. 사망자 한 명을 되살린다 */
	PRIEST: "PRIEST",
	CITIZEN: "CITIZEN",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** 승리 진영 */
export const Team = {
	MAFIA: "mafia",
	CITIZEN: "citizen",
} as const;
export type Team = (typeof Team)[keyof typeof Team];

/**
 * 방에 앉은 한 명의 게임 상태.
 *
 * 기존 구조는 이 정보를 player.tag에 두고 room.players에 그 참조를 담았다.
 * 그런데 onJoinPlayer가 재접속 때 player.tag를 통째로 새 객체로 교체해서
 * room이 들고 있던 참조가 고아가 되고, 인원수/준비수가 어긋났다.
 *
 * 게임 상태는 접속이 아니라 게임에 속한다. 그래서 Seat은 방이 소유하고
 * playerId로만 플레이어를 가리킨다. 접속이 끊겨도 좌석은 남으므로
 * 재접속 복구와 종료 시 직업 공개가 자연스럽게 가능해진다.
 */
/**
 * 찬반투표에서 고른 것.
 *
 * 불리언 두 개(agreed·opposed)로 두면 둘 다 false인 상태가 "안 눌렀다"와
 * "취소했다" 양쪽을 뜻하게 되고, 둘 다 true인 상태를 타입이 막지 못한다.
 */
export const Judgement = {
	/** 아직 안 눌렀다. 기권이며 찬성에도 반대에도 세어지지 않는다(Trial.tallyJudgement) */
	NONE: "NONE",
	/** 찬성(O) — 처형 */
	AGREE: "AGREE",
	/** 반대(X) — 생존 */
	OPPOSE: "OPPOSE",
} as const;
export type Judgement = (typeof Judgement)[keyof typeof Judgement];

export interface Seat {
	readonly playerId: string;
	/** 게임 시작 시 부여되는 참가 번호(1..N). 대기실에서는 0 */
	index: number;
	/** 접속이 끊겨도 유지되는 표시 이름 */
	name: string;
	/** 이름 옆에 붙는 등급 표시. "Lv.12"이거나 "운영자"·"비로그인 유저"다 */
	rank: string;
	role: Role;
	team: Team;
	/** 접속 여부와 무관한 생존 여부 */
	alive: boolean;
	/** 대기실 준비 완료 */
	ready: boolean;
	/**
	 * 판이 끝난 뒤 같은 방에서 한 판 더 하겠다고 눌렀는가.
	 *
	 * 종료 화면에서만 켜지고, returnToLobby가 좌석을 비우기 전에 읽는다.
	 * ready를 다시 쓰지 않는 것은 둘이 서로 다른 질문이기 때문이다 —
	 * ready는 "지금 시작해도 좋다"이고 이쪽은 "다음 판에 앉겠다"다.
	 * 한 칸으로 합치면 종료 화면의 클릭이 다음 판의 시작 카운트다운을
	 * 건드리게 된다.
	 */
	rematch: boolean;
	/**
	 * 이번 투표에서 찍은 대상의 참가 번호. 0이면 아직 안 찍었다.
	 *
	 * 기존에는 boolean이어서 "이미 투표했다"만 알 수 있었다. 그래서 잘못 눌러도
	 * 되돌릴 방법이 없었는데, 원인은 규칙이 아니라 누구에게 줬는지를 기억하지
	 * 않은 것이었다. 대상을 들고 있으면 표 회수와 변경이 그냥 따라온다.
	 */
	votedFor: number;
	/** 이번 투표에서 받은 표 수 */
	voteCount: number;
	/**
	 * 이번 찬반투표에서 고른 것. DEFENSE에 들어갈 때 NONE으로 초기화된다.
	 *
	 * votedFor와 합치지 않는다 — 지목 투표는 대상을 고르는 일이고 찬반은
	 * 예/아니오라 값의 종류가 다르다. 한 필드로 겸하면 재지목이 일어난 낮에
	 * 앞 단계의 흔적이 뒤 단계로 새어 나온다.
	 */
	judgement: Judgement;
	/**
	 * 이번 낮에 토론 시간 조절(연장·단축)을 이미 썼는가.
	 *
	 * 연장과 단축이 횟수를 공유하므로 방향별로 나누지 않는다. 낮이 시작될
	 * 때마다 false로 돌아가고, 재지목으로 낮이 다시 열려도 마찬가지다 —
	 * 부결시킨 쪽에게 다시 토론할 시간을 주는 것이 재지목의 취지다.
	 */
	timeVoteSpent: boolean;
	/** 이번 밤에 의사가 치료한 대상인가 */
	healed: boolean;
	/**
	 * 이번 밤에 이 좌석을 공격한 사람들의 참가 번호.
	 *
	 * 기존에는 `marked: boolean` 하나였다. 밤의 공격자가 마피아뿐이라 "누가
	 * 찔렀는가"를 물을 일이 없었기 때문이다. 자경단원(오사하면 자신도 죽는다)과
	 * 짐승인간(마피아와 별개로 문다)이 생기면서 공격자가 셋으로 늘었고,
	 * 정산은 "몇 대 맞았는가"가 아니라 "누가 때렸는가"를 알아야 한다.
	 *
	 * 중복은 무해하다 — 정산은 좌석 단위라 여러 명이 같은 사람을 쳐도
	 * 죽음은 한 번이다.
	 */
	attackedBy: number[];
	/**
	 * 공격을 한 번 막아낼 수 있는가 (군인).
	 *
	 * healed와 달리 **밤이 바뀌어도 초기화되지 않는다.** 게임당 한 번뿐인
	 * 자원이라 소모 시점(resolveNightCasualties)에서만 false가 된다.
	 */
	armored: boolean;
	/**
	 * 이번 밤에 능력이 막혔는가 (건달).
	 *
	 * 읽는 곳은 밤 파이프라인 안뿐이다 — 능력을 거르는 순회와, 아침에 양쪽으로
	 * 통보를 보내는 notifyBlocked. 막힌 본인도 "누군가 방해했다"까지만 듣고
	 * 누가 막았는지는 듣지 못한다. 알면 다음 낮에 건달을 찾아 처형한다.
	 *
	 * 애초에 지목하지 않은 사람에게는 아무것도 보내지 않는다. 능력이 없는
	 * 사람이 "방해받았다"를 받으면 그 한 줄이 곧 건달의 존재 확정이다.
	 *
	 * healed와 같이 밤마다 초기화된다. PlayerTag.blocked(채팅 차단 목록)와는
	 * 이름만 같고 아무 관계가 없다.
	 */
	blocked: boolean;
	/** 기자가 취재해 다음 아침에 직업이 공개되는가 */
	scooped: boolean;
	/** 이번 밤에 능력을 이미 썼는가 */
	usedSkill: boolean;
	/**
	 * 능력을 이 판에서 지금까지 몇 번 썼는가. RoleDef.maxUses와 짝이다.
	 *
	 * usedSkill은 밤마다 초기화되지만 이것은 게임이 끝날 때까지 남는다.
	 * 두 값을 한 필드로 합치면 "이번 밤에 썼다"와 "이 판에 썼다"를 구분할 수 없다.
	 *
	 * 불리언(skillSpent)이었다. 게임당 한 번뿐인 직업이 둘일 때는 그것으로
	 * 충분했지만, 횟수가 다른 직업이 하나만 생겨도 플래그가 하나 더 늘어난다.
	 *
	 * 오르는 시점은 **정산**이다. 클릭 시점이 아니다 — 쪽지처럼 지목한 뒤에도
	 * 실제로 쓰지 않고 끝날 수 있는 능력이 있고, 클릭 시점에 올리면
	 * 막힌 자경단원이 총알을 잃은 채로 남는다.
	 *
	 * 이 값은 횟수다. `if (seat.usesSpent)`는 컴파일되지만 뜻이 다르다 —
	 * 그것은 "한 번이라도 썼는가"이지 "다 썼는가"가 아니다. 남은 횟수는
	 * NightResolution의 noTurnReason이 maxUses와 견주어 판정한다.
	 */
	usesSpent: number;
	/**
	 * 이번 밤에 고른 쪽지 문구. 안 골랐으면 빈 문자열.
	 *
	 * NightIntent에 얹지 않는 이유는 putIntent가 {actor, target}을 통째로
	 * 교체하기 때문이다. 거기 세 번째 필드를 넣으면 대상을 바꿀 때마다
	 * 고른 문구가 사라진다.
	 */
	noteText: string;
	/** 이 좌석을 강퇴 투표한 플레이어 ID 목록 (중복 투표 방지) */
	kickedBy: string[];
	/** 현재 접속 중인가 */
	connected: boolean;

	/*
	 * ── 클래식 모드가 더한 상태 ──────────────────────────────────
	 *
	 * 아래 값들은 직업(role)·팀(team)과 **다른 개념**이다. 한 좌석의 직업이
	 * 무엇인가와, 그 좌석이 지금 어떤 상태에 놓였는가는 따로 움직인다.
	 * 합치려던 시도가 두 번 있었고 둘 다 같은 곳에서 깨졌다 — 접선을 team으로
	 * 표현하면 접선 전 보조직업이 밀담을 볼 수 있게 되고, 유혹을 blocked로만
	 * 표현하면 밤이 끝날 때 함께 지워져 다음 낮의 발언 금지가 사라진다.
	 */

	/**
	 * 마피아팀 보조직업이 마피아와 연결됐는가.
	 *
	 * team === MAFIA인데 이 값이 거짓이면 밀담에 들어가지 못하고 승리 인원에도
	 * 세지 않는다. 좌석에 있으므로 재접속해도 유지된다.
	 * 보조직업이 아닌 좌석에서는 언제나 참이다 — "연결 여부를 물을 필요가 없다".
	 */
	contacted: boolean;
	/**
	 * 마담에게 유혹당했는가.
	 *
	 * blocked와 수명이 다르다. blocked는 밤 정산이 끝나면 지워지지만 이 값은
	 * 다음 낮의 발언 금지까지 살아 있어야 해서 다음 밤 시작에 지워진다.
	 * 마담이 죽으면 그 자리에서 풀린다(클래식 규칙).
	 */
	seduced: boolean;
	/**
	 * 건달에게 협박당했는가. 다음 낮의 지목 투표와 찬반 투표에 참여할 수 없다.
	 * 던지지 못한 찬반은 반대표로 센다.
	 */
	intimidated: boolean;
	/** 영매에게 성불당했는가. 사망자 채팅 불가, 성직자 소생 대상에서 제외 */
	exorcised: boolean;
	/**
	 * 연인 짝의 참가 번호. 0이면 짝이 없다.
	 *
	 * 양쪽에 서로를 적는다. 한쪽만 적으면 죽은 뒤 상대를 찾는 순회가
	 * 방향에 따라 다른 답을 낸다.
	 */
	loverIndex: number;
	/**
	 * 도둑이 지난밤 훔쳐 이번 밤에 쓸 직업. 없으면 null.
	 *
	 * role을 덮어쓰지 않는다 — 덮어쓰면 판이 끝났을 때 그 사람이 도둑이었다는
	 * 사실이 사라지고, 승리 판정과 결과 화면이 훔친 직업으로 그를 센다.
	 */
	borrowedRole: Role | null;
	/**
	 * 테러리스트가 안고 죽겠다고 지목해 둔 참가 번호. 0이면 없다.
	 *
	 * 밤마다 초기화하지 않는다. 폭탄이 터지는 시점은 지목한 밤이 아니라
	 * **테러리스트가 죽는 순간**이고, 그것은 다음 낮의 처형일 수도 있다.
	 * 매 밤 지우면 밤에 죽었을 때만 터지는 절반짜리 능력이 된다.
	 */
	markIndex: number;
	/**
	 * 접선한 스파이가 이번 밤에 **한 명 더** 조사하겠다고 찍은 참가 번호.
	 * 0이면 없다.
	 *
	 * room.nightIntents에 넣지 않는 이유는 그 목록이 "한 좌석의 지목은 하나"에
	 * 기대어 있기 때문이다(putIntent·targetOf). 둘째 지목을 같은 목록에 담으면
	 * 조회가 조용히 첫 지목만 답하고 둘째는 사라진다 — 능력을 쓴 사람에게는
	 * 아무 오류도 보이지 않는 채로.
	 *
	 * 밤마다 지운다(resetRound). 아래 extraProbeSpent와 수명이 다른 이유가
	 * 여기다 — 이쪽은 "이번 밤에 찍었는가", 저쪽은 "판에서 썼는가"다.
	 */
	extraProbeIndex: number;
	/**
	 * 추가 첩보를 이미 썼는가. **판에 한 번뿐이라** 밤이 바뀌어도 남는다.
	 *
	 * 군인에게 튕겨도 쓴 것으로 친다. 기본 첩보와 같은 규칙이고, 실패가
	 * 공짜면 캐내기가 군인 탐지기가 된다.
	 */
	extraProbeSpent: boolean;
}

/** 한 번의 개표가 남기는 것 */
export interface VoteRecord {
	/** [참가번호, 득표수] */
	board: Array<[number, number]>;
	/**
	 * 단상에 오른 참가 번호. 아무도 안 올랐으면 0.
	 *
	 * **처형 확정이 아니다.** 예전에는 이 값이 곧 처형된 사람이었지만,
	 * 최후의 반론과 찬반투표가 들어오면서 개표는 지목까지만 하고 죽음은
	 * JUDGEMENT가 정한다. 이름이 executed로 남아 있으면 화면과 코드가
	 * 반론 중인 사람을 이미 죽은 사람으로 그린다.
	 */
	nominee: number;
	/** 결과 화면에 띄우는 한 줄 */
	message: string;
}

/**
 * 컷의 색조. 위젯이 배경과 글자색을 고르는 데만 쓴다.
 *
 * 단계 이름(GamePhase)을 그대로 보내지 않는 이유는 둘이 1:1이 아니기
 * 때문이다 — 처형 컷은 VOTE_RESULT가 아니라 다음 밤에 얹히고, 승리 컷은
 * 이긴 진영에 따라 색이 갈린다. 단계를 보내면 위젯이 그 규칙을 알아야 한다.
 */
export type CutTone = "neutral" | "night" | "day" | "mafia" | "citizen";

/**
 * 지금 도는 중인 단계 전환 컷.
 *
 * 방 하나에 하나뿐이다. 컷은 단계가 바뀌는 순간에만 시작되고 다음 전환까지
 * 반드시 끝나므로 줄을 설 일이 없다 — 큐를 두면 "언제 비워지는가"라는
 * 상태가 하나 더 생기는데 그 값을 볼 사람이 없다.
 *
 * 방이 들고 있는 이유는 재접속이다. 컷은 사람마다 뜨는 위젯이지만 "지금
 * 무엇이 도는 중인가"는 방의 사실이라, 도중에 들어온 사람에게도 남은 만큼을
 * 그대로 보여줄 수 있다(GameFlow.showPhaseView).
 */
export interface ActiveCut {
	readonly title: string;
	readonly lines: string[];
	readonly tone: CutTone;
	/** 전체 길이(초). 남은 시간이 아니라 위젯에 실어 보낼 원래 길이 */
	readonly length: number;
	/** 남은 시간(초) */
	timer: number;
}

/**
 * 지금 카메라가 붙어 있는 클로즈업.
 *
 * 방 하나에 하나뿐인 이유는 ActiveCut과 같다 — 클로즈업은 사건이 일어난
 * 순간에만 걸리고 다음 사건까지 반드시 끝난다.
 *
 * 왜 방이 들고 있는가: 카메라를 남의 자리로 옮기면 **되돌릴 사람이
 * 필요하다.** 옮긴 곳에서 setTimeout으로 되돌리는 방법이 없다(ZEP 런타임에
 * 타이머가 없고, 있더라도 그 사이에 방이 끝나면 유령 콜백이 남는다).
 * 그래서 컷과 같은 방식으로 데이터만 두고 GameFlow의 프레임 루프가 굴린다
 * (Screen.advanceShot). 클로저를 방에 저장하지 않는 것이 요점이다.
 */
export interface ActiveShot {
	/** 카메라가 보고 있는 타일 */
	readonly tileX: number;
	readonly tileY: number;
	/** 남은 시간(초). 0이 되면 각자 자기 캐릭터로 돌아간다 */
	timer: number;
	/** 끝났을 때 되돌릴 배율 배수. 그 단계의 기본 배율이다 */
	readonly back: number;
}

/**
 * 화면 가장자리를 덮는 비네팅 한 겹.
 *
 * 값의 뜻과 표(Screen.Veil)는 Screen.ts에 있다. 타입만 여기 있는 이유는
 * 방이 이것을 기억해야 하기 때문이다 — 비네팅은 이전 반지름에서 다음
 * 반지름으로 넘어가는 API라, "지금 걸려 있는 값"을 모르면 어둠이 조여드는
 * 대신 매번 툭 나타난다(Screen.applyVeil).
 */
export interface VeilSpec {
	/** 뚫린 원의 반지름(px). 클수록 덜 덮는다 */
	readonly radius: number;
	/** 0xRRGGBB */
	readonly color: number;
	/** 가장자리를 번지게 하는 폭(px) */
	readonly blur: number;
	/** 가장 짙은 곳의 불투명도 */
	readonly opacity: number;
	/** 이 상태에 도달하는 데 걸리는 시간(밀리초) */
	readonly ms: number;
	readonly easing: VignetteEasing;
}

/** 게임 방 하나 */
export interface Room {
	readonly num: number;
	/** 맵 상의 방 좌상단 좌표 */
	readonly startPoint: readonly [number, number];
	/**
	 * 이 방이 쓰는 규칙. 방이 만들어질 때 정해지고 바뀌지 않는다.
	 *
	 * 방에 매달아 두는 이유는 전역 상수를 읽던 코드가 전부 room을 이미
	 * 들고 있기 때문이다 — 인자를 새로 넘길 필요 없이 참조만 바꾸면 된다.
	 */
	readonly ruleSet: RuleSet;
	phase: GamePhase;
	/**
	 * 이번 판의 식별자. beginGame이 새로 만들고 대기실로 돌아가면 비운다.
	 *
	 * 늦게 도착한 위젯 메시지를 버리는 데 쓴다 — 재경기가 시작된 뒤에
	 * 지난 판의 화면에서 눌린 버튼이 도착해도 이 값이 다르면 무시한다.
	 */
	gameId: string;
	/**
	 * 단계 순번. 단계가 바뀔 때마다 1씩 오른다. 게임 내내 되감기지 않는다.
	 *
	 * phase만으로는 부족하다 — 밤은 판마다 여러 번 오므로 "지금이 NIGHT인가"는
	 * 어느 밤인지를 구분하지 못한다. 순번이 있으면 이전 밤 화면에서 온 지목을
	 * 서버가 조용히 버릴 수 있다.
	 */
	phaseId: number;
	/**
	 * 이번 판의 난수 시드. 0이면 아직 정해지지 않았다.
	 *
	 * 직업 배정이 이 값 하나에서 결정된다. 같은 시드는 같은 배정을 낸다 —
	 * 시뮬레이션과 회귀 테스트가 그 성질에 의존한다.
	 */
	seed: number;
	/** 게임이 진행 중인가 (대기실이 아닌가) */
	started: boolean;
	/** 현재 단계의 남은 시간(초) */
	phaseTimer: number;
	/** 전원 준비 후 시작까지 남은 시간(초) */
	countdown: number;
	/**
	 * 카운트다운 라벨을 마지막으로 표시한 정수 초.
	 * 기존에는 매 프레임 라벨을 브로드캐스트해서 10초간 약 600회를 보냈다.
	 */
	lastCountdownLabel: number;
	/** 이번 단계에서 째깍 사운드를 이미 재생했는가 */
	tickTockPlayed: boolean;
	/** 진행된 낮의 수 */
	turnCount: number;
	/** 게임 시작 시점의 참가 인원 */
	total: number;
	/**
	 * 승부가 갈린 팀. GAME_OVER 이전에는 null.
	 * 종료 화면은 승자에 따라 다른 위젯을 열므로, 도중에 재접속한 사람에게
	 * 같은 화면을 다시 그려주려면 결과가 방에 남아 있어야 한다.
	 */
	winner: Team | null;
	/**
	 * 마지막 개표 결과. VOTE_RESULT 화면이 그대로 그린다.
	 *
	 * 집계를 다시 돌려 만들 수는 없다 — tallyVotes는 살아 있는 좌석만 세는데
	 * 결과 화면이 뜬 직후 처형이 일어나 그 좌석이 죽기 때문이다. 도중에
	 * 재접속한 사람에게 같은 화면을 주려면 그때 보여준 값이 남아 있어야 한다.
	 *
	 * 득표수만 남기던 것을 결과 한 줄과 처형 대상까지 묶었다. 화면이 필요한
	 * 셋이 항상 같은 집계에서 나오므로 따로 두면 어긋날 수 있다.
	 */
	voteRecord: VoteRecord;
	/**
	 * 지금 단상에 오른 참가 번호. 아무도 없으면 0.
	 *
	 * voteRecord.nominee와 값이 같아 보이지만 사는 기간이 다르다 —
	 * voteRecord는 다음 개표까지 화면에 남는 기록이고, 이쪽은 DEFENSE와
	 * JUDGEMENT가 누구를 다루는 중인지를 가리키는 현재 상태다. 찬반이
	 * 끝나면 0으로 돌아간다.
	 */
	nominee: number;
	/**
	 * 이번 낮에 찬반투표에서 부결된 참가 번호들.
	 *
	 * 재지목 때 다시 올라오지 못하게 막는다. 같은 사람을 두 번 올리면
	 * 재지목이 "표를 더 모을 때까지 반복"이 되어 부결에 뜻이 없어진다.
	 * 밤으로 넘어갈 때 비운다.
	 */
	rejected: number[];
	/**
	 * 이번 낮에 지목 투표를 몇 번 돌렸는가. 첫 투표가 1이다.
	 *
	 * 부결이 무한히 반복되면 밤이 오지 않는다. 상한은 Voting의
	 * MAX_VOTE_ROUNDS이고, 여기 도달하면 부결되어도 밤으로 넘어간다.
	 */
	voteRound: number;
	/**
	 * 지난 밤에 일어난 일 (아침 화면이 그대로 보여준다).
	 *
	 * 기존에는 이 내용이 채팅으로만 나갔다. 아침이 되면 토론이 시작되면서
	 * 채팅이 밀려 올라가, 몇 초 늦게 화면을 본 사람은 누가 죽었는지
	 * 모른 채 토론에 들어갔다. 방에 남겨두면 재접속한 사람도 볼 수 있다.
	 */
	nightReport: string[];
	/** 이번 밤에 쌓인 지목. 밤이 끝날 때 NightPipeline이 순서대로 적용한다 */
	nightIntents: NightIntent[];
	/** 아침 진입 직전에 각자에게 전할 밤의 답. 전하고 나면 비운다 */
	nightReveals: NightReveal[];
	seats: Seat[];
	/**
	 * 게임이 시작된 뒤 들어와 지켜보는 사람들.
	 *
	 * 좌석과 같은 Seat 값이지만 **일부러 다른 배열에 산다.** seats에 섞고
	 * spectator 플래그로 거르는 방법도 있었는데, 그러면 좌석을 도는 코드가
	 * 전부(승패 판정·개표·밤 지목·번호 배정·인원수·준비 판정) 그 플래그를
	 * 함께 봐야 한다. 한 곳만 빠뜨리면 관전자가 표를 받거나 마피아로 뽑히는
	 * 조용한 버그가 되고, 앞으로 좌석을 도는 코드를 쓰는 사람마다 같은
	 * 함정을 다시 만난다. 목록을 나누면 "참가자"를 도는 코드는 관전자를
	 * 볼 수 없고, 관전자에게 보낼 것은 보내는 쪽이 명시적으로 골라야 한다.
	 *
	 * 같은 Seat 타입을 쓰는 이유는 승격 때문이다 — 판이 끝나면 이 값을
	 * 그대로 seats로 옮기기만 하면 대기실 좌석이 된다. createSeat이 만드는
	 * 값이 곧 대기실 좌석이라 손볼 필드가 하나도 없다. 관전자는 "잘못된
	 * 시각에 도착한 대기실 좌석"이지 다른 종류의 존재가 아니다.
	 */
	spectators: Seat[];
	/** 밤에 배치한 실루엣 오브젝트 좌표 (방 단위로만 정리하기 위해 추적) */
	silhouettes: Array<[number, number]>;
	/**
	 * 이 방에서 오간 채팅·이벤트 기록 (오래된 것부터).
	 *
	 * 기록을 서버가 들고 있어야 하는 이유는 재접속이다. 위젯은 클라이언트에
	 * 살기 때문에 접속이 끊기면 그때까지의 대화가 통째로 사라진다. 기존
	 * 밤 채팅이 정확히 그랬고, 그래서 잠깐 튕긴 마피아는 팀이 무슨 작전을
	 * 세웠는지 알 방법이 없었다. 방이 기억하면 다시 열어줄 수 있다.
	 *
	 * 길이는 CHAT_LOG_LIMIT으로 제한한다 (오래된 것부터 버린다).
	 */
	chatLog: ChatMessage[];
	/** 지금 도는 중인 전환 컷. 없으면 null */
	cut: ActiveCut | null;
	/** 지금 걸려 있는 카메라 클로즈업. 없으면 null */
	shot: ActiveShot | null;
	/**
	 * 지금 깔려 있는 BGM 파일명. 없으면 빈 문자열.
	 *
	 * 두 가지 일을 한다. 같은 곡이 이어지는 단계에서 곡을 다시 시작하지
	 * 않게 하고(낮→투표→개표), 도중에 들어온 사람에게 같은 곡을 틀어준다
	 * (Screen.restoreView). 소리는 사람마다 나지만 "무엇이 깔려 있는가"는
	 * 방의 사실이라는 점에서 cut과 같은 성질이다.
	 */
	ambience: string;
	/**
	 * 지금 방 전체에 걸려 있는 카메라 배율 **배수**(Screen.Zoom의 값 하나).
	 *
	 * 절대값이 아니라 배수인 이유는 사람마다 기준이 다르기 때문이다 —
	 * 모바일은 화면이 좁아 기본이 0.7로 더 멀다(Screen.baseRatio). 절대값을
	 * 넣으면 폰에서 밤마다 화면이 갑자기 확대된다.
	 *
	 * 클로즈업이 걸린 동안에는 클로즈업의 배수가 들어 있고, 끝나면
	 * ActiveShot.back으로 되돌아간다. 즉 "지금 실제로 보이는 배율"이다.
	 */
	zoom: number;
	/**
	 * 지금 방 전체에 걸려 있는 비네팅(Screen.Veil의 값 하나).
	 *
	 * null이 아니라 항상 무언가가 들어 있다 — 아무것도 덮지 않은 상태가
	 * Veil.NONE이다. 없음을 null로 두면 다음 전환의 출발 반지름을 어디서
	 * 가져올지 매번 분기해야 하는데, 그 분기가 곧 "밤에서 낮으로 갈 때만
	 * 어둠이 툭 사라지는" 버그가 된다.
	 *
	 * ambience와 같은 성질이다: 보이는 것은 사람마다지만 "무엇이 걸려
	 * 있는가"는 방의 사실이라, 도중에 들어온 사람에게 그대로 입혀줄 수 있다
	 * (Screen.restoreView).
	 */
	veil: VeilSpec;
}

/**
 * 플레이어 접속에 종속된 상태.
 *
 * 게임 상태(역할/생존/투표)는 전부 Seat으로 옮겼다.
 * 여기에는 이 접속에서만 의미가 있는 것 — 위젯 핸들과 읽음·차단 기록 — 만 남긴다.
 * 기존에는 21개 필드가 tag.data와 tag에 경계 없이 섞여 있었다.
 */
/**
 * "이 화면은 이 판의 이 단계 것이다"를 적어 두는 도장.
 *
 * 판이 바뀌면 gameId가 달라지고, 단계가 바뀌면 phaseId가 오른다. 둘을 함께
 * 보는 이유는 어느 한쪽만으로는 새지 않기 때문이다 — 재경기는 phaseId가
 * 되감기고, 한 판 안에서는 gameId가 그대로다.
 */
export interface PhaseStamp {
	gameId: string;
	phaseId: number;
}

export interface PlayerTag {
	/** 대기실/단계별 메인 위젯 */
	widget: ScriptWidget | null;
	/**
	 * 메인 위젯이 어떤 정렬·크기로 열렸는가.
	 *
	 * 위젯 핸들에는 자기 크기가 남지 않는데, 채팅을 펼칠 때 메인 위젯의
	 * 상자를 다시 계산해야 한다(Widgets.squeezeMain). 그 재료를 여기 둔다.
	 */
	mainBox: { align: WidgetAlign; size: { width: number; height: number; mobile?: number } } | null;
	/**
	 * 메인 위젯이 어느 판·어느 단계의 화면으로 열렸는가.
	 *
	 * 늦게 도착한 클릭을 버리는 근거다. 위젯은 클라이언트에서 돌고 메시지는
	 * 비동기라, 단계가 바뀐 뒤에 지난 화면의 버튼이 서버에 닿을 수 있다.
	 * room.phase만 보는 검사로는 같은 이름의 단계가 여러 번 오는 것을
	 * (밤·재투표) 구분하지 못한다.
	 *
	 * 위젯이 아니라 좌석 주인의 tag에 적는 이유는 위젯 핸들에 아무것도
	 * 붙일 수 없어서다. 값이 null이면 "이 화면은 판정 대상이 아니다"라는
	 * 뜻이고(대기실·채팅), 그때는 예전처럼 단계 검사에만 맡긴다 —
	 * 도장을 빠뜨린 경로가 생겨도 조용히 입력이 막히지는 않는다.
	 */
	mainStamp: PhaseStamp | null;
	/**
	 * 카드 위젯 (직업 공개 · 첫 안내 · 직업 도감이 함께 쓰는 자리).
	 *
	 * 셋 다 "메인 화면 위에 잠깐 겹쳐 읽고 닫는 것"이라 슬롯 하나로 충분하다.
	 * 단계가 바뀌면 다음 open*이 이 자리를 회수한다 — 밤에 도감을 펼쳐 둔 채
	 * 지목 화면을 가리는 일이 구조적으로 없다.
	 */
	cardWidget: ScriptWidget | null;
	/**
	 * 단계 전환 컷 위젯.
	 *
	 * 카드와 자리를 나눠 쓰지 않는다. 둘 다 겹쳐 뜨는 위젯이지만 여는 주체가
	 * 다르다 — 카드는 사람이 열고(도감·안내) 컷은 방이 연다. 한 자리를 쓰면
	 * 컷이 도는 동안 도감을 펼친 사람에게서 둘 중 하나가 조용히 사라진다.
	 */
	cutWidget: ScriptWidget | null;
	/**
	 * 프로필 창 위젯 (남을 클릭했을 때 뜨는 창).
	 *
	 * 여는 주체가 또 다르다 — 카드는 사람이 자기 화면에 열고, 컷은 방이 열고,
	 * 이건 "남을 클릭했다"는 한 번의 행동이 연다. 카드 자리를 나눠 쓰면
	 * 직업 카드를 읽는 중에 옆 사람을 잘못 눌러 카드가 사라진다.
	 */
	profileWidget: ScriptWidget | null;
	/**
	 * 이번 접속에서 첫 안내를 이미 봤는가.
	 *
	 * 영구 판정은 PlayerStorage.playCount가 한다. 그런데 게스트는 저장이
	 * 통째로 no-op이라(PlayerStorage.update) playCount가 영원히 0이고,
	 * 그것만 보면 게스트는 방에 들어갈 때마다 안내를 다시 받는다.
	 * 접속 범위 플래그가 그 구멍을 막는다.
	 */
	guideSeen: boolean;
	/**
	 * 통합 채팅 위젯.
	 *
	 * 다른 두 위젯과 달리 단계가 바뀌어도 닫지 않는다. 접속해 있는 내내
	 * 같은 자리에 떠 있는 유일한 화면이다.
	 */
	chatWidget: ScriptWidget | null;
	/** 채팅창을 펼쳐 두었는가. 접었을 때는 작은 막대로만 띄운다 */
	chatOpen: boolean;
	/** 지금 보고 있는 채널 탭 */
	chatChannel: ChatChannel;
	/**
	 * 채널별로 마지막까지 읽은 메시지의 seq.
	 *
	 * 미확인 개수를 카운터로 들고 있지 않는 이유는 이 프로젝트의 다른
	 * 파생값(readyCount, kickCount)과 같다. 증가·감소 지점이 여러 곳이면
	 * 한 곳만 빠뜨려도 값이 영구히 어긋난다. "어디까지 읽었는가" 하나만
	 * 저장하고 개수는 기록에서 매번 센다.
	 */
	chatSeen: { [channel: string]: number };
	/**
	 * 도배 방지용 여유분. 한 번 쓸 때마다 줄고 시간이 지나면 다시 찬다.
	 *
	 * 두 값이 tag에 있는 이유는 chatSeen과 같다 — 접속해 있는 동안만 의미가
	 * 있고 플레이어와 함께 사라져야 하는 값이다. Lobby의 kickedUntil처럼
	 * 모듈 전역 표에 두면 나간 사람의 항목이 영영 남는다.
	 *
	 * 발언용과 버튼용을 나눠 둔다. 하나로 합치면 방금 채팅을 몇 줄 친 사람이
	 * 참가 버튼을 못 누른다.
	 */
	chatRate: Bucket;
	actionRate: Bucket;
	/**
	 * 내가 차단한 사람. playerId → 차단하던 시점의 이름.
	 *
	 * 이름을 함께 들고 있는 이유는 목록과 해제 때문이다. id만 저장하면
	 * `/차단목록`이 알아볼 수 없는 문자열을 늘어놓고, 상대가 나간 뒤에는
	 * 이름으로 찾을 수 없어 영영 풀지 못한다.
	 *
	 * ponytail: 접속이 끊기면 함께 사라진다(tag의 수명). 재접속해도 유지하려면
	 * PlayerStorage에 얹으면 되지만, 그 순간 "차단 목록을 언제 저장하는가"가
	 * 새 결정이 된다. 한 판짜리 게임에서 세션 범위로 충분하다.
	 */
	blocked: { [playerId: string]: string };
	/**
	 * 이번 접속에서 이미 신고한 사람.
	 *
	 * 같은 사람을 연타로 신고하면 운영자 화면이 그 한 사람으로 덮인다 —
	 * 신고 기능이 그대로 도배 도구가 된다.
	 */
	reported: { [playerId: string]: boolean };
}
