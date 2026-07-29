/**
 * 칭호·경험치·전적.
 *
 * 기존 giveExp는 경험치 지급과 승패 기록을 함께 했다. 그래서 게임 도중
 * 억울하게 처형당한 시민에게 위로 경험치를 줄 때마다 citizenWin이 올라갔다.
 * 여기서는 두 가지를 별도 함수로 나눠 그 결합을 끊는다.
 *
 * levelCalc도 "레벨 계산 + titleColor 변경 + storage 초기화 + tag 갱신"을
 * 한 함수에서 했다. 계산(도메인)과 반영(여기)을 분리한다.
 */
import type { ScriptPlayer } from "zep-script";
import type { Seat, Team } from "../types/Game.types.ts";
import { ADMIN_ROLE_LEVEL } from "../constants/GameConfig.ts";
import { expReward, levelFromExp, recordKey } from "../domain/Progression.ts";
import * as Storage from "../infrastructure/PlayerStorage.ts";
import { label } from "./Broadcast.ts";

const GUEST_TITLE = "비로그인 유저";
const ADMIN_TITLE = "운영자";

export interface PlayerTitle {
	/** 머리 위에 표시되는 여러 줄 칭호 */
	title: string;
	/**
	 * 대기실 목록에서 이름 옆에 붙는 한 줄. 이미 완성된 표시 문자열이다.
	 *
	 * 숫자가 아니라는 점이 중요하다 — 운영자와 비로그인 유저는 레벨 대신
	 * 칭호가 그대로 들어온다. 전에 이 필드가 level이었을 때 대기실 위젯이
	 * 숫자로 알아듣고 "Lv."를 한 번 더 붙여 Lv.Lv.12, Lv.운영자로 나왔다.
	 */
	rank: string;
}

export function buildTitle(player: ScriptPlayer): PlayerTitle {
	if (player.role >= ADMIN_ROLE_LEVEL) {
		return { title: ADMIN_TITLE, rank: ADMIN_TITLE };
	}
	if (player.isGuest) {
		return { title: GUEST_TITLE, rank: GUEST_TITLE };
	}

	const storage = Storage.read(player);
	const rank = `Lv.${levelFromExp(storage.exp)}`;
	const title =
		`${rank}` +
		`\n마피아 ${storage.mafiaWin || 0}승 ${storage.mafiaLose || 0}패` +
		`\n시민 ${storage.citizenWin || 0}승 ${storage.citizenLose || 0}패`;
	return { title, rank };
}

/** 칭호를 다시 계산해 플레이어에게 반영하고, 이름 옆에 붙일 등급 표시를 돌려준다 */
export function refreshTitle(player: ScriptPlayer): string {
	const built = buildTitle(player);
	player.title = built.title;
	// 로그인 유저(role 0)와 구분되도록 색을 달리한다
	player.titleColor = player.role === 0 ? 0x00ff00 : 0xffffff;
	player.sendUpdated();
	return built.rank;
}

export function awardExp(player: ScriptPlayer, amount: number): void {
	if (player.isGuest || amount <= 0) return;
	Storage.update(player, storage => {
		storage.exp += amount;
	});
	label(player, `경험치 ${amount} 획득`);
}

/** 게임 종료 보상: 경험치 + 승패 전적을 한 번에 반영한다 */
export function settleMatch(player: ScriptPlayer, seat: Seat, winner: Team): void {
	const amount = expReward(winner, seat);
	if (player.isGuest) return;

	const key = recordKey(winner, seat);
	Storage.update(player, storage => {
		storage.exp += amount;
		storage[key] = (storage[key] || 0) + 1;
	});
	label(player, `경험치 ${amount} 획득`);
}

/** 게임을 한 판 시작했음을 기록한다 */
export function countPlay(player: ScriptPlayer): void {
	Storage.update(player, storage => {
		storage.playCount = (storage.playCount || 0) + 1;
	});
}

/** 게임 도중 나갔음을 기록한다 (중도 이탈 횟수) */
export function countAbandon(player: ScriptPlayer): void {
	Storage.update(player, storage => {
		storage.runCount = (storage.runCount || 0) + 1;
	});
}
