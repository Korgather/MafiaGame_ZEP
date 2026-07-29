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
import type { LobbySeatView, Room } from "../types/Game.types.ts";
import { GamePhase } from "../types/Game.types.ts";
import { KICK, MAX_PLAYERS } from "../constants/GameConfig.ts";
import { Sound } from "../constants/Assets.ts";
import { isValidRoomNum } from "../constants/RoomLayout.ts";
import {
	createSeat,
	findSeat,
	kickCount,
	removeSeat,
	toggleKick,
	withdrawKicks,
} from "../entities/Room.ts";
import { allRooms, getRoom, locate } from "../entities/RoomRegistry.ts";
import * as Storage from "../infrastructure/PlayerStorage.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";
import { asInt, field, messageType } from "../types/Widget.types.ts";
import { centerLabel, label } from "./Broadcast.ts";
import * as Chat from "./ChatService.ts";
import { countAbandon, refreshTitle } from "./Rewards.ts";
import { openLobby } from "./Widgets.ts";

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
	const widget = openLobby(player);
	widget.onMessage.Add(handleMessage);
	pushSeatList(player);
	pushRoomCounts(player);
}

/** 이 플레이어가 보는 좌석 목록을 다시 그린다 */
function pushSeatList(player: ScriptPlayer): void {
	const widget = tagOf(player).widget;
	if (!widget) return;
	const found = locate(player.id);
	widget.sendMessage({ type: "init", data: found ? lobbySeatViews(found.room) : [] });
}

/** 방 안 전원의 목록을 갱신한다 (한 명이라도 바뀌면 전원에게) */
function refreshRoom(room: Room): void {
	const views = lobbySeatViews(room);
	for (const seat of room.seats.slice()) {
		const player = ScriptApp.getPlayerByID(seat.playerId);
		if (!player) continue;
		const widget = tagOf(player).widget;
		if (widget) widget.sendMessage({ type: "init", data: views });
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
		if (locate(player.id)) continue; // 방 안에 있는 사람에게는 필요 없다
		const widget = tagOf(player).widget;
		if (widget) widget.sendMessage({ type: "updatePlayerCount", data: counts });
	}
}

function roomCounts(): { [roomNum: string]: { count: number; started: boolean } } {
	const counts: { [roomNum: string]: { count: number; started: boolean } } = {};
	for (const room of allRooms()) {
		counts[`${room.num}`] = { count: room.seats.length, started: room.started };
	}
	return counts;
}

function handleMessage(player: ScriptPlayer, data: unknown): void {
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
	}
}

function join(player: ScriptPlayer, roomNum: number | null): void {
	if (roomNum === null || !isValidRoomNum(roomNum)) return;
	if (locate(player.id)) return; // 이미 어느 방에 있다

	const room = getRoom(roomNum);
	if (!room) return;

	if (room.started) {
		label(player, "이미 게임이 진행 중인 방입니다.");
		return;
	}
	if (room.seats.length >= MAX_PLAYERS) {
		label(player, "방이 가득 찼습니다.");
		return;
	}
	if (isKickBanned(player.id)) {
		label(player, "강퇴당한 직후에는 잠시 참가할 수 없습니다.");
		return;
	}

	const rank = refreshTitle(player);
	const name = tagOf(player).originalName;
	room.seats.push(createSeat(player.id, name, rank));
	player.playSound(Sound.JOIN);

	// 방 탭이 생겼다는 것을 먼저 알린 뒤 입장 알림을 흘린다.
	// 순서를 뒤집으면 본인만 자기 입장 알림을 못 본다 — 알림이 도착하는
	// 시점에 아직 방 탭이 없기 때문이다.
	Chat.refresh(player);
	Chat.notice(room, `🚪 ${name} 님이 입장했습니다.`);

	refreshRoom(room);
	broadcastRoomCounts();
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

	if (kickCount(target) >= KICK.VOTES_REQUIRED) {
		kickedUntil[targetId] = Time.getUtcTime() + KICK.COOLDOWN_MS;
		removeFromRoom(found.room, targetId, true);
		return;
	}
	refreshRoom(found.room);
}

/** 대기실에서 스스로 나가기 */
export function leave(player: ScriptPlayer): void {
	const found = locate(player.id);
	if (!found) return;
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
	if (!found) return;
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
		const widget = tagOf(player).widget;
		if (widget) widget.sendMessage({ type: "init", data: [] });
		if (kicked) label(player, "강퇴당했습니다.");
		// 좌석이 사라졌으니 방 탭도 사라진다
		Chat.refresh(player);
	}

	// 좌석을 이미 비웠으므로 이 알림은 남은 사람들에게만 간다
	if (name) Chat.notice(room, kicked ? `🚫 ${name} 님이 강퇴되었습니다.` : `🚪 ${name} 님이 퇴장했습니다.`);

	refreshRoom(room);
	broadcastRoomCounts();
}
