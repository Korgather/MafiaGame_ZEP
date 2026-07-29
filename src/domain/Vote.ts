/**
 * 낮 투표 집계. 순수 함수.
 *
 * 기존 voteResult의 문제:
 *   - targetPlayer를 -1로 초기화해 놓고 나중에 ScriptPlayer를 대입한 뒤
 *     `targetPlayer == -1`로 비교했다. 타입이 섞여 의도를 읽기 어려웠다.
 *   - `p = App.getPlayerByID(...)`에 let이 없어 전역 변수를 만들었다.
 *   - 죽은 플레이어의 votecount도 최대값 계산에 포함됐다.
 *   - 정치인 면역 판정이 집계 결과와 섞여 있어 따로 검증할 수 없었다.
 */
import type { Seat } from "../types/Game.types.ts";
import { roleDef } from "./Roles.ts";

export const VoteOutcome = {
	/** 처형 확정 */
	EXECUTE: "EXECUTE",
	/** 아무도 표를 얻지 못함 */
	NO_VOTES: "NO_VOTES",
	/** 최다 득표 동률 */
	TIE: "TIE",
	/** 최다 득표자가 투표 면역(정치인) */
	IMMUNE: "IMMUNE",
} as const;
export type VoteOutcome = (typeof VoteOutcome)[keyof typeof VoteOutcome];

export interface VoteResult {
	outcome: VoteOutcome;
	/** 최다 득표자. NO_VOTES면 null */
	target: Seat | null;
	/** [참가번호, 득표수] 내림차순. 결과 위젯에 그대로 전달한다 */
	board: Array<[number, number]>;
}

export function tallyVotes(seats: readonly Seat[]): VoteResult {
	const alive = seats.filter(seat => seat.alive);

	const board: Array<[number, number]> = alive.map(seat => [seat.index, seat.voteCount]);
	board.sort((a, b) => b[1] - a[1]);

	let max = 0;
	for (const seat of alive) {
		if (seat.voteCount > max) max = seat.voteCount;
	}
	if (max === 0) return { outcome: VoteOutcome.NO_VOTES, target: null, board };

	const leaders = alive.filter(seat => seat.voteCount === max);
	if (leaders.length > 1) return { outcome: VoteOutcome.TIE, target: null, board };

	const target = leaders[0];
	if (roleDef(target.role).immuneToVote) {
		return { outcome: VoteOutcome.IMMUNE, target, board };
	}
	return { outcome: VoteOutcome.EXECUTE, target, board };
}
