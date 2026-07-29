/**
 * 직업 배분. ZEP API에 의존하지 않는 순수 함수라 Node에서 그대로 테스트한다.
 *
 * 기존 createRole은 Array.from 콜백 안에서 i를 0..7과 비교하는 if 7개였다.
 * 배분표를 읽으려면 코드를 실행해봐야 했고, 6번 자리가 시민인 것도
 * "if (i === 7)" 앞에 아무것도 없다는 사실로만 알 수 있었다.
 */
import { Role } from "../types/Game.types.ts";

/**
 * 참가 인원 순서대로 배분되는 직업. 섞기 전 기준표다.
 * 인원이 이 표보다 많으면 나머지는 전부 시민.
 *
 * 4명: 마피아1 vs 시민3
 * 8명: 마피아2 vs 시민6 (스파이는 시민 진영에서 시작)
 */
const ROLE_DECK: readonly Role[] = [
	Role.MAFIA,
	Role.DOCTOR,
	Role.POLICE,
	Role.POLITICIAN,
	Role.SHAMAN,
	Role.SPY,
	Role.CITIZEN,
	Role.MAFIA,
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

/** 인원수에 맞는 직업 목록을 섞어서 돌려준다 */
export function buildRoleDeck(playerCount: number, rng: () => number = Math.random): Role[] {
	const deck: Role[] = [];
	for (let i = 0; i < playerCount; i++) {
		deck.push(i < ROLE_DECK.length ? ROLE_DECK[i] : Role.CITIZEN);
	}
	return shuffle(deck, rng);
}
