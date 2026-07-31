/**
 * 도메인 테스트용 좌석 팩토리.
 *
 * Seat의 모양이 바뀌면 여기 한 곳만 고치면 된다. 파일마다 사본을 두면
 * 필드 하나를 더할 때마다 네 곳이 함께 밀린다.
 */
import { Role } from "../../src/types/Game.types.ts";
import type { Seat } from "../../src/types/Game.types.ts";
import { ROLE_DEFS } from "../../src/domain/Roles.ts";

export function seat(index: number, role: Role, overrides: Partial<Seat> = {}): Seat {
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
