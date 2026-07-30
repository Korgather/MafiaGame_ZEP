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
import { assignRole, readyCount, resetRoom } from "../entities/Room.ts";
import { allRooms } from "../entities/RoomRegistry.ts";
import { guard } from "../infrastructure/Fault.ts";
import { centerLabel, forEachPlayer, label, playSound } from "./Broadcast.ts";
import { showRoleReveal } from "./Cards.ts";
import * as Chat from "./ChatService.ts";
import { advanceCut, playCut, showCut } from "./Cut.ts";
import { broadcastRoomCounts, enterLobby, refreshSpectators, seatSpectators } from "./Lobby.ts";
import { beginNight, broadcastNightProgress, openNightView, resolveNight } from "./Night.ts";
import { finishIfDecided, openWinView } from "./Outcome.ts";
import { countPlay } from "./Rewards.ts";
import {
	applyNameplate,
	clearSilhouettes,
	resetPlayerAppearance,
	spawnInLobby,
} from "./Stage.ts";
import {
	beginDay,
	beginVote,
	beginVoteResult,
	broadcastVoteProgress,
	openDayView,
	openVoteResultView,
	openVoteView,
} from "./Voting.ts";
import { closeCard, closeCut, closeMain } from "./Widgets.ts";

/**
 * 게임을 계속하려면 최소한 이만큼은 접속해 있어야 한다.
 * 혼자 남으면 승패가 영원히 갈리지 않아 방이 잠긴다 —
 * 기존에는 이 상황에서 방이 영구히 점유돼 아무도 들어갈 수 없었다.
 */
const MIN_CONNECTED = 2;

/**
 * 방 8개를 한 프레임 진행시킨다.
 *
 * 방마다 따로 격리하는 이유: 이 루프는 onUpdate 콜백 하나 안에서 돈다.
 * 3번 방에서 예외가 나면 그대로 위로 올라가 그 프레임의 4~8번 방은 아예
 * 실행되지 않았고, 원인이 방 상태에 남아 있으면 매 프레임 같은 자리에서
 * 다시 던져 뒤쪽 방들이 영구히 멈췄다. 방은 서로 독립이므로 사고의 범위도
 * 방 하나여야 한다.
 */
export function tick(dt: number): void {
	for (const room of allRooms()) {
		const ok = guard(`방 ${room.num} ${room.phase}`, () => {
			if (room.started) advanceGame(room, dt);
			else advanceLobby(room, dt);
		});
		if (!ok) recover(room);
	}
}

/**
 * 사고가 난 방을 대기실로 되돌린다.
 *
 * 그냥 넘기면 안 되는 이유: 예외의 원인은 대개 방 상태에 남아 있어서
 * 다음 프레임에 같은 자리에서 또 던진다. 격리만 해두면 그 방은 아무 표시도
 * 없이 영원히 멈춘 채 자리를 점유하고, 안에 있는 사람은 왜 게임이 흐르지
 * 않는지 알 수 없다. 되돌려야 방이 풀리고 다시 시작할 수 있다.
 *
 * 되돌리는 일 자체가 또 던질 수 있다 — 방 상태가 이미 깨져 있으니 오히려
 * 그럴 법하다. 그때는 사람에게 알리는 것도 위젯을 걷는 것도 포기하고
 * 방만 비운다. 화면이 남는 것은 다음 판에 덮이지만, 방이 잠기면 그 자리는
 * 서버가 재시작할 때까지 아무도 쓸 수 없다.
 */
function recover(room: Room): void {
	const ok = guard(`방 ${room.num} 복구`, () => {
		Chat.say(room, "⚠️ 오류가 발생해 게임을 중단했습니다. 대기실로 돌아갑니다.");
		returnToLobby(room);
	});
	if (!ok) resetRoom(room);
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
		Chat.say(room, "👥 남은 인원이 부족해 게임이 중단되었습니다.");
		returnToLobby(room);
		return;
	}

	room.phaseTimer -= dt;
	// 컷은 단계 안에서 산다. 단계 시간을 컷 길이만큼 늘려 두었으므로(playCut)
	// 같은 dt로 함께 줄이면 컷이 걷히는 시점과 단계가 끝나는 시점이 서로 밀리지 않는다.
	advanceCut(room, dt);

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
	// 관전 화면은 begin*의 forEachPlayer 루프에 들어가지 않는다(그 루프는
	// 좌석만 돈다). 그래서 단계 표시·타이머·사망자 목록을 여기서 갱신한다.
	refreshSpectators(room);
	// 단계가 바뀌면 채팅 권한도 바뀐다 (밤 → 마피아 탭, 낮 → 방 탭).
	// 전이 switch 바로 옆에 두는 이유는, 단계를 추가하는 사람이 채팅 권한
	// 갱신을 따로 기억하지 않아도 되게 하기 위해서다.
	Chat.refreshRoom(room);
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
	switch (room.phase) {
		case GamePhase.ROLE_REVEAL:
			showRoleReveal(player, seat, room.phaseTimer);
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
	// 컷은 단계 화면 위에 얹힌다. 맨 뒤인 것이 중요하다 — 위젯은 뜬 순서대로
	// 쌓이므로(그래서 컷은 zIndex도 함께 싣는다) 단계 화면보다 먼저 열면 가려진다.
	showCut(room, player);
}

/**
 * 진행률의 분모가 바뀌었음을 방 전원에게 알린다. 사람이 나가거나 돌아온 순간.
 *
 * 분모는 좌석 수가 아니라 "접속해 있고 아직 할 일이 남은 사람"이다. 끊긴
 * 사람을 남겨두면 절대 안 차는 막대가 되기 때문인데, 정작 그 값은 누군가
 * 행동했을 때만 다시 계산됐다. 그래서 밤에 한 명이 끊기면 남은 전원이 이미
 * 마쳤는데도 막대가 2/3에 멈춰 있었다 — 막대가 막으려던 상황이 그대로
 * 재현된 셈이다.
 *
 * 단계별로 갈라지는 일이라 showPhaseView와 나란히 둔다. Night·Voting이
 * GameFlow를 부르는 방향이었다면 순환 import가 되므로, 단계를 아는 쪽이
 * 단계를 모르는 쪽을 부르는 이 방향을 지킨다.
 */
export function refreshProgress(room: Room): void {
	if (room.phase === GamePhase.NIGHT) broadcastNightProgress(room);
	else if (room.phase === GamePhase.VOTE) broadcastVoteProgress(room);
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

	// 컷을 먼저 건다. playCut이 phaseTimer를 컷 길이만큼 늘리므로, 아래에서
	// 카드에 실어 보내는 남은 시간이 늘어난 값이어야 서버와 화면이 같은 시계를 본다.
	playCut(room, "neutral", "🎭 게임 시작", [`${room.total}명이 참가합니다.`]);

	forEachPlayer(room, (player, seat) => {
		countPlay(player);
		applyNameplate(player, seat);
		player.sendUpdated();
		// 대기실 위젯을 먼저 치운다. 직업 카드는 별도 슬롯이라 이걸 빼면
		// 준비 버튼이 달린 대기실 화면이 직업 공개 5초 내내 뒤에 남는다.
		// 게다가 이 순간 재접속한 사람은(showPhaseView가 카드만 연다)
		// 대기실 화면이 없어서, 머문 사람과 돌아온 사람의 화면이 갈렸다.
		closeMain(player);
		showRoleReveal(player, seat, room.phaseTimer);
	});

	// 대기실 채팅에서 방 채팅으로. 마피아에게는 이 시점에 마피아 탭이 생긴다
	Chat.refreshRoom(room);
	// 권한을 바꾼 뒤에 보낸다. 먼저 보내면 마피아 탭이 아직 없는 상태에서
	// 방 탭 미확인만 올라가고, 곧바로 온 탭 목록이 그 수를 덮어쓴다
	Chat.say(room, `🎭 ${room.total}명으로 게임을 시작합니다. 직업을 확인하세요.`);
	broadcastRoomCounts();
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
	/*
	 * 관전자도 마찬가지다. resetRoom은 두 목록을 모두 비우므로 먼저 떠 놓고,
	 * 방이 빈 뒤에 좌석으로 앉힌다.
	 *
	 * 순서가 중요하다. 앉히기를 아래 루프보다 먼저 끝내야 enterLobby가 그리는
	 * 좌석 목록에 새로 앉은 사람이 들어간다 — 뒤집으면 방금까지 같이 있던
	 * 사람들의 화면에 서로가 안 보이고, 다음 갱신이 올 때까지 그대로다.
	 */
	const watchers = room.spectators.slice();
	resetRoom(room);
	const promoted = seatSpectators(room, watchers);

	// 관전자도 같은 대접을 받는다. 앉지 못한 사람까지 포함하는 것이 중요한데,
	// 그 사람들의 화면은 아직 관전 화면이라 여기서 걷어주지 않으면 끝난 판을
	// 계속 보게 된다(enterLobby가 메인 위젯을 대기실로 덮는다).
	for (const playerId of playerIds.concat(watchers.map(seat => seat.playerId))) {
		const player = ScriptApp.getPlayerByID(playerId);
		if (!player) continue;
		closeCard(player);
		// 컷이 도는 중에 방이 끝날 수 있다 — 인원 부족(advanceGame)과 사고 복구
		// (recover)가 그 경로다. resetRoom은 room.cut만 지우므로 화면은 여기서 걷는다.
		closeCut(player);
		// 이름표를 판 밖 모습으로 되돌린다. 이 안에서 등급을 다시 계산하므로
		// 방금 올라간 레벨이 여기서 반영된다(Outcome이 먼저 정산을 끝냈다).
		resetPlayerAppearance(player);
		// 화면만 대기실로 돌려보내면 몸은 방금 끝난 방 좌석에 남는다.
		// 방으로 들어가는 이동은 첫 밤의 seatPlayer 하나뿐이고 되돌리는 짝이
		// 없었다. 다음 판 첫 밤에 seatPlayer가 다시 옮겨줘서 증상이 스스로
		// 지워졌던 자리다. 접속 경로(index.ts)와 같은 두 줄로 맞춘다.
		spawnInLobby(player);
		enterLobby(player);
		// 좌석이 사라졌으므로 마피아·유령 탭도 함께 사라진다
		Chat.refresh(player);
	}

	// 기다린 사람에게만 결과를 알린다. 좌석 목록이 떴다는 것만으로는
	// "내가 이 방에 앉았다"가 눈에 띄지 않는다 — 방금까지 보던 화면과
	// 자리에 앉은 화면이 둘 다 이 방의 화면이기 때문이다.
	for (const playerId of promoted) {
		const player = ScriptApp.getPlayerByID(playerId);
		if (player) label(player, "👥 자리에 앉았습니다. 준비를 눌러 시작하세요.");
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
