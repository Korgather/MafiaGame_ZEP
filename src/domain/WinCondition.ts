/**
 * 승패 판정. 순수 함수.
 *
 * 기존 gameEndCheck는 판정과 보상 지급과 위젯 전환과 다음 상태 예약을
 * 한 함수 안에서 다 했다(90줄). 그래서 "마피아가 이겼는가"만 알고 싶어도
 * 부작용 없이 물어볼 방법이 없었고, 테스트도 불가능했다.
 */
import type { Seat } from "../types/Game.types.ts";
import { Role, Team } from "../types/Game.types.ts";

export interface AliveCount {
	mafiaTeam: number;
	citizenTeam: number;
	/** 진영과 무관하게 직업이 마피아인 생존자 수 */
	mafiaRole: number;
}

export function countAlive(seats: readonly Seat[]): AliveCount {
	const result: AliveCount = { mafiaTeam: 0, citizenTeam: 0, mafiaRole: 0 };
	for (const seat of seats) {
		if (!seat.alive) continue;
		if (seat.team === Team.MAFIA) result.mafiaTeam++;
		else result.citizenTeam++;
		if (seat.role === Role.MAFIA) result.mafiaRole++;
	}
	return result;
}

/**
 * 승리 진영. 아직 안 끝났으면 null.
 *
 * 마피아 진영이 시민 수 이상이면 마피아 승리 — 낮 투표로 뒤집을 수 없기 때문이다.
 * 스파이가 마피아에 합류하면 진영이 옮겨가므로 이 계산에 자동으로 반영된다.
 */
export function evaluateWinner(seats: readonly Seat[]): Team | null {
	const alive = countAlive(seats);
	if (alive.mafiaTeam <= 0) return Team.CITIZEN;
	if (alive.mafiaTeam >= alive.citizenTeam) return Team.MAFIA;
	return null;
}
