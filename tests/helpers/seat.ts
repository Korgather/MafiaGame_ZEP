/**
 * 도메인 테스트용 좌석 팩토리.
 *
 * Seat의 모양이 바뀌면 여기 한 곳만 고치면 된다. 파일마다 사본을 두면
 * 필드 하나를 더할 때마다 네 곳이 함께 밀린다.
 */
import { Judgement, Role } from "../../src/types/Game.types.ts";
import type { Seat } from "../../src/types/Game.types.ts";
import { ROLE_DEFS, startsContacted } from "../../src/domain/Roles.ts";

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
		rematch: false,
		votedFor: 0,
		voteCount: 0,
		judgement: Judgement.NONE,
		timeVoteSpent: false,
		healed: false,
		attackedBy: [],
		armored: ROLE_DEFS[role].survivesFirstAttack === true,
		blocked: false,
		scooped: false,
		// 접선이 필요한 직업만 거짓으로 시작한다. 여기서 전부 참으로 두면
		// 스파이·짐승인간 테스트가 접선을 거치지 않고도 통과해 버린다
		contacted: startsContacted(role),
		seduced: false,
		intimidated: false,
		exorcised: false,
		loverIndex: 0,
		borrowedRole: null,
		markIndex: 0,
		extraProbeIndex: 0,
		extraProbeSpent: false,
		usedSkill: false,
		usesSpent: 0,
		noteText: "",
		kickedBy: [],
		connected: true,
		...overrides,
	};
}
