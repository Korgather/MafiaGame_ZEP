/**
 * 게임 도메인 타입.
 *
 * 이 파일은 ZEP API에 의존하지 않는다 (ScriptWidget 참조는 PlayerTag 한 곳뿐).
 * 덕분에 도메인 로직을 Node에서 그대로 테스트할 수 있다.
 */
import type { ScriptWidget } from "zep-script";

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
	/** 이번 투표에서 표를 행사했는가 */
	voted: boolean;
	/** 이번 투표에서 받은 표 수 */
	voteCount: number;
	/** 이번 밤에 의사가 치료한 대상인가 */
	healed: boolean;
	/** 이번 밤에 마피아가 지목한 대상인가 */
	marked: boolean;
	/** 이번 밤에 능력을 이미 썼는가 */
	usedSkill: boolean;
	/** 이 좌석을 강퇴 투표한 플레이어 ID 목록 (중복 투표 방지) */
	kickedBy: string[];
	/** 현재 접속 중인가 */
	connected: boolean;
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
	seats: Seat[];
	/** 밤에 배치한 실루엣 오브젝트 좌표 (방 단위로만 정리하기 위해 추적) */
	silhouettes: Array<[number, number]>;
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
	/** 유령·영매 채팅 위젯 */
	ghostWidget: ScriptWidget | null;
	/** 게임 중 이름을 바꾸므로 원래 닉네임을 보관한다 */
	originalName: string;
}

/**
 * 대기실 목록에 그려지는 한 줄. WatingRoom.html이 읽는 필드와 1:1이다.
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
