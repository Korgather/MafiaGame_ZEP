/**
 * 밤 파이프라인 테스트.
 *
 * 이 파일이 지키는 것은 하나다: 밤의 결과가 클릭 순서에 의존하지 않는다.
 * 지금은 의사가 늦게 눌러도 결과가 같지만 그건 resolveNightCasualties가
 * 밤 끝에 한 번만 보기 때문이지 순서를 정했기 때문이 아니다.
 * 차단(BLOCK)이 들어오면 그 우연이 깨진다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role } from "../src/types/Game.types.ts";
import type { Seat } from "../src/types/Game.types.ts";
import { NightStep, ROLE_DEFS } from "../src/domain/Roles.ts";
import { NightOutcome } from "../src/domain/NightResolution.ts";
import type { NightIntent } from "../src/domain/NightPipeline.ts";
import { putIntent, resolveNightIntents } from "../src/domain/NightPipeline.ts";
import { seat } from "./helpers/seat.ts";

/** 밤을 한 번 돌린다. intents는 클릭 순서대로 준다 */
function night(seats: Seat[], clicks: Array<[number, number]>, skipAttacks = false) {
	const intents: NightIntent[] = [];
	for (const [actor, target] of clicks) putIntent(intents, actor, target);
	return resolveNightIntents(seats, intents, { skipAttacks });
}

describe("밤 파이프라인 — 클릭 순서", () => {
	it("의사가 마피아보다 늦게 눌러도 대상이 산다", () => {
		// 이 판정이 이 슬라이스의 존재 이유다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.DOCTOR), seat(3, Role.CITIZEN)];
		const late = night(seats, [[1, 3], [2, 3]]);
		assert.equal(late.casualties.length, 1);
		assert.equal(late.casualties[0].outcome, NightOutcome.SAVED);
	});

	it("클릭 순서를 뒤집어도 결과가 같다", () => {
		const first = [seat(1, Role.MAFIA), seat(2, Role.DOCTOR), seat(3, Role.CITIZEN)];
		const second = [seat(1, Role.MAFIA), seat(2, Role.DOCTOR), seat(3, Role.CITIZEN)];
		const a = night(first, [[1, 3], [2, 3]]);
		const b = night(second, [[2, 3], [1, 3]]);
		assert.equal(a.casualties.length, b.casualties.length);
		assert.equal(a.casualties[0].outcome, b.casualties[0].outcome);
		assert.equal(first[2].alive, second[2].alive);
	});

	it("공격자 번호는 좌석 순서대로 쌓인다", () => {
		// sort를 쓰지 않는다. 좌석 배열 순회가 곧 좌석 번호 순서다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.BEAST), seat(3, Role.CITIZEN)];
		night(seats, [[2, 3], [1, 3]]);
		assert.deepEqual(seats[2].attackedBy, [1, 2]);
	});
});

describe("밤 파이프라인 — step 배치", () => {
	it("치료는 사망 확정보다 먼저 적용된다", () => {
		const seats = [seat(1, Role.DOCTOR), seat(2, Role.CITIZEN)];
		night(seats, [[1, 2]]);
		assert.equal(seats[1].healed, true);
	});

	it("자경단원 자책은 DEATH step에서 일어난다", () => {
		const seats = [seat(1, Role.VIGILANTE), seat(2, Role.CITIZEN)];
		const result = night(seats, [[1, 2]]);
		const outcomes = result.casualties.map(c => c.outcome);
		assert.ok(outcomes.includes(NightOutcome.KILLED));
		assert.ok(outcomes.includes(NightOutcome.BACKFIRED));
	});

	it("협박과 취재는 사망 확정 뒤에 걸린다", () => {
		// AFTER에 두는 이유: 협박은 다음 낮에 작용하므로 이미 죽은 사람을
		// 협박하는 낭비가 없어야 한다
		assert.equal(ROLE_DEFS[Role.THUG].nightStep, NightStep.AFTER);
		assert.equal(ROLE_DEFS[Role.REPORTER].nightStep, NightStep.AFTER);
		const seats = [seat(1, Role.REPORTER), seat(2, Role.MAFIA)];
		night(seats, [[1, 2]]);
		assert.equal(seats[1].scooped, true);
	});

	it("밤 시작 시점에 이미 죽어 있던 좌석의 지목은 버린다", () => {
		const seats = [seat(1, Role.MAFIA, { alive: false }), seat(2, Role.CITIZEN)];
		const result = night(seats, [[1, 2]]);
		assert.deepEqual(seats[1].attackedBy, []);
		assert.equal(result.casualties.length, 0);
	});

	it("그 밤에 죽은 기자의 특종은 그대로 나간다", () => {
		// 취재는 AFTER라 사망 확정보다 뒤다. 그 시점에 "살아 있는가"를 다시
		// 읽으면 방금 죽은 기자의 특종이 사라진다 — 지금 동작에서는 나가는 것이고,
		// wasAlive 스냅숏이 그것을 지킨다.
		//
		// alive가 아니라 사망자 목록으로 죽음을 확인한다. resolveNightCasualties는
		// 판정만 하고 좌석을 내리지 않는다 — 실제 사망 처리는 서비스(kill)의 몫이라
		// 파이프라인이 끝난 시점에도 seat.alive는 아직 true다.
		const seats = [seat(1, Role.MAFIA), seat(2, Role.REPORTER), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 2], [2, 3]]);
		assert.deepEqual(
			result.casualties.map(c => [c.seat.index, c.outcome]),
			[[2, NightOutcome.KILLED]]
		);
		assert.equal(seats[2].scooped, true);
	});
});

describe("밤 파이프라인 — 첫 밤 무사", () => {
	it("skipAttacks면 공격이 기록되지 않고 아무도 죽지 않는다", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN)];
		const result = night(seats, [[1, 2]], true);
		assert.deepEqual(seats[1].attackedBy, []);
		assert.equal(result.casualties.length, 0);
		assert.equal(seats[1].alive, true);
	});

	it("skipAttacks여도 군인의 방탄은 남는다", () => {
		// attackedBy가 비어 있으므로 resolveNightCasualties가 방탄을 볼 일이 없다.
		// S0에서 별도 분기로 막았던 문제가 여기서는 구조적으로 생기지 않는다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.SOLDIER)];
		night(seats, [[1, 2]], true);
		assert.equal(seats[1].armored, true);
	});

	it("skipAttacks여도 취재는 나간다", () => {
		const seats = [seat(1, Role.REPORTER), seat(2, Role.MAFIA)];
		night(seats, [[1, 2]], true);
		assert.equal(seats[1].scooped, true);
	});
});

describe("putIntent", () => {
	it("같은 좌석이 다시 지목하면 교체한다", () => {
		// 스파이는 마피아를 찾으면 능력을 소모하지 않아 같은 밤에 또 지목한다.
		// 밀어 넣기만 하면 "이 좌석의 intent"가 둘이 되어 조회가 모호해진다
		const intents: NightIntent[] = [];
		putIntent(intents, 1, 5);
		putIntent(intents, 2, 6);
		putIntent(intents, 1, 7);
		assert.deepEqual(intents, [{ actor: 1, target: 7 }, { actor: 2, target: 6 }]);
	});
});
