/**
 * 판 기록(Room.timeline) — 재접속 요약·유령/관전 보드·종료 화면 다시보기가 함께 읽는다.
 *
 * 세 화면이 같은 배열을 그대로 내보내므로, 여기에 비공개 정보가 한 줄이라도
 * 섞이면 세 군데로 동시에 샌다. 그래서 "공개 채널에 실제로 뜬 줄만 있다"를 지킨다.
 */
import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { GamePhase, Role, Team } from "../src/types/Game.types.ts";
import { STANDARD_RULES } from "../src/domain/RuleSet.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { finish } from "../src/services/Outcome.ts";
import {
	chat,
	chatLines,
	disconnect,
	finishPhase,
	mainWidget,
	passPeacefulFirstNight,
	playerOf,
	reconnect,
	resetWorld,
	room,
	seatsWithRole,
	send,
	setReady,
	startGame,
	tick,
} from "./helpers/Harness.ts";

beforeEach(() => resetWorld());

/** 둘째 밤까지 넘긴 5인 판. 첫 밤은 무사하다(firstNightPeacefulUpTo) */
function secondNight() {
	const players = startGame(5, 1, [Role.MAFIA, Role.POLICE, Role.DOCTOR, Role.CITIZEN, Role.CITIZEN]);
	const target = room(1);
	finishPhase(target); // ROLE_REVEAL → NIGHT
	passPeacefulFirstNight(target);
	const citizens = seatsWithRole(target, Role.CITIZEN);
	return {
		players,
		target,
		mafia: seatsWithRole(target, Role.MAFIA)[0],
		police: seatsWithRole(target, Role.POLICE)[0],
		doctor: seatsWithRole(target, Role.DOCTOR)[0],
		victim: citizens[0],
		bystander: citizens[1],
	};
}

describe("판 기록", () => {
	it("공개 채널에 뜬 사건만 담고 밀담·조사 결과는 담지 않는다", () => {
		const { target, mafia, police, doctor, victim, bystander } = secondNight();

		chat(playerOf(mafia), "오늘은 5번부터", ChatChannel.MAFIA);
		send(playerOf(mafia), { type: "select", num: victim.index });
		send(playerOf(police), { type: "select", num: mafia.index });
		send(playerOf(doctor), { type: "select", num: bystander.index });
		finishPhase(target); // NIGHT → DAY

		assert.ok(target.timeline.length > 0, "밤 정산이 기록되지 않았습니다");
		assert.ok(
			target.timeline.some(entry => entry.when === "2일차 밤"),
			"밤 정산이 그 밤의 묶음으로 기록되지 않았습니다"
		);

		// 시민이 방 채널에서 실제로 본 줄과 하나하나 맞아야 한다. 그 밖의 줄은 비공개다
		const seen = chatLines(playerOf(bystander), ChatChannel.ROOM).map(line => line.text);
		for (const entry of target.timeline) {
			assert.ok(seen.indexOf(entry.text) >= 0, `공개되지 않은 줄이 기록됐습니다: ${entry.text}`);
		}
		// 비교할 비밀이 실제로 생겼는지부터 본다. 없으면 아래 단언은 빈 목록을 상대로 통과한다
		assert.ok(chatLines(playerOf(mafia), ChatChannel.MAFIA).some(line => line.text === "오늘은 5번부터"));
		const all = JSON.stringify(target.timeline);
		assert.doesNotMatch(all, /오늘은 5번부터/, "마피아 밀담이 판 기록에 들어갔습니다");
		const policePrivate = chatLines(playerOf(police)).filter(line => line.to === playerOf(police).id);
		assert.ok(policePrivate.length > 0, "경찰의 개인 결과가 오지 않았습니다");
		for (const line of policePrivate) {
			assert.equal(all.indexOf(line.text), -1, `경찰 개인 결과가 판 기록에 들어갔습니다: ${line.text}`);
		}
	});

	it("산 사람의 보드에는 비어 있고 유령의 보드에는 실린다", () => {
		const { target, mafia, victim, bystander } = secondNight();
		send(playerOf(mafia), { type: "select", num: victim.index });
		finishPhase(target); // NIGHT → DAY

		assert.equal(victim.alive, false);
		const ghost = mainWidget(playerOf(victim)).lastOfType("init");
		const alive = mainWidget(playerOf(bystander)).lastOfType("init");
		assert.ok(ghost && alive);
		assert.deepEqual(alive.timeline, [], "산 사람에게 판 기록이 갔습니다");
		assert.deepEqual(ghost.timeline, target.timeline);
	});

	it("재접속하면 놓친 사건을 한 장으로 받는다", () => {
		const { target, bystander } = secondNight();
		const away = playerOf(bystander);

		disconnect(away);
		reconnect(away);

		const card = chatLines(away).filter(line => line.text === "🔁 놓친 사건");
		assert.equal(card.length, 1, "놓친 사건 카드가 오지 않았습니다");
		assert.equal(card[0].to, away.id, "놓친 사건 카드가 본인에게만 가지 않았습니다");
		assert.deepEqual(
			(card[0].rows || []).map(row => row.label),
			target.timeline.map(entry => entry.text)
		);
	});

	it("종료 화면에 실리고, 다음 판에서는 처음부터 다시 쌓인다", () => {
		const { players, target } = secondNight();
		const before = target.timeline.length;
		assert.ok(before > 0);

		finish(target, Team.CITIZEN);
		const over = mainWidget(players[0]).lastOfType("init");
		assert.ok(over);
		assert.deepEqual(over.timeline, target.timeline, "종료 화면에 판 기록이 실리지 않았습니다");

		for (const player of players) send(player, { type: "again" });
		finishPhase(target); // GAME_OVER → LOBBY
		assert.equal(target.timeline.length, 0, "지난 판의 기록이 남았습니다");

		for (const player of players) setReady(player);
		tick(STANDARD_RULES.timing.START_COUNTDOWN + 0.1);
		assert.equal(target.phase, GamePhase.ROLE_REVEAL);
		finishPhase(target); // → NIGHT
		finishPhase(target); // 첫 밤 정산 → DAY
		assert.ok(target.timeline.length > 0);
		assert.ok(
			target.timeline.every(entry => entry.when.indexOf("1일차") === 0),
			"새 판 기록에 지난 판의 날이 섞였습니다"
		);
	});
});
