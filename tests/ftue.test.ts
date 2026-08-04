import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import type { ScriptPlayer } from "zep-script";
import { STANDARD_RULES } from "../src/domain/RuleSet.ts";
import { GamePhase, Role, Team } from "../src/types/Game.types.ts";
import { finish } from "../src/services/Outcome.ts";
import { FtueEvent, trackBeforeFirstGame } from "../src/services/FtueAnalytics.ts";
import {
	connect,
	finishPhase,
	joinRoom,
	playerOf,
	resetWorld,
	room,
	seatsWithRole,
	send,
	sendCard,
	setReady,
	startGame,
	tick,
	vote,
	world,
} from "./helpers/Harness.ts";

interface FtueBody {
	category: string;
	channelId: string;
	collection: string;
	event: string;
	eventId: string;
	key: string;
	schemaVersion: number;
	spaceHashID: string;
}

function ftueBodies(): FtueBody[] {
	return world.httpPosts
		.map(post => post.body as Partial<FtueBody>)
		.filter(body => body.collection === "FTUE") as FtueBody[];
}

function count(event: string): number {
	return ftueBodies().filter(body => body.event === event).length;
}

beforeEach(() => resetWorld());

describe("FTUE 퍼널", () => {
	it("안내 열람과 완료를 구분하고 익명 allowlist payload만 한 번씩 보낸다", () => {
		const player = connect("첫사용자");
		joinRoom(player, 1);
		assert.equal(count("room_joined"), 1);
		assert.equal(count("guide_opened"), 1);

		sendCard(player, { type: "close", completed: true });
		assert.equal(count("guide_completed"), 1);
		send(player, { type: "guide" });
		sendCard(player, { type: "close", completed: true });
		assert.equal(count("guide_opened"), 1);
		assert.equal(count("guide_completed"), 1);

		const body = ftueBodies()[0];
		assert.deepEqual(Object.keys(body).sort(), [
			"category",
			"channelId",
			"collection",
			"event",
			"eventId",
			"key",
			"schemaVersion",
			"spaceHashID",
		]);
		assert.doesNotMatch(JSON.stringify(body), /첫사용자|p1|player|role|target|chat/i);
	});

	it("HTTP 요청 시작이 거절되면 이벤트를 보낸 것으로 확정하지 않는다", () => {
		const player = connect("재시도사용자");
		world.httpPostAccepted = false;
		trackBeforeFirstGame(player as unknown as ScriptPlayer, FtueEvent.ROOM_JOINED);
		assert.equal(count("room_joined"), 0);

		world.httpPostAccepted = true;
		trackBeforeFirstGame(player as unknown as ScriptPlayer, FtueEvent.ROOM_JOINED);
		assert.equal(count("room_joined"), 1, "거절된 요청이 영구 중복 처리되어 재시도되지 않았습니다");
	});

	it("첫 행동부터 다음 판 시작까지 각 단계가 한 번씩 기록된다", () => {
		const players = startGame(4, 1, [Role.MAFIA, Role.DOCTOR, Role.POLICE, Role.CITIZEN]);
		const target = room(1);
		assert.equal(count("first_game_started"), 4);

		finishPhase(target); // NIGHT
		const doctor = seatsWithRole(target, Role.DOCTOR)[0];
		const citizen = seatsWithRole(target, Role.CITIZEN)[0];
		send(playerOf(doctor), { type: "select", num: citizen.index });
		assert.equal(count("first_night_action_completed"), 1);

		finishPhase(target); // DAY
		finishPhase(target); // VOTE
		vote(playerOf(doctor), citizen.index);
		assert.equal(count("first_vote_completed"), 1);

		finish(target, Team.CITIZEN);
		assert.equal(count("first_game_finished"), 4);
		send(playerOf(doctor), { type: "again" });
		send(playerOf(doctor), { type: "again" });
		assert.equal(count("rematch_selected"), 1);

		for (const player of players) send(player, { type: "again" });
		finishPhase(target); // GAME_OVER -> LOBBY
		for (const player of players) setReady(player);
		tick(STANDARD_RULES.timing.START_COUNTDOWN + 0.1);
		assert.equal(target.phase, GamePhase.ROLE_REVEAL);
		assert.equal(count("second_game_started"), 4);
	});

	it("게스트는 참가 퍼널을 시작하지 않고 관전만 한다", () => {
		startGame(4);
		world.httpPosts.length = 0;
		const seatCount = room(1).seats.length;
		const guest = connect("게스트", { isGuest: true });
		joinRoom(guest, 1);
		setReady(guest);
		tick(STANDARD_RULES.timing.START_COUNTDOWN + 0.1);
		assert.equal(room(1).seats.length, seatCount);
		assert.equal(room(1).spectators.length, 1);
		assert.equal(ftueBodies().length, 0, "참가할 수 없는 게스트가 참가 퍼널에 섞였습니다");
	});

	it("기존 전적 사용자는 게임을 시작해도 신규 퍼널에 들어가지 않는다", () => {
		const players = [];
		for (let i = 0; i < 4; i++) {
			const player = connect(`경험자${i}`, {
				storage: JSON.stringify({ exp: 10, citizenWin: 1 }),
			});
			joinRoom(player, 1);
			setReady(player);
			players.push(player);
		}
		tick(STANDARD_RULES.timing.START_COUNTDOWN + 0.1);
		assert.equal(room(1).phase, GamePhase.ROLE_REVEAL);
		assert.equal(ftueBodies().length, 0);
	});
});
