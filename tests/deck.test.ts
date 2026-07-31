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
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { NightActionKind, ROLE_DEFS } from "../src/domain/Roles.ts";
import { BLITZ_RULES, STANDARD_RULES } from "../src/domain/RuleSet.ts";
import {
	CITIZENS_PER_NIGHT_KILL,
	MAX_PLAYERS,
	MIN_PLAYERS,
} from "../src/constants/GameConfig.ts";

const EVERY_COUNT: number[] = [];
for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) EVERY_COUNT.push(count);

const DECK = STANDARD_RULES.deck;

/**
 * 스파이를 뺀 시민 풀. 합성 스펙이 스파이를 마피아 쪽으로 옮겨 쓸 때,
 * 시민 풀에 남아 있으면 시민 자리에서 뽑힌 스파이까지 마피아 자리로 세어
 * 자리 수 단언이 엉뚱하게 터진다.
 */
const NO_SPY = DECK.citizenPool.filter(role => role !== Role.SPY);

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

	it("11~12인 마피아 진영은 마피아 둘 + 위장 직업 하나로 고정된다", () => {
		/*
		 * 오늘의 구성 그 자체다. 리드는 마피아 고정이고(단독 킬러 리드는 남는 두
		 * 자리를 밀담 후보 하나로 못 채운다), 남는 두 자리는 배타 그룹 때문에
		 * 짐승인간·사기꾼 중 하나가 들어오는 순간 다른 하나가 빠져 언제나
		 * 「위장 하나 + 마피아 하나」로 끝난다. 갈리는 것은 둘 중 누구냐뿐이다.
		 *
		 * 자리 수만 세는 테스트로 대신할 수 없다. 후보는 셋이 되었지만 배타가
		 * 매 판 하나를 걷어내 실효 후보는 여전히 둘이고, 남는 자리도 여전히 둘이라
		 * 여유가 한 칸도 없다(RuleSet.ts의 경고). 후보가 하나라도 더 줄면 남는
		 * 자리를 메움패가 채우는데, 메움패는 마피아라 자리 수는 그대로 3으로 맞다.
		 * 「마피아가 정확히 둘」을 못 박아야 풀이 마른 것이 그 자리에서 걸린다.
		 */
		for (let count = 11; count <= 12; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				const deck = buildRoleDeck(DECK, count, rngFrom(seed));
				const where = `${count}인 seed ${seed} [${deck.join(", ")}]`;
				assert.equal(deck.filter(role => role === Role.MAFIA).length, 2, where);
				// 위장 직업은 정확히 하나다. 둘을 따로 세지 않고 합으로 세는 이유는
				// 배타가 깨지면(둘이 함께 나오면) 합이 2가 되어 여기서 걸리기 때문이다
				const disguised = deck.filter(
					role => role === Role.BEAST || role === Role.CON_ARTIST
				).length;
				assert.equal(disguised, 1, where);
			}
		}
	});

	it("11~12인의 위장 직업은 짐승인간과 사기꾼 양쪽에서 나온다", () => {
		// 위 테스트는 "위장이 하나"만 본다. 한쪽이 영영 안 나와도 통과하므로,
		// 구성이 실제로 갈린다는 것은 따로 못 박는다 — 갈리지 않으면 11~12인은
		// 매 판 같은 판이 되고 그것이 이 슬라이스가 푼 문제다
		let beast = 0;
		let conArtist = 0;
		for (let count = 11; count <= 12; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				const deck = buildRoleDeck(DECK, count, rngFrom(seed));
				if (deck.includes(Role.BEAST)) beast++;
				if (deck.includes(Role.CON_ARTIST)) conArtist++;
			}
		}
		assert.ok(beast > 0, "짐승인간이 한 번도 안 나왔다");
		assert.ok(conArtist > 0, "사기꾼이 한 번도 안 나왔다");
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
		 * 오는데, 그 후보가 남은 자리보다 적으면 뽑기가 요청보다 적게 돌려준다.
		 * 그때는 모자란 자리가 함수 끝의 while까지 흘러가 시민이 되었다 — 덱
		 * 길이는 맞으니 인원표가 깨진 것을 아무도 몰랐다. 지금은 자리 수 불변식이
		 * 그 자리를 마피아로 메우므로(RoleAssignment의 mafiaFiller) 이 단언은
		 * 뽑기가 아니라 그 불변식을 지킨다. 시드를 여럿 훑어 리드가 갈리는
		 * 인원(6·10인)까지 강제로 밟는다.
		 */
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 200; seed++) {
				const deck = buildRoleDeck(DECK, count, rngFrom(seed));
				const team = deck.filter(role => ROLE_DEFS[role].team === Team.MAFIA).length;
				assert.equal(team, DECK.mafiaTeamSize[count], `${count}인 seed ${seed} [${deck.join(", ")}]`);
			}
		}
	});

	it("배타 라이벌 때문에 자리를 못 채우는 후보는 리드가 되지 않는다", () => {
		/*
		 * 합성 스펙이지만 표준 규칙과 거의 같은 모양이다 — 짐승인간을 마피아 풀에서
		 * 빼 리드 전용으로 만든 것만 다르다. 그러면 짐승인간이 리드가 아닌 경로로는
		 * 아예 못 들어와서, 덱에 짐승인간이 있다는 것이 곧 "리드가 짐승인간이었다"다.
		 *
		 * 리드가 짐승인간이면 남은 두 자리는 밀담 후보에서만 오는데, 그 후보 중
		 * 사기꾼은 짐승인간과 같은 그룹이라 함께 빠진다. 남는 것은 마피아 하나뿐
		 * 이라 두 자리를 못 채운다 — 그래서 "채울 수 있는가"는 후보마다 다르다.
		 * 밀담 후보를 한 번 세는 것으로는 어느 후보가 몇 명을 데려갈 수 있는지
		 * 구별할 수 없다.
		 *
		 * 자리 수만 세면 이 테스트는 리드 검사를 전혀 지키지 못한다. 검사를 통째로
		 * 지워 짐승인간이 리드가 되어도 모자란 자리를 mafiaFiller가 마피아로 메워
		 * 「짐승인간 + 마피아 + 마피아」로 수가 맞고, 배타 단언도 사기꾼이 아예
		 * 안 들어와서 통과한다. 그래서 짐승인간의 부재를 따로 못 박는다.
		 *
		 * 세는 단위가 진영이 아니라 "마피아 자리에서 온 직업"인 것은 위 테스트와
		 * 같은 이유다 — 시민 자리에서 뽑힌 직업이 숫자에 섞이면 안 된다.
		 */
		const MAFIA_SEATS: Role[] = [Role.MAFIA, Role.BEAST, Role.CON_ARTIST];
		const spec = {
			...DECK,
			mafiaPool: [Role.MAFIA, Role.CON_ARTIST],
			exclusiveGroups: [[Role.BEAST, Role.CON_ARTIST]],
		};
		let beastLead = 0;
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 200; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				const seats = deck.filter(role => MAFIA_SEATS.indexOf(role) >= 0).length;
				assert.equal(
					seats,
					DECK.mafiaTeamSize[count],
					`${count}인 seed ${seed} [${deck.join(", ")}]`
				);
				assert.ok(
					!(deck.includes(Role.BEAST) && deck.includes(Role.CON_ARTIST)),
					`${count}인 seed ${seed}: 배타 그룹이 함께 나왔다`
				);
				// 자리가 셋인 인원에서만 라이벌 하나로는 모자란다. 10인 이하는
				// 남는 자리가 하나뿐이라 마피아 하나로 충분해서 검사가 통과시킨다
				if (count >= 11) {
					assert.ok(
						!deck.includes(Role.BEAST),
						`${count}인 seed ${seed}: 짐승인간이 리드가 되었다 [${deck.join(", ")}]`
					);
				}
				if (count === 10 && deck.includes(Role.BEAST)) beastLead++;
			}
		}
		// 검사가 짐승인간을 통째로 막는 것이 아니라 자리 수를 보고 가린다는 것.
		// 이쪽이 없으면 짐승인간을 leadPool에서 빼 버려도 위 부재 단언이 통과한다
		assert.ok(beastLead > 0, "10인에서 짐승인간이 한 번도 리드가 되지 않았다");
	});
});

describe("사기꾼 배치", () => {
	it("6인 이하에서는 나오지 않는다", () => {
		/*
		 * 관측된 규칙을 그대로 적어 둔다 — 다만 이것을 지키는 장치는 인원
		 * 하한이 아니다. 그 인원은 teamSize가 1이라 drawExclusive에 0이 넘어가고
		 * 마피아 풀에서 아무도 뽑히지 않는다. 하한을 지워도 6이나 8로 바꿔도
		 * 이 단언은 그대로 통과한다.
		 *
		 * 하한 자체를 겨누는 것은 아래 「인원 하한이 사기꾼을 막는다」다.
		 */
		for (let count = 4; count <= 6; count++) {
			for (let seed = 1; seed <= 40; seed++) {
				assert.ok(
					!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.CON_ARTIST),
					`${count}인`
				);
			}
		}
	});

	it("인원 하한이 사기꾼을 막는다 (합성 스펙)", () => {
		/*
		 * 낮은 인원의 마피아 자리를 둘로 올린 스펙. 표준 규칙에서는 뽑기가 아예
		 * 안 돌아 하한이 무엇을 하든 결과가 같으므로, 하한을 겨누려면 뽑기가
		 * 실제로 도는 모양을 만들어야 한다.
		 *
		 * minPlayers는 DECK 것을 그대로 쓴다. 여기에 { CON_ARTIST: 7 }을 다시
		 * 적으면 실제 규칙의 하한을 지우거나 옮겨도 이 테스트가 통과한다 —
		 * 그러면 겨누는 것이 하한이 아니라 이 파일의 리터럴이 된다.
		 */
		const spec = {
			...DECK,
			mafiaTeamSize: [0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2],
			leadPool: [Role.MAFIA],
			mafiaPool: [Role.MAFIA, Role.CON_ARTIST],
			exclusiveGroups: [],
		};
		for (let count = 4; count <= 6; count++) {
			for (let seed = 1; seed <= 200; seed++) {
				assert.ok(
					!buildRoleDeck(spec, count, rngFrom(seed)).includes(Role.CON_ARTIST),
					`${count}인 seed ${seed}`
				);
			}
		}
		// 하한 바로 위에서는 실제로 나온다. 이쪽이 없으면 하한을 정원 밖으로
		// 올리기만 해도 위 단언이 공허하게 통과한다
		let seen = 0;
		for (let seed = 1; seed <= 200; seed++) {
			if (buildRoleDeck(spec, 7, rngFrom(seed)).includes(Role.CON_ARTIST)) seen++;
		}
		assert.ok(seen > 0, "7인에서 사기꾼이 한 번도 안 나왔다");
	});

	it("짐승인간과 함께 나오지 않는다", () => {
		// 둘 다 경찰 조사를 흐리는 직업이다. 한 판에 겹치면 경찰이 얻는
		// 정보가 사실상 없어진다
		for (let count = 7; count <= 12; count++) {
			for (let seed = 1; seed <= 60; seed++) {
				const deck = buildRoleDeck(DECK, count, rngFrom(seed));
				assert.ok(
					!(deck.includes(Role.BEAST) && deck.includes(Role.CON_ARTIST)),
					`${count}인 seed ${seed}`
				);
			}
		}
	});

	it("7인 이상에서는 사기꾼이 나오는 판이 있다", () => {
		// 인원마다 따로 본다. 한 인원만 훑으면 나머지에서 사기꾼이 통째로
		// 사라져도 통과한다 — 실제로 10인은 뽑히는 비율이 다른 인원의 1/3이라
		// 그 인원만 마르는 회귀가 얼마든지 있을 수 있다
		for (let count = 7; count <= 12; count++) {
			let seen = 0;
			for (let seed = 1; seed <= 200; seed++) {
				if (buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.CON_ARTIST)) seen++;
			}
			assert.ok(seen > 0, `${count}인 판에서 사기꾼이 한 번도 안 나왔다`);
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

/*
 * 배타 경로를 합성 스펙으로 직접 밟는다.
 *
 * 사기꾼이 들어오면서 DECK.exclusiveGroups가 [[BEAST, CON_ARTIST]]로 채워졌고,
 * withoutRivals의 금지 경로와 drawExclusive의 중간 제외는 이제 표준 규칙에서도
 * 매 판 돈다. 그 값을 []로 비우면 「11~12인 마피아 진영은…」과 「짐승인간과 함께
 * 나오지 않는다」 둘이 죽는다 — 살아 있는 방어다.
 *
 * 그런데 바로 위 "배타 그룹의 두 직업이 한 덱에 함께 나오지 않는다"는 그중에
 * 없다. 그쪽은 DECK.exclusiveGroups를 훑으므로 배열을 비우면 순회할 그룹이
 * 없어져 공허하게 통과한다 — 자기가 읽는 값이 사라지는 것은 잡을 수 없는 모양이다.
 *
 * 그래서 아래 스펙들이 남는다. 실제 규칙과 무관하게 그룹의 모양을 고정하고,
 * 표준 규칙이 닿지 않는 경로(두 그룹에 걸친 직업, 이미 뽑힌 직업의 취급)까지
 * 함께 밟는다.
 */
describe("배타 그룹 (합성 스펙)", () => {
	it("한 그룹의 두 직업은 함께 나오지 않는다", () => {
		const spec = { ...DECK, exclusiveGroups: [[Role.SPY, Role.SOLDIER]] };
		let spies = 0;
		let soldiers = 0;
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 100; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				if (deck.includes(Role.SPY)) spies++;
				if (deck.includes(Role.SOLDIER)) soldiers++;
				assert.ok(
					!(deck.includes(Role.SPY) && deck.includes(Role.SOLDIER)),
					`${count}인 seed ${seed} [${deck.join(", ")}]`
				);
			}
		}
		// 양쪽 다 실제로 나와야 "함께 나오지 않는다"가 의미를 갖는다.
		// 한쪽이 0이면 금지 경로가 아니라 인원 하한이 통과시킨 것일 수 있다
		assert.ok(spies > 0, "스파이가 한 번도 안 나왔다");
		assert.ok(soldiers > 0, "군인이 한 번도 안 나왔다");
	});

	it("두 그룹에 동시에 든 직업은 양쪽을 모두 막는다", () => {
		const spec = {
			...DECK,
			exclusiveGroups: [
				[Role.SPY, Role.SOLDIER],
				[Role.SPY, Role.POLITICIAN],
			],
		};
		let spies = 0;
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 100; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				if (!deck.includes(Role.SPY)) continue;
				spies++;
				assert.ok(
					!deck.includes(Role.SOLDIER) && !deck.includes(Role.POLITICIAN),
					`${count}인 seed ${seed} [${deck.join(", ")}]`
				);
			}
		}
		assert.ok(spies > 0, "스파이가 한 번도 안 나와 금지 경로를 밟지 못했다");
	});

	it("진영을 가로지르는 그룹도 막는다", () => {
		// withoutRivals의 독 코멘트가 약속하는 방향(마피아 자리를 먼저 확정하고
		// 그 결과를 시민 필터의 입력으로 넘긴다)이 실제로 이어져 있는지 본다
		const spec = { ...DECK, exclusiveGroups: [[Role.BEAST, Role.SOLDIER]] };
		let beasts = 0;
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 100; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				if (!deck.includes(Role.BEAST)) continue;
				beasts++;
				assert.ok(
					!deck.includes(Role.SOLDIER),
					`${count}인 seed ${seed} [${deck.join(", ")}]`
				);
			}
		}
		assert.ok(beasts > 0, "짐승인간이 한 번도 안 나와 금지 경로를 밟지 못했다");
	});

	it("이미 뽑힌 직업은 자기 그룹이 걸려도 풀에서 빠지지 않는다", () => {
		/*
		 * withoutRivals는 그룹이 걸리면 "아직 안 뽑힌 나머지"만 막아야 한다.
		 * 뽑힌 직업까지 막으면 그 직업이 남은 자리 후보에서도 사라진다 — 리드가
		 * 마피아인 판에서 둘째 자리 후보의 마피아가 통째로 빠지는 식이다.
		 *
		 * 위 의사·경찰 케이스로는 이걸 볼 수 없다. 그쪽은 뽑힌 둘이 애초에
		 * 남은 풀에 없어서 과잉 금지가 결과를 바꾸지 못한다. 여기서는 마피아가
		 * 리드로 뽑히고도 둘째 자리 풀에 남아 있어야 인원표가 맞는다.
		 */
		const MAFIA_SEATS: Role[] = [Role.MAFIA, Role.SPY];
		const spec = {
			...DECK,
			leadPool: [Role.MAFIA],
			mafiaPool: [Role.MAFIA, Role.SPY],
			citizenPool: DECK.citizenPool.filter(role => role !== Role.SPY),
			exclusiveGroups: [[Role.MAFIA, Role.SOLDIER]],
		};
		for (let count = 11; count <= 12; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				const seats = deck.filter(role => MAFIA_SEATS.indexOf(role) >= 0).length;
				assert.equal(
					seats,
					DECK.mafiaTeamSize[count],
					`${count}인 seed ${seed} [${deck.join(", ")}]`
				);
				// 마피아는 언제나 뽑히므로 군인은 언제나 막힌다
				assert.ok(!deck.includes(Role.SOLDIER), `${count}인 seed ${seed}`);
			}
		}
	});

	it("그룹 전원이 이미 뽑혔으면 아무도 더 막지 않는다", () => {
		// 의사·경찰은 citizenRequired라 8인 판에 항상 함께 들어간다. withoutRivals가
		// "그룹이 걸렸다"만 보고 남은 전원을 막으면 뽑힌 둘까지 금지 목록에 들어가
		// 시민 추첨이 통째로 줄어든다 — taken에 없는 직업만 막아야 한다
		const spec = { ...DECK, exclusiveGroups: [[Role.DOCTOR, Role.POLICE]] };
		for (let seed = 1; seed <= 100; seed++) {
			const deck = buildRoleDeck(spec, 8, rngFrom(seed));
			assert.equal(deck.length, 8, `seed ${seed}`);
			assert.ok(
				deck.includes(Role.DOCTOR) && deck.includes(Role.POLICE),
				`seed ${seed} [${deck.join(", ")}]`
			);
			const special = deck.filter(role => DECK.citizenPool.indexOf(role) >= 0).length;
			assert.equal(special, 2, `seed ${seed} [${deck.join(", ")}]`);
		}
	});
});

/*
 * 마피아 자리 수는 뽑기 결과와 무관하게 표와 같아야 한다.
 *
 * 리드 선정의 사전 검사는 "남은 풀이 충분히 큰가"를 묻는다. 그런데 drawExclusive는
 * 하나 뽑을 때마다 그 직업의 그룹 동료를 남은 풀에서 뺀다 — 크기는 필요조건일 뿐
 * 충분조건이 아니다. 불변식이 없던 시절에는 모자란 자리가 buildRoleDeck 끝의
 * while까지 흘러가 시민이 되었다. 덱 길이는 맞으니 마피아 진영만 표보다 작아진
 * 채로 조용히 나갔다. 지금은 자리 수 불변식이 그 자리를 마피아로 메운다.
 *
 * 아래 스펙들은 전부 사전 검사를 통과하면서 뽑기가 모자라는 모양이다. 사전 검사를
 * 아무리 정교하게 만들어도 이 모양들을 전부 앞에서 막을 수는 없으므로(검사 뒤에
 * 좁아지는 뽑기가 있는 한), 자리 수는 뽑기가 끝난 뒤에 못 박혀야 한다.
 *
 * 세는 단위가 "진영"이 아니라 "마피아 자리에서 온 직업"인 이유는, 시민 자리에서
 * 뽑힌 직업이 숫자에 섞이면 뽑기가 모자란 것을 못 보기 때문이다. 자리가 모자라
 * 시민으로 메워진 판도 진영으로 세면 티가 안 난다.
 */
describe("마피아 자리 수 불변식 (합성 스펙)", () => {
	const MAFIA_SEATS: Role[] = [Role.MAFIA, Role.BEAST, Role.CON_ARTIST];

	/** 마피아 풀에서 온 직업이 표와 같은 수만큼 있는가를 4~12인 × 시드로 훑는다 */
	function assertSeatCount(spec: typeof DECK, label: string): void {
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 200; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				const seats = deck.filter(role => MAFIA_SEATS.indexOf(role) >= 0).length;
				assert.equal(
					seats,
					DECK.mafiaTeamSize[count],
					`${label} ${count}인 seed ${seed} [${deck.join(", ")}]`
				);
				assert.equal(deck.length, count, `${label} ${count}인 seed ${seed} 덱 길이`);
			}
		}
	}

	it("살아남은 밀담 후보끼리 배타여도 자리가 다 찬다", () => {
		/*
		 * 리드 검사가 통과시키는데 뽑기가 모자라는 첫 번째 모양.
		 *
		 * 짐승인간을 리드로 뽑아도 밀담 후보 둘(마피아·사기꾼)이 그대로 남는다 —
		 * 어느 쪽도 짐승인간과 묶여 있지 않으니 크기 검사는 2 >= 2로 통과한다.
		 * 그런데 그 둘이 서로 배타라, 하나를 뽑는 순간 다른 하나가 빠진다.
		 * 11~12인(자리 셋)에서 마피아 자리가 둘로 끝난다.
		 */
		assertSeatCount(
			{
				...DECK,
				leadPool: [Role.BEAST],
				mafiaPool: [Role.MAFIA, Role.CON_ARTIST],
				exclusiveGroups: [[Role.MAFIA, Role.CON_ARTIST]],
			},
			"밀담 후보끼리 배타"
		);
	});

	it("밀담 리드가 자기 라이벌을 지워도 자리가 다 찬다", () => {
		/*
		 * 두 번째 모양. 리드가 밀담 직업이면 사전 검사를 아예 하지 않는다 —
		 * 밀담 리드가 여는 풀이 가장 넓어서 후보를 걸러 봐야 얻는 것이 없기
		 * 때문이고, 그 판단 자체는 옳다. 다만 "가장 넓다"가 "충분하다"는 아니다.
		 * 마피아를 리드로 뽑는 순간 같은 그룹의 사기꾼이 함께 빠져 풀이
		 * [MAFIA] 하나로 줄고, 11~12인의 남은 두 자리를 하나로만 채운다.
		 */
		assertSeatCount(
			{
				...DECK,
				leadPool: [Role.MAFIA],
				mafiaPool: [Role.MAFIA, Role.CON_ARTIST],
				exclusiveGroups: [[Role.MAFIA, Role.CON_ARTIST]],
			},
			"밀담 리드가 라이벌 제거"
		);
	});

	it("표준 규칙에서도 자리가 다 찬다", () => {
		/*
		 * 여기까지는 전부 합성 스펙이었다. 사기꾼이 들어오면서 표준 규칙 자체가
		 * "짐승인간과 사기꾼이 배타로 묶인 마피아 풀"이 되었으므로, 이제 실제로
		 * 나가는 규칙을 같은 잣대에 건다.
		 *
		 * 표준 규칙은 이 블록이 겨눈 구멍에 닿지 않는다 — 배타가 하나를 걷어내도
		 * 남는 후보 수가 남는 자리 수와 정확히 같기 때문이다(RuleSet.ts의 경고).
		 * 여유가 없다는 뜻이므로, 풀이나 인원표를 한 칸이라도 건드리면 여기가 먼저
		 * 걸린다. 위 합성 스펙들이 그때 무엇이 깨졌는지를 설명해 준다.
		 */
		assertSeatCount(DECK, "표준 규칙");
	});

	it("메운 뒤에도 마피아와 사기꾼이 한 덱에 있지 않다", () => {
		/*
		 * 자리를 메우는 쪽이 규칙을 어기면 고친 것이 아니다. 위 첫 번째 스펙은
		 * 마피아와 사기꾼이 배타이므로, 사기꾼이 뽑힌 판에 마피아를 메움패로
		 * 밀어 넣으면 둘이 한 덱에 함께 있게 된다.
		 *
		 * 이름을 "메움패가 배타를 어기지 않는다"에서 바꿨다. 이 단언이 보는 것은
		 * 덱 전체의 성질이지 메움패가 무엇을 골랐는지가 아니다 — 메움패를
		 * taken[0](여기서는 리드인 짐승인간)으로 바꿔치기해도 마피아가 아예 안
		 * 들어와서 이 단언은 그대로 통과한다. 메움패 자체의 선택은 아래
		 * "메움패 (합성 스펙)" 블록이 겨눈다.
		 */
		const spec = {
			...DECK,
			leadPool: [Role.BEAST],
			mafiaPool: [Role.MAFIA, Role.CON_ARTIST],
			exclusiveGroups: [[Role.MAFIA, Role.CON_ARTIST]],
		};
		let conArtists = 0;
		for (let count = 11; count <= 12; count++) {
			for (let seed = 1; seed <= 200; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				if (deck.includes(Role.CON_ARTIST)) conArtists++;
				assert.ok(
					!(deck.includes(Role.MAFIA) && deck.includes(Role.CON_ARTIST)),
					`${count}인 seed ${seed} [${deck.join(", ")}]`
				);
			}
		}
		// 사기꾼이 한 번도 안 뽑히면 위 단언이 공허하게 통과한다
		assert.ok(conArtists > 0, "사기꾼이 한 번도 안 뽑혀 메움패 경로를 밟지 못했다");
	});
});

describe("메움패 (합성 스펙)", () => {
	/*
	 * 위 블록은 "자리가 다 찼는가"만 본다. 자리를 무엇으로 채웠는지는 보지 않아서,
	 * 메움패의 가지를 통째로 뭉개도 전부 통과한다. 여기서는 세 갈래를 하나씩 겨눈다.
	 *
	 * 각 단언은 돌연변이를 만들어 실제로 터지는지 확인했다:
	 *   - 첫 갈래의 검사를 지우면(무조건 Role.MAFIA) 하한·배타 테스트가 터진다.
	 *   - 첫 갈래 앞에서 taken[0]으로 새어 나가면 "능력 없는 마피아를 먼저 쓴다"와
	 *     "리드가 단독 킬러여도 복제하지 않는다"가 터진다.
	 *   - 둘째 갈래의 !killsIndependently를 버리면 밤 예산 테스트가 터진다.
	 *
	 * 표준 규칙은 이 가지에 닿지 않는다(마피아 풀이 자리보다 넓다). 그래서 전부
	 * 합성 스펙이다 — 닿지 않는 코드라도 규칙이 바뀌면 그날 바로 닿는다.
	 */

	/** 밀담 밖에서 혼자 죽이는 직업인가. RoleAssignment의 killsIndependently와 같은 축 */
	function killsAlone(role: Role): boolean {
		const def = ROLE_DEFS[role];
		return def.nightAction === NightActionKind.ATTACK && def.nightChat !== ChatChannel.MAFIA;
	}

	/**
	 * 마피아 자리가 만드는 밤 사망자 수.
	 *
	 * 밀담은 몇 명이 앉든 상의해서 하나만 치므로 1로 접고, 단독 킬러는 머릿수를
	 * 그대로 더한다. 시민 자리에서 뽑힌 자경단까지 세면 메움패와 무관한 사망자가
	 * 섞이므로, 부르는 쪽이 마피아 자리만 걸러서 넘긴다.
	 */
	function seatDeaths(seats: readonly Role[]): number {
		const talks = seats.some(role => {
			const def = ROLE_DEFS[role];
			return def.nightAction === NightActionKind.ATTACK && def.nightChat === ChatChannel.MAFIA;
		});
		return (talks ? 1 : 0) + seats.filter(killsAlone).length;
	}

	/** nightKillBudget과 같은 식. 시민 자리 수로 계산한다 */
	function budgetFor(count: number, teamSize: number): number {
		return Math.max(1, Math.floor((count - teamSize) / CITIZENS_PER_NIGHT_KILL));
	}

	/** 덱에서 마피아 자리로 간 직업만 고른다 */
	function seatsOf(deck: readonly Role[], seatRoles: readonly Role[]): Role[] {
		return deck.filter(role => seatRoles.indexOf(role) >= 0);
	}

	it("인원 하한이 막은 마피아는 메움패로도 들어오지 않는다", () => {
		/*
		 * 스파이 하나만 든 풀로 세 자리를 채우게 만든다. 뽑기는 하나밖에 못 주므로
		 * 두 자리가 메움으로 넘어가는데, 마피아의 하한을 정원 밖(99인)으로 올려
		 * 두었으니 첫 갈래는 마피아를 쓸 수 없다. 하한을 안 보고 넣으면 여기서
		 * "12인 판에 99인부터 나오는 직업"이 나온다.
		 */
		const spec = {
			...DECK,
			leadPool: [Role.SPY],
			mafiaPool: [Role.SPY],
			citizenPool: NO_SPY,
			minPlayers: { ...DECK.minPlayers, [Role.MAFIA]: 99 },
			exclusiveGroups: [],
		};
		let filled = 0;
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 200; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				const seats = seatsOf(deck, [Role.MAFIA, Role.SPY]);
				assert.equal(seats.length, DECK.mafiaTeamSize[count], `${count}인 seed ${seed}`);
				assert.ok(
					!deck.includes(Role.MAFIA),
					`${count}인 seed ${seed} 하한 위반 [${deck.join(", ")}]`
				);
				// 풀에 스파이 하나뿐이라 자리가 둘 이상이면 나머지는 전부 메움패다
				if (seats.length > 1) filled++;
			}
		}
		assert.ok(filled > 0, "메움 경로를 한 번도 밟지 못했다");
	});

	it("메움패가 배타 그룹을 어기지 않는다", () => {
		/*
		 * 같은 모양인데 이번에는 하한이 아니라 배타가 마피아를 막는다. 스파이가
		 * 자리에 앉아 있는 한 마피아는 첫 갈래를 통과하면 안 된다.
		 */
		const spec = {
			...DECK,
			leadPool: [Role.SPY],
			mafiaPool: [Role.SPY],
			citizenPool: NO_SPY,
			exclusiveGroups: [[Role.MAFIA, Role.SPY]],
		};
		let filled = 0;
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 200; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				const seats = seatsOf(deck, [Role.MAFIA, Role.SPY]);
				assert.equal(seats.length, DECK.mafiaTeamSize[count], `${count}인 seed ${seed}`);
				assert.ok(
					!(deck.includes(Role.MAFIA) && deck.includes(Role.SPY)),
					`${count}인 seed ${seed} 배타 위반 [${deck.join(", ")}]`
				);
				if (seats.length > 1) filled++;
			}
		}
		assert.ok(filled > 0, "메움 경로를 한 번도 밟지 못했다");
	});

	it("막는 것이 없으면 메움패는 능력 없는 마피아다", () => {
		/*
		 * 위 둘에서 하한과 배타만 걷어낸 스펙. 이제 첫 갈래가 열려 있으므로
		 * 마피아가 정확히 한 장 들어와야 한다(리드 + 뽑기가 스파이 둘).
		 *
		 * 이 단언이 "이미 앉은 직업을 아무거나 재사용"과 첫 갈래를 갈라낸다.
		 * 재사용으로 새면 마피아가 0장이 되고 스파이가 셋이 된다.
		 */
		const spec = {
			...DECK,
			leadPool: [Role.SPY],
			mafiaPool: [Role.SPY],
			citizenPool: NO_SPY,
			exclusiveGroups: [],
		};
		for (let count = 11; count <= 12; count++) {
			for (let seed = 1; seed <= 200; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				const mafia = deck.filter(role => role === Role.MAFIA).length;
				const spy = deck.filter(role => role === Role.SPY).length;
				assert.equal(mafia, 1, `${count}인 seed ${seed} [${deck.join(", ")}]`);
				assert.equal(spy, 2, `${count}인 seed ${seed} [${deck.join(", ")}]`);
			}
		}
	});

	it("메움패가 단독 킬러를 복제해 밤 예산을 깨지 않는다", () => {
		/*
		 * 둘째 갈래를 정면으로 겨눈다. 리드 후보를 비워 리드가 Role.MAFIA로
		 * 대체되게 하고, 마피아 풀에는 단독 킬러(짐승인간)만 둔다. 하한으로 첫
		 * 갈래를 막으면 메움 시점의 taken이 [마피아, 짐승인간]이 된다.
		 *
		 * 둘 중 무엇을 다시 쓰느냐가 곧 밤 사망자 수다. 마피아는 밀담에 앉으므로
		 * 몇 장이 되든 사망자가 하나고, 짐승인간을 복제하면 시체가 하나 더 생겨
		 * 11인 판의 예산 2를 3으로 넘긴다.
		 */
		const spec = {
			...DECK,
			leadPool: [],
			mafiaPool: [Role.BEAST],
			citizenPool: NO_SPY,
			minPlayers: { ...DECK.minPlayers, [Role.MAFIA]: 99 },
			exclusiveGroups: [],
		};
		let filled = 0;
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 200; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				const teamSize = DECK.mafiaTeamSize[count];
				const seats = seatsOf(deck, [Role.MAFIA, Role.BEAST]);
				const where = `${count}인 seed ${seed} [${deck.join(", ")}]`;
				assert.equal(seats.length, teamSize, where);
				assert.ok(
					seatDeaths(seats) <= budgetFor(count, teamSize),
					`${where} 사망 ${seatDeaths(seats)} > 예산 ${budgetFor(count, teamSize)}`
				);
				assert.ok(seats.filter(killsAlone).length <= 1, `${where} 단독 킬러 복제`);
				// 자리가 셋인 판에서만 [마피아, 짐승인간] 뒤의 메움에 닿는다
				if (teamSize === 3) filled++;
			}
		}
		assert.ok(filled > 0, "메움 경로를 한 번도 밟지 못했다");
	});

	it("리드가 단독 킬러여도 메움패가 그를 복제하지 않는다", () => {
		/*
		 * 같은 둘째 갈래를 반대쪽에서 본다. 여기서는 taken이 [짐승인간(리드),
		 * 스파이]라 "앞에서부터 아무거나"가 곧 짐승인간 복제가 된다. 예산 산술만으로는
		 * 이 모양을 잡을 수 없어서(밀담 공격자가 없어 사망자가 1 + 1로 끝난다)
		 * "마피아 자리의 단독 킬러는 최대 하나"를 따로 못 박는다 — 스펙의 풀에
		 * 단독 킬러가 하나뿐이므로 둘이 나왔다면 복제한 것이다.
		 */
		const spec = {
			...DECK,
			leadPool: [Role.MAFIA, Role.BEAST],
			mafiaPool: [Role.MAFIA, Role.SPY],
			citizenPool: NO_SPY,
			exclusiveGroups: [[Role.MAFIA, Role.SPY]],
		};
		let beastLead = 0;
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 200; seed++) {
				const deck = buildRoleDeck(spec, count, rngFrom(seed));
				const teamSize = DECK.mafiaTeamSize[count];
				const seats = seatsOf(deck, [Role.MAFIA, Role.BEAST, Role.SPY]);
				const where = `${count}인 seed ${seed} [${deck.join(", ")}]`;
				assert.equal(seats.length, teamSize, where);
				assert.ok(seats.filter(killsAlone).length <= 1, `${where} 단독 킬러 복제`);
				assert.ok(
					seatDeaths(seats) <= budgetFor(count, teamSize),
					`${where} 사망 ${seatDeaths(seats)} > 예산 ${budgetFor(count, teamSize)}`
				);
				assert.ok(
					!(deck.includes(Role.MAFIA) && deck.includes(Role.SPY)),
					`${where} 배타 위반`
				);
				if (deck.includes(Role.BEAST) && deck.includes(Role.SPY)) beastLead++;
			}
		}
		assert.ok(beastLead > 0, "[짐승인간, 스파이] 모양을 한 번도 밟지 못했다");
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
