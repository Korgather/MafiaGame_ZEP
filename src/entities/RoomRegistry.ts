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
import { createRoom, findSeat, findSpectator } from "./Room.ts";

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

/**
 * 이 사람의 **좌석**. 관전자는 찾지 않는다.
 *
 * 관전자를 여기에 섞지 않은 것이 이 파일에서 가장 중요한 결정이다.
 * 부르는 곳이 16군데인데 그중 대부분(밤 지목 핸들러, 투표 핸들러, 준비,
 * 강퇴, 귓속말 대상 찾기)은 "이 판에 참가한 사람"을 묻고 있다. 여기서
 * 관전자를 함께 돌려주면 그 열여섯 곳이 전부 조용히 뜻이 바뀌고, 어느
 * 곳이 위험한지는 읽는 사람이 하나씩 따져 봐야 한다.
 *
 * 관전자를 알아야 하는 곳은 여섯 군데뿐이고 전부 관전을 의식하고 쓰는
 * 코드다. 그쪽만 locateSpectator를 함께 부르게 하면, 새로 locate를 쓰는
 * 사람은 아무것도 몰라도 안전한 쪽을 고르게 된다.
 */
export function locate(playerId: string): SeatLocation | undefined {
	for (const room of rooms) {
		const seat = findSeat(room, playerId);
		if (seat) return { room, seat };
	}
	return undefined;
}

/** 이 사람이 관전 중인 방과 그 자리. 좌석과 구조가 같아 같은 타입을 쓴다 */
export function locateSpectator(playerId: string): SeatLocation | undefined {
	for (const room of rooms) {
		const seat = findSpectator(room, playerId);
		if (seat) return { room, seat };
	}
	return undefined;
}

/**
 * 좌석이든 관전이든 이 사람이 매여 있는 방.
 *
 * "다른 방에 또 들어가려는가"를 묻는 자리(참가 버튼)와 "방 목록을 보내야
 * 하는가"를 묻는 자리(로비 갱신)에서 쓴다. 둘 다 좌석인지 관전인지를
 * 구분할 필요가 없고, 구분하려 들면 한쪽을 빠뜨린다.
 */
export function attachedRoom(playerId: string): Room | undefined {
	const seated = locate(playerId);
	if (seated) return seated.room;
	const watching = locateSpectator(playerId);
	return watching ? watching.room : undefined;
}
