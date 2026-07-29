/**
 * 방 단위 전달. "좌석 → 접속 중인 ScriptPlayer" 변환이 일어나는 유일한 곳.
 *
 * 기존에는 showLabelToRoom / sendMessageToRoom / playSoundToRoom /
 * switchAllPlayersWidget / allHidden / clearHidden / createSilhouette /
 * tagReset / gameReset / nightResult / gameEndCheck 등 열 곳 넘게가
 * 똑같은 3줄을 복사해 갖고 있었다.
 *
 *   for (let playerData of room.players) {
 *     let p = App.getPlayerByID(playerData.id);
 *     if (!p) continue;
 *
 * 그래서 "접속이 끊긴 플레이어"의 처리가 곳곳에서 조금씩 달랐고
 * (어떤 곳은 continue, 어떤 곳은 return으로 루프 전체를 끊었다),
 * 끊긴 사실을 좌석에 기록하는 곳은 하나도 없었다.
 */
import type { ScriptPlayer } from "zep-script";
import type { Room, Seat } from "../types/Game.types.ts";
import { LabelColor } from "../constants/Assets.ts";

/**
 * 방의 모든 좌석을 순회하며 접속 중인 플레이어에게만 콜백을 실행한다.
 * 순회 중 좌석 배열이 바뀌어도(퇴장 등) 안전하도록 복사본을 돈다.
 */
export function forEachPlayer(room: Room, fn: (player: ScriptPlayer, seat: Seat) => void): void {
	for (const seat of room.seats.slice()) {
		const player = ScriptApp.getPlayerByID(seat.playerId);
		if (!player) {
			// 접속이 끊겨도 좌석은 남긴다. 재접속하면 그대로 이어서 플레이한다.
			seat.connected = false;
			continue;
		}
		seat.connected = true;
		fn(player, seat);
	}
}

/** 생존자에게만 */
export function forEachAlive(room: Room, fn: (player: ScriptPlayer, seat: Seat) => void): void {
	forEachPlayer(room, (player, seat) => {
		if (seat.alive) fn(player, seat);
	});
}

export function centerLabel(room: Room, message: string, durationMs = 4000): void {
	forEachPlayer(room, player => {
		player.showCenterLabel(message, LabelColor.TEXT, LabelColor.BACKGROUND, 300, durationMs);
	});
}

export function say(room: Room, message: string): void {
	forEachPlayer(room, player => {
		player.sendMessage(divider(message), LabelColor.SYSTEM);
	});
}

export function playSound(room: Room, fileName: string): void {
	forEachPlayer(room, player => {
		player.playSound(fileName);
	});
}

/** 시스템 안내를 채팅창에 눈에 띄게 감싼다 */
export function divider(message: string): string {
	return `─────────────────\n${message}\n─────────────────`;
}

/** 한 사람에게만 뜨는 라벨 */
export function label(player: ScriptPlayer, message: string, durationMs?: number): void {
	player.showCustomLabel(
		message,
		LabelColor.TEXT,
		LabelColor.BACKGROUND,
		300,
		undefined,
		undefined,
		durationMs
	);
}
