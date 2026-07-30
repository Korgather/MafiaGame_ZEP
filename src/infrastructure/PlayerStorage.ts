/**
 * player.storage(JSON 문자열) 읽기·쓰기.
 *
 * 기존에는 호출부마다 JSON.parse(player.storage)를 직접 했다.
 * storage가 null이거나 깨진 JSON이면 parse가 예외를 던지는데,
 * 그 호출들이 onUpdate·onJoinPlayer 안에 있어서 한 명의 깨진 저장소가
 * 방 전체(때로는 서버 전체)의 진행을 멈출 수 있었다.
 */
import type { ScriptPlayer } from "zep-script";

/**
 * 저장소에 남는 전적. 이 파일이 읽고 쓰는 유일한 모양이다.
 *
 * Game.types.ts에 있었는데, 그쪽은 판이 도는 동안의 상태(Room·Seat·PlayerTag)를
 * 모아 둔 곳이라 "판이 끝나도 남는 값"이 섞여 있으면 수명이 다른 두 개념을
 * 같은 눈으로 보게 된다. 게임 상태에 필드를 더하는 일은 흔하지만 이 모양에
 * 필드를 더하는 일은 저장 형식을 바꾸는 일이다 — 이미 저장된 JSON에 그 키가
 * 없으므로 read의 기본값 처리가 함께 필요하다. 그 짝을 강제하려면 선언이
 * read 바로 옆에 있어야 한다.
 *
 * exp를 뺀 전부가 optional인 것도 그 이유다. 나중에 생긴 필드라 옛 저장소에는
 * 없다.
 */
export interface PlayerStorage {
	exp: number;
	playCount?: number;
	runCount?: number;
	mafiaWin?: number;
	mafiaLose?: number;
	citizenWin?: number;
	citizenLose?: number;
}

export function read(player: ScriptPlayer): PlayerStorage {
	const raw = player.storage;
	if (!raw) return { exp: 0 };
	try {
		const parsed = JSON.parse(raw) as Partial<PlayerStorage> | null;
		if (!parsed || typeof parsed !== "object") return { exp: 0 };
		return {
			exp: typeof parsed.exp === "number" ? parsed.exp : 0,
			playCount: parsed.playCount,
			runCount: parsed.runCount,
			mafiaWin: parsed.mafiaWin,
			mafiaLose: parsed.mafiaLose,
			citizenWin: parsed.citizenWin,
			citizenLose: parsed.citizenLose,
		};
	} catch (e) {
		// 깨진 저장소는 초기값으로 취급한다. 한 명 때문에 게임이 멈추는 것보다 낫다.
		return { exp: 0 };
	}
}

/**
 * 저장소를 읽어 수정하고 저장한다.
 * 게스트는 저장소가 없으므로 아무 것도 하지 않는다.
 */
export function update(player: ScriptPlayer, mutate: (storage: PlayerStorage) => void): void {
	if (player.isGuest) return;
	const storage = read(player);
	mutate(storage);
	player.storage = JSON.stringify(storage);
	player.save();
}
