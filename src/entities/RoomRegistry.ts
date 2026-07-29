/**
 * 방 8개를 소유하고 "이 플레이어가 어느 방에 있는가"를 답한다.
 *
 * 기존에는 그 답을 player.tag.data.roomNum에 저장했다. 그런데 onJoinPlayer가
 * 재접속 때 player.tag를 새 객체로 덮어써서 roomNum이 사라졌고,
 * quitPlayer는 -1을, 다른 코드는 null을 넣어 "미참가"의 표현이 두 가지였다.
 *
 * 방이 좌석을 소유하고 있으므로 소속은 스캔으로 알아낼 수 있다.
 * 최대 8방 × 8석 = 64회 비교라 캐시를 둘 이유가 없고,
 * 캐시가 없으면 캐시가 어긋날 일도 없다.
 */
import type { Room, Seat } from "../types/Game.types.ts";
import { ROOM_COUNT } from "../constants/GameConfig.ts";
import { createRoom, findSeat } from "./Room.ts";

const rooms: Room[] = [];
for (let num = 1; num <= ROOM_COUNT; num++) {
	rooms.push(createRoom(num));
}

export function allRooms(): readonly Room[] {
	return rooms;
}

export function getRoom(roomNum: number): Room | undefined {
	return rooms[roomNum - 1];
}

export interface SeatLocation {
	room: Room;
	seat: Seat;
}

export function locate(playerId: string): SeatLocation | undefined {
	for (const room of rooms) {
		const seat = findSeat(room, playerId);
		if (seat) return { room, seat };
	}
	return undefined;
}

export function roomOf(playerId: string): Room | undefined {
	const found = locate(playerId);
	return found ? found.room : undefined;
}
