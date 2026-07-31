/**
 * 규칙 세트 테스트.
 *
 * 표준전은 이동 전 상수와 값이 같아야 한다. 여기 적힌 숫자는 옮기기 전
 * GameConfig.TIMING에 있던 값 그대로다 — 상수를 참조하면 "같이 틀리는"
 * 테스트가 되므로 일부러 리터럴로 박아 둔다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GamePhase, Role } from "../src/types/Game.types.ts";
import {
	BLITZ_RULES,
	rulesForRoom,
	SILENCE_RULES,
	STANDARD_RULES,
} from "../src/domain/RuleSet.ts";
import { accessOf, LOOSE_CONTEXT } from "../src/domain/chat/ChatPermission.ts";
import { quickFor } from "../src/domain/chat/QuickPhrases.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { MAX_PLAYERS, ROOM_COUNT } from "../src/constants/GameConfig.ts";

describe("표준전", () => {
	/**
	 * TICK_TOCK_AT만 이동 전(9)과 다르다. 째깍 소리 파일이 그보다 짧아서
	 * 시계가 마감보다 먼저 멈췄기 때문에, 파일의 째깍 배치 길이(5초)에
	 * 맞춰 내렸다 — 속도전은 원래 5였으므로 이제 둘이 같다.
	 */
	it("타이밍이 이동 전 값과 같다", () => {
		assert.deepEqual(STANDARD_RULES.timing, {
			START_COUNTDOWN: 10,
			ROLE_REVEAL: 9,
			NIGHT: 22,
			DAY_PER_ALIVE: 10,
			DAY_MAX: 60,
			VOTE: 17,
			VOTE_RESULT: 7,
			GAME_OVER: 16,
			TICK_TOCK_AT: 5,
		});
	});

	it("인원표가 이동 전 값과 같다", () => {
		assert.deepEqual(
			STANDARD_RULES.deck.mafiaTeamSize,
			[0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3]
		);
	});

	it("첫 밤 무사 문턱이 8이다", () => {
		assert.equal(STANDARD_RULES.firstNightPeacefulUpTo, 8);
	});

	it("한 줄 설명의 인원이 실제 정원과 같다", () => {
		// 이 문장은 이제 방에 들어올 때마다 화면에 나간다(Lobby.join).
		// 죽은 텍스트일 때는 6~12명이라고 적혀 있어도 아무도 못 봤지만,
		// 지금은 4명으로 시작할 수 있는 방이 "6명부터"라고 말하는 셈이다
		assert.equal(STANDARD_RULES.summary, "기본 규칙. 4~12명, 5~10분");
		assert.equal(STANDARD_RULES.minPlayers, 4);
	});
});

describe("속도전", () => {
	it("한 판이 표준전의 절반 이하로 끝난다", () => {
		// 6인 기준 한 라운드(밤+낮+투표+개표)의 길이를 비교한다.
		// 낮은 DAY_PER_ALIVE * 생존자와 DAY_MAX 중 작은 쪽이다
		const round = (rules: typeof STANDARD_RULES, alive: number): number => {
			const day = Math.min(rules.timing.DAY_PER_ALIVE * alive, rules.timing.DAY_MAX);
			return rules.timing.NIGHT + day + rules.timing.VOTE + rules.timing.VOTE_RESULT;
		};
		assert.ok(round(BLITZ_RULES, 6) * 2 <= round(STANDARD_RULES, 6));
	});

	it("직업 풀이 다섯 개뿐이다", () => {
		// 마피아·의사·경찰·군인 + 나머지를 채우는 시민
		assert.deepEqual(BLITZ_RULES.deck.leadPool, [Role.MAFIA]);
		assert.deepEqual(BLITZ_RULES.deck.mafiaPool, [Role.MAFIA]);
		assert.deepEqual(BLITZ_RULES.deck.citizenRequired, [Role.DOCTOR, Role.POLICE]);
		assert.deepEqual(BLITZ_RULES.deck.citizenPool, [Role.SOLDIER]);
	});

	it("4~8인 전용이다", () => {
		// 리터럴로 못 박는다. gameflow.test.ts의 "아홉 번째 사람" 테스트는 이
		// 값을 읽어서 방을 채우므로 정원을 12로 올려도 초록으로 지나가는데,
		// 그 순간 Lobby.join 주석이 경고하는 "속도전 9인부터 첫 밤 사망"이
		// 조용히 사실이 된다(firstNightPeacefulUpTo가 8이라 9인부터 풀린다).
		// 침묵전 하한과 정확히 같은 이유로 같은 자리에 적어 둔다
		assert.equal(BLITZ_RULES.minPlayers, 4);
		assert.equal(BLITZ_RULES.maxPlayers, 8);
		assert.equal(BLITZ_RULES.firstNightPeacefulUpTo, 8);
	});

	it("인원표에 0이 남아 있지 않다", () => {
		// 정원(8) 밖은 도달 경로가 없지만, 0을 두면 그 칸을 읽었을 때 마피아
		// 0명 판이 되어 시작하자마자 시민 승리가 난다. 8인 값을 반복한다
		for (let count = BLITZ_RULES.minPlayers; count <= MAX_PLAYERS; count++) {
			assert.ok(BLITZ_RULES.deck.mafiaTeamSize[count] > 0, `${count}인`);
		}
	});
});

describe("침묵전", () => {
	it("8인 이상 전용이고 첫 밤 무사가 꺼져 있다", () => {
		assert.equal(SILENCE_RULES.minPlayers, 8);
		assert.equal(SILENCE_RULES.maxPlayers, 12);
		// 0은 "조건에 안 걸린다"가 아니라 "끄기로 했다"는 표시다
		assert.equal(SILENCE_RULES.firstNightPeacefulUpTo, 0);
	});

	it("타이밍과 덱은 표준전과 같다", () => {
		assert.equal(SILENCE_RULES.chatMode, "phrasesOnly");
		assert.deepEqual(SILENCE_RULES.timing, STANDARD_RULES.timing);
		assert.deepEqual(SILENCE_RULES.deck, STANDARD_RULES.deck);
	});
});

describe("방 배정", () => {
	it("배정표대로 나뉜다", () => {
		const expected = [
			"standard", "standard", "standard", "standard", "standard",
			"blitz", "blitz", "silence",
		];
		for (let num = 1; num <= ROOM_COUNT; num++) {
			assert.equal(rulesForRoom(num).id, expected[num - 1], `${num}번 방`);
		}
	});
});

describe("침묵전의 낮", () => {
	const silentDay = {
		...LOOSE_CONTEXT,
		seated: true,
		started: true,
		phase: GamePhase.DAY,
		chatMode: "phrasesOnly" as const,
	};

	it("쓸 수는 있지만 자유 입력은 막힌다", () => {
		const access = accessOf(silentDay, ChatChannel.ROOM);
		// write까지 막으면 빠른 문구 버튼도 같이 죽는다 — 버튼도 같은
		// 전송 경로를 탄다. 막는 것은 자유 입력(freeText)이다
		assert.equal(access.write, true);
		assert.equal(access.freeText, false);
		assert.equal(access.note, "🤐 침묵전에서는 준비된 문구만 쓸 수 있습니다");
	});

	it("준비된 문구가 여덟 개 나온다", () => {
		assert.equal(quickFor(silentDay).length, 8);
		assert.ok(quickFor(silentDay).includes("의심됩니다"));
	});

	it("표준전 낮은 자유 입력이 열려 있다", () => {
		const freeDay = { ...silentDay, chatMode: "free" as const };
		assert.equal(accessOf(freeDay, ChatChannel.ROOM).freeText, true);
	});

	it("대기실은 열리고 직업 공개부터 잠긴다", () => {
		// 대기실을 좁혀도 지키는 것이 없다 — started가 false인 동안 전체 탭이
		// OPEN이라(ChatPermission의 GLOBAL 분기) 같은 사람들이 거기서 그대로 떠든다.
		const lobby = { ...silentDay, started: false, phase: GamePhase.LOBBY };
		const reveal = { ...silentDay, phase: GamePhase.ROLE_REVEAL };
		assert.equal(accessOf(lobby, ChatChannel.ROOM).freeText, true, "대기실");
		assert.equal(accessOf(reveal, ChatChannel.ROOM).write, false, "직업 공개");
		// 좁히기로 한 단계는 그대로 좁혀져 있어야 한다
		assert.equal(accessOf(silentDay, ChatChannel.ROOM).freeText, false, "낮");
	});

	it("투표와 개표도 좁혀진 채로 남는다", () => {
		// 침묵전의 제약이 값을 갖는 단계는 토론과 투표다. 이 둘은 각자
		// 상황에 맞는 문구셋(QUICK_VOTE)이 있어 좁혀도 할 말이 남는다
		for (const phase of [GamePhase.VOTE, GamePhase.VOTE_RESULT]) {
			const access = accessOf({ ...silentDay, phase }, ChatChannel.ROOM);
			assert.equal(access.freeText, false, phase);
			assert.equal(access.write, true, phase);
		}
	});

	it("마피아 밀담은 침묵전에서도 자유롭다", () => {
		const silentNight = {
			...silentDay,
			phase: GamePhase.NIGHT,
			mafiaChat: true,
		};
		const access = accessOf(silentNight, ChatChannel.MAFIA);
		assert.equal(access.write, true);
		assert.equal(access.freeText, true);
	});
});
