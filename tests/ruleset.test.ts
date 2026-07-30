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
			TICK_TOCK_AT: 9,
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

	it("채팅 방식만 표준전과 다르다", () => {
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
