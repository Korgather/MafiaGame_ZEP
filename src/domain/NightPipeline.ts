/**
 * 밤 정산 파이프라인.
 *
 * 지금까지 밤 능력은 클릭한 순간에 대상의 상태를 바꿨다. 능력이 서로를
 * 건드리지 않는 동안에는 그래도 됐다 — healed도 attackedBy도 밤이 끝날 때
 * resolveNightCasualties가 한 번만 읽었기 때문이다.
 *
 * 능력을 막는 능력(차단)이 들어오면서 그 전제가 무너졌다. "막는다"는 다른
 * 능력이 적용되기 전에 서야 하는데, 클릭 시점 적용에서는 누가 먼저 눌렀는지가
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
import { Sound } from "../constants/Assets.ts";
import { Role } from "../types/Game.types.ts";
import {
	effectiveDef,
	hasJobAbility,
	inMafiaChat,
	NightActionKind,
	NightStep,
	roleDef,
	roleName,
} from "./Roles.ts";
import type { NightCasualty } from "./NightResolution.ts";
import { hasExtraProbe, NightOutcome, resolveNightCasualties } from "./NightResolution.ts";

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
	/**
	 * 이 줄과 함께 본인에게만 들릴 소리. 없으면 조용히 간다.
	 *
	 * 아침에는 개인 통보가 여러 줄 한꺼번에 쏟아지고(조사 답, 쪽지, 차단),
	 * 채팅으로 오기 때문에 토론이 시작되면 밀려 올라간다. 소리가 붙는 줄은
	 * 놓치면 판단이 달라지는 것 하나뿐이다 — 지금은 차단이다.
	 */
	readonly sound?: string;
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
	NightStep.CONTACT,
	NightStep.DEATH,
	NightStep.CHAIN,
	NightStep.REVIVE,
	NightStep.INSPECT,
	NightStep.AFTER,
] as const;

/**
 * 위 배열이 NightStep 전부를 담고 있는가.
 *
 * RoleDef.nightStep이 필수라 직업은 step을 반드시 적는다. 그런데 step 자체가
 * 순회 목록에서 빠지면 그 step의 직업은 아무 소리 없이 실행되지 않는다 —
 * 타입 에러도 런타임 에러도 실패하는 테스트도 없다. "차단이 그냥 안 걸리는"
 * 길이 여기다.
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
 * 밀어 넣기만 하면 한 좌석에 intent가 둘이 되고, "한 좌석의 지목은 하나"에
 * 기대는 targetOf가 조용히 첫 지목을 답한다. 두 번째 지목이 오는 길은 실제로
 * 있다 — 쪽지의 첫 클릭은 consumed: false라 usedSkill이 서지 않고, 위젯은
 * 문구 고르기로 넘어가며 격자를 감출 뿐이라 위조된 select가 다시 닿는다.
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
	 * 누가 누구를 막았는가. 아침 통보가 읽는다.
	 *
	 * seat.blocked가 이미 있는데 따로 두는 이유는 **누가 막았는지**가 좌석
	 * 상태에 없기 때문이다. 그리고 건달 둘이 같은 사람을 막으면 항목이 둘
	 * 쌓여야 한다 — 불리언 하나로는 둘 다에게 통보할 수 없다.
	 */
	readonly blocks: NightIntent[];
	/**
	 * 이 밤에 죽은 좌석. DEATH step이 채운다.
	 *
	 * seat.alive로는 알 수 없다 — 좌석을 실제로 내리는 것은 파이프라인이 아니라
	 * 밖의 kill()이라, DEATH를 지난 뒤에도 오늘의 시체는 alive가 true다.
	 * AFTER step의 능력이 "대상이 오늘 죽었는가"를 물을 곳이 여기뿐이다.
	 */
	readonly killed: number[];
	/**
	 * 이 밤의 결말들. DEATH가 채우고 CHAIN·REVIVE가 덧붙인다.
	 *
	 * 지역 변수가 아니라 원장에 있는 이유는 자폭(MARK)과 소생(REVIVE)이
	 * apply 안에서 결말을 만들기 때문이다. 반환값으로 올려 보내면 능력 하나가
	 * 결말을 몇 개 만드는지를 apply의 시그니처가 미리 정해야 한다 — 자폭은
	 * 둘(자신·대상)이고 소생은 하나다.
	 */
	readonly casualties: NightCasualty[];
}

/**
 * apply가 원장 밖에서 읽어야 하는 것들.
 *
 * 원장(쓰는 곳)과 나눠 둔 이유는 방향이다. ledger는 이 밤에 쌓이는 결과이고
 * ctx는 이 밤의 입력이다. 하나로 합치면 apply가 자기가 쌓은 것을 다시 읽는
 * 경로가 열리고, 그때부터 능력의 결과가 좌석 순서에 따라 달라진다.
 */
interface NightContext {
	readonly seats: readonly Seat[];
	readonly intents: readonly NightIntent[];
}

function seatByIndex(seats: readonly Seat[], index: number): Seat | null {
	for (const seat of seats) {
		if (seat.index === index) return seat;
	}
	return null;
}

/**
 * 이 좌석이 오늘 밤 마피아 밀담의 표적이 되었는가. 짐승인간의 접선 판정이다.
 *
 * CONTACT(45)가 ATTACK(40) 뒤에 있으므로 마피아의 지목은 이미 attackedBy에
 * 들어와 있다. intents가 아니라 attackedBy를 읽는 이유가 그것이다 — 지목을
 * 읽으면 "마피아의 지목인가"를 여기서 다시 판정해야 하고, 막힌 마피아의
 * 지목까지 세어 접선이 성립한다.
 *
 * inMafiaChat을 함께 보는 이유는 짐승인간 자신을 세지 않기 위해서다. 진영만
 * 보면 짐승인간 둘이 같은 사람을 노렸을 때 서로 접선한 것이 된다.
 */
function targetedByMafiaTeam(seats: readonly Seat[], target: Seat): boolean {
	for (const index of target.attackedBy) {
		const shooter = seatByIndex(seats, index);
		if (!shooter) continue;
		if (inMafiaChat(shooter)) return true;
	}
	return false;
}

/**
 * 오늘 밤의 사망자 목록에 한 명을 더한다. 이미 죽는 사람이면 아무 일도 없다.
 *
 * 멱등이어야 하는 이유는 연쇄다. 마피아가 죽인 사람을 테러리스트가 다시
 * 안고 터지면 결말이 둘 쌓이고, 아침 방송이 같은 사람의 죽음을 두 번 알린다.
 */
function addChainDeath(ledger: NightLedger, seat: Seat, outcome: NightOutcome): boolean {
	if (!seat.alive) return false;
	if (ledger.killed.indexOf(seat.index) >= 0) return false;
	ledger.casualties.push({ seat, outcome });
	ledger.killed.push(seat.index);
	return true;
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
 * 차단을 양쪽에 알린다.
 *
 * 막은 쪽은 blocks를 그대로 돈다 — 같은 사람을 둘이 막았으면 둘 다 알아야
 * 하고, 항목이 곧 한 명의 건달이다. 생존 검사가 없는 것도 의도다: 그 밤에
 * 죽은 건달에게도 보낸다. 차단은 DEATH(50)보다 앞인 BLOCK(20)에서 이미
 * 성립했고, 유령 채널로 흘러가야 남은 시민이 그 정보를 쓸 수 있다.
 *
 * 막힌 쪽은 좌석 순서로 돈다. blocks를 돌면 같은 사람에게 같은 줄이 두 번
 * 가고, 그 줄 수가 곧 살아 있는 건달의 수를 알려준다.
 *
 * 알려진 부정확성: acted가 답하는 것은 "지목했는가"이지 "능력이 실제로
 * 발동했는가"가 아니다. 문구를 안 고른 시민(NOTE)을 막으면 건달은 "능력을
 * 썼습니다"를 받는데 그 시민은 아무것도 보내지 않았다. 통보의 정확도 문제일
 * 뿐 정보 누출은 아니라서 그대로 둔다 — 고치려면 apply의 반환값을 지목마다
 * 되짚어야 하는데, 그 값은 차단으로 능력이 걸러진 뒤의 값이라(막힌 사람은
 * apply까지 가지도 않는다) 여기서는 언제나 거짓이 된다.
 */
function notifyBlocked(
	seats: readonly Seat[],
	intents: readonly NightIntent[],
	ledger: NightLedger
): void {
	for (const block of ledger.blocks) {
		const acted = intentTarget(intents, block.target) !== 0;
		ledger.reveals.push({
			seat: block.actor,
			line: acted
				? `🥊 ${block.target}번은 어젯밤 능력을 썼고, 당신이 막았습니다.`
				: `🥊 ${block.target}번은 어젯밤 아무것도 하지 않았습니다.`,
		});
	}

	for (const seat of seats) {
		if (!seat.blocked) continue;
		// 막을 것이 없었으면 알리지 않는다. 능력 없는 사람이 "방해받았다"를
		// 받으면 그 한 줄이 곧 건달의 존재 확정이다
		if (intentTarget(intents, seat.index) === 0) continue;
		// 오늘 아침 죽어 있는 사람에게는 보내지 않는다. 쪽지(NOTE)와 같은
		// 판정이다 — alive는 "밤이 시작될 때 이미 죽어 있었는가"를, killed는
		// "오늘 죽었는가"를 답한다. 좌석을 실제로 내리는 것은 파이프라인 밖의
		// kill()이라 DEATH를 지난 뒤에도 오늘의 시체는 alive가 참이다
		if (!seat.alive) continue;
		if (ledger.killed.indexOf(seat.index) >= 0) continue;
		ledger.reveals.push({
			seat: seat.index,
			// 누가 막았는지는 없다. 알면 다음 낮에 건달을 찾아 처형한다
			line: "🥊 어젯밤 누군가 당신을 방해해 능력이 무효가 되었습니다.",
			// 막힌 사람만 소리를 받는다. 자기가 고른 대상에 능력이 닿았다고
			// 믿은 채 낮을 시작하면 그 오해 위에서 추리가 굴러가고, 조사 답이
			// 안 왔다는 사실만으로는 막힌 것인지 대상이 결백한 것인지 모른다.
			// 건달 본인의 성공 통보(위 blocks 루프)에는 붙이지 않는다 —
			// 막은 쪽은 자기가 무엇을 했는지 이미 안다
			sound: Sound.BLOCKED,
		});
	}
}

/**
 * 마피아 팀이 남에게서 무언가를 캐내는 능력인가. 군인이 튕겨내는 대상이다.
 *
 * 진영이 아니라 능력 종류로 묻는다. 스파이는 접선 전까지 시민 팀이라
 * `actor.team`으로 물으면 그냥 통과하는데, 접선 전 첩보야말로 군인이
 * 막아야 할 바로 그것이다.
 *
 * 표로 두어 능력 종류를 늘리면 여기서 컴파일이 멈추게 한다. 함수 안에
 * `kind === A || kind === B`로 적으면 새 캐내기 능력만 군인을 조용히
 * 지나가고, 그 구멍은 화면에 아무 흔적도 남기지 않아 발견되지 않는다.
 *
 * 시민 편의 조사(경찰·점쟁이·사립탐정·영매)는 false다. 군인은 같은 편이
 * 자신을 확인하는 것까지 막을 이유가 없고, 막으면 시민 편 정보직이 군인을
 * 만날 때마다 밤 하나를 잃는다.
 */
const MAFIA_PROBE: Record<NightActionKind, boolean> = {
	HEAL: false,
	ATTACK: false,
	INSPECT_TEAM: false,
	INSPECT_ROLE: true,
	SCOOP: false,
	INSPECT_ABILITY: false,
	NOTE: false,
	SEDUCE: false,
	INTIMIDATE: false,
	STEAL: true,
	TRACK: false,
	MARK: false,
	STALK: false,
	SEANCE: false,
	REVIVE: false,
};

/**
 * 이 능력이 대상에 남기는 흔적. 정산이 나중에 읽는다.
 *
 * 돌려주는 값은 "능력을 실제로 썼는가"다. 사용 횟수를 이 값으로 센다 —
 * 지목했다는 사실만으로 세면 쪽지 문구를 안 고르고 나간 시민이 한 장을
 * 날린다. 이 값이 그대로 "막히면 안 닳는다"이기도 하다.
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
function apply(
	actor: Seat,
	target: Seat,
	ledger: NightLedger,
	ctx: NightContext
): boolean {
	// 훔친 능력을 쓰는 밤에는 도둑이 그 직업이다. roleDef(actor.role)로 읽으면
	// 도둑은 매 밤 훔치기만 하고 훔친 것을 쓸 길이 없다
	const def = effectiveDef(actor);
	const kind = def.nightAction;
	// 지목할 것이 없는 직업은 애초에 intent를 남기지 못하므로 여기 오지 않는다.
	// 그래도 타입에는 null이 남아 있으니, 걷어내야 아래 switch가 "종류 전부를
	// 덮는가"라는 질문이 된다. default가 있던 유일한 이유가 이 null이었다.
	if (kind === null) return false;

	// 군인은 캐내는 능력을 튕겨내고 누가 왔는지 알아낸다. 두 능력(첩보·도벽)의
	// 공통 규칙이라 switch 가지 안에 나눠 적지 않는다 — 나눠 적으면 한쪽만
	// 고쳐진 채로 오래 간다.
	//
	// 대상 쪽은 roleDef로 읽는다. effectiveDef(target)로 읽으면 군인의 능력을
	// 훔친 도둑까지 조사에 면역이 되고, 반대로 남의 능력을 든 군인은 뚫린다.
	// 튕겨내는 것은 그날 밤 쓰는 능력이 아니라 직업 자체의 성질이다.
	//
	// 방탄(armored)은 건드리지 않는다. 같은 직업의 능력이지만 자원이 다르다 —
	// 조사를 튕긴 밤에 방탄까지 닳으면 그날 밤 마피아가 도둑 하나로 군인의
	// 갑옷을 공짜로 벗기는 길이 열린다.
	if (MAFIA_PROBE[kind] && roleDef(target.role).deflectsMafiaProbe === true) {
		ledger.reveals.push({
			seat: target.index,
			line: `🪖 ${actor.index}번 참가자가 당신을 캐내려 했습니다.\n튕겨냈습니다.`,
		});
		ledger.reveals.push({
			seat: actor.index,
			line: `🪖 ${target.index}번 참가자에게 튕겨났습니다.\n아무것도 알아내지 못했습니다.`,
		});
		// 조사가 성립하지 않았으므로 ledger.inspected에는 넣지 않는다.
		// 반면 true를 돌려주는 것은 맞다 — 그 밤의 능력은 이미 썼다. false로
		// 하면 도둑이 군인을 공짜로 찾아내는 탐지기가 되고, 1회성 능력이라면
		// 튕길 때마다 무한히 재시도할 수 있다
		return true;
	}

	switch (kind) {
		case NightActionKind.HEAL:
			target.healed = true;
			return true;
		case NightActionKind.ATTACK:
			target.attackedBy.push(actor.index);
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
			// 조건이 셋 곱해진 것이다. 넘어가는 직업인가(def), 아직 안 넘어갔는가
			// (actor), 찾아낸 사람이 마피아 채팅에 있는가(target). 셋째가
			// "마피아 직업인가"가 아닌 이유는 대화 상대가 없는 짐승인간을 찾아낸
			// 것으로 채팅이 열릴 수는 없기 때문이다. 첫째가 없으면 직업을 읽는
			// 능력이 곧 배신이 된다. 둘째가 없으면 이미 합류한 스파이가 추가
			// 첩보로 마피아를 또 만났을 때 합류 문구가 한 번 더 뜨고 defected에도
			// 두 번 실린다 — 이미 자기 편인 사람을 보고 "합류했습니다"가 나간다
			if (def.defectsToMafia && !actor.contacted && inMafiaChat(target)) {
				actor.team = Team.MAFIA;
				// 스파이의 접선 방법이 곧 이 조사다. team만 바꾸고 여기를 빠뜨리면
				// countsForMafiaWin이 계속 거짓이라, 합류한 스파이가 승리 판정에서
				// 영원히 시민 쪽 무게로 남는다 — 배신하고도 상대 편을 돕는 셈이다.
				// 이 줄을 빠뜨려도 밀담은 열린다. inMafiaChat은 팀부터 보고
				// 그 다음 nightChat을 보는데, 스파이는 정의에 밀담을 달고
				// 있으므로 바로 윗줄이 팀을 바꾼 것만으로 둘째 줄에서 통과한다.
				// contacted는 셋째 줄(짐승인간)에서만 쓰인다. 그래서 화면상으로는
				// 아무 이상이 없고, 판이 끝나는 순간의 승리 판정에서만 어긋난다
				actor.contacted = true;
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

		case NightActionKind.SEDUCE:
			// 두 가지를 동시에 건다. blocked는 오늘 밤의 능력을, seduced는 내일
			// 낮의 발언을 막는다. 하나로 합칠 수 없는 이유는 수명이 다르기
			// 때문이고(NightActionKind 선언에 기록), 아침에 blocked를 내리는
			// 코드가 seduced까지 내리면 유혹은 차단과 구별되지 않는다
			target.blocked = true;
			target.seduced = true;
			ledger.blocks.push({ actor: actor.index, target: target.index });
			return true;

		case NightActionKind.INTIMIDATE:
			// 밤 능력은 건드리지 않는다. 협박은 낮의 표를 빼앗는 능력이고,
			// 그래서 tallyVotes와 judgementPassed가 이 값을 읽는다
			target.intimidated = true;
			return true;

		case NightActionKind.STEAL:
			// 오늘 밤에는 아무 일도 일어나지 않는다. borrowedRole은 다음 밤의
			// effectiveDef가 읽고, 그 밤이 끝나면 파이프라인이 비운다.
			// 직업 이름을 알려주지 않는 것이 중요하다 — 알려주면 도둑이 조사
			// 직업이 되고, 훔친 능력을 쓸 이유가 사라진다
			actor.borrowedRole = target.role;
			ledger.reveals.push({
				seat: actor.index,
				line: `🧤 ${target.index}번 참가자의 능력을 훔쳤습니다.\n내일 밤 그 능력을 쓸 수 있습니다.`,
			});
			return true;

		case NightActionKind.TRACK: {
			// 미행도 조사다. 사기꾼은 미행당한 것도 알아차린다 — 한쪽만
			// 통보하면 사기꾼의 "조사당했다"가 경찰의 존재를 확정해 준다
			ledger.inspected.push(target.index);
			const followed = intentTarget(ctx.intents, target.index);
			ledger.reveals.push({
				seat: actor.index,
				line:
					followed === 0
						? `🔦 ${target.index}번 참가자는 어젯밤 아무 데도 가지 않았습니다.`
						: `🔦 ${target.index}번 참가자는 어젯밤 ${followed}번 참가자를 찾아갔습니다.`,
			});
			return true;
		}

		case NightActionKind.MARK:
			// 여기서는 아무도 죽지 않는다. 폭탄은 지목한 밤이 아니라 테러리스트가
			// **죽는 순간** 터진다 — 지목한 자리에서 터뜨리면 테러리스트가 매 밤
			// 스스로 죽는 직업이 되고, 원작의 "안고 죽는다"가 "먼저 죽는다"가 된다.
			//
			// 좌석에 적는 이유는 수명이다. 밤 지목(nightIntents)은 다음 밤이
			// 시작될 때 지워지지만 폭탄은 그 사이의 낮 처형까지 살아 있어야 한다
			actor.markIndex = target.index;
			return true;

		case NightActionKind.STALK:
			// 접선한 뒤에는 평범한 공격자다. 마피아와 겹칠 필요가 없다
			if (actor.contacted) {
				target.attackedBy.push(actor.index);
				return true;
			}
			if (targetedByMafiaTeam(ctx.seats, target)) {
				actor.contacted = true;
				// 접선한 밤부터 곧바로 문다. CONTACT(45)가 DEATH(50) 앞인 이유가
				// 이 한 줄이다 — 뒤에 있으면 접선한 밤은 언제나 허탕이 된다
				target.attackedBy.push(actor.index);
				ledger.defected.push(actor.index);
				ledger.reveals.push({
					seat: actor.index,
					line: "🐺 마피아와 접선했습니다.\n이제 밤마다 한 명을 물 수 있습니다.",
				});
				return true;
			}
			ledger.reveals.push({
				seat: actor.index,
				line: `🐺 ${target.index}번 참가자는 마피아의 표적이 아니었습니다.`,
			});
			// 접선에 실패해도 쓴 것은 쓴 것이다. 횟수 제한이 없는 능력이라
			// 세는 값이 달라지지 않지만, 막혔을 때와 헛짚었을 때를
			// usesSpent로 구별할 수 있어야 회귀 테스트가 둘을 나눠 본다
			return true;

		case NightActionKind.SEANCE:
			// 성불은 조사가 아니라 처분이다. inspected에 넣지 않는 이유가 그것이다 —
			// 사기꾼은 죽은 뒤에 통보를 받을 곳이 없고, 산 사람을 부를 수도 없다
			target.exorcised = true;
			ledger.reveals.push({
				seat: actor.index,
				line: `🔮 ${target.index}번 참가자의 직업은 ${roleName(target.role)}이었습니다.`,
			});
			return true;

		case NightActionKind.REVIVE:
			// 살아 있는 사람은 되살릴 것이 없다. 성직자는 targetsDead라 화면에
			// 무덤만 뜨지만, 도메인이 그것을 믿으면 안 된다 — 지목한 뒤에
			// 늦게 도착한 메시지나 재접속으로 산 사람이 실려 올 수 있고,
			// 그때 REVIVED 기록이 붙으면 도굴꾼의 wasRevived가 오염되고
			// 판에 한 번뿐인 능력이 아무 일도 없이 사라진다.
			// 그 밤에 죽은 사람은 허용한다 — REVIVE 단계가 DEATH 뒤에 서는
			// 이유가 그것이고, seat.alive는 밤이 끝나야 내려간다
			if (target.alive && ledger.killed.indexOf(target.index) < 0) return false;
			// 이미 누가 되살렸다면 내 차례는 남는다. 성직자가 둘인 판은
			// 드물지만 있다 — 도둑이 능력을 훔치거나 도굴꾼이 성직자를
			// 파내면 그 밤에 둘이 같은 무덤을 열 수 있고, 그대로 두면
			// 한 사람이 두 번 되살아난 것으로 기록된다
			if (hasOutcome(ledger, target, NightOutcome.REVIVED)) return false;
			// 성불한 혼령은 돌아오지 않는다. false를 돌려주어 횟수를 아낀다 —
			// 성직자의 능력은 판에 한 번뿐이고, 헛짚었다고 잃으면 영매가
			// 시민 편의 성직자를 실수로 봉인하는 사고가 판을 끝낸다
			if (target.exorcised) {
				ledger.reveals.push({
					seat: actor.index,
					line: `⛪ ${target.index}번 참가자의 혼령은 이미 떠났습니다.`,
				});
				return false;
			}
			ledger.casualties.push({ seat: target, outcome: NightOutcome.REVIVED });
			return true;
	}

	// 위 switch가 종류를 전부 덮으면 여기 오는 kind는 never다. 가지를 하나
	// 빠뜨리면 그 종류가 남아 이 대입이 "never에 넣을 수 없다"로 막힌다.
	// 런타임에 하는 일은 없다 — 존재 이유가 타입 검사뿐인 두 줄이다.
	const unhandled: never = kind;
	return unhandled;
}

/**
 * 접선한 스파이의 추가 첩보. 판에 한 번뿐이다.
 *
 * 지목 루프가 아니라 여기서 도는 이유는 intents가 "한 좌석의 지목은 하나"에
 * 기대고 있기 때문이다(targetOf). 둘째 지목을 그 목록에 담으면 조회가 조용히
 * 첫 지목만 답하고 둘째는 사라진다. 그래서 둘째만 좌석에 따로 적어 두고
 * 이 함수가 읽는다.
 *
 * apply를 그대로 다시 부른다. 조사 한 줄을 여기서 새로 적으면 군인의 반탐이
 * 이 경로만 비껴가고, 그때 스파이는 추가 첩보로 군인의 정체를 그냥 읽는다.
 */
function probeAgain(
	seats: readonly Seat[],
	wasAlive: readonly number[],
	ledger: NightLedger,
	ctx: NightContext
): void {
	for (const seat of seats) {
		if (seat.extraProbeIndex === 0) continue;
		if (wasAlive.indexOf(seat.index) < 0) continue;
		// 막힌 사람은 이 밤에 아무것도 하지 않는다. 첫 지목과 같은 규칙이다
		if (seat.blocked) continue;
		// 위젯이 거절당한 지목을 다시 보냈거나, 자격이 그사이 사라진 경우
		if (!hasExtraProbe(seat)) continue;
		const target = seatByIndex(seats, seat.extraProbeIndex);
		if (!target) continue;
		// 군인에게 튕겨도 쓴 것으로 친다. 기본 첩보와 같은 규칙이고,
		// 실패가 공짜면 캐내기가 군인 탐지기가 된다
		if (apply(seat, target, ledger, ctx)) seat.extraProbeSpent = true;
	}
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
	const ledger: NightLedger = {
		reveals: [], defected: [], inspected: [], killed: [], blocks: [], casualties: [],
	};
	const ctx: NightContext = { seats, intents };

	/*
	 * 밤이 시작될 때 이미 빌린 능력을 들고 있던 좌석.
	 *
	 * 도둑의 한 바퀴는 두 밤이다 — A밤에 훔치고, B밤에 쓰고, B밤이 끝나면
	 * 비운다. 비우는 시점을 "밤 끝"으로 잡되 이 스냅숏이 필요한 이유는,
	 * A밤의 AFTER에서 방금 훔친 것도 같은 밤 끝에 지워지기 때문이다.
	 * 밤이 시작될 때 이미 있던 것만 지우면 두 밤이 정확히 한 바퀴가 된다.
	 */
	const borrowedAtStart: number[] = [];
	for (const seat of seats) {
		if (seat.borrowedRole !== null) borrowedAtStart.push(seat.index);
	}

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
				// 살아남은 결말(SAVED·SHIELDED)은 killed에 들어오지 않는다. 뒤 step이
				// 묻는 것은 "오늘 죽었는가"이지 "오늘 공격받았는가"가 아니다 —
				// 후자를 답하면 의사가 살린 사람에게 쪽지가 안 가고, 그 사실이
				// 곧 "저 사람은 어젯밤 공격받았다"를 알려주는 신호가 된다
				for (const casualty of resolveNightCasualties(seats)) {
					ledger.casualties.push(casualty);
					// SACRIFICED는 연인의 희생이다 — 공격받은 쪽은 SPARED로 살고
					// 짝이 대신 죽는다. 대신 죽은 좌석도 오늘 밤의 사망자이므로
					// killed에 들어가야 도굴꾼의 무덤 목록과 미행 결과가 그 죽음을 본다
					const died =
						casualty.outcome === NightOutcome.KILLED ||
						casualty.outcome === NightOutcome.BACKFIRED ||
						casualty.outcome === NightOutcome.SACRIFICED;
					if (died) ledger.killed.push(casualty.seat.index);
				}
			}
			continue;
		}
		if (step === NightStep.ATTACK && opts.skipAttacks) continue;
		// 지목 없이 일어나는 사후 처리. INSPECT가 이미 지나간 뒤다.
		// skipAttacks(첫 밤 무사)여도 이 줄들은 돈다 — 첫 밤에 막힌 사람은
		// 첫 밤에 통보를 받는다
		if (step === NightStep.AFTER) {
			notifyInspected(seats, wasAlive, ledger);
			notifyBlocked(seats, intents, ledger);
		}

		for (const seat of seats) {
			if (wasAlive.indexOf(seat.index) < 0) continue;
			// 훔친 능력은 훔친 직업의 자리에서 돈다. roleDef(seat.role)로 읽으면
			// 도둑이 훔친 의사 능력이 AFTER(70)에 서고, PROTECT(30)에 서야 할
			// 치료가 공격보다 뒤로 밀려 아무도 못 살린다
			if (effectiveDef(seat).nightStep !== step) continue;
			// 막힌 사람은 이 밤에 아무것도 하지 않는다. targetOf보다 앞에
			// 두는 것이 중요하다 — 뒤에 두면 apply까지 가지 않더라도
			// 여기서 걸러진 것과 대상이 없어 걸러진 것이 구분되지 않는다.
			// BLOCK step 자신은 통과시킨다. 같은 step 안에는 순서가 없으므로
			// 마담 둘이 서로를 유혹하면 누가 먼저 눌렀는지가 밤을 가른다
			if (step !== NightStep.BLOCK && seat.blocked) continue;
			const target = targetOf(seats, intents, seat.index);
			if (!target) continue;
			// 실제로 적용된 것만 센다. 지목만으로 세면 쪽지를 안 보낸 시민이
			// 한 장을 날린다. "막히면 안 닳는다"도 여기서 나온다
			if (apply(seat, target, ledger, ctx)) seat.usesSpent++;
		}

		// 스파이의 둘째 조사. 첫 조사가 전부 끝난 뒤에 돈다 — 순서를 뒤집으면
		// 어제 접선한 스파이가 오늘 또 마피아를 만났을 때 합류 처리가 먼저
		// 돌아, 위 !actor.contacted 검사가 자기가 방금 세운 값에 걸린다
		if (step === NightStep.INSPECT) probeAgain(seats, wasAlive, ledger, ctx);

		// 지목이 없어 위 루프에 걸리지 않는 능력들. step의 지목이 모두 적용된
		// 뒤에 돈다 — 성직자가 되살린 사람을 도굴꾼이 파내면 안 되고,
		// 자폭으로 죽은 사람의 연인도 뒤따라야 한다
		if (step === NightStep.CHAIN) {
			// 순서가 중요하다. 폭탄이 먼저 터져야 그 폭발에 휘말린 사람의 연인이
			// 같은 밤에 뒤따른다 — 뒤집으면 연인 연쇄가 폭사자를 못 보고 지나간다
			detonateBombs(seats, ledger);
			chainLovers(seats, ledger);
		}
		if (step === NightStep.REVIVE) digGraves(seats, ledger);
	}

	// 빌린 능력의 수명은 딱 한 밤이다. 이 밤에 방금 훔친 것은 남긴다
	for (const seat of seats) {
		if (borrowedAtStart.indexOf(seat.index) >= 0) seat.borrowedRole = null;
	}

	return {
		casualties: ledger.casualties,
		reveals: ledger.reveals,
		defected: ledger.defected,
	};
}

/**
 * 폭탄을 안고 죽은 사람이 지목해 둔 적을 데려간다.
 *
 * 조건이 셋이다. 폭탄을 들고 있고(markIndex), 오늘 밤에 죽었고,
 * 지목한 상대가 **다른 팀**이어야 한다. 마지막 조건이 이 능력을 시민 편의
 * 도구로 묶는다 — 팀을 보지 않으면 테러리스트가 밤에 살해당하는 것만으로
 * 시민 하나가 더 죽어 마피아의 밤이 이중으로 이득이 된다.
 *
 * 공격이 아니라 확정된 죽음이다. attackedBy를 거치지 않으므로 의사도
 * 방탄도 막지 못한다 — 이미 죽은 사람이 데려가는 것이라 막을 주체가 없다.
 *
 * 낮의 처형으로 터지는 폭탄은 여기 오지 않는다. 그쪽은 kill()이 잇는다 —
 * 연인 연쇄와 같은 이유이고, 같은 규칙이 두 층에 나뉘어 있는 이유도 같다.
 */
function detonateBombs(seats: readonly Seat[], ledger: NightLedger): void {
	for (const bomber of seats) {
		if (bomber.markIndex === 0) continue;
		if (ledger.killed.indexOf(bomber.index) < 0) continue;
		const mark = seatByIndex(seats, bomber.markIndex);
		if (!mark) continue;
		if (mark.team === bomber.team) continue;
		addChainDeath(ledger, mark, NightOutcome.BOMBED);
	}
}

/**
 * 연인 한쪽이 오늘 밤에 죽으면 다른 쪽도 오늘 밤에 뒤따른다.
 *
 * 밤의 **공격**으로 죽는 연인은 여기 오지 않는다. 그쪽은 짝이 대신 죽는
 * 희생이고, 판정은 resolveNightCasualties가 치료·방탄 바로 뒤에서 한다.
 * 여기 남는 것은 몸받이가 성립하지 않는 죽음뿐이다 — 자폭에 휘말렸거나
 * 자경단원의 자책으로 죽은 연인.
 *
 * 그래서 희생으로 살아남은 좌석(SPARED)은 건너뛴다. 대신 죽은 짝이 killed에
 * 들어간 것을 보고 이 연쇄가 돌면, 방금 목숨을 건진 사람이 그 죽음 때문에
 * 다시 죽어 희생이 없던 일이 된다. "대신 죽는다"는 대신 죽은 쪽에서 멈춘다.
 *
 * 고정점까지 도는 이유는 자폭이다 — 테러리스트가 연인 한 명을 안고 터지면
 * 그 짝이 죽고, 그 짝이 또 다른 쌍의 한쪽일 수도 있다(모드가 늘면). 한 바퀴는
 * 반드시 killed를 하나 이상 늘리므로 좌석 수를 넘겨 돌 수 없다.
 *
 * 낮의 처형으로 죽는 연인은 여기 오지 않는다. 그쪽은 kill()이 잇는다 —
 * 밤의 연쇄는 아침 방송에 실릴 결말 목록을 만들어야 해서 파이프라인의 일이고,
 * 낮의 연쇄는 만들 목록이 없어 처형 처리 안에서 끝난다.
 */
function chainLovers(seats: readonly Seat[], ledger: NightLedger): void {
	let spread = true;
	while (spread) {
		spread = false;
		for (const seat of seats) {
			if (seat.loverIndex === 0) continue;
			if (ledger.killed.indexOf(seat.index) < 0) continue;
			const partner = seatByIndex(seats, seat.loverIndex);
			if (!partner) continue;
			if (hasOutcome(ledger, partner, NightOutcome.SPARED)) continue;
			if (addChainDeath(ledger, partner, NightOutcome.HEARTBREAK)) spread = true;
		}
	}
}

/**
 * 도굴꾼이 무덤에서 직업을 하나 얻는다. 판에 한 번뿐이다.
 *
 * "첫 밤의 사망자"가 아니라 "도굴꾼이 아직 파지 않았을 때 처음 나온 시민 편
 * 사망자"다. 첫 밤으로 못 박으면 첫 밤이 무사한 판(작은 인원)에서 이 직업이
 * 통째로 사라지고, 파이프라인이 밤 번호를 알아야 한다.
 *
 * 마피아 팀의 직업은 파내지 않는다. 원작과 다른 프로젝트 규칙이고 이유는
 * 승리 판정이다 — 시민 하나가 마피아로 넘어가면 양쪽 인원이 동시에 1씩
 * 움직여 마진이 2 바뀐다. 판을 뒤집는 폭이 무작위 사망 순서에 달리게 된다.
 * 연인도 제외한다. 연인은 쌍이 본질이라 혼자 물려받을 수 있는 직업이 아니다.
 *
 * 얻는 것이지 베끼는 것이 아니다. 파낸 무덤에는 무능력한 시민만 남는다.
 */
function digGraves(seats: readonly Seat[], ledger: NightLedger): void {
	for (const digger of seats) {
		if (digger.role !== Role.GRAVEDIGGER) continue;
		if (!digger.alive || digger.blocked) continue;
		if (digger.usesSpent > 0) continue;
		if (ledger.killed.indexOf(digger.index) >= 0) continue;
		for (const index of ledger.killed) {
			const victim = seatByIndex(seats, index);
			if (!victim) continue;
			if (victim.team === Team.MAFIA) continue;
			if (victim.role === Role.LOVER || victim.role === Role.GRAVEDIGGER) continue;
			// 성직자가 되살린 사람의 무덤은 비어 있다
			if (hasOutcome(ledger, victim, NightOutcome.REVIVED)) continue;
			digger.role = victim.role;
			// 복제가 아니라 이전이다. 무덤 쪽은 무능력한 시민만 남는다.
			//
			// 시체의 직업을 그대로 두면 같은 직업이 판에 둘이 된다. 시체라서
			// 무해해 보이지만 성직자가 그 사람을 되살리는 순간 진짜로 둘이 되고,
			// 종료 화면의 직업 공개도 "의사가 둘이었다"로 읽힌다.
			// 파낸 무덤은 마피아 팀도 연인도 아니므로 남는 자리는 언제나 시민이다.
			victim.role = Role.CITIZEN;
			digger.usesSpent++;
			// 문구는 victim.role이 아니라 digger.role을 읽는다. 바로 위에서
			// 무덤을 비웠으므로 victim.role은 이제 시민이다
			ledger.reveals.push({
				seat: digger.index,
				line: `⛏️ ${index}번 참가자의 무덤에서 ${roleName(digger.role)}의 흔적을 얻었습니다.\n오늘부터 당신은 ${roleName(digger.role)}입니다.`,
			});
			break;
		}
	}
}

function hasOutcome(ledger: NightLedger, seat: Seat, outcome: NightOutcome): boolean {
	for (const casualty of ledger.casualties) {
		if (casualty.seat === seat && casualty.outcome === outcome) return true;
	}
	return false;
}
