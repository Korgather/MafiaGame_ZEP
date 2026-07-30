/**
 * 덱 구성기 테스트.
 *
 * 인원별 구성은 밸런스 그 자체라 값이 바뀌면 곧바로 판이 바뀐다.
 * RoleAssignment는 ZEP API를 참조하지 않으므로 Node에서 그대로 돈다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role, Team } from "../src/types/Game.types.ts";
import { buildRoleDeck, mafiaCount } from "../src/domain/RoleAssignment.ts";
import { isPeacefulNight } from "../src/domain/NightResolution.ts";
import { ROLE_DEFS } from "../src/domain/Roles.ts";
import { STANDARD_RULES } from "../src/domain/RuleSet.ts";
import { MAX_PLAYERS, MIN_PLAYERS } from "../src/constants/GameConfig.ts";

const EVERY_COUNT: number[] = [];
for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) EVERY_COUNT.push(count);

describe("마피아 진영 인원표", () => {
	it("인원표가 정원까지 빠짐없이 채워져 있다", () => {
		// index = 참가 인원이므로 0번 칸이 있어야 12번 칸이 12인을 가리킨다
		assert.equal(STANDARD_RULES.deck.mafiaTeamSize.length, MAX_PLAYERS + 1);
	});

	it("mafiaCount가 표를 그대로 읽는다", () => {
		for (const count of EVERY_COUNT) {
			assert.equal(
				mafiaCount(STANDARD_RULES.deck, count),
				STANDARD_RULES.deck.mafiaTeamSize[count],
				`${count}인`
			);
		}
	});

	it("표 밖의 인원은 마지막 칸으로 잘린다", () => {
		// 테스트가 정원 밖까지 부르는 곳이 있다. 표를 벗어나도 답이 있어야 한다
		assert.equal(
			mafiaCount(STANDARD_RULES.deck, MAX_PLAYERS + 2),
			STANDARD_RULES.deck.mafiaTeamSize[MAX_PLAYERS]
		);
	});

	it("6인 판의 마피아는 한 명이다", () => {
		// 시즌 0의 핵심 수정. 2명이면 6인 판은 첫 투표 전에 이미 기울어 있다
		assert.equal(mafiaCount(STANDARD_RULES.deck, 6), 1);
	});

	it("인원이 늘어도 마피아가 줄지 않는다", () => {
		for (let count = MIN_PLAYERS + 1; count <= MAX_PLAYERS; count++) {
			assert.ok(
				mafiaCount(STANDARD_RULES.deck, count) >= mafiaCount(STANDARD_RULES.deck, count - 1),
				`${count}인`
			);
		}
	});
});

describe("덱 구성", () => {
	it("건달은 어느 인원에서도 나오지 않는다", () => {
		// 시즌 0에서 건달은 시민이 되었고, 마피아 풀에서 빠졌다.
		// 시민 풀에는 아직 없다 — 다시 들어오는 것은 건달 재설계 슬라이스다
		for (const count of EVERY_COUNT) {
			for (let trial = 0; trial < 50; trial++) {
				assert.ok(!buildRoleDeck(STANDARD_RULES.deck, count).includes(Role.THUG), `${count}인`);
			}
		}
	});

	it("마피아 진영 인원이 표와 정확히 같다", () => {
		for (const count of EVERY_COUNT) {
			const deck = buildRoleDeck(STANDARD_RULES.deck, count);
			const mafia = deck.filter(role => ROLE_DEFS[role].team === Team.MAFIA).length;
			assert.equal(mafia, mafiaCount(STANDARD_RULES.deck, count), `${count}인`);
		}
	});
});

describe("건달의 진영", () => {
	it("건달은 시민 팀이다", () => {
		// 건달은 원래 시민 편이다. 마피아 팀으로 들어가 있던 것이 버그였고,
		// 그 탓에 경찰이 잡으면 "마피아입니다"가 나왔다
		assert.equal(ROLE_DEFS[Role.THUG].team, Team.CITIZEN);
	});

	it("건달은 마피아로 위장하지 않는다", () => {
		assert.equal(ROLE_DEFS[Role.THUG].appearsAsMafia, undefined);
	});
});

describe("첫 밤 무사", () => {
	const PEACEFUL_UP_TO = STANDARD_RULES.firstNightPeacefulUpTo;

	it("8인 이하 판의 첫 밤에는 아무도 죽지 않는다", () => {
		for (let count = MIN_PLAYERS; count <= PEACEFUL_UP_TO; count++) {
			assert.equal(isPeacefulNight(1, count, PEACEFUL_UP_TO), true, `${count}인`);
		}
	});

	it("9인부터는 첫 밤에도 사람이 죽는다", () => {
		for (let count = PEACEFUL_UP_TO + 1; count <= MAX_PLAYERS; count++) {
			assert.equal(isPeacefulNight(1, count, PEACEFUL_UP_TO), false, `${count}인`);
		}
	});

	it("둘째 밤부터는 인원과 무관하게 죽는다", () => {
		assert.equal(isPeacefulNight(2, MIN_PLAYERS, PEACEFUL_UP_TO), false);
		assert.equal(isPeacefulNight(3, PEACEFUL_UP_TO, PEACEFUL_UP_TO), false);
	});
});
