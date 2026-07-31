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
	/**
	 * 둘째 자리부터의 후보.
	 *
	 * 여기 적히지 않은 직업은 뽑히지 않는다 — 다만 Role.MAFIA는 예외다. 배타와
	 * 인원 하한이 후보를 걷어내 자리가 남으면 마피아 자리 수를 맞추려고
	 * Role.MAFIA가 들어올 수 있다(leadPool이 비었을 때와 같은 이유다). 마피아를
	 * 아예 배제하고 싶다면 exclusiveGroups로 막아야 하고, 그마저도 최후에는
	 * 자리 수가 이긴다.
	 */
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
	/**
	 * 같은 판에 함께 들어갈 수 없는 묶음.
	 *
	 * 예외가 하나 있다: citizenRequired는 이 규칙을 보지 않는다. "반드시 들어가는
	 * 직업"과 "함께 들어갈 수 없는 묶음"이 부딪히면 한쪽은 거짓말이 되어야 하는데,
	 * 그 자리에서는 citizenRequired가 이긴다 — 그쪽이 없으면 시민에게 정보가 아예
	 * 없어 토론이 성립하지 않기 때문이다. 배타로 갈라야 하는 직업은 required가
	 * 아니라 pool에 둔다.
	 */
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
 * mafiaPool의 세 후보는 전부 마피아 팀이지만 하는 일이 다르다 — 둘째
 * 마피아는 같이 죽일 사람을 고르고, 짐승인간은 혼자 따로 물고, 사기꾼은
 * 아무도 죽이지 않는 대신 경찰 조사를 흐린다. 짐승인간이 leadPool에도
 * 들어가면서 첫 자리부터 갈리게 되었다. 인원 하한(minPlayers)과 밤 사망자
 * 예산 필터, 그리고 배타 그룹을 겹치면 이렇다.
 *   4~5인  : 짐승인간(6)·사기꾼(7)이 하한에 걸려 마피아 한 명으로 고정
 *   6인    : 팀이 하나뿐이라 리드가 마피아나 짐승인간 — 구성이 여기서 갈린다
 *   7~9인  : 예산이 1이라 양쪽 자리 모두에서 짐승인간이 걸러진다. 남는 한
 *            자리는 밀담 후보인 마피아나 사기꾼이 받는다(각 50%)
 *   10인   : 예산이 2로 풀려 리드도 둘째 자리도 갈린다. 다만 균등하지 않다 —
 *            2만 시드를 훑으면 짐승인간 66.7% / 마피아 둘 16.7% / 사기꾼 16.6%로
 *            쏠린다. 리드를 먼저 뽑고 나머지를 나중에 뽑는 순서의 부산물이다
 *            (짐승인간이 리드로 절반, 리드가 마피아일 때 셋 중 하나로 또 한 번).
 *            고르게 펴려면 뽑기 순서를 손대야 해서 모든 인원에 파급된다
 *   11~12인: 리드는 마피아 고정(아래), 남는 두 자리는 위장 하나(짐승인간
 *            또는 사기꾼) + 마피아 하나. 위장 둘은 50 대 50이다
 *
 * 그런데도 Role.MAFIA를 풀에 남겨 둔 이유는 나머지 둘이 언제나 있는 후보가
 * 아니기 때문이다. 짐승인간과 사기꾼은 하한에 걸리고 서로 배타라 매 판 최대
 * 하나만 남는다. 아무 능력 없는 공범만이 하한도 라이벌도 없어서 어떤 인원의
 * 어떤 조합 뒤에도 자리를 받을 수 있다 — 빼면 7~10인 판의 둘째 마피아가
 * 사라진다. 측정하면 7~9인의 「마피아+마피아」가 200시드 중 100판에서 0판으로,
 * 10인은 40판에서 0판으로 떨어진다. 4~6인은 이 문장에 걸리지 않는다 —
 * teamSize가 1이라 drawExclusive에 0이 넘어가고, 그 판의 마피아는 이 풀이
 * 아니라 leadPool에서 온다. 11~12인도 변하지 않는다 — 비는 자리를 메움패가
 * 같은 마피아로 채운다.
 *
 * 걸러지는 기준은 밤 사망자 예산(CITIZENS_PER_NIGHT_KILL)이다. 조건은
 * 인원수가 아니라 시민 자리 수(citizenSlots)이므로 마피아 수와 함께 움직인다 —
 * 정리하면 citizenSlots >= 8일 때만 짐승인간이 둘째 자리 후보로 남는다.
 * 리드 자리는 여기에 조건이 하나 더 붙는다: 단독 킬러가 리드면 남는 자리는
 * 전부 밀담 후보에서 와야 한다. 밀담 후보는 마피아·사기꾼 둘이지만 짐승인간을
 * 리드로 뽑는 순간 배타 때문에 사기꾼이 함께 빠져 다시 하나가 되므로, 남는
 * 자리가 둘인 11~12인에서는 짐승인간이 여전히 리드가 될 수 없다.
 *
 * 주의: 후보가 셋이 되었어도 여유는 한 칸도 늘지 않았다. 짐승인간과 사기꾼이
 * 서로 배타라 하나를 뽑으면 다른 하나가 빠져서, 실효 후보는 매 판 둘이고
 * 최대 추첨 수(11~12인의 teamSize - 1 = 2)와 정확히 같다. mafiaTeamSize를
 * 고쳐서 teamSize >= 3인 인원이 짐승인간이 걸러지는 구간(citizenSlots < 8)과
 * 겹치면 뽑기가 요청보다 적게 돌려준다. 이제 그 자리는 buildRoleDeck의 메움
 * 단계가 마피아로 채우므로 인원표는 그대로 지켜진다 — 대신 증상이 "마피아가
 * 한 명 모자라다"에서 "그 인원의 구성이 마피아 복제로 고정된다"로 바뀐다.
 * 자리 수를 세는 테스트로는 이제 안 잡힌다는 뜻이다. 그 대신 tests/deck.test.ts의
 * "11~12인 마피아 진영은 마피아 둘 + 위장 직업 하나로 고정된다"가 오늘의 구성
 * 자체를 못 박아 두었으므로, 풀이 말라 메움패가 도는 순간 그 테스트가 걸린다.
 * 걸리면 인원표만이 아니라 이 풀에도 후보를 더한다.
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
		leadPool: [Role.MAFIA, Role.BEAST],
		mafiaPool: [Role.MAFIA, Role.BEAST, Role.CON_ARTIST],
		citizenRequired: [Role.DOCTOR, Role.POLICE],
		citizenPool: [
			Role.POLITICIAN, Role.SHAMAN, Role.SPY,
			Role.SOLDIER, Role.REPORTER, Role.VIGILANTE,
		],
		// 둘 다 경찰 조사를 흐린다. 한 판에 겹치면 경찰이 얻는 정보가 사실상 없다
		exclusiveGroups: [[Role.BEAST, Role.CON_ARTIST]],
		// BEAST: 4~5인은 시민이 3~4명뿐이라 은폐자가 도는 시간이 없다
		// CON_ARTIST: 마피아 자리가 하나뿐인 판(4~6인)에 들어오면 아무도 죽이지
		//   않는 마피아 진영이 되어 게임이 끝나지 않는다. 다만 오늘 그 일을 막는
		//   것은 이 하한이 아니라 뽑기 로직이다 — 그 인원은 teamSize가 1이라
		//   drawExclusive에 0이 넘어가고 이 풀에서 아무도 뽑히지 않는다. 그래서
		//   아래쪽으로는 이 값이 놀고 있다 — 지워도 6으로 낮춰도 4~12인을 200시드씩
		//   돌린 1800판이 카드 한 장까지 그대로다. 위쪽은 다르다. 8로 올리면 7인의
		//   「사기꾼+마피아」 100판이 전부 「마피아+마피아」로 바뀌어 그 인원에서
		//   사기꾼이 사라진다 — 이 값은 미래 방어가 아니라 사기꾼이 처음 나오는
		//   인원을 정하는, 오늘 효력이 있는 값이다. 아래쪽이 노는 탓에 표준
		//   규칙만으로는 하한 자체를 겨눌 수 없어서, 그쪽은 tests/deck.test.ts의
		//   「인원 하한이 사기꾼을 막는다」가 낮은 인원의 마피아 자리를 둘로 올린
		//   합성 스펙으로 밟아 둔다
		// SHAMAN: 8인 구성부터 들어간다
		// REPORTER: 조기 특종이 게임을 끝낸다
		minPlayers: { BEAST: 6, CON_ARTIST: 7, SHAMAN: 8, REPORTER: 11 },
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
