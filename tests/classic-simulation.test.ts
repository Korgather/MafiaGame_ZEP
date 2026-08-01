/**
 * 클래식 모드 자동 시뮬레이션 7종.
 *
 * 회귀 테스트가 규칙 하나하나를 못으로 박는 것이라면, 여기는 판 전체를
 * 수천 번 돌려 "박아 둔 것들이 함께 돌 때도 어긋나지 않는가"를 본다.
 * 잡으려는 것은 개별 규칙의 오답이 아니라 규칙들이 만나는 자리에서만
 * 나오는 고장이다 — 끝나지 않는 판, 죽은 사람이 계속 능력을 쓰는 판,
 * 한 사람이 두 번 죽는 판, 승자가 두 번 정해지는 판.
 *
 * 규칙을 옮겨 적지 않는다. 아래 시뮬레이터는 src/domain의 순수 모듈을
 * 그대로 부른다(buildRoleDeck · resolveNightIntents · tallyVotes ·
 * evaluateWinner). 옮겨 적으면 규칙이 바뀌는 순간 이 파일이 조용히
 * 다른 게임을 검사하게 되고, 그 사실은 통과하는 동안 드러나지 않는다.
 *
 * 여기서 정하는 것은 "누가 누구를 고르는가"뿐이다 — 그것은 규칙이 아니라
 * 플레이어의 판단이고, 판단은 무작위로 둔다. 판단이 무엇이든 위의 네 가지는
 * 절대 일어나지 않아야 하기 때문이다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role, Team } from "../src/types/Game.types.ts";
import type { Seat } from "../src/types/Game.types.ts";
import { MAX_PLAYERS, MIN_PLAYERS } from "../src/constants/GameConfig.ts";
import { seededRng } from "../src/domain/Rng.ts";
import { buildRoleDeck } from "../src/domain/RoleAssignment.ts";
import { effectiveDef, inMafiaChat, roleDef } from "../src/domain/Roles.ts";
import { CLASSIC_RULES } from "../src/domain/RuleSet.ts";
import { putIntent, resolveNightIntents } from "../src/domain/NightPipeline.ts";
import type { NightIntent } from "../src/domain/NightPipeline.ts";
import { NightOutcome, hasNightTurn, isPeacefulNight } from "../src/domain/NightResolution.ts";
import { VoteOutcome, tallyVotes } from "../src/domain/Vote.ts";
import { evaluateWinner } from "../src/domain/WinCondition.ts";
import { seat } from "./helpers/seat.ts";

/** 판이 이 라운드에 닿으면 끝나지 않은 것으로 본다 */
const ROUND_CAP = 200;

/**
 * 그 결말이 죽음인가.
 *
 * 표로 두는 것은 완전성을 컴파일 단계에서 받아 내기 위해서다. 결말이 하나
 * 늘면 여기가 먼저 빨개진다 — if 문으로 두면 새 결말이 조용히 "죽지 않음"
 * 으로 떨어져서, 시뮬레이터만 사람이 살아 있다고 믿는 판이 만들어진다.
 */
const FATAL_OUTCOME: Record<NightOutcome, boolean> = {
	KILLED: true,
	SAVED: false,
	SHIELDED: false,
	BACKFIRED: true,
	BOMBED: true,
	HEARTBREAK: true,
	REVIVED: false,
};

/* ------------------------------------------------------------------ */
/* 시뮬레이터                                                          */
/* ------------------------------------------------------------------ */

/** 한 라운드에 일어난 일. 두 판을 견주려면 결과만이 아니라 과정이 같아야 한다 */
interface Frame {
	round: number;
	/** 밤에 죽은 좌석 번호 (파이프라인이 알려준 순서 그대로) */
	nightDeaths: number[];
	/** 밤에 되살아난 좌석 번호 */
	revives: number[];
	/** 낮에 처형된 좌석 번호. 없으면 0 */
	executed: number;
	/** 개인 통보를 받은 좌석 번호 */
	told: number[];
}

interface Trace {
	deck: Role[];
	winner: Team | null;
	rounds: number;
	frames: Frame[];
	/** 승자가 정해진 횟수. 1을 넘으면 판이 두 번 끝난 것이다 */
	settled: number;
	/** 죽은 좌석에게 개인 통보가 간 자리 */
	toldDead: string[];
	/** 그 밤에 아무 관계도 없던 좌석에게 통보가 간 자리 */
	toldStranger: string[];
	/** 같은 밤에 두 번 죽은 좌석 */
	killedTwice: string[];
	/** 이미 죽어 있는데 또 죽은 좌석 */
	killedWhileDead: string[];
	/** 같은 밤에 두 번 되살아난 좌석 */
	revivedTwice: string[];
	/** 죽은 적이 없는데 되살아난 좌석 */
	revivedTooEarly: string[];
	/** alive 플래그와 사망 명단이 어긋난 자리 */
	inconsistent: string[];
}

interface SimOptions {
	/**
	 * 죽은 좌석의 지목을 의도 목록에 섞는다.
	 *
	 * 실제 서버에서는 죽은 사람의 위젯이 닫히지만, 늦게 도착한 메시지나
	 * 밤 도중의 사망은 그 보장을 뚫는다. 섞어 넣은 판과 섞지 않은 판의
	 * 결과가 한 글자도 다르지 않아야 "사망자는 행동하지 않는다"가 규칙이다.
	 */
	ghostIntents?: boolean;
}

/** 연인은 둘씩 짝을 맺는다 (GameFlow.pairLovers와 같은 일) */
function pairLovers(seats: Seat[]): void {
	const lovers: Seat[] = [];
	for (const found of seats) {
		if (found.role === Role.LOVER) lovers.push(found);
	}
	let i = 0;
	while (i + 1 < lovers.length) {
		lovers[i].loverIndex = lovers[i + 1].index;
		lovers[i + 1].loverIndex = lovers[i].index;
		i += 2;
	}
}

/** 밤이 시작될 때 지워지는 것들. 유혹·협박은 지난 낮까지 살아 있다가 여기서 풀린다 */
function resetRound(seats: Seat[]): void {
	for (const found of seats) {
		found.healed = false;
		found.blocked = false;
		found.attackedBy = [];
		found.scooped = false;
		found.usedSkill = false;
		found.noteText = "";
		found.voteCount = 0;
		found.votedFor = 0;
		found.seduced = false;
		found.intimidated = false;
	}
}

function killSeat(found: Seat): void {
	found.alive = false;
	found.attackedBy = [];
	found.healed = false;
	found.voteCount = 0;
}

function livingSeats(seats: Seat[]): Seat[] {
	const alive: Seat[] = [];
	for (const found of seats) {
		if (found.alive) alive.push(found);
	}
	return alive;
}

function pick<T>(pool: readonly T[], rng: () => number): T {
	return pool[Math.floor(rng() * pool.length)];
}

/**
 * 한 판을 끝까지 돌리고 일어난 일을 전부 적는다.
 *
 * 판단은 전부 무작위다. 마피아만 밀담으로 대상 하나에 표를 모은다 —
 * 그것을 안 하면 마피아가 서로 다른 사람을 쳐서 밤이 사실상 무력해지고,
 * 그러면 "마피아가 이기는 판"이 거의 나오지 않아 검사가 한쪽만 본다.
 */
function simulate(playerCount: number, seed: number, options?: SimOptions): Trace {
	const ghosts = options !== undefined && options.ghostIntents === true;
	const rng = seededRng(seed);
	const deck = buildRoleDeck(CLASSIC_RULES.deck, playerCount, rng);
	const seats: Seat[] = [];
	for (let i = 0; i < deck.length; i++) seats.push(seat(i + 1, deck[i]));
	pairLovers(seats);

	const trace: Trace = {
		deck: deck.slice(),
		winner: null,
		rounds: 0,
		frames: [],
		settled: 0,
		toldDead: [],
		toldStranger: [],
		killedTwice: [],
		killedWhileDead: [],
		revivedTwice: [],
		revivedTooEarly: [],
		inconsistent: [],
	};
	/** 시뮬레이터가 따로 세는 사망 명단. seat.alive와 어긋나면 그것이 고장이다 */
	const dead: number[] = [];

	for (let round = 0; round < ROUND_CAP; round++) {
		trace.rounds = round + 1;
		const frame: Frame = { round: round + 1, nightDeaths: [], revives: [], executed: 0, told: [] };
		trace.frames.push(frame);
		resetRound(seats);

		/* ===== 밤 ===== */
		const alive = livingSeats(seats);
		const intents: NightIntent[] = [];
		const chatting: Seat[] = [];
		const outsiders: Seat[] = [];
		for (const found of alive) {
			if (inMafiaChat(found)) chatting.push(found);
			else outsiders.push(found);
		}
		const mafiaTarget = chatting.length > 0 && outsiders.length > 0 ? pick(outsiders, rng) : null;

		const graves: Seat[] = [];
		for (const found of seats) {
			if (!found.alive) graves.push(found);
		}

		for (const actor of alive) {
			if (!hasNightTurn(actor, round)) continue;
			const others: Seat[] = [];
			for (const other of alive) {
				if (other.index !== actor.index) others.push(other);
			}
			// 무덤을 고르는 직업(성직자·영매)에게는 사망자만 보인다. 서비스가
			// RoleDef.targetsDead를 보고 그렇게 그리므로 여기서도 그렇게 둔다 —
			// 산 사람을 지목하게 두면 시뮬레이터가 실제로 일어날 수 없는
			// 입력을 만들어 내고, 거기서 나온 실패는 게임의 고장이 아니다
			const digs = effectiveDef(actor).targetsDead === true;
			const pool = digs ? graves : others;
			if (pool.length === 0) continue;
			// 밀담에 앉은 사람은 상의한 대상을 친다. 그 외에는 아무나 고른다
			const shared = !digs && inMafiaChat(actor) && mafiaTarget !== null;
			const target = shared ? (mafiaTarget as Seat) : pick(pool, rng);
			putIntent(intents, actor.index, target.index);
		}
		// 죽은 사람의 지목. 파이프라인이 이것을 버리지 않으면 결과가 달라진다.
		// 대상은 rng로 뽑지 않는다 — 난수를 한 번 더 당기면 그 뒤의 모든 판단이
		// 한 칸씩 밀려서, 유령을 제대로 무시했는데도 두 판이 다르게 흐른다.
		// 그러면 이 검사는 파이프라인이 아니라 자기 난수 소비를 재는 셈이 된다
		if (ghosts && dead.length > 0 && alive.length > 0) {
			putIntent(intents, dead[0], alive[0].index);
		}

		// 그 밤에 개인 통보를 받을 자격이 있는 좌석 — 능력을 쓴 사람과 그 대상.
		// 도굴꾼을 더하는 것은 그가 아무도 지목하지 않고 스스로 무덤을 파기
		// 때문이다(NightPipeline.digGraves). 자기 능력의 결과를 자기가 받는 것은
		// 누출이 아니다. 여기에 이름을 적어 두면, 지목 없이 통보받는 직업이
		// 새로 생겼을 때 이 테스트가 멈춰서 그것이 누출인지 사람이 판단하게 된다.
		//
		// 판정 전에 세는 것이 중요하다 — 도굴꾼은 무덤을 파면서 자기 직업을
		// 파낸 직업으로 바꾼다. 판정 뒤에 훑으면 그는 이미 도굴꾼이 아니다
		const involved: number[] = [];
		for (const intent of intents) {
			if (involved.indexOf(intent.actor) < 0) involved.push(intent.actor);
			if (involved.indexOf(intent.target) < 0) involved.push(intent.target);
		}
		for (const found of alive) {
			if (found.role === Role.GRAVEDIGGER && involved.indexOf(found.index) < 0) {
				involved.push(found.index);
			}
		}

		const peaceful = isPeacefulNight(round + 1, playerCount, CLASSIC_RULES.firstNightPeacefulUpTo);
		const settled = resolveNightIntents(seats, intents, { skipAttacks: peaceful });
		for (const reveal of settled.reveals) {
			frame.told.push(reveal.seat);
			if (dead.indexOf(reveal.seat) >= 0) {
				trace.toldDead.push(`${round + 1}밤 ${reveal.seat}번: ${reveal.line}`);
			}
			if (involved.indexOf(reveal.seat) < 0) {
				trace.toldStranger.push(`${round + 1}밤 ${reveal.seat}번: ${reveal.line}`);
			}
		}

		for (const casualty of settled.casualties) {
			const index = casualty.seat.index;
			if (FATAL_OUTCOME[casualty.outcome]) {
				if (frame.nightDeaths.indexOf(index) >= 0) {
					trace.killedTwice.push(`${round + 1}밤 ${index}번`);
					continue;
				}
				if (dead.indexOf(index) >= 0) {
					trace.killedWhileDead.push(`${round + 1}밤 ${index}번`);
					continue;
				}
				frame.nightDeaths.push(index);
				dead.push(index);
				killSeat(casualty.seat);
			} else if (casualty.outcome === NightOutcome.REVIVED) {
				if (frame.revives.indexOf(index) >= 0) {
					trace.revivedTwice.push(`${round + 1}밤 ${index}번`);
					continue;
				}
				const at = dead.indexOf(index);
				// 죽은 적이 없는 사람을 되살렸다면 부활이 죽음보다 먼저 처리된 것이다
				if (at < 0) trace.revivedTooEarly.push(`${round + 1}밤 ${index}번`);
				else dead.splice(at, 1);
				frame.revives.push(index);
				casualty.seat.alive = true;
			}
			// SAVED·SHIELDED는 결말이 아니라 무사했다는 기록이다. 상태를 건드리지 않는다
		}

		for (const found of seats) {
			const listed = dead.indexOf(found.index) >= 0;
			if (found.alive === listed) trace.inconsistent.push(`${round + 1}밤 ${found.index}번`);
		}

		let winner = evaluateWinner(seats);
		if (winner !== null) {
			trace.settled++;
			trace.winner = winner;
			return trace;
		}

		/* ===== 낮 ===== */
		const voters = livingSeats(seats);
		for (const voter of voters) {
			// 협박당한 사람은 표를 내지 못한다 (Voting.canVote)
			if (voter.intimidated) continue;
			const choices: Seat[] = [];
			for (const other of voters) {
				if (other.index !== voter.index) choices.push(other);
			}
			if (choices.length === 0) continue;
			const target = pick(choices, rng);
			voter.votedFor = target.index;
			const weight = roleDef(voter.role).voteWeight;
			target.voteCount += weight === undefined ? 1 : weight;
		}
		const result = tallyVotes(seats);
		if (result.outcome === VoteOutcome.EXECUTE && result.target !== null) {
			frame.executed = result.target.index;
			if (dead.indexOf(result.target.index) >= 0) {
				trace.killedWhileDead.push(`${round + 1}낮 ${result.target.index}번`);
			} else {
				dead.push(result.target.index);
				killSeat(result.target);
			}
		}

		for (const found of seats) {
			const listed = dead.indexOf(found.index) >= 0;
			if (found.alive === listed) trace.inconsistent.push(`${round + 1}낮 ${found.index}번`);
		}

		winner = evaluateWinner(seats);
		if (winner !== null) {
			trace.settled++;
			trace.winner = winner;
			return trace;
		}
	}
	return trace;
}

/** 인원 p, s번째 판의 시드. 밸런스 시뮬레이터(tools/balance)와 같은 식을 쓴다 */
const seedOf = (playerCount: number, sample: number) => sample * 7919 + playerCount * 104729 + 1;

/** 인원대 전체를 한 번씩 돈다. 판 수는 인원마다 samples개 */
function eachGame(samples: number, visit: (trace: Trace, playerCount: number, sample: number) => void) {
	for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) {
		for (let sample = 1; sample <= samples; sample++) {
			visit(simulate(count, seedOf(count, sample)), count, sample);
		}
	}
}

/* ------------------------------------------------------------------ */
/* 1~7. 자동 시뮬레이션                                                 */
/* ------------------------------------------------------------------ */

describe("클래식 자동 시뮬레이션", () => {
	it("1. 고정 시드로 반복해도 같은 판이 나온다", () => {
		for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) {
			for (let sample = 1; sample <= 12; sample++) {
				const seed = seedOf(count, sample);
				const first = simulate(count, seed);
				const again = simulate(count, seed);
				assert.deepEqual(again, first, `${count}인 ${seed}번 판이 두 번 다르게 흘렀습니다`);
			}
		}
	});

	it("2. 무한 상태 전이가 없다", () => {
		const stuck: string[] = [];
		eachGame(30, (trace, count, sample) => {
			if (trace.winner === null) stuck.push(`${count}인 ${sample}번 판(${trace.rounds}라운드)`);
			// 라운드마다 프레임이 정확히 하나씩 쌓인다. 한 만료에 두 번
			// 넘어가면 여기가 어긋난다
			assert.equal(trace.frames.length, trace.rounds);
		});
		assert.deepEqual(stuck, [], `${ROUND_CAP}라운드 안에 끝나지 않은 판이 있습니다`);
	});

	it("3. 사망자는 다시 행동하지 않는다", () => {
		// 죽은 좌석의 지목을 섞어 넣은 판과 넣지 않은 판을 견준다.
		// 한 글자라도 다르면 파이프라인이 유령의 손을 받은 것이다
		for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) {
			for (let sample = 1; sample <= 12; sample++) {
				const seed = seedOf(count, sample);
				const clean = simulate(count, seed);
				const haunted = simulate(count, seed, { ghostIntents: true });
				assert.deepEqual(haunted, clean, `${count}인 ${seed}번 판에서 사망자가 행동했습니다`);
			}
		}
	});

	it("4. 생존과 사망이 동시에 성립하지 않는다", () => {
		eachGame(30, trace => {
			assert.deepEqual(trace.inconsistent, [], "좌석의 생사가 두 갈래로 갈렸습니다");
		});
	});

	it("5. 같은 사망을 두 번 처리하지 않는다", () => {
		eachGame(30, trace => {
			assert.deepEqual(trace.killedTwice, [], "한 밤에 같은 좌석이 두 번 죽었습니다");
			assert.deepEqual(trace.killedWhileDead, [], "이미 죽은 좌석이 또 죽었습니다");
			assert.deepEqual(trace.revivedTwice, [], "한 밤에 같은 좌석이 두 번 되살아났습니다");
			// 그 밤에 죽은 사람을 그 밤에 되살리는 것은 성직자의 일이다. 막을 것은
			// 겹침이 아니라 순서다 — 부활이 죽음보다 먼저 처리되면 되살린 사람이
			// 죽은 채로 남고, casualties만 보고는 그 사실이 드러나지 않는다
			assert.deepEqual(trace.revivedTooEarly, [], "죽기 전에 되살아난 좌석이 있습니다");
		});
	});

	it("6. 승리는 한 번만 기록된다", () => {
		eachGame(30, trace => {
			// 판이 끝났다면 정확히 한 번, 안 끝났다면 0번
			assert.equal(trace.settled, trace.winner === null ? 0 : 1, "승리가 여러 번 기록됐습니다");
			if (trace.winner === null) return;
			// 마지막 라운드 뒤에 더 진행한 흔적이 없다
			const last = trace.frames[trace.frames.length - 1];
			assert.equal(last.round, trace.rounds);
		});
	});

	it("7. 비공개 정보가 남에게 전달되지 않는다", () => {
		eachGame(30, trace => {
			assert.deepEqual(trace.toldDead, [], "사망자에게 개인 통보가 갔습니다");
			assert.deepEqual(trace.toldStranger, [], "그 밤과 무관한 좌석에게 개인 통보가 갔습니다");
			for (const frame of trace.frames) {
				// 개인 통보는 좌석 하나를 지목한다. 0번(전체)은 개인 통보가 아니다
				for (const listener of frame.told) assert.ok(listener > 0, "수신자가 없는 개인 통보입니다");
			}
		});
	});
});
