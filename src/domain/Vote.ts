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

/**
 * "투표 없음"을 고른 좌석의 votedFor 값.
 *
 * 0은 이미 "아직 안 찍음"이고 참가 번호는 1부터이므로 음수만 비어 있다.
 * 기권(아무 칸도 안 누름)과 스킵(투표 없음 칸을 누름)은 다른 선택이다 —
 * 기권은 판단을 남에게 미루는 것이고, 스킵은 "오늘은 아무도 죽이지 말자"는
 * 적극적인 한 표다. 그래서 스킵은 세고 기권은 세지 않는다.
 */
export const SKIP_VOTE = -1;

export const VoteOutcome = {
	/** 처형 확정 */
	EXECUTE: "EXECUTE",
	/** 아무도 표를 얻지 못함 */
	NO_VOTES: "NO_VOTES",
	/** 최다 득표 동률 */
	TIE: "TIE",
	/** 최다 득표자가 투표 면역(정치인) */
	IMMUNE: "IMMUNE",
	/** "투표 없음"이 최다 */
	SKIPPED: "SKIPPED",
} as const;
export type VoteOutcome = (typeof VoteOutcome)[keyof typeof VoteOutcome];

export interface VoteResult {
	outcome: VoteOutcome;
	/** 최다 득표자. NO_VOTES·SKIPPED면 null */
	target: Seat | null;
	/** [참가번호, 득표수] 내림차순. 결과 위젯에 그대로 전달한다 */
	board: Array<[number, number]>;
	/** "투표 없음"이 받은 표. 정치인 가중치가 여기에도 적용된다 */
	skipVotes: number;
}

function voteWeight(voter: Seat): number {
	const weight = roleDef(voter.role).voteWeight;
	return weight === undefined ? 1 : weight;
}

export function tallyVotes(seats: readonly Seat[]): VoteResult {
	const alive = seats.filter(seat => seat.alive);

	const board: Array<[number, number]> = alive.map(seat => [seat.index, seat.voteCount]);
	board.sort((a, b) => b[1] - a[1]);

	/*
	 * 스킵은 받는 쪽이 없어서 voteCount에 쌓아 둘 자리가 없다. 찍은 쪽을
	 * 세는 수밖에 없는데, 그러면 가중치도 여기서 다시 계산해야 한다 —
	 * Voting의 voteWeight와 같은 규칙을 쓴다.
	 */
	let skipVotes = 0;
	for (const seat of alive) {
		if (seat.votedFor === SKIP_VOTE) skipVotes += voteWeight(seat);
	}

	let max = 0;
	for (const seat of alive) {
		if (seat.voteCount > max) max = seat.voteCount;
	}

	/*
	 * 동률이면 스킵이 이긴다. 처형은 되돌릴 수 없고 스킵은 밤 한 번을
	 * 내주는 것뿐이라, 표가 갈렸을 때 값이 싼 쪽을 고른다.
	 */
	if (skipVotes > 0 && skipVotes >= max) {
		return { outcome: VoteOutcome.SKIPPED, target: null, board, skipVotes };
	}
	if (max === 0) return { outcome: VoteOutcome.NO_VOTES, target: null, board, skipVotes };

	const leaders = alive.filter(seat => seat.voteCount === max);
	if (leaders.length > 1) return { outcome: VoteOutcome.TIE, target: null, board, skipVotes };

	const target = leaders[0];
	if (roleDef(target.role).immuneToVote) {
		return { outcome: VoteOutcome.IMMUNE, target, board, skipVotes };
	}
	return { outcome: VoteOutcome.EXECUTE, target, board, skipVotes };
}
