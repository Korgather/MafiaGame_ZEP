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
import { Role, Team } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import { NightActionKind, roleDef, roleName } from "./Roles.ts";

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
 * 밤에 대상을 지목했을 때의 결과.
 * actor/target의 healed·marked·team·usedSkill을 직접 갱신한다.
 * (Seat은 순수 데이터라 이 갱신도 Node 테스트에서 그대로 관찰할 수 있다)
 *
 * 능력이 없는 직업이면 null.
 */
export function resolveNightSelect(actor: Seat, target: Seat): NightSelectResult | null {
	const action = roleDef(actor.role).nightAction;
	if (action === null) return null;

	switch (action) {
		case NightActionKind.HEAL:
			target.healed = true;
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 치료하기로 결정했습니다.`,
				privateSound: Sound.HEAL,
			};

		case NightActionKind.KILL:
			// 다른 마피아가 이미 찍은 대상이면 표를 낭비시키지 않는다
			if (target.marked) {
				return {
					consumed: false,
					confirmed: false,
					label: "다른 마피아가 선택한 대상입니다.",
				};
			}
			target.marked = true;
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 죽이기로 결정했습니다.`,
				// 총성은 방 전체가 듣는다 (밤의 긴장감 연출)
				roomSound: Sound.GUN,
			};

		case NightActionKind.INSPECT_TEAM:
			return {
				consumed: true,
				confirmed: true,
				label:
					target.role === Role.MAFIA
						? `${target.index}번 참가자는 마피아입니다!`
						: `${target.index}번 참가자는 마피아가 아닙니다.`,
				labelDurationMs: REVEAL_MS,
				privateSound: Sound.INVESTIGATE,
			};

		case NightActionKind.INSPECT_ROLE:
			if (target.role === Role.MAFIA) {
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
	}
}

export interface NightCasualty {
	seat: Seat;
	/** 의사가 살렸는가 */
	saved: boolean;
}

/**
 * 밤이 끝났을 때 누가 죽고 누가 살아남았는지.
 * 실제 사망 처리(스프라이트·위젯·이름 변경)는 부작용이므로 서비스가 한다.
 */
export function resolveNightCasualties(seats: readonly Seat[]): NightCasualty[] {
	const casualties: NightCasualty[] = [];
	for (const seat of seats) {
		if (!seat.alive || !seat.marked) continue;
		casualties.push({ seat, saved: seat.healed });
	}
	return casualties;
}
