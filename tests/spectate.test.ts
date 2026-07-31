/**
 * 관전 — 게임 중인 방에 난입한 사람.
 *
 * 이 기능의 위험은 화면이 아니라 **정보**에 있다. 관전자는 판 밖의 사람이라
 * 유령 채널(누가 마피아였는지가 그대로 오간다)과 마피아 밀담에 닿으면 안
 * 되고, 좌석 수·승패 판정·개표 어디에도 잡혀서는 안 된다. 좌석과 같은
 * Seat 타입을 쓰되 다른 배열에 담는 설계라서 "관전자를 무시하는 코드"가
 * 한 줄도 없는데, 뒤집어 말하면 어느 코드가 실수로 room.spectators까지
 * 돌기 시작하면 아무도 모르게 샌다. 그 경계를 여기서 못 박는다.
 */
import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { GamePhase, Role, Team } from "../src/types/Game.types.ts";
import { WidgetFile } from "../src/constants/Assets.ts";
import { MAX_SPECTATORS, MIN_PLAYERS } from "../src/constants/GameConfig.ts";
import { BLITZ_RULES, SILENCE_RULES, STANDARD_RULES } from "../src/domain/RuleSet.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { finish } from "../src/services/Outcome.ts";
import type { FakePlayer } from "./helpers/FakeZep.ts";
import {
	castRoles,
	chat,
	chatChannels,
	chatSaw,
	connect,
	disconnect,
	findMainWidget,
	findSeatOf,
	finishPhase,
	joinRoom,
	mainWidget,
	playerOf,
	resetWorld,
	room,
	seatsWithRole,
	send,
	startPlainGame,
} from "./helpers/Harness.ts";

beforeEach(() => resetWorld());

/** 진행 중인 1번 방과 그 방을 지켜보는 사람 하나 */
function gameWithWatcher(playerCount = MIN_PLAYERS): {
	players: FakePlayer[];
	watcher: FakePlayer;
} {
	const players = startPlainGame(playerCount);
	const watcher = connect("난입한사람");
	joinRoom(watcher, 1);
	return { players, watcher };
}

describe("게임 중 난입", () => {
	it("진행 중인 방을 누르면 좌석 대신 관전석을 받는다", () => {
		const { watcher } = gameWithWatcher();

		assert.equal(findSeatOf(watcher), undefined, "관전자에게 좌석이 생겼습니다");
		assert.equal(room(1).spectators.length, 1);
		assert.equal(mainWidget(watcher).fileName, WidgetFile.PHASE);
	});

	it("좌석 수와 총원에 잡히지 않는다", () => {
		const { watcher } = gameWithWatcher();

		// 이 두 값이 흔들리면 승패 판정과 개표가 통째로 어긋난다
		assert.equal(room(1).seats.length, MIN_PLAYERS);
		assert.equal(room(1).total, MIN_PLAYERS);
		assert.equal(mainWidget(watcher).lastOfType("init")?.total, MIN_PLAYERS);
	});

	it("관전 화면에만 관전 종료 버튼이 뜬다", () => {
		const { players, watcher } = gameWithWatcher();

		assert.equal(mainWidget(watcher).lastOfType("init")?.spectating, true);
		// 같은 위젯을 쓰는 참가자에게는 이탈 버튼이 없어야 한다.
		// 밤에 지목할 것이 없어야 진행 화면(phase)을 받으므로 군인을 앉힌다 —
		// 시민이 익명 쪽지를 갖게 되면서 plainDeck의 나머지 좌석이 전부
		// 지목 격자(roleAction)를 받게 됐다
		castRoles(room(1), [Role.MAFIA, Role.DOCTOR, Role.POLICE, Role.SOLDIER]);
		finishPhase(room(1)); // ROLE_REVEAL → NIGHT
		const plain = players.find(player => findSeatOf(player)?.role === Role.SOLDIER);
		assert.ok(plain, "밤에 지목할 것이 없는 좌석이 없습니다");
		assert.equal(mainWidget(plain).lastOfType("init")?.spectating, false);
	});

	it("관전 인원이 차면 더 받지 않는다", () => {
		startPlainGame(MIN_PLAYERS);
		for (let i = 0; i < MAX_SPECTATORS; i++) {
			joinRoom(connect(`관전${i}`), 1);
		}

		const late = connect("늦은사람");
		joinRoom(late, 1);

		assert.equal(room(1).spectators.length, MAX_SPECTATORS);
		// 거절당한 사람은 방 선택 화면에 그대로 남는다
		assert.equal(mainWidget(late).fileName, WidgetFile.LOBBY);
	});
});

describe("관전자의 채팅", () => {
	it("마피아 밀담과 유령 채널은 탭 자체가 없다", () => {
		const { watcher } = gameWithWatcher();

		const tabs = chatChannels(watcher).map(view => view.id);
		assert.ok(tabs.indexOf(ChatChannel.MAFIA) < 0, "관전자에게 마피아 탭이 보입니다");
		assert.ok(tabs.indexOf(ChatChannel.GHOST) < 0, "관전자에게 유령 탭이 보입니다");
	});

	it("밤 밀담이 관전자 화면에 도착하지 않는다", () => {
		const { watcher } = gameWithWatcher();
		finishPhase(room(1)); // → NIGHT
		const mafia = playerOf(seatsWithRole(room(1), Role.MAFIA)[0]);

		chat(mafia, "3번 치자", ChatChannel.MAFIA);

		assert.equal(chatSaw(watcher, "3번 치자"), false, "밀담이 관전자에게 샜습니다");
	});

	it("낮 토론은 읽되 쓸 수는 없다", () => {
		const { players, watcher } = gameWithWatcher();
		finishPhase(room(1)); // → NIGHT
		finishPhase(room(1)); // → DAY
		const talker = players.find(player => findSeatOf(player)?.alive);
		assert.ok(talker, "살아 있는 좌석이 없습니다");

		chat(talker, "누가 수상해?", ChatChannel.ROOM);
		chat(watcher, "3번이 마피아야", ChatChannel.ROOM);

		assert.equal(chatSaw(watcher, "누가 수상해?"), true, "관전자가 낮 토론을 못 읽습니다");
		assert.equal(chatSaw(talker, "3번이 마피아야"), false, "관전자의 말이 판에 들어갔습니다");
	});

	it("잠긴 이유를 죽은 사람과 다르게 알려준다", () => {
		const { watcher } = gameWithWatcher();
		finishPhase(room(1)); // → NIGHT
		finishPhase(room(1)); // → DAY

		const roomTab = chatChannels(watcher).find(view => view.id === ChatChannel.ROOM);
		assert.ok(roomTab, "관전자에게 방 탭이 없습니다");
		assert.equal(roomTab.write, false);
		// "죽은 사람은…"은 참가한 적 없는 사람에게 거짓말이다
		assert.ok(roomTab.placeholder.indexOf("관전") >= 0, roomTab.placeholder);
	});
});

describe("관전 화면", () => {
	it("단계가 바뀌면 다시 그려진다", () => {
		const { watcher } = gameWithWatcher();
		const widget = mainWidget(watcher);
		const before = widget.messages.length;

		finishPhase(room(1)); // → NIGHT

		assert.ok(widget.messages.length > before, "단계가 바뀌었는데 관전 화면이 그대로입니다");
		assert.equal(widget.lastOfType("init")?.phase, "night");
		// 위젯을 갈아끼우지 않는다. 갈아끼우면 관전 종료 버튼이 깜빡인다
		assert.equal(mainWidget(watcher), widget);
	});

	it("밤 사망자를 함께 본다", () => {
		const { watcher } = gameWithWatcher();
		finishPhase(room(1)); // → NIGHT
		finishPhase(room(1)); // → DAY

		const view = mainWidget(watcher).lastOfType("init");
		assert.deepEqual(view?.deaths, room(1).nightReport);
	});
});

describe("관전 종료", () => {
	it("버튼을 누르면 방 선택 화면으로 돌아간다", () => {
		const { watcher } = gameWithWatcher();

		send(watcher, { type: "spectate-quit" });

		assert.equal(room(1).spectators.length, 0);
		assert.equal(mainWidget(watcher).fileName, WidgetFile.LOBBY);
		const tabs = chatChannels(watcher).map(view => view.id);
		assert.ok(tabs.indexOf(ChatChannel.ROOM) < 0, "나갔는데 방 탭이 남았습니다");
	});

	it("접속이 끊기면 관전석이 사라진다", () => {
		const { watcher } = gameWithWatcher();

		disconnect(watcher);

		// 좌석과 달리 남겨둘 것이 없다 — 직업도 목숨도 표도 없다
		assert.equal(room(1).spectators.length, 0);
	});
});

describe("판이 끝난 뒤", () => {
	it("기다린 관전자가 좌석에 앉는다", () => {
		const { watcher } = gameWithWatcher();
		finish(room(1), Team.MAFIA);

		finishPhase(room(1)); // GAME_OVER → 대기실 복귀

		assert.equal(room(1).spectators.length, 0);
		assert.ok(findSeatOf(watcher), "관전자가 좌석을 받지 못했습니다");
		assert.equal(room(1).phase, GamePhase.LOBBY);
		assert.equal(mainWidget(watcher).fileName, WidgetFile.LOBBY);
	});

	/*
	 * 예전 이 자리의 테스트는 "자리가 모자라 못 앉는 사람"을 봤다. 관전 정원과
	 * 좌석 정원이 둘 다 8이던 시절에는 기다린 사람이 좌석보다 많을 수 있었다.
	 * 좌석이 12로 늘어난 지금은 관전 정원(8)이 먼저 막혀서 그 상황이 만들어지지
	 * 않는다 — 그건 두 상수의 관계에서 나오는 성질이므로 관계를 먼저 못 박는다.
	 * 관계가 뒤집히면 이 assert가 "못 앉는 경로에 테스트가 없다"고 알려준다.
	 *
	 * 비교 대상은 전역 MAX_PLAYERS가 아니라 **가장 작은 방의 정원**이다.
	 * seatSpectators가 실제로 보는 것은 room.ruleSet.maxPlayers이고, 그 값이
	 * 가장 작은 모드(속도전 8)에서 먼저 자리가 모자란다. 12와 비교하면
	 * 속도전 방에서 못 앉는 사람이 생겨도 이 테스트는 초록으로 지나간다 —
	 * Lobby.seatSpectators의 주석이 "관계는 여기가 지킨다"고 가리키는 관계가
	 * 바로 이것이라, 가리키는 곳에 그 관계가 실제로 있어야 한다.
	 */
	it("관전 정원을 다 채워도 기다린 전원이 좌석에 앉는다", () => {
		const smallestRoom = Math.min(
			STANDARD_RULES.maxPlayers,
			BLITZ_RULES.maxPlayers,
			SILENCE_RULES.maxPlayers,
		);
		assert.ok(
			MAX_SPECTATORS <= smallestRoom,
			"관전 정원이 가장 작은 방의 좌석보다 많습니다 — 못 앉는 사람이 생기는 경로에 테스트가 필요합니다",
		);
		startPlainGame(MIN_PLAYERS);
		const watchers: FakePlayer[] = [];
		for (let i = 0; i < MAX_SPECTATORS; i++) {
			const watcher = connect(`관전${i}`);
			joinRoom(watcher, 1);
			watchers.push(watcher);
		}
		finish(room(1), Team.MAFIA);

		finishPhase(room(1));

		// 판을 뛴 사람은 좌석에서 비워지고, 기다린 사람만 남는다
		assert.equal(room(1).spectators.length, 0);
		assert.equal(room(1).seats.length, MAX_SPECTATORS);
		for (let i = 0; i < watchers.length; i++) {
			assert.ok(findSeatOf(watchers[i]), `관전${i}이 좌석을 받지 못했습니다`);
			// 좌석을 받았어도 화면이 끝난 판에 멈춰 있으면 안 된다
			assert.equal(findMainWidget(watchers[i])?.fileName, WidgetFile.LOBBY);
		}
	});
});
