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
import { NightActionKind, roleDef } from "./Roles.ts";

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
export function nightActionBlockedReason(seat: Seat, turnCount: number): string | null {
	const reason = noTurnReason(seat, turnCount);
	if (reason) return reason;
	if (seat.usedSkill) return "이미 대상을 선택했습니다.";
	return null;
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
export function hasNightTurn(seat: Seat, turnCount: number): boolean {
	return noTurnReason(seat, turnCount) === null;
}

/** 구조적으로 이번 밤에 할 일이 없는 이유. 할 일이 있으면 null */
function noTurnReason(seat: Seat, turnCount: number): string | null {
	const def = roleDef(seat.role);
	if (def.nightAction === null) return "밤에 쓸 능력이 없는 직업입니다. 아침을 기다리세요.";
	// usesSpent만 보면 방금 이번 밤에 쓴 사람도 "차례가 없다"가 되어 분모에서
	// 빠진다. 이번 밤에 쓴 것은 위 usedSkill이 답할 몫이다
	if (def.maxUses !== undefined && seat.usesSpent >= def.maxUses && !seat.usedSkill) {
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
 * 능력이 없는 직업이면 null.
 */
export function recordNightIntent(actor: Seat, target: Seat): NightSelectResult | null {
	const def = roleDef(actor.role);
	if (def.nightAction === null) return null;

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
			// 답은 여기서 내지 않는다. 막는 능력이 들어오면 막힌 경찰이 이미
			// 답을 본 뒤가 되고, 그때 가서 되돌릴 방법이 없다.
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
				privateSound: Sound.INVESTIGATE,
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
 * 밤이 끝났을 때 누가 죽고 누가 살아남았는지.
 * 실제 사망 처리(스프라이트·위젯·이름 변경)는 부작용이므로 서비스가 한다.
 */
export function resolveNightCasualties(seats: readonly Seat[]): NightCasualty[] {
	const casualties: NightCasualty[] = [];
	const killed: Seat[] = [];

	for (const seat of seats) {
		if (!seat.alive || seat.attackedBy.length === 0) continue;
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
		casualties.push({ seat, outcome: NightOutcome.KILLED });
		killed.push(seat);
	}

	// 자경단원의 자책은 "쐈다"가 아니라 "죽였다"에 걸린다. 의사가 살렸거나
	// 군인이 버텼다면 시민은 멀쩡하므로 책임질 일도 없다.
	for (const victim of killed) {
		if (victim.team === Team.MAFIA) continue;
		for (const shooterIndex of victim.attackedBy) {
			const shooter = seatByIndex(seats, shooterIndex);
			if (!shooter || !shooter.alive) continue;
			if (!roleDef(shooter.role).backfiresOnAlly) continue;
			if (shooter.team !== victim.team) continue;
			if (hasCasualty(casualties, shooter)) continue;
			casualties.push({ seat: shooter, outcome: NightOutcome.BACKFIRED });
		}
	}
	return casualties;
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
