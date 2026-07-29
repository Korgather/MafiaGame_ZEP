/**
 * 게임 규칙 상수.
 *
 * 기존에는 22, 17, 7, 10, 0.1, 3, 30000 같은 숫자가 함수 본문 곳곳에
 * 흩어져 있었다. 밸런스를 바꾸려면 2000줄을 뒤져야 했고, 같은 의미의 숫자가
 * 서로 다른 곳에서 따로 관리되고 있었다.
 */

/** 동시에 돌아가는 게임 방 수 */
export const ROOM_COUNT = 8;

/** 게임 시작에 필요한 최소 인원 */
export const MIN_PLAYERS = 4;

/** 한 방의 최대 인원 */
export const MAX_PLAYERS = 8;

export const TIMING = {
	/** 전원 준비 완료 후 게임 시작까지(초) */
	START_COUNTDOWN: 10,
	/**
	 * 직업 카드 확인 시간(초).
	 * 기존 값은 0.1초여서 자기 직업을 읽을 시간이 없었다.
	 */
	ROLE_REVEAL: 5,
	/** 밤 지속 시간(초) */
	NIGHT: 22,
	/** 낮 토론: 생존자 1명당 부여되는 시간(초) */
	DAY_PER_ALIVE: 10,
	/** 낮 토론 최대 시간(초) */
	DAY_MAX: 60,
	/** 투표 시간(초) */
	VOTE: 17,
	/** 투표 결과 공개 시간(초) */
	VOTE_RESULT: 7,
	/** 승패 연출 후 대기실 복귀까지(초) */
	GAME_OVER: 5,
	/** 남은 시간이 이 값 아래로 내려가면 째깍 사운드 재생(초) */
	TICK_TOCK_AT: 9,
} as const;

export const KICK = {
	/** 강퇴에 필요한 표 수 */
	VOTES_REQUIRED: 3,
	/** 강퇴당한 뒤 재입장이 금지되는 시간(ms) */
	COOLDOWN_MS: 30000,
} as const;

/** 정치인이 행사하는 표의 무게 */
export const POLITICIAN_VOTE_WEIGHT = 2;

/** 운영자 판정 기준이 되는 ScriptPlayer.role 값 */
export const ADMIN_ROLE_LEVEL = 3000;

/** 운영자 치트로 지급되는 경험치 */
export const ADMIN_EXP_GRANT = 10;

/** 접속자 수를 외부 서버에 보고하는 주기(초) */
export const CCU_REPORT_INTERVAL = 5;

/** 접속/이탈 직후 보고를 앞당기는 지연(초) */
export const CCU_REPORT_DEBOUNCE = 3;
