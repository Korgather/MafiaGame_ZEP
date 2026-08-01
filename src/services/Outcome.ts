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
import type { MessageRow } from "../domain/chat/ChatMessage.ts";
import { evaluateWinner } from "../domain/WinCondition.ts";
import { enterPhase, revealViews } from "../entities/Room.ts";
import { forEachPlayer, playSound } from "./Broadcast.ts";
import * as Chat from "./ChatService.ts";
import { playCut } from "./Cut.ts";
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
	enterPhase(room, GamePhase.GAME_OVER);
	room.phaseTimer = room.ruleSet.timing.GAME_OVER;
	room.tickTockPlayed = true;
	room.winner = winner;
	// 판 요약을 외부로 내보내는 자리다. 시즌 1은 계측 없이 출하했다 —
	// 받는 쪽이 없는데 보내면 데이터가 버려지고, 대신 보낸다는 사실만 남아
	// "계측이 있다"고 오해된다.
	//
	// 붙일 때 필요한 것:
	//  - 경로: Ccu.ts의 httpPostJson과 같은 엔드포인트를 쓸 수 있다. 그쪽은
	//    collection: "CCU"로 쓰고 있으므로 collection만 바꾸면 된다. 다만 그
	//    DB가 다른 collection을 받는지, 받은 것을 읽을 방법이 있는지는
	//    확인되지 않았다.
	//  - 내용: winner, room.seats.length, room.turnCount, 모드 id
	//  - 집계 대상: 참가 6인 이상만. 4~5인은 구성표가 다른 연습 판이다.
	//    (연습 판 격리는 docs/superpowers/specs/2026-07-30-season0-1-execution-design.md D8)

	clearSilhouettes(room);
	playSound(room, winner === Team.MAFIA ? Sound.MAFIA_WIN : Sound.CITIZEN_WIN);
	Chat.announce(room, "🔎 전원의 직업", roster(room));
	// 방 밖에도 한 줄 흘린다. 로비에 선 사람이 어느 방이 곧 비는지 알 수 있는
	// 유일한 단서이고, 전체 채팅 탭이 잡담만으로 채워지지 않게 하는 것도 겸한다.
	Chat.worldNotice(`🏁 ${room.num}번 방 — ${winner === Team.MAFIA ? "마피아" : "시민"} 승리`);

	// 컷이 phaseTimer를 늘린다. 아래 openWinView가 그 값을 화면에 싣는다
	playCut(
		room,
		winner === Team.MAFIA ? "mafia" : "citizen",
		winner === Team.MAFIA ? "🔪 마피아 승리" : "🕊️ 시민 승리",
		closingLines(room, winner)
	);

	forEachPlayer(room, (player, seat) => {
		openWinView(room, player, seat);
		// 보상은 판당 한 번이다. 재접속으로 화면만 다시 열릴 때는 지급하지 않는다.
		settleMatch(player, seat, winner);
	});

	// 판이 끝나면 마피아·유령 채널의 비밀이 풀린다 — 전원이 방 채팅으로 모인다
	Chat.refreshRoom(room);
}

/**
 * 승리 컷에 실을 줄들 — "마지막에 무슨 일이 있었고, 그래서 왜 끝났는가".
 *
 * 판이 끝나는 길은 둘뿐이고 둘은 겹치지 않는다. 처형으로 끝나면
 * beginVoteResult가 voteRecord.message를 채운 직후이고(outcomeMessage는
 * 빈 문자열을 돌려주지 않는다), 밤에 끝나면 resolveNight이 nightReport를
 * 새로 채운 직후다 — 그리고 beginNight의 resetRound가 voteRecord를 지운다.
 * 그래서 둘 중 채워진 쪽 하나만 고르면 마지막 장면이 정확히 한 번 나온다.
 *
 * slice()가 필요한 이유는 아래 push다. 원본을 그대로 받으면 room.nightReport에
 * 승리 사유가 눌러붙고, 그 배열은 낮 화면(openDayView의 deaths)도 함께 본다.
 */
function closingLines(room: Room, winner: TeamType): string[] {
	const lines = room.voteRecord.message ? [room.voteRecord.message] : room.nightReport.slice();
	lines.push(winReason(winner));
	return lines;
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
 *
 * 종료 위젯과 같은 revealViews를 쓴다. 좌석을 여기서 다시 정렬해 문자열로
 * 빚던 동안에는 같은 표가 두 곳에서 따로 만들어졌고, 실제로 갈라져 있었다 —
 * 위젯은 구조를 받아 팀 색을 칠했는데 채팅은 문자열이라 전부 한 색이었다.
 */
function roster(room: Room): MessageRow[] {
	return revealViews(room).map(view => ({
		// ☠️는 dim과 겹쳐 보이지만 색에 기대지 않는 유일한 표시다
		label: `${view.num}. ${view.name}${view.alive ? "" : " ☠️"}`,
		value: view.role,
		tone: view.team,
		dim: !view.alive,
	}));
}
