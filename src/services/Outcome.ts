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
import type { ScriptPlayer } from "zep-script";
import type { Room, Seat, Team as TeamType } from "../types/Game.types.ts";
import { GamePhase, Team } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import { TIMING } from "../constants/GameConfig.ts";
import { roleName } from "../domain/Roles.ts";
import { evaluateWinner } from "../domain/WinCondition.ts";
import { revealViews } from "../entities/Room.ts";
import { forEachPlayer, playSound } from "./Broadcast.ts";
import * as Chat from "./ChatService.ts";
import { settleMatch } from "./Rewards.ts";
import { clearSilhouettes } from "./Stage.ts";
import { closeCard, openGameOver } from "./Widgets.ts";

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
	room.winner = winner;

	clearSilhouettes(room);
	playSound(room, winner === Team.MAFIA ? Sound.MAFIA_WIN : Sound.CITIZEN_WIN);
	Chat.announce(room, roster(room));
	// 방 밖에도 한 줄 흘린다. 로비에 선 사람이 어느 방이 곧 비는지 알 수 있는
	// 유일한 단서이고, 전체 채팅 탭이 잡담만으로 채워지지 않게 하는 것도 겸한다.
	Chat.worldNotice(`🏁 ${room.num}번 방 — ${winner === Team.MAFIA ? "마피아" : "시민"} 승리`);

	forEachPlayer(room, (player, seat) => {
		openWinView(room, player, seat);
		// 보상은 판당 한 번이다. 재접속으로 화면만 다시 열릴 때는 지급하지 않는다.
		settleMatch(player, seat, winner);
	});

	// 판이 끝나면 마피아·유령 채널의 비밀이 풀린다 — 전원이 방 채팅으로 모인다
	Chat.refreshRoom(room);
}

/** 왜 끝났는가. 승리 조건을 화면에 한 줄로 설명한다 */
function winReason(winner: TeamType): string {
	return winner === Team.MAFIA
		? "마피아 수가 시민 수와 같아졌습니다."
		: "마피아가 모두 사라졌습니다.";
}

/**
 * 한 사람의 종료 화면. 승패 연출 도중 재접속한 사람에게도 같은 화면을 준다.
 *
 * 보상 지급은 여기 넣지 않는다 — 화면은 몇 번을 다시 열어도 되지만
 * 경험치는 한 번만 줘야 하기 때문이다. 둘을 한 함수에 두면 그 구분이 사라진다.
 */
export function openWinView(room: Room, player: ScriptPlayer, seat: Seat): void {
	closeCard(player);
	player.hidden = false;
	player.moveSpeed = 80;
	player.sendUpdated();

	// winner는 GAME_OVER에 들어간 순간 정해진다. 도중 재접속 경로도 여기를 지난다.
	const winner = room.winner === null ? Team.CITIZEN : room.winner;
	openGameOver(player, {
		type: "init",
		winner,
		team: seat.team,
		reason: winReason(winner),
		players: revealViews(room),
		timer: room.phaseTimer,
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
