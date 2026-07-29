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
 *
 * seat.connected는 **내려가기만 한다**. 다시 올리는 것은 onJoinPlayer뿐이다.
 * getPlayerByID가 null을 주면 그 사람이 없다는 것은 확실하지만, 값을 준다고
 * 접속 중이라는 보장은 없다 — onLeavePlayer가 불리는 시점에 ZEP이 아직
 * players 목록에서 빼지 않았다면 여기서 true로 되돌아간다. 실제로 그렇게 되면
 * handleDisconnect가 방금 내린 플래그를 바로 뒤의 centerLabel이 지워버려
 * GameFlow의 "인원 부족 중단" 판정이 영원히 걸리지 않는다.
 * 어느 순서인지는 ZEP 문서에 없으므로, 어느 쪽이든 맞도록 단조로 만든다.
 */
export function forEachPlayer(room: Room, fn: (player: ScriptPlayer, seat: Seat) => void): void {
	for (const seat of room.seats.slice()) {
		const player = ScriptApp.getPlayerByID(seat.playerId);
		if (!player) {
			// 접속이 끊겨도 좌석은 남긴다. 재접속하면 그대로 이어서 플레이한다.
			seat.connected = false;
			continue;
		}
		fn(player, seat);
	}
}

/** 생존자에게만 */
export function forEachAlive(room: Room, fn: (player: ScriptPlayer, seat: Seat) => void): void {
	forEachPlayer(room, (player, seat) => {
		if (seat.alive) fn(player, seat);
	});
}

const LABEL_OFFSET = 300;
/** ZEP 라벨의 기본 표시 시간과 같다 */
const LABEL_MS = 3000;
/** 방 전체 공지는 놓치기 쉬워 조금 더 길게 */
const ROOM_LABEL_MS = 4000;

/**
 * 한 사람에게만 뜨는 라벨.
 *
 * showCustomLabel이 아니라 showCenterLabel을 쓴다. 전자는 표시 시간이
 * 7번째 인자라 width/opacity를 건너뛸 수 없는데, Jint는 인자 개수로
 * C# 오버로드를 고르므로 자리를 채우려 undefined를 넣으면 호출이 실패한다.
 * showCenterLabel은 시간이 5번째라 그 구멍이 없고, 게임 안의 모든 라벨이
 * 한 가지 모양으로 통일된다.
 */
export function label(player: ScriptPlayer, message: string, durationMs = LABEL_MS): void {
	player.showCenterLabel(
		message,
		LabelColor.TEXT,
		LabelColor.BACKGROUND,
		LABEL_OFFSET,
		durationMs
	);
}

/** 방 전원에게 같은 라벨 */
export function centerLabel(room: Room, message: string, durationMs = ROOM_LABEL_MS): void {
	forEachPlayer(room, player => label(player, message, durationMs));
}

export function playSound(room: Room, fileName: string): void {
	forEachPlayer(room, player => {
		player.playSound(fileName);
	});
}
