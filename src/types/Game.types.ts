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
import type { ScriptWidget, WidgetAlign } from "zep-script";
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
	/** 투표 */
	VOTE: "VOTE",
	/** 투표 결과 공개 */
	VOTE_RESULT: "VOTE_RESULT",
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
	 * 이번 투표에서 찍은 대상의 참가 번호. 0이면 아직 안 찍었다.
	 *
	 * 기존에는 boolean이어서 "이미 투표했다"만 알 수 있었다. 그래서 잘못 눌러도
	 * 되돌릴 방법이 없었는데, 원인은 규칙이 아니라 누구에게 줬는지를 기억하지
	 * 않은 것이었다. 대상을 들고 있으면 표 회수와 변경이 그냥 따라온다.
	 */
	votedFor: number;
	/** 이번 투표에서 받은 표 수 */
	voteCount: number;
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
	 * 실제로 쓰지 않고 끝날 수 있는 능력이 있고, 막는 능력이 들어오면
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
}

/** 한 번의 개표가 남기는 것 */
export interface VoteRecord {
	/** [참가번호, 득표수] */
	board: Array<[number, number]>;
	/** 처형된 참가 번호. 처형이 없었으면 0 */
	executed: number;
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
}

/**
 * 플레이어 접속에 종속된 상태.
 *
 * 게임 상태(역할/생존/투표)는 전부 Seat으로 옮겼다.
 * 여기에는 이 접속에서만 의미가 있는 것 — 위젯 핸들과 읽음·차단 기록 — 만 남긴다.
 * 기존에는 21개 필드가 tag.data와 tag에 경계 없이 섞여 있었다.
 */
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
