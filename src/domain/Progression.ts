/**
 * 경험치·레벨·전적. 순수 함수.
 *
 * 기존 giveExp는 "경험치를 준다"와 "승패 전적을 기록한다"를 한 함수에서 했다.
 * 그래서 억울하게 처형당한 시민에게 위로 경험치 2를 줄 때도
 * citizenWin이 함께 올라갔다 — 게임이 끝나기도 전에.
 * 두 관심사를 분리하면 그 버그는 구조적으로 생길 수 없다.
 *
 * 또 하나: 보상표는 team을 "마피아"와 비교하고 있었는데 실제 값은 "mafia"라서
 * 모든 분기가 else로 떨어졌다. 즉 승패·생사와 무관하게 시민 승리 3, 마피아 승리 2가
 * 지급됐다. 아래 표는 원래 의도했던 값이다.
 */
import type { Seat } from "../types/Game.types.ts";
import { Team } from "../types/Game.types.ts";

/** 억울하게 처형당한(마피아가 아닌) 참가자에게 주는 위로 경험치 */
export const CONSOLATION_EXP = 2;

/**
 * 게임 종료 보상. [생존, 사망] 순.
 * 마피아로 이기는 쪽이 훨씬 어렵기 때문에 보상이 크다.
 */
const REWARD = {
	citizenWins: {
		citizen: { alive: 5, dead: 3 },
		mafia: { alive: 4, dead: 3 },
	},
	mafiaWins: {
		mafia: { alive: 12, dead: 8 },
		citizen: { alive: 4, dead: 2 },
	},
};

/** 게임 종료 시 이 좌석이 받을 경험치 */
export function expReward(winner: Team, seat: Seat): number {
	const table = winner === Team.CITIZEN ? REWARD.citizenWins : REWARD.mafiaWins;
	const row = seat.team === Team.MAFIA ? table.mafia : table.citizen;
	return seat.alive ? row.alive : row.dead;
}

export type RecordKey = "mafiaWin" | "mafiaLose" | "citizenWin" | "citizenLose";

/**
 * 전적에 올릴 항목.
 *
 * 기존에는 "직업이 스파이면 무조건 마피아 전적"이었다. 마피아를 찾지 못해
 * 시민으로 끝난 스파이도 마피아 승패로 기록돼 통계가 뒤집혔다.
 * 최종 소속 진영으로 기록하면 스파이 특례 자체가 필요 없다.
 */
export function recordKey(winner: Team, seat: Seat): RecordKey {
	if (seat.team === Team.MAFIA) {
		return winner === Team.MAFIA ? "mafiaWin" : "mafiaLose";
	}
	return winner === Team.CITIZEN ? "citizenWin" : "citizenLose";
}

/**
 * 누적 경험치로부터 레벨을 구한다.
 * 레벨 n으로 올라가는 데 필요한 경험치는 (n + 15) * n — 뒤로 갈수록 가팔라진다.
 */
export function levelFromExp(exp: number): number {
	let remaining = exp;
	let level = 0;
	while (remaining > 0) {
		remaining -= (level + 15) * level;
		level++;
	}
	return level;
}
