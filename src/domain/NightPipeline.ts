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
import { Team } from "../types/Game.types.ts";
import {
	hasJobAbility,
	inMafiaChat,
	NightActionKind,
	NightStep,
	roleDef,
	roleName,
} from "./Roles.ts";
import type { NightCasualty } from "./NightResolution.ts";
import { NightOutcome, resolveNightCasualties } from "./NightResolution.ts";

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
	/** 조사한 사람에게만 전할 한 줄들. 아침 진입 직전에 배달한다 */
	readonly reveals: NightReveal[];
	/**
	 * 이 밤에 마피아로 넘어간 좌석. 지금은 스파이 하나뿐이다.
	 *
	 * reveals에 섞지 않는 이유는 배달 방식이 달라서다. 조사 답은 본인에게
	 * 귓속말 한 줄이면 끝이지만, 합류는 마피아 채널에 남길 한 줄과 본인
	 * 위젯의 탭 목록 갱신이 따로 필요하다. 그건 domain이 할 수 없는 일이다.
	 */
	readonly defected: number[];
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
 * 지금은 교체가 실제로 일어나지 않는다 — 스파이의 재지목 보너스가 사라지면서
 * 한 밤에 두 번 지목하는 길이 없어졌고, 클릭 경로가 usedSkill로 두 번째를
 * 막는다. 그래도 교체로 두는 이유는 targetOf가 "한 좌석의 지목은 하나"에
 * 기대고 있어서다. 밀어 넣기만 하면 한 좌석에 intent가 둘이 되고, 조회가
 * 조용히 첫 지목을 답한다.
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
 * 이 좌석이 지목한 대상 번호. 지목이 없으면 0이다 — 좌석 번호는 1부터다.
 *
 * 쪽지의 두 번째 클릭(문구 고르기)은 대상을 다시 보내지 않는다. 위젯이
 * 대상을 다시 보내게 하면 조작된 메시지가 문구와 대상을 함께 정할 수 있다.
 */
export function intentTarget(intents: readonly NightIntent[], actor: number): number {
	for (const intent of intents) {
		if (intent.actor === actor) return intent.target;
	}
	return 0;
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

/** 이 밤에 쌓이는 것들. apply가 채우고 resolveNightIntents가 돌려준다 */
interface NightLedger {
	readonly reveals: NightReveal[];
	readonly defected: number[];
	/** 조사당한 좌석. 같은 좌석이 여러 번 들어올 수 있다 */
	readonly inspected: number[];
	/**
	 * 이 밤에 죽은 좌석. DEATH step이 채운다.
	 *
	 * seat.alive로는 알 수 없다 — 좌석을 실제로 내리는 것은 파이프라인이 아니라
	 * 밖의 kill()이라, DEATH를 지난 뒤에도 오늘의 시체는 alive가 true다.
	 * AFTER step의 능력이 "대상이 오늘 죽었는가"를 물을 곳이 여기뿐이다.
	 */
	readonly killed: number[];
}

/**
 * 조사당한 사실을 본인에게 알린다. 사기꾼처럼 지목할 대상이 없는 직업은
 * intent 루프에 걸리지 않으므로 여기서 따로 돈다.
 *
 * 한 좌석당 한 줄이다. 두 번 조사당했다고 두 줄이 가면 그 줄 수가 곧 살아
 * 있는 조사 직업의 수를 알려준다. 그 보장은 inspected를 중복 없이 쌓아서가
 * 아니라 좌석을 한 번씩만 도는 이 루프에서 나온다 — 쌓는 쪽에서 한 번 더
 * 거르면 같은 규칙이 두 곳에 살고, 한쪽만 고치는 날 조용히 어긋난다.
 */
function notifyInspected(
	seats: readonly Seat[],
	wasAlive: readonly number[],
	ledger: NightLedger
): void {
	for (const seat of seats) {
		if (wasAlive.indexOf(seat.index) < 0) continue;
		if (roleDef(seat.role).notifiesOnInspect !== true) continue;
		if (ledger.inspected.indexOf(seat.index) < 0) continue;
		ledger.reveals.push({
			seat: seat.index,
			line: "🎭 어젯밤 누군가 당신을 조사했습니다.",
		});
	}
}

/**
 * 이 능력이 대상에 남기는 흔적. 정산이 나중에 읽는다.
 *
 * 돌려주는 값은 "능력을 실제로 썼는가"다. 사용 횟수를 이 값으로 센다 —
 * 지목했다는 사실만으로 세면 쪽지 문구를 안 고르고 나간 시민이 한 장을
 * 날린다. 막는 능력이 들어오면 이 값이 그대로 "막히면 안 닳는다"가 된다.
 *
 * default 가지를 두지 않는다. NightActionKind를 하나 늘리고 여기 가지를
 * 빠뜨리면 맨 아래 unhandled가 never가 아니게 되어 컴파일이 막힌다.
 * default: return이 있으면 그 새 능력은 아무 소리 없이 아무 일도 하지 않는다 —
 * 밤 능력이 조용히 죽는 두 번째 길이 그것이었다.
 *
 * 짝인 recordNightIntent(NightResolution.ts)도 default를 두지 않는데, 그쪽은
 * 반환 타입에 null이 있어 가지가 모자라면 "반환문이 없다"로 잡힌다. 이 함수도
 * 이제 값을 돌려주지만, never 대입은 그대로 둔다 — 반환 타입이 boolean이라
 * "가지가 모자라다"가 "암묵적 undefined"로 조용히 통과할 여지가 있다.
 */
function apply(actor: Seat, target: Seat, ledger: NightLedger): boolean {
	const def = roleDef(actor.role);
	const kind = def.nightAction;
	// 지목할 것이 없는 직업은 애초에 intent를 남기지 못하므로 여기 오지 않는다.
	// 그래도 타입에는 null이 남아 있으니, 걷어내야 아래 switch가 "종류 전부를
	// 덮는가"라는 질문이 된다. default가 있던 유일한 이유가 이 null이었다.
	if (kind === null) return false;

	switch (kind) {
		case NightActionKind.HEAL:
			target.healed = true;
			return true;
		case NightActionKind.ATTACK:
			target.attackedBy.push(actor.index);
			return true;
		case NightActionKind.SILENCE:
			target.silenced = true;
			return true;
		case NightActionKind.SCOOP:
			target.scooped = true;
			return true;

		case NightActionKind.INSPECT_TEAM:
			ledger.inspected.push(target.index);
			// 대상이 방금 DEATH에서 죽었어도 답은 같다. 조사는 시체가 아니라
			// 그 사람이 누구였는가를 묻는 것이다
			ledger.reveals.push({
				seat: actor.index,
				line: roleDef(target.role).appearsAsMafia
					? `🔍 ${target.index}번 참가자는 마피아입니다!`
					: `🔍 ${target.index}번 참가자는 마피아가 아닙니다.`,
			});
			return true;

		case NightActionKind.INSPECT_ROLE:
			ledger.inspected.push(target.index);
			// 조건이 둘 곱해진 것이다. 넘어가는 직업인가(def)와, 찾아낸 사람이
			// 마피아 채팅에 있는가(target). 뒤쪽이 "마피아 직업인가"가 아닌 이유는
			// 대화 상대가 없는 짐승인간을 찾아낸 것으로 채팅이 열릴 수는
			// 없기 때문이다. 앞쪽이 없으면 직업을 읽는 능력이 곧 배신이 된다.
			if (def.defectsToMafia && inMafiaChat(target)) {
				actor.team = Team.MAFIA;
				ledger.defected.push(actor.index);
				// 정확한 직업을 적는다. 위장은 팀 조사에만 통해야 하고, 직업을
				// 읽는 능력까지 속이면 스파이가 사기꾼을 만났을 때 아무 일도
				// 일어나지 않는다
				ledger.reveals.push({
					seat: actor.index,
					line: `🕵️ ${target.index}번 참가자의 직업은 ${roleName(target.role)}입니다.\n마피아 팀에 합류했습니다.`,
				});
				return true;
			}
			ledger.reveals.push({
				seat: actor.index,
				line: `🔍 ${target.index}번 참가자의 직업은 ${roleName(target.role)}입니다.`,
			});
			return true;

		case NightActionKind.INSPECT_ABILITY:
			ledger.inspected.push(target.index);
			// 묻는 것은 보유이지 가용이 아니다. "오늘 쓸 수 있는가"로 바꾸면
			// 첫 밤의 점괘가 needsPriorDay 직업 목록을 그대로 흘린다.
			// 진영은 한 글자도 나가지 않는다 — 이 능력의 값어치는 답이
			// 확정이 아니라는 데 있고, '없습니다'를 내는 직업 다섯(영매·정치인·
			// 군인·사기꾼·시민)이 같은 답을 낸다는 사실이 그 애매함을 지탱한다.
			// 판정을 hasJobAbility에 맡기는 이유가 그 다섯 번째다: 시민의 익명
			// 쪽지를 능력으로 세면 그 자리가 비고 점괘가 상수에 가까워진다
			// (Roles.ts의 hasJobAbility에 측정 기록)
			ledger.reveals.push({
				seat: actor.index,
				line: hasJobAbility(target.role)
					? `🃏 ${target.index}번 참가자는 직업 능력이 있습니다.`
					: `🃏 ${target.index}번 참가자는 직업 능력이 없습니다.`,
			});
			return true;

		case NightActionKind.NOTE:
			// 문구를 고르기 전에 밤이 끝났다. 보낼 것이 없으므로 쓴 것도 아니다
			if (!actor.noteText) return false;
			// AFTER step이라 DEATH는 이미 지나갔다. 오늘 죽은 사람에게 보내지
			// 않는다 — 유령 채널은 영매를 통해 낮으로 돌아오므로, 조사 결과와
			// 달리 쪽지는 그 채널에 새 정보를 주입한다. 밤 사망은 어차피 공개되니
			// 안 닳는 것으로 새는 정보도 없다.
			// alive는 "밤이 시작될 때 이미 죽어 있었는가"를, killed는 "오늘 죽었는가"를
			// 답한다. 좌석을 실제로 내리는 것은 파이프라인 밖의 kill()이라 둘이 필요하다
			if (!target.alive) return false;
			if (ledger.killed.indexOf(target.index) >= 0) return false;
			ledger.reveals.push({
				seat: target.index,
				line: `✉️ 익명 쪽지: ${actor.noteText}`,
			});
			return true;
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
	const ledger: NightLedger = { reveals: [], defected: [], inspected: [], killed: [] };
	let casualties: NightCasualty[] = [];

	/*
	 * 밤이 시작될 때 살아 있던 좌석 번호.
	 *
	 * **오늘은 아무 일도 하지 않는다.** 파이프라인이 도는 동안 seat.alive를
	 * 내리는 코드가 없기 때문이다 — DEATH step의 resolveNightCasualties는 판정만
	 * 하고 좌석을 내리는 것은 파이프라인이 끝난 뒤 서비스의 kill()이다. 그래서
	 * 이 스냅숏은 매 step에서 라이브 값과 언제나 같다.
	 *
	 * 그런데도 두는 이유는, 사망 적용이 파이프라인 안으로 들어오는 날 여기가
	 * 곧바로 실효를 갖기 때문이다 — 그런 계획이 잡혀 있지는 않다. 그때 step마다
	 * seat.alive를 다시 읽으면 DEATH에서 죽은 사람의 능력이 뒤 step에서 사라진다 —
	 * 그 밤에 죽은 기자의 특종(AFTER)이 안 나가고, 그 밤에 죽은 경찰의
	 * 조사(INSPECT)가 답을 못 받는다. 뒤쪽은 이제 이 파일이 만드는 답이다
	 * (reveals). 밤의 능력은 살아서 지목한 사람의 것이고, 그 뒤에 죽었는지는
	 * 무관하다.
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
			if (!opts.skipAttacks) {
				casualties = resolveNightCasualties(seats);
				// 살아남은 결말(SAVED·SHIELDED)은 여기 들어오지 않는다. 뒤 step이
				// 묻는 것은 "오늘 죽었는가"이지 "오늘 공격받았는가"가 아니다 —
				// 후자를 답하면 의사가 살린 사람에게 쪽지가 안 가고, 그 사실이
				// 곧 "저 사람은 어젯밤 공격받았다"를 알려주는 신호가 된다
				for (const casualty of casualties) {
					const died =
						casualty.outcome === NightOutcome.KILLED ||
						casualty.outcome === NightOutcome.BACKFIRED;
					if (died) ledger.killed.push(casualty.seat.index);
				}
			}
			continue;
		}
		if (step === NightStep.ATTACK && opts.skipAttacks) continue;
		// 지목 없이 일어나는 사후 처리. INSPECT가 이미 지나간 뒤다
		if (step === NightStep.AFTER) notifyInspected(seats, wasAlive, ledger);

		for (const seat of seats) {
			if (wasAlive.indexOf(seat.index) < 0) continue;
			if (roleDef(seat.role).nightStep !== step) continue;
			const target = targetOf(seats, intents, seat.index);
			if (!target) continue;
			// 실제로 적용된 것만 센다. 지목만으로 세면 쪽지를 안 보낸 시민이
			// 한 장을 날린다. 막는 능력이 들어오면 "막히면 안 닳는다"도 여기서 나온다
			if (apply(seat, target, ledger)) seat.usesSpent++;
		}
	}

	return { casualties, reveals: ledger.reveals, defected: ledger.defected };
}
