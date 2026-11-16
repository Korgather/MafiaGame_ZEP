/** 첫 판 안내 줄 · 낮 여론조사 · 직업별 전적 · FTUE 지표 (UI 리뉴얼 D단계) */
import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import type { ScriptPlayer } from "zep-script";
import { STANDARD_RULES } from "../src/domain/RuleSet.ts";
import type { RuleSet } from "../src/domain/RuleSet.ts";
import { topRoles } from "../src/domain/Progression.ts";
import { suspicionTally } from "../src/domain/Vote.ts";
import { read } from "../src/infrastructure/PlayerStorage.ts";
import { finish } from "../src/services/Outcome.ts";
import { GamePhase, Role, Team } from "../src/types/Game.types.ts";
import type { Room } from "../src/types/Game.types.ts";
import {
	chatWidget,
	clickUnit,
	connect,
	disconnect,
	finishPhase,
	hudWidget,
	joinRoom,
	mainWidget,
	playerOf,
	profileShown,
	resetWorld,
	room,
	seatOf,
	seatsWithRole,
	send,
	sendChat,
	setReady,
	startGame,
	tick,
	vote,
	world,
} from "./helpers/Harness.ts";
import { seat } from "./helpers/seat.ts";

const ROLES = [Role.MAFIA, Role.DOCTOR, Role.POLICE, Role.CITIZEN];

function ftue(event: string): Array<Record<string, unknown>> {
	return world.httpPosts
		.map(post => post.body as Record<string, unknown>)
		.filter(body => body.collection === "FTUE" && body.event === event);
}

/** 직업을 고정한 4인 판을 첫 낮까지 넘긴다 */
function toFirstDay(): { players: ReturnType<typeof startGame>; target: Room } {
	const players = startGame(4, 1, ROLES);
	const target = room(1);
	finishPhase(target); // NIGHT
	finishPhase(target); // DAY
	assert.equal(target.phase, GamePhase.DAY);
	return { players, target };
}

beforeEach(() => resetWorld());

describe("여론조사 집계", () => {
	it("산 사람이 산 사람을 찍은 것만 센다", () => {
		const seats = [1, 2, 3, 4].map(n => seat(n, Role.CITIZEN));
		seats[0].suspect = 2;
		seats[1].suspect = 3;
		seats[2].suspect = 2;
		seats[3].suspect = 2;
		seats[3].alive = false; // 죽은 사람의 표시는 빠진다
		assert.deepEqual(suspicionTally(seats), { 2: 2, 3: 1 });
		seats[1].alive = false; // 죽은 사람에게 몰린 표시도 빠진다
		assert.deepEqual(suspicionTally(seats), {});
	});
});

describe("직업별 전적", () => {
	it("판 수, 승수, 이름 순으로 상위 n개", () => {
		const rows = topRoles(
			{ A: { games: 2, wins: 0 }, B: { games: 5, wins: 1 }, C: { games: 2, wins: 2 }, D: { games: 1, wins: 1 } },
			3
		);
		assert.deepEqual(
			rows.map(row => row.role),
			["B", "C", "A"]
		);
	});

	it("저장소의 깨진 줄은 버린다", () => {
		const player = connect("가", {
			storage: JSON.stringify({ roles: { DOCTOR: { games: 3, wins: 1 }, MAFIA: { games: "x" }, POLICE: null } }),
		});
		assert.deepEqual(read(player as unknown as ScriptPlayer).roles, { DOCTOR: { games: 3, wins: 1 } });
	});

	it("판이 끝나면 직업별로 쌓이고 프로필에 붙는다", () => {
		startGame(4, 1, ROLES);
		const target = room(1);
		const doctor = playerOf(seatsWithRole(target, Role.DOCTOR)[0]);
		const mafia = playerOf(seatsWithRole(target, Role.MAFIA)[0]);
		finish(target, Team.CITIZEN);

		assert.deepEqual(JSON.parse(doctor.storage || "{}").roles, { DOCTOR: { games: 1, wins: 1 } });
		assert.deepEqual(JSON.parse(mafia.storage || "{}").roles, { MAFIA: { games: 1, wins: 0 } });
	});

	it("프로필에는 많이 한 직업 셋이 붙는다", () => {
		const roles = { DOCTOR: { games: 9, wins: 5 }, MAFIA: { games: 4, wins: 3 }, POLICE: { games: 1, wins: 0 }, CITIZEN: { games: 4, wins: 2 } };
		const me = connect("가", { storage: JSON.stringify({ playCount: 18, roles }) });
		clickUnit(me, me);
		const rows = profileShown(me).stats.filter(row => row.label.indexOf("직업 · ") === 0);
		assert.deepEqual(
			rows.map(row => `${row.label} ${row.value}`),
			["직업 · 의사 9판 5승", "직업 · 마피아 4판 3승", "직업 · 시민 4판 2승"]
		);
	});
});

describe("낮 여론조사", () => {
	it("찍기·바꾸기·취소가 모두에게 집계로 간다", () => {
		const { players, target } = toFirstDay();
		const [me, other] = players;
		const a = seatOf(players[2]).index;
		const b = seatOf(players[3]).index;

		send(me, { type: "suspect", num: a });
		send(other, { type: "suspect", num: a });
		assert.deepEqual(mainWidget(other).lastOfType("poll")?.tally, { [a]: 2 });

		tick(1); // 연타 제한
		send(me, { type: "suspect", num: b });
		assert.deepEqual(mainWidget(other).lastOfType("poll")?.tally, { [a]: 1, [b]: 1 });
		assert.equal(mainWidget(me).lastOfType("poll")?.suspect, b);

		tick(1);
		send(me, { type: "suspect", num: b }); // 같은 사람을 다시 누르면 취소
		assert.equal(seatOf(me).suspect, 0);
		assert.equal(target.phase, GamePhase.DAY);
	});

	it("자기 자신·유령·꺼진 규칙은 무시한다", () => {
		const { players, target } = toFirstDay();
		const [me, other] = players;

		send(me, { type: "suspect", num: seatOf(me).index });
		assert.equal(seatOf(me).suspect, 0, "자기 자신을 찍었습니다");

		seatOf(other).alive = false;
		send(me, { type: "suspect", num: seatOf(other).index });
		assert.equal(seatOf(me).suspect, 0, "죽은 사람을 찍었습니다");
		send(other, { type: "suspect", num: seatOf(me).index });
		assert.equal(seatOf(other).suspect, 0, "유령이 찍었습니다");
		seatOf(other).alive = true;

		// 방은 resetWorld를 건너 남으므로 끈 규칙을 되돌려 둔다
		const rules = target.ruleSet;
		(target as { ruleSet: RuleSet }).ruleSet = { ...rules, dayPoll: false };
		try {
			send(me, { type: "suspect", num: seatOf(other).index });
			assert.equal(seatOf(me).suspect, 0, "꺼진 여론조사가 받았습니다");
		} finally {
			(target as { ruleSet: RuleSet }).ruleSet = rules;
		}
	});

	it("다음 날 아침에 비워진다", () => {
		const { players, target } = toFirstDay();
		send(players[0], { type: "suspect", num: seatOf(players[1]).index });
		finishPhase(target); // VOTE
		finishPhase(target); // VOTE_RESULT
		finishPhase(target); // NIGHT
		finishPhase(target); // DAY
		assert.equal(target.phase, GamePhase.DAY);
		assert.equal(seatOf(players[0]).suspect, 0);
		assert.deepEqual(mainWidget(players[0]).lastOfType("init")?.poll, { tally: {}, suspect: 0, canSuspect: true });
	});
});

describe("첫 판 안내 줄", () => {
	it("첫 판에만 지금 할 일을 준다", () => {
		const { players } = toFirstDay();
		assert.equal(hudWidget(players[0]).lastOfType("init")?.coach, "의심 가는 사람의 번호를 채팅에서 눌러 메모하세요");
	});

	it("데스크톱은 안내 줄 몫만큼 HUD를 키운다", () => {
		const { players } = toFirstDay();
		const layout = hudWidget(players[0]).lastOfType("init")?.layout as { height: string };
		assert.equal(layout.height, "68px");
	});

	it("전적이 있으면 비운다", () => {
		const players = [];
		for (let i = 0; i < 4; i++) {
			const player = connect(`경험자${i}`, { storage: JSON.stringify({ playCount: 3 }) });
			joinRoom(player, 1);
			setReady(player);
			players.push(player);
		}
		tick(STANDARD_RULES.timing.START_COUNTDOWN + 0.1);
		assert.equal(room(1).phase, GamePhase.ROLE_REVEAL);
		assert.equal(hudWidget(players[0]).lastOfType("init")?.coach, "");
		const layout = hudWidget(players[0]).lastOfType("init")?.layout as { height: string };
		assert.equal(layout.height, "48px");
	});
});

describe("FTUE 지표", () => {
	it("메모 사용은 판당 한 번만 보낸다", () => {
		const { players } = toFirstDay();
		// 메모는 채팅이 적는다. 보드는 읽기만 하므로 보드로 온 것은 세지 않는다
		send(players[0], { type: "memo-used" });
		assert.equal(ftue("memo_used").length, 0);
		sendChat(players[0], { type: "memo-used" });
		sendChat(players[0], { type: "memo-used" });
		assert.equal(ftue("memo_used").length, 1);
	});

	it("판이 돌면 채팅이 메모 로스터(번호·생사·내 번호)를 받는다", () => {
		const { players } = toFirstDay();
		const msg = (chatWidget(players[0]).messages as Record<string, unknown>[])
			.filter(m => m.type === "init" || m.type === "channels")
			.pop();
		const seats = msg?.seats as { num: number; alive: boolean }[];
		assert.equal(seats.length, players.length);
		assert.equal(msg?.myNum, seatOf(players[0]).index);
	});

	it("첫 투표는 걸린 초를, 이탈은 지목 바꾼 횟수를 싣는다", () => {
		const { players, target } = toFirstDay();
		tick(5);
		finishPhase(target); // VOTE
		const me = players[0];
		vote(me, seatOf(players[1]).index);
		vote(me, seatOf(players[2]).index);
		const first = ftue("first_vote_completed").find(body => typeof body.sec === "number");
		assert.ok(first && (first.sec as number) > 0, "첫 투표에 걸린 초가 없습니다");

		disconnect(me);
		const dropout = ftue("first_game_dropout");
		assert.equal(dropout.length, 1);
		assert.equal(dropout[0].changes, 1);
	});
});
