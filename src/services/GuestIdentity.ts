/** 비로그인 플레이어에게 접속 동안 고정되는 익명 번호를 부여한다. */
import type { ScriptPlayer } from "zep-script";

const numberByPlayerId: { [playerId: string]: number } = {};
let nextNumber = 1;

function guestNumber(playerId: string): number {
	const existing = numberByPlayerId[playerId];
	if (typeof existing === "number") return existing;
	const assigned = nextNumber++;
	numberByPlayerId[playerId] = assigned;
	return assigned;
}

/** 게스트의 이름을 `비로그인_N`으로 맞춘다. 실제로 바꿨으면 true. */
export function enforceGuestName(player: ScriptPlayer): boolean {
	if (!player.isGuest) return false;
	const expected = `비로그인_${guestNumber(player.id)}`;
	if (player.name === expected) return false;
	player.name = expected;
	return true;
}

/** 접속이 끝난 게스트의 프로세스 메모리를 정리한다. */
export function releaseGuestIdentity(playerId: string): void {
	delete numberByPlayerId[playerId];
}
