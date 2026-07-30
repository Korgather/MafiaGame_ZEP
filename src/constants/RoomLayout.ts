/**
 * 맵 좌표 배치.
 *
 * 기존에는 8개 방의 시작 좌표와 8개 좌석 오프셋이 1-based 객체 리터럴로
 * 선언되어 있었고, 방 정의 8개가 통째로 복사·붙여넣기 되어 있었다.
 */
import { ROOM_COUNT } from "./GameConfig.ts";

/**
 * 방 좌상단 기준 좌표. 인덱스 0 = 1번 방
 *
 * 맵과 코드 사이의 계약이 하나 더 있다: **방마다 프라이빗 영역을 하나씩 두고,
 * 그 영역 id를 방 번호(1..ROOM_COUNT)로 맞춘다.** 이건 ZEP 에디터에서 손으로
 * 칠하는 값이라 코드가 확인할 수 없다.
 *
 * 왜 필요한가: 방 채팅을 ZEP 기본 채팅으로 내보내 아바타 위에 말풍선을 띄우는데
 * (ChannelDef.speaksInto), ZEP은 프라이빗 영역 단위로만 청중을 좁힐 수 있다.
 * 영역이 없으면 이 방의 낮 토론이 맵 전체에 뜬다.
 *
 * 어긋나면 어떻게 되는가: 스크립트는 영역 id를 읽을 수 없다(ScriptPlayer에
 * 그런 필드가 없다). 그래서 대신 두 가지를 본다 — 말한 사람이 자기 방 상자
 * 안에 있는지(isInsideRoom)와 그 타일이 프라이빗 영역 타일인지. 둘 중 하나만
 * 어긋나도 말풍선을 포기한다. 못 칠한 방은 말풍선이 안 뜰 뿐이고,
 * 틀린 id로 칠한 방은 옆 방으로 샌다 — 후자만 눈으로 확인해야 한다.
 */
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

/**
 * 방 안에서 참가 번호별 좌석 오프셋. 인덱스 0 = 1번 참가자.
 *
 * 배치는 위 3 / 옆 6 / 아래 3의 타원이다. 9~12번은 이미 쓰던 두 열(x=6, x=16)에
 * 얹었다 — 기존 8자리를 한 칸도 옮기지 않은 이유는 맵 데이터가 이 저장소에
 * 없어서(.zepmap은 ZEP 에디터에만 있다) 옮긴 타일을 걸어 다닐 수 있는지
 * 코드만 보고는 확인할 방법이 없기 때문이다. 새로 쓰는 타일 4개만 확인하면 된다.
 *
 * 실루엣은 좌석 한 칸 위(y-1)에 그려지므로 y=5, y=9는 각각 y=4, y=8을 함께
 * 차지한다. 둘 다 기존 좌석이 이미 증명한 상자(x 6..16, y 3..11) 안이다.
 *
 * 개수는 MAX_PLAYERS와 정확히 같아야 한다. 모자라면 seatPosition이 null을
 * 돌려주고 Stage.seatPlayer가 배치를 조용히 건너뛰어, 게임은 시작되는데
 * 몇 명이 방 밖에 서 있게 된다. tests/domain.test.ts의 좌석 테스트가 그
 * 어긋남을 잡는다.
 */
const SEAT_OFFSETS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
	{ x: 7, y: 3 },
	{ x: 11, y: 3 },
	{ x: 15, y: 3 },
	{ x: 6, y: 5 },
	{ x: 16, y: 5 },
	{ x: 6, y: 7 },
	{ x: 16, y: 7 },
	{ x: 6, y: 9 },
	{ x: 16, y: 9 },
	{ x: 7, y: 11 },
	{ x: 11, y: 11 },
	{ x: 15, y: 11 },
];

/** 대기실 스폰 영역 (좌상단 x, y, 너비, 높이) */
export const LOBBY_SPAWN_AREA = { x: 63, y: 42, width: 13, height: 4 } as const;

/**
 * 방 상자를 좌석 배치보다 이만큼 넓게 잡는다 (타일).
 *
 * 좌석은 방 안의 앉는 자리일 뿐이고 사람은 그 사이와 바깥을 걸어 다닌다.
 * 상자를 좌석에 딱 맞추면 두 좌석 사이에 선 사람이 "방 밖"으로 판정된다.
 *
 * 이 값이 커도 안전한 이유: 상자는 "어느 방인지"만 가리고, "정말 프라이빗
 * 영역 안인지"는 타일을 직접 확인한다(Stage.inOwnRoomArea). 그래서 상자가
 * 지켜야 할 조건은 하나뿐이다 — 옆 방에 닿지 않을 것.
 *
 * ROOM_ORIGINS의 간격은 가로 34, 세로 21이고 좌석은 방 기준 x 6..16,
 * y 3..11에 놓인다. 세로 쪽 여유가 먼저 마른다: 위 방의 상자 아래끝은
 * y+11+margin, 아래 방의 위끝은 y+21+3-margin이므로 margin이 7이 되는 순간
 * 둘이 만난다(가로는 12에서 만난다). 지금 값은 그 절반이다.
 *
 * 이 계산을 주석에만 적어두면 좌석을 한 칸 옮기는 순간 조용히 틀린 글이 된다.
 * tests/domain.test.ts의 "방 상자는 서로 겹치지 않는다"가 같은 조건을 실제
 * 좌표로 확인한다 — 여기 숫자가 아니라 그 검사가 계약이다.
 */
const ROOM_BOX_MARGIN = 3;

/** 좌석 배치를 감싸는 사각형(방 기준 상대 좌표) */
const SEAT_BOUNDS = (() => {
	let minX = SEAT_OFFSETS[0].x;
	let maxX = minX;
	let minY = SEAT_OFFSETS[0].y;
	let maxY = minY;
	for (const offset of SEAT_OFFSETS) {
		if (offset.x < minX) minX = offset.x;
		if (offset.x > maxX) maxX = offset.x;
		if (offset.y < minY) minY = offset.y;
		if (offset.y > maxY) maxY = offset.y;
	}
	return { minX, maxX, minY, maxY };
})();

/**
 * 이 타일이 그 방의 상자 안인가.
 *
 * "방 안"의 정확한 경계는 .zepmap에만 있으므로(벽 타일) 코드가 알 수 있는 것은
 * 좌석 배치뿐이다. 여기서 돌려주는 것은 벽으로 둘러싸인 방이 아니라
 * "이 좌표를 어느 방으로 볼 것인가"다 — 방이 서로 멀리 떨어져 있어서
 * 그 용도로는 충분하다.
 */
export function isInsideRoom(roomNum: number, tileX: number, tileY: number): boolean {
	const origin = roomOrigin(roomNum);
	return (
		tileX >= origin[0] + SEAT_BOUNDS.minX - ROOM_BOX_MARGIN &&
		tileX <= origin[0] + SEAT_BOUNDS.maxX + ROOM_BOX_MARGIN &&
		tileY >= origin[1] + SEAT_BOUNDS.minY - ROOM_BOX_MARGIN &&
		tileY <= origin[1] + SEAT_BOUNDS.maxY + ROOM_BOX_MARGIN
	);
}

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
