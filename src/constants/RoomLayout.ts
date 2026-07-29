/**
 * 맵 좌표 배치.
 *
 * 기존에는 8개 방의 시작 좌표와 8개 좌석 오프셋이 1-based 객체 리터럴로
 * 선언되어 있었고, 방 정의 8개가 통째로 복사·붙여넣기 되어 있었다.
 */
import { ROOM_COUNT } from "./GameConfig.ts";

/** 방 좌상단 기준 좌표. 인덱스 0 = 1번 방 */
const ROOM_ORIGINS: ReadonlyArray<readonly [number, number]> = [
	[19, 18],
	[53, 18],
	[87, 18],
	[19, 39],
	[87, 39],
	[19, 60],
	[53, 60],
	[87, 60],
];

/** 방 안에서 참가 번호별 좌석 오프셋. 인덱스 0 = 1번 참가자 */
const SEAT_OFFSETS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
	{ x: 7, y: 3 },
	{ x: 11, y: 3 },
	{ x: 15, y: 3 },
	{ x: 6, y: 7 },
	{ x: 16, y: 7 },
	{ x: 7, y: 11 },
	{ x: 11, y: 11 },
	{ x: 15, y: 11 },
];

/** 대기실 스폰 영역 (좌상단 x, y, 너비, 높이) */
export const LOBBY_SPAWN_AREA = { x: 63, y: 42, width: 13, height: 4 } as const;

/** 1..ROOM_COUNT 방 번호에 해당하는 시작 좌표 */
export function roomOrigin(roomNum: number): readonly [number, number] {
	const origin = ROOM_ORIGINS[roomNum - 1];
	if (!origin) throw new Error(`알 수 없는 방 번호: ${roomNum}`);
	return origin;
}

/**
 * 참가 번호(1..MAX_PLAYERS)에 해당하는 맵 절대 좌표.
 * 유효하지 않은 번호면 null을 돌려준다 — 기존 코드는 undefined 좌표로
 * spawnAt을 호출해 NaN 좌표를 만들 수 있었다.
 */
export function seatPosition(
	roomNum: number,
	seatIndex: number
): { x: number; y: number } | null {
	const offset = SEAT_OFFSETS[seatIndex - 1];
	if (!offset) return null;
	const origin = roomOrigin(roomNum);
	return { x: origin[0] + offset.x, y: origin[1] + offset.y };
}

/** 유효한 방 번호인가 */
export function isValidRoomNum(roomNum: unknown): roomNum is number {
	return (
		typeof roomNum === "number" &&
		Number.isInteger(roomNum) &&
		roomNum >= 1 &&
		roomNum <= ROOM_COUNT
	);
}
