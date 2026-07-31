/**
 * 밤 정산 파이프라인.
 *
 * 지금까지 밤 능력은 클릭한 순간에 대상의 상태를 바꿨다. 능력이 서로를
 * 건드리지 않는 동안에는 그래도 됐다 — healed도 attackedBy도 밤이 끝날 때
 * resolveNightCasualties가 한 번만 읽었기 때문이다.
 *
 * 능력을 막는 능력이 들어오면 그 전제가 무너진다. "막는다"는 다른 능력이
 * 적용되기 전에 서야 하는데, 클릭 시점 적용에서는 누가 먼저 눌렀는지가
 * 그 순서를 정한다. 즉 밤의 결과가 손 빠르기로 갈린다.
 *
 * 그래서 클릭은 의도(intent)만 남기고, 적용은 밤이 끝날 때 정해진 순서로
 * 한 번에 한다. 이 파일이 그 순서다.
 *
 * 사망 정산(resolveNightCasualties)은 고치지 않고 그대로 부른다. 치유·방탄·
 * 자책의 우선순위는 이미 검증되어 있고, 파이프라인이 바꾸는 것은 "그 함수가
 * 보는 상태를 언제 만드는가"뿐이다.
 */
import type { Seat } from "../types/Game.types.ts";
import { NightActionKind, NightStep, roleDef } from "./Roles.ts";
import type { NightCasualty } from "./NightResolution.ts";
import { resolveNightCasualties } from "./NightResolution.ts";

/** 누가 누구를 지목했는가. 좌석 index 두 개 */
export interface NightIntent {
	readonly actor: number;
	readonly target: number;
}

/*
 * 종류를 담지 않는다. 무슨 능력인지는 actor의 직업에서 읽으면 되고,
 * 중복 저장하면 둘이 어긋날 자리가 생긴다.
 */

/** 아침 직전에 한 좌석에게만 전할 한 줄 */
export interface NightReveal {
	readonly seat: number;
	readonly line: string;
}

export interface NightSettlement {
	readonly casualties: NightCasualty[];
	/** Task 5까지는 항상 빈 배열이다 — 조사 응답은 아직 클릭 시점에 나간다 */
	readonly reveals: NightReveal[];
}

/**
 * step을 정렬하지 않고 배열로 고정한다.
 *
 * README가 Jint에서 sort 안정성을 믿지 않기로 정했다. 배열을 고정 순서로
 * 순회하면 비교 함수도 정렬도 없다. 그리고 beginGame이 shuffle 후
 * assignRole(seat, i + 1, ...)을 하므로 seats[i].index === i + 1이다 —
 * 좌석 배열 순회가 곧 좌석 번호 오름차순이다.
 */
const DECLARED_STEP_ORDER = [
	NightStep.BLOCK,
	NightStep.PROTECT,
	NightStep.ATTACK,
	NightStep.DEATH,
	NightStep.INSPECT,
	NightStep.AFTER,
] as const;

/**
 * 위 배열이 NightStep 전부를 담고 있는가.
 *
 * RoleDef.nightStep이 필수라 직업은 step을 반드시 적는다. 그런데 step 자체가
 * 순회 목록에서 빠지면 그 step의 직업은 아무 소리 없이 실행되지 않는다 —
 * 타입 에러도 런타임 에러도 실패하는 테스트도 없다. 능력을 막는 능력이
 * 들어올 때 "차단이 그냥 안 걸리는" 길이 여기다.
 *
 * 전부 담고 있으면 Exclude가 never가 되어 이 타입은 평범한 배열 타입이 된다.
 * 하나라도 빠지면 never가 되고, 배열을 never에 대입할 수 없어 컴파일이 막힌다.
 * Record<Role, RoleDef>가 직업을 강제하는 것과 같은 수법이다.
 */
type StepOrderCoversEveryStep =
	Exclude<NightStep, (typeof DECLARED_STEP_ORDER)[number]> extends never
		? readonly NightStep[]
		: never;

/**
 * 밤 정산이 도는 순서.
 *
 * NightStep의 숫자값(20/30/…)과 이 배열은 각각 따로 순서를 주장하므로 서로
 * 어긋날 수 있다. 정렬로 하나를 없애는 길은 Jint의 sort 안정성 때문에 막혀
 * 있으니, 대신 어긋남을 잡는다 — 「STEP_ORDER는 NightStep 숫자값 오름차순이다」
 * (tests/night-pipeline.test.ts)가 둘을 묶어 둔다. 테스트를 위해 export한다.
 */
export const STEP_ORDER: StepOrderCoversEveryStep = DECLARED_STEP_ORDER;

/**
 * 이 좌석의 지목을 기록한다. 같은 좌석이 다시 지목하면 교체한다.
 *
 * 스파이는 마피아를 찾아내면 능력을 소모하지 않으므로 같은 밤에 또 지목한다.
 * 밀어 넣기만 하면 한 좌석에 intent가 둘이 되고, 파이프라인의 "이 좌석의
 * 지목" 조회가 어느 쪽을 뜻하는지 알 수 없어진다.
 */
export function putIntent(intents: NightIntent[], actor: number, target: number): void {
	for (let i = 0; i < intents.length; i++) {
		if (intents[i].actor === actor) {
			intents[i] = { actor, target };
			return;
		}
	}
	intents.push({ actor, target });
}

/**
 * 이 좌석이 지목한 좌석. 지목이 없거나 그 번호의 좌석이 없으면 null.
 *
 * actor가 처음 맞는 intent에서 끝낸다 — 그 뒤는 보지 않는다. putIntent가
 * 한 좌석당 intent를 하나로 유지하기 때문이다(같은 좌석이 다시 지목하면 교체).
 * 훑는 모양이라 "조건에 맞는 것을 찾는다"로 읽히기 쉽지만 그렇지 않다.
 * 그 불변을 깨고 intent를 밀어 넣기만 하면 이 함수는 조용히 첫 지목을 답한다.
 */
function targetOf(
	seats: readonly Seat[],
	intents: readonly NightIntent[],
	actor: number
): Seat | null {
	for (const intent of intents) {
		if (intent.actor !== actor) continue;
		for (const seat of seats) {
			if (seat.index === intent.target) return seat;
		}
		return null;
	}
	return null;
}

/**
 * 이 능력이 대상에 남기는 흔적. 정산이 나중에 읽는다.
 *
 * default 가지를 두지 않는다. NightActionKind를 하나 늘리고 여기 가지를
 * 빠뜨리면 맨 아래 unhandled가 never가 아니게 되어 컴파일이 막힌다.
 * default: return이 있으면 그 새 능력은 아무 소리 없이 아무 일도 하지 않는다 —
 * 밤 능력이 조용히 죽는 두 번째 길이 그것이었다.
 *
 * 짝인 recordNightIntent(NightResolution.ts)도 default를 두지 않는데, 그쪽은
 * 반환 타입에 null이 있어 가지가 모자라면 "반환문이 없다"로 잡힌다. 이 함수는
 * void라 그 방법이 통하지 않으므로 switch 뒤의 never 대입으로 잡는다.
 */
function apply(actor: Seat, target: Seat): void {
	const kind = roleDef(actor.role).nightAction;
	// 지목할 것이 없는 직업은 애초에 intent를 남기지 못하므로 여기 오지 않는다.
	// 그래도 타입에는 null이 남아 있으니, 걷어내야 아래 switch가 "종류 전부를
	// 덮는가"라는 질문이 된다. default가 있던 유일한 이유가 이 null이었다.
	if (kind === null) return;

	switch (kind) {
		case NightActionKind.HEAL:
			target.healed = true;
			return;
		case NightActionKind.ATTACK:
			target.attackedBy.push(actor.index);
			return;
		case NightActionKind.SILENCE:
			target.silenced = true;
			return;
		case NightActionKind.SCOOP:
			target.scooped = true;
			return;
		// 조사는 Task 5에서 reveals로 옮긴다. 지금은 클릭 시점에 답이 나가므로
		// 여기서 할 일이 없다
		case NightActionKind.INSPECT_TEAM:
		case NightActionKind.INSPECT_ROLE:
			return;
	}

	// 위 switch가 종류를 전부 덮으면 여기 오는 kind는 never다. 가지를 하나
	// 빠뜨리면 그 종류가 남아 이 대입이 "never에 넣을 수 없다"로 막힌다.
	// 런타임에 하는 일은 없다 — 존재 이유가 타입 검사뿐인 두 줄이다.
	const unhandled: never = kind;
	return unhandled;
}

/**
 * 밤에 쌓인 지목을 정해진 순서로 적용한다.
 *
 * skipAttacks는 첫 밤 무사다. ATTACK step의 적용과 DEATH step 양쪽을
 * 건너뛴다 — attackedBy가 채워지지 않으므로 방탄도 소모되지 않는다.
 */
export function resolveNightIntents(
	seats: Seat[],
	intents: readonly NightIntent[],
	opts: { readonly skipAttacks: boolean }
): NightSettlement {
	const reveals: NightReveal[] = [];
	let casualties: NightCasualty[] = [];

	/*
	 * 밤이 시작될 때 살아 있던 좌석 번호.
	 *
	 * **오늘은 아무 일도 하지 않는다.** 파이프라인이 도는 동안 seat.alive를
	 * 내리는 코드가 없기 때문이다 — DEATH step의 resolveNightCasualties는 판정만
	 * 하고 좌석을 내리는 것은 파이프라인이 끝난 뒤 서비스의 kill()이다. 그래서
	 * 이 스냅숏은 매 step에서 라이브 값과 언제나 같다.
	 *
	 * 그런데도 두는 이유는, 사망 적용이 파이프라인 안으로 들어오는 순간(그 계획이
	 * Task 5/10에 있다) 여기가 곧바로 실효를 갖기 때문이다. 그때 step마다
	 * seat.alive를 다시 읽으면 DEATH에서 죽은 사람의 능력이 뒤 step에서 사라진다 —
	 * 그 밤에 죽은 기자의 특종(AFTER)이 안 나가고, 그 밤에 죽은 경찰의
	 * 조사(INSPECT)가 답을 못 받는다. 밤의 능력은 살아서 지목한 사람의 것이고,
	 * 그 뒤에 죽었는지는 무관하다.
	 *
	 * 지금 실제로 걸러내는 것은 하나뿐이다: 밤이 시작될 때 **이미** 죽어 있던
	 * 좌석의 지목.
	 */
	const wasAlive: number[] = [];
	for (const seat of seats) {
		if (seat.alive) wasAlive.push(seat.index);
	}

	for (const step of STEP_ORDER) {
		if (step === NightStep.DEATH) {
			if (!opts.skipAttacks) casualties = resolveNightCasualties(seats);
			continue;
		}
		if (step === NightStep.ATTACK && opts.skipAttacks) continue;

		for (const seat of seats) {
			if (wasAlive.indexOf(seat.index) < 0) continue;
			if (roleDef(seat.role).nightStep !== step) continue;
			const target = targetOf(seats, intents, seat.index);
			if (!target) continue;
			apply(seat, target);
		}
	}

	return { casualties, reveals };
}
