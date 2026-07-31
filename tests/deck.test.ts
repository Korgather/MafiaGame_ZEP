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
import { BLITZ_RULES, STANDARD_RULES } from "../src/domain/RuleSet.ts";
import { MAX_PLAYERS, MIN_PLAYERS } from "../src/constants/GameConfig.ts";

const EVERY_COUNT: number[] = [];
for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) EVERY_COUNT.push(count);

const DECK = STANDARD_RULES.deck;

/** 결정적인 rng. 시드를 바꾸면 다른 판이 나온다 */
function rngFrom(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 1103515245 + 12345) % 2147483648;
		return state / 2147483648;
	};
}

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

	it("속도전 덱도 표와 정확히 같고 다섯 직업만 나온다", () => {
		/*
		 * 위 표준전 단언과 같은 그물을 속도전에도 친다.
		 *
		 * 풀 길이가 곧 최대 추첨 수라 여유가 한 칸도 없다(RuleSet.ts의 경고).
		 * 속도전은 mafiaPool이 [MAFIA] 하나, citizenPool이 [SOLDIER] 하나뿐이라
		 * 표를 한 칸만 올려도 draw가 요청보다 적게 돌려주는데, 그러면 덱은
		 * 마피아가 모자란 채로 조용히 나간다. 인원표만 보는 테스트로는 안 잡힌다.
		 */
		const ALLOWED: Role[] = [Role.MAFIA, Role.DOCTOR, Role.POLICE, Role.SOLDIER, Role.CITIZEN];
		for (let count = BLITZ_RULES.minPlayers; count <= BLITZ_RULES.maxPlayers; count++) {
			const deck = buildRoleDeck(BLITZ_RULES.deck, count);
			assert.equal(deck.length, count, `${count}인 덱 길이`);
			const mafia = deck.filter(role => ROLE_DEFS[role].team === Team.MAFIA).length;
			assert.equal(mafia, BLITZ_RULES.deck.mafiaTeamSize[count], `${count}인`);
			for (const role of deck) {
				assert.ok(ALLOWED.indexOf(role) >= 0, `${count}인에 ${role}가 나왔습니다`);
			}
		}
	});
});

describe("마피아 리드 선정", () => {
	it("6인 판은 마피아 리드와 짐승인간 리드가 둘 다 나온다", () => {
		let mafiaLead = 0;
		let beastLead = 0;
		for (let seed = 1; seed <= 200; seed++) {
			const deck = buildRoleDeck(DECK, 6, rngFrom(seed));
			if (deck.includes(Role.BEAST)) beastLead++;
			else mafiaLead++;
		}
		assert.ok(beastLead > 0, "짐승인간 리드가 한 번도 안 나왔다");
		assert.ok(mafiaLead > 0, "마피아 리드가 한 번도 안 나왔다");
	});

	it("7~9인 판에는 짐승인간이 나오지 않는다", () => {
		// 리드가 짐승인간이면 둘째 자리는 예산 때문에 마피아가 되고,
		// 그 마피아는 밀담에 혼자 앉는다. 팀원이 있는데 말을 걸 수 없다
		for (let count = 7; count <= 9; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				assert.ok(
					!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.BEAST),
					`${count}인 seed ${seed}`
				);
			}
		}
	});

	it("4~5인 판에는 짐승인간이 나오지 않는다", () => {
		for (let count = 4; count <= 5; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				assert.ok(!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.BEAST));
			}
		}
	});

	it("10~12인 판의 짐승인간은 최대 한 명이다", () => {
		for (let count = 10; count <= 12; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				const beasts = buildRoleDeck(DECK, count, rngFrom(seed))
					.filter(role => role === Role.BEAST).length;
				assert.ok(beasts <= 1, `${count}인 seed ${seed}: ${beasts}명`);
			}
		}
	});

	it("리드 후보가 전부 걸러져도 마피아가 리드가 된다", () => {
		const emptyLead = { ...DECK, leadPool: [] };
		const deck = buildRoleDeck(emptyLead, 8);
		assert.ok(deck.filter(role => ROLE_DEFS[role].team === Team.MAFIA).length > 0);
	});

	it("리드를 무엇으로 뽑든 마피아 진영 인원이 표와 같다", () => {
		/*
		 * 위 "마피아 진영 인원이 표와 정확히 같다"는 기본 rng로 인원당 한 판만
		 * 돌리므로, 리드가 어느 쪽으로 뽑혔느냐에 따라서만 깨지는 조합을 놓친다.
		 *
		 * 실제로 놓쳤던 것: 리드가 단독 킬러가 되면 남은 자리는 밀담 후보에서만
		 * 오는데, 그 후보가 남은 자리보다 적으면 뽑기가 요청보다 적게 돌려주고
		 * 모자란 자리는 buildRoleDeck 끝의 while이 시민으로 메운다. 덱 길이는
		 * 맞으므로 인원표가 깨진 것을 아무도 모른다. 시드를 여럿 훑어 리드가
		 * 갈리는 인원(6·10인)까지 강제로 밟는다.
		 */
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 200; seed++) {
				const deck = buildRoleDeck(DECK, count, rngFrom(seed));
				const team = deck.filter(role => ROLE_DEFS[role].team === Team.MAFIA).length;
				assert.equal(team, DECK.mafiaTeamSize[count], `${count}인 seed ${seed} [${deck.join(", ")}]`);
			}
		}
	});
});

describe("시민 풀 필터", () => {
	it("영매는 7인 이하 판에 나오지 않는다", () => {
		for (let count = MIN_PLAYERS; count <= 7; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				assert.ok(
					!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.SHAMAN),
					`${count}인 seed ${seed}`
				);
			}
		}
	});

	it("기자는 10인 이하 판에 나오지 않는다", () => {
		for (let count = MIN_PLAYERS; count <= 10; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				assert.ok(
					!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.REPORTER),
					`${count}인 seed ${seed}`
				);
			}
		}
	});

	it("배타 그룹의 두 직업이 한 덱에 함께 나오지 않는다", () => {
		for (const group of DECK.exclusiveGroups) {
			for (const count of EVERY_COUNT) {
				for (let seed = 1; seed <= 50; seed++) {
					const deck = buildRoleDeck(DECK, count, rngFrom(seed));
					const hits = group.filter(role => deck.includes(role)).length;
					assert.ok(hits <= 1, `${group.join("+")} ${count}인 seed ${seed}`);
				}
			}
		}
	});
});

describe("인원별 자리 수", () => {
	// SPECIAL_CITIZEN_RATIO가 정하는 값. 직업을 넣어도 뽑히는 자리가 늘지
	// 않으면 "넣었는데 안 보인다"가 된다
	const EXPECTED: Array<[number, number, number]> = [
		// [인원, 추첨 자리, 평민]
		[6, 2, 1],
		[8, 2, 2],
		[10, 3, 3],
		[12, 4, 3],
	];

	for (const [count, special, plain] of EXPECTED) {
		it(`${count}인 판은 추첨 ${special}자리 · 평민 ${plain}명`, () => {
			const deck = buildRoleDeck(DECK, count);
			const plains = deck.filter(role => role === Role.CITIZEN).length;
			const required = deck.filter(
				role => role === Role.DOCTOR || role === Role.POLICE
			).length;
			const mafia = deck.filter(role => ROLE_DEFS[role].team === Team.MAFIA).length;
			assert.equal(plains, plain);
			assert.equal(required, 2);
			assert.equal(deck.length - plains - required - mafia, special);
		});
	}
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
