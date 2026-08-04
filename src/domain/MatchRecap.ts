/** 종료 화면에 본인에게만 보여 주는 짧은 한 판 복기. */
import type { Seat } from "../types/Game.types.ts";
import { Team } from "../types/Game.types.ts";
import { roleName } from "./Roles.ts";

const STORED_LIMIT = 8;
const DISPLAY_ACTIONS = 2;

export function rememberMatchMoment(seat: Seat, line: string): void {
	const normalized = line.replace(/\s*\n\s*/g, " ").replace(/^\s+|\s+$/g, "");
	if (!normalized) return;
	if (seat.matchRecap[seat.matchRecap.length - 1] === normalized) return;
	seat.matchRecap.push(normalized);
	if (seat.matchRecap.length > STORED_LIMIT) seat.matchRecap.shift();
}

export function personalRecap(seat: Seat): string[] {
	const team = seat.team === Team.MAFIA ? "마피아 팀" : "시민 팀";
	const identity = `${roleName(seat.role)} · ${team} · ${seat.alive ? "생존" : "사망"}`;
	return [identity].concat(seat.matchRecap.slice(-DISPLAY_ACTIONS));
}
