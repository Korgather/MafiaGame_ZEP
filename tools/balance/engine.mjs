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
import { Judgement, Role, Team } from "../../src/types/Game.types.ts";
import { buildRoleDeck } from "../../src/domain/RoleAssignment.ts";
import { roleDef, inMafiaChat, startsContacted, NightActionKind } from "../../src/domain/Roles.ts";
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

/*
 * Seat의 밤·투표 로직이 읽는 필드만 채운다. ZEP 쪽 필드는 이 엔진이 건드리지 않는다.
 *
 * 여기 빠진 필드는 타입 검사에 걸리지 않는다 — tools/는 tsconfig 밖이다.
 * 그래서 새 필드가 Seat에 생기면 이 함수는 조용히 undefined를 넘기고,
 * 그 undefined를 읽는 규칙(예: countsForMafiaWin의 contacted)이 판정을
 * 통째로 뒤집는다. Seat에 필드를 더할 때 이 함수를 같이 본다.
 */
function makeSeat(index, role) {
	const def = roleDef(role);
	return {
		playerId: "p" + index, index, name: "P" + index, rank: "",
		role, team: def.team, alive: true, ready: true,
		votedFor: 0, voteCount: 0, judgement: Judgement.NONE, timeVoteSpent: false,
		healed: false, attackedBy: [],
		armored: def.survivesFirstAttack === true, blocked: false, scooped: false,
		usedSkill: false, usesSpent: 0, noteText: "", kickedBy: [], connected: true,
		// 접선이 필요 없는 직업은 처음부터 참이다. 거짓으로 두면 마피아 본진이
		// 승리 판정에서 무게 0이 되어 모든 판이 시민 승리로 끝난다
		contacted: startsContacted(role),
		seduced: false, intimidated: false, exorcised: false,
		loverIndex: 0, borrowedRole: null, markIndex: 0,
	};
}

/**
 * GameFlow.pairLovers와 같은 일. 좌석 하나만 보는 makeSeat이 못 하는 몫이다.
 *
 * 짝을 안 맺으면 loverIndex가 0인 채로 남아 연인이 아무 일도 하지 않는다 —
 * 동반 사망이 없으니 측정된 승률이 실제보다 시민 쪽으로 기운다. 클래식은
 * 연인을 반드시 둘씩 뽑으므로 홀수 가지는 여기서 돌지 않지만, 표를 쓰지
 * 않는 모드에서도 이 함수를 지나므로 그쪽 규칙(GameFlow)과 같게 적는다.
 */
function pairLovers(seats) {
	const lovers = seats.filter(s => s.role === Role.LOVER);
	let i = 0;
	while (i + 1 < lovers.length) {
		lovers[i].loverIndex = lovers[i + 1].index;
		lovers[i + 1].loverIndex = lovers[i].index;
		i += 2;
	}
	if (i < lovers.length) {
		const odd = lovers[i];
		const def = roleDef(Role.CITIZEN);
		odd.role = Role.CITIZEN;
		odd.team = def.team;
		odd.contacted = startsContacted(Role.CITIZEN);
		odd.armored = def.survivesFirstAttack === true;
	}
}

function resetRound(seats) {
	for (const s of seats) {
		s.healed = false; s.blocked = false; s.attackedBy = []; s.scooped = false;
		s.usedSkill = false; s.noteText = ""; s.voteCount = 0; s.votedFor = 0;
		// 유혹·협박은 다음 낮까지 살아 있다가 그 다음 밤 시작에 풀린다.
		// 밤이 시작될 때 지우는 이 자리가 곧 "그 다음 밤"이다
		s.seduced = false; s.intimidated = false;
		s.judgement = Judgement.NONE; s.timeVoteSpent = false;
	}
}

function killSeat(s) { s.alive = false; s.attackedBy = []; s.healed = false; s.voteCount = 0; }

function seatOf(seats, index) {
	for (const s of seats) if (s.index === index) return s;
	return null;
}

/**
 * 낮의 처형이 잇는 연쇄. services/Death.ts의 kill(EXECUTION) 경로와 같다.
 *
 * 밤의 연쇄는 파이프라인이 결말 목록으로 만들어 주지만 낮은 만들 목록이 없어
 * 처형 처리 안에서 끝난다. 여기를 비워 두면 측정 도구에서만 연인과
 * 테러리스트가 아무 일도 하지 않아, 그 두 직업이 들어간 인원의 승률이
 * 게임과 다른 숫자로 나온다.
 */
function executeSeat(seats, target) {
	if (!target.alive) return;
	killSeat(target);
	// 폭탄이 먼저 터지고, 폭사한 사람의 연인이 뒤따른다(Death.detonate와 같은 순서)
	if (target.markIndex !== 0) {
		const mark = seatOf(seats, target.markIndex);
		if (mark && mark.alive && mark.team !== target.team) {
			killSeat(mark);
			mournSeat(seats, mark);
		}
	}
	mournSeat(seats, target);
}

/** 낮에 연인을 잃으면 뒤따른다. 밤의 공격은 희생이라 여기 오지 않는다 */
function mournSeat(seats, s) {
	if (s.loverIndex === 0) return;
	const partner = seatOf(seats, s.loverIndex);
	if (!partner || !partner.alive) return;
	killSeat(partner);
}

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
 *
 * opts.confirmVote — 마피아42식 찬반투표를 붙인다(기본: 없음, 현행 규칙).
 * 값은 "근거 없는 지목에 시민이 찬성표를 줄 확률"이다. 최다 득표가 나온 뒤
 * 한 번 더 묻는 관문이라, 지목 단계까지는 현행과 똑같이 굴러간다.
 *
 * opts.confirmRetries — 부결된 낮에 다시 지목할 수 있는 횟수(기본 0).
 * 이 값이 승패를 가른다. 0이면 부결이 곧 그 낮의 종료라 밤 한 번을 그냥
 * 내주는 셈이고, 1이면 부결 비용이 0에 가까워진다.
 */
export function playGame(rules, playerCount, seed, model, opts) {
	const confirmVote = opts && typeof opts.confirmVote === "number" ? opts.confirmVote : null;
	const confirmRetries = opts && typeof opts.confirmRetries === "number" ? opts.confirmRetries : 0;
	const rng = mulberry32(seed);
	const deck = buildRoleDeck(rules.deck, playerCount, rng);
	const seats = deck.map((r, i) => makeSeat(i + 1, r));
	pairLovers(seats);
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
			} else if (def.nightAction === NightActionKind.SEDUCE) {
				if (model === "B" && knownMafiaAlive.length > 0) target = knownMafiaAlive[0];
				else target = pick(others, rng);
			} else if (def.targetsDead) {
				// 무덤을 고르는 직업(성직자·영매)에게는 사망자만 보인다. 산 사람을
				// 주면 능력이 발동조차 하지 않아, 그 직업이 없는 판으로 승률을
				// 재는 셈이 된다 — 성직자가 통째로 빠지면 시민이 실제보다 불리하게 나온다
				const graves = seats.filter(o => !o.alive);
				target = graves.length > 0 ? pick(graves, rng) : null;
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

		// 죽음이 아닌 결말(SAVED·SHIELDED·SPARED·REVIVED)만 빠진다. 밤의
		// 연쇄는 파이프라인이 이미 이 목록으로 만들어 두었으므로 여기서
		// 다시 잇지 않는다 — services/Night.resolveNight과 같은 구조다
		for (const c of settle.casualties) {
			const died =
				c.outcome === NightOutcome.KILLED ||
				c.outcome === NightOutcome.BACKFIRED ||
				c.outcome === NightOutcome.BOMBED ||
				c.outcome === NightOutcome.SACRIFICED ||
				c.outcome === NightOutcome.HEARTBREAK;
			if (died) killSeat(c.seat);
		}
		let w = evaluateWinner(seats);
		if (w) return { winner: w, rounds: rounds + 1, deck, falseClear, defected };

		/* ===== 낮 투표 ===== */
		// 찬반투표가 부결되면 그 낮으로 돌아와 다시 지목한다. 부결된 사람은
		// 그 낮 동안 후보에서 빠진다 — 빼지 않으면 같은 사람이 다시 최다 득표를
		// 받아 재지목이 아무 일도 하지 않는 되풀이가 된다.
		// 재지목 횟수가 0이면 이 반복문은 한 바퀴만 돌고, 현행과 완전히 같다.
		const rejected = [];
		for (let attempt = 0; attempt <= confirmRetries; attempt++) {
			for (const s of seats) { s.votedFor = 0; s.voteCount = 0; }
			// 협박당한 사람은 표를 내지 못한다(Voting.canVote). 후보(pool0)에서는
			// 빼지 않는다 — 협박은 표를 뺏는 능력이지 지목을 막는 능력이 아니다
			const voters = alive().filter(s => !s.intimidated);
			const pool0 = alive().filter(s => rejected.indexOf(s.index) < 0);
			const cNonChat = pool0.filter(s => !inMafiaChat(s));
			const mafiaVote = cNonChat.length > 0 ? pick(cNonChat, rng) : null;

			let consensus = null;
			if (model !== "A") {
				const km = pool0.filter(s => known[s.index] === "MAFIA");
				if (km.length > 0) consensus = km[0];
				else {
					const pool = pool0.filter(s => known[s.index] !== "CITIZEN");
					consensus = pool.length > 0 ? pick(pool, rng) : null;
				}
			}

			for (const v of voters) {
				let t = null;
				if (inMafiaChat(v)) t = mafiaVote;
				else if (model === "A") t = pick(pool0.filter(o => o.index !== v.index), rng);
				else if (consensus && consensus.index !== v.index) t = consensus;
				else {
					const rest = pool0.filter(o => o.index !== v.index);
					t = rest.length > 0 ? pick(rest, rng) : null;
				}
				if (!t) continue;
				v.votedFor = t.index;
				t.voteCount += roleDef(v.role).voteWeight || 1;
			}

			const res = tallyVotes(seats);
			// 최다 득표가 안 나온 낮은 찬반투표까지 가지 않는다
			if (res.outcome !== VoteOutcome.EXECUTE || !res.target) break;

			let confirmed = true;
			if (confirmVote !== null) {
				// 최다 득표자를 두고 한 번 더 묻는다. 밀담은 자기 편이면 반대하고,
				// 시민은 근거가 있으면 찬성, 없으면 confirmVote 확률로만 찬성한다.
				// 지목당한 본인은 빠진다(최후의 반론을 하는 자리라 표를 던지지 않는다)
				const sure = known[res.target.index] === "MAFIA";
				const shield = inMafiaChat(res.target);
				let yes = 0, no = 0;
				for (const v of alive()) {
					if (v.index === res.target.index) continue;
					// 협박당한 사람은 누르지 못하고, 던지지 못한 찬반은 반대로 센다
					// (Trial.judgementPassed). 지목 투표와 달리 분모에는 남는다
					if (v.intimidated) { no++; continue; }
					let agree;
					if (inMafiaChat(v)) agree = !shield;
					else if (model === "A") agree = rng() < 0.5;
					else agree = sure || rng() < confirmVote;
					if (agree) yes++; else no++;
				}
				// 동수의 처분은 모드의 값이다(RuleSet.judgementTie). 클래식은
				// 찬성이 반대와 같아도 처형하고, 나머지 모드는 살린다.
				// 여기에 부등호를 하나 옮겨 적으면 측정 도구가 게임과 다른
				// 규칙으로 승률을 재게 되고, 그 숫자는 틀린 줄도 모른 채 쓰인다
				confirmed = rules.judgementTie === "execute" ? yes >= no : yes > no;
			}
			if (!confirmed) { rejected.push(res.target.index); continue; }

			// 처형은 진영을 공개한다(services/Death.ts). 모든 모델이 이 정보는 받는다
			known[res.target.index] = res.target.team === Team.MAFIA ? "MAFIA" : "CITIZEN";
			executeSeat(seats, res.target);
			break;
		}
		w = evaluateWinner(seats);
		if (w) return { winner: w, rounds: rounds + 1, deck, falseClear, defected };
		turnCount++;
	}
	return { winner: null, rounds, deck, falseClear, defected };
}
