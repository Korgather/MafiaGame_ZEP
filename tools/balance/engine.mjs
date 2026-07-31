/**
 * 밸런스 시뮬레이터 엔진.
 *
 * 규칙을 따로 옮겨 적지 않는다 — src/domain의 순수 모듈(buildRoleDeck,
 * resolveNightIntents, evaluateWinner, tallyVotes)을 그대로 불러 돌린다.
 * 옮겨 적은 규칙으로 잰 승률은 규칙이 바뀌는 순간 조용히 거짓말이 되고,
 * 그 거짓말은 숫자가 그럴듯해서 눈에 띄지 않는다.
 *
 * ZEP API에 닿는 코드(services)는 한 줄도 부르지 않는다. 그래서 이 파일은
 * Node에서 그냥 돈다 — `node tools/balance/report.mjs`.
 *
 * .mjs이고 tools/ 아래인 이유: tsconfig가 tools를 제외하고 lint도 src·tests만
 * 본다. 시뮬레이터는 제품 코드가 아니라 측정 도구라 그 검사망 밖에 둔다.
 */
import { Role, Team } from "../../src/types/Game.types.ts";
import { buildRoleDeck } from "../../src/domain/RoleAssignment.ts";
import { roleDef, inMafiaChat, NightActionKind } from "../../src/domain/Roles.ts";
import { resolveNightIntents } from "../../src/domain/NightPipeline.ts";
import { isPeacefulNight, NightOutcome } from "../../src/domain/NightResolution.ts";
import { evaluateWinner } from "../../src/domain/WinCondition.ts";
import { tallyVotes, VoteOutcome } from "../../src/domain/Vote.ts";

/** 시드를 받는 난수. 같은 시드면 같은 판이 나와야 반사실 비교가 성립한다 */
export function mulberry32(a) {
	return function () {
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** 인원 p, 반복 s번째 판의 시드. 서로 다른 안을 같은 판 위에서 비교하려고 고정한다 */
export const seedOf = (p, s) => s * 7919 + p * 104729 + 1;

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/* Seat의 밤·투표 로직이 읽는 필드만 채운다. ZEP 쪽 필드는 이 엔진이 건드리지 않는다 */
function makeSeat(index, role) {
	const def = roleDef(role);
	return {
		playerId: "p" + index, index, name: "P" + index, rank: "",
		role, team: def.team, alive: true, ready: true,
		votedFor: 0, voteCount: 0, healed: false, attackedBy: [],
		armored: def.survivesFirstAttack === true, blocked: false, scooped: false,
		usedSkill: false, usesSpent: 0, noteText: "", kickedBy: [], connected: true,
	};
}

function resetRound(seats) {
	for (const s of seats) {
		s.healed = false; s.blocked = false; s.attackedBy = []; s.scooped = false;
		s.usedSkill = false; s.noteText = ""; s.voteCount = 0; s.votedFor = 0;
	}
}

function killSeat(s) { s.alive = false; s.attackedBy = []; s.healed = false; s.voteCount = 0; }

/** NightResolution.noTurnReason과 같은 조건 — 한쪽만 바뀌면 측정이 규칙과 어긋난다 */
function hasTurn(seat, turnCount) {
	const def = roleDef(seat.role);
	if (def.nightAction === null) return false;
	if (def.nightAction === NightActionKind.NOTE) return false;
	if (def.maxUses !== undefined && seat.usesSpent >= def.maxUses) return false;
	if (def.firstNightOnly && turnCount > 0) return false;
	if (def.needsPriorDay && turnCount === 0) return false;
	return true;
}

export function deckFor(rules, playerCount, seed) {
	return buildRoleDeck(rules.deck, playerCount, mulberry32(seed));
}

/**
 * 한 판을 끝까지 돌린다.
 *
 * 시민의 실력을 하나의 숫자로 정할 수 없어서 네 모델을 따로 돌린다. 이 게임의
 * 승률은 "시민이 조사 결과를 공유하고 믿는가"에 30%p씩 움직이므로, 한 모델만
 * 재면 그 모델의 가정이 곧 결론이 된다.
 *
 *   A 무지     — 시민은 무작위로 투표한다. 마피아만 담합한다.        (시민 하한)
 *   C 공개정보 — 시민은 한 명에게 표를 모으되 공개 정보만 쓴다.
 *                (기자 특종 + 처형 시 공개되는 진영)                 (정보 전달 실패)
 *   D 조사공유 — 경찰·점쟁이 결과가 공유되고 믿긴다. 그 외에는 순진하다:
 *                마피아는 경찰을 노리지 않고, 의사·건달은 무작위다.  (현실 근사)
 *   B 완전정보 — 위에 더해 마피아는 드러난 경찰을 죽이고, 의사는 경찰을
 *                지키고, 건달은 알려진 마피아를 막는다.              (시민 상한)
 *
 * 80라운드에서 끊는다. 실제 게임에는 라운드 제한이 없지만(GameFlow), 표결이
 * 계속 동률이면 밤 사망자도 없는 상태가 이어질 수 있어 측정 쪽에서 막는다.
 * 이 상한에 닿는 판의 비율 자체가 읽을 만한 신호다.
 */
export function playGame(rules, playerCount, seed, model) {
	const rng = mulberry32(seed);
	const deck = buildRoleDeck(rules.deck, playerCount, rng);
	const seats = deck.map((r, i) => makeSeat(i + 1, r));
	const alive = () => seats.filter(s => s.alive);
	const byIdx = i => seats.find(s => s.index === i);

	const known = {};          // 좌석번호 -> "MAFIA" | "CITIZEN", 시민 진영이 공유하는 지식
	let policeOuted = false;   // 경찰이 조사를 했다 = 낮에 결과를 말했다
	let falseClear = false;    // 경찰이 마피아 팀을 "시민"으로 확인해 준 적이 있는가
	let defected = false;      // 스파이가 마피아로 넘어간 적이 있는가

	let turnCount = 0;
	let rounds = 0;
	for (; rounds < 80; rounds++) {
		resetRound(seats);

		/* ===== 밤 ===== */
		const intents = [];
		const A = alive();
		const chat = A.filter(s => inMafiaChat(s));
		const nonChat = A.filter(s => !inMafiaChat(s));
		const knownMafiaAlive = A.filter(s => known[s.index] === "MAFIA");

		// 밀담은 몇 명이 앉든 상의해서 한 명만 친다
		let mafiaTarget = null;
		if (chat.length > 0 && nonChat.length > 0) {
			if (model === "B" && policeOuted) {
				const police = nonChat.find(s => s.role === Role.POLICE);
				mafiaTarget = police || pick(nonChat, rng);
			} else mafiaTarget = pick(nonChat, rng);
		}

		for (const s of A) {
			if (!hasTurn(s, turnCount)) continue;
			const def = roleDef(s.role);
			const others = A.filter(o => o.index !== s.index);
			if (others.length === 0) continue;
			let target = null;

			if (def.nightAction === NightActionKind.ATTACK) {
				if (inMafiaChat(s)) target = mafiaTarget;
				else if (s.role === Role.BEAST) target = pick(others, rng);   // 밀담이 없어 조율할 수단이 없다
				else if (model === "A") target = pick(others, rng);
				else if (knownMafiaAlive.length > 0) target = knownMafiaAlive[0];
				else target = null;                                           // 자경단원은 총알을 아낀다
			} else if (def.nightAction === NightActionKind.HEAL) {
				if (model === "B" && policeOuted) {
					const police = A.find(o => o.role === Role.POLICE);
					target = police || pick(A, rng);
				} else target = pick(A, rng);
			} else if (def.nightAction === NightActionKind.BLOCK) {
				if (model === "B" && knownMafiaAlive.length > 0) target = knownMafiaAlive[0];
				else target = pick(others, rng);
			} else {
				const unknown = others.filter(o => known[o.index] === undefined);
				target = unknown.length > 0 ? pick(unknown, rng) : pick(others, rng);
			}
			if (target) intents.push({ actor: s.index, target: target.index });
		}

		const peaceful = isPeacefulNight(turnCount + 1, playerCount, rules.firstNightPeacefulUpTo);
		const settle = resolveNightIntents(seats, intents, { skipAttacks: peaceful });
		if (settle.defected.length > 0) defected = true;

		/* 조사 결과가 시민 진영에 퍼지는가 — 모델을 가르는 유일한 지점 */
		if (model === "B" || model === "D") {
			for (const it of intents) {
				const actor = byIdx(it.actor), tgt = byIdx(it.target);
				if (!actor || !tgt || actor.blocked || actor.team !== Team.CITIZEN) continue;
				const d = roleDef(actor.role);
				if (d.nightAction === NightActionKind.INSPECT_TEAM) {
					const says = roleDef(tgt.role).appearsAsMafia === true ? "MAFIA" : "CITIZEN";
					// 위장 직업은 "마피아가 아니다"라는 틀린 답을 만든다. 못 찾은 것과 다르다
					if (says === "CITIZEN" && tgt.team === Team.MAFIA) falseClear = true;
					known[tgt.index] = says;
					policeOuted = true;
				} else if (d.nightAction === NightActionKind.INSPECT_ROLE) {
					known[tgt.index] = roleDef(tgt.role).team === Team.MAFIA ? "MAFIA" : "CITIZEN";
				}
			}
		}
		// 특종은 전원에게 공개되므로 무지 모델을 뺀 모두가 쓴다
		if (model !== "A") {
			for (const s of seats) {
				if (s.scooped) known[s.index] = roleDef(s.role).team === Team.MAFIA ? "MAFIA" : "CITIZEN";
			}
		}

		for (const c of settle.casualties) {
			if (c.outcome === NightOutcome.KILLED || c.outcome === NightOutcome.BACKFIRED) killSeat(c.seat);
		}
		let w = evaluateWinner(seats);
		if (w) return { winner: w, rounds: rounds + 1, deck, falseClear, defected };

		/* ===== 낮 투표 ===== */
		const voters = alive();
		const cNonChat = voters.filter(s => !inMafiaChat(s));
		const mafiaVote = cNonChat.length > 0 ? pick(cNonChat, rng) : null;

		let consensus = null;
		if (model !== "A") {
			const km = voters.filter(s => known[s.index] === "MAFIA");
			if (km.length > 0) consensus = km[0];
			else {
				const pool = voters.filter(s => known[s.index] !== "CITIZEN");
				consensus = pool.length > 0 ? pick(pool, rng) : null;
			}
		}

		for (const v of voters) {
			let t = null;
			if (inMafiaChat(v)) t = mafiaVote;
			else if (model === "A") t = pick(voters.filter(o => o.index !== v.index), rng);
			else if (consensus && consensus.index !== v.index) t = consensus;
			else {
				const rest = voters.filter(o => o.index !== v.index);
				t = rest.length > 0 ? pick(rest, rng) : null;
			}
			if (!t) continue;
			v.votedFor = t.index;
			t.voteCount += roleDef(v.role).voteWeight || 1;
		}

		const res = tallyVotes(seats);
		// 처형은 진영을 공개한다(services/Death.ts). 모든 모델이 이 정보는 받는다
		if (res.outcome === VoteOutcome.EXECUTE && res.target) {
			known[res.target.index] = res.target.team === Team.MAFIA ? "MAFIA" : "CITIZEN";
			killSeat(res.target);
		}
		w = evaluateWinner(seats);
		if (w) return { winner: w, rounds: rounds + 1, deck, falseClear, defected };
		turnCount++;
	}
	return { winner: null, rounds, deck, falseClear, defected };
}
