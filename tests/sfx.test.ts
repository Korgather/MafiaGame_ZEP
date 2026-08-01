/*
 * 효과음 배선 — 어느 순간에 누가 듣는가.
 *
 * 파일이 res에 있는지는 assets.test.ts가 본다. 여기서 지키는 것은 그다음
 * 문장이다. 소리는 틀려도 예외가 나지 않고 화면에도 흔적을 남기지 않아서,
 * 한 줄을 옮기면 아무 신호 없이 사라지거나 들으면 안 되는 사람에게 간다.
 *
 * 실제로 이 파일이 생기기 전까지 소리를 확인하는 문장은 하나도 없었고,
 * 그 공백에서 FakeZep의 playSound가 인자 3개까지만 받도록 잘못 적혀 있던
 * 것도 오래 살아남았다(실제 API는 volume까지 다섯이다).
 *
 * 밤 능력의 소리는 특히 정보다. 시전자에게만 가야 할 소리가 방으로 새면
 * 그 순간 누가 무엇을 했는지가 드러난다 — 코드로는 playSound 한 글자
 * 차이라서 눈으로는 잘 걸리지 않는다.
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { Judgement, Role } from "../src/types/Game.types.ts";
import { Sound } from "../src/constants/Assets.ts";
import type { FakePlayer } from "./helpers/Harness.ts";
import {
	connect,
	finishPhase,
	joinRoom,
	passPeacefulFirstNight,
	passTrial,
	playerOf,
	resetWorld,
	room,
	seatsWithRole,
	send,
	startGame,
	vote,
} from "./helpers/Harness.ts";

beforeEach(() => resetWorld());

/**
 * 밤 능력이 전부 등장하는 덱. 무작위 덱을 쓰면 점쟁이가 안 뽑힌 판에서
 * 「경찰과 점쟁이가 다르다」가 검사할 대상 없이 통과한다.
 */
const DECK = [Role.MAFIA, Role.DOCTOR, Role.POLICE, Role.SEER, Role.MADAM, Role.CITIZEN];

function silence(players: readonly FakePlayer[]): void {
	for (const player of players) player.clearLog();
}

/** 이 사람이 그 소리를 들었는가 */
function heard(player: FakePlayer, sound: string): boolean {
	return player.sounds.indexOf(sound) >= 0;
}

/** 그 소리를 들은 사람 수 */
function listeners(players: readonly FakePlayer[], sound: string): number {
	let count = 0;
	for (const player of players) {
		if (heard(player, sound)) count++;
	}
	return count;
}

describe("효과음 배선", () => {
	it("입장음은 들어온 사람에게만 난다", () => {
		const first = connect("먼저");
		joinRoom(first, 1);
		const second = connect("나중");
		silence([first, second]);
		joinRoom(second, 1);

		assert.equal(heard(second, Sound.JOIN), true);
		// 이미 앉아 있던 사람에게는 나지 않는다. 방 전체로 내보내면 대기실이
		// 찰수록 입장음이 겹쳐 울린다
		assert.equal(heard(first, Sound.JOIN), false);
	});

	it("밤 능력의 소리는 시전자만 듣는다", () => {
		const players = startGame(6, 1, DECK);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		silence(players);

		const doctor = playerOf(seatsWithRole(target, Role.DOCTOR)[0]);
		send(doctor, { type: "select", num: seatsWithRole(target, Role.CITIZEN)[0].index });

		assert.equal(heard(doctor, Sound.HEAL), true);
		assert.equal(listeners(players, Sound.HEAL), 1);
	});

	/**
	 * 답이 아침으로 밀린 뒤로 지목 순간의 소리가 "내가 무엇을 물었는가"를
	 * 기억할 유일한 단서다. 둘이 같은 파일을 쓰던 시절에는 경찰과 점쟁이를
	 * 겸할 수 없어 문제가 드러나지 않았지만, 한 판에 둘 다 앉는 지금은
	 * 다음 날 아침에 도착한 답이 어느 질문의 답인지 소리로 이어지지 않는다.
	 */
	it("경찰과 점쟁이는 서로 다른 조사음을 듣는다", () => {
		const players = startGame(6, 1, DECK);
		const target = room(1);
		finishPhase(target);
		silence(players);

		const victim = seatsWithRole(target, Role.CITIZEN)[0];
		const police = playerOf(seatsWithRole(target, Role.POLICE)[0]);
		const seer = playerOf(seatsWithRole(target, Role.SEER)[0]);
		send(police, { type: "select", num: victim.index });
		send(seer, { type: "select", num: victim.index });

		assert.equal(heard(police, Sound.INVESTIGATE), true);
		assert.equal(heard(seer, Sound.INSPECT), true);
		assert.notEqual(Sound.INVESTIGATE, Sound.INSPECT);
		assert.equal(heard(police, Sound.INSPECT), false);
		assert.equal(heard(seer, Sound.INVESTIGATE), false);
	});

	/**
	 * 차단은 아침에 채팅 한 줄로만 왔다. 토론이 시작되면 밀려 올라가고,
	 * 놓치면 자기 능력이 대상에 닿았다고 믿은 채 하루를 보낸다.
	 * 막은 쪽(마담)에게는 붙이지 않는다 — 자기가 무엇을 했는지 이미 안다.
	 */
	it("차단음은 막힌 사람에게만 난다", () => {
		const players = startGame(6, 1, DECK);
		const target = room(1);
		finishPhase(target);

		const police = seatsWithRole(target, Role.POLICE)[0];
		const madam = playerOf(seatsWithRole(target, Role.MADAM)[0]);
		send(playerOf(police), { type: "select", num: seatsWithRole(target, Role.CITIZEN)[0].index });
		send(madam, { type: "select", num: police.index });
		silence(players);

		finishPhase(target); // 정산 → 아침 통보

		assert.equal(heard(playerOf(police), Sound.BLOCKED), true);
		assert.equal(listeners(players, Sound.BLOCKED), 1);
	});

	/**
	 * 개표는 마피아42 규칙에서 처형이 아니라 재판의 시작이다. 판에서 가장
	 * 무거운 전환인데 신호가 화면과 채팅 한 줄뿐이었고, 그 줄은 토론이
	 * 시작되면 곧 밀려 올라간다.
	 *
	 * 아무도 오르지 않은 개표까지 울리면 소리의 뜻이 "개표 화면이 떴다"로
	 * 넓어져 사건과 구별되지 않는다. 그래서 같은 판의 두 낮을 나란히 본다.
	 */
	it("단상에 오른 낮만 지목음이 난다", () => {
		const players = startGame(6, 1, DECK);
		const target = room(1);
		const nominee = seatsWithRole(target, Role.CITIZEN)[0];

		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // 첫 밤(무사) → DAY
		finishPhase(target); // → VOTE
		silence(players);
		finishPhase(target); // → VOTE_RESULT (아무도 투표하지 않았다)

		assert.equal(target.nominee, 0);
		assert.equal(listeners(players, Sound.NOMINATE), 0);

		finishPhase(target); // → NIGHT (둘째 밤)
		finishPhase(target); // 둘째 밤(무사) → DAY
		finishPhase(target); // → VOTE
		for (const player of players) vote(player, nominee.index);
		silence(players);
		finishPhase(target); // → VOTE_RESULT

		assert.equal(target.nominee, nominee.index);
		// 개표 화면을 다 같이 본다. 죽은 사람도 화면을 보므로 방의 소리다
		assert.equal(listeners(players, Sound.NOMINATE), players.length);
	});

	it("처형은 방 전체가, 밤 사망은 죽은 본인만 듣는다", () => {
		const players = startGame(6, 1, DECK);
		const target = room(1);
		const victim = seatsWithRole(target, Role.CITIZEN)[0];
		const mafia = playerOf(seatsWithRole(target, Role.MAFIA)[0]);

		// 8인 이하 판의 첫 밤에는 아무도 죽지 않는다(firstNightPeacefulUpTo).
		// 첫 밤에 지목하고 단언하면 산 사람을 상대로 돌아 조용히 통과한다
		finishPhase(target); // ROLE_REVEAL → NIGHT
		passPeacefulFirstNight(target); // → 둘째 밤
		send(mafia, { type: "select", num: victim.index });
		silence(players);
		finishPhase(target); // 정산 → DAY

		assert.equal(victim.alive, false);
		// 방으로 내보내면 곧바로 이어지는 아침 소리와 겹치고, 한 밤에 둘이
		// 죽으면 같은 소리가 두 번 난다
		assert.equal(listeners(players, Sound.DEATH), 1);
		assert.equal(heard(playerOf(victim), Sound.DEATH), true);

		const executed = seatsWithRole(target, Role.MADAM)[0];
		silence(players);
		finishPhase(target); // DAY → VOTE
		for (const player of players) vote(player, executed.index);
		passTrial(target); // 개표 → 반론 → 찬반(전원 찬성) → 처형

		assert.equal(executed.alive, false);
		// 재판 결과를 다 같이 보는 중이라 방의 소리다. 죽은 사람도 화면을 본다
		assert.equal(listeners(players, Sound.EXECUTE), players.length);
	});

	/**
	 * 부결은 오랫동안 무음이었다. 처형에만 소리가 있으면 소리로 판을 따라가는
	 * 사람에게 무음이 곧 "아직 개표 중"이 되어, 살아남은 낮과 결과가 나오지
	 * 않은 낮이 같아진다.
	 */
	it("부결에도 소리가 난다 — 처형음의 짝", () => {
		const players = startGame(6, 1, DECK);
		const target = room(1);
		const nominee = seatsWithRole(target, Role.CITIZEN)[0];

		finishPhase(target); // ROLE_REVEAL → NIGHT
		passPeacefulFirstNight(target); // → 둘째 밤
		finishPhase(target); // 둘째 밤(무사) → DAY
		finishPhase(target); // → VOTE
		for (const player of players) vote(player, nominee.index);
		silence(players);
		passTrial(target, Judgement.OPPOSE); // 개표 → 반론 → 찬반(전원 반대) → 부결

		assert.equal(nominee.alive, true);
		assert.equal(listeners(players, Sound.ACQUIT), players.length);
		// 둘은 배타적이다. 함께 나면 소리만으로는 결과를 알 수 없다
		assert.equal(listeners(players, Sound.EXECUTE), 0);
	});
});
