/**
 * 게임 도메인 타입.
 *
 * 이 파일은 ZEP API에 의존하지 않는다 (ScriptWidget 참조는 PlayerTag 한 곳뿐).
 * 덕분에 도메인 로직을 Node에서 그대로 테스트할 수 있다.
 */
import type { ScriptWidget } from "zep-script";
import type { ChatChannel } from "../domain/chat/ChatChannel.ts";
import type { ChatMessage } from "../domain/chat/ChatMessage.ts";

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
	/** 대기실 목록에 보여줄 레벨 문자열 */
	level: string;
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
	/** 건달에게 협박당해 다음 낮 투표가 막혔는가 */
	silenced: boolean;
	/** 기자가 취재해 다음 아침에 직업이 공개되는가 */
	scooped: boolean;
	/** 이번 밤에 능력을 이미 썼는가 */
	usedSkill: boolean;
	/**
	 * 게임당 한 번뿐인 능력을 이미 써버렸는가 (자경단원·기자).
	 *
	 * usedSkill은 밤마다 초기화되지만 이것은 게임이 끝날 때까지 남는다.
	 * 두 값을 한 필드로 합치면 "이번 밤에 썼다"와 "이 판에 썼다"를 구분할 수 없다.
	 */
	skillSpent: boolean;
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

/** 게임 방 하나 */
export interface Room {
	readonly num: number;
	/** 맵 상의 방 좌상단 좌표 */
	readonly startPoint: readonly [number, number];
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
	seats: Seat[];
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
}

/**
 * 플레이어 접속에 종속된 상태.
 *
 * 게임 상태(역할/생존/투표)는 전부 Seat으로 옮겼다.
 * 여기에는 이 접속에서만 의미가 있는 것 — 위젯 핸들과 원래 닉네임 — 만 남긴다.
 * 기존에는 21개 필드가 tag.data와 tag에 경계 없이 섞여 있었다.
 */
export interface PlayerTag {
	/** 대기실/단계별 메인 위젯 */
	widget: ScriptWidget | null;
	/** 직업 카드 위젯 */
	roleWidget: ScriptWidget | null;
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
	/** 게임 중 이름을 바꾸므로 원래 닉네임을 보관한다 */
	originalName: string;
}

/**
 * 대기실 목록에 그려지는 한 줄. lobby.html이 읽는 필드와 1:1이다.
 * 위젯에 room 객체를 통째로 넘기던 것을 이 DTO로 좁혔다.
 */
export interface LobbySeatView {
	id: string;
	name: string;
	level: string;
	runCount: number;
	ready: boolean;
	kickCount: number;
}

/**
 * 게임 중 "사람 하나"를 그리는 데 필요한 것. 밤 지목과 투표가 같이 쓴다.
 *
 * 기존에는 두 화면이 number[] (참가 번호만)를 받아 번호 버튼을 그렸다.
 * 8명이 도는 판에서 화면에는 1~8만 있고 이름이 없어서, 방금 누가 무슨
 * 말을 했는지와 몇 번인지를 사람이 머릿속에서 이어야 했다. 밤에 사람을
 * 잘못 지목하는 가장 흔한 원인이었다.
 */
export interface SeatView {
	num: number;
	name: string;
	alive: boolean;
	/** 같은 마피아 팀인가 (마피아 위젯에서만 채워진다) */
	ally?: boolean;
	/** 개표 화면의 득표수 */
	votes?: number;
}

/**
 * 채팅창의 탭 하나.
 *
 * 위젯은 채널의 규칙을 모른다. "지금 이 탭이 있고, 쓸 수 있고, 안 읽은
 * 것이 N개"라는 결과만 받는다. 밤에 마피아 탭이 생기는 이유도, 죽으면
 * 방 탭에 자물쇠가 걸리는 이유도 서버 쪽 표(ChatPermission)에만 있다.
 */
export interface ChatChannelView {
	id: string;
	label: string;
	glyph: string;
	/** 이 탭에 글을 쓸 수 있는가. false면 입력창이 잠긴다 */
	write: boolean;
	/** 미확인 메시지 수 */
	unread: number;
	placeholder: string;
}

/** 종료 화면의 직업 공개 한 줄 */
export interface RevealView {
	num: number;
	name: string;
	role: string;
	team: Team;
	alive: boolean;
}

/** 플레이어 스토리지에 저장되는 전적 */
export interface PlayerStorage {
	exp: number;
	playCount?: number;
	runCount?: number;
	mafiaWin?: number;
	mafiaLose?: number;
	citizenWin?: number;
	citizenLose?: number;
}
