/**
 * player.storage(JSON 문자열) 읽기·쓰기.
 *
 * 기존에는 호출부마다 JSON.parse(player.storage)를 직접 했다.
 * storage가 null이거나 깨진 JSON이면 parse가 예외를 던지는데,
 * 그 호출들이 onUpdate·onJoinPlayer 안에 있어서 한 명의 깨진 저장소가
 * 방 전체(때로는 서버 전체)의 진행을 멈출 수 있었다.
 */
import type { ScriptPlayer } from "zep-script";
import type { RoleRecord } from "../domain/Progression.ts";

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
	/** 이미 전송한 FTUE 이벤트 비트. 개인 정보나 이벤트 본문은 저장하지 않는다. */
	ftueEvents?: number;
	/** 코인 잔액 (domain/Economy.ts). 판을 하면 쌓이고 상점에서 쓴다 */
	coin?: number;
	/** 받은 칭찬 수 */
	praise?: number;
	/** 마지막으로 정산받은 날(KST 일 번호). 오늘의 첫 판 보너스를 가린다 */
	lastDay?: number;
	/** 산 상점 물건의 id */
	owned?: string[];
	/** 장착한 칭호의 id */
	title?: string;
	/** 장착한 유언의 id */
	lastWord?: string;
	/** 직업별 판 수·승수. 키는 Role id다 (Rewards.settleMatch가 쌓는다) */
	roles?: { [role: string]: RoleRecord };
}

/** playCount가 생기기 전 전적도 기존 사용자로 판별한다. */
export function priorPlayStarts(storage: PlayerStorage): number {
	if (typeof storage.playCount === "number" && storage.playCount > 0) return storage.playCount;
	const legacy = [
		storage.exp,
		storage.runCount,
		storage.mafiaWin,
		storage.mafiaLose,
		storage.citizenWin,
		storage.citizenLose,
	];
	return legacy.some(value => typeof value === "number" && value > 0) ? 1 : 0;
}

export function hasPriorGame(storage: PlayerStorage): boolean {
	return priorPlayStarts(storage) > 0;
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
			ftueEvents: parsed.ftueEvents,
			// 숫자가 아닌 값이 들어 있으면 가격 비교가 전부 거짓이 되어 공짜로 팔린다
			coin: typeof parsed.coin === "number" ? parsed.coin : undefined,
			praise: typeof parsed.praise === "number" ? parsed.praise : undefined,
			lastDay: typeof parsed.lastDay === "number" ? parsed.lastDay : undefined,
			// 배열이 아닌 값이 들어 있으면 상점의 indexOf가 예외를 던진다
			owned: Array.isArray(parsed.owned)
				? parsed.owned.filter(id => typeof id === "string")
				: undefined,
			title: parsed.title,
			lastWord: parsed.lastWord,
			roles: readRoles(parsed.roles),
		};
	} catch (e) {
		// 깨진 저장소는 초기값으로 취급한다. 한 명 때문에 게임이 멈추는 것보다 낫다.
		return { exp: 0 };
	}
}

/** 숫자가 아닌 줄은 버린다. 남겨 두면 프로필 정렬과 +1이 NaN을 만든다 */
function readRoles(raw: unknown): { [role: string]: RoleRecord } | undefined {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const source = raw as { [role: string]: Partial<RoleRecord> | null };
	const roles: { [role: string]: RoleRecord } = {};
	for (const role of Object.keys(source)) {
		const row = source[role];
		if (row && typeof row.games === "number" && typeof row.wins === "number") {
			roles[role] = { games: row.games, wins: row.wins };
		}
	}
	return roles;
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
