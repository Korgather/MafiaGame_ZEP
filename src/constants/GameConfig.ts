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
	 *
	 * 기존 값은 0.1초여서 자기 직업을 읽을 시간이 없었다. 5초로 늘렸지만
	 * 그때 카드는 그림 한 장이었다. 지금은 직업명·능력·요령 세 줄을 읽고
	 * 그것으로 첫 밤을 보내야 하므로, 읽는 데 걸리는 시간에 맞춘다.
	 */
	ROLE_REVEAL: 9,
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
	/**
	 * 승패 연출 후 대기실 복귀까지(초).
	 *
	 * 5초는 결과 화면이 이미지 한 장이던 시절의 값이다. 이제 전원의 정체가
	 * 최대 8줄로 공개되는데, "쟤가 마피아였어?"를 확인하는 이 순간이 다음 판을
	 * 시작하게 만드는 지점이다. 8줄을 읽을 시간을 준다.
	 */
	GAME_OVER: 14,
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

/** 이 인원부터 마피아 진영이 2명이 된다 */
export const MAFIA_PAIR_AT = 6;

/**
 * 의사·경찰을 뺀 나머지 시민 자리 중 능력자가 차지하는 비율.
 *
 * 1이면 전원이 능력자가 되어 "아무 정보도 없는 다수"가 사라진다.
 * 그 다수가 있어야 마피아가 섞여 들 자리도 있고, 능력자가 밝혀졌을 때
 * 위험을 감수할 이유도 생긴다. 밸런스를 만지는 손잡이가 여기 하나다.
 */
export const SPECIAL_CITIZEN_RATIO = 0.5;

/** 운영자 판정 기준이 되는 ScriptPlayer.role 값 */
export const ADMIN_ROLE_LEVEL = 3000;

/** 운영자 치트로 지급되는 경험치 */
export const ADMIN_EXP_GRANT = 10;

/** 접속자 수를 외부 서버에 보고하는 주기(초) */
export const CCU_REPORT_INTERVAL = 5;

/** 접속/이탈 직후 보고를 앞당기는 지연(초) */
export const CCU_REPORT_DEBOUNCE = 3;
