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
import {
	NightOutcome,
	resolveNightCasualties,
	resolveNightSelect,
} from "../src/domain/NightResolution.ts";
import { expReward, levelFromExp, recordKey } from "../src/domain/Progression.ts";
import { tallyVotes, VoteOutcome } from "../src/domain/Vote.ts";
import { evaluateWinner } from "../src/domain/WinCondition.ts";
import { NightActionKind, ROLE_DEFS } from "../src/domain/Roles.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { MAX_PLAYERS, MIN_PLAYERS } from "../src/constants/GameConfig.ts";

function seat(index: number, role: Role, overrides: Partial<Seat> = {}): Seat {
	return {
		playerId: `p${index}`,
		index,
		name: `p${index}`,
		rank: "Lv.1",
		role,
		team: ROLE_DEFS[role].team,
		alive: true,
		ready: false,
		votedFor: 0,
		voteCount: 0,
		healed: false,
		attackedBy: [],
		armored: ROLE_DEFS[role].survivesFirstAttack === true,
		silenced: false,
		scooped: false,
		usedSkill: false,
		skillSpent: false,
		kickedBy: [],
		connected: true,
		...overrides,
	};
}

/** 그 진영의 좌석이 몇 개인가. 직업이 아니라 진영으로 세야 하는 곳이 많다 */
function teamCount(deck: Role[], team: Team): number {
	return deck.filter(role => ROLE_DEFS[role].team === team).length;
}

describe("RoleAssignment", () => {
	it("인원수만큼 직업을 배분한다", () => {
		for (let count = 4; count <= 8; count++) {
			assert.equal(buildRoleDeck(count).length, count);
		}
	});

	it("4명은 마피아 진영 1, 8명은 2", () => {
		const rng = () => 0; // 결정적으로: shuffle이 순서만 바꾸고 구성은 유지한다
		// 직업이 아니라 진영으로 센다. 두 번째 마피아 자리는 건달이나 짐승인간이
		// 뽑힐 수 있고, 그래도 마피아 진영이 둘이라는 사실은 달라지지 않는다.
		assert.equal(teamCount(buildRoleDeck(4, rng), Team.MAFIA), 1);
		assert.equal(teamCount(buildRoleDeck(8, rng), Team.MAFIA), 2);
	});

	it("마피아 리더는 항상 한 명 들어간다", () => {
		// 마피아 채팅을 여는 직업이 하나도 없는 판이 나오면 안 된다
		for (let count = 4; count <= 8; count++) {
			const deck = buildRoleDeck(count, () => 0);
			assert.equal(deck.filter(role => role === Role.MAFIA).length, 1, `${count}명`);
		}
	});

	it("능력자를 다 채우고 남은 자리는 시민", () => {
		const deck = buildRoleDeck(10, () => 0);
		assert.equal(deck.filter(role => role === Role.CITIZEN).length, 3);
	});

	it("직업은 중복되지 않는다", () => {
		// 풀에서 뽑기 때문에 같은 특수 직업이 두 번 나오면 안 된다.
		// 평범한 시민만 여럿일 수 있다.
		const deck = buildRoleDeck(8, () => 0).filter(role => role !== Role.CITIZEN);
		assert.equal(new Set(deck).size, deck.length);
	});

	it("의사와 경찰은 항상 들어간다", () => {
		// 정보도 방어도 없는 판은 시민이 이길 방법이 없다
		for (let count = 4; count <= 8; count++) {
			const deck = buildRoleDeck(count, () => 0);
			assert.ok(deck.includes(Role.DOCTOR), `${count}명에 의사가 없다`);
			assert.ok(deck.includes(Role.POLICE), `${count}명에 경찰이 없다`);
		}
	});

	it("첫 밤만으로 게임이 끝나는 덱은 나오지 않는다", () => {
		// 6명 판에 마피아+짐승인간이 뽑히면 첫 밤에 둘이 죽어 2 대 2가 되고,
		// 아침에 곧바로 마피아 승이 선언됐다 — 토론도 투표도 한 번 없이.
		// 인원 구성 자체는 맞았기 때문에 위의 덱 테스트 다섯 개는 전부 통과했다.
		// 세어야 할 것은 마피아의 "인원"이 아니라 첫 밤이 지난 뒤의 진영 격차다.
		// 사망자만 세던 시절에는 스파이의 진영 전환이 이 그물을 그냥 통과했다.
		//
		// 판정은 evaluateWinner에 맡긴다. 승리 조건을 테스트가 다시 적어두면
		// 규칙이 바뀔 때 둘이 조용히 어긋난다.
		for (let count = MIN_PLAYERS; count <= MAX_PLAYERS + 2; count++) {
			for (let trial = 0; trial < 200; trial++) {
				const deck = buildRoleDeck(count);
				const seats = afterWorstFirstNight(deck);
				const alive = seats.filter(s => s.alive);
				assert.equal(
					evaluateWinner(seats),
					null,
					`${count}명 [${deck.join(", ")}] — 첫 밤 뒤 마피아 ${alive.filter(s => s.team === Team.MAFIA).length}`
						+ ` 대 시민 ${alive.filter(s => s.team === Team.CITIZEN).length}로 끝났다`,
				);
			}
		}
	});

	it("최소 인원 판도 매번 같은 구성이 아니다", () => {
		// floor(0.5) = 0이라 4명 판에는 능력자 자리가 없었고, 그래서 구성이
		// 마피아·의사·경찰·시민 하나로 굳어 있었다. 직업을 12개까지 늘려놓고
		// 최소 인원으로 노는 방은 그 중 넷만 영원히 보는 상태였다.
		const compositions = new Set<string>();
		for (let trial = 0; trial < 200; trial++) {
			compositions.add(buildRoleDeck(MIN_PLAYERS).slice().sort().join(","));
		}
		assert.ok(
			compositions.size > 1,
			`${MIN_PLAYERS}명 판의 구성이 [${[...compositions][0]}] 하나뿐이다`,
		);
	});
});

/**
 * 첫 밤이 최악으로 끝난 좌석들 — 의사가 아무도 못 살리고, 공격이 전부
 * 평범한 시민에게 꽂히고, 스파이는 첫 조사에서 하필 마피아를 짚은 상태.
 * 군인의 방탄이나 겹친 표적은 시민에게 유리한 경우이므로 하한을 보려면 빼고 센다.
 *
 * 이 함수는 원래 "밤에 시체가 몇 구 나오는가"만 셌다. 그런데 승패를 가르는
 * 값은 시체 수가 아니라 마진(시민 - 마피아)이고, 마진을 깎는 수단은 살인만이
 * 아니다 — 스파이가 마피아를 찾아내면 아무도 죽지 않은 채로 마진이 2 움직인다
 * (마피아 +1, 시민 -1). 그래서 4·6명 판은 사망자 0명으로 첫 아침에 끝날 수
 * 있었는데도 이 테스트는 통과했다. 시체를 세는 대신 직업마다 "첫 밤에 좌석을
 * 어떻게 바꾸는가"를 그대로 적용하면 새로운 수단이 생겨도 같은 자리에서 잡힌다.
 *
 * 시민 진영이 깎이는 쪽만 본다. 반대 가지(자경단원이 첫 밤에 마피아를
 * 맞혀 시민이 즉시 이기는 경우)는 여기서 모델링하지 않는다 — 지금은
 * needsPriorDay가 첫 밤 사격 자체를 막아 두 가지가 함께 사라지기 때문이다.
 * 첫 밤에 쏠 수 있는 시민 편 공격 직업이 새로 생기면 이 함수도 갈라져야 한다.
 */
function afterWorstFirstNight(deck: Role[]): Seat[] {
	const seats = deck.map((role, i) => seat(i + 1, role));

	// 밀담에 낀 공격자는 몇 명이든 상의해서 한 명만 치므로 통틀어 1,
	// 밀담 밖에서 죽이는 직업은 표적을 맞출 방법이 없으므로 각자 1이다.
	let mafiaChatKill = 0;
	let loneKills = 0;
	for (const actor of seats) {
		const def = ROLE_DEFS[actor.role];
		// 첫 밤에 못 쓰는 능력은 첫 밤 균형을 건드릴 수 없다
		if (def.needsPriorDay) continue;
		if (def.nightAction === NightActionKind.INSPECT_ROLE) {
			// 조사한 사람이 하필 마피아였던 경우. 진영이 통째로 옮겨간다
			actor.team = Team.MAFIA;
		} else if (def.nightAction === NightActionKind.ATTACK) {
			if (def.nightChat === ChatChannel.MAFIA) mafiaChatKill = 1;
			// 자책이 있는 직업이 시민을 쏘면 시전자까지 둘이 사라진다
			else loneKills += def.backfiresOnAlly ? 2 : 1;
		}
	}

	// 진영이 바뀐 뒤에 표적을 고른다 — 마피아가 된 스파이는 밤에 죽지 않는다
	let remaining = mafiaChatKill + loneKills;
	for (const victim of seats) {
		if (remaining === 0) break;
		if (victim.team !== Team.CITIZEN || victim.armored) continue;
		victim.alive = false;
		remaining--;
	}
	return seats;
}

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

	it("공격은 공격자의 번호를 대상에 남긴다", () => {
		const mafia = seat(1, Role.MAFIA);
		const target = seat(2, Role.CITIZEN);
		const result = resolveNightSelect(mafia, target);
		assert.equal(result?.consumed, true);
		assert.deepEqual(target.attackedBy, [1]);
	});

	it("여러 공격자가 같은 사람을 노려도 각자 기록된다", () => {
		// 예전에는 이미 지목된 대상이면 "다른 마피아가 골랐다"며 되돌렸다.
		// 그 문구가 자경단원에게 마피아의 동선을 알려주기 때문에 규칙을 없앴다.
		const target = seat(3, Role.CITIZEN);
		resolveNightSelect(seat(1, Role.MAFIA), target);
		resolveNightSelect(seat(2, Role.BEAST), target);
		assert.deepEqual(target.attackedBy, [1, 2]);
	});

	it("마피아만 총성을 낸다", () => {
		// 공격자마다 소리가 나면 밤마다 소리 횟수로 공격자 수가 샌다
		assert.ok(resolveNightSelect(seat(1, Role.MAFIA), seat(2, Role.CITIZEN))?.roomSound);
		assert.equal(resolveNightSelect(seat(1, Role.VIGILANTE), seat(2, Role.CITIZEN))?.roomSound, undefined);
		assert.equal(resolveNightSelect(seat(1, Role.BEAST), seat(2, Role.CITIZEN))?.roomSound, undefined);
	});

	it("경찰은 짐승인간을 잡지 못하고 건달은 잡는다", () => {
		// 판정 기준은 진영도 직업도 아니라 appearsAsMafia다
		const police = seat(1, Role.POLICE);
		assert.match(resolveNightSelect(police, seat(2, Role.THUG))!.label, /마피아입니다/);
		assert.match(resolveNightSelect(police, seat(3, Role.BEAST))!.label, /마피아가 아닙니다/);
		assert.match(resolveNightSelect(police, seat(4, Role.MAFIA))!.label, /마피아입니다/);
	});

	it("건달이 협박하면 대상의 투표가 막힌다", () => {
		const target = seat(2, Role.CITIZEN);
		const result = resolveNightSelect(seat(1, Role.THUG), target);
		assert.equal(result?.consumed, true);
		assert.equal(target.silenced, true);
	});

	it("기자가 취재하면 대상에 표식이 남는다", () => {
		const target = seat(2, Role.MAFIA);
		const result = resolveNightSelect(seat(1, Role.REPORTER), target);
		assert.equal(result?.consumed, true);
		assert.equal(target.scooped, true);
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

	it("스파이가 건달을 찾아도 합류하지 않는다", () => {
		// 건달은 마피아 팀이지만 채팅에 없다. 합류시키면 대화 상대가 없는
		// 빈 채팅창이 열리고, 스파이는 능력만 아낀 채 아무것도 얻지 못한다.
		const spy = seat(1, Role.SPY);
		const result = resolveNightSelect(spy, seat(2, Role.THUG));
		assert.equal(spy.team, Team.CITIZEN);
		assert.equal(result?.consumed, true);
	});
});

describe("NightResolution - 정산", () => {
	it("치료받으면 살고 아니면 죽는다", () => {
		const casualties = resolveNightCasualties([
			seat(1, Role.CITIZEN, { attackedBy: [9], healed: true }),
			seat(2, Role.POLICE, { attackedBy: [9] }),
			seat(3, Role.DOCTOR),
		]);
		assert.equal(casualties.length, 2);
		assert.equal(casualties[0].outcome, NightOutcome.SAVED);
		assert.equal(casualties[1].outcome, NightOutcome.KILLED);
		assert.equal(casualties[1].seat.index, 2);
	});

	it("군인은 첫 공격을 버티고 방탄을 잃는다", () => {
		const soldier = seat(1, Role.SOLDIER, { attackedBy: [9] });
		assert.equal(soldier.armored, true, "군인은 방탄을 갖고 시작한다");

		const first = resolveNightCasualties([soldier]);
		assert.equal(first[0].outcome, NightOutcome.SHIELDED);
		assert.equal(soldier.armored, false, "방탄이 소모되지 않았다");

		// 다음 밤: 같은 좌석이 또 맞으면 이번엔 죽는다
		soldier.attackedBy = [9];
		assert.equal(resolveNightCasualties([soldier])[0].outcome, NightOutcome.KILLED);
	});

	it("치료가 방탄보다 먼저 쓰인다", () => {
		// 순서가 반대면 의사가 지킨 군인이 방탄을 헛되이 잃는다
		const soldier = seat(1, Role.SOLDIER, { attackedBy: [9], healed: true });
		assert.equal(resolveNightCasualties([soldier])[0].outcome, NightOutcome.SAVED);
		assert.equal(soldier.armored, true, "방탄이 헛되이 소모됐다");
	});

	it("자경단원이 시민을 죽이면 자신도 죽는다", () => {
		const vigilante = seat(1, Role.VIGILANTE);
		const casualties = resolveNightCasualties([
			vigilante,
			seat(2, Role.CITIZEN, { attackedBy: [1] }),
		]);
		assert.equal(casualties.length, 2);
		assert.equal(casualties[0].outcome, NightOutcome.KILLED);
		assert.equal(casualties[1].seat, vigilante);
		assert.equal(casualties[1].outcome, NightOutcome.BACKFIRED);
	});

	it("자경단원이 마피아를 죽이면 멀쩡하다", () => {
		const casualties = resolveNightCasualties([
			seat(1, Role.VIGILANTE),
			seat(2, Role.MAFIA, { attackedBy: [1] }),
		]);
		assert.equal(casualties.length, 1);
		assert.equal(casualties[0].outcome, NightOutcome.KILLED);
	});

	it("쏜 시민이 살아나면 자책하지 않는다", () => {
		// 자책은 "쐈다"가 아니라 "죽였다"에 걸린다
		for (const rescued of [{ healed: true }, { armored: true }]) {
			const casualties = resolveNightCasualties([
				seat(1, Role.VIGILANTE),
				seat(2, Role.CITIZEN, { attackedBy: [1], ...rescued }),
			]);
			assert.equal(casualties.length, 1, JSON.stringify(rescued));
			assert.notEqual(casualties[0].outcome, NightOutcome.KILLED);
		}
	});

	it("마피아와 자경단원이 같은 시민을 노리면 자경단원도 죽는다", () => {
		// 누가 결정타였는지 가릴 방법이 없다. 방아쇠를 당긴 이상 책임진다.
		const vigilante = seat(1, Role.VIGILANTE);
		const casualties = resolveNightCasualties([
			vigilante,
			seat(2, Role.MAFIA),
			seat(3, Role.CITIZEN, { attackedBy: [2, 1] }),
		]);
		assert.equal(casualties.length, 2);
		assert.equal(casualties[1].seat, vigilante);
		assert.equal(casualties[1].outcome, NightOutcome.BACKFIRED);
	});

	it("이미 죽은 자경단원은 자책하지 않는다", () => {
		// 같은 밤에 마피아에게 당했다면 사망 처리가 두 번 나가면 안 된다
		const casualties = resolveNightCasualties([
			seat(1, Role.VIGILANTE, { attackedBy: [9] }),
			seat(2, Role.CITIZEN, { attackedBy: [1] }),
		]);
		assert.equal(casualties.length, 2);
		assert.equal(casualties.filter(c => c.seat.index === 1).length, 1);
	});

	it("공격받지 않은 사람은 목록에 없다", () => {
		assert.equal(resolveNightCasualties([seat(1, Role.CITIZEN), seat(2, Role.MAFIA)]).length, 0);
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

/**
 * 직업 테이블 자체의 불변식.
 *
 * 직업 추가는 ROLE_DEFS에 항목 하나를 넣는 일이고, 타입은 필드가 다 찼는지까지만
 * 본다. "지목은 있는데 안내 문구가 없다" 같은 조합은 컴파일을 통과하고 밤에 빈
 * 화면으로 나타난다. 여기서 잡으면 항목을 쓰는 순간 잡힌다.
 */
describe("ROLE_DEFS", () => {
	const roles = Object.keys(ROLE_DEFS) as Role[];

	it("밤에 지목이 있는 직업은 안내 문구가 있다", () => {
		for (const role of roles) {
			const def = ROLE_DEFS[role];
			if (def.nightAction !== null) {
				assert.ok(def.nightPrompt, `${role}에 nightPrompt가 없다`);
			}
		}
	});

	it("지목이 없는 직업에는 안내 문구도 없다", () => {
		for (const role of roles) {
			const def = ROLE_DEFS[role];
			if (def.nightAction === null) {
				assert.equal(def.nightPrompt, null, `${role}은 지목이 없는데 nightPrompt가 있다`);
			}
		}
	});

	it("모든 직업에 카드에 쓸 이름·기호·설명이 있다", () => {
		for (const role of roles) {
			const def = ROLE_DEFS[role];
			assert.ok(def.displayName, `${role}에 displayName이 없다`);
			assert.ok(def.glyph, `${role}에 glyph가 없다`);
			assert.ok(def.ability, `${role}에 ability가 없다`);
			assert.ok(def.tip, `${role}에 tip이 없다`);
		}
	});

	it("한글 이름은 겹치지 않는다", () => {
		// 위젯은 이름만 보여준다. 겹치면 플레이어가 구분할 방법이 없다
		const names = roles.map(role => ROLE_DEFS[role].displayName);
		assert.equal(new Set(names).size, names.length);
	});

	it("마피아 팀인데 채팅이 없는 직업은 혼자라는 안내를 받는다", () => {
		// 안내가 없으면 "왜 나만 채팅창이 없지"로 끝난다
		for (const role of roles) {
			const def = ROLE_DEFS[role];
			if (def.team !== Team.MAFIA || def.nightChat !== null) continue;
			assert.match(def.nightNotice, /마피아 팀/, `${role}에 진영 안내가 없다`);
		}
	});
});
