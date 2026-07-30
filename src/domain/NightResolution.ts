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
import { inMafiaChat, NightActionKind, roleDef, roleName } from "./Roles.ts";

export interface NightSelectResult {
	/** 능력을 소모했는가. false면 같은 밤에 다시 지목할 수 있다 */
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
	/** 스파이가 이번 지목으로 마피아 진영에 합류했는가 */
	joinedMafia?: boolean;
}

/** 조사 결과처럼 읽을 시간이 필요한 라벨의 지속 시간 */
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
	const def = roleDef(seat.role);
	if (def.nightAction === null) return "밤에 쓸 능력이 없는 직업입니다. 아침을 기다리세요.";
	if (def.oncePerGame && seat.skillSpent) {
		return "능력은 게임당 한 번뿐이고 이미 사용했습니다. 이번 밤은 지켜보세요.";
	}
	if (def.needsPriorDay && turnCount === 0) {
		return "첫 밤에는 쓸 수 없습니다. 낮의 이야기를 듣고 내일 밤에 쓰세요.";
	}
	if (seat.usedSkill) return "이미 대상을 선택했습니다.";
	return null;
}

/**
 * 밤에 대상을 지목했을 때의 결과.
 * actor/target의 healed·attackedBy·silenced·scooped·team을 직접 갱신한다.
 * (Seat은 순수 데이터라 이 갱신도 Node 테스트에서 그대로 관찰할 수 있다)
 *
 * 능력이 없는 직업이면 null.
 */
export function resolveNightSelect(actor: Seat, target: Seat): NightSelectResult | null {
	const def = roleDef(actor.role);
	if (def.nightAction === null) return null;

	switch (def.nightAction) {
		case NightActionKind.HEAL:
			target.healed = true;
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 치료하기로 결정했습니다.`,
				privateSound: Sound.HEAL,
			};

		case NightActionKind.ATTACK: {
			// 기존에는 이미 지목된 대상이면 "다른 마피아가 선택한 대상입니다"로
			// 되돌렸다. 공격자가 마피아뿐일 때는 표 낭비를 막는 배려였지만,
			// 지금은 그 문구가 자경단원에게 "여기 마피아가 다녀갔다"를 알려준다.
			// 중복 지목은 어차피 무해하므로(정산은 좌석 단위) 규칙을 없앤다.
			target.attackedBy.push(actor.index);
			const attack: NightSelectResult = {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 공격 대상으로 정했습니다.`,
			};
			if (def.attackSound) attack.roomSound = def.attackSound;
			return attack;
		}

		case NightActionKind.INSPECT_TEAM:
			return {
				consumed: true,
				confirmed: true,
				label: roleDef(target.role).appearsAsMafia
					? `${target.index}번 참가자는 마피아입니다!`
					: `${target.index}번 참가자는 마피아가 아닙니다.`,
				labelDurationMs: REVEAL_MS,
				privateSound: Sound.INVESTIGATE,
			};

		case NightActionKind.INSPECT_ROLE:
			// 합류 조건은 "마피아 직업"이 아니라 "마피아 채팅에 있는 사람"이다.
			// 대화 상대가 없는 건달·짐승인간을 찾아낸 것으로 채팅이 열릴 수는 없다.
			if (inMafiaChat(target)) {
				// 마피아를 찾아내면 진영을 옮기고, 능력은 소모하지 않는다.
				// (기존 코드도 useSkill을 세우지 않았다 — 의도된 보상이다)
				actor.team = Team.MAFIA;
				return {
					consumed: false,
					confirmed: false,
					label: `🕵️ ${target.index}번 참가자는 마피아입니다.\n마피아 팀에 합류했고 능력을 한 번 더 쓸 수 있습니다.`,
					labelDurationMs: REVEAL_MS,
					privateSound: Sound.INVESTIGATE,
					joinedMafia: true,
				};
			}
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자의 직업은 ${roleName(target.role)}입니다.`,
				labelDurationMs: REVEAL_MS,
				privateSound: Sound.INVESTIGATE,
			};

		case NightActionKind.SILENCE:
			target.silenced = true;
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자는 내일 말할 수도 투표할 수도 없습니다.`,
			};

		case NightActionKind.SCOOP:
			target.scooped = true;
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 취재했습니다.\n내일 아침 모두가 그의 직업을 알게 됩니다.`,
				labelDurationMs: REVEAL_MS,
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
