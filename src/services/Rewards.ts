/**
 * 등급·경험치·전적.
 *
 * 기존 giveExp는 경험치 지급과 승패 기록을 함께 했다. 그래서 게임 도중
 * 억울하게 처형당한 시민에게 위로 경험치를 줄 때마다 citizenWin이 올라갔다.
 * 여기서는 두 가지를 별도 함수로 나눠 그 결합을 끊는다.
 *
 * levelCalc도 "레벨 계산 + titleColor 변경 + storage 초기화 + tag 갱신"을
 * 한 함수에서 했다. 계산(도메인)과 반영(여기)을 분리한다.
 *
 * 이 파일은 이제 player를 건드리지 않는다. 값만 계산해 돌려주고,
 * 머리 위에 무엇을 어떻게 띄울지는 Stage.applyNameplate이 정한다 —
 * 화면에 쓰는 곳이 하나여야 두 줄 규칙이 지켜진다. 전적 세 줄은
 * 이름표에서 프로필 창(Profile.ts)으로 옮겼다.
 */
import type { ScriptPlayer } from "zep-script";
import type { Seat, Team } from "../types/Game.types.ts";
import { ADMIN_ROLE_LEVEL } from "../constants/GameConfig.ts";
import { expReward, levelFromExp, recordKey } from "../domain/Progression.ts";
import * as Storage from "../infrastructure/PlayerStorage.ts";
import { label } from "./Broadcast.ts";

const GUEST_RANK = "비로그인 유저";
const ADMIN_RANK = "운영자";

/**
 * 이 사람의 등급 한 줄. 대기실 목록에서 이름 옆에 붙고, 판 밖에서는
 * 머리 위 이름표의 첫 줄이 된다.
 *
 * 숫자가 아니라는 점이 중요하다 — 운영자와 비로그인 유저는 레벨 대신
 * 칭호가 그대로 들어온다. 전에 이 값이 level(숫자)이었을 때 대기실 위젯이
 * 숫자로 알아듣고 "Lv."를 한 번 더 붙여 Lv.Lv.12, Lv.운영자로 나왔다.
 */
export function rankOf(player: ScriptPlayer): string {
	if (player.role >= ADMIN_ROLE_LEVEL) return ADMIN_RANK;
	if (player.isGuest) return GUEST_RANK;
	return `Lv.${levelFromExp(Storage.read(player).exp)}`;
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
