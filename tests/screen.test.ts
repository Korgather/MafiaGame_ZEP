/*
 * 화면 연출 배선 — 배율·카메라·흔들기·배경음이 언제 누구에게 가는가.
 *
 * 효과음(sfx.test.ts)과 같은 종류의 위험이지만 한 가지가 더 나쁘다. 카메라와
 * 배율은 **사람에게 붙는 상태**여서 되돌리는 코드가 빠져도 그 순간에는
 * 아무 일도 일어나지 않는다. 대기실로 돌아간 사람이 밤의 배율로 걸어 다니고
 * 밤 음악을 계속 듣는 것이 그 증상이고, 화면이 깨진 것은 아니라서 본인도
 * 무엇이 다른지 말하기 어렵다 — 그런 종류는 사람이 눈으로 못 찾는다.
 *
 * 그래서 여기서 지키는 것은 대부분 "돌아왔는가"다. 밤에 당긴 배율이 아침에
 * 풀리는가, 단상에 간 카메라가 각자에게 오는가, 판이 끝나면 음악이 멈추는가.
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { GamePhase, Role } from "../src/types/Game.types.ts";
import { Bgm } from "../src/constants/Assets.ts";
import type { TremorSpec } from "../src/services/Screen.ts";
import { Hold, Tremor, Zoom } from "../src/services/Screen.ts";
import type { FakePlayer } from "./helpers/Harness.ts";
import {
	connect,
	disconnect,
	finishPhase,
	joinRoom,
	passPeacefulFirstNight,
	passTrial,
	playerOf,
	reconnect,
	resetWorld,
	room,
	seatsWithRole,
	send,
	setReady,
	startGame,
	tick,
	vote,
} from "./helpers/Harness.ts";

beforeEach(() => resetWorld());

/** 마피아 하나에 시민 다섯. 처형 한 번으로 판이 끝나므로 종료 연출까지 닿는다 */
const ONE_MAFIA = [Role.MAFIA, Role.CITIZEN, Role.CITIZEN, Role.CITIZEN, Role.CITIZEN, Role.CITIZEN];

function silence(players: readonly FakePlayer[]): void {
	for (const player of players) player.clearLog();
}

function heard(player: FakePlayer, sound: string): boolean {
	return player.sounds.indexOf(sound) >= 0;
}

/** 좌표로 보낸 카메라 이동 — 클로즈업 */
function pans(player: FakePlayer): number {
	let count = 0;
	for (const shot of player.cameraShots) {
		if (shot.tileX !== null) count++;
	}
	return count;
}

/** 자기 캐릭터로 돌아온 카메라 */
function homings(player: FakePlayer): number {
	let count = 0;
	for (const shot of player.cameraShots) {
		if (shot.tileX === null) count++;
	}
	return count;
}

/** 그 세기로 흔들린 횟수 */
function shookAt(player: FakePlayer, tremor: TremorSpec): number {
	let count = 0;
	for (const shake of player.shakes) {
		if (shake.ms === tremor.ms && shake.power === tremor.power) count++;
	}
	return count;
}

/** 흔들린 사람 수 */
function shaken(players: readonly FakePlayer[], tremor: TremorSpec): number {
	let count = 0;
	for (const player of players) {
		if (shookAt(player, tremor) > 0) count++;
	}
	return count;
}

describe("배율", () => {
	/**
	 * 밤과 낮의 차이를 화면으로 말하는 유일한 수단이다. 컷은 3초면 걷히고
	 * 위젯은 손가락에 가려지는데, 배율은 단계가 끝날 때까지 남는다.
	 */
	it("밤에 당기고 아침에 되돌린다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);

		finishPhase(target); // ROLE_REVEAL → NIGHT
		for (const player of players) assert.equal(player.displayRatio, Zoom.NIGHT);

		finishPhase(target); // → DAY
		for (const player of players) assert.equal(player.displayRatio, Zoom.DAY);
	});

	/**
	 * 배수여야 하는 이유. 폰은 화면이 좁아 기본이 0.7로 더 멀리 잡혀 있고
	 * (Screen.baseRatio), Zoom을 절대값으로 넣으면 폰에서만 밤마다 화면이
	 * 두 배 가까이 확대된다. 한 방에 폰과 PC가 섞이는 것이 기본 상황이라
	 * 두 기기를 같은 판에서 나란히 본다.
	 */
	it("폰은 같은 배수를 자기 기본값에 곱한다", () => {
		const phone = connect("폰", { isMobile: true });
		const desk = connect("PC");
		const players = [phone, desk, connect("셋"), connect("넷")];
		for (const player of players) {
			joinRoom(player, 1);
			setReady(player);
		}
		const target = room(1);
		tick(target.countdown + 0.001); // 대기실 카운트다운 → 게임 시작

		assert.equal(target.started, true);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		assert.equal(desk.displayRatio, Zoom.NIGHT);
		assert.equal(phone.displayRatio, 0.7 * Zoom.NIGHT);
	});

	/**
	 * 대기실 복귀. 배율은 방이 아니라 사람에게 걸려 있어서 방을 초기화하는
	 * 것만으로는 돌아오지 않는다 — 안 풀면 대기실을 밤의 배율로 걸어 다닌다.
	 */
	it("대기실로 돌아가면 배율이 풀리고 음악이 멈춘다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		const mafia = seatsWithRole(target, Role.MAFIA)[0];

		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // 첫 밤(무사) → DAY
		finishPhase(target); // → VOTE
		for (const player of players) vote(player, mafia.index);
		passTrial(target); // 개표 → 반론 → 찬반 → 처형

		assert.equal(target.phase, GamePhase.GAME_OVER);
		// 종료는 배율과 음악으로만 말한다. 흔들기는 처형이 이미 했다
		for (const player of players) assert.equal(player.displayRatio, Zoom.FINALE);

		silence(players);
		finishPhase(target); // 종료 화면 → 대기실

		assert.equal(target.started, false);
		for (const player of players) {
			assert.equal(player.displayRatio, 1);
			assert.equal(player.stoppedSounds.indexOf("bgm") >= 0, true);
		}
	});
});

describe("클로즈업", () => {
	/**
	 * 개표에서 단상에 오른 사람. 물고 있는 시간이 단계 길이보다 짧아서
	 * 카메라는 반드시 각자에게 돌아와야 하는데, 그 복귀는 ZEP에 타이머가
	 * 없어 프레임 루프가 굴린다(GameFlow → Screen.advanceShot). 그 연결이
	 * 끊기면 카메라가 남의 자리에 붙은 채로 판이 계속된다.
	 */
	it("단상을 비추고 시간이 지나면 각자에게 돌아온다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		const nominee = seatsWithRole(target, Role.CITIZEN)[0];

		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // 첫 밤(무사) → DAY
		finishPhase(target); // → VOTE
		for (const player of players) vote(player, nominee.index);
		silence(players);
		finishPhase(target); // → VOTE_RESULT

		assert.equal(target.nominee, nominee.index);
		for (const player of players) {
			assert.equal(pans(player), 1);
			assert.equal(player.displayRatio, Zoom.SPOT);
		}

		tick(Hold.NOMINEE + 0.01);

		for (const player of players) {
			assert.equal(homings(player), 1);
			// 돌아갈 곳은 개표 화면의 배율이다. 기본값으로 되돌리면 다음
			// 단계까지 화면이 한 번 더 튄다
			assert.equal(player.displayRatio, Zoom.VOTE);
		}
	});

	/**
	 * 아무도 오르지 않은 개표에서는 카메라가 움직이지 않는다. 빈 단상을
	 * 비추면 그 자리에 아무도 없으므로 "카메라가 고장났다"로 읽힌다.
	 */
	it("단상이 비면 카메라를 보내지 않는다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);

		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // 첫 밤(무사) → DAY
		finishPhase(target); // → VOTE
		silence(players);
		finishPhase(target); // → VOTE_RESULT (아무도 투표하지 않았다)

		assert.equal(target.nominee, 0);
		for (const player of players) assert.equal(pans(player), 0);
	});
});

describe("흔들기", () => {
	/**
	 * 처형은 이 게임에서 가장 큰 사건이고 방 전체가 함께 본다. 밤 사망과
	 * 세기가 다른 것도, 받는 사람이 다른 것도 의도다 — 남들은 아무렇지
	 * 않은데 내 화면만 크게 흔들리면 연출이 아니라 사고처럼 보인다.
	 */
	it("처형은 방 전체가 겪는다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		const mafia = seatsWithRole(target, Role.MAFIA)[0];

		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // 첫 밤(무사) → DAY
		finishPhase(target); // → VOTE
		for (const player of players) vote(player, mafia.index);
		silence(players);
		passTrial(target);

		assert.equal(mafia.alive, false);
		assert.equal(shaken(players, Tremor.EXECUTION), players.length);
		// 판이 여기서 끝난다. 종료가 또 흔들면 같은 틱에 두 번 흔들린다
		for (const player of players) assert.equal(player.shakes.length, 1);
	});

	/**
	 * 밤 사망은 죽은 본인만. 아침에 열 줄이 한꺼번에 올라오는데 그중 하나가
	 * 자기 부고이고, 짧은 진동이 그 한 줄을 찾아 준다.
	 */
	it("밤 사망은 죽은 사람만 겪는다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		const victim = seatsWithRole(target, Role.CITIZEN)[0];
		const mafia = playerOf(seatsWithRole(target, Role.MAFIA)[0]);

		finishPhase(target); // ROLE_REVEAL → NIGHT
		passPeacefulFirstNight(target); // → 둘째 밤
		send(mafia, { type: "select", num: victim.index });
		silence(players);
		finishPhase(target); // 정산 → DAY

		assert.equal(victim.alive, false);
		assert.equal(shookAt(playerOf(victim), Tremor.DEATH), 1);
		assert.equal(shaken(players, Tremor.DEATH), 1);
	});

	/**
	 * 차단은 밤 하나가 통째로 사라졌다는 뜻이라 통보 가운데 이것만 화면이
	 * 같이 반응한다. 나머지는 읽으면 되는 정보다.
	 */
	it("차단은 막힌 사람만 겪는다", () => {
		const deck = [Role.MAFIA, Role.MADAM, Role.POLICE, Role.CITIZEN, Role.CITIZEN, Role.CITIZEN];
		const players = startGame(6, 1, deck);
		const target = room(1);

		finishPhase(target); // ROLE_REVEAL → NIGHT
		const police = seatsWithRole(target, Role.POLICE)[0];
		const madam = playerOf(seatsWithRole(target, Role.MADAM)[0]);
		send(playerOf(police), { type: "select", num: seatsWithRole(target, Role.CITIZEN)[0].index });
		send(madam, { type: "select", num: police.index });
		silence(players);

		finishPhase(target); // 정산 → 아침 통보

		assert.equal(shookAt(playerOf(police), Tremor.BLOCKED), 1);
		assert.equal(shaken(players, Tremor.BLOCKED), 1);
	});
});

describe("배경음", () => {
	/**
	 * 곡을 단계가 아니라 장면(밤·낮·재판) 단위로 가른 이유. 낮·투표·개표가
	 * 3초마다 곡을 처음으로 되감으면 그건 음악이 아니라 소음이다.
	 *
	 * 직업 공개에 밤 곡을 미리 깔아 두는 것도 같은 계산이다 — 다음이 곧
	 * 첫 밤이라 같은 곡이면 판이 열리고 첫 밤까지 음악이 끊기지 않는다.
	 */
	it("장면이 바뀔 때만 곡을 갈아 끼운다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);

		// 직업 공개에서 이미 밤 곡이 걸렸다
		for (const player of players) assert.equal(heard(player, Bgm.NIGHT), true);

		silence(players);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		for (const player of players) {
			assert.equal(heard(player, Bgm.NIGHT), false, "같은 곡을 다시 틀었습니다");
			assert.equal(player.stoppedSounds.length, 0, "같은 곡인데 끊었습니다");
		}

		silence(players);
		finishPhase(target); // → DAY
		for (const player of players) {
			assert.equal(heard(player, Bgm.DAY), true);
			assert.equal(player.stoppedSounds.indexOf("bgm") >= 0, true);
		}

		silence(players);
		finishPhase(target); // → VOTE (낮과 같은 곡)
		for (const player of players) {
			assert.equal(heard(player, Bgm.DAY), false, "투표에서 낮 곡을 되감았습니다");
			assert.equal(player.stoppedSounds.length, 0);
		}
	});

	/** 재판만 곡이 따로다. 방 전체가 한 사람을 보는 유일한 시간이다 */
	it("재판에서 곡이 바뀌고 단상에 카메라가 붙는다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		const nominee = seatsWithRole(target, Role.CITIZEN)[0];

		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // 첫 밤(무사) → DAY
		finishPhase(target); // → VOTE
		for (const player of players) vote(player, nominee.index);
		finishPhase(target); // → VOTE_RESULT
		silence(players);
		finishPhase(target); // → DEFENSE

		assert.equal(target.phase, GamePhase.DEFENSE);
		for (const player of players) {
			assert.equal(heard(player, Bgm.TRIAL), true);
			assert.equal(pans(player), 1);
			assert.equal(player.displayRatio, Zoom.SPOT);
		}
	});

	/**
	 * 재접속. 배율과 곡은 사람에게 붙는 상태라 새 접속에는 아무것도 걸려
	 * 있지 않다 — 복원을 빠뜨리면 돌아온 사람만 밤에 낮 배율로, 음악 없이
	 * 앉아 있게 되고 화면이 깨진 것은 아니라서 신고되지 않는다.
	 */
	it("재접속하면 지금 배율과 곡이 다시 걸린다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT

		const returning = players[players.length - 1];
		disconnect(returning);
		returning.clearLog();
		reconnect(returning);

		assert.equal(returning.displayRatio, Zoom.NIGHT);
		assert.equal(heard(returning, Bgm.NIGHT), true);
	});

	/**
	 * 클로즈업 도중에 돌아온 사람에게도 같은 화면을 준다. 배율만 맞추고
	 * 카메라를 두면 남들은 단상을 보는데 혼자 자기 자리를 확대해 보고 있다.
	 */
	it("클로즈업 도중에 돌아오면 카메라도 따라간다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		const nominee = seatsWithRole(target, Role.CITIZEN)[1];

		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // 첫 밤(무사) → DAY
		finishPhase(target); // → VOTE
		for (const player of players) vote(player, nominee.index);
		finishPhase(target); // → VOTE_RESULT (단상 클로즈업이 돌고 있다)

		const returning = playerOf(seatsWithRole(target, Role.CITIZEN)[2]);
		disconnect(returning);
		returning.clearLog();
		reconnect(returning);

		assert.equal(pans(returning), 1);
		assert.equal(returning.displayRatio, Zoom.SPOT);
	});
});
