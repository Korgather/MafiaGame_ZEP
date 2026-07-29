/**
 * 게임 진행 상태 머신. 시간이 흐르면 무슨 일이 일어나는가만 담당한다.
 *
 * 기존에는 이 로직이 App.onUpdate 콜백 하나에 통째로 들어 있었다.
 *   - CCU 보고 타이머
 *   - 대기실 카운트다운
 *   - 단계 타이머와 째깍 사운드
 *   - 단계 전이 switch
 * 네 가지가 한 함수에 섞여 있어서 전이 규칙 하나를 확인하려면
 * 나머지 셋을 함께 읽어야 했다. 게다가 카운트다운 라벨을 매 프레임
 * (초당 50회, 10초간 500회) 방 전원에게 브로드캐스트했다.
 *
 * 전이 자체는 startState()라는 250줄짜리 함수에 있었는데, 그 함수는
 * "상태 진입"과 "직전 상태의 정산"과 "승패 판정"을 동시에 했다.
 * 예를 들어 STATE_PLAYING_DAY 분기는 밤의 사망 정산부터 시작했다.
 * 여기서는 정산을 전이 시점에 명시적으로 호출하고, 각 단계의 진입은
 * Night/Voting/Outcome이 각자 책임진다.
 */
import type { ScriptPlayer } from "zep-script";
import type { Room, Seat } from "../types/Game.types.ts";
import { GamePhase } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import { MIN_PLAYERS, TIMING } from "../constants/GameConfig.ts";
import { buildRoleDeck, shuffle } from "../domain/RoleAssignment.ts";
import { roleDef } from "../domain/Roles.ts";
import { assignRole, readyCount, resetRoom } from "../entities/Room.ts";
import { allRooms } from "../entities/RoomRegistry.ts";
import { messageType } from "../types/Widget.types.ts";
import { centerLabel, forEachPlayer, playSound, say } from "./Broadcast.ts";
import { broadcastRoomCounts, enterLobby } from "./Lobby.ts";
import { openGhostView } from "./Death.ts";
import { beginNight, openNightView, resolveNight } from "./Night.ts";
import { finishIfDecided, openWinView } from "./Outcome.ts";
import { countPlay, refreshTitle } from "./Rewards.ts";
import { clearSilhouettes, resetPlayerAppearance } from "./Stage.ts";
import {
	beginDay,
	beginVote,
	beginVoteResult,
	openDayView,
	openVoteResultView,
	openVoteView,
} from "./Voting.ts";
import { closeGhost, closeRoleCard, openRoleCard } from "./Widgets.ts";

/**
 * 게임을 계속하려면 최소한 이만큼은 접속해 있어야 한다.
 * 혼자 남으면 승패가 영원히 갈리지 않아 방이 잠긴다 —
 * 기존에는 이 상황에서 방이 영구히 점유돼 아무도 들어갈 수 없었다.
 */
const MIN_CONNECTED = 2;

export function tick(dt: number): void {
	for (const room of allRooms()) {
		if (room.started) advanceGame(room, dt);
		else advanceLobby(room, dt);
	}
}

/**
 * 대기실: 전원 준비가 되면 카운트다운.
 *
 * 라벨은 남은 초가 바뀔 때만 보낸다. 기존에는 프레임마다 보냈다.
 */
function advanceLobby(room: Room, dt: number): void {
	const ready = readyCount(room);
	if (ready < MIN_PLAYERS || ready !== room.seats.length) {
		room.countdown = TIMING.START_COUNTDOWN;
		room.lastCountdownLabel = -1;
		return;
	}

	room.countdown -= dt;
	if (room.countdown <= 0) {
		beginGame(room);
		return;
	}

	const remaining = Math.ceil(room.countdown);
	if (remaining !== room.lastCountdownLabel) {
		room.lastCountdownLabel = remaining;
		centerLabel(room, `${remaining}초 후 게임이 시작됩니다.`, 1200);
	}
}

function advanceGame(room: Room, dt: number): void {
	if (connectedCount(room) < MIN_CONNECTED) {
		say(room, "👥 남은 인원이 부족해 게임이 중단되었습니다.");
		returnToLobby(room);
		return;
	}

	room.phaseTimer -= dt;

	if (!room.tickTockPlayed && room.phaseTimer < TIMING.TICK_TOCK_AT) {
		room.tickTockPlayed = true;
		playSound(room, Sound.TICK_TOCK);
	}

	if (room.phaseTimer > 0) return;
	room.phaseTimer = 0;
	advancePhase(room);
}

/**
 * 단계 전이표. 이 switch가 게임 규칙의 전부다.
 *
 * 승패 판정은 사망이 발생할 수 있었던 단계 직후에만 한다.
 * 밤은 resolveNight이, 투표는 beginVoteResult가 사망을 만든다.
 * 투표 결과 화면은 7초간 그대로 보여준 뒤 판정한다 —
 * 처형 즉시 판정하면 결과를 읽기도 전에 화면이 넘어간다.
 */
function advancePhase(room: Room): void {
	switch (room.phase) {
		case GamePhase.ROLE_REVEAL:
			beginNight(room);
			break;
		case GamePhase.NIGHT:
			resolveNight(room);
			if (!finishIfDecided(room)) beginDay(room);
			break;
		case GamePhase.DAY:
			beginVote(room);
			break;
		case GamePhase.VOTE:
			beginVoteResult(room);
			break;
		case GamePhase.VOTE_RESULT:
			if (!finishIfDecided(room)) beginNight(room);
			break;
		case GamePhase.GAME_OVER:
			returnToLobby(room);
			break;
		case GamePhase.LOBBY:
			break;
	}
}

/**
 * 진행 중인 방의 현재 화면을 한 사람에게 다시 그린다. 재접속 복구 경로.
 *
 * 화면은 지금까지 단계 전이(beginNight/beginDay/...)에서만 열렸다. 그래서
 * 좌석은 남겨두고 재접속시켜도 위젯이 하나도 없어 관전조차 못 하는 상태였다.
 * "단계에 들어간다"와 "그 단계를 한 사람에게 보여준다"는 서로 다른 일인데
 * 한 함수에 붙어 있었던 것이 원인이라, 각 단계에서 후자를 떼어냈다.
 *
 * beginX가 이 함수를 부르지 않고 각자 openXView를 부르는 것은 의도적이다.
 * 그렇게 하면 GameFlow ↔ Night/Voting/Outcome이 서로를 import하는 순환이
 * 생기고, babel·webpack·Jint를 거치는 이 프로젝트에서 순환 import는
 * 초기화 순서 문제로 되돌아온다. 대신 advancePhase와 이 switch를 나란히 둬서
 * 단계를 추가하면 두 곳이 동시에 눈에 띄게 했다.
 */
export function showPhaseView(room: Room, player: ScriptPlayer, seat: Seat): void {
	// 유령 채팅은 단계와 무관하게 죽은 사람에게 계속 떠 있어야 한다.
	// (게임이 끝나면 openWinView가 전원의 유령창을 정리한다)
	if (!seat.alive && room.phase !== GamePhase.GAME_OVER) openGhostView(player, seat);

	switch (room.phase) {
		case GamePhase.ROLE_REVEAL:
			openRoleCardView(player, seat);
			break;
		case GamePhase.NIGHT:
			openNightView(room, player, seat);
			break;
		case GamePhase.DAY:
			openDayView(room, player, seat);
			break;
		case GamePhase.VOTE:
			openVoteView(room, player, seat);
			break;
		case GamePhase.VOTE_RESULT:
			openVoteResultView(room, player, seat);
			break;
		case GamePhase.GAME_OVER:
			openWinView(room, player, seat);
			break;
		case GamePhase.LOBBY:
			break;
	}
}

/**
 * 게임 시작: 자리와 직업을 정하고 직업 카드를 띄운다.
 *
 * 기존 STATE_READY는 이 일을 하면서 room.players 배열 자체를 섞었다.
 * 배열 순서와 참가 번호가 동시에 의미를 가져서, 다른 코드가
 * `room.players[num]`으로 접근할 때마다 "이 num이 배열 인덱스인가
 * 참가 번호인가"를 헷갈렸다. 지금은 순서를 섞되 번호는 seat.index에만
 * 두고, 대상 탐색은 항상 seatAt(index)로 한다.
 */
function beginGame(room: Room): void {
	room.started = true;
	room.phase = GamePhase.ROLE_REVEAL;
	room.phaseTimer = TIMING.ROLE_REVEAL;
	// 직업 확인 5초 동안은 째깍 사운드를 울리지 않는다
	room.tickTockPlayed = true;
	room.countdown = 0;
	room.lastCountdownLabel = -1;
	room.turnCount = 0;
	room.total = room.seats.length;

	shuffle(room.seats);
	const deck = buildRoleDeck(room.seats.length);
	for (let i = 0; i < room.seats.length; i++) {
		assignRole(room.seats[i], i + 1, deck[i]);
	}

	forEachPlayer(room, (player, seat) => {
		countPlay(player);
		player.title = `${seat.index} 번 참가자`;
		player.sendUpdated();
		openRoleCardView(player, seat);
	});

	broadcastRoomCounts();
}

/**
 * 한 사람의 직업 카드.
 *
 * 기존에는 직업마다 HTML 파일이 따로 있어서 파일명만 넘겼다. 카드에는 그림
 * 한 장뿐이라 "당신은 의사입니다"까지만 알려주고, 무엇을 해야 하는지는
 * 알려주지 않았다. 직업을 추가하면 HTML도 하나 더 만들어야 했다.
 * 이제 카드는 하나이고 직업별 차이는 전부 이 payload로 간다.
 */
function openRoleCardView(player: ScriptPlayer, seat: Seat): void {
	const def = roleDef(seat.role);
	openRoleCard(player, {
		type: "init",
		role: def.displayName,
		team: seat.team,
		glyph: def.glyph,
		ability: def.ability,
		tip: def.tip,
		timer: TIMING.ROLE_REVEAL,
	}).onMessage.Add(handleCardMessage);
}

function handleCardMessage(player: ScriptPlayer, data: unknown): void {
	if (messageType(data) === "close") closeRoleCard(player);
}

/**
 * 방을 대기실 상태로 되돌린다. 승패 연출이 끝났을 때와
 * 인원이 부족해 중단됐을 때 모두 이 경로를 지난다.
 *
 * 기존에는 STATE_INIT 진입 코드와 gameReset()이 각각 절반씩 리셋했고
 * 두 함수가 리셋하는 필드 집합이 서로 달랐다.
 */
export function returnToLobby(room: Room): void {
	clearSilhouettes(room);

	// 좌석을 비우기 전에 대상을 확보한다. resetRoom이 seats를 비운다.
	const playerIds = room.seats.map(seat => seat.playerId);
	resetRoom(room);

	for (const playerId of playerIds) {
		const player = ScriptApp.getPlayerByID(playerId);
		if (!player) continue;
		closeRoleCard(player);
		closeGhost(player);
		resetPlayerAppearance(player);
		refreshTitle(player);
		enterLobby(player);
	}

	broadcastRoomCounts();
}

/**
 * 접속 중인 좌석 수.
 * seat.connected는 접속·이탈 이벤트에서 갱신되므로
 * 매 프레임 ScriptApp.getPlayerByID를 부르지 않아도 된다.
 */
function connectedCount(room: Room): number {
	let count = 0;
	for (const seat of room.seats) {
		if (seat.connected) count++;
	}
	return count;
}
