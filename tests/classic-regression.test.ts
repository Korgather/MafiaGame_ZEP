/**
 * 클래식 모드 회귀 테스트 48종.
 *
 * 번호는 요구 사항의 목록 번호 그대로다. 목록에 없는 것을 여기 더하지 않고,
 * 목록에 있는 것을 여기서 빼지 않는다 — 이 파일의 값어치는 "빠진 번호가
 * 없다"를 눈으로 셀 수 있다는 데 있다. 규칙이 늘면 목록과 이 파일이 같이
 * 늘어야 하고, 규칙이 바뀌면 번호가 붙은 테스트가 먼저 깨져야 한다.
 *
 * 어느 층에서 검증할지는 항목마다 다르다. 순수 도메인으로 답할 수 있는
 * 것은 도메인 함수를 직접 부른다 — 하네스를 통하면 밤 지목 순서·타이머·
 * 위젯 배선이 전부 전제로 끼어들어, 규칙 하나가 틀렸는데 전혀 다른 곳이
 * 깨진다. 반대로 "늦게 도착한 메시지를 버리는가" 같은 항목은 배선 그
 * 자체가 규칙이므로 하네스로만 답할 수 있다.
 *
 * 이미 다른 파일이 덮은 규칙도 번호가 있으면 여기 남긴다. 다만 각도를
 * 달리한다 — deck.test.ts가 표의 정적 값을 보면 여기서는 그 표로 실제
 * 뽑은 덱을 보고, gameflow.test.ts가 최소 인원 판을 보면 여기서는 동수가
 * 나올 수 있는 인원 판을 본다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GamePhase, Judgement, Role, Team } from "../src/types/Game.types.ts";
import type { Room, Seat } from "../src/types/Game.types.ts";
import { MAX_PLAYERS, MIN_PLAYERS, POLITICIAN_VOTE_WEIGHT } from "../src/constants/GameConfig.ts";
import { seededRng } from "../src/domain/Rng.ts";
import { buildRoleDeck } from "../src/domain/RoleAssignment.ts";
import {
	NightActionKind,
	NightStep,
	ROLE_DEFS,
	countsForMafiaWin,
	effectiveDef,
	effectiveRole,
	roleName,
	startsContacted,
} from "../src/domain/Roles.ts";
import {
	CLASSIC_RULES,
	RuleSetId,
	defaultRuleSet,
	ruleSetById,
	resolveRuleSet,
	rulesForRoom,
} from "../src/domain/RuleSet.ts";
import type { RosterEntry } from "../src/domain/RuleSet.ts";
import { STEP_ORDER, putIntent, resolveNightIntents } from "../src/domain/NightPipeline.ts";
import type { NightSettlement } from "../src/domain/NightPipeline.ts";
import {
	NightOutcome,
	hasNightTurn,
	nightActionBlockedReason,
	recordNightIntent,
} from "../src/domain/NightResolution.ts";
import { SKIP_VOTE, VoteOutcome, tallyVotes } from "../src/domain/Vote.ts";
import { countAlive, evaluateWinner } from "../src/domain/WinCondition.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { LOOSE_CONTEXT, accessOf } from "../src/domain/chat/ChatPermission.ts";
import type { ChatContext } from "../src/domain/chat/ChatPermission.ts";
import { resetRoom } from "../src/entities/Room.ts";
import { seat } from "./helpers/seat.ts";
import {
	cardWidget,
	disconnect,
	finishPhase,
	judge,
	mainWidget,
	playerOf,
	reconnect,
	resetWorld,
	room,
	seatOf,
	startGame,
	vote,
} from "./helpers/Harness.ts";
import type { FakePlayer } from "./helpers/Harness.ts";

/* ------------------------------------------------------------------ */
/* 공용 헬퍼                                                            */
/* ------------------------------------------------------------------ */

/** 밤 하나를 돌린다. clicks는 [지목한 사람, 지목당한 사람]의 참가 번호 */
function night(
	seats: Seat[],
	clicks: Array<[number, number]>,
	skipAttacks = false
): NightSettlement {
	const intents: { actor: number; target: number }[] = [];
	for (const click of clicks) putIntent(intents, click[0], click[1]);
	return resolveNightIntents(seats, intents, { skipAttacks });
}

/** 그 좌석이 이 밤에 맞은 결말. 아무 일도 없었으면 null */
function outcomeOf(settlement: NightSettlement, index: number): string | null {
	for (const casualty of settlement.casualties) {
		if (casualty.seat.index === index) return casualty.outcome;
	}
	return null;
}

/** 그 좌석이 아침에 받은 줄들 */
function revealsFor(settlement: NightSettlement, index: number): string[] {
	const lines: string[] = [];
	for (const reveal of settlement.reveals) {
		if (reveal.seat === index) lines.push(reveal.line);
	}
	return lines;
}

interface Composition {
	mafia: number;
	support: number;
	police: number;
	doctor: number;
	special: number;
	citizen: number;
}

/**
 * 뽑힌 덱을 구성표와 같은 칸으로 나눈다.
 *
 * 팀(seat.team)으로 세지 않는 것이 중요하다. 스파이는 마피아 쪽 자리에서
 * 뽑히지만 접선 전까지 team이 CITIZEN이라, 팀으로 세면 보조 직업 한 자리가
 * 통째로 시민 쪽으로 넘어가 구성표와 영영 어긋난다. 자리의 정체는 팀이
 * 아니라 isMafiaSupport가 답한다.
 */
function compositionOf(deck: readonly Role[]): Composition {
	const result: Composition = { mafia: 0, support: 0, police: 0, doctor: 0, special: 0, citizen: 0 };
	for (const role of deck) {
		if (role === Role.MAFIA) result.mafia++;
		else if (ROLE_DEFS[role].isMafiaSupport === true) result.support++;
		else if (role === Role.POLICE) result.police++;
		else if (role === Role.DOCTOR) result.doctor++;
		else if (role === Role.CITIZEN) result.citizen++;
		else result.special++;
	}
	return result;
}

/** 클래식 정원 전 구간을 여러 시드로 돌며 덱을 만든다 */
function eachClassicDeck(visit: (deck: Role[], playerCount: number, seed: number) => void): void {
	for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) {
		for (let seed = 1; seed <= 40; seed++) {
			visit(buildRoleDeck(CLASSIC_RULES.deck, count, seededRng(seed * 7919 + count)), count, seed);
		}
	}
}

/** 그 직업이 덱에 몇 번 들어 있는가 */
function countRole(deck: readonly Role[], role: Role): number {
	let found = 0;
	for (const entry of deck) {
		if (entry === role) found++;
	}
	return found;
}

/**
 * 참가 번호로 좌석을 찾는다.
 *
 * 좌석 배열의 순서를 믿지 않는다 — 자리는 무작위로 배정되고, 번호가 곧
 * 배열 위치라는 보장은 어디에도 없다.
 */
function seatAt(target: Room, index: number): Seat {
	for (const found of target.seats) {
		if (found.index === index) return found;
	}
	throw new Error(`${index}번 좌석이 없습니다.`);
}

/**
 * 그 번호 자리에 앉은 사람.
 *
 * startGame이 돌려주는 배열의 i번째가 i+1번 좌석이라고 믿으면 안 된다.
 * 자리 배정은 무작위라 p1이 4번에 앉는 일이 흔하고, 직업은 좌석 번호
 * 순서로 덮이므로(castRoles) "누가 마피아인가"는 좌석으로만 답할 수 있다.
 * 여기를 헷갈리면 테스트가 엉뚱한 사람에게 투표시키고, 그 표가 조용히
 * 지나가서 검증하려던 규칙과 무관한 이유로 통과하거나 깨진다.
 */
function playerAt(target: Room, index: number): FakePlayer {
	return playerOf(seatAt(target, index));
}

/** 지금 이 사람 화면에 떠 있는 카드의 직업 이름 */
function cardTitle(player: FakePlayer): string {
	const messages = cardWidget(player).messages;
	for (let i = messages.length - 1; i >= 0; i--) {
		const payload = messages[i] as { type?: string; cards?: Array<{ title?: string }> };
		if (payload.type !== "init" || !payload.cards || payload.cards.length !== 1) continue;
		const title = payload.cards[0].title;
		return title === undefined ? "" : title;
	}
	throw new Error(`${player.name}의 카드에 직업이 실린 적이 없습니다.`);
}

/** 게임을 시작해 지목 투표 단계까지 민다. 첫 밤은 아무도 지목하지 않는다 */
function reachVote(playerCount: number, roomNum: number, roles: readonly Role[]) {
	const players = startGame(playerCount, roomNum, roles);
	const target = room(roomNum);
	finishPhase(target); // ROLE_REVEAL → NIGHT
	finishPhase(target); // NIGHT → DAY
	finishPhase(target); // DAY → VOTE
	assert.equal(target.phase, GamePhase.VOTE, "지목 투표에 도착하지 못했습니다");
	return { players, target, at: (index: number) => playerAt(target, index) };
}

/** 마피아 한 명과 시민들. 배선 테스트가 예외 없는 판을 쓰기 위한 덱 */
function plainRoles(playerCount: number): Role[] {
	const roles: Role[] = [Role.MAFIA];
	while (roles.length < playerCount) roles.push(Role.CITIZEN);
	return roles;
}

/** 채팅 판정에 쓸 상황 하나 */
function chatCtx(overrides: Partial<ChatContext>): ChatContext {
	return { ...LOOSE_CONTEXT, ...overrides };
}

/* ------------------------------------------------------------------ */
/* 1~3. 기본 모드                                                       */
/* ------------------------------------------------------------------ */

describe("클래식 회귀 · 기본 모드", () => {
	it("1. 모드를 지정하지 않으면 클래식이 선택된다", () => {
		assert.equal(defaultRuleSet().id, RuleSetId.CLASSIC);
		assert.equal(resolveRuleSet(null).id, RuleSetId.CLASSIC);
		assert.equal(resolveRuleSet(undefined).id, RuleSetId.CLASSIC);
		assert.equal(resolveRuleSet("").id, RuleSetId.CLASSIC);
		// 방을 만드는 경로도 같은 답을 내야 한다. 두 경로가 갈리면 "기본
		// 모드가 무엇인가"의 답이 부르는 쪽에 따라 달라진다
		assert.equal(rulesForRoom(1).id, RuleSetId.CLASSIC);
	});

	it("2. 유효한 모드를 명시하면 그 모드가 유지된다", () => {
		const ids = [RuleSetId.CLASSIC, RuleSetId.STANDARD, RuleSetId.BLITZ, RuleSetId.SILENCE];
		for (const id of ids) {
			assert.equal(resolveRuleSet(id).id, id, `${id}가 기본 모드에 덮였습니다`);
			const found = ruleSetById(id);
			assert.notEqual(found, null);
			assert.equal(found === null ? "" : found.id, id);
		}
	});

	it("3. 잘못된 모드 값이 들어와도 안전하게 처리된다", () => {
		// 대소문자·공백·존재하지 않는 이름 모두 예외 없이 기본 모드로 간다.
		// 던지지 않는 것이 규칙이다 — 방을 만드는 도중에 던지면 그 방은
		// 모드가 없는 채로 남고, 그때부터 모든 규칙 조회가 터진다
		const bad = ["nope", "CLASSIC", " classic ", "0", "null", "표준전"];
		for (const value of bad) {
			assert.equal(ruleSetById(value), null, `${value}가 모드로 인정됐습니다`);
			assert.equal(resolveRuleSet(value).id, RuleSetId.CLASSIC);
		}
	});
});

/* ------------------------------------------------------------------ */
/* 4~9. 직업 배정                                                       */
/* ------------------------------------------------------------------ */

describe("클래식 회귀 · 직업 배정", () => {
	it("4. 4~12인 구성표가 유효하다", () => {
		const roster: readonly RosterEntry[] | null = CLASSIC_RULES.deck.roster;
		assert.notEqual(roster, null, "클래식은 인원별 구성표를 가져야 합니다");
		if (roster === null) return;
		for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) {
			const entry: RosterEntry = roster[count];
			const sum: number =
				entry.mafia +
				entry.support +
				(entry.police ? 1 : 0) +
				(entry.doctor ? 1 : 0) +
				entry.special +
				entry.citizen;
			assert.equal(sum, count, `${count}인 구성표의 자리 합이 ${sum}입니다`);
		}
		// 표만 맞는 것으로는 부족하다. 그 표로 실제 뽑은 덱이 표와 같아야 한다
		eachClassicDeck((deck, count) => {
			const entry = roster[count];
			const made = compositionOf(deck);
			assert.equal(made.mafia, entry.mafia, `${count}인 마피아 자리`);
			assert.equal(made.support, entry.support, `${count}인 보조 자리`);
			assert.equal(made.police, entry.police ? 1 : 0, `${count}인 경찰 자리`);
			assert.equal(made.doctor, entry.doctor ? 1 : 0, `${count}인 의사 자리`);
			assert.equal(made.special, entry.special, `${count}인 특수 자리`);
			assert.equal(made.citizen, entry.citizen, `${count}인 시민 자리`);
		});
	});

	it("5. 연인은 항상 두 명이거나 없다", () => {
		eachClassicDeck((deck, count, seed) => {
			const lovers = countRole(deck, Role.LOVER);
			assert.ok(
				lovers === 0 || lovers === 2,
				`${count}인 시드 ${seed}에서 연인이 ${lovers}명 나왔습니다`
			);
		});
	});

	it("6. 필수 직업과 팀 비율이 구성표와 일치한다", () => {
		const spec = CLASSIC_RULES.deck;
		eachClassicDeck((deck, count, seed) => {
			assert.equal(countRole(deck, Role.POLICE), 1, `${count}인 시드 ${seed}: 경찰이 정확히 하나`);
			assert.equal(countRole(deck, Role.DOCTOR), 1, `${count}인 시드 ${seed}: 의사가 정확히 하나`);
			const made = compositionOf(deck);
			assert.equal(
				made.mafia + made.support,
				spec.mafiaTeamSize[count],
				`${count}인 시드 ${seed}: 마피아 팀 자리 수`
			);
			assert.equal(deck.length, count, `${count}인 시드 ${seed}: 덱 크기`);
		});
	});

	it("7. 추리덱·카드스킬·듀얼스킬·장착특성이 적용되지 않는다", () => {
		// 클래식에 없어야 하는 직업. 있으면 능력의 출처가 직업 하나라는
		// 전제가 깨진 것이다
		const excluded = [Role.CON_ARTIST, Role.VIGILANTE, Role.SEER];
		eachClassicDeck((deck, count, seed) => {
			for (const role of excluded) {
				assert.equal(
					countRole(deck, role),
					0,
					`${count}인 시드 ${seed}에 ${roleName(role)}가 들어왔습니다`
				);
			}
		});
		// 능력의 출처는 직업 하나뿐이다. 갓 앉은 좌석의 실효 직업은 언제나
		// 자기 직업이고, 쓴 횟수는 0이며, 빌린 능력은 없다
		for (const role of CLASSIC_RULES.deck.citizenPool) {
			const fresh = seat(1, role);
			assert.equal(effectiveRole(fresh), role);
			assert.equal(fresh.borrowedRole, null);
			assert.equal(fresh.usesSpent, 0);
		}
	});

	it("8. 고정 시드에서 같은 배정이 재현된다", () => {
		for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) {
			const first = buildRoleDeck(CLASSIC_RULES.deck, count, seededRng(20260801));
			const second = buildRoleDeck(CLASSIC_RULES.deck, count, seededRng(20260801));
			assert.deepEqual(first, second, `${count}인 판이 같은 시드에서 다르게 나왔습니다`);
		}
		// 시드가 다르면 판도 달라야 한다. 전 인원이 같게 나오면 시드가
		// 실제로는 쓰이지 않고 있다는 뜻이다
		let differed = false;
		for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) {
			const a = buildRoleDeck(CLASSIC_RULES.deck, count, seededRng(20260801));
			const b = buildRoleDeck(CLASSIC_RULES.deck, count, seededRng(19990102));
			if (JSON.stringify(a) !== JSON.stringify(b)) differed = true;
		}
		assert.ok(differed, "어떤 인원에서도 시드가 판을 바꾸지 못했습니다");
	});

	it("9. 반복 생성해도 허용된 조합만 나온다", () => {
		const spec = CLASSIC_RULES.deck;
		const pool: Role[] = [Role.MAFIA, Role.POLICE, Role.DOCTOR, Role.CITIZEN];
		for (const role of spec.mafiaPool) pool.push(role);
		for (const role of spec.citizenPool) pool.push(role);
		// 마피아·시민·연인만 같은 판에 여럿 앉을 수 있다
		const repeatable: Role[] = [Role.MAFIA, Role.CITIZEN, Role.LOVER];
		eachClassicDeck((deck, count, seed) => {
			const where = `${count}인 시드 ${seed}`;
			for (const role of deck) {
				assert.ok(pool.indexOf(role) >= 0, `${where}: ${roleName(role)}는 클래식 풀 밖입니다`);
				if (repeatable.indexOf(role) < 0) {
					assert.equal(countRole(deck, role), 1, `${where}: ${roleName(role)}가 둘 이상입니다`);
				}
				const floor = spec.minPlayers[role];
				if (floor !== undefined) {
					assert.ok(count >= floor, `${where}: ${roleName(role)}는 ${floor}인부터입니다`);
				}
			}
			for (const group of spec.exclusiveGroups) {
				let present = 0;
				for (const role of group) {
					if (countRole(deck, role) > 0) present++;
				}
				assert.ok(present <= 1, `${where}: 배타 그룹에서 둘이 함께 나왔습니다`);
			}
		});
	});
});

/* ------------------------------------------------------------------ */
/* 10~24. 직업 능력                                                     */
/* ------------------------------------------------------------------ */

/**
 * 직업마다 능력이 처리되는 단계.
 *
 * Record<Role, NightStep>이라 직업이 하나 늘면 이 표를 채우기 전까지
 * 컴파일이 되지 않는다. 새 직업의 능력이 아무 단계에나 얹히는 것을
 * 막는 장치가 이 타입 하나다.
 */
const EXPECTED_STEP: Record<Role, NightStep> = {
	MAFIA: NightStep.ATTACK,
	DOCTOR: NightStep.PROTECT,
	POLICE: NightStep.INSPECT,
	POLITICIAN: NightStep.AFTER,
	SHAMAN: NightStep.INSPECT,
	SPY: NightStep.INSPECT,
	VIGILANTE: NightStep.ATTACK,
	SOLDIER: NightStep.AFTER,
	THUG: NightStep.AFTER,
	REPORTER: NightStep.AFTER,
	BEAST: NightStep.CONTACT,
	CON_ARTIST: NightStep.AFTER,
	SEER: NightStep.INSPECT,
	MADAM: NightStep.BLOCK,
	THIEF: NightStep.AFTER,
	LOVER: NightStep.CHAIN,
	DETECTIVE: NightStep.AFTER,
	GRAVEDIGGER: NightStep.REVIVE,
	TERRORIST: NightStep.CHAIN,
	PRIEST: NightStep.REVIVE,
	CITIZEN: NightStep.AFTER,
};

describe("클래식 회귀 · 직업 능력", () => {
	it("10. 모든 직업의 능력이 올바른 단계에서 처리된다", () => {
		for (const key of Object.keys(EXPECTED_STEP)) {
			const role = key as Role;
			const step = ROLE_DEFS[role].nightStep;
			assert.equal(step, EXPECTED_STEP[role], `${roleName(role)}의 단계`);
			assert.ok(STEP_ORDER.indexOf(step) >= 0, `${roleName(role)}의 단계가 순서표에 없습니다`);
		}
		// 순서표 자체가 뒤집히면 위 표가 맞아도 판정이 뒤바뀐다.
		// 차단이 맨 앞이고 조사가 사망 뒤라는 것이 이 게임의 밤 규칙이다
		assert.ok(STEP_ORDER.indexOf(NightStep.BLOCK) < STEP_ORDER.indexOf(NightStep.PROTECT));
		assert.ok(STEP_ORDER.indexOf(NightStep.PROTECT) < STEP_ORDER.indexOf(NightStep.ATTACK));
		assert.ok(STEP_ORDER.indexOf(NightStep.ATTACK) < STEP_ORDER.indexOf(NightStep.CONTACT));
		assert.ok(STEP_ORDER.indexOf(NightStep.CONTACT) < STEP_ORDER.indexOf(NightStep.DEATH));
		assert.ok(STEP_ORDER.indexOf(NightStep.DEATH) < STEP_ORDER.indexOf(NightStep.CHAIN));
		assert.ok(STEP_ORDER.indexOf(NightStep.CHAIN) < STEP_ORDER.indexOf(NightStep.REVIVE));
		assert.ok(STEP_ORDER.indexOf(NightStep.REVIVE) < STEP_ORDER.indexOf(NightStep.INSPECT));
		assert.ok(STEP_ORDER.indexOf(NightStep.INSPECT) < STEP_ORDER.indexOf(NightStep.AFTER));
	});

	it("11. 마피아와 의사가 같은 대상을 고르면 생존한다", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.DOCTOR), seat(3, Role.CITIZEN)];
		const settled = night(seats, [
			[1, 3],
			[2, 3],
		]);
		assert.equal(outcomeOf(settled, 3), NightOutcome.SAVED);
		assert.equal(settled.casualties.length, 1);
	});

	it("12. 경찰 조사는 마피아 여부만 알려준다", () => {
		const hit = [seat(1, Role.POLICE), seat(2, Role.MAFIA)];
		assert.deepEqual(revealsFor(night(hit, [[1, 2]]), 1), ["🔍 2번 참가자는 마피아입니다!"]);

		const miss = [seat(1, Role.POLICE), seat(2, Role.POLITICIAN)];
		const lines = revealsFor(night(miss, [[1, 2]]), 1);
		assert.deepEqual(lines, ["🔍 2번 참가자는 마피아가 아닙니다."]);
		// 직업 이름이 새면 경찰 하나가 판을 읽어 버린다
		assert.equal(lines[0].indexOf(roleName(Role.POLITICIAN)), -1);

		// 자기 자신은 고를 수 없다. 고를 수 있으면 첫 밤에 아무 위험 없이
		// 한 번의 조사를 버리고 살 수 있어 경찰의 선택이 사라진다
		const self = seat(1, Role.POLICE);
		assert.equal(recordNightIntent(self, self), null);
	});

	it("13. 보조 직업은 접선 조건을 만족해야 마피아 팀으로 계산된다", () => {
		// 스파이는 시민으로 시작한다. 접선하지 못한 채 끝나면 시민 쪽 무게다
		assert.equal(startsContacted(Role.SPY), false);
		assert.equal(startsContacted(Role.BEAST), false);

		const spies = [seat(1, Role.SPY), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		assert.equal(countsForMafiaWin(spies[0]), false);
		const found = night(spies, [[1, 2]]);
		assert.equal(spies[0].team, Team.MAFIA);
		assert.equal(spies[0].contacted, true);
		assert.ok(found.defected.indexOf(1) >= 0);
		assert.equal(countsForMafiaWin(spies[0]), true);

		// 시민을 짚으면 아무것도 바뀌지 않는다
		const missed = [seat(1, Role.SPY), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		const nothing = night(missed, [[1, 3]]);
		assert.equal(missed[0].team, Team.CITIZEN);
		assert.equal(missed[0].contacted, false);
		assert.deepEqual(nothing.defected, []);
		assert.equal(countsForMafiaWin(missed[0]), false);

		// 짐승인간은 처음부터 마피아 팀이지만 접선 전에는 승리 인원이 아니다
		const beasts = [seat(1, Role.BEAST), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		assert.equal(beasts[0].team, Team.MAFIA);
		assert.equal(countsForMafiaWin(beasts[0]), false);
		const stalked = night(beasts, [
			[2, 3],
			[1, 3],
		]);
		assert.equal(beasts[0].contacted, true);
		assert.ok(stalked.defected.indexOf(1) >= 0);
		assert.equal(countsForMafiaWin(beasts[0]), true);
	});

	it("14. 방탄은 한 번만 적용된다", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.SOLDIER)];
		assert.equal(seats[1].armored, true);

		const first = night(seats, [[1, 2]]);
		assert.equal(outcomeOf(first, 2), NightOutcome.SHIELDED);
		assert.equal(seats[1].armored, false);

		// 다음 밤. 지난 밤의 공격 기록은 정산이 끝나면 지워진다
		seats[1].attackedBy = [];
		const second = night(seats, [[1, 2]]);
		assert.equal(outcomeOf(second, 2), NightOutcome.KILLED);
	});

	it("15. 정치인은 두 표를 행사하고 처형되지 않는다", () => {
		assert.equal(ROLE_DEFS[Role.POLITICIAN].voteWeight, POLITICIAN_VOTE_WEIGHT);
		assert.equal(ROLE_DEFS[Role.POLITICIAN].immuneToVote, true);

		const seats = [seat(1, Role.POLITICIAN, { voteCount: 3 }), seat(2, Role.CITIZEN, { voteCount: 1 })];
		const result = tallyVotes(seats);
		assert.equal(result.outcome, VoteOutcome.IMMUNE);
		assert.equal(result.target === null ? 0 : result.target.index, 1);

		// 실제 판에서도 표가 둘로 들어간다. 정치인은 2번 자리다(castRoles)
		resetWorld();
		const reached = reachVote(5, 1, [
			Role.MAFIA,
			Role.POLITICIAN,
			Role.CITIZEN,
			Role.CITIZEN,
			Role.CITIZEN,
		]);
		vote(reached.at(2), 3);
		assert.equal(seatAt(reached.target, 3).voteCount, POLITICIAN_VOTE_WEIGHT);
	});

	it("16. 연인 희생은 중복 사망 없이 한 번만 기록된다", () => {
		const seats = [
			seat(1, Role.MAFIA),
			seat(2, Role.LOVER, { loverIndex: 3 }),
			seat(3, Role.LOVER, { loverIndex: 2 }),
		];
		const settled = night(seats, [[1, 2]]);
		// 공격받은 것은 2번이고 죽는 것은 3번이다
		assert.equal(outcomeOf(settled, 2), NightOutcome.SPARED);
		assert.equal(outcomeOf(settled, 3), NightOutcome.SACRIFICED);
		// 좌석마다 결말은 하나뿐이다. 연쇄가 자기 자신을 되짚으면 여기서 터진다 —
		// 대신 죽은 3번을 보고 2번에게 HEARTBREAK가 붙으면 희생이 없던 일이 된다
		assert.equal(settled.casualties.length, 2);
	});

	it("17. 협박당한 대상은 지목 투표를 할 수 없다", () => {
		resetWorld();
		const reached = reachVote(5, 1, plainRoles(5));
		seatAt(reached.target, 2).intimidated = true;
		vote(reached.at(2), 3);
		assert.equal(seatAt(reached.target, 2).votedFor, 0, "협박당한 사람의 표가 들어갔습니다");
		assert.equal(seatAt(reached.target, 3).voteCount, 0);
		// 협박당하지 않은 사람은 그대로 던진다
		vote(reached.at(4), 3);
		assert.equal(seatAt(reached.target, 3).voteCount, 1);
	});

	it("18. 기자의 특종은 한 번뿐이다", () => {
		assert.equal(ROLE_DEFS[Role.REPORTER].maxUses, 1);
		const fresh = seat(1, Role.REPORTER);
		assert.equal(hasNightTurn(fresh, 1), true);

		const seats = [seat(1, Role.REPORTER), seat(2, Role.CITIZEN)];
		night(seats, [[1, 2]]);
		assert.equal(seats[0].usesSpent, 1);
		assert.equal(seats[1].scooped, true);

		seats[0].usedSkill = false;
		assert.equal(hasNightTurn(seats[0], 2), false);
		const reason = nightActionBlockedReason(seats[0], 2);
		assert.notEqual(reason, null);
		assert.ok((reason === null ? "" : reason).indexOf("횟수") >= 0);
	});

	it("19. 영매는 사망자 채팅을 보고 성불시킨다", () => {
		assert.equal(LOOSE_CONTEXT.ghostChat, false);
		// 영매의 창은 밤에만 열린다. 낮에도 열어두면 어젯밤 유령들의 대화를
		// 대낮에 그대로 읽어 판을 혼자 다 안다
		const seance = chatCtx({
			seated: true,
			started: true,
			phase: GamePhase.NIGHT,
			ghostChat: true,
		});
		assert.equal(accessOf(seance, ChatChannel.GHOST).read, true);

		const seats = [seat(1, Role.SHAMAN), seat(2, Role.DETECTIVE, { alive: false })];
		const settled = night(seats, [[1, 2]]);
		assert.equal(seats[1].exorcised, true);
		assert.deepEqual(revealsFor(settled, 1), [
			`🔮 2번 참가자의 직업은 ${roleName(Role.DETECTIVE)}이었습니다.`,
		]);
	});

	it("20. 도굴꾼은 처음 나온 시민 편 사망자의 직업을 얻는다", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.GRAVEDIGGER), seat(3, Role.POLICE)];
		const settled = night(seats, [[1, 3]]);
		assert.equal(outcomeOf(settled, 3), NightOutcome.KILLED);
		assert.equal(seats[1].role, Role.POLICE, "도굴꾼이 직업을 잇지 못했습니다");
		assert.equal(seats[1].usesSpent, 1);
		assert.equal(revealsFor(settled, 2).length, 1);

		// 판에 한 번뿐이다. 다음 밤에 또 파도 직업이 바뀌지 않는다
		const before = seats[1].role;
		seats[2].attackedBy = [];
		const seats2 = [seats[0], seats[1], seat(4, Role.DOCTOR)];
		night(seats2, [[1, 4]]);
		assert.equal(seats[1].role, before);
	});

	it("21. 도둑은 훔친 능력을 다음 밤에 쓴다", () => {
		const seats = [seat(1, Role.THIEF), seat(2, Role.POLICE), seat(3, Role.MAFIA)];
		night(seats, [[1, 2]]);
		assert.equal(seats[0].borrowedRole, Role.POLICE);
		assert.equal(effectiveRole(seats[0]), Role.POLICE);
		assert.equal(effectiveDef(seats[0]).nightAction, NightActionKind.INSPECT_TEAM);

		const second = night(seats, [[1, 3]]);
		assert.deepEqual(revealsFor(second, 1), ["🔍 3번 참가자는 마피아입니다!"]);
		// 빌린 능력은 그 한 밤에만 붙어 있다
		assert.equal(seats[0].borrowedRole, null);
	});

	it("22. 테러리스트 연쇄 뒤에 승리 조건을 다시 판정한다", () => {
		const seats = [
			seat(1, Role.MAFIA),
			seat(2, Role.TERRORIST, { markIndex: 1 }),
			seat(3, Role.CITIZEN),
			seat(4, Role.CITIZEN),
		];
		const settled = night(seats, [[1, 2]]);
		assert.equal(outcomeOf(settled, 2), NightOutcome.KILLED);
		assert.equal(outcomeOf(settled, 1), NightOutcome.BOMBED);

		// 폭탄 전까지만 반영하면 판은 아직 안 끝난 것으로 보인다
		seats[1].alive = false;
		assert.equal(evaluateWinner(seats), null);
		// 연쇄까지 반영해야 시민 승리가 보인다. 판정을 사망 처리보다
		// 앞에 두면 이 판은 한 밤을 더 돈다
		seats[0].alive = false;
		assert.equal(evaluateWinner(seats), Team.CITIZEN);
	});

	it("23. 성직자의 부활은 한 번뿐이다", () => {
		assert.equal(ROLE_DEFS[Role.PRIEST].maxUses, 1);
		const seats = [seat(1, Role.PRIEST), seat(2, Role.CITIZEN, { alive: false })];
		const settled = night(seats, [[1, 2]]);
		assert.equal(outcomeOf(settled, 2), NightOutcome.REVIVED);
		assert.equal(seats[0].usesSpent, 1);

		seats[0].usedSkill = false;
		assert.equal(hasNightTurn(seats[0], 2, 1), false);
	});

	it("24. 마담의 유혹은 능력과 채팅을 함께 막는다", () => {
		const seats = [seat(1, Role.MADAM), seat(2, Role.POLICE), seat(3, Role.MAFIA)];
		const settled = night(seats, [
			[1, 2],
			[2, 3],
		]);
		assert.equal(seats[1].blocked, true);
		assert.equal(seats[1].seduced, true);
		// 조사 결과가 나가지 않아야 한다. 나가면 막은 것이 아니다
		const lines = revealsFor(settled, 2);
		for (const line of lines) {
			assert.equal(line.indexOf("🔍"), -1, `막힌 경찰이 조사 결과를 받았습니다: ${line}`);
		}
		// 자기 자신은 유혹할 수 없다
		const madam = seat(1, Role.MADAM);
		assert.equal(recordNightIntent(madam, madam), null);

		const ctx = chatCtx({ seated: true, started: true, phase: GamePhase.DAY, seduced: true });
		assert.equal(accessOf(ctx, ChatChannel.ROOM).write, false);
	});
});

/* ------------------------------------------------------------------ */
/* 25~30. 투표와 재판                                                   */
/* ------------------------------------------------------------------ */

describe("클래식 회귀 · 투표와 재판", () => {
	it("25. 자기 자신에게 투표할 수 있다", () => {
		resetWorld();
		const reached = reachVote(5, 1, plainRoles(5));
		vote(reached.at(1), 1);
		assert.equal(seatAt(reached.target, 1).votedFor, 1);
		assert.equal(seatAt(reached.target, 1).voteCount, 1);

		// 집계도 자기 표를 그대로 센다
		const seats = [seat(1, Role.CITIZEN, { voteCount: 1, votedFor: 1 }), seat(2, Role.CITIZEN)];
		const result = tallyVotes(seats);
		assert.equal(result.outcome, VoteOutcome.EXECUTE);
		assert.equal(result.target === null ? 0 : result.target.index, 1);
	});

	it("26. 동률이나 무효표는 처형 없이 넘어간다", () => {
		const tie = [
			seat(1, Role.CITIZEN, { voteCount: 1 }),
			seat(2, Role.CITIZEN, { voteCount: 1 }),
			seat(3, Role.CITIZEN),
		];
		const tied = tallyVotes(tie);
		assert.equal(tied.outcome, VoteOutcome.TIE);
		assert.equal(tied.target, null);

		const silent = [seat(1, Role.CITIZEN), seat(2, Role.CITIZEN)];
		const none = tallyVotes(silent);
		assert.equal(none.outcome, VoteOutcome.NO_VOTES);
		assert.equal(none.target, null);

		const skipped = [
			seat(1, Role.CITIZEN, { voteCount: 1 }),
			seat(2, Role.CITIZEN, { votedFor: SKIP_VOTE }),
			seat(3, Role.CITIZEN, { votedFor: SKIP_VOTE }),
		];
		const skip = tallyVotes(skipped);
		assert.equal(skip.outcome, VoteOutcome.SKIPPED);
		assert.equal(skip.target, null);
	});

	it("27. 투표 현황은 득표를 실시간으로 드러내지 않는다", () => {
		resetWorld();
		const reached = reachVote(6, 1, plainRoles(6));
		vote(reached.at(2), 1);
		vote(reached.at(3), 1);

		// 이 프로젝트는 원작보다 좁게 간다 — 마지막 5초가 아니라 개표
		// 전까지 내내 득표를 감춘다. 화면에 나가는 것은 "몇 명이 냈는가"뿐이다
		let progressSeen = 0;
		for (const player of reached.players) {
			for (const message of mainWidget(player).messages) {
				const payload = message as Record<string, unknown>;
				if (payload.type !== "progress") continue;
				progressSeen++;
				const keys = Object.keys(payload).sort();
				assert.deepEqual(keys, ["alive", "type", "voted"], "투표 현황에 득표가 실렸습니다");
			}
		}
		assert.ok(progressSeen > 0, "투표 현황이 한 번도 나가지 않았습니다");
	});

	it("28. 개표 전에는 투표 대상 정보가 노출되지 않는다", () => {
		resetWorld();
		const reached = reachVote(6, 1, plainRoles(6));
		vote(reached.at(2), 1);
		vote(reached.at(3), 1);
		vote(reached.at(5), 4);

		// 투표 도중에 화면을 새로 여는 사람(재접속·관전 입장)만 판을 다
		// 보게 되는 경로가 있었다. 좌석 목록에 득표가 실려 나갔기 때문이다
		const watcher = reached.at(6);
		disconnect(watcher);
		reconnect(watcher);
		for (const message of mainWidget(watcher).messages) {
			const payload = message as Record<string, unknown>;
			const seats = payload.seats;
			if (!Array.isArray(seats)) continue;
			for (const view of seats) {
				const entry = view as Record<string, unknown>;
				assert.equal(entry.votes, undefined, "재접속한 사람에게 득표가 실려 나갔습니다");
			}
		}
		// 개표에 들어가면 그때 비로소 숫자가 나간다
		finishPhase(reached.target);
		assert.equal(reached.target.phase, GamePhase.VOTE_RESULT);
		let tallySeen = false;
		for (const message of mainWidget(reached.players[0]).messages) {
			const payload = message as Record<string, unknown>;
			if (payload.type !== "result") continue;
			const seats = payload.seats;
			if (!Array.isArray(seats)) continue;
			for (const view of seats) {
				if ((view as Record<string, unknown>).votes !== undefined) tallySeen = true;
			}
		}
		assert.ok(tallySeen, "개표 화면에 득표가 나가지 않았습니다");
	});

	it("29. 최후의 반론에는 대상만 발언할 수 있다", () => {
		const base = { seated: true, started: true, phase: GamePhase.DEFENSE };
		assert.equal(accessOf(chatCtx({ ...base, nominee: true }), ChatChannel.ROOM).write, true);
		const others = accessOf(chatCtx({ ...base, nominee: false }), ChatChannel.ROOM);
		assert.equal(others.write, false);
		assert.equal(others.read, true, "듣지도 못하면 반론이 무의미해집니다");
		assert.notEqual(others.note, "", "막힌 이유가 화면에 나가야 합니다");
	});

	it("30. 찬성과 반대가 같으면 처형된다", () => {
		// 클래식은 동수를 처형 쪽으로 보낸다. 동수가 나오려면 판정자가
		// 짝수여야 하므로 8인 판에서 단상에 오른 한 명을 뺀 일곱 중
		// 여섯이 누르는 상황을 만든다
		// 단상에 2번을 올리고, 남은 일곱 중 여섯만 누른다. 8번은 기권이다
		const agree = [1, 3, 4];
		const oppose = [5, 6, 7];
		function runTie(roomNum: number, tie: string): Room {
			resetWorld();
			const reached = reachVote(8, roomNum, plainRoles(8));
			assert.equal(reached.target.ruleSet.judgementTie, tie);
			vote(reached.at(3), 2);
			vote(reached.at(4), 2);
			vote(reached.at(5), 2);

			finishPhase(reached.target); // VOTE → VOTE_RESULT
			assert.equal(reached.target.nominee, 2, "2번이 단상에 오르지 않았습니다");
			finishPhase(reached.target); // → DEFENSE
			finishPhase(reached.target); // → JUDGEMENT
			assert.equal(reached.target.phase, GamePhase.JUDGEMENT);

			for (const index of agree) judge(reached.at(index), Judgement.AGREE);
			for (const index of oppose) judge(reached.at(index), Judgement.OPPOSE);
			finishPhase(reached.target);
			return reached.target;
		}

		const classic = runTie(1, "execute");
		assert.equal(seatAt(classic, 2).alive, false, "동수인데 살아남았습니다");

		// 같은 상황이 표준전에서는 무산된다. 동수 규칙이 모드의 값이라는 증거다
		const standard = runTie(5, "spare");
		assert.equal(seatAt(standard, 2).alive, true, "표준전에서 동수가 처형됐습니다");
	});
});

/* ------------------------------------------------------------------ */
/* 31~34. 채팅 공개 범위                                                */
/* ------------------------------------------------------------------ */

describe("클래식 회귀 · 채팅 공개 범위", () => {
	it("31. 사망자 채팅은 생존자에게 보이지 않는다", () => {
		const alive = chatCtx({ seated: true, started: true, alive: true, ghostChat: false });
		assert.equal(accessOf(alive, ChatChannel.GHOST).read, false);
		const dead = chatCtx({ seated: true, started: true, alive: false });
		assert.equal(accessOf(dead, ChatChannel.GHOST).read, true);
		// 관전자는 이 판에 참가한 적이 없다. 죽은 것과 같은 취급을 하면
		// 밖에서 들어온 사람이 마피아 목록을 읽는다
		const watcher = chatCtx({ seated: true, started: true, alive: false, spectating: true });
		assert.equal(accessOf(watcher, ChatChannel.GHOST).read, false);
	});

	it("32. 영매는 사망자 채팅을 읽을 수 있다", () => {
		const base = { seated: true, started: true, alive: true, ghostChat: true };
		const atNight = accessOf(chatCtx({ ...base, phase: GamePhase.NIGHT }), ChatChannel.GHOST);
		assert.equal(atNight.read, true);
		// 낮에는 닫힌다. 이 프로젝트의 영매는 "죽은 자와 밤에 이야기하는
		// 사람"이지 사망자 채팅을 상시 구독하는 사람이 아니다
		const atDay = accessOf(chatCtx({ ...base, phase: GamePhase.DAY }), ChatChannel.GHOST);
		assert.equal(atDay.read, false);
	});

	it("33. 접선 전 보조 직업은 마피아 채팅을 쓸 수 없다", () => {
		const before = chatCtx({ seated: true, started: true, mafiaChat: false });
		const access = accessOf(before, ChatChannel.MAFIA);
		assert.equal(access.read, false);
		assert.equal(access.write, false);

		const after = chatCtx({
			seated: true,
			started: true,
			phase: GamePhase.NIGHT,
			mafiaChat: true,
		});
		assert.equal(accessOf(after, ChatChannel.MAFIA).read, true);
	});

	it("34. 유혹된 플레이어는 발언할 수 없다", () => {
		const day = chatCtx({ seated: true, started: true, phase: GamePhase.DAY, seduced: true });
		const room = accessOf(day, ChatChannel.ROOM);
		assert.equal(room.write, false);
		assert.equal(room.read, true, "듣는 것까지 막으면 유혹이 퇴장이 됩니다");
		assert.notEqual(room.note, "");
	});
});

/* ------------------------------------------------------------------ */
/* 35~42. 상태와 배선                                                   */
/* ------------------------------------------------------------------ */

describe("클래식 회귀 · 상태와 배선", () => {
	it("35. 사망자는 능력도 투표도 쓸 수 없다", () => {
		// 밤: 이미 죽어 있던 좌석의 지목은 정산에서 통째로 무시된다
		const seats = [seat(1, Role.MAFIA, { alive: false }), seat(2, Role.CITIZEN)];
		const settled = night(seats, [[1, 2]]);
		assert.deepEqual(settled.casualties, []);
		assert.deepEqual(seats[1].attackedBy, []);

		// 낮: 죽은 좌석은 후보에서도 투표자에서도 빠진다
		const board = [
			seat(1, Role.CITIZEN, { alive: false, voteCount: 5 }),
			seat(2, Role.CITIZEN, { voteCount: 1 }),
		];
		const result = tallyVotes(board);
		assert.equal(result.outcome, VoteOutcome.EXECUTE);
		assert.equal(result.target === null ? 0 : result.target.index, 2);
		assert.equal(result.board.length, 1);
	});

	it("36. 연결 종료는 사망으로 처리되지 않는다", () => {
		resetWorld();
		const players = startGame(5, 1, plainRoles(5));
		const target = room(1);
		const before = target.seats.length;
		// 좌석은 끊기기 전에 잡아 둔다. 끊긴 뒤에는 playerOf로 되짚을 수 없다
		const gone = seatOf(players[3]);
		disconnect(players[3]);
		assert.equal(target.seats.length, before, "좌석이 사라졌습니다");
		assert.equal(gone.alive, true, "끊긴 사람이 죽었습니다");
		assert.equal(gone.connected, false);
		assert.equal(evaluateWinner(target.seats), null);
	});

	it("37. 재접속 시 비밀 상태가 복구된다", () => {
		resetWorld();
		startGame(5, 1, [Role.MAFIA, Role.POLICE, Role.CITIZEN, Role.CITIZEN, Role.CITIZEN]);
		const target = room(1);
		// 좌석 배정은 무작위다. 마피아는 "1번 좌석에 앉은 사람"이지
		// "startGame이 첫 번째로 돌려준 사람"이 아니다
		const mafia = playerAt(target, 1);
		const bystander = playerAt(target, 3);
		const untouched = cardTitle(bystander);
		disconnect(mafia);
		reconnect(mafia);

		const restored = seatOf(mafia);
		assert.equal(restored.role, Role.MAFIA);
		assert.equal(restored.team, Team.MAFIA);
		assert.equal(restored.connected, true);
		assert.equal(restored.index, 1);

		// 돌아온 화면에는 자기 직업 카드가 다시 실려 있다. 직업 공개 단계의
		// 화면은 메인 위젯이 아니라 겹쳐 뜨는 카드다
		assert.equal(cardTitle(mafia), roleName(Role.MAFIA), "재접속자가 자기 직업을 못 받았습니다");
		// 남의 화면은 그대로다. 복구가 방송이 되면 안 된다.
		// 카드 제목을 마피아와 비교하지 않는 이유는 castRoles가 카드가 뜬
		// 뒤에 직업을 덮기 때문이다 — 옆 사람의 카드에는 추첨 결과가 남아
		// 있고, 그 추첨은 판마다 다르다. 여기서 물어야 할 것은 "그 화면이
		// 재접속에 휩쓸렸는가"이고, 그것은 추첨과 무관하다
		assert.equal(cardTitle(bystander), untouched, "남의 화면이 재접속에 휩쓸렸습니다");
		assert.equal(seatAt(target, 1).role, Role.MAFIA);
	});

	it("38. 지난 단계의 요청은 무시된다", () => {
		resetWorld();
		startGame(5, 1, plainRoles(5));
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // NIGHT → DAY
		assert.equal(target.phase, GamePhase.DAY);

		// 낮에 도착한 투표는 버린다. 단계 검사가 없으면 지난 화면을 붙들고
		// 있던 사람이 다음 낮의 표를 미리 넣는다
		vote(playerAt(target, 2), 3);
		assert.equal(seatAt(target, 2).votedFor, 0);
		assert.equal(seatAt(target, 3).voteCount, 0);

		// 찬반도 마찬가지다. 지금은 찬반 단계가 아니다
		judge(playerAt(target, 2), Judgement.AGREE);
		assert.equal(seatAt(target, 2).judgement, Judgement.NONE);
	});

	it("39. 중복 요청은 한 번만 반영된다", () => {
		resetWorld();
		const reached = reachVote(5, 1, plainRoles(5));
		vote(reached.at(2), 3);
		vote(reached.at(2), 3);
		vote(reached.at(2), 3);
		assert.equal(seatAt(reached.target, 3).voteCount, 1, "같은 표가 여러 번 들어갔습니다");

		// 대상을 바꾸면 앞의 표는 회수된다
		vote(reached.at(2), 4);
		assert.equal(seatAt(reached.target, 3).voteCount, 0);
		assert.equal(seatAt(reached.target, 4).voteCount, 1);
	});

	it("40. 타이머로 인한 중복 단계 전환이 없다", () => {
		resetWorld();
		startGame(5, 1, plainRoles(5));
		const target = room(1);
		const seen: number[] = [];
		for (let i = 0; i < 4; i++) {
			const before = target.phaseId;
			finishPhase(target);
			assert.equal(target.phaseId, before + 1, "한 번의 만료로 단계가 여러 번 넘어갔습니다");
			seen.push(target.phaseId);
		}
		assert.deepEqual(seen, [seen[0], seen[0] + 1, seen[0] + 2, seen[0] + 3]);
	});

	it("41. 게임 종료 후 도착한 이벤트는 무효다", () => {
		resetWorld();
		const reached = reachVote(4, 1, plainRoles(4));
		// 마피아는 1번 좌석이다. 나머지 셋이 지목하면 처형되고 시민이 이긴다
		for (let index = 2; index <= 4; index++) vote(reached.at(index), 1);
		finishPhase(reached.target); // VOTE → VOTE_RESULT
		finishPhase(reached.target); // → DEFENSE
		finishPhase(reached.target); // → JUDGEMENT
		for (let index = 2; index <= 4; index++) judge(reached.at(index), Judgement.AGREE);
		finishPhase(reached.target); // → 처형 → 종료
		assert.equal(reached.target.phase, GamePhase.GAME_OVER);
		assert.equal(reached.target.winner, Team.CITIZEN);

		const winner = reached.target.winner;
		vote(reached.at(2), 3);
		judge(reached.at(2), Judgement.OPPOSE);
		assert.equal(reached.target.phase, GamePhase.GAME_OVER);
		assert.equal(reached.target.winner, winner, "끝난 판의 결과가 바뀌었습니다");
		assert.equal(seatAt(reached.target, 3).voteCount, 0);
	});

	it("42. 재경기 시 이전 상태가 남지 않는다", () => {
		resetWorld();
		const reached = reachVote(5, 1, plainRoles(5));
		vote(reached.at(2), 3);
		seatAt(reached.target, 3).intimidated = true;
		const mode = reached.target.ruleSet;

		resetRoom(reached.target);
		assert.equal(reached.target.started, false);
		assert.equal(reached.target.phase, GamePhase.LOBBY);
		assert.equal(reached.target.seats.length, 0);
		assert.equal(reached.target.nominee, 0);
		assert.equal(reached.target.voteRound, 0);
		assert.equal(reached.target.winner, null);
		assert.equal(reached.target.turnCount, 0);
		assert.deepEqual(reached.target.nightIntents, []);
		assert.deepEqual(reached.target.rejected, []);
		// 모드는 방의 것이지 판의 것이 아니다. 지우면 다음 판이 기본 모드로 돌아간다
		assert.equal(reached.target.ruleSet, mode);
	});
});

/* ------------------------------------------------------------------ */
/* 43~48. 승리 판정                                                     */
/* ------------------------------------------------------------------ */

describe("클래식 회귀 · 승리 판정", () => {
	it("43. 마피아가 전멸하면 시민이 승리한다", () => {
		const seats = [
			seat(1, Role.MAFIA, { alive: false }),
			seat(2, Role.CITIZEN),
			seat(3, Role.POLICE),
		];
		assert.equal(evaluateWinner(seats), Team.CITIZEN);
	});

	it("44. 마피아 유효 인원이 시민 이상이면 마피아가 승리한다", () => {
		const even = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN)];
		assert.equal(evaluateWinner(even), Team.MAFIA);

		const behind = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN), seat(3, Role.CITIZEN)];
		assert.equal(evaluateWinner(behind), null);

		const wiped = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN, { alive: false })];
		assert.equal(evaluateWinner(wiped), Team.MAFIA);
	});

	it("45. 정치인과 건달의 가중치가 승리 판정에 반영된다", () => {
		assert.equal(ROLE_DEFS[Role.POLITICIAN].winWeight, 2);
		assert.equal(ROLE_DEFS[Role.THUG].winWeight, 3);

		// 가중치가 1이었다면 둘 다 마피아 승리다. 무게가 판을 늘린다
		const withPolitician = [seat(1, Role.MAFIA), seat(2, Role.POLITICIAN)];
		assert.equal(countAlive(withPolitician).citizenPower, 2);
		assert.equal(evaluateWinner(withPolitician), null);

		const withThug = [seat(1, Role.MAFIA), seat(2, Role.MAFIA), seat(3, Role.THUG)];
		assert.equal(countAlive(withThug).citizenPower, 3);
		assert.equal(evaluateWinner(withThug), null);
	});

	it("46. 접선하지 않은 보조 직업은 마피아 인원으로 계산되지 않는다", () => {
		const before = [seat(1, Role.BEAST), seat(2, Role.CITIZEN), seat(3, Role.CITIZEN)];
		const idle = countAlive(before);
		assert.equal(idle.mafiaAlive, 1, "팀 소속은 처음부터 마피아입니다");
		assert.equal(idle.mafiaPower, 0, "접선 전 짐승인간이 마피아 무게로 세어졌습니다");
		assert.equal(idle.citizenPower, 3);
		assert.equal(evaluateWinner(before), null);

		before[0].contacted = true;
		const joined = countAlive(before);
		assert.equal(joined.mafiaPower, 1);
		assert.equal(joined.citizenPower, 2);
		assert.equal(evaluateWinner(before), null);
	});

	it("47. 성직자의 소생이 승리 판정에 반영된다", () => {
		// 이 프로젝트에는 "보류 중인 소생"이라는 상태가 없다. 파이프라인이
		// REVIVE(58)를 승리 판정보다 먼저 돌리므로, 되살아난 좌석은 그 밤의
		// 판정에 곧바로 들어간다
		const seats = [
			seat(1, Role.MAFIA),
			seat(2, Role.PRIEST),
			seat(3, Role.CITIZEN, { alive: false }),
		];
		// 소생 전이라면 마피아 1 대 시민 1이라 마피아가 이긴 판이다
		assert.equal(evaluateWinner(seats), Team.MAFIA);

		// 성직자(2번)가 죽어 있는 시민(3번)을 되살린다
		const settled = night(seats, [[2, 3]], true);
		assert.equal(outcomeOf(settled, 3), NightOutcome.REVIVED);
		seats[2].alive = true;
		assert.equal(evaluateWinner(seats), null, "되살아난 좌석이 판정에 들어가지 않았습니다");
	});

	it("48. 양쪽이 동시에 성립하면 우선순위가 일관되게 적용된다", () => {
		// 전멸은 머릿수로 본다. 마피아가 0이면 시민 승리가 먼저다 —
		// 힘 비교(0 >= 0)를 먼저 하면 아무도 없는 판이 마피아 승리가 된다
		const wipeout = [
			seat(1, Role.MAFIA, { alive: false }),
			seat(2, Role.CITIZEN, { alive: false }),
		];
		assert.equal(evaluateWinner(wipeout), Team.CITIZEN);
		assert.equal(evaluateWinner([]), Team.CITIZEN);

		// 같은 판을 두 번 물어도 답이 같다
		assert.equal(evaluateWinner(wipeout), evaluateWinner(wipeout));

		// 시민이 전멸한 판은 마피아 승리다. 두 조건이 함께 성립하는 유일한
		// 경우가 위의 전멸이고, 그때의 답은 언제나 시민이다
		const overrun = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN, { alive: false })];
		assert.equal(evaluateWinner(overrun), Team.MAFIA);
	});
});
