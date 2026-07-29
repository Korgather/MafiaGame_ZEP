/**
 * 직업 배분. ZEP API에 의존하지 않는 순수 함수라 Node에서 그대로 테스트한다.
 *
 * 기존 createRole은 Array.from 콜백 안에서 i를 0..7과 비교하는 if 7개였다.
 * 배분표를 읽으려면 코드를 실행해봐야 했고, 6번 자리가 시민인 것도
 * "if (i === 7)" 앞에 아무것도 없다는 사실로만 알 수 있었다.
 */
import { Role } from "../types/Game.types.ts";
import { MAFIA_PAIR_AT, SPECIAL_CITIZEN_RATIO } from "../constants/GameConfig.ts";

/**
 * 마피아 진영의 첫 자리. 마피아 없는 판은 성립하지 않는다.
 */
const MAFIA_LEAD: Role = Role.MAFIA;

/**
 * 두 번째 마피아 진영 자리에 뽑히는 후보.
 *
 * 셋 다 마피아 팀이지만 하는 일이 다르다 — 둘째 마피아는 같이 죽일 사람을
 * 고르고, 건달은 투표를 막고, 짐승인간은 혼자 따로 문다. 판마다 달라져야
 * 시민이 "마피아 팀에 누가 있는지"를 다시 추리한다.
 */
const MAFIA_POOL: readonly Role[] = [Role.MAFIA, Role.THUG, Role.BEAST];

/**
 * 시민이 이길 수단. 이 둘이 빠진 판은 시민에게 정보가 아예 없어서
 * 토론이 근거 없는 지목으로만 흘러간다.
 */
const CITIZEN_REQUIRED: readonly Role[] = [Role.DOCTOR, Role.POLICE];

/** 남는 시민 자리 중 일부에 뽑히는 능력자 */
const CITIZEN_POOL: readonly Role[] = [
	Role.POLITICIAN,
	Role.SHAMAN,
	Role.SPY,
	Role.SOLDIER,
	Role.REPORTER,
	Role.VIGILANTE,
];

/** Fisher-Yates. rng를 주입할 수 있어 테스트에서 결정적으로 돌릴 수 있다 */
export function shuffle<T>(array: T[], rng: () => number = Math.random): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const tmp = array[i];
		array[i] = array[j];
		array[j] = tmp;
	}
	return array;
}

/** 인원수에 따른 마피아 진영 인원 */
export function mafiaCount(playerCount: number): number {
	return playerCount >= MAFIA_PAIR_AT ? 2 : 1;
}

/** 풀에서 중복 없이 n개를 뽑는다 */
function draw(pool: readonly Role[], count: number, rng: () => number): Role[] {
	if (count <= 0) return [];
	return shuffle(pool.slice(), rng).slice(0, count);
}

/**
 * 인원수에 맞는 직업 목록을 섞어서 돌려준다.
 *
 * 기존에는 8칸짜리 고정 배열(ROLE_DECK)의 앞에서부터 잘라 쓰고 넘치면 시민을
 * 채웠다. 직업 수가 자리 수와 같던 동안에는 표 하나로 충분했지만, 직업이
 * 12개가 되면 8칸에 무엇을 남길지 고르는 문제로 바뀐다. 고정 배열은 그 선택을
 * 표현할 수 없어서 새 직업이 영원히 나오지 않거나 매 판 똑같이 나온다.
 *
 * 그래서 "반드시 있어야 하는 직업 + 매 판 뽑는 풀"로 나눴다. 13번째 직업을
 * 추가할 때 이 파일에서 할 일은 풀 배열에 한 줄 넣는 것뿐이다.
 * (인원수별 구성표를 두는 길도 있었지만, 그쪽은 직업 하나를 추가할 때마다
 *  4~8명 다섯 줄을 전부 손봐야 해서 확장성에서 진다)
 */
export function buildRoleDeck(playerCount: number, rng: () => number = Math.random): Role[] {
	const mafia = mafiaCount(playerCount);
	const deck: Role[] = [MAFIA_LEAD];
	for (const role of draw(MAFIA_POOL, mafia - 1, rng)) deck.push(role);

	const citizenSlots = playerCount - mafia;
	const required = CITIZEN_REQUIRED.slice(0, Math.max(citizenSlots, 0));
	for (const role of required) deck.push(role);

	// 남은 시민 자리의 일부만 능력자로 채운다. 전원이 능력자면 "정보 없는 다수"가
	// 사라져 마피아가 섞여들 여지도 함께 사라진다.
	const plainSlots = citizenSlots - required.length;
	const special = Math.min(Math.floor(plainSlots * SPECIAL_CITIZEN_RATIO), CITIZEN_POOL.length);
	for (const role of draw(CITIZEN_POOL, special, rng)) deck.push(role);

	while (deck.length < playerCount) deck.push(Role.CITIZEN);
	return shuffle(deck, rng);
}
