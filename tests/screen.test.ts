/*
 * 화면 연출 배선 — 배율·흔들기·비네팅·배경음이 언제 누구에게 가는가.
 *
 * 효과음(sfx.test.ts)과 같은 종류의 위험이지만 한 가지가 더 나쁘다. 배율과
 * 비네팅은 **사람에게 붙는 상태**여서 되돌리는 코드가 빠져도 그 순간에는
 * 아무 일도 일어나지 않는다. 대기실로 돌아간 사람이 밤의 배율로 걸어 다니고
 * 밤 음악을 계속 듣는 것이 그 증상이고, 화면이 깨진 것은 아니라서 본인도
 * 무엇이 다른지 말하기 어렵다 — 그런 종류는 사람이 눈으로 못 찾는다.
 *
 * 그래서 여기서 지키는 것은 대부분 "돌아왔는가"다. 밤에 당긴 배율이 아침에
 * 풀리는가, 조여든 어둠이 낮에 걷히는가, 판이 끝나면 음악이 멈추는가.
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { VeilSpec } from "../src/types/Game.types.ts";
import { GamePhase, Role, Team } from "../src/types/Game.types.ts";
import { Bgm } from "../src/constants/Assets.ts";
import { roomCameraTarget } from "../src/constants/RoomLayout.ts";
import { finish } from "../src/services/Outcome.ts";
import type { TremorSpec } from "../src/services/Screen.ts";
import { Tremor, Veil, Zoom } from "../src/services/Screen.ts";
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

/**
 * 그 어둠이 걸린 횟수.
 *
 * 짙기까지 보는 이유는 표에 반지름만 다른 항목이 생길 수 있어서다. 둘을
 * 함께 보면 어느 항목인지가 한 벌로 정해진다.
 */
function veiledAt(player: FakePlayer, veil: VeilSpec): number {
	let count = 0;
	for (const record of player.veils) {
		if (record.radius === veil.radius && record.opacity === veil.opacity) count++;
	}
	return count;
}

/** 지금 이 사람 화면에 마지막으로 걸린 어둠 */
function lastVeil(player: FakePlayer): { radius: number; startRadius: number; opacity: number } {
	return player.veils[player.veils.length - 1];
}

describe("고정 카메라", () => {
	it("직업 공개 단계부터 방 가운데 y+1 좌표를 본다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const expected = roomCameraTarget(1);
		assert.deepEqual(expected, { x: 30, y: 26 });
		for (const player of players) {
			assert.deepEqual(player.cameraShots[player.cameraShots.length - 1], {
				tileX: expected.x,
				tileY: expected.y,
			});
		}

		finishPhase(room(1)); // NIGHT
		finishPhase(room(1)); // DAY
		for (const player of players) {
			assert.deepEqual(player.cameraShots[player.cameraShots.length - 1], {
				tileX: expected.x,
				tileY: expected.y,
			});
		}
	});

	it("진행 중 재접속은 방 중심을 복구하고 게임 종료는 자기 시점으로 돌아간다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		const returning = players[players.length - 1];
		disconnect(returning);
		returning.clearLog();
		reconnect(returning);
		assert.deepEqual(returning.cameraShots[returning.cameraShots.length - 1], {
			tileX: 30,
			tileY: 26,
		});

		finish(target, Team.CITIZEN);
		for (const player of players) {
			assert.deepEqual(player.cameraShots[player.cameraShots.length - 1], {
				tileX: null,
				tileY: null,
			});
		}
	});
});

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

describe("개표", () => {
	/**
	 * 개표는 투표 화면 안에서 결과만 바뀌는 자리다. 단상에 누가 올랐든
	 * 배율은 투표 때 그대로여야 한다 — 여기서 화면이 움직이면 그 움직임
	 * 자체가 "뭔가 있었다"는 신호가 되어, 아무도 오르지 않은 개표와
	 * 오른 개표를 화면 흔들림만으로 구별할 수 있게 된다.
	 */
	it("단상에 올라도 배율은 투표 그대로다", () => {
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
		for (const player of players) assert.equal(player.displayRatio, Zoom.VOTE);
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

describe("비네팅", () => {
	/**
	 * 어둠은 배율보다 한 겹 더 위험하다. 배율은 틀려도 화면이 멀거나 가까울
	 * 뿐이지만 비네팅은 걷는 API가 따로 없어서 — 짙기 0을 다시 걸어주는 것이
	 * 곧 해제다 — 걷는 호출을 빠뜨리면 낮에도 밤의 어둠이 그대로 남는다.
	 */
	it("밤에 내려앉고 아침에 걷힌다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);

		// 곡과 같은 계산이다. 직업 공개에서 미리 걸어 두면 첫 밤까지 어둠이
		// 한 번도 끊기지 않는다
		for (const player of players) assert.equal(veiledAt(player, Veil.NIGHT), 1);

		silence(players);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		for (const player of players) {
			assert.equal(player.veils.length, 0, "같은 어둠을 다시 걸었습니다");
		}

		silence(players);
		finishPhase(target); // → DAY
		for (const player of players) {
			assert.equal(veiledAt(player, Veil.NONE), 1);
			// 출발이 밤의 반지름이어야 어둠이 벌어지며 걷힌다. 0에서 출발하면
			// 화면이 한 번 완전히 덮였다가 사라진다
			assert.equal(lastVeil(player).startRadius, Veil.NIGHT.radius);
		}

		silence(players);
		finishPhase(target); // → VOTE (낮과 같은 어둠 없음)
		for (const player of players) {
			assert.equal(player.veils.length, 0, "투표에서 없는 어둠을 다시 걷었습니다");
		}
	});

	/**
	 * 반지름은 뚫린 원의 크기라 화면 대각선 절반을 넘으면 아무것도 보이지
	 * 않는다. 폰은 그 절반이 PC의 절반쯤이므로 같은 값을 그대로 쓰면 폰에서만
	 * 어둠이 사라진다 — 배율과 같은 종류의 실수이고 증상만 반대다.
	 */
	it("폰은 반지름을 줄여 같은 세기로 덮는다", () => {
		const phone = connect("폰", { isMobile: true });
		const desk = connect("PC");
		const players = [phone, desk, connect("셋"), connect("넷")];
		for (const player of players) {
			joinRoom(player, 1);
			setReady(player);
		}
		const target = room(1);

		silence(players);
		tick(target.countdown + 0.001); // 대기실 카운트다운 → 게임 시작

		assert.equal(target.started, true);
		assert.equal(lastVeil(desk).radius, Veil.NIGHT.radius);
		// 0.65는 Screen.MOBILE_VEIL이다. 배율의 0.7과 같은 이유로 여기 숫자로
		// 적는다 — 상수를 가져다 쓰면 상수를 바꿔도 테스트가 따라 바뀌어서
		// "값을 고쳤다"는 사실 자체를 아무도 마주치지 않는다
		assert.equal(lastVeil(phone).radius, Veil.NIGHT.radius * 0.65);
	});

	/**
	 * 처형 한순간만 색이 있다. 이 붉은 기는 스스로 걷히지 않고 다음 장면 전환을
	 * 기다리는데, 처형 뒤에 오는 것은 밤 아니면 종료뿐이라 그 둘 중 하나가
	 * 반드시 걷어간다 — 그 두 길이 아닌 경로가 생기면 이 테스트가 먼저 깨진다.
	 */
	it("처형 순간만 붉게 덮이고 곧바로 걷힌다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		const mafia = seatsWithRole(target, Role.MAFIA)[0];

		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // 첫 밤(무사) → DAY
		finishPhase(target); // → VOTE
		for (const player of players) vote(player, mafia.index);
		silence(players);
		passTrial(target); // 개표 → 반론 → 찬반 → 처형

		assert.equal(mafia.alive, false);
		for (const player of players) {
			assert.equal(veiledAt(player, Veil.STRIKE), 1);
			// 여기서는 판이 끝났으므로 종료 장면이 걷어갔다
			assert.equal(lastVeil(player).opacity, 0);
		}
	});

	/**
	 * 재접속. 곡·배율과 같은 이유로 복원이 필요하지만 여기엔 조건이 하나 더
	 * 붙는다 — 출발 반지름을 방의 현재 값으로 줘야 한다. 다른 값에서 출발시키면
	 * 이미 밤인 방에 들어온 사람의 화면에서만 어둠이 뒤늦게 조여든다.
	 */
	it("도중에 돌아오면 지금 방의 어둠이 그 자리에 걸린다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT

		const returning = players[players.length - 1];
		disconnect(returning);
		returning.clearLog();
		reconnect(returning);

		const veil = lastVeil(returning);
		assert.equal(veil.radius, Veil.NIGHT.radius);
		assert.equal(veil.startRadius, Veil.NIGHT.radius, "돌아온 사람에게만 어둠이 다시 조여듭니다");
	});

	/**
	 * 대기실 복귀. 배율·음악과 한 묶음이지만 이것만 증상이 다르다 — 남은 배율은
	 * 이상하다고 느끼기라도 하는데, 남은 어둠은 그냥 "이 맵은 원래 어둡다"로
	 * 읽혀서 아무도 신고하지 않는다.
	 */
	it("대기실로 돌아가면 어둠이 남지 않는다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		const mafia = seatsWithRole(target, Role.MAFIA)[0];

		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // 첫 밤(무사) → DAY
		finishPhase(target); // → VOTE
		for (const player of players) vote(player, mafia.index);
		passTrial(target); // 개표 → 반론 → 찬반 → 처형 → 종료

		assert.equal(target.phase, GamePhase.GAME_OVER);
		silence(players);
		finishPhase(target); // 종료 화면 → 대기실

		assert.equal(target.started, false);
		for (const player of players) assert.equal(lastVeil(player).opacity, 0);
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
	it("재판에서 곡이 바뀌고 시야가 좁아진다", () => {
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
			assert.equal(player.displayRatio, Zoom.TRIAL);
			assert.equal(lastVeil(player).radius, Veil.TRIAL.radius);
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
	 * 재판 도중에 돌아온 사람도 같은 화면을 받는다. 재접속 복구가 배율만
	 * 챙기고 어둠을 빠뜨리면 남들이 좁아진 시야로 반론을 듣는 동안 혼자
	 * 환한 화면에 앉아 있게 된다.
	 */
	it("재판 도중에 돌아오면 어둠도 다시 걸린다", () => {
		const players = startGame(6, 1, ONE_MAFIA);
		const target = room(1);
		const nominee = seatsWithRole(target, Role.CITIZEN)[1];

		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // 첫 밤(무사) → DAY
		finishPhase(target); // → VOTE
		for (const player of players) vote(player, nominee.index);
		finishPhase(target); // → VOTE_RESULT
		finishPhase(target); // → DEFENSE

		const returning = playerOf(seatsWithRole(target, Role.CITIZEN)[2]);
		disconnect(returning);
		returning.clearLog();
		reconnect(returning);

		assert.equal(returning.displayRatio, Zoom.TRIAL);
		assert.equal(lastVeil(returning).radius, Veil.TRIAL.radius);
	});
});
