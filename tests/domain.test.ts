/**
 * 도메인 로직 테스트.
 *
 * src/domain/* 는 ZEP API를 전혀 참조하지 않으므로 Node에서 그대로 돌아간다.
 * 기존 구조에서는 이 규칙들이 전부 App.getPlayerByID 호출과 위젯 조작 사이에
 * 끼어 있어서 ZEP을 띄우지 않고는 한 줄도 검증할 수 없었다.
 *
 * 실행: npm test  (node --test, Node 22.18+ 의 타입 스트리핑 사용)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role, Team } from "../src/types/Game.types.ts";
import type { Seat } from "../src/types/Game.types.ts";
import { buildRoleDeck } from "../src/domain/RoleAssignment.ts";
import { resolveNightCasualties, resolveNightSelect } from "../src/domain/NightResolution.ts";
import { expReward, levelFromExp, recordKey } from "../src/domain/Progression.ts";
import { tallyVotes, VoteOutcome } from "../src/domain/Vote.ts";
import { evaluateWinner } from "../src/domain/WinCondition.ts";
import { ROLE_DEFS } from "../src/domain/Roles.ts";

function seat(index: number, role: Role, overrides: Partial<Seat> = {}): Seat {
	return {
		playerId: `p${index}`,
		index,
		name: `p${index}`,
		level: "Lv.1",
		role,
		team: ROLE_DEFS[role].team,
		alive: true,
		ready: false,
		voted: false,
		voteCount: 0,
		healed: false,
		marked: false,
		usedSkill: false,
		kickedBy: [],
		connected: true,
		...overrides,
	};
}

describe("RoleAssignment", () => {
	it("인원수만큼 직업을 배분한다", () => {
		for (let count = 4; count <= 8; count++) {
			assert.equal(buildRoleDeck(count).length, count);
		}
	});

	it("4명은 마피아 1, 8명은 마피아 2", () => {
		const rng = () => 0; // 결정적으로: shuffle이 순서만 바꾸고 구성은 유지한다
		const mafiaIn = (count: number) =>
			buildRoleDeck(count, rng).filter(role => role === Role.MAFIA).length;
		assert.equal(mafiaIn(4), 1);
		assert.equal(mafiaIn(8), 2);
	});

	it("표보다 인원이 많으면 나머지는 시민", () => {
		const deck = buildRoleDeck(10, () => 0);
		assert.equal(deck.filter(role => role === Role.CITIZEN).length, 3);
	});
});

describe("WinCondition", () => {
	it("마피아가 전멸하면 시민 승리", () => {
		const seats = [seat(1, Role.MAFIA, { alive: false }), seat(2, Role.CITIZEN)];
		assert.equal(evaluateWinner(seats), Team.CITIZEN);
	});

	it("마피아 수가 시민 이상이면 마피아 승리", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN)];
		assert.equal(evaluateWinner(seats), Team.MAFIA);
	});

	it("시민이 더 많으면 아직 끝나지 않았다", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN), seat(3, Role.DOCTOR)];
		assert.equal(evaluateWinner(seats), null);
	});

	it("마피아에 합류한 스파이는 마피아 진영으로 센다", () => {
		const spy = seat(3, Role.SPY, { team: Team.MAFIA });
		const seats = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN), spy];
		assert.equal(evaluateWinner(seats), Team.MAFIA);
	});
});

describe("Vote", () => {
	it("아무도 표를 받지 않으면 처형 없음", () => {
		const result = tallyVotes([seat(1, Role.CITIZEN), seat(2, Role.MAFIA)]);
		assert.equal(result.outcome, VoteOutcome.NO_VOTES);
		assert.equal(result.target, null);
	});

	it("동률이면 처형 없음", () => {
		const result = tallyVotes([
			seat(1, Role.CITIZEN, { voteCount: 2 }),
			seat(2, Role.MAFIA, { voteCount: 2 }),
		]);
		assert.equal(result.outcome, VoteOutcome.TIE);
	});

	it("최다 득표자를 처형한다", () => {
		const result = tallyVotes([
			seat(1, Role.CITIZEN, { voteCount: 1 }),
			seat(2, Role.MAFIA, { voteCount: 3 }),
		]);
		assert.equal(result.outcome, VoteOutcome.EXECUTE);
		assert.equal(result.target?.index, 2);
	});

	it("정치인은 최다 득표여도 처형되지 않는다", () => {
		const result = tallyVotes([
			seat(1, Role.POLITICIAN, { voteCount: 3 }),
			seat(2, Role.MAFIA, { voteCount: 1 }),
		]);
		assert.equal(result.outcome, VoteOutcome.IMMUNE);
		assert.equal(result.target?.index, 1);
	});

	it("죽은 사람의 표는 집계에 들어가지 않는다", () => {
		// 기존 voteResult는 죽은 플레이어의 votecount도 최대값 계산에 넣었다
		const result = tallyVotes([
			seat(1, Role.CITIZEN, { voteCount: 9, alive: false }),
			seat(2, Role.MAFIA, { voteCount: 1 }),
		]);
		assert.equal(result.outcome, VoteOutcome.EXECUTE);
		assert.equal(result.target?.index, 2);
		assert.equal(result.board.length, 1);
	});

	it("결과판은 득표 내림차순", () => {
		const result = tallyVotes([
			seat(1, Role.CITIZEN, { voteCount: 1 }),
			seat(2, Role.MAFIA, { voteCount: 3 }),
			seat(3, Role.DOCTOR, { voteCount: 2 }),
		]);
		assert.deepEqual(result.board, [
			[2, 3],
			[3, 2],
			[1, 1],
		]);
	});
});

describe("NightResolution", () => {
	it("의사가 치료하면 healed가 선다", () => {
		const doctor = seat(1, Role.DOCTOR);
		const target = seat(2, Role.CITIZEN);
		const result = resolveNightSelect(doctor, target);
		assert.equal(result?.consumed, true);
		assert.equal(target.healed, true);
	});

	it("마피아가 지목하면 marked가 서고 능력이 소모된다", () => {
		const mafia = seat(1, Role.MAFIA);
		const target = seat(2, Role.CITIZEN);
		const result = resolveNightSelect(mafia, target);
		assert.equal(result?.consumed, true);
		assert.equal(target.marked, true);
	});

	it("이미 지목된 대상을 또 찍으면 능력을 소모하지 않는다", () => {
		const mafia = seat(1, Role.MAFIA);
		const target = seat(2, Role.CITIZEN, { marked: true });
		const result = resolveNightSelect(mafia, target);
		assert.equal(result?.consumed, false);
	});

	it("스파이가 마피아를 찾으면 진영이 바뀌고 능력이 남는다", () => {
		const spy = seat(1, Role.SPY);
		const result = resolveNightSelect(spy, seat(2, Role.MAFIA));
		assert.equal(spy.team, Team.MAFIA);
		assert.equal(result?.consumed, false);
		assert.equal(result?.joinedMafia, true);
	});

	it("스파이가 시민을 조사하면 능력을 소모한다", () => {
		const spy = seat(1, Role.SPY);
		const result = resolveNightSelect(spy, seat(2, Role.DOCTOR));
		assert.equal(spy.team, Team.CITIZEN);
		assert.equal(result?.consumed, true);
	});

	it("능력이 없는 직업은 null", () => {
		assert.equal(resolveNightSelect(seat(1, Role.CITIZEN), seat(2, Role.MAFIA)), null);
		assert.equal(resolveNightSelect(seat(1, Role.SHAMAN), seat(2, Role.MAFIA)), null);
	});

	it("치료받은 대상은 죽지 않는다", () => {
		const casualties = resolveNightCasualties([
			seat(1, Role.CITIZEN, { marked: true, healed: true }),
			seat(2, Role.POLICE, { marked: true }),
			seat(3, Role.DOCTOR),
		]);
		assert.equal(casualties.length, 2);
		assert.equal(casualties[0].saved, true);
		assert.equal(casualties[1].saved, false);
		assert.equal(casualties[1].seat.index, 2);
	});
});

describe("Progression", () => {
	it("마피아 승리 시 생존 마피아의 보상이 가장 크다", () => {
		const mafia = seat(1, Role.MAFIA);
		const citizen = seat(2, Role.CITIZEN);
		assert.equal(expReward(Team.MAFIA, mafia), 12);
		assert.equal(expReward(Team.MAFIA, citizen), 4);
		assert.equal(expReward(Team.CITIZEN, citizen), 5);
	});

	it("죽은 참가자는 보상이 줄어든다", () => {
		assert.equal(expReward(Team.MAFIA, seat(1, Role.MAFIA, { alive: false })), 8);
	});

	it("전적은 최종 진영으로 기록된다", () => {
		// 기존에는 직업이 스파이면 무조건 마피아 전적으로 기록됐다
		const spyStayed = seat(1, Role.SPY);
		const spyJoined = seat(2, Role.SPY, { team: Team.MAFIA });
		assert.equal(recordKey(Team.CITIZEN, spyStayed), "citizenWin");
		assert.equal(recordKey(Team.CITIZEN, spyJoined), "mafiaLose");
		assert.equal(recordKey(Team.MAFIA, spyJoined), "mafiaWin");
	});

	it("레벨 계산은 항상 끝나고 단조 증가한다", () => {
		assert.equal(levelFromExp(0), 0);
		assert.equal(levelFromExp(16), 2);
		assert.equal(levelFromExp(17), 3);
		assert.equal(levelFromExp(51), 4);

		let previous = 0;
		for (let exp = 0; exp <= 5000; exp += 7) {
			const level = levelFromExp(exp);
			assert.ok(level >= previous);
			previous = level;
		}
	});
});

describe("ROLE_DEFS", () => {
	it("밤에 지목이 있는 직업은 안내 문구가 있다", () => {
		for (const role of Object.keys(ROLE_DEFS) as Role[]) {
			const def = ROLE_DEFS[role];
			if (def.nightAction !== null) {
				assert.ok(def.nightPrompt, `${role}에 nightPrompt가 없다`);
			}
		}
	});
});
