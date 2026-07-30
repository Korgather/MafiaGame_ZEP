/**
 * 모드 하나가 바꾸는 것 전부.
 *
 * 기존에는 타이밍이 GameConfig.TIMING에, 덱 구성이 RoleAssignment의 모듈
 * 상수에, 인원 한계가 또 GameConfig에 있었다. 모드를 하나 만들려면 세 파일을
 * 고치면서 "표준전일 때는 원래대로"라는 분기를 세 벌 넣어야 했고, 그 분기가
 * 서로 어긋나면 어긋난 채로 돌아갔다.
 *
 * 값 하나로 묶으면 모드 추가는 리터럴 하나이고, 되돌리기는 배정표 한 줄이다.
 *
 * 함수를 담지 않는다. "인원에 따라 마피아 수를 계산하는 함수"를 넣으면
 * 모드마다 로직이 갈라져 어느 모드가 무엇을 하는지 읽어서는 알 수 없게 된다.
 * 인원별 값은 배열로 적는다 — 표는 눈으로 읽힌다.
 */
import { Role } from "../types/Game.types.ts";

export interface Timing {
	/** 전원 준비 완료 후 게임 시작까지(초) */
	readonly START_COUNTDOWN: number;
	/**
	 * 직업 카드 확인 시간(초).
	 *
	 * 기존 값은 0.1초여서 자기 직업을 읽을 시간이 없었다. 5초로 늘렸지만
	 * 그때 카드는 그림 한 장이었다. 지금은 직업명·능력·요령 세 줄을 읽고
	 * 그것으로 첫 밤을 보내야 하므로, 읽는 데 걸리는 시간에 맞춘다.
	 */
	readonly ROLE_REVEAL: number;
	/** 밤 지속 시간(초) */
	readonly NIGHT: number;
	/** 낮 토론: 생존자 1명당 부여되는 시간(초) */
	readonly DAY_PER_ALIVE: number;
	/** 낮 토론 최대 시간(초) */
	readonly DAY_MAX: number;
	/** 투표 시간(초) */
	readonly VOTE: number;
	/** 투표 결과 공개 시간(초) */
	readonly VOTE_RESULT: number;
	/**
	 * 승패 연출 후 대기실 복귀까지(초).
	 *
	 * 5초는 결과 화면이 이미지 한 장이던 시절의 값이다. 이제 전원의 정체가
	 * 최대 MAX_PLAYERS줄로 공개되는데, "쟤가 마피아였어?"를 확인하는 이 순간이
	 * 다음 판을 시작하게 만드는 지점이다. 12줄을 읽을 시간을 준다.
	 */
	readonly GAME_OVER: number;
	/** 남은 시간이 이 값 아래로 내려가면 째깍 사운드 재생(초) */
	readonly TICK_TOCK_AT: number;
}

export interface DeckSpec {
	/**
	 * 참가 인원별 마피아 진영 인원. index가 곧 참가 인원이다.
	 *
	 * 길이는 항상 MAX_PLAYERS + 1로 맞춘다. 정원이 더 작은 모드도 남는 칸을
	 * 비우지 말고 정원 값을 반복한다 — 0을 넣으면 만에 하나 그 칸을 읽었을 때
	 * 마피아 0명 판이 되어 시작하자마자 시민 승리가 난다.
	 */
	readonly mafiaTeamSize: readonly number[];
	/**
	 * 마피아 진영 첫 자리 후보. 비면 Role.MAFIA를 쓴다.
	 * 마피아 없는 판은 성립하지 않으므로 이 자리는 언제나 채워진다.
	 */
	readonly leadPool: readonly Role[];
	/** 둘째 자리부터의 후보 */
	readonly mafiaPool: readonly Role[];
	/**
	 * 반드시 들어가는 시민 능력자.
	 *
	 * 이들이 빠진 판은 시민에게 정보가 아예 없어서 토론이 근거 없는
	 * 지목으로만 흘러간다.
	 */
	readonly citizenRequired: readonly Role[];
	/** 남는 시민 자리 일부에 뽑히는 후보 */
	readonly citizenPool: readonly Role[];
	/** 같은 판에 함께 들어갈 수 없는 묶음 */
	readonly exclusiveGroups: readonly (readonly Role[])[];
	/**
	 * 그 직업이 등장하기 시작하는 최소 참가 인원.
	 *
	 * Partial인 이유는 타입 설정이다. 이 프로젝트는
	 * noUncheckedIndexedAccess를 켜지 않아 인덱스 시그니처 접근이
	 * `number`로 좁혀진다 — 그러면 `floor !== undefined` 비교가 타입
	 * 오류가 된다. Partial<Record<>>는 값을 `number | undefined`로 주므로
	 * "적히지 않은 직업"을 코드가 다룰 수 있다.
	 */
	readonly minPlayers: Partial<Record<Role, number>>;
}

/** 낮에 자유롭게 말할 수 있는가, 준비된 문구만 쓸 수 있는가 */
export type ChatMode = "free" | "phrasesOnly";

export interface RuleSet {
	/** 코드가 분기하거나 집계에 쓰는 식별자 */
	readonly id: string;
	/** 화면에 나가는 이름 */
	readonly displayName: string;
	/** 화면에 나가는 한 줄 설명 */
	readonly summary: string;
	readonly timing: Timing;
	readonly deck: DeckSpec;
	/** 몇 인 판까지 첫 밤에 아무도 죽지 않는가. 0이면 끔 */
	readonly firstNightPeacefulUpTo: number;
	readonly minPlayers: number;
	readonly maxPlayers: number;
	readonly chatMode: ChatMode;
}

/**
 * 표준전. 다른 모드는 전부 여기서 무엇을 뺐는지로 읽힌다.
 *
 * 인원표(4~6인 1명 / 7~10인 2명 / 11~12인 3명)는 원래 MAFIA_RATIO = 0.27
 * 하나로 반올림해 구했다. 비율은 정원이 바뀌어도 상수가 늘지 않지만
 * "6인 판이 왜 2명인가"에 답할 수 없었다 — 답이 반올림 안에 있었다.
 * 그리고 그 2명은 실제로 틀린 값이었다. 시민 4명 중 의사·경찰이
 * 확정이므로 마피아가 둘이면 첫 투표를 정확히 맞혀도 2:3, 한 번 틀리면
 * 그대로 끝난다. 표로 적으면 이 판단을 인원마다 따로 내릴 수 있다.
 *
 * 첫 밤 무사 문턱이 8인 이유도 같은 종류다. 작은 판에서 첫 밤 사망은
 * 정보가 아니라 손실이라(죽은 사람은 한 마디도 못 했다) 추리가 시작되기
 * 전에 인원만 줄어든다. 9인부터는 죽어도 토론할 사람이 충분히 남는다.
 *
 * mafiaPool의 두 후보는 둘 다 마피아 팀이지만 하는 일이 다르다 — 둘째
 * 마피아는 같이 죽일 사람을 고르고, 짐승인간은 혼자 따로 문다. 건달이
 * 시민으로 돌아간 뒤로 후보가 둘뿐이라 실제로 판마다 구성이 갈리는 인원은
 * 10인 하나다. 뽑는 개수(mafia - 1)와 밤 사망자 예산 필터를 겹치면 이렇다.
 *   4~6인  : 0개를 뽑는다 — 마피아 한 명으로 고정
 *   7~9인  : 짐승인간이 걸러져 남는 후보가 하나뿐이라 늘 마피아
 *   10인   : 후보 둘 중 하나를 뽑는다 — 구성이 갈리는 유일한 인원
 *   11~12인: 후보 2개에서 2개를 뽑으니 늘 마피아 + 짐승인간
 *
 * 그런데도 Role.MAFIA를 풀에 남겨 둔 이유는 둘째 줄에 있다. 짐승인간을
 * 감당하지 못하는 판에도 두 번째 자리는 채워야 하고, 아무 능력 없는 공범이
 * 그 메움패다 — 빼면 7~9인 판의 둘째 마피아가 통째로 사라진다.
 *
 * 걸러지는 기준은 밤 사망자 예산(CITIZENS_PER_NIGHT_KILL)이다. 조건은
 * 인원수가 아니라 시민 자리 수(citizenSlots)이므로 마피아 수와 함께 움직인다 —
 * 정리하면 citizenSlots >= 8일 때만 짐승인간이 후보로 남는다. 인원표에서
 * 10인 판이 마피아 2명이 되면서 시민 자리가 8이 되었고, 짐승인간은 그
 * 10인부터 뽑힌다.
 *
 * 주의: mafiaPool의 길이(2)가 곧 최대 추첨 수(11~12인의 mafia - 1 = 2)라
 * 여유가 한 칸도 없다. mafiaTeamSize를 고쳐서 mafia >= 3인 인원이 짐승인간이
 * 걸러지는 구간(citizenSlots < 8)과 겹치면 draw가 요청보다 적게 돌려주고,
 * 덱은 마피아 한 명이 모자란 채로 조용히 나간다. 그때는 인원표만이 아니라 이
 * 풀에도 후보를 더해야 한다 (tests/deck.test.ts "마피아 진영 인원이 표와
 * 정확히 같다"가 4~12인을 훑으므로 그 자리에서 걸린다).
 */
export const STANDARD_RULES: RuleSet = {
	id: "standard",
	displayName: "표준전",
	// 하한은 6이 아니라 4다(아래 minPlayers). 이 문장이 방에 들어올 때마다
	// 화면에 나가기 시작했으므로 틀린 수를 그대로 둘 수 없다
	summary: "기본 규칙. 4~12명, 5~10분",
	timing: {
		START_COUNTDOWN: 10, ROLE_REVEAL: 9, NIGHT: 22,
		DAY_PER_ALIVE: 10, DAY_MAX: 60, VOTE: 17, VOTE_RESULT: 7,
		GAME_OVER: 16, TICK_TOCK_AT: 9,
	},
	deck: {
		mafiaTeamSize: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3],
		//              0  1  2  3  4  5  6  7  8  9  10 11 12
		leadPool: [Role.MAFIA],
		mafiaPool: [Role.MAFIA, Role.BEAST],
		citizenRequired: [Role.DOCTOR, Role.POLICE],
		citizenPool: [
			Role.POLITICIAN, Role.SHAMAN, Role.SPY,
			Role.SOLDIER, Role.REPORTER, Role.VIGILANTE,
		],
		exclusiveGroups: [],
		minPlayers: {},
	},
	firstNightPeacefulUpTo: 8,
	minPlayers: 4,
	maxPlayers: 12,
	chatMode: "free",
};

/**
 * 속도전. 초보 유입용 3분 단판.
 *
 * 낮 25초는 DAY_MAX만 25로 두면 인원과 무관하게 항상 25가 되므로
 * DAY_PER_ALIVE를 5로 낮춰 소인원에서 더 짧아지게 했다(4인 20초, 6인 25초).
 *
 * 짐승인간을 넣지 않았다 — 이 모드의 목적은 경찰의 확정 정보를 남겨
 * "조사해서 잡는다"는 기본 흐름을 배우게 하는 것이다.
 */
export const BLITZ_RULES: RuleSet = {
	id: "blitz",
	displayName: "속도전",
	summary: "3분 단판. 직업 다섯 개, 생각할 시간 없음",
	timing: {
		START_COUNTDOWN: 7, ROLE_REVEAL: 6, NIGHT: 12,
		DAY_PER_ALIVE: 5, DAY_MAX: 25, VOTE: 10, VOTE_RESULT: 4,
		GAME_OVER: 10, TICK_TOCK_AT: 5,
	},
	deck: {
		mafiaTeamSize: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 2],
		leadPool: [Role.MAFIA],
		mafiaPool: [Role.MAFIA],
		citizenRequired: [Role.DOCTOR, Role.POLICE],
		citizenPool: [Role.SOLDIER],
		exclusiveGroups: [],
		minPlayers: {},
	},
	firstNightPeacefulUpTo: 8,
	minPlayers: 4,
	maxPlayers: 8,
	chatMode: "free",
};

/**
 * 침묵전. 표현 수단을 좁혀 모든 발언을 무겁게 만든다.
 *
 * 문구에 번호를 넣지 않는다 — 12명 × 문구 종류만큼 칩이 늘어난다.
 * 대신 지목 수단은 두 가지다: 낮 투표와 맵 위의 위치. ZEP은 캐릭터가
 * 실제로 맵에 서 있으므로, 의심하는 사람 옆으로 걸어가는 것이 발언이 된다.
 * 이쪽이 이 모드의 핵심이고 개발 비용이 0이다.
 *
 * 마피아 밀담과 유령 채널은 제한하지 않는다. 목적은 낮 토론을 좁히는
 * 것이고, 밀담까지 좁히면 마피아가 협의를 못 해 시민 쪽으로 기운다.
 */
export const SILENCE_RULES: RuleSet = {
	id: "silence",
	displayName: "침묵전",
	summary: "정형 문구만. 말이 아니라 자리로 말한다",
	timing: STANDARD_RULES.timing,
	deck: STANDARD_RULES.deck,
	// 8인 이상 전용이라 애초에 첫 밤 무사 조건에 걸리지 않는다.
	// 0으로 명시해 "조건에 안 걸린다"와 "끄기로 했다"를 구분한다
	firstNightPeacefulUpTo: 0,
	minPlayers: 8,
	maxPlayers: 12,
	chatMode: "phrasesOnly",
};

/**
 * 방 번호로 모드를 고른다. createRoom에서 한 번 부르고, 게임 중 바뀌지 않는다.
 *
 * 되돌리기는 이 함수 한 줄이다. 모드 하나가 문제면 그 방을 STANDARD_RULES로
 * 되돌리고 리터럴은 남겨 둔다.
 */
export function rulesForRoom(num: number): RuleSet {
	if (num === 8) return SILENCE_RULES;
	if (num >= 6) return BLITZ_RULES;
	return STANDARD_RULES;
}

// 모드별 집계 제외 플래그(ranked 같은 것)는 넣지 않았다. 시즌 1의 세 모드는
// 전부 집계 대상이고, 계측 자체가 없다. 집계에서 빼야 할 모드(연습·이벤트)가
// 생기는 시점에 그때 필요한 형태로 넣는 편이 낫다.
