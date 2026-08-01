/**
 * 밤 능력 처리. 순수 함수 — Seat(평범한 객체)만 만지고 ZEP API를 모른다.
 *
 * 기존 nightPlayerEvent는 300줄짜리 switch였고, 직업 4개가 각자
 * "room.players 전체를 순회하며 index가 일치하는 플레이어를 찾는" 코드를
 * 그대로 복사해 갖고 있었다. 그래서:
 *   - 대상 탐색 루프가 4벌 존재했고 한 벌(경찰)은 break가 없어 계속 돌았다
 *   - 마피아만 `return`으로 빠져나가 나머지는 fall-through 차이가 생겼다
 *   - 능력의 효과를 검증하려면 ZEP을 띄우는 수밖에 없었다
 *
 * 이제 대상 탐색과 위젯 처리는 서비스가 한 벌만 갖고, "무슨 일이 일어나는가"는
 * 여기 있는 순수 함수가 결정한다.
 */
import type { Seat } from "../types/Game.types.ts";
import { Team } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import { effectiveDef, NightActionKind, roleDef } from "./Roles.ts";

/**
 * 밤에 대상을 지목했을 때 시전자에게 돌아가는 것.
 * 대상의 상태도 시전자의 진영도 여기서 바꾸지 않는다 —
 * NightPipeline이 밤 끝에 한 번에 적용한다.
 */
export interface NightSelectResult {
	/**
	 * 능력을 소모했는가. 즉 이 지목으로 이번 밤의 차례가 끝났는가.
	 *
	 * false를 내는 갈래는 쪽지 하나다 — 대상을 고른 것으로는 아직 아무것도
	 * 쓰지 않았고, 문구를 고르는 두 번째 클릭이 소모한다. "확정했다
	 * (confirmed)"와 "다 썼다(consumed)"가 원래 다른 값이라 필드가 둘이다.
	 */
	consumed: boolean;
	/** 위젯에 선택 확정(selectResponse)을 보낼 것인가 */
	confirmed: boolean;
	/** 시전자에게 띄울 라벨 */
	label: string;
	/** 라벨 지속 시간(ms). 생략하면 기본값 */
	labelDurationMs?: number;
	/** 시전자에게만 재생할 사운드 */
	privateSound?: string;
	/** 방 전체에 재생할 사운드 */
	roomSound?: string;
	/**
	 * 지목만으로 끝나지 않는 능력인가 (쪽지).
	 *
	 * 서비스가 NightActionKind를 보고 분기하지 않게 하려고 여기 둔다.
	 * Night.ts의 약속은 "직업이 늘어도 이 파일은 안 고친다"이고,
	 * 그 약속은 직업이 아니라 행동으로 분기해도 깨진다.
	 */
	needsPhrase?: boolean;
}

/** 한 줄로 끝나지 않아 읽을 시간이 필요한 라벨의 지속 시간 */
const REVEAL_MS = 6000;

/**
 * 지금 이 좌석이 밤 능력을 쓸 수 없는 이유. 쓸 수 있으면 null.
 *
 * 같은 판정이 Night.ts에 세 벌 있었다 — 격자를 열지 말지(canAct), 격자 없이
 * 보는 사람에게 띄울 안내(nightNote), 그리고 위젯이 보낸 select를 거절할지.
 * 셋은 조건이 같아야 하는데 문구는 서로 달랐고, 실제로 nightNote는
 * "능력이 있는 직업은 대상을 지목하세요"를 능력이 없는 사람에게도 보냈다.
 * 조건을 한 벌로 합치면 위젯을 잠그는 근거와 거절하는 근거가 어긋날 수 없다.
 *
 * 반환값이 문구인 것도 그래서다. boolean이면 "왜 안 되는지"는 다시 호출자
 * 몫이 되어 세 벌로 갈라진다. 능력에 조건이 하나 늘 때 고칠 곳은 여기뿐이다.
 *
 * turnCount는 지나간 낮의 수다(첫 밤이면 0).
 */
export function nightActionBlockedReason(
	seat: Seat,
	turnCount: number,
	deadCount?: number
): string | null {
	const reason = noTurnReason(seat, turnCount, deadCount);
	if (reason) return reason;
	if (seat.usedSkill) {
		// 접선한 스파이는 한 명을 더 고를 수 있다. usedSkill을 내리는 대신
		// 여기서 지나가게 하는 이유는 진행률이다 — 저 값이 곧 "이 사람은
		// 끝났다"라, 내리면 밤 진행률이 뒤로 돌아간다
		if (hasExtraProbe(seat) && seat.extraProbeIndex === 0) return null;
		return "이미 대상을 선택했습니다.";
	}
	return null;
}

/**
 * 이 좌석이 이번 판에 추가 첩보를 아직 들고 있는가.
 *
 * "지금 한 명을 더 고를 수 있는가"와는 다르다 — 그쪽에는 이번 밤에 이미
 * 골랐는지(extraProbeIndex === 0)가 더 붙는다. 그 조건까지 여기 넣으면
 * 밤 끝에 실제로 조사를 돌리는 쪽이 자기가 찍어 둔 값 때문에 거짓을 받는다.
 *
 * **접선한 밤 당일에는 켜지지 않는다.** contacted를 세우는 곳이 밤 끝의
 * 정산(NightPipeline)이라 클릭 시점에는 아직 거짓이기 때문이다. 우연이 아니라
 * 필요한 순서다 — 그 밤에 곧바로 격자가 다시 열리면 "또 누를 수 있음" 자체가
 * 마피아를 찾아냈다는 신호가 되어, 아침까지 감춰 둔 답을 클릭 즉시 알려준다.
 * 아래 recordNightIntent의 INSPECT 주석과 같은 이유다.
 */
export function hasExtraProbe(seat: Seat): boolean {
	if (effectiveDef(seat).extraProbeAfterContact !== true) return false;
	if (!seat.contacted) return false;
	return !seat.extraProbeSpent;
}

/**
 * 이번 밤에 이 좌석에 차례가 도는가. 그 차례를 이미 썼는지는 보지 않는다.
 *
 * 위와 조건을 나눠 갖는 이유는 진행률("3명 중 1명이 지목했습니다")의 분모다.
 * 분모는 밤이 시작될 때 정해져 있어야 하는데, 막힌 이유를 하나로 뭉쳐 두면
 * 누군가 지목하는 순간 그 사람이 분모에서도 빠져 1/3이 아니라 0/2가 된다.
 * 낮의 voteProgress에는 이 문제가 없다 — 자격(canVote)과 행위(votedFor)가
 * 처음부터 다른 값이라서다.
 *
 * 두 함수가 조건을 복사해 갖지 않게 blocked 쪽이 이쪽을 부른다. 능력에
 * 조건이 하나 늘어도 고칠 곳은 여전히 아래 한 군데다.
 */
export function hasNightTurn(seat: Seat, turnCount: number, deadCount?: number): boolean {
	return noTurnReason(seat, turnCount, deadCount) === null;
}

/**
 * 구조적으로 이번 밤에 할 일이 없는 이유. 할 일이 있으면 null.
 *
 * deadCount는 지금까지 죽은 사람 수다. 사망자를 대상으로 하는 직업
 * (영매·성직자)은 이 값이 0인 밤에 고를 수 있는 칸이 하나도 없다 — 격자를
 * 열어 두면 빈 화면이 뜨고, 무엇보다 진행률의 분모에 남아 "3명 중 2명"에서
 * 영영 멈춘다. 선택 인자인 이유는 이 조건을 아는 호출부가 방을 들고 있는
 * 쪽뿐이기 때문이다. 모르는 호출부(테스트·순수 시뮬레이터)는 예전 그대로 답한다.
 */
function noTurnReason(seat: Seat, turnCount: number, deadCount?: number): string | null {
	// 빌린 능력이 있으면 그쪽이 이번 밤의 능력이다. 원래 직업으로 물으면
	// 도둑은 훔친 밤에 "이미 다 썼습니다"를 보고 격자를 못 연다
	const def = effectiveDef(seat);
	if (def.nightAction === null) return "밤에 쓸 능력이 없는 직업입니다. 아침을 기다리세요.";
	if (def.targetsDead === true && deadCount !== undefined && deadCount === 0) {
		return "아직 아무도 죽지 않았습니다. 이번 밤은 지켜보세요.";
	}
	// usesSpent만 보면 방금 이번 밤에 쓴 사람도 "차례가 없다"가 되어 분모에서
	// 빠진다. 이번 밤에 쓴 것은 위 usedSkill이 답할 몫이다.
	//
	// 빌린 능력은 이 검사를 지나간다. usesSpent는 좌석의 것이지 능력의 것이
	// 아니어서, 훔치기로 이미 1이 올라간 도둑이 maxUses 1짜리 능력을 빌리면
	// 그 밤에 곧바로 "다 썼습니다"가 된다 — 훔치는 행위가 훔친 것을 태운다.
	// 빌린 능력의 잔여 횟수는 원래 주인의 좌석에 남아 있고, 도둑은 그 능력을
	// 정확히 한 밤만 들고 있으므로 여기서 세지 않아도 한 번을 넘길 수 없다.
	if (
		seat.borrowedRole === null &&
		def.maxUses !== undefined &&
		seat.usesSpent >= def.maxUses &&
		!seat.usedSkill
	) {
		return "능력을 쓸 수 있는 횟수를 다 썼습니다. 이번 밤은 지켜보세요.";
	}
	if (def.firstNightOnly && turnCount > 0) {
		return "첫 밤에만 쓸 수 있는 능력입니다. 이번 밤은 지켜보세요.";
	}
	if (def.needsPriorDay && turnCount === 0) {
		return "첫 밤에는 쓸 수 없습니다. 낮의 이야기를 듣고 내일 밤에 쓰세요.";
	}
	return null;
}

/**
 * 밤에 대상을 지목했을 때 시전자가 보는 것.
 *
 * 전에는 이 함수가 대상의 healed·attackedBy·scooped를 직접 세웠다.
 * 즉 능력의 적용 시점이 곧 클릭 시점이었고, 그래서 밤의 결과가 손 빠르기에
 * 달려 있었다. 적용은 NightPipeline이 밤 끝에 정해진 순서로 한다.
 *
 * 여기 남는 것은 "지금 이 사람 화면에 무엇이 뜨는가"뿐이다. 조사 답도
 * 이제 여기서 나가지 않는다 — 파이프라인이 만들어 아침에 배달한다.
 *
 * 능력이 없는 직업이면 null. 고를 수 없는 대상이어도 null이다.
 */
export function recordNightIntent(actor: Seat, target: Seat): NightSelectResult | null {
	// 빌린 능력이 있으면 그쪽으로 답한다. noTurnReason과 같은 근거를 봐야
	// 격자는 열렸는데 지목은 거절되는 밤이 생기지 않는다
	const def = effectiveDef(actor);
	if (def.nightAction === null) return null;
	// 위젯이 이미 잠근 칸이지만 여기서도 막는다. 위젯의 잠금은 화면의 일이고,
	// 지목이 실제로 기록되는 곳은 여기다 — 한쪽만 있으면 위젯을 안 거치는
	// 경로가 하나 생기는 날 규칙이 사라진다
	if (def.noSelfTarget === true && actor.index === target.index) return null;
	// 산 자를 고르는 능력과 죽은 자를 고르는 능력은 격자가 아예 다르다.
	// 한쪽 격자에서 다른 쪽 대상이 올라오는 경로는 위젯 버그이거나 위조다
	if (def.targetsDead === true ? target.alive : !target.alive) return null;

	switch (def.nightAction) {
		case NightActionKind.HEAL:
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 치료하기로 결정했습니다.`,
				privateSound: Sound.HEAL,
			};

		case NightActionKind.ATTACK: {
			// 이미 지목된 대상이어도 되돌리지 않는다. 되돌리는 문구가
			// 자경단원에게 "여기 마피아가 다녀갔다"를 알려주기 때문이다.
			// 중복 지목은 무해하다 — 정산은 좌석 단위다
			const attack: NightSelectResult = {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 공격 대상으로 정했습니다.`,
			};
			if (def.attackSound) attack.roomSound = def.attackSound;
			return attack;
		}

		case NightActionKind.INSPECT_TEAM:
		case NightActionKind.INSPECT_ROLE:
		case NightActionKind.INSPECT_ABILITY:
			// 답은 여기서 내지 않는다. 그러면 막힌 경찰이 이미 답을 본 뒤가
			// 되고, 그때 가서 되돌릴 방법이 없다.
			// 스파이도 마찬가지로 한 번만 지목한다 — 예전에는 마피아를 찾아내면
			// consumed: false로 또 누를 수 있었는데, 그 "또 누를 수 있음" 자체가
			// 답을 클릭 즉시 알려주는 신호였다.
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 조사합니다.\n결과는 내일 아침에 알게 됩니다.`,
				// 이 라벨이야말로 오래 떠 있어야 한다. 답이 아니라 "오늘 밤에는
				// 안 나온다"는 안내이고, 바로 그 기대를 이번에 바꿨기 때문이다.
				// 3초에 스쳐 지나가면 조사자는 오지 않을 답을 밤새 기다린다
				labelDurationMs: REVEAL_MS,
				// 점쟁이만 소리가 다르다. 경찰·스파이와 같은 소리를 쓰면 밤마다
				// 자기가 진영을 봤는지 능력을 봤는지가 소리로 구분되지 않는다.
				// 답이 아침으로 밀린 지금은 지목 순간의 소리가 "무엇을 물었는가"를
				// 기억할 유일한 단서다
				privateSound:
					def.nightAction === NightActionKind.INSPECT_ABILITY
						? Sound.INSPECT
						: Sound.INVESTIGATE,
			};

		case NightActionKind.SCOOP:
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 취재했습니다.\n내일 아침 모두가 그의 직업을 알게 됩니다.`,
				labelDurationMs: REVEAL_MS,
			};

		case NightActionKind.NOTE:
			// 아직 소모하지 않는다. 문구를 고르는 두 번째 클릭이 소모한다 —
			// 여기서 usedSkill을 켜면 문구를 안 고르고 나간 사람도 쓴 것이 된다.
			// 확정도 아직이다. 격자를 물리면 문구 목록을 띄울 자리가 없다
			return {
				consumed: false,
				confirmed: false,
				label: `${target.index}번에게 보낼 문구를 고르세요.`,
				needsPhrase: true,
			};

		case NightActionKind.SEDUCE:
			// 능력을 막았는지는 지목 시점에 답할 수 없다. 대상이 아직 아무것도
			// 고르지 않았을 수 있고, 그 밤이 어떻게 정산될지는 파이프라인이 돌아야
			// 정해진다 — 그쪽 답은 아침에 한 번만 간다(NightPipeline의 notifyBlocked).
			// 대신 다음 낮까지 이어지는 침묵은 지금 확정된 사실이라 여기서 알린다.
			// 아침에 대상이 말을 못 하는 이유를 마담만은 알고 있어야 낮의 판단이 선다
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 유혹했습니다.\n내일 낮 동안 그는 말할 수 없습니다.`,
				labelDurationMs: REVEAL_MS,
			};

		case NightActionKind.INTIMIDATE:
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 협박했습니다.\n내일 낮 그는 투표할 수 없습니다.`,
				labelDurationMs: REVEAL_MS,
			};

		case NightActionKind.STEAL:
			// 훔친 능력은 오늘 밤이 아니라 내일 밤에 쓴다. 오늘 쓸 수 있다고
			// 착각하면 도둑은 아무것도 못 한 채 두 밤을 버린다
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자의 능력을 훔칩니다.\n내일 밤에 그 능력을 씁니다.`,
				labelDurationMs: REVEAL_MS,
			};

		case NightActionKind.TRACK:
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 미행합니다.\n그가 누구를 찾아갔는지 내일 아침에 알게 됩니다.`,
				labelDurationMs: REVEAL_MS,
				privateSound: Sound.INVESTIGATE,
			};

		case NightActionKind.MARK:
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자와 함께 죽기로 했습니다.`,
				labelDurationMs: REVEAL_MS,
			};

		case NightActionKind.STALK: {
			// 접선 전과 후의 문구가 다르다. 접선 전에는 지목이 곧 "마피아와 같은
			// 사람을 골랐는가"를 묻는 시도이고, 접선 뒤에는 그냥 공격이다.
			// 같은 문구를 쓰면 짐승인간은 자기가 접선했는지를 문구로 알 수 없다
			const stalk: NightSelectResult = {
				consumed: true,
				confirmed: true,
				label: actor.contacted
					? `${target.index}번 참가자를 공격 대상으로 정했습니다.`
					: `${target.index}번 참가자를 노립니다.\n마피아와 같은 대상이면 접선합니다.`,
				labelDurationMs: REVEAL_MS,
			};
			if (actor.contacted && def.attackSound) stalk.roomSound = def.attackSound;
			return stalk;
		}

		case NightActionKind.SEANCE:
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자의 혼령을 부릅니다.\n결과는 내일 아침에 알게 됩니다.`,
				labelDurationMs: REVEAL_MS,
				privateSound: Sound.INVESTIGATE,
			};

		case NightActionKind.REVIVE:
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 되살립니다.\n이 판에 한 번뿐입니다.`,
				labelDurationMs: REVEAL_MS,
				privateSound: Sound.HEAL,
			};
	}
}

/**
 * 공격받은 좌석이 아침을 어떻게 맞았는가.
 *
 * 기존에는 `saved: boolean` 하나였다 — 살아남는 길이 의사뿐이었으니 맞았다.
 * 이제 군인의 방탄과 자경단원의 자책이 생겼는데, boolean 두 개를 나란히 두면
 * `saved && shielded` 같은 있을 수 없는 상태를 타입이 허용한다.
 * 배타적인 결말은 열거형으로 두는 쪽이 화면 문구를 고를 때도 그대로 쓰인다.
 */
export const NightOutcome = {
	/** 죽었다 */
	KILLED: "KILLED",
	/** 의사가 살렸다 */
	SAVED: "SAVED",
	/** 군인이 버텼다 (방탄 소모) */
	SHIELDED: "SHIELDED",
	/** 자경단원이 같은 편을 쏴 자신도 죽었다 */
	BACKFIRED: "BACKFIRED",
	/**
	 * 폭탄을 안고 죽은 사람에게 지목당해 함께 끌려갔다.
	 *
	 * 터뜨린 본인의 결말은 여기 없다. 폭탄은 죽는 순간 터지므로 그 사람은
	 * 이미 다른 이유로(KILLED·처형) 죽어 있고, 결말을 하나 더 붙이면
	 * 같은 좌석이 두 번 죽은 것으로 기록된다.
	 */
	BOMBED: "BOMBED",
	/** 연인이 죽어 뒤따랐다 */
	HEARTBREAK: "HEARTBREAK",
	/**
	 * 연인 대신 죽었다. 공격받은 것은 짝이고, 죽는 것은 이쪽이다.
	 *
	 * HEARTBREAK와 나눠 두는 이유는 아침 문구다. 뒤따라 죽은 사람에게는
	 * "연인을 잃고 뒤따랐다"가 맞지만 몸받이가 된 사람에게는 정반대다 —
	 * 그 사람은 연인을 잃은 것이 아니라 연인을 살렸다. 둘을 한 결말로 묶으면
	 * 아침 방송이 살린 사람을 잃은 사람으로 부른다.
	 */
	SACRIFICED: "SACRIFICED",
	/**
	 * 연인이 대신 죽어 살아남았다. SACRIFICED의 반대편이고 언제나 짝을 이룬다.
	 *
	 * 죽음이 아닌데도 결말로 싣는 이유는 둘이다. 하나는 규칙이 "두 연인의 정체와
	 * 희생 결과를 공개한다"를 요구하고, 공개하지 않으면 마피아가 친 사람이 멀쩡히
	 * 살아 있는 이유를 아무도 설명할 수 없다는 것. 다른 하나는 밤의 연인 연쇄가
	 * 이 표시를 보고 멈춘다는 것이다 — 표시가 없으면 짝의 죽음이 되돌아와
	 * 살아남은 사람을 다시 죽여 희생이 없던 일이 된다.
	 */
	SPARED: "SPARED",
	/** 성직자가 되살렸다. 유일하게 죽음이 아닌 결말이다 */
	REVIVED: "REVIVED",
} as const;
export type NightOutcome = (typeof NightOutcome)[keyof typeof NightOutcome];

export interface NightCasualty {
	seat: Seat;
	outcome: NightOutcome;
}

function seatByIndex(seats: readonly Seat[], index: number): Seat | null {
	for (const seat of seats) {
		if (seat.index === index) return seat;
	}
	return null;
}

/**
 * 이 좌석 대신 죽어 줄 연인. 없으면 null이고, 그러면 본인이 죽는다.
 *
 * 조건 넷이 각각 규칙 한 줄에 대응한다.
 *
 * 1. 짝이 있다 — 연인이 아니면 애초에 해당 없다.
 * 2. 짝이 살아 있다 — "한 명이 이미 사망했다면 희생은 발동하지 않는다."
 *    이 경우 남은 연인은 평범한 시민처럼 죽는다.
 * 3. 짝도 같은 밤에 죽게 되지는 않았다 — 두 연인이 동시에 공격받으면
 *    서로 대신할 수 없다. 이 줄이 없으면 A가 B를 몸받이로 삼고 B가 A를
 *    몸받이로 삼아, 둘 다 죽으면서 둘 다 살아남은 기록이 만들어진다.
 * 4. 짝에게 이 밤의 결말이 아직 없다 — 치료·방탄으로 버틴 좌석이나 이미
 *    다른 쌍을 위해 죽은 좌석을 끌어오지 않는다. 한 좌석에 결말이 둘
 *    붙으면 아침 방송이 같은 사람을 두 번 처리한다.
 */
function sacrificeFor(
	seats: readonly Seat[],
	victim: Seat,
	doomed: readonly Seat[],
	casualties: readonly NightCasualty[]
): Seat | null {
	if (victim.loverIndex === 0) return null;
	const partner = seatByIndex(seats, victim.loverIndex);
	if (!partner) return null;
	if (!partner.alive) return null;
	if (doomed.indexOf(partner) >= 0) return null;
	if (hasCasualty(casualties, partner)) return null;
	return partner;
}

/**
 * 밤이 끝났을 때 누가 죽고 누가 살아남았는지.
 * 실제 사망 처리(스프라이트·위젯·이름 변경)는 부작용이므로 서비스가 한다.
 */
export function resolveNightCasualties(seats: readonly Seat[]): NightCasualty[] {
	const casualties: NightCasualty[] = [];
	const killed: Seat[] = [];
	// 치료도 방탄도 막지 못해 죽게 된 좌석. 연인의 희생을 이 목록 위에서
	// 판정하려고 따로 모은다 — 누가 죽게 되었는지가 전부 확정되어야
	// "짝이 대신할 수 있는가"에 답할 수 있다. 한 좌석씩 즉시 죽이면
	// 두 연인이 같은 밤에 공격받았을 때 먼저 처리된 쪽만 살아남는다
	const doomed: Seat[] = [];

	for (const seat of seats) {
		if (!seat.alive) continue;
		// 면역은 attackedBy를 비우는 대신 걸러서 본다. 비우면 "공격은 받았지만
		// 죽지 않았다"와 "아무도 안 왔다"가 같은 상태가 되어, 뒤따르는 자책
		// 판정도 미행 결과도 그 밤에 무슨 일이 있었는지를 되짚을 수 없다
		const attackers = effectiveAttackers(seats, seat);
		if (attackers.length === 0) continue;
		if (seat.healed) {
			casualties.push({ seat, outcome: NightOutcome.SAVED });
			continue;
		}
		if (seat.armored) {
			// 방탄은 게임당 한 번뿐이다. 여기서만 소모된다
			seat.armored = false;
			casualties.push({ seat, outcome: NightOutcome.SHIELDED });
			continue;
		}
		doomed.push(seat);
	}

	// 연인의 희생. 밤의 공격으로 죽게 된 연인을 짝이 대신한다.
	//
	// 치료·방탄보다 뒤인 것은 규칙이 정한 순서다 — 앞에 두면 의사가 살린
	// 연인 때문에 짝이 죽고, "치료가 성공하면 희생은 발생하지 않는다"가
	// 깨진다. 위 루프가 healed·armored를 이미 걸러 냈으므로 여기 오는
	// 좌석은 전부 막을 수단이 없었던 것들이다.
	for (const victim of doomed) {
		const partner = sacrificeFor(seats, victim, doomed, casualties);
		if (partner) {
			casualties.push({ seat: victim, outcome: NightOutcome.SPARED });
			casualties.push({ seat: partner, outcome: NightOutcome.SACRIFICED });
			killed.push(partner);
			continue;
		}
		casualties.push({ seat: victim, outcome: NightOutcome.KILLED });
		killed.push(victim);
	}

	// 자경단원의 자책은 "쐈다"가 아니라 "죽였다"에 걸린다. 의사가 살렸거나
	// 군인이 버텼다면 시민은 멀쩡하므로 책임질 일도 없다.
	//
	// 연인이 대신 죽은 경우도 마찬가지로 걸리지 않는다. 자책 판정은 죽은
	// 좌석을 공격한 사람을 찾는데, 대신 죽은 짝은 아무에게도 공격받지
	// 않았으므로 그 자리가 비어 있다. 쏜 상대가 살아 있다는 점에서
	// 치료·방탄과 같은 취급이고, 그래서 따로 적을 조건이 없다.
	for (const victim of killed) {
		if (victim.team === Team.MAFIA) continue;
		for (const shooter of effectiveAttackers(seats, victim)) {
			if (!shooter.alive) continue;
			if (!roleDef(shooter.role).backfiresOnAlly) continue;
			if (shooter.team !== victim.team) continue;
			if (hasCasualty(casualties, shooter)) continue;
			casualties.push({ seat: shooter, outcome: NightOutcome.BACKFIRED });
		}
	}
	return casualties;
}

/**
 * 이 좌석을 실제로 죽일 수 있는 공격자들.
 *
 * immuneToMafiaKill은 "마피아 팀의 칼이 안 통한다"는 뜻이고, 그 판정 기준은
 * 무기가 아니라 **쏜 사람의 진영**이다. 자경단원의 총은 시민의 것이므로 통한다.
 * 짐승인간이 접선 전에 마피아에게 죽지 않는 것이 이 규칙의 전부이고, 그래서
 * 정산 시점에 진영을 다시 읽는다 — 도굴꾼처럼 판 도중에 진영이 바뀌는
 * 직업이 있는 이상, 지목 시점의 진영을 기억해 두면 그 순간 틀린다.
 */
function effectiveAttackers(seats: readonly Seat[], target: Seat): Seat[] {
	const immune = roleDef(target.role).immuneToMafiaKill === true;
	const attackers: Seat[] = [];
	for (const index of target.attackedBy) {
		const shooter = seatByIndex(seats, index);
		if (!shooter) continue;
		if (immune && shooter.team === Team.MAFIA) continue;
		attackers.push(shooter);
	}
	return attackers;
}

function hasCasualty(casualties: readonly NightCasualty[], seat: Seat): boolean {
	for (const casualty of casualties) {
		if (casualty.seat === seat) return true;
	}
	return false;
}

/**
 * 이번 밤이 "아무도 죽지 않는 밤"인가.
 *
 * nightNumber는 정산이 끝난 뒤의 밤 번호다(첫 밤이 1). 호출부가 turnCount를
 * 올린 다음에 묻는다.
 *
 * 작은 판에서 첫 밤 사망은 정보가 아니라 손실이다 — 죽은 사람은 한 마디도
 * 못 했으므로 남은 사람이 그 사람에 대해 아는 것이 없고, 추리가 시작되기
 * 전에 인원만 줄어든다.
 */
export function isPeacefulNight(
	nightNumber: number,
	playerCount: number,
	peacefulUpTo: number
): boolean {
	return nightNumber === 1 && playerCount <= peacefulUpTo;
}
