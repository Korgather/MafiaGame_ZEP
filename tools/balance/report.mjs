/**
 * 밸런스 측정 리포트.
 *
 *   node tools/balance/report.mjs win       [n]   인원별·모델별 시민 승률
 *   node tools/balance/report.mjs disguise  [n]   위장 직업 등장률과 그에 따른 승률
 *   node tools/balance/report.mjs impact    [n]   직업이 덱에 있을 때의 승률 변화
 *   node tools/balance/report.mjs falseclear[n]   경찰 오판 발생률과 그 판의 승률
 *   node tools/balance/report.mjs police    [n]   경찰이 위장을 꿰뚫어 본다면
 *   node tools/balance/report.mjs variants  [n]   인원표·손잡이 대안 비교
 *   node tools/balance/report.mjs mafia42   [n]   마피아42에서 가져올 구조 비교
 *
 * n은 인원당 반복 횟수(기본 4000). 결과 해석은 docs/design/balance-review.md.
 */
import { Role, Team } from "../../src/types/Game.types.ts";
import { STANDARD_RULES, BLITZ_RULES, SILENCE_RULES } from "../../src/domain/RuleSet.ts";
import { roleDef, ROLE_DEFS } from "../../src/domain/Roles.ts";
import { ChatChannel } from "../../src/domain/chat/ChatChannel.ts";
import { playGame, deckFor, seedOf } from "./engine.mjs";

const WHICH = process.argv[2] || "win";
const N = Number(process.argv[3] || 4000);

const pct = x => (x * 100).toFixed(1).padStart(5);
const sgn = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1).padStart(5) + "%p";
const MODEL_NAME = { A: "무지", C: "공개정보", D: "조사공유", B: "완전정보" };
const ALL_ROLES = Object.keys(Role).map(k => Role[k]);

function countHeader(lo, hi, pad) {
	let h = "".padEnd(pad);
	for (let p = lo; p <= hi; p++) h += ("" + p + "인").padStart(8);
	return h;
}

/** 한 규칙·인원·모델의 시민 승률 */
function winRate(rules, p, model, opts) {
	let w = 0;
	for (let s = 0; s < N; s++) if (playGame(rules, p, seedOf(p, s), model, opts).winner === Team.CITIZEN) w++;
	return w / N;
}

function rows(sets, lo, hi, model, pad) {
	for (const [name, rules, opts] of sets) {
		let line = name.padEnd(pad);
		for (let p = lo; p <= hi; p++) line += (pct(winRate(rules, p, model, opts)) + "%").padStart(8);
		console.log(line);
	}
}

/* ---------- win: 네 모델을 나란히 ---------- */
function win() {
	for (const [label, rules, lo, hi] of [
		["표준전", STANDARD_RULES, 4, 12],
		["속도전", BLITZ_RULES, 4, 8],
		["침묵전", SILENCE_RULES, 8, 12],
	]) {
		console.log("\n### " + label + " 시민 승률 (n=" + N + ")");
		let head = "인원 | 마 |  M0 ";
		for (const m of ["A", "C", "D", "B"]) head += "|" + MODEL_NAME[m].padStart(9) + " ";
		console.log(head + "| 스파이배신률(D)");
		for (let p = lo; p <= hi; p++) {
			const m = rules.deck.mafiaTeamSize[p];
			let line = String(p).padStart(3) + "인 | " + String(m).padStart(2)
				+ " | " + String(p - 2 * m).padStart(3) + " ";
			let dfRate = 0;
			for (const mk of ["A", "C", "D", "B"]) {
				let cw = 0, df = 0;
				for (let s = 0; s < N; s++) {
					const r = playGame(rules, p, seedOf(p, s), mk);
					if (r.winner === Team.CITIZEN) cw++;
					if (r.defected) df++;
				}
				if (mk === "D") dfRate = df / N;
				line += "|   " + pct(cw / N) + "% ";
			}
			console.log(line + "|      " + pct(dfRate) + "%");
		}
	}
}

/* ---------- disguise: 승률 곡선을 만드는 계단 ---------- */
function disguise() {
	const base = STANDARD_RULES;
	const V1 = { ...base, deck: { ...base.deck, mafiaPool: [Role.MAFIA, Role.MAFIA, Role.BEAST, Role.CON_ARTIST] } };
	const V2 = { ...base, deck: { ...base.deck, minPlayers: { ...base.deck.minPlayers, [Role.BEAST]: 5 } } };
	const V3 = { ...base, deck: { ...V1.deck, minPlayers: V2.deck.minPlayers } };
	const SETS = [["현행", base], ["V1 마피아 카드 한 장 추가", V1],
		["V2 짐승인간 하한 6→5", V2], ["V3 V1+V2", V3]];

	console.log("\n### 표준전 · 위장 직업(짐승인간·사기꾼) 등장률 (n=" + N + ")");
	console.log(countHeader(4, 12, 24));
	for (const [name, rules] of SETS) {
		let line = name.padEnd(24);
		for (let p = 4; p <= 12; p++) {
			let c = 0;
			for (let s = 0; s < N; s++) {
				const d = deckFor(rules, p, seedOf(p, s));
				if (d.indexOf(Role.BEAST) >= 0 || d.indexOf(Role.CON_ARTIST) >= 0) c++;
			}
			line += (pct(c / N) + "%").padStart(8);
		}
		console.log(line);
	}
	for (const model of ["C", "D", "B"]) {
		console.log("\n### 표준전 시민 승률 · 모델 " + MODEL_NAME[model] + " (n=" + N + ")");
		console.log(countHeader(4, 12, 24));
		rows(SETS, 4, 12, model, 24);
	}
}

/* ---------- impact ----------
   인원별로 따로 재고 인원 안에서만 비교한다. 인원을 뭉쳐 재면 등장 하한이 있는
   직업(짐승인간은 6인 이상, 기자는 11인 이상)이 "많은 인원 = 낮은 시민 승률"을
   자기 효과로 뒤집어쓴다. 실제로 뭉쳐 재면 기자가 마이너스로 나온다. */
function impact() {
	const avg = a => a.reduce((s, x) => s + x.d, 0) / a.length;
	for (const model of ["C", "B"]) {
		const per = {};
		for (let p = 4; p <= 12; p++) {
			const acc = {};
			for (const r of ALL_ROLES) acc[r] = [0, 0, 0, 0];  // [있는판, 있고이김, 없는판, 없고이김]
			for (let s = 0; s < N; s++) {
				const g = playGame(STANDARD_RULES, p, seedOf(p, s), model);
				const cw = g.winner === Team.CITIZEN ? 1 : 0;
				for (const r of ALL_ROLES) {
					if (g.deck.indexOf(r) >= 0) { acc[r][0]++; acc[r][1] += cw; }
					else { acc[r][2]++; acc[r][3] += cw; }
				}
			}
			for (const r of ALL_ROLES) {
				if (acc[r][0] === 0 || acc[r][2] === 0) continue;  // 그 인원에서 항상/전혀 안 나오면 비교 불가
				if (!per[r]) per[r] = [];
				per[r].push({ p, d: acc[r][1] / acc[r][0] - acc[r][3] / acc[r][2] });
			}
		}
		console.log("\n### 표준전 · " + MODEL_NAME[model]
			+ " · 직업이 덱에 있을 때 시민 승률 변화 (인원별로 따로 측정, n=" + N + "/인원)");
		console.log("직업      | 평균차이 | 인원별 차이");
		const names = Object.keys(per).sort((a, b) => avg(per[b]) - avg(per[a]));
		for (const r of names) {
			const cells = per[r].map(x => x.p + "인" + sgn(x.d).replace("%p", "")).join(" ");
			console.log(roleDef(r).displayName.padEnd(8) + "  | " + sgn(avg(per[r])) + " | " + cells);
		}
	}
}

/* ---------- falseclear: 경찰이 마피아를 "시민"으로 확인해 준 판 ---------- */
function falseclear() {
	console.log("\n### 표준전 · 완전정보 · 경찰 오판 (n=" + N + ")");
	console.log("인원 | 오판 발생률 | 오판 판 시민승률 | 오판 없던 판");
	for (let p = 4; p <= 12; p++) {
		let f = 0, fw = 0, cw = 0;
		for (let s = 0; s < N; s++) {
			const g = playGame(STANDARD_RULES, p, seedOf(p, s), "B");
			const w = g.winner === Team.CITIZEN ? 1 : 0;
			if (g.falseClear) { f++; fw += w; } else cw += w;
		}
		if (f === 0 || f === N) { console.log(String(p).padStart(3) + "인 |       " + pct(f / N) + "% | -"); continue; }
		console.log(String(p).padStart(3) + "인 |      " + pct(f / N) + "% |           "
			+ pct(fw / f) + "% |      " + pct(cw / (N - f)) + "%");
	}
}

/* ---------- police: 위장을 꿰뚫어 본다면 ---------- */
function police() {
	console.log("\n### 표준전 · 완전정보 · 경찰이 위장 직업을 꿰뚫어 본다면 (n=" + N + ")");
	console.log(countHeader(4, 12, 24));
	// ROLE_DEFS를 그 자리에서 바꿔 잰다. 규칙 파일을 고치지 않고 반사실을 보려는 것이라
	// 끝나면 원래 값(undefined)으로 되돌린다
	for (const label of ["현행", "짐승인간만 노출", "짐승인간+사기꾼 노출"]) {
		ROLE_DEFS[Role.BEAST].appearsAsMafia = label !== "현행";
		ROLE_DEFS[Role.CON_ARTIST].appearsAsMafia = label === "짐승인간+사기꾼 노출";
		let line = label.padEnd(24);
		for (let p = 4; p <= 12; p++) line += (pct(winRate(STANDARD_RULES, p, "B")) + "%").padStart(8);
		console.log(line);
	}
	ROLE_DEFS[Role.BEAST].appearsAsMafia = undefined;
	ROLE_DEFS[Role.CON_ARTIST].appearsAsMafia = undefined;
}

/* ---------- variants: 인원표와 연속 손잡이 ---------- */
function variants() {
	const base = STANDARD_RULES;
	const tbl = t => ({ ...base, deck: { ...base.deck, mafiaTeamSize: t } });
	const SETS = [
		["현행", base],
		["표A 1/1/1/1/2/2/2/2/3", tbl([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3])],
		["표B 1/1/1/2/2/2/2/2/3", tbl([0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 3])],
		["첫밤 전원 평화", { ...base, firstNightPeacefulUpTo: 12 }],
		["스파이 제외", {
			...base,
			deck: { ...base.deck, citizenPool: base.deck.citizenPool.filter(r => r !== Role.SPY) },
		}],
	];
	for (const model of ["C", "D", "B"]) {
		console.log("\n### 표준전 시민 승률 · 모델 " + MODEL_NAME[model] + " (n=" + N + ")");
		console.log(countHeader(4, 12, 24));
		rows(SETS, 4, 12, model, 24);
	}
}

/* ---------- mafia42: 마피아42에서 가져올 만한 구조를 반사실로 ---------- */
function mafia42() {
	const base = STANDARD_RULES;
	// 마피아42의 인원별 마피아 수: 4~7인 1명, 8~10인 2명, 11~12인 3명.
	// 우리와 다른 칸은 7인 하나뿐이다
	const tbl = {
		...base,
		deck: { ...base.deck, mafiaTeamSize: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3] },
	};
	const HEAD = [
		["현행", base, undefined],
		["A 인원표 7인 2→1", tbl, undefined],
		["B 찬반 q=0.5 재지목0", base, { confirmVote: 0.5 }],
		["B 찬반 q=0.5 재지목1", base, { confirmVote: 0.5, confirmRetries: 1 }],
		["B 찬반 q=0.0 재지목0", base, { confirmVote: 0 }],
		["B 찬반 q=0.0 재지목1", base, { confirmVote: 0, confirmRetries: 1 }],
	];
	const TAIL = [
		["C 사기꾼 밀담 제외", base, undefined],
		["A+C", tbl, undefined],
		["A+C+B(0.5,재지목1)", tbl, { confirmVote: 0.5, confirmRetries: 1 }],
	];
	for (const model of ["C", "D", "B"]) {
		console.log("\n### 표준전 시민 승률 · 모델 " + MODEL_NAME[model] + " (n=" + N + ")");
		console.log(countHeader(4, 12, 26));
		rows(HEAD, 4, 12, model, 26);
		// C안은 규칙이 아니라 직업 정의를 건드린다. 그 자리에서 바꿔 재고 되돌린다.
		// 사기꾼은 nightAction이 없어서 밀담을 빼도 덱 구성은 그대로다 — 밤 담합과
		// 낮 몰표에서만 빠진다
		ROLE_DEFS[Role.CON_ARTIST].nightChat = null;
		rows(TAIL, 4, 12, model, 26);
		ROLE_DEFS[Role.CON_ARTIST].nightChat = ChatChannel.MAFIA;
	}

	// A안은 7인의 마피아 자리를 하나로 줄인다. 자리가 하나면 mafiaPool을 아예
	// 뽑지 않으므로 그 인원의 위장 직업 구성이 통째로 바뀐다 — 승률만 보면
	// 무엇이 움직였는지 알 수 없어 같이 적는다
	console.log("\n### 위장 직업(짐승인간·사기꾼) 등장률 (n=" + N + ")");
	console.log(countHeader(4, 12, 26));
	for (const [name, rules] of [["현행", base], ["A 인원표 7인 2→1", tbl]]) {
		let line = name.padEnd(26);
		for (let p = 4; p <= 12; p++) {
			let c = 0;
			for (let s = 0; s < N; s++) {
				const d = deckFor(rules, p, seedOf(p, s));
				if (d.indexOf(Role.BEAST) >= 0 || d.indexOf(Role.CON_ARTIST) >= 0) c++;
			}
			line += (pct(c / N) + "%").padStart(8);
		}
		console.log(line);
	}
}

const MODES = { win, disguise, impact, falseclear, police, variants, mafia42 };
const fn = MODES[WHICH];
if (!fn) {
	console.log("모드: " + Object.keys(MODES).join(" | "));
	process.exit(1);
}
fn();
