/**
 * 클래식 모드 필수 능력 상호작용 17종.
 *
 * 번호는 요구 사항의 목록 번호 그대로다 — classic-regression.test.ts와 같은
 * 원칙이고, 같은 이유다. 빠진 번호가 없다는 것을 눈으로 셀 수 있어야 한다.
 *
 * 회귀 파일과 이 파일은 보는 것이 다르다. 회귀는 규칙 하나를 홀로 못으로
 * 박는다("방탄은 한 번만 버틴다"). 여기는 능력이 **둘 이상 만나는 자리**만
 * 본다("치료받으면 방탄이 닳지 않는다"). 각각은 옳은데 만나면 틀리는 고장은
 * 규칙을 하나씩 검사하는 테스트로는 절대 잡히지 않는다 — 그런 고장은
 * 순서와 소모 시점과 상태의 수명에서 나오고, 그 셋은 능력이 겹칠 때만
 * 드러나기 때문이다.
 *
 * 대조군을 함께 둔다. "치료하면 방탄이 남는다"만 확인하면 방탄이 애초에
 * 닳지 않는 구현에서도 통과한다. 치료 없는 같은 판을 나란히 돌려 두 결과가
 * 실제로 갈리는 것까지 봐야 이 테스트가 무언가를 지키는 셈이 된다.
 *
 * 층은 항목마다 고른다. 순수 도메인으로 답할 수 있는 것은 파이프라인을
 * 직접 부르고, 협박처럼 "낮의 어느 화면에서 버튼이 막히는가"가 곧 규칙인
 * 것만 하네스로 간다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GamePhase, Judgement, Role, Team } from "../src/types/Game.types.ts";
import type { Room, Seat } from "../src/types/Game.types.ts";
import { POLITICIAN_VOTE_WEIGHT } from "../src/constants/GameConfig.ts";
import {
	ROLE_DEFS,
	countsForMafiaWin,
	effectiveRole,
	inMafiaChat,
	roleName,
} from "../src/domain/Roles.ts";
import { putIntent, resolveNightIntents } from "../src/domain/NightPipeline.ts";
import type { NightSettlement } from "../src/domain/NightPipeline.ts";
import {
	NightOutcome,
	hasExtraProbe,
	nightActionBlockedReason,
} from "../src/domain/NightResolution.ts";
import { VoteOutcome, tallyVotes } from "../src/domain/Vote.ts";
import { countAlive, evaluateWinner } from "../src/domain/WinCondition.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { LOOSE_CONTEXT, accessOf } from "../src/domain/chat/ChatPermission.ts";
import type { ChatContext } from "../src/domain/chat/ChatPermission.ts";
import { seat } from "./helpers/seat.ts";
import {
	finishPhase,
	judge,
	playerOf,
	resetWorld,
	room,
	startGame,
	vote,
} from "./helpers/Harness.ts";
import type { FakePlayer } from "./helpers/Harness.ts";

/* ------------------------------------------------------------------ */
/* 공용 헬퍼                                                            */
/* ------------------------------------------------------------------ */

/** 밤 하나를 돌린다. clicks는 [지목한 사람, 지목당한 사람]의 참가 번호 */
function night(seats: Seat[], clicks: Array<[number, number]>): NightSettlement {
	const intents: { actor: number; target: number }[] = [];
	for (const click of clicks) putIntent(intents, click[0], click[1]);
	return resolveNightIntents(seats, intents, { skipAttacks: false });
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

/**
 * 밤이 남긴 그날치 상태를 지운다.
 *
 * 서비스의 아침 처리(Night.ts)가 하는 일과 같은 목록이다. 여기서 하나를
 * 빠뜨리면 두 번째 밤이 첫 밤의 잔상을 안고 돌아, 실제로는 없는 고장이
 * 보이거나 있는 고장이 가려진다. 수명이 하루를 넘는 것(armored·seduced·
 * intimidated·exorcised·contacted·borrowedRole·markIndex)은 건드리지 않는다 —
 * 그것이 각 능력의 규칙이기 때문이다.
 */
function nextNight(seats: readonly Seat[]): void {
	for (const found of seats) {
		found.healed = false;
		found.blocked = false;
		found.attackedBy = [];
		found.scooped = false;
	}
}

/**
 * 그 결말이 죽음인가.
 *
 * 표로 두는 것은 완전성을 컴파일 단계에서 받아 내기 위해서다. "살아남는 결말
 * 목록에 없으면 죽음"으로 적으면 새로 생긴 결말이 조용히 사망으로 떨어져,
 * 살아남아야 할 사람이 테스트 안에서만 죽는다.
 */
const FATAL_OUTCOME: Record<NightOutcome, boolean> = {
	KILLED: true,
	SAVED: false,
	SHIELDED: false,
	BACKFIRED: true,
	BOMBED: true,
	HEARTBREAK: true,
	SACRIFICED: true,
	SPARED: false,
	REVIVED: false,
};

/** 사망 결말을 실제 좌석에 반영한다. 파이프라인은 판정만 하고 좌석을 내리지 않는다 */
function applyDeaths(settlement: NightSettlement): void {
	for (const casualty of settlement.casualties) {
		if (casualty.outcome === NightOutcome.REVIVED) casualty.seat.alive = true;
		else if (FATAL_OUTCOME[casualty.outcome]) casualty.seat.alive = false;
	}
}

/** 서로를 짝으로 아는 연인 둘 */
function lovers(a: number, b: number): Seat[] {
	return [seat(a, Role.LOVER, { loverIndex: b }), seat(b, Role.LOVER, { loverIndex: a })];
}

/** 채팅 판정에 쓸 상황 하나 */
function chatCtx(overrides: Partial<ChatContext>): ChatContext {
	return { ...LOOSE_CONTEXT, ...overrides };
}

function seatAt(target: Room, index: number): Seat {
	for (const found of target.seats) {
		if (found.index === index) return found;
	}
	throw new Error(`${index}번 좌석이 없습니다.`);
}

function playerAt(target: Room, index: number): FakePlayer {
	return playerOf(seatAt(target, index));
}

/** 마피아 한 명과 시민들. 배선 테스트가 예외 없는 판을 쓰기 위한 덱 */
function plainRoles(playerCount: number): Role[] {
	const roles: Role[] = [Role.MAFIA];
	while (roles.length < playerCount) roles.push(Role.CITIZEN);
	return roles;
}

/* ------------------------------------------------------------------ */
/* 1~4. 치료가 다른 능력을 앞지른다                                      */
/* ------------------------------------------------------------------ */

describe("클래식 상호작용 · 치료", () => {
	it("1. 치료받은 대상은 마피아의 처형을 무효로 만든다", () => {
		const seats = [seat(1, Role.DOCTOR), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		const settled = night(seats, [[1, 3], [2, 3]]);
		assert.equal(outcomeOf(settled, 3), NightOutcome.SAVED);

		// 대조군: 같은 판에서 치료만 빼면 죽는다. 이것이 없으면 "마피아가
		// 애초에 아무도 못 죽이는" 구현에서도 위 단언이 통과한다
		const bare = [seat(1, Role.DOCTOR), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		assert.equal(outcomeOf(night(bare, [[2, 3]]), 3), NightOutcome.KILLED);
	});

	it("2. 치료받은 군인은 방탄을 소모하지 않는다", () => {
		const seats = [seat(1, Role.DOCTOR), seat(2, Role.MAFIA), seat(3, Role.SOLDIER)];
		assert.equal(seats[2].armored, true, "군인이 방탄 없이 시작했습니다");
		const settled = night(seats, [[1, 3], [2, 3]]);
		assert.equal(outcomeOf(settled, 3), NightOutcome.SAVED);
		assert.equal(seats[2].armored, true, "치료받았는데 방탄이 닳았습니다");

		// 대조군: 치료가 없으면 방탄이 대신 쓰이고 그 자리에서 사라진다
		const bare = [seat(1, Role.DOCTOR), seat(2, Role.MAFIA), seat(3, Role.SOLDIER)];
		assert.equal(outcomeOf(night(bare, [[2, 3]]), 3), NightOutcome.SHIELDED);
		assert.equal(bare[2].armored, false);
	});

	it("3. 치료받은 연인이 살면 희생도 일어나지 않는다", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.DOCTOR)].concat(lovers(3, 4));
		const settled = night(seats, [[1, 3], [2, 3]]);
		assert.equal(outcomeOf(settled, 3), NightOutcome.SAVED);
		assert.equal(outcomeOf(settled, 4), null, "치료가 성공했는데 짝이 대신 죽었습니다");

		// 대조군: 치료가 없으면 짝이 대신 죽는다. 죽는 것은 공격받은 3번이
		// 아니라 4번이고, 3번은 SPARED로 살아남는다
		const bare = [seat(1, Role.MAFIA), seat(2, Role.DOCTOR)].concat(lovers(3, 4));
		const fell = night(bare, [[1, 3]]);
		assert.equal(outcomeOf(fell, 3), NightOutcome.SPARED);
		assert.equal(outcomeOf(fell, 4), NightOutcome.SACRIFICED);
	});

	it("4. 치료받은 테러리스트가 살면 자폭도 일어나지 않는다", () => {
		// 표식은 이미 걸어 둔 상태로 둔다. 표식을 거는 밤과 죽는 밤을 한
		// 밤에 겹치면 이 테스트가 "표식이 같은 밤에 걸리는가"까지 함께 묻게
		// 되어, 자폭이 안 터진 이유가 치료 때문인지 표식이 늦어서인지 갈린다
		const seats = [
			seat(1, Role.MAFIA),
			seat(2, Role.DOCTOR),
			seat(3, Role.TERRORIST, { markIndex: 1 }),
			seat(4, Role.CITIZEN),
		];
		const settled = night(seats, [[1, 3], [2, 3]]);
		assert.equal(outcomeOf(settled, 3), NightOutcome.SAVED);
		assert.equal(outcomeOf(settled, 1), null, "살아 있는 테러리스트가 폭탄을 터뜨렸습니다");

		// 대조군: 치료가 없으면 표식한 마피아를 안고 함께 죽는다
		const bare = [
			seat(1, Role.MAFIA),
			seat(2, Role.DOCTOR),
			seat(3, Role.TERRORIST, { markIndex: 1 }),
			seat(4, Role.CITIZEN),
		];
		const blast = night(bare, [[1, 3]]);
		assert.equal(outcomeOf(blast, 3), NightOutcome.KILLED);
		assert.equal(outcomeOf(blast, 1), NightOutcome.BOMBED);
	});
});

/* ------------------------------------------------------------------ */
/* 5~7. 방탄 · 접선 · 연인                                              */
/* ------------------------------------------------------------------ */

describe("클래식 상호작용 · 방탄과 연쇄", () => {
	it("5. 방탄은 한 번만 버틴다", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.SOLDIER), seat(3, Role.CITIZEN)];
		assert.equal(outcomeOf(night(seats, [[1, 2]]), 2), NightOutcome.SHIELDED);
		assert.equal(seats[1].armored, false);

		nextNight(seats);
		assert.equal(outcomeOf(night(seats, [[1, 2]]), 2), NightOutcome.KILLED, "방탄이 두 번 버텼습니다");
	});

	it("6. 짐승인간은 마피아와 같은 대상을 노려야 접선한다", () => {
		// 접선 실패: 마피아와 다른 사람을 노렸다. 무는 것도 실패한다 —
		// 접선 전에는 아무도 죽이지 못하는 것이 이 직업의 값이다
		const apart = [
			seat(1, Role.MAFIA),
			seat(2, Role.BEAST),
			seat(3, Role.CITIZEN),
			seat(4, Role.CITIZEN),
		];
		const missed = night(apart, [[1, 3], [2, 4]]);
		assert.equal(apart[1].contacted, false);
		assert.equal(missed.defected.length, 0);
		assert.equal(outcomeOf(missed, 4), null, "접선 전 짐승인간이 사람을 죽였습니다");
		assert.equal(outcomeOf(missed, 3), NightOutcome.KILLED);

		// 접선 성공: 같은 사람을 노렸다. 접선한 그 밤부터 곧바로 문다
		const together = [
			seat(1, Role.MAFIA),
			seat(2, Role.BEAST),
			seat(3, Role.CITIZEN),
			seat(4, Role.CITIZEN),
		];
		const met = night(together, [[1, 3], [2, 3]]);
		assert.equal(together[1].contacted, true);
		assert.equal(met.defected.indexOf(2) >= 0, true, "접선이 알려지지 않았습니다");
		assert.equal(outcomeOf(met, 3), NightOutcome.KILLED);

		// 접선한 다음 밤부터는 마피아와 겹칠 필요가 없다
		nextNight(together);
		assert.equal(outcomeOf(night(together, [[2, 4]]), 4), NightOutcome.KILLED);
	});

	it("7. 연인 한쪽이 공격받으면 다른 쪽이 대신 죽는다", () => {
		const seats = [seat(1, Role.MAFIA)].concat(lovers(2, 3)).concat([seat(4, Role.CITIZEN)]);
		const settled = night(seats, [[1, 2]]);
		assert.equal(outcomeOf(settled, 2), NightOutcome.SPARED, "공격받은 연인이 살아남지 못했습니다");
		assert.equal(outcomeOf(settled, 3), NightOutcome.SACRIFICED);
		// 대신 죽은 쪽도 같은 밤의 결말 목록에 실려야 한다. 다음 밤으로 미루면
		// 아침 방송에 한 명만 뜨고, 남은 한 명이 하루를 유령처럼 산다.
		// 둘뿐이라는 것도 함께 본다 — 살아남은 2번에게 결말이 하나 더 붙으면
		// 연인 연쇄가 희생을 되돌린 것이다
		assert.equal(settled.casualties.length, 2);
	});

	it("7-2. 두 연인이 같은 밤에 공격받으면 서로 대신할 수 없다", () => {
		// 이 판정이 없으면 3번이 4번을 몸받이로 세우고 4번이 3번을 몸받이로
		// 세워, 둘 다 죽으면서 둘 다 살아남은 기록이 만들어진다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.MAFIA)].concat(lovers(3, 4));
		const settled = night(seats, [[1, 3], [2, 4]]);
		assert.equal(outcomeOf(settled, 3), NightOutcome.KILLED);
		assert.equal(outcomeOf(settled, 4), NightOutcome.KILLED);
		assert.equal(settled.casualties.length, 2);
	});

	it("7-3. 짝이 이미 그 밤의 결말을 받았으면 대신 죽지 않는다", () => {
		// 의사가 4번을 살린 밤에 3번도 공격받았다. 4번에게는 이미 그 밤의
		// 결말이 하나 붙어 있으므로 몸받이가 되지 않는다 — 한 좌석에 결말이
		// 둘 붙으면 아침 방송이 같은 사람을 두 번 처리한다.
		//
		// 그래서 3번은 그대로 죽고, 짝을 잃은 4번이 뒤따른다. 밤에 연인 연쇄가
		// 실제로 도는 유일한 경로이기도 하다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.MAFIA), seat(5, Role.DOCTOR)].concat(
			lovers(3, 4)
		);
		const settled = night(seats, [[1, 3], [2, 4], [5, 4]]);
		assert.equal(outcomeOf(settled, 4), NightOutcome.SAVED, "의사가 살리지 못했습니다");
		assert.equal(outcomeOf(settled, 3), NightOutcome.KILLED, "짝이 대신 죽었습니다");
	});
});

/* ------------------------------------------------------------------ */
/* 8~10. 남의 차례를 빼앗는 능력                                        */
/* ------------------------------------------------------------------ */

describe("클래식 상호작용 · 차단", () => {
	it("8. 마담에게 유혹당하면 그 밤의 능력과 다음 낮의 발언이 함께 막힌다", () => {
		const seats = [
			seat(1, Role.MADAM),
			seat(2, Role.DOCTOR),
			seat(3, Role.CITIZEN),
			seat(4, Role.MAFIA),
		];
		const settled = night(seats, [[1, 2], [2, 3], [4, 3]]);
		assert.equal(seats[1].blocked, true);
		assert.equal(seats[1].seduced, true);
		assert.equal(seats[1].usesSpent, 0, "막혔는데 치료 횟수가 닳았습니다");
		assert.equal(outcomeOf(settled, 3), NightOutcome.KILLED, "막힌 의사가 사람을 살렸습니다");

		// 대조군: 마담이 없으면 같은 의사가 같은 사람을 살린다
		const free = [
			seat(1, Role.MADAM),
			seat(2, Role.DOCTOR),
			seat(3, Role.CITIZEN),
			seat(4, Role.MAFIA),
		];
		assert.equal(outcomeOf(night(free, [[2, 3], [4, 3]]), 3), NightOutcome.SAVED);

		// 발언 차단은 다음 낮에 걸린다. 밤의 blocked와 수명이 달라 따로 산다
		const day = chatCtx({ seated: true, started: true, phase: GamePhase.DAY, seduced: true });
		assert.equal(accessOf(day, ChatChannel.ROOM).write, false);
		assert.equal(accessOf(day, ChatChannel.ROOM).read, true, "듣는 것까지 막으면 유혹이 퇴장이 됩니다");
	});

	it("9. 건달에게 협박당하면 지목 투표와 찬반 투표가 모두 막힌다", () => {
		resetWorld();
		const players = startGame(8, 1, plainRoles(8));
		assert.equal(players.length, 8);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // NIGHT → DAY
		finishPhase(target); // DAY → VOTE
		assert.equal(target.phase, GamePhase.VOTE);

		// 밤이 지나 낮이 왔다는 뜻으로 협박을 건다. 협박은 밤에 걸려
		// 다음 낮 하나를 통째로 덮는 능력이라, 지목과 찬반 두 화면에서
		// 같은 값이 살아 있어야 한다 — 한쪽에서만 읽으면 건달의 능력이
		// 절반짜리가 되고, 그 절반이 어느 쪽인지는 화면을 열어 봐야 안다
		seatAt(target, 6).intimidated = true;

		vote(playerAt(target, 6), 2);
		assert.equal(seatAt(target, 6).votedFor, 0, "협박당한 사람의 지목이 들어갔습니다");

		vote(playerAt(target, 3), 2);
		vote(playerAt(target, 4), 2);
		vote(playerAt(target, 5), 2);
		finishPhase(target); // VOTE → VOTE_RESULT
		assert.equal(target.nominee, 2, "2번이 단상에 오르지 않았습니다");
		finishPhase(target); // → DEFENSE
		finishPhase(target); // → JUDGEMENT
		assert.equal(target.phase, GamePhase.JUDGEMENT);
		assert.equal(seatAt(target, 6).intimidated, true, "낮이 흐르는 동안 협박이 풀렸습니다");

		judge(playerAt(target, 6), Judgement.AGREE);
		assert.equal(seatAt(target, 6).judgement, Judgement.NONE, "협박당한 사람의 찬반이 들어갔습니다");
		// 협박당하지 않은 사람은 그대로 누른다
		judge(playerAt(target, 7), Judgement.AGREE);
		assert.equal(seatAt(target, 7).judgement, Judgement.AGREE);
	});

	it("10. 정치인은 두 표를 던지고 투표로는 처형되지 않는다", () => {
		assert.equal(ROLE_DEFS[Role.POLITICIAN].voteWeight, POLITICIAN_VOTE_WEIGHT);
		assert.equal(ROLE_DEFS[Role.POLITICIAN].immuneToVote, true);

		// 두 표: 하네스로 실제 버튼을 눌러 본다. 가중치는 표를 받는 쪽이
		// 아니라 던지는 쪽에서 곱해지므로 도메인 표만 봐서는 알 수 없다
		resetWorld();
		const roles: Role[] = [Role.MAFIA, Role.POLITICIAN, Role.CITIZEN, Role.CITIZEN, Role.CITIZEN];
		startGame(5, 1, roles);
		const target = room(1);
		finishPhase(target); // → NIGHT
		finishPhase(target); // → DAY
		finishPhase(target); // → VOTE
		const politician = seatAt(target, 2);
		assert.equal(politician.role, Role.POLITICIAN, "2번이 정치인이 아닙니다");
		vote(playerAt(target, 2), 4);
		assert.equal(seatAt(target, 4).voteCount, POLITICIAN_VOTE_WEIGHT);
		vote(playerAt(target, 3), 5);
		assert.equal(seatAt(target, 5).voteCount, 1, "일반 시민의 표가 2표로 세어졌습니다");

		// 면역: 최다 득표를 하고도 단상에 오르지 않는다. 두 능력이 겹치는
		// 자리가 여기다 — 2표를 던지는 사람이 처형까지 되면 판이 기운다
		const seats = [
			seat(1, Role.POLITICIAN, { voteCount: 3 }),
			seat(2, Role.CITIZEN, { voteCount: 1 }),
			seat(3, Role.CITIZEN),
			seat(4, Role.MAFIA),
		];
		const tally = tallyVotes(seats);
		assert.equal(tally.outcome, VoteOutcome.IMMUNE);
		assert.equal(tally.target === null ? 0 : tally.target.index, 1);
	});
});

/* ------------------------------------------------------------------ */
/* 11~14. 상태가 하루를 넘는 능력                                       */
/* ------------------------------------------------------------------ */

describe("클래식 상호작용 · 접선과 위임", () => {
	it("11. 접선하면 채팅 권한과 승리 인원이 함께 바뀐다", () => {
		const seats = [
			seat(1, Role.MAFIA),
			seat(2, Role.BEAST),
			seat(3, Role.CITIZEN),
			seat(4, Role.CITIZEN),
		];
		const beast = seats[1];

		// 접선 전: 마피아 팀이지만 밀담도 못 듣고 승리 인원에도 안 든다.
		// 시민 무게에 서는 것이 중요하다 — 어느 쪽에도 두지 않으면 마피아가
		// 넘어야 할 벽이 조용히 낮아진다(WinCondition.countAlive 주석)
		assert.equal(beast.team, Team.MAFIA);
		assert.equal(beast.contacted, false);
		assert.equal(inMafiaChat(beast), false);
		assert.equal(countsForMafiaWin(beast), false);
		const before = countAlive(seats);
		assert.equal(before.mafiaAlive, 2, "팀 소속은 처음부터 마피아여야 합니다");
		assert.equal(before.mafiaPower, 1);
		assert.equal(before.citizenPower, 3);
		assert.equal(evaluateWinner(seats), null);
		assert.equal(accessOf(chatCtx({ seated: true, started: true, mafiaChat: false }), ChatChannel.MAFIA).read, false);

		night(seats, [[1, 3], [2, 3]]);
		seats[2].alive = false;

		// 접선 후: 같은 좌석이 밀담을 듣고 승리 인원에도 든다. 3번이 죽어
		// 시민이 하나 줄었으므로 이 접선이 곧 판의 끝이다
		assert.equal(beast.contacted, true);
		assert.equal(inMafiaChat(beast), true);
		assert.equal(countsForMafiaWin(beast), true);
		const after = countAlive(seats);
		assert.equal(after.mafiaPower, 2);
		assert.equal(after.citizenPower, 1);
		assert.equal(evaluateWinner(seats), Team.MAFIA);
		assert.equal(accessOf(chatCtx({ seated: true, started: true, mafiaChat: true }), ChatChannel.MAFIA).read, true);

		// 스파이도 접선 전에는 밀담이 닫힌다. 다만 닫히는 이유가 다르다 —
		// 짐승인간은 팀이 이미 마피아인데 needsContact에 걸리고, 스파이는
		// nightChat이 마피아로 열려 있는데 팀이 아직 시민이라 걸린다.
		// inMafiaChat이 두 갈래를 다 보는 이유가 이것이다. 한 갈래만 남기면
		// 나머지 하나가 그대로 새어 나가 접선 전 밀담이 노출된다
		const spy = seat(5, Role.SPY);
		assert.equal(ROLE_DEFS[Role.SPY].nightChat, ChatChannel.MAFIA);
		assert.equal(spy.team, Team.CITIZEN, "스파이가 처음부터 마피아 팀입니다");
		assert.equal(inMafiaChat(spy), false, "접선 전 스파이에게 밀담이 열렸습니다");
		assert.equal(countsForMafiaWin(spy), false);
		spy.team = Team.MAFIA;
		spy.contacted = true;
		assert.equal(inMafiaChat(spy), true);
		assert.equal(countsForMafiaWin(spy), true);
	});

	it("11-2. 접선한 스파이는 판에 한 번 더 조사한다", () => {
		const seats = [
			seat(1, Role.SPY),
			seat(2, Role.MAFIA),
			seat(3, Role.POLICE),
			seat(4, Role.CITIZEN),
		];
		const spy = seats[0];
		assert.equal(hasExtraProbe(spy), false, "접선 전에 추가 첩보가 열렸습니다");

		// 첫 밤. 마피아를 찾아 합류하지만 이 밤은 조사 하나로 끝난다 —
		// contacted를 세우는 곳이 밤 끝의 정산이라 클릭 시점에는 아직 거짓이다.
		// 우연이 아니라 필요한 순서다. 접선한 그 밤에 격자가 다시 열리면
		// "또 누를 수 있음" 자체가 마피아를 찾았다는 답이 되어, 아침까지
		// 감춰 둔 결과를 클릭 즉시 알려준다
		const first = night(seats, [[1, 2]]);
		assert.equal(revealsFor(first, 1).length, 1);
		assert.equal(spy.contacted, true);
		assert.deepEqual(first.defected, [1]);
		assert.equal(hasExtraProbe(spy), true, "접선한 뒤에도 추가 첩보가 없습니다");

		// 둘째 밤. 대상을 하나 고른 뒤에도 격자가 한 번 더 열린다
		nextNight(seats);
		spy.usedSkill = true;
		assert.equal(nightActionBlockedReason(spy, 2), null, "둘째 지목이 막혔습니다");
		spy.extraProbeIndex = 2;
		assert.equal(
			nightActionBlockedReason(spy, 2),
			"이미 대상을 선택했습니다.",
			"셋째 지목까지 열렸습니다"
		);

		const second = night(seats, [[1, 3]]);
		const lines = revealsFor(second, 1);
		assert.equal(lines.length, 2, "추가 첩보가 돌지 않았습니다");
		assert.ok(lines[0].indexOf(roleName(Role.POLICE)) >= 0);
		assert.ok(lines[1].indexOf(roleName(Role.MAFIA)) >= 0);
		// 이미 합류한 스파이가 마피아를 또 만난 것이다. 합류 문구가 한 번 더
		// 나가거나 defected에 두 번 실리면, 자기 편인 사람을 보고 "합류했습니다"가
		// 뜨고 아침의 배신 통지가 중복된다
		assert.deepEqual(second.defected, []);
		assert.equal(lines[1].indexOf("합류했습니다"), -1);
		assert.equal(spy.extraProbeSpent, true);
		assert.equal(hasExtraProbe(spy), false, "판에 한 번뿐이어야 합니다");

		// 셋째 밤. 다 쓴 뒤에는 좌석에 값이 남아 있어도 돌지 않는다 —
		// 위젯이 거절당한 지목을 다시 보내는 길이 있기 때문이다
		nextNight(seats);
		spy.usedSkill = true;
		assert.equal(
			nightActionBlockedReason(spy, 3),
			"이미 대상을 선택했습니다.",
			"다 쓴 추가 첩보가 다시 열렸습니다"
		);
		spy.extraProbeIndex = 4;
		const third = night(seats, [[1, 3]]);
		assert.equal(revealsFor(third, 1).length, 1, "다 쓴 추가 첩보가 또 돌았습니다");
	});

	it("11-3. 추가 첩보도 군인에게 튕기고, 막힌 밤에는 돌지 않는다", () => {
		const seats = [
			seat(1, Role.SPY, { team: Team.MAFIA, contacted: true }),
			seat(2, Role.MAFIA),
			seat(3, Role.SOLDIER),
			seat(4, Role.CITIZEN),
		];
		const spy = seats[0];
		assert.equal(hasExtraProbe(spy), true);

		// 둘째 조사가 별도 경로로 새 줄을 적었다면 군인의 반탐이 이 길만
		// 비껴가고, 그때 스파이는 추가 첩보로 군인의 정체를 그냥 읽는다
		spy.extraProbeIndex = 3;
		const bounced = night(seats, [[1, 4]]);
		const lines = revealsFor(bounced, 1);
		assert.equal(lines.length, 2);
		assert.ok(lines[0].indexOf(roleName(Role.CITIZEN)) >= 0);
		assert.ok(lines[1].indexOf("튕겨났습니다") >= 0);
		assert.equal(lines[1].indexOf(roleName(Role.SOLDIER)), -1, "군인의 직업이 샜습니다");
		assert.ok(revealsFor(bounced, 3)[0].indexOf("캐내려 했습니다") >= 0);
		// 튕겨도 쓴 것으로 친다. 실패가 공짜면 캐내기가 군인 탐지기가 된다
		assert.equal(spy.extraProbeSpent, true);

		// 대조군. 막힌 밤에는 첫 지목도 둘째도 돌지 않는다
		const blocked = [
			seat(1, Role.SPY, { team: Team.MAFIA, contacted: true, blocked: true }),
			seat(2, Role.MAFIA),
			seat(3, Role.SOLDIER),
			seat(4, Role.CITIZEN),
		];
		blocked[0].extraProbeIndex = 3;
		const nothing = night(blocked, [[1, 4]]);
		// 방해받았다는 안내 한 줄만 온다. 조사 결과는 첫째도 둘째도 없다
		const stopped = revealsFor(nothing, 1);
		assert.equal(stopped.length, 1, "막혔는데 조사가 돌았습니다");
		assert.ok(stopped[0].indexOf("방해") >= 0);
		assert.deepEqual(revealsFor(nothing, 3), [], "막힌 밤에 군인이 캐냄을 알아챘습니다");
		assert.equal(blocked[0].extraProbeSpent, false, "막힌 밤에 추가 첩보가 닳았습니다");
	});

	it("12. 영매가 성불시킨 혼령은 성직자도 되살리지 못한다", () => {
		const seats = [
			seat(1, Role.SHAMAN),
			seat(2, Role.PRIEST),
			seat(3, Role.CITIZEN, { alive: false }),
			seat(4, Role.CITIZEN, { alive: false }),
			seat(5, Role.MAFIA),
		];
		night(seats, [[1, 3]]);
		assert.equal(seats[2].exorcised, true);
		assert.equal(seats[3].exorcised, false, "지목하지 않은 혼령까지 성불됐습니다");

		// 성불한 쪽: 되살아나지 않는다. 그리고 능력이 닳지도 않는다 —
		// 판에 한 번뿐인 능력을 헛짚음으로 잃으면, 영매가 실수로 시민 편의
		// 성직자를 봉인해 버리는 사고 하나가 판을 끝낸다
		nextNight(seats);
		const denied = night(seats, [[2, 3]]);
		assert.equal(outcomeOf(denied, 3), null);
		assert.equal(seats[2].alive, false);
		assert.equal(seats[1].usesSpent, 0, "실패한 소생이 성직자의 한 번을 태웠습니다");
		const told = revealsFor(denied, 2);
		assert.equal(told.length, 1, "왜 실패했는지 알려주지 않았습니다");

		// 성불하지 않은 쪽: 같은 성직자가 같은 밤 구조로 되살린다
		nextNight(seats);
		const raised = night(seats, [[2, 4]]);
		assert.equal(outcomeOf(raised, 4), NightOutcome.REVIVED);
		assert.equal(seats[1].usesSpent, 1);
	});

	it("13. 도굴꾼은 처음 죽은 시민 편 사망자의 직업을 이어받는다", () => {
		const seats = [
			seat(1, Role.MAFIA),
			seat(2, Role.GRAVEDIGGER),
			seat(3, Role.DOCTOR),
			seat(4, Role.CITIZEN),
		];
		const first = night(seats, [[1, 3]]);
		assert.equal(outcomeOf(first, 3), NightOutcome.KILLED);
		assert.equal(seats[1].role, Role.DOCTOR, "도굴꾼이 무덤을 파지 않았습니다");
		assert.equal(seats[1].usesSpent, 1);
		assert.equal(revealsFor(first, 2).length, 1, "무엇이 되었는지 알려주지 않았습니다");
		// 복제가 아니라 이전이다. 시체에 직업을 남겨 두면 같은 직업이 판에
		// 둘이 되고, 성직자가 그를 되살리는 순간 진짜로 둘이 된다
		assert.equal(seats[2].role, Role.CITIZEN, "파낸 무덤에 직업이 남았습니다");
		applyDeaths(first);

		// 이어받은 능력은 다음 밤부터 실제로 돈다. 직업 이름만 바뀌고
		// 능력이 안 따라오면 도굴꾼은 이름표를 바꿔 단 시민일 뿐이다
		nextNight(seats);
		const healed = night(seats, [[2, 4], [1, 4]]);
		assert.equal(outcomeOf(healed, 4), NightOutcome.SAVED);

		// 판에 한 번뿐이다. 두 번째 무덤은 파지 않는다
		assert.equal(seats[1].role, Role.DOCTOR);
	});

	it("14. 도둑이 훔친 능력은 다음 밤 한 번만 쓰인다", () => {
		const seats = [
			seat(1, Role.THIEF),
			seat(2, Role.DOCTOR),
			seat(3, Role.MAFIA),
			seat(4, Role.CITIZEN),
		];
		const stolen = night(seats, [[1, 2]]);
		assert.equal(seats[0].borrowedRole, Role.DOCTOR);
		assert.equal(effectiveRole(seats[0]), Role.DOCTOR);
		assert.equal(revealsFor(stolen, 1).length, 1);
		// 훔친 직업 이름은 알려주지 않는다. 알려주면 도둑이 조사 직업이 된다
		assert.equal(revealsFor(stolen, 1)[0].indexOf("의사") < 0, true);

		// 다음 밤: 훔친 능력이 원래 직업의 자리(PROTECT)에서 돈다.
		// roleDef(seat.role)로 읽으면 도둑의 자리(AFTER)에서 돌아 공격보다
		// 뒤로 밀리고, 치료가 아무도 못 살린다
		nextNight(seats);
		const used = night(seats, [[1, 4], [3, 4]]);
		assert.equal(outcomeOf(used, 4), NightOutcome.SAVED, "빌린 능력이 제 자리에서 돌지 않았습니다");
		assert.equal(seats[0].borrowedRole, null, "빌린 능력이 하루를 넘겼습니다");

		// 그 다음 밤에는 다시 평범한 도둑이다
		nextNight(seats);
		const plain = night(seats, [[1, 4], [3, 4]]);
		assert.equal(outcomeOf(plain, 4), NightOutcome.KILLED);
		assert.equal(seats[0].borrowedRole, Role.CITIZEN, "훔치는 능력 자체가 사라졌습니다");
	});
});

/* ------------------------------------------------------------------ */
/* 15~17. 연쇄와 승리 판정                                              */
/* ------------------------------------------------------------------ */

describe("클래식 상호작용 · 승리 판정", () => {
	it("15. 자폭 연쇄를 반영한 뒤에 승리를 판정한다", () => {
		// 마피아가 하나뿐인 판: 폭발이 그 하나를 데려가면 그 밤에 끝난다
		const lone = [
			seat(1, Role.MAFIA),
			seat(2, Role.TERRORIST, { markIndex: 1 }),
			seat(3, Role.CITIZEN),
			seat(4, Role.CITIZEN),
		];
		const settled = night(lone, [[1, 2]]);
		assert.equal(outcomeOf(settled, 2), NightOutcome.KILLED);
		assert.equal(outcomeOf(settled, 1), NightOutcome.BOMBED);

		// 폭발을 빼고 판정하면 판이 아직 안 끝난 것으로 보인다.
		// 판정을 연쇄보다 앞에 두면 이 방은 한 밤을 더 돈다
		lone[1].alive = false;
		assert.equal(evaluateWinner(lone), null);
		applyDeaths(settled);
		assert.equal(evaluateWinner(lone), Team.CITIZEN);

		// 마피아가 둘인 판: 같은 폭발이 하나만 데려가므로 아직 안 끝난다.
		// 이 대조가 없으면 "폭발하면 무조건 시민 승"인 구현도 통과한다
		const pair = [
			seat(1, Role.MAFIA),
			seat(2, Role.MAFIA),
			seat(3, Role.TERRORIST, { markIndex: 1 }),
			seat(4, Role.CITIZEN),
			seat(5, Role.CITIZEN),
		];
		applyDeaths(night(pair, [[1, 3]]));
		assert.equal(pair[0].alive, false, "표식한 마피아가 살아남았습니다");
		assert.equal(pair[1].alive, true);
		assert.equal(evaluateWinner(pair), null);
	});

	it("16. 같은 밤에 여럿이 죽어도 결말이 하나씩만 붙는다", () => {
		// 한 밤에 네 갈래가 겹친다: 마피아의 처형, 자경단원의 오인 사살,
		// 그 사살이 부른 자폭, 그리고 처형을 가로챈 연인의 희생
		const seats = [
			seat(1, Role.MAFIA),
			seat(2, Role.TERRORIST, { markIndex: 1 }),
			seat(3, Role.LOVER, { loverIndex: 4 }),
			seat(4, Role.LOVER, { loverIndex: 3 }),
			seat(5, Role.VIGILANTE),
			seat(6, Role.CITIZEN),
		];
		const settled = night(seats, [[1, 3], [5, 2]]);

		const byIndex: Array<[number, string]> = [];
		for (const casualty of settled.casualties) {
			byIndex.push([casualty.seat.index, casualty.outcome]);
		}
		byIndex.sort((a, b) => a[0] - b[0]);
		assert.deepEqual(byIndex, [
			[1, NightOutcome.BOMBED],      // 표식해 둔 테러리스트와 함께
			[2, NightOutcome.KILLED],      // 자경단원이 시민을 오인해 쐈다
			[3, NightOutcome.SPARED],      // 마피아가 쳤지만 짝이 대신 죽었다
			[4, NightOutcome.SACRIFICED],  // 3번 대신
			[5, NightOutcome.BACKFIRED],   // 오인 사살의 책임
		]);

		// 좌석 하나에 결말이 둘 붙지 않는다. 붙으면 아침 방송에 같은 사람이
		// 두 번 뜨고, 사망 처리도 두 번 돌아 통계와 보상이 어긋난다
		const seen: number[] = [];
		for (const entry of byIndex) {
			assert.equal(seen.indexOf(entry[0]), -1, `${entry[0]}번에 결말이 둘 붙었습니다`);
			seen.push(entry[0]);
		}

		applyDeaths(settled);
		assert.equal(seats[5].alive, true, "관련 없는 6번이 함께 죽었습니다");
		assert.equal(evaluateWinner(seats), Team.CITIZEN);
	});

	it("17. 양쪽 승리 조건이 동시에 성립하면 순서가 답을 정한다", () => {
		// 전원 사망: 마피아 전멸(시민 승)과 마피아 무게 ≥ 시민 무게(마피아 승)가
		// 0 ≥ 0으로 함께 성립한다. 앞줄이 이겨 시민 승이어야 한다 — 아무도
		// 남지 않은 판을 마피아 승으로 주면 전멸시키는 것이 마피아의 전략이 된다
		const wiped = [seat(1, Role.MAFIA, { alive: false }), seat(2, Role.CITIZEN, { alive: false })];
		const counted = countAlive(wiped);
		assert.equal(counted.mafiaAlive, 0);
		assert.equal(counted.mafiaPower >= counted.citizenPower, true, "동시 성립 상황이 아닙니다");
		assert.equal(evaluateWinner(wiped), Team.CITIZEN);

		// 접선하지 못한 짐승인간만 남은 판: 시민이 전멸했지만 무게로는
		// 그가 아직 시민 쪽에 서 있다. 무게 줄만 있으면 이 방은 영원히
		// 끝나지 않는다 — 머릿수 줄이 그래서 따로 필요하다
		const lone = [
			seat(1, Role.BEAST),
			seat(2, Role.CITIZEN, { alive: false }),
			seat(3, Role.MAFIA, { alive: false }),
		];
		const alone = countAlive(lone);
		assert.equal(alone.citizenAlive, 0);
		assert.equal(alone.mafiaPower, 0, "접선 못 한 짐승인간이 마피아 무게로 세어졌습니다");
		assert.equal(alone.citizenPower, 1);
		assert.equal(evaluateWinner(lone), Team.MAFIA);

		// 판정은 몇 번을 물어도 같은 답을 낸다. 판정이 상태를 건드리면
		// 승리 화면을 두 번 그리는 것만으로 승자가 뒤집힌다
		assert.equal(evaluateWinner(wiped), Team.CITIZEN);
		assert.equal(evaluateWinner(lone), Team.MAFIA);
	});
});
