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
	ALL_RULE_SETS,
	BLITZ_RULES,
	CLASSIC_RULES,
	defaultRuleSet,
	resolveRuleSet,
	ruleSetById,
	RuleSetId,
	rulesForRoom,
	SILENCE_RULES,
	STANDARD_RULES,
} from "../src/domain/RuleSet.ts";
import { accessOf, LOOSE_CONTEXT } from "../src/domain/chat/ChatPermission.ts";
import { quickFor } from "../src/domain/chat/QuickPhrases.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { MAX_PLAYERS, ROOM_COUNT } from "../src/constants/GameConfig.ts";
import { createRoom, resetRoom } from "../src/entities/Room.ts";

describe("표준전", () => {
	/**
	 * 마피아42의 진행 시간을 그대로 옮긴 값이다. 상수를 참조하면 "같이
	 * 틀리는" 테스트가 되므로 여기서도 리터럴로 박아 둔다.
	 *
	 * 옮기기 전 값(NIGHT 22 / DAY_PER_ALIVE 10 / DAY_MAX 60 / VOTE 17)과
	 * 다른 이유는 하나씩 있다.
	 *   - 낮이 제일 중요하다. tools/balance/report.mjs로 재면 "낮에 조사
	 *     결과가 공유되는가"만으로 시민 승률이 25~30%p 갈리는데, 옛 60초는
	 *     11인 판의 165초짜리 토론을 3분의 1로 자르고 있었다.
	 *   - DEFENSE·JUDGEMENT는 새로 생긴 단계다. 이 둘이 시민에게서 가져가는
	 *     몫(같은 시뮬레이션에서 10~20%p)을 되돌려주는 자리가 위의 낮이다.
	 *   - TICK_TOCK_AT만 이동 전(9)보다 낮다. 째깍 소리 파일이 그보다 짧아서
	 *     시계가 마감보다 먼저 멈췄기 때문에 파일 길이(5초)에 맞춰 내렸다.
	 */
	it("타이밍이 마피아42 규칙과 같다", () => {
		assert.deepEqual(STANDARD_RULES.timing, {
			START_COUNTDOWN: 10,
			ROLE_REVEAL: 9,
			NIGHT: 25,
			DAY_PER_ALIVE: 15,
			DAY_MAX: 180,
			VOTE: 15,
			VOTE_RESULT: 7,
			DEFENSE: 15,
			JUDGEMENT: 5,
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
		// 분(分)도 함께 본다. 낮이 60초에서 180초로 늘고 반론·찬반 20초가
		// 붙으면서 한 판이 실제로 두 배 가까이 길어졌다 — 화면에 나가는
		// 문장이 옛 길이를 그대로 말하면 방에 들어온 사람이 속는다
		assert.equal(STANDARD_RULES.summary, "기본 규칙. 4~12명, 5~20분");
		assert.equal(STANDARD_RULES.minPlayers, 4);
	});
});

describe("속도전", () => {
	it("한 판이 표준전의 절반 이하로 끝난다", () => {
		// 6인 기준 한 라운드(밤+낮+투표+개표+반론+찬반)의 길이를 비교한다.
		// 낮은 DAY_PER_ALIVE * 생존자와 DAY_MAX 중 작은 쪽이다.
		//
		// 반론과 찬반을 더하는 것이 중요하다. 빼고 재면 속도전이 그 두
		// 단계를 표준전과 같은 길이로 두어도 이 테스트가 초록으로 지나가는데,
		// 그러면 "3분 단판"이라고 적어 놓고 한 판이 4분을 넘긴다
		const round = (rules: typeof STANDARD_RULES, alive: number): number => {
			const day = Math.min(rules.timing.DAY_PER_ALIVE * alive, rules.timing.DAY_MAX);
			return (
				rules.timing.NIGHT +
				day +
				rules.timing.VOTE +
				rules.timing.VOTE_RESULT +
				rules.timing.DEFENSE +
				rules.timing.JUDGEMENT
			);
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
			"classic", "classic", "classic", "classic", "standard",
			"blitz", "blitz", "silence",
		];
		for (let num = 1; num <= ROOM_COUNT; num++) {
			assert.equal(rulesForRoom(num).id, expected[num - 1], `${num}번 방`);
		}
	});

	it("방 절반이 기본 모드다", () => {
		// 방 번호가 이 프로젝트의 모드 선택 화면이다. 기본 모드를 바꾼다는 것은
		// "아무 방이나 들어갔을 때 무엇이 나오는가"를 바꾸는 것이므로, 배정표에
		// 기본 모드가 다수여야 그 말이 사실이 된다
		let defaults = 0;
		for (let num = 1; num <= ROOM_COUNT; num++) {
			if (rulesForRoom(num).id === defaultRuleSet().id) defaults++;
		}
		assert.ok(defaults * 2 >= ROOM_COUNT, `기본 모드 방 ${defaults}개 / 전체 ${ROOM_COUNT}개`);
	});

	it("배정표 밖의 번호도 기본 모드로 간다", () => {
		// createRoom은 1~ROOM_COUNT로만 부르지만, 이 함수는 그것을 모른다.
		// 범위 밖에 답이 없으면 undefined가 room.ruleSet에 들어가 그 방의
		// 모든 타이머와 배정이 한꺼번에 죽는다
		for (const num of [-1, 0, ROOM_COUNT + 1, 999]) {
			assert.equal(rulesForRoom(num).id, defaultRuleSet().id, `${num}번 방`);
		}
	});
});

describe("모드 결정", () => {
	it("기본 모드는 클래식이다", () => {
		assert.equal(defaultRuleSet().id, RuleSetId.CLASSIC);
		assert.equal(defaultRuleSet(), CLASSIC_RULES);
	});

	it("id 상수와 리터럴의 id가 같다", () => {
		// 상수를 두는 목적이 오타 방지인데 상수 자체가 리터럴과 어긋나면
		// ruleSetById가 영원히 null을 돌려주고 전부 기본 모드로 흘러간다
		assert.equal(CLASSIC_RULES.id, RuleSetId.CLASSIC);
		assert.equal(STANDARD_RULES.id, RuleSetId.STANDARD);
		assert.equal(BLITZ_RULES.id, RuleSetId.BLITZ);
		assert.equal(SILENCE_RULES.id, RuleSetId.SILENCE);
	});

	it("모든 모드가 목록에 있고 id가 겹치지 않는다", () => {
		const ids = ALL_RULE_SETS.map(rules => rules.id);
		assert.deepEqual(ids, ["classic", "standard", "blitz", "silence"]);
		for (const id of ids) {
			assert.equal(ids.filter(other => other === id).length, 1, `${id} 중복`);
		}
	});

	it("id로 찾으면 그 모드가 나온다", () => {
		for (const rules of ALL_RULE_SETS) {
			assert.equal(ruleSetById(rules.id), rules, rules.id);
		}
		assert.equal(ruleSetById("clasic"), null);
		assert.equal(ruleSetById(""), null);
	});

	it("유효한 지정은 기본 모드가 덮지 않는다", () => {
		for (const rules of ALL_RULE_SETS) {
			assert.equal(resolveRuleSet(rules.id), rules, rules.id);
		}
	});

	it("지정이 없거나 모르는 값이면 기본 모드로 간다", () => {
		assert.equal(resolveRuleSet(null), CLASSIC_RULES);
		assert.equal(resolveRuleSet(undefined), CLASSIC_RULES);
		assert.equal(resolveRuleSet(""), CLASSIC_RULES);
		assert.equal(resolveRuleSet("clasic"), CLASSIC_RULES);
		assert.equal(resolveRuleSet("랭크전"), CLASSIC_RULES);
	});

	it("만들어진 방은 반드시 아는 모드를 하나 갖는다", () => {
		// 방을 만드는 길은 createRoom 하나뿐이고, 그 길에서 ruleSet이 비는
		// 가지가 없다는 것이 "모드 없는 방은 없다"의 근거다. 타입은
		// readonly RuleSet이라 이 사실을 말해 주지 않는다 — 배정표에 번호를
		// 하나 빠뜨리면 undefined가 그 자리에 조용히 앉는다
		for (let num = 1; num <= ROOM_COUNT; num++) {
			const room = createRoom(num);
			assert.ok(
				ALL_RULE_SETS.indexOf(room.ruleSet) >= 0,
				num + "번 방의 모드가 목록에 없다"
			);
		}
	});

	it("배정표 밖의 번호로는 방이 만들어지지 않는다", () => {
		// rulesForRoom은 범위 밖에서 기본 모드를 주지만, 그보다 앞서
		// 좌표를 정하는 쪽이 번호를 거부한다. 즉 "모드가 이상한 방"이 아니라
		// "방이 없다"가 되는데, 잘못된 번호에 대해서는 그편이 맞다 —
		// 갈 자리가 없는 방을 모드만 붙여 만들어 두면 사람이 허공에 선다
		for (const num of [-1, 0, ROOM_COUNT + 1, 999]) {
			assert.throws(() => createRoom(num), /방 번호/, num + "번이 통과했다");
		}
		// 그래도 규칙 쪽 그물은 남는다. 이 함수는 공개돼 있어 방을 거치지 않고
		// 직접 불릴 수 있다
		assert.equal(rulesForRoom(999), CLASSIC_RULES);
	});

	it("판이 끝나도 방의 모드는 그대로다", () => {
		// 방은 메모리에만 있고 판이 끝나면 resetRoom이 비운다. 그 함수가
		// ruleSet까지 지우면 두 번째 판부터 모드 없는 방이 생긴다 —
		// 이 프로젝트에서 "저장된 모드가 없는 기존 방"이 실제로 생길 수 있는
		// 유일한 자리다
		const room = createRoom(5);
		assert.equal(room.ruleSet, STANDARD_RULES);
		resetRoom(room);
		assert.equal(room.ruleSet, STANDARD_RULES);
	});
});

describe("클래식", () => {
	it("4~12인, 자유 채팅", () => {
		assert.equal(CLASSIC_RULES.minPlayers, 4);
		assert.equal(CLASSIC_RULES.maxPlayers, 12);
		assert.equal(CLASSIC_RULES.chatMode, "free");
		assert.equal(CLASSIC_RULES.displayName, "클래식");
	});

	it("시간표는 표준전과 같은 값을 참조한다", () => {
		// 같은 숫자를 두 번 적으면 한쪽만 고쳐지는 날이 온다
		assert.equal(CLASSIC_RULES.timing, STANDARD_RULES.timing);
	});

	it("첫 밤 무사는 6인까지다", () => {
		// 원작 클래식은 첫 밤에도 죽는다. 4~6인만 예외로 둔다
		assert.equal(CLASSIC_RULES.firstNightPeacefulUpTo, 6);
	});

	it("자경단원·점쟁이·사기꾼은 풀에 없다", () => {
		const deck = CLASSIC_RULES.deck;
		const pools = deck.leadPool
			.concat(deck.mafiaPool)
			.concat(deck.citizenRequired)
			.concat(deck.citizenPool);
		for (const role of [Role.VIGILANTE, Role.SEER, Role.CON_ARTIST]) {
			assert.ok(pools.indexOf(role) < 0, `${role}이 클래식 풀에 있다`);
		}
	});

	it("클래식 풀은 요청받은 열여덟 직업을 전부 담는다", () => {
		const deck = CLASSIC_RULES.deck;
		// 마피아 진영 다섯
		assert.deepEqual(deck.leadPool, [Role.MAFIA]);
		assert.deepEqual(deck.mafiaPool, [Role.SPY, Role.BEAST, Role.MADAM, Role.THIEF]);
		// 시민 진영 중요 둘
		assert.deepEqual(deck.citizenRequired, [Role.POLICE, Role.DOCTOR]);
		// 시민 진영 특수 열. 평시민은 풀이 아니라 남는 자리로 들어간다
		assert.deepEqual(deck.citizenPool, [
			Role.SOLDIER, Role.POLITICIAN, Role.SHAMAN, Role.LOVER,
			Role.THUG, Role.REPORTER, Role.DETECTIVE, Role.GRAVEDIGGER,
			Role.TERRORIST, Role.PRIEST,
		]);
	});

	it("연인만 짝 직업이다", () => {
		assert.deepEqual(CLASSIC_RULES.deck.pairedRoles, [Role.LOVER]);
	});

	it("표를 쓰는 모드는 클래식뿐이다", () => {
		// 다른 모드에 표가 생기면 그 모드의 mafiaTeamSize가 조용히 안 읽히게 된다
		for (const rules of ALL_RULE_SETS) {
			const hasRoster = rules.deck.roster !== null;
			assert.equal(hasRoster, rules.id === RuleSetId.CLASSIC, rules.id);
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

	it("단상에 오른 사람도 침묵전에서는 문구로만 반론한다", () => {
		// 반론은 이 판에서 가장 말이 무거운 자리다. PHRASES_ONLY_PHASES에서
		// DEFENSE를 빼면 침묵전인데 단상 위 한 명만 자유롭게 타이핑하게 된다.
		//
		// nominee를 켜는 것이 이 테스트의 요점이다. 끄면 앞선 DEFENSE 분기가
		// 먼저 잡아 write=false가 되므로, 뒤에 있는 침묵전 분기를 지워도
		// 초록으로 지나간다
		const onStand = { ...silentDay, phase: GamePhase.DEFENSE, nominee: true };
		assert.equal(accessOf(onStand, ChatChannel.ROOM).write, true);
		assert.equal(accessOf(onStand, ChatChannel.ROOM).freeText, false);

		// 찬반 5초는 잠그지 않는다. 다만 좁히기는 한다
		const judging = { ...silentDay, phase: GamePhase.JUDGEMENT };
		assert.equal(accessOf(judging, ChatChannel.ROOM).write, true);
		assert.equal(accessOf(judging, ChatChannel.ROOM).freeText, false);
	});

	it("반론 중에는 나머지가 표준전에서도 잠긴다", () => {
		// 침묵전만의 규칙이 아니다. 단상에 오른 사람 혼자 쓰는 15초라는 것이
		// 이 단계가 존재하는 이유이므로, 자유 채팅 방에서도 같아야 한다
		const freeDefense = {
			...silentDay,
			chatMode: "free" as const,
			phase: GamePhase.DEFENSE,
		};
		const listener = accessOf(freeDefense, ChatChannel.ROOM);
		assert.equal(listener.read, true);
		assert.equal(listener.write, false);
		assert.equal(listener.note, "최후의 반론 중입니다. 단상에 오른 사람만 말할 수 있습니다");

		const speaker = accessOf({ ...freeDefense, nominee: true }, ChatChannel.ROOM);
		assert.equal(speaker.write, true);
		assert.equal(speaker.freeText, true);
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
