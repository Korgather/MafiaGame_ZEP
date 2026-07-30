/**
 * 대기실: 참가·준비·강퇴·퇴장.
 *
 * 기존 WatingRoomOnMessage의 문제:
 *
 * 1. 위젯에 델타를 보냈다. join/ready/cancle-ready/kick/cancle-kick/leave
 *    6종의 메시지로 클라이언트가 자기 목록을 조금씩 고쳤다. 한 건이라도
 *    유실되거나 순서가 뒤바뀌면 화면이 서버와 영구히 어긋났고,
 *    그 상태를 되돌릴 방법이 없었다. 최대 8행짜리 목록이므로
 *    매번 전체를 보내는 편이 더 싸고 더 안전하다.
 *
 * 2. updatePlayerCount가 GAMEROOM 객체 전체(플레이어 배열·타이머·상태 포함)를
 *    로비의 모든 사람에게 보냈다. 위젯이 쓰는 값은 인원수와 진행 여부 둘뿐이다.
 *
 * 3. 강퇴 쿨다운을 player.tag.kickUntil에 저장했다. 월드를 나갔다 들어오면
 *    tag가 새로 만들어져 쿨다운이 사라졌다 — 강퇴가 사실상 무의미했다.
 */
import type { ScriptPlayer } from "zep-script";
import type { Room, Seat } from "../types/Game.types.ts";
import type { LobbySeatView } from "../types/Widget.types.ts";
import { GamePhase, Team } from "../types/Game.types.ts";
import { ACTION_RATE, KICK, MAX_SPECTATORS } from "../constants/GameConfig.ts";
import { Sound } from "../constants/Assets.ts";
import { isValidRoomNum } from "../constants/RoomLayout.ts";
import { spend } from "../domain/RateLimit.ts";
import {
	aliveSeats,
	createSeat,
	findSeat,
	kickCount,
	kickVotesNeeded,
	removeSeat,
	removeSpectator,
	toggleKick,
	withdrawKicks,
} from "../entities/Room.ts";
import { allRooms, attachedRoom, getRoom, locate, locateSpectator } from "../entities/RoomRegistry.ts";
import * as Storage from "../infrastructure/PlayerStorage.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";
import { asInt, field, messageType } from "../types/Widget.types.ts";
import { centerLabel, forEachSpectator, label } from "./Broadcast.ts";
import { needsGuide, showBook, showGuide } from "./Cards.ts";
import * as Chat from "./ChatService.ts";
import { countAbandon, rankOf } from "./Rewards.ts";
import type { PhasePayload } from "./Widgets.ts";
import { bindMessage, openLobby, openPhase, pushLobby, updateMain } from "./Widgets.ts";

/**
 * 강퇴 쿨다운. player.tag가 아니라 여기에 둔다.
 * ponytail: 프로세스 메모리라 스크립트 재시작 시 초기화된다.
 * 30초짜리 값이라 영속화할 가치가 없다.
 */
const kickedUntil: { [playerId: string]: number } = {};

function isKickBanned(playerId: string): boolean {
	const until = kickedUntil[playerId];
	return typeof until === "number" && until > Time.getUtcTime();
}

/** 대기실 위젯을 열고 현재 상태를 그린다 */
export function enterLobby(player: ScriptPlayer): void {
	bindMessage(openLobby(player), "lobby", handleMessage);
	pushSeatList(player);
	pushRoomCounts(player);
}

/**
 * 이 플레이어가 보는 좌석 목록을 다시 그린다.
 *
 * 목록이 비어 있으면 lobby.html은 방 선택 화면을 그린다. 그 화면은 좌석
 * 목록보다 낮아도 되므로 크기도 함께 바뀌어야 하는데, 그 판단은 Widgets의
 * pushLobby가 한 곳에서 한다 — 여기서 sendMessage를 직접 부르면 크기를
 * 바꾸는 것을 잊는 자리가 다시 생긴다.
 */
function pushSeatList(player: ScriptPlayer): void {
	const found = locate(player.id);
	pushLobby(player, found ? lobbySeatViews(found.room) : []);
}

/** 방 안 전원의 목록을 갱신한다 (한 명이라도 바뀌면 전원에게) */
function refreshRoom(room: Room): void {
	const views = lobbySeatViews(room);
	for (const seat of room.seats.slice()) {
		const player = ScriptApp.getPlayerByID(seat.playerId);
		if (!player) continue;
		pushLobby(player, views);
	}
}

/**
 * 대기실 목록 한 줄. 게임 중 화면이 쓰는 entities/Room.ts의 seatViews와는
 * 다른 것이다 — 저쪽은 참가 번호와 생존 여부를, 이쪽은 레벨·준비·강퇴표를 담는다.
 * 이름이 같으면 잘못 가져다 쓰기 딱 좋아서 여기만 lobby를 붙여 둔다.
 */
function lobbySeatViews(room: Room): LobbySeatView[] {
	return room.seats.map(seat => {
		const storage = readRunCount(seat.playerId);
		return {
			id: seat.playerId,
			name: seat.name,
			rank: seat.rank,
			runCount: storage,
			ready: seat.ready,
			kickCount: kickCount(seat),
		};
	});
}

function readRunCount(playerId: string): number {
	const player = ScriptApp.getPlayerByID(playerId);
	if (!player) return 0;
	const storage = Storage.read(player);
	return storage.playCount || 0;
}

/** 방 목록의 인원수. 위젯이 쓰는 두 값만 보낸다 */
export function pushRoomCounts(player: ScriptPlayer): void {
	const widget = tagOf(player).widget;
	if (widget) widget.sendMessage({ type: "updatePlayerCount", data: roomCounts() });
}

/** 로비에 있는 모두에게 방 목록 갱신 */
export function broadcastRoomCounts(): void {
	const counts = roomCounts();
	for (const player of ScriptApp.players) {
		// 방 안에 있는 사람에게는 필요 없다. 관전자도 방 안이다 —
		// 그 사람의 메인 위젯은 대기실이 아니라 관전 화면이라 이 메시지를
		// 받아도 그릴 곳이 없다.
		if (attachedRoom(player.id)) continue;
		const widget = tagOf(player).widget;
		if (widget) widget.sendMessage({ type: "updatePlayerCount", data: counts });
	}
}

interface RoomCount {
	count: number;
	started: boolean;
	/** 지켜보는 사람 수. 참가 인원과 절대 합치지 않는다 */
	watching: number;
}

function roomCounts(): { [roomNum: string]: RoomCount } {
	const counts: { [roomNum: string]: RoomCount } = {};
	for (const room of allRooms()) {
		counts[`${room.num}`] = {
			count: room.seats.length,
			started: room.started,
			watching: room.spectators.length,
		};
	}
	return counts;
}

function handleMessage(player: ScriptPlayer, data: unknown): void {
	/*
	 * 다섯 갈래가 전부 남에게 메시지를 밀어낸다 — 참가·퇴장은 방 전원의
	 * 채팅에 알림을 남기고 접속자 전원에게 방 목록을 다시 보내며, 준비와
	 * 강퇴는 방 전원의 좌석 목록을 다시 그린다. 클릭 한 번의 값을 내가 아니라
	 * 남들이 치르는 구조라, 채팅과 정확히 같은 종류의 도배 경로다.
	 *
	 * 그래서 관문을 갈래마다가 아니라 갈림길 앞에 하나 세운다. 다섯 곳에
	 * 흩어 두면 나중에 여섯 번째 case를 추가하는 사람이 빠뜨린다.
	 *
	 * 채팅과 달리 라벨로 알리지 않는다. 스스로 도배한다고 생각하지 않은
	 * 사람에게 뜨는 경고는 설명이 아니라 잡음이고, 위젯이 서버가 보낸
	 * 상태만 그리므로(iAmReady는 paintSeats에서만 바뀐다) 한 번 버려도
	 * 화면이 어긋나지 않는다 — 다음 갱신이 어차피 진실을 덮어쓴다.
	 */
	if (!spend(tagOf(player).actionRate, ACTION_RATE, Time.getUtcTime())) return;

	switch (messageType(data)) {
		case "join":
			join(player, asInt(field(data, "roomNum")));
			break;
		case "ready":
			setReady(player, true);
			break;
		case "cancle-ready":
			setReady(player, false);
			break;
		case "kick":
			voteKick(player, field(data, "id"));
			break;
		case "quit":
			leave(player);
			break;
		case "book":
			showBook(player);
			break;
	}
}

function join(player: ScriptPlayer, roomNum: number | null): void {
	if (roomNum === null || !isValidRoomNum(roomNum)) return;
	if (attachedRoom(player.id)) return; // 이미 어느 방에 앉아 있거나 보고 있다

	const room = getRoom(roomNum);
	if (!room) return;

	// 강퇴 검사를 위로 올렸다. 아래 두 갈래(참가·관전) 모두 "이 방에 들어온다"는
	// 같은 일이고, 갈래마다 검사를 붙이면 세 번째 갈래가 생길 때 빠뜨린다.
	if (isKickBanned(player.id)) {
		label(player, "강퇴당한 직후에는 잠시 참가할 수 없습니다.");
		return;
	}
	// 진행 중인 방은 튕겨내는 대신 관전으로 받는다. 한 판이 5~15분이라
	// 늦게 온 사람에게 "나중에 오세요"는 곧 나가라는 말과 같았다.
	if (room.started) {
		spectate(player, room);
		return;
	}
	// 정원은 방마다 다르다. 속도전은 8명이 상한이고, 그 위로 올라가면
	// firstNightPeacefulUpTo(8)를 넘겨 첫 밤에 사람이 죽기 시작한다 —
	// "3분 단판"으로 초보를 받는 방에서 그것이 일어나면 안 된다.
	if (room.seats.length >= room.ruleSet.maxPlayers) {
		label(player, "방이 가득 찼습니다.");
		return;
	}

	const name = player.name;
	room.seats.push(createSeat(player.id, name, rankOf(player)));
	player.playSound(Sound.JOIN);

	// 방 탭이 생겼다는 것을 먼저 알린 뒤 입장 알림을 흘린다.
	// 순서를 뒤집으면 본인만 자기 입장 알림을 못 본다 — 알림이 도착하는
	// 시점에 아직 방 탭이 없기 때문이다.
	Chat.refresh(player);
	Chat.notice(room, `🚪 ${name} 님이 입장했습니다.`);
	// 어느 규칙의 방인지 들어온 사람에게만 알린다. 온보딩 카드에 넣지 않은
	// 이유는 그 카드가 첫 판인 사람에게만 뜨고(needsGuide) 안내판 트리거에서도
	// 열려 방이 스코프에 없기 때문이다 — 거기 넣으면 거의 아무도 못 본다
	Chat.tell(player, `📋 ${room.ruleSet.displayName} — ${room.ruleSet.summary}`);

	refreshRoom(room);
	broadcastRoomCounts();

	/*
	 * 첫 안내는 방을 고른 직후에 띄운다.
	 *
	 * 접속 직후(index.ts)가 아닌 이유는 그때는 아직 아무것도 고르지 않아서
	 * "무엇을 하려는 참인가"가 없기 때문이다. 방에 들어온 사람은 한 판을 할
	 * 작정이 선 사람이고, 준비 버튼을 누르기 전까지는 읽을 시간도 있다.
	 *
	 * 카드는 대기실 위젯 위에 겹쳐 뜨므로 좌석 목록이 사라지지 않고, 닫으면
	 * 바로 아래에 방금 들어온 방이 그대로 있다.
	 */
	if (needsGuide(player)) showGuide(player);
}

// ────────────────────────────────────────────────────────────── 관전

/**
 * 관전 화면의 한 줄 안내.
 *
 * 단계마다 문구를 바꾸지 않는다. 관전자가 할 수 있는 일은 판이 끝날 때까지
 * 하나도 변하지 않으므로("보다가, 끝나면 앉는다"), 바뀌는 문구는 정보가 아니라
 * 깜빡임이다. 무슨 일이 일어나는지는 화면 가운데의 밤/아침 표시와 방 채팅이 말한다.
 */
const SPECTATE_NOTE = "관전 중입니다. 이번 판이 끝나면 자리에 앉습니다.";

/**
 * 진행 중인 방을 지켜본다. 좌석은 주지 않는다.
 *
 * 좌석과 같은 Seat 값을 만들되 room.spectators에 넣는 것이 전부다. 그래서
 * 승패 판정·개표·밤 지목·번호 배정·인원수·준비 판정 어느 것도 이 사람을
 * 볼 수 없다 — 관전자를 "무시해야 하는" 코드가 한 줄도 생기지 않는다.
 *
 * 아바타는 옮기지 않는다. 방 안으로 들여보내면 밤의 숨기기·실루엣 배치가
 * 관전자까지 상대해야 하고, 무엇보다 몸이 방 안에 있으면 참가자에게는
 * 판에 낀 사람처럼 보인다.
 */
function spectate(player: ScriptPlayer, room: Room): void {
	if (room.spectators.length >= MAX_SPECTATORS) {
		label(player, "관전 인원이 가득 찼습니다.");
		return;
	}

	room.spectators.push(createSeat(player.id, player.name, rankOf(player)));

	// 방 탭을 먼저 붙인 뒤 화면을 연다. 순서를 뒤집으면 관전 화면이 뜬 뒤에야
	// 채팅 탭이 생겨서, 지금까지의 대화를 못 받은 것처럼 보인다.
	Chat.refresh(player);
	openSpectateView(room, player);
	broadcastRoomCounts();
	label(player, "👀 관전을 시작합니다.");
}

/**
 * 관전자가 판 내내 보는 화면. 참가자와 달리 단계마다 위젯을 갈아끼우지 않는다.
 *
 * 투표 격자도 밤 지목 격자도 관전자에게는 누를 것이 하나도 없는 화면이다.
 * 게다가 단계마다 위젯을 바꾸면 여기 달린 "관전 종료" 버튼이 나타났다
 * 사라졌다 하고, 그때마다 위젯이 새로 떠서 화면이 깜빡인다.
 * 진행 화면 하나를 띄워두고 내용만 다시 그린다(refreshSpectators).
 */
function openSpectateView(room: Room, player: ScriptPlayer): void {
	bindMessage(openPhase(player, spectateView(room)), "spectate", (sender, data) => {
		if (messageType(data) !== "spectate-quit") return;
		// 이 버튼 한 번이 접속자 전원에게 방 목록을 다시 보낸다.
		// 대기실 위젯의 다섯 갈래와 같은 이유로 같은 관문을 지난다.
		if (!spend(tagOf(sender).actionRate, ACTION_RATE, Time.getUtcTime())) return;
		stopSpectating(sender);
	});
}

/** 진행 중인 방을 밖에서 본 모습 */
function spectateView(room: Room): PhasePayload {
	const night = room.phase === GamePhase.NIGHT;
	return {
		type: "init",
		phase: night ? "night" : "day",
		turn: night ? room.turnCount + 1 : room.turnCount,
		total: room.total,
		aliveCount: aliveSeats(room).length,
		timer: room.phaseTimer,
		/*
		 * 직업 칩 자리에 "지금 나는 무엇인가"를 넣는다. alive:false는 유령이라는
		 * 뜻이 아니라 "이 판의 바깥"을 나타내는 회색 표시를 그대로 쓰는 것이다 —
		 * 관전자와 유령은 화면상 똑같이 "볼 수만 있는 사람"이고, 둘을 다른 색으로
		 * 나누려면 phase.html에 관전 전용 클래스가 하나 더 필요해진다.
		 */
		role: "관전",
		team: Team.CITIZEN,
		alive: false,
		note: SPECTATE_NOTE,
		deaths: room.nightReport,
		spectating: true,
	};
}

/**
 * 단계가 바뀌었을 때 관전 화면을 다시 그린다.
 *
 * 참가자 화면은 beginNight/beginDay/...가 forEachPlayer로 여는데, 그 루프는
 * 좌석만 돈다(그래야 관전자가 직업 카드나 지목 격자를 받지 않는다).
 * 그래서 관전 화면을 갱신하는 책임이 따로 필요하고, GameFlow.advancePhase가
 * 채팅 권한 갱신 바로 옆에서 한 번 부른다.
 */
export function refreshSpectators(room: Room): void {
	if (room.spectators.length === 0) return;
	const view = spectateView(room);
	forEachSpectator(room, player => updateMain(player, view));
}

/** 관전자 목록에서만 뺀다. 화면을 어떻게 되돌릴지는 부르는 쪽이 정한다 */
function dropSpectator(room: Room, playerId: string): void {
	removeSpectator(room, playerId);
	broadcastRoomCounts();
}

/** 관전을 그만두고 방 선택 화면으로 돌아간다 */
function stopSpectating(player: ScriptPlayer): void {
	const watching = locateSpectator(player.id);
	if (!watching) return;
	dropSpectator(watching.room, player.id);
	// 대기실 위젯이 관전 화면을 덮는다(메인 위젯 슬롯은 하나뿐이다)
	enterLobby(player);
	// 방 탭이 사라진다
	Chat.refresh(player);
}

/**
 * 판이 끝났을 때 관전자를 좌석에 앉힌다. 돌려주는 값은 앉은 사람들의 id.
 *
 * 관전의 값은 대부분 여기에 있다. 5~15분을 기다린 사람을 판이 끝나는 순간
 * 방 선택 화면으로 돌려보내면, 그 사람은 다시 방을 고르는 사이에 이미 다음
 * 판 준비가 시작된 방을 보게 된다. 기다린 사람이 가장 늦게 앉는 구조다.
 *
 * 자리가 모자라면 앞에 온 사람부터 앉는다. 관전 정원(8)이 어느 방의 좌석
 * 정원보다도 크지 않으니 — 표준·침묵전은 12, 속도전은 8이다 — 지금 실제로
 * 밀려나는 사람은 접속이 끊긴 사람뿐이다. 아래 break는 그래서 지금 도달하지
 * 않지만, 두 정원의 관계가 뒤집혔을 때 좌석이 조용히 넘치는 것을 막는 자리라
 * 남겨둔다. 관계 자체는 spectate.test.ts가 지킨다.
 */
export function seatSpectators(room: Room, watchers: readonly Seat[]): string[] {
	const seated: string[] = [];
	for (const watcher of watchers) {
		if (room.seats.length >= room.ruleSet.maxPlayers) break;
		// 좌석의 connected 대신 지금 접속을 직접 확인한다. 관전자의 connected는
		// 화면을 보낼 때만 내려가는 값이라 마지막 갱신 이후의 이탈을 모른다.
		if (!ScriptApp.getPlayerByID(watcher.playerId)) continue;
		room.seats.push(watcher);
		seated.push(watcher.playerId);
	}
	return seated;
}

function setReady(player: ScriptPlayer, ready: boolean): void {
	const found = locate(player.id);
	if (!found || found.room.started) return;
	found.seat.ready = ready;
	refreshRoom(found.room);
}

function voteKick(player: ScriptPlayer, targetId: unknown): void {
	if (typeof targetId !== "string") return;
	const found = locate(player.id);
	if (!found || found.room.started) return;
	if (targetId === player.id) return; // 자기 자신은 강퇴할 수 없다

	const target = findSeat(found.room, targetId);
	if (!target) return;

	toggleKick(target, player.id);

	if (kickCount(target) >= kickVotesNeeded(found.room.seats.length)) {
		kickedUntil[targetId] = Time.getUtcTime() + KICK.COOLDOWN_MS;
		removeFromRoom(found.room, targetId, true);
		return;
	}
	refreshRoom(found.room);
}

/** 대기실에서 스스로 나가기 */
export function leave(player: ScriptPlayer): void {
	const found = locate(player.id);
	// 좌석이 없으면 관전 중일 수 있다. "나가기"는 방에 매인 것을 푸는 일이지
	// 좌석을 비우는 일이 아니라서, 둘 중 어느 쪽인지는 여기서 가른다.
	if (!found) {
		stopSpectating(player);
		return;
	}
	if (found.room.phase !== GamePhase.LOBBY) {
		label(player, "게임 중에는 나갈 수 없습니다.");
		return;
	}
	removeFromRoom(found.room, player.id, false);
}

/**
 * 접속이 끊겼을 때. 대기실이면 좌석을 비우고, 게임 중이면 좌석을 남긴다.
 *
 * 기존에는 게임 중에 나가면 room.players에서 제거해 버려서
 * 그 사람의 직업·생사가 사라졌다. 좌석을 남기면 재접속해서 이어서 볼 수 있고
 * 종료 화면의 직업 공개도 정확해진다.
 */
export function handleDisconnect(player: ScriptPlayer): void {
	const found = locate(player.id);
	if (!found) {
		/*
		 * 관전자는 남길 것이 없다. 직업도 생사도 표도 없고, 자리를 비워두면
		 * 다음 사람이 못 들어올 뿐이다. 그래서 좌석과 달리 그냥 지운다 —
		 * 재접속 경로(index.ts)가 관전을 따로 몰라도 되는 이유가 이것이다.
		 * 돌아오면 방 선택 화면부터 다시 시작하고, 그 방이 아직 진행 중이면
		 * 같은 버튼을 눌러 다시 관전에 들어간다.
		 */
		const watching = locateSpectator(player.id);
		if (watching) dropSpectator(watching.room, player.id);
		return;
	}
	if (found.room.started) {
		found.seat.connected = false;
		countAbandon(player);
		centerLabel(found.room, `${found.seat.name} 님의 접속이 끊겼습니다.`);
		// 라벨은 3초 뒤 사라진다. 판이 끝난 뒤 "저 사람 언제 나갔지"를
		// 되짚을 수 있으려면 기록으로도 남아야 한다.
		Chat.notice(found.room, `📴 ${found.seat.name} 님의 접속이 끊겼습니다.`);
		return;
	}
	removeFromRoom(found.room, player.id, false);
}

function removeFromRoom(room: Room, playerId: string, kicked: boolean): void {
	// 좌석을 비우기 전에 이름을 확보한다 — 비운 뒤에는 누가 나갔는지 알 수 없다
	const leaving = findSeat(room, playerId);
	const name = leaving ? leaving.name : "";
	removeSeat(room, playerId);
	// 떠난 사람이 남긴 강퇴표를 회수한다. 기존에는 회수하지 않아
	// 방을 드나드는 것만으로 강퇴표를 쌓을 수 있었다.
	withdrawKicks(room, playerId);

	const player = ScriptApp.getPlayerByID(playerId);
	if (player) {
		// 빈 목록이 곧 "방 밖" 상태다. 별도의 kicked 메시지는 필요 없다.
		pushLobby(player, []);
		if (kicked) label(player, "강퇴당했습니다.");
		// 좌석이 사라졌으니 방 탭도 사라진다
		Chat.refresh(player);
	}

	// 좌석을 이미 비웠으므로 이 알림은 남은 사람들에게만 간다
	if (name) Chat.notice(room, kicked ? `🚫 ${name} 님이 강퇴되었습니다.` : `🚪 ${name} 님이 퇴장했습니다.`);

	refreshRoom(room);
	broadcastRoomCounts();
}
