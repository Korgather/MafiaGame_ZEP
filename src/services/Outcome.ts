/**
 * 승패 확정과 보상 정산.
 *
 * 기존 gameEndCheck는 90줄 안에서 판정·보상·위젯 전환·다음 상태 예약을 모두 했다.
 * 게다가 보상표가 `p.tag.team == "마피아"`로 분기했는데 team의 실제 값은 "mafia"라
 * 모든 조건이 false였다. 즉 12/8/5/4/3/2로 설계된 보상표가 통째로 죽어 있었고
 * 승패·생사와 무관하게 고정값만 지급됐다.
 *
 * 판정은 domain/WinCondition.ts, 보상 계산은 domain/Progression.ts로 옮겼고
 * 여기에는 "그래서 화면에 무엇을 하는가"만 남는다.
 */
import type { Room, Team as TeamType } from "../types/Game.types.ts";
import { GamePhase, Team } from "../types/Game.types.ts";
import { Sound, WidgetFile } from "../constants/Assets.ts";
import { TIMING } from "../constants/GameConfig.ts";
import { roleName } from "../domain/Roles.ts";
import { evaluateWinner } from "../domain/WinCondition.ts";
import { forEachPlayer, playSound, say } from "./Broadcast.ts";
import { settleMatch } from "./Rewards.ts";
import { clearSilhouettes } from "./Stage.ts";
import { closeGhost, closeRoleCard, openPhase } from "./Widgets.ts";

/**
 * 승패가 갈렸으면 종료 처리를 하고 true를 돌려준다.
 * 사망이 발생할 수 있는 모든 지점 뒤에서 호출한다.
 */
export function finishIfDecided(room: Room): boolean {
	const winner = evaluateWinner(room.seats);
	if (winner === null) return false;
	finish(room, winner);
	return true;
}

export function finish(room: Room, winner: TeamType): void {
	room.phase = GamePhase.GAME_OVER;
	room.phaseTimer = TIMING.GAME_OVER;
	room.tickTockPlayed = true;

	clearSilhouettes(room);
	playSound(room, winner === Team.MAFIA ? Sound.MAFIA_WIN : Sound.CITIZEN_WIN);
	say(room, roster(room));

	forEachPlayer(room, (player, seat) => {
		closeRoleCard(player);
		closeGhost(player);
		player.hidden = false;
		player.moveSpeed = 80;
		player.sendUpdated();
		openPhase(player, winner === Team.MAFIA ? WidgetFile.WIN_MAFIA : WidgetFile.WIN_CITIZEN);
		settleMatch(player, seat, winner);
	});
}

/**
 * 종료 시 전원의 직업 공개.
 *
 * 기존에는 dead()가 죽는 순간 tag.role을 ""로 지워서 이 화면을 만들 수 없었다.
 * 좌석이 역할을 끝까지 들고 있게 되면서 가능해진 기능이다.
 */
function roster(room: Room): string {
	const lines: string[] = ["🔎 전원의 직업"];
	const ordered = room.seats.slice().sort((a, b) => a.index - b.index);
	for (const seat of ordered) {
		const mark = seat.alive ? "" : " ☠️";
		lines.push(`${seat.index}. ${seat.name} - ${roleName(seat.role)}${mark}`);
	}
	return lines.join("\n");
}
