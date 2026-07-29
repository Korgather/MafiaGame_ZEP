/**
 * player.storage(JSON 문자열) 읽기·쓰기.
 *
 * 기존에는 호출부마다 JSON.parse(player.storage)를 직접 했다.
 * storage가 null이거나 깨진 JSON이면 parse가 예외를 던지는데,
 * 그 호출들이 onUpdate·onJoinPlayer 안에 있어서 한 명의 깨진 저장소가
 * 방 전체(때로는 서버 전체)의 진행을 멈출 수 있었다.
 */
import type { ScriptPlayer } from "zep-script";
import type { PlayerStorage } from "../types/Game.types.ts";

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
