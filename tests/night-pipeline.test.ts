/**
 * 밤 파이프라인 테스트.
 *
 * 이 파일이 지키는 것은 둘이다.
 *   1. 밤의 결과가 클릭 순서에 의존하지 않는다. 의사가 늦게 눌러도 결과가
 *      같은 것은 resolveNightCasualties가 밤 끝에 한 번만 보기 때문이지
 *      순서를 정했기 때문이 아니다. 차단(BLOCK)이 들어오면서 그 우연은
 *      깨졌다.
 *   2. 밤 능력이 **조용히** 빠지는 길이 없다. step을 순회 목록에서 빠뜨리거나
 *      능력 종류에 가지를 안 다는 실수는 에러도 실패도 내지 않고 그 능력을
 *      없던 것으로 만든다. 아래 「목록의 완전성」이 그 둘을 잡는다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role, Team } from "../src/types/Game.types.ts";
import type { Seat } from "../src/types/Game.types.ts";
import { NightActionKind, NightStep, ROLE_DEFS } from "../src/domain/Roles.ts";
import { NightOutcome } from "../src/domain/NightResolution.ts";
import type { NightIntent, NightSettlement } from "../src/domain/NightPipeline.ts";
import { putIntent, resolveNightIntents, STEP_ORDER } from "../src/domain/NightPipeline.ts";
import { seat } from "./helpers/seat.ts";

/** 밤을 한 번 돌린다. intents는 클릭 순서대로 준다 */
function night(seats: Seat[], clicks: Array<[number, number]>, skipAttacks = false) {
	const intents: NightIntent[] = [];
	for (const [actor, target] of clicks) putIntent(intents, actor, target);
	return resolveNightIntents(seats, intents, { skipAttacks });
}

/**
 * 밤이 좌석에 남긴 것 전부.
 *
 * 한 필드만 비교하면 순서가 새는 자리를 놓친다. 이 슬라이스가 지키는 명제는
 * "결과가 같다"이지 "이 플래그가 켜졌다"가 아니다.
 */
function snapshot(seats: readonly Seat[]) {
	return seats.map(s => ({
		index: s.index,
		alive: s.alive,
		healed: s.healed,
		armored: s.armored,
		blocked: s.blocked,
		scooped: s.scooped,
		attackedBy: s.attackedBy.slice(),
	}));
}

/** 사망 판정을 비교하기 좋은 모양으로 */
function outcomes(settlement: NightSettlement) {
	return settlement.casualties.map(c => [c.seat.index, c.outcome]);
}

/** 파이프라인이 이 좌석에 아무것도 남기지 않았다 */
function noTrace(target: Seat) {
	assert.equal(target.healed, false);
	assert.deepEqual(target.attackedBy, []);
	assert.equal(target.blocked, false);
	assert.equal(target.scooped, false);
}

/**
 * 능력 종류 하나가 대상에 남기는 흔적.
 *
 * Record<NightActionKind, …>라 종류를 늘리면 여기에 줄을 넣기 전까지 이 파일이
 * 컴파일되지 않는다. apply(NightPipeline.ts)의 switch도 default를 두지 않아
 * 같은 순간 막힌다 — 새 밤 능력이 아무 소리 없이 아무 일도 하지 않는 길을
 * 타입과 테스트 양쪽에서 닫는다.
 */
const TRACE_BY_KIND: Record<
	NightActionKind,
	{
		actor: Role;
		/** 시전자에게 미리 심어 둘 상태. 없으면 팩토리 기본값 */
		actorSetup?: Partial<Seat>;
		/** 대상의 직업. 없으면 시민 */
		targetRole?: Role;
		/** 대상에게 미리 심어 둘 상태. 영매·성직자처럼 시체를 부르는 능력이 쓴다 */
		targetSetup?: Partial<Seat>;
		check: (target: Seat, settlement: NightSettlement, actor: Seat) => void;
	}
> = {
	HEAL: { actor: Role.DOCTOR, check: t => assert.equal(t.healed, true) },
	ATTACK: { actor: Role.MAFIA, check: t => assert.deepEqual(t.attackedBy, [1]) },
	SCOOP: { actor: Role.REPORTER, check: t => assert.equal(t.scooped, true) },
	// 조사의 답은 대상이 아니라 시전자에게 간다(reveals). 대상은 자기가
	// 조사당한 것을 알 수 없어야 하므로 여기 남는 흔적이 없는 것이 맞다.
	// 답 자체는 「밤 파이프라인 — 조사 결과」가 본다
	INSPECT_TEAM: { actor: Role.POLICE, check: noTrace },
	INSPECT_ROLE: { actor: Role.SPY, check: noTrace },
	INSPECT_ABILITY: { actor: Role.SEER, check: noTrace },
	// 쪽지도 대상 좌석에는 아무것도 남기지 않는다. 흔적이 남으면 "쪽지를
	// 받았다"가 다음 밤의 다른 능력에 새어 나간다.
	//
	// 문구를 미리 심어 두지 않으면 apply가 첫 줄에서 돌아 나가 이 행이
	// 아무것도 안 지키는 통과가 된다. 그래서 배달까지 함께 본다
	NOTE: {
		actor: Role.CITIZEN,
		actorSetup: { noteText: "당신을 믿습니다" },
		check: (target, settlement) => {
			noTrace(target);
			assert.deepEqual(
				settlement.reveals.map(r => r.seat),
				[2],
				"쪽지가 배달되지 않았다 — 이 행은 아무것도 지키지 못한다"
			);
		},
	},
	// 유혹은 두 흔적을 남긴다. 하나만 보면 수명이 다른 두 값 중 하나가
	// 조용히 빠져도 이 행이 통과한다
	SEDUCE: {
		actor: Role.MADAM,
		check: t => {
			assert.equal(t.blocked, true);
			assert.equal(t.seduced, true);
		},
	},
	// 협박은 밤을 건드리지 않는다. blocked가 함께 켜지면 낮의 능력이
	// 밤의 능력까지 빼앗는 셈이라 건달이 마담의 상위 직업이 된다
	INTIMIDATE: {
		actor: Role.THUG,
		check: t => {
			assert.equal(t.intimidated, true);
			assert.equal(t.blocked, false);
		},
	},
	// 훔치기가 남기는 곳은 대상이 아니라 시전자다. 대상에 흔적이 남으면
	// "도둑에게 능력을 빼앗겼다"가 다음 밤에 새어 나간다
	STEAL: {
		actor: Role.THIEF,
		check: (target, _settlement, actor) => {
			noTrace(target);
			assert.equal(actor.borrowedRole, Role.CITIZEN);
		},
	},
	// 미행도 조사다. 흔적은 없지만 시전자에게 답이 가야 한다
	TRACK: {
		actor: Role.DETECTIVE,
		check: (target, settlement) => {
			noTrace(target);
			assert.deepEqual(settlement.reveals.map(r => r.seat), [1]);
		},
	},
	// 자폭은 attackedBy를 거치지 않는 유일한 사망 경로다. 대상에 공격
	// 흔적이 남으면 의사가 막을 수 있게 되어 확정 사망이 아니게 된다
	MARK: {
		actor: Role.TERRORIST,
		check: (target, settlement) => {
			noTrace(target);
			assert.deepEqual(settlement.casualties.map(c => [c.seat.index, c.outcome]), [
				[1, NightOutcome.EXPLODED],
				[2, NightOutcome.BOMBED],
			]);
		},
	},
	// 접선 전 짐승인간은 물지 못한다. 마피아가 같은 사람을 노리지 않은
	// 밤이라 헛짚음이 맞다 — 여기서 물면 접선 조건이 없는 것과 같다
	STALK: {
		actor: Role.BEAST,
		check: (target, settlement, actor) => {
			noTrace(target);
			assert.equal(actor.contacted, false);
			assert.deepEqual(settlement.defected, []);
		},
	},
	// 성불은 시체에만 통한다. 산 사람을 대상으로 두면 이 행이 실제 쓰임과
	// 다른 상황을 지키게 된다
	SEANCE: {
		actor: Role.SHAMAN,
		targetSetup: { alive: false },
		check: t => assert.equal(t.exorcised, true),
	},
	// 소생은 좌석을 직접 되돌리지 않는다. 결말만 쌓고 실제로 살리는 것은
	// 파이프라인 밖의 서비스다 — 그 경계가 여기서 고정된다
	REVIVE: {
		actor: Role.PRIEST,
		targetSetup: { alive: false },
		check: (target, settlement) => {
			assert.equal(target.alive, false);
			assert.deepEqual(settlement.casualties.map(c => [c.seat.index, c.outcome]), [
				[2, NightOutcome.REVIVED],
			]);
		},
	},
};

describe("밤 파이프라인 — 클릭 순서", () => {
	it("의사가 마피아보다 늦게 눌러도 대상이 산다", () => {
		// 이 판정이 이 슬라이스의 존재 이유다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.DOCTOR), seat(3, Role.CITIZEN)];
		const late = night(seats, [[1, 3], [2, 3]]);
		assert.equal(late.casualties.length, 1);
		assert.equal(late.casualties[0].outcome, NightOutcome.SAVED);
	});

	it("클릭 순서를 뒤집어도 밤이 남긴 상태 전부가 같다", () => {
		// 마피아·짐승인간·의사가 모두 4번을 고른다. 순서가 새면 attackedBy의
		// 적재 순서나 치료의 적용 시점이 갈린다
		const roles = [Role.MAFIA, Role.BEAST, Role.DOCTOR, Role.CITIZEN];
		const first = roles.map((role, i) => seat(i + 1, role));
		const second = roles.map((role, i) => seat(i + 1, role));
		const a = night(first, [[1, 4], [2, 4], [3, 4]]);
		const b = night(second, [[3, 4], [2, 4], [1, 4]]);

		assert.deepEqual(snapshot(first), snapshot(second));
		assert.deepEqual(outcomes(a), outcomes(b));
		// 빈 상태끼리 비교해 놓고 통과하는 일이 없도록, 비교 대상이 실제로
		// 무언가를 담고 있음을 함께 못 박는다
		assert.deepEqual(first[3].attackedBy, [1, 2]);
		assert.deepEqual(outcomes(a), [[4, NightOutcome.SAVED]]);
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
		// 순서를 보는 관측은 healed 플래그가 아니라 정산 결과다. PROTECT(30)가
		// DEATH(50)보다 뒤에 있었다면 정산이 healed를 보지 못해 KILLED가 된다
		const seats = [seat(1, Role.DOCTOR), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 3], [2, 3]]);
		assert.equal(seats[2].healed, true);
		assert.deepEqual(outcomes(result), [[3, NightOutcome.SAVED]]);
		assert.ok(STEP_ORDER.indexOf(NightStep.PROTECT) < STEP_ORDER.indexOf(NightStep.DEATH));
	});

	it("자경단원 자책은 DEATH step에서 일어난다", () => {
		const seats = [seat(1, Role.VIGILANTE), seat(2, Role.CITIZEN)];
		const result = night(seats, [[1, 2]]);
		const list = result.casualties.map(c => c.outcome);
		assert.ok(list.includes(NightOutcome.KILLED));
		assert.ok(list.includes(NightOutcome.BACKFIRED));
	});

	it("취재는 사망 확정 뒤에 걸린다", () => {
		// "뒤"를 확인하려면 두 가지가 함께 필요하다 — 직업이 AFTER에 있다는 것과,
		// AFTER가 순회에서 DEATH 뒤에 선다는 것. 앞의 것만으로는 AFTER가 어디에
		// 서는지 알 수 없다.
		assert.equal(ROLE_DEFS[Role.REPORTER].nightStep, NightStep.AFTER);
		assert.ok(STEP_ORDER.indexOf(NightStep.AFTER) > STEP_ORDER.indexOf(NightStep.DEATH));

		// 흔적 자체는 오늘 순서와 무관하다 — 정산이 scooped를 읽지 않기
		// 때문이다. 순서가 결과를 실제로 가르는 것은 차단이 걸릴 때다
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
		assert.deepEqual(outcomes(result), [[2, NightOutcome.KILLED]]);
		assert.equal(seats[2].scooped, true);
	});
});

describe("밤 파이프라인 — 목록의 완전성", () => {
	it("모든 직업의 nightStep이 STEP_ORDER에 들어 있다", () => {
		// step이 순회 목록에서 빠지면 그 step의 직업은 아무 소리 없이 실행되지
		// 않는다. 타입 쪽에도 같은 방어가 있지만(StepOrderCoversEveryStep) 그쪽이
		// 잡는 것은 "NightStep을 늘리고 목록에 안 넣었다"이고, 이쪽이 잡는 것은
		// "목록 자체를 잘못 고쳤다"이다.
		for (const role of Object.keys(ROLE_DEFS) as Role[]) {
			const step = ROLE_DEFS[role].nightStep;
			assert.ok(
				STEP_ORDER.indexOf(step) >= 0,
				`${role}의 nightStep(${step})이 STEP_ORDER에 없다 — 이 직업의 밤 능력은 실행되지 않는다`
			);
		}
	});

	it("STEP_ORDER는 NightStep 숫자값 오름차순이다", () => {
		// 숫자값(20/30/…)과 배열이 각각 따로 순서를 주장하므로 어긋날 수 있다.
		// 정렬로 하나를 없애는 길은 Jint의 sort 안정성 때문에 막혀 있으니,
		// 대신 어긋남을 여기서 잡는다
		for (let i = 1; i < STEP_ORDER.length; i++) {
			assert.ok(
				STEP_ORDER[i - 1] < STEP_ORDER[i],
				`STEP_ORDER[${i - 1}]=${STEP_ORDER[i - 1]}가 STEP_ORDER[${i}]=${STEP_ORDER[i]}보다 뒤에 있다`
			);
		}
	});

	it("능력 종류마다 대상에 남기는 흔적이 정해져 있다", () => {
		for (const kind of Object.keys(TRACE_BY_KIND) as NightActionKind[]) {
			const row = TRACE_BY_KIND[kind];
			// 표가 실제 직업 정의와 어긋나면 아래 검사는 다른 능력을 보게 된다
			assert.equal(ROLE_DEFS[row.actor].nightAction, kind);
			const targetRole = row.targetRole === undefined ? Role.CITIZEN : row.targetRole;
			const seats = [seat(1, row.actor, row.actorSetup), seat(2, targetRole, row.targetSetup)];
			const settlement = night(seats, [[1, 2]]);
			row.check(seats[1], settlement, seats[0]);
		}
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
		// "이 좌석의 intent는 하나"에 조회가 기대기 때문에 못 박아 둔다 —
		// 밀어 넣기만 하면 조회가 조용히 첫 지목을 답한다. 두 번째 지목이
		// 오는 길은 실제로 있다: 쪽지의 첫 클릭은 usedSkill을 세우지 않는다
		const intents: NightIntent[] = [];
		putIntent(intents, 1, 5);
		putIntent(intents, 2, 6);
		putIntent(intents, 1, 7);
		assert.deepEqual(intents, [{ actor: 1, target: 7 }, { actor: 2, target: 6 }]);
	});

	it("두 좌석이 같은 대상을 골라도 지목은 둘 다 남는다", () => {
		// 교체는 시전자 단위다. 대상이 겹친다고 하나로 합쳐지면 마피아와
		// 짐승인간이 같은 사람을 노린 밤에 공격자 하나가 사라진다
		const intents: NightIntent[] = [];
		putIntent(intents, 1, 3);
		putIntent(intents, 2, 3);
		assert.deepEqual(intents, [{ actor: 1, target: 3 }, { actor: 2, target: 3 }]);

		const seats = [seat(1, Role.MAFIA), seat(2, Role.BEAST), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 3], [2, 3]]);
		assert.deepEqual(seats[2].attackedBy, [1, 2]);
		assert.deepEqual(outcomes(result), [[3, NightOutcome.KILLED]]);
	});

	it("자기 자신을 지목해도 막지 않는다 (관측한 동작)", () => {
		// **설계된 규칙이 아니라 오늘의 동작을 못 박는 것이다.** 자기 지목을
		// 막는 가드는 어디에도 없다 — recordNightIntent에도, Night.ts의 클릭
		// 경로에도, 밤 위젯에도(자기 타일은 죽었을 때만 비활성화된다).
		// 파이프라인도 actor === target을 특별 취급하지 않는다.
		const mafia = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN)];
		const shot = night(mafia, [[1, 1]]);
		assert.deepEqual(mafia[0].attackedBy, [1]);
		assert.deepEqual(outcomes(shot), [[1, NightOutcome.KILLED]]);

		// 의사의 자가 치료도 그대로 걸린다
		const doctor = [seat(1, Role.MAFIA), seat(2, Role.DOCTOR)];
		const saved = night(doctor, [[1, 2], [2, 2]]);
		assert.equal(doctor[1].healed, true);
		assert.deepEqual(outcomes(saved), [[2, NightOutcome.SAVED]]);

		// 자경단원이 자기를 쏘면 자책은 따로 기록되지 않는다. 이미 사망자
		// 목록에 있는 좌석이라 hasCasualty가 두 번째 항목을 막는다
		const vigilante = [seat(1, Role.VIGILANTE), seat(2, Role.CITIZEN)];
		assert.deepEqual(outcomes(night(vigilante, [[1, 1]])), [[1, NightOutcome.KILLED]]);
	});
});

describe("밤 파이프라인 — 조사 결과", () => {
	it("경찰의 답은 reveals로 나온다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.MAFIA)];
		const result = night(seats, [[1, 2]]);
		assert.equal(result.reveals.length, 1);
		assert.equal(result.reveals[0].seat, 1);
		assert.match(result.reveals[0].line, /마피아입니다/);
	});

	it("경찰은 짐승인간을 잡지 못한다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.BEAST)];
		const result = night(seats, [[1, 2]]);
		assert.match(result.reveals[0].line, /마피아가 아닙니다/);
	});

	it("경찰은 건달도 마피아로 보지 못한다", () => {
		// 짐승인간과 갈라지는 이유가 다르다 — 짐승인간은 마피아 팀이면서
		// 위장으로 빠져나가고, 건달은 애초에 시민이라 잡을 것이 없다.
		// 클릭 시점 라벨을 보던 domain 테스트가 지키던 판정을 여기로 옮겨 왔다
		const seats = [seat(1, Role.POLICE), seat(2, Role.THUG)];
		const result = night(seats, [[1, 2]]);
		assert.match(result.reveals[0].line, /마피아가 아닙니다/);
	});

	it("그 밤에 죽은 경찰도 답을 받는다", () => {
		// 조사(INSPECT)는 사망 확정(DEATH)보다 뒤다. 마지막으로 알아낸 것을
		// 삼키면 영매를 통해 나올 정보 하나가 그냥 사라진다.
		//
		// 죽음은 alive가 아니라 사망자 목록으로 본다 — 파이프라인은 판정만 하고
		// 좌석을 내리는 것은 서비스(kill)의 몫이라 이 시점에 alive는 아직 true다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.POLICE), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 2], [2, 1]]);
		assert.deepEqual(outcomes(result), [[2, NightOutcome.KILLED]]);
		assert.equal(result.reveals.length, 1);
		assert.equal(result.reveals[0].seat, 2);
		assert.match(result.reveals[0].line, /마피아입니다/);
	});

	it("조사 대상이 그 밤에 죽어도 답은 같다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.MAFIA), seat(3, Role.VIGILANTE)];
		const result = night(seats, [[1, 2], [3, 2]]);
		assert.deepEqual(outcomes(result), [[2, NightOutcome.KILLED]]);
		assert.match(result.reveals[0].line, /마피아입니다/);
	});

	it("스파이가 마피아를 찾으면 진영이 바뀌고 defected에 남는다", () => {
		const seats = [seat(1, Role.SPY), seat(2, Role.MAFIA)];
		const result = night(seats, [[1, 2]]);
		assert.equal(seats[0].team, Team.MAFIA);
		assert.deepEqual(result.defected, [1]);
		assert.match(result.reveals[0].line, /합류/);
	});

	it("스파이가 짐승인간을 찾아도 합류하지 않는다", () => {
		// 대화 상대가 없는 짐승인간을 찾아낸 것으로 마피아 채팅이 열릴 수는 없다
		const seats = [seat(1, Role.SPY), seat(2, Role.BEAST)];
		const result = night(seats, [[1, 2]]);
		assert.equal(seats[0].team, Team.CITIZEN);
		assert.deepEqual(result.defected, []);
		assert.match(result.reveals[0].line, /짐승인간/);
	});

	it("스파이가 건달을 찾아도 합류하지 않는다", () => {
		// 짐승인간과 막히는 지점이 다르다 — 저쪽은 진영이 같은데 채팅이 없고,
		// 건달은 진영부터 시민이다. 조건이 곱해진 것이므로 둘 다 남긴다
		const seats = [seat(1, Role.SPY), seat(2, Role.THUG)];
		const result = night(seats, [[1, 2]]);
		assert.equal(seats[0].team, Team.CITIZEN);
		assert.deepEqual(result.defected, []);
		assert.match(result.reveals[0].line, /건달/);
	});

	it("합류하는 스파이를 쏜 자경단원은 자책한다", () => {
		// 진영이 바뀌는 시점이 클릭에서 조사(INSPECT)로 밀리면서 달라진 판정이다.
		// 사망 확정(DEATH)이 조사보다 앞이므로, 총을 맞는 순간의 스파이는 아직
		// 시민이다. 예전에는 클릭 즉시 마피아가 되어 자경단원이 멀쩡했다.
		//
		// **이것은 관측이 아니라 규칙이다.** 총을 쏜 시점의 진영으로 본다 —
		// 같은 밤의 합류는 그 총알보다 나중에 밝혀지는 사실이지 쏠 때 이미
		// 참이던 사실이 아니다. 자경단원은 그날 밤 스파이가 무엇을 알아냈는지
		// 알 길이 없고, 알 수 없는 것으로 자기 생사가 갈리면 그건 추리가 아니라
		// 운이다. 뒤집으려면 INSPECT를 DEATH 앞으로 옮겨야 하는데, 그러면
		// "그 밤에 죽은 경찰도 답을 받는다"부터 조사·정산 전반이 함께 흔들린다.
		// STEP_ORDER는 컴파일 타임에 고정돼 있어(StepOrderCoversEveryStep)
		// 한 밤 안에서 순서가 뒤집히는 경우 자체가 존재하지 않는다.
		assert.ok(
			STEP_ORDER.indexOf(NightStep.DEATH) < STEP_ORDER.indexOf(NightStep.INSPECT),
			"DEATH가 INSPECT보다 앞이라는 것이 이 판정의 유일한 근거다"
		);
		const seats = [seat(1, Role.SPY), seat(2, Role.VIGILANTE), seat(3, Role.MAFIA)];
		const result = night(seats, [[1, 3], [2, 1]]);
		assert.deepEqual(outcomes(result), [
			[1, NightOutcome.KILLED],
			[2, NightOutcome.BACKFIRED],
		]);
		// 그래도 조사는 끝까지 간다 — 죽은 뒤에도 합류와 답은 남는다
		assert.deepEqual(result.defected, [1]);
		assert.match(result.reveals[0].line, /합류/);
	});

	it("어젯밤 합류한 스파이를 쏜 자경단원은 멀쩡하다", () => {
		// 위 테스트의 짝이다. 둘을 함께 두어야 자책의 원인이 "스파이를 쐈다"가
		// 아니라 "합류가 아직 일어나지 않았다"임이 드러난다. 하나만 있으면
		// 스파이라는 직업 자체가 자책 대상인 것처럼 읽힌다.
		//
		// 어제 합류한 스파이는 이미 team이 MAFIA다. 오늘 밤에는 조사하지
		// 않으므로 INSPECT에서 바뀌는 것도 없다 — 총을 맞는 순간 마피아이고,
		// 자책 판정은 그것만 본다
		const seats = [seat(1, Role.SPY, { team: Team.MAFIA }), seat(2, Role.VIGILANTE)];
		const result = night(seats, [[2, 1]]);
		assert.deepEqual(outcomes(result), [[1, NightOutcome.KILLED]]);
		assert.deepEqual(result.defected, []);
	});

	it("아무도 조사하지 않은 밤의 reveals는 비어 있다", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN)];
		const result = night(seats, [[1, 2]]);
		assert.deepEqual(result.reveals, []);
		assert.deepEqual(result.defected, []);
	});
});
