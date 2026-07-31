/**
 * 한 판을 통째로 돌려 서비스 레이어의 **배선**을 검증한다.
 *
 * domain/ 테스트는 순수 함수가 옳은 답을 내는지만 본다. 그 함수를 실제로
 * 부르는 코드가 없거나, 결과를 무시하거나, 순서가 틀렸다면 도메인 테스트는
 * 전부 통과하면서 게임은 망가진다. 실제로 이번 마이그레이션에서 새어나간
 * 두 회귀(night.html payload 누락, setID의 isMobile 누락)가 정확히 그 부류였다.
 */
import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { GamePhase, Role, Team } from "../src/types/Game.types.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { QUICK_NOTE } from "../src/domain/chat/QuickPhrases.ts";
import { MapTrigger, WidgetFile } from "../src/constants/Assets.ts";
import { ACTION_RATE, MAX_PLAYERS, MIN_PLAYERS } from "../src/constants/GameConfig.ts";
import { BLITZ_RULES, SILENCE_RULES, STANDARD_RULES } from "../src/domain/RuleSet.ts";
import { roleBook } from "../src/domain/Guide.ts";
import { LOBBY_SPAWN_AREA } from "../src/constants/RoomLayout.ts";
import type { FakePlayer } from "./helpers/FakeZep.ts";
import {
	cardWidget,
	chatChannels,
	chatLines,
	chatSaw,
	connect,
	cutWidget,
	disconnect,
	findMainWidget,
	findSeatOf,
	finishPhase,
	hasCard,
	hasCut,
	joinRoom,
	mainWidget,
	passPeacefulFirstNight,
	playerOf,
	reconnect,
	resetWorld,
	room,
	seatOf,
	seatsWithRole,
	send,
	sendCard,
	setReady,
	startGame,
	startPlainGame,
	tick,
	touchObject,
	vote,
} from "./helpers/Harness.ts";

// node:test는 훅에 TestContext를 넘긴다. resetWorld(seed)가 그걸 시드로
// 받아버리지 않도록 인자를 끊는다.
beforeEach(() => resetWorld());

/** 맵 위 대기실 스폰 구역 안에 서 있는가 */
function inLobbyArea(pos: { tileX: number; tileY: number }): boolean {
	const area = LOBBY_SPAWN_AREA;
	return (
		pos.tileX >= area.x &&
		pos.tileX < area.x + area.width &&
		pos.tileY >= area.y &&
		pos.tileY < area.y + area.height
	);
}

describe("대기실 → 게임 시작", () => {
	it("접속하면 대기실 위젯이 열리고 payload에 크기가 함께 온다", () => {
		const player = connect("모바일유저", { isMobile: true });
		const widget = mainWidget(player);

		assert.equal(widget.fileName, WidgetFile.LOBBY);
		const setId = widget.lastOfType("setID");
		assert.ok(setId, "setID를 받지 못했습니다");
		assert.equal(setId.id, player.id);
		// 위젯이 차지할 상자는 서버가 정해 payload에 실어 보낸다. 빠뜨리면
		// 위젯이 showWidget에 넘긴 데스크톱 픽셀 그대로 뜬다 (실제로 있던 회귀 —
		// 예전에는 위젯이 스스로 rearrange를 불러야 했고 둘이 부르지 않았다).
		assert.ok(setId.layout, "layout을 받지 못했습니다");
	});

	it("최소 인원 미만이면 전원 준비해도 시작하지 않는다", () => {
		const target = room(1);
		for (let i = 0; i < MIN_PLAYERS - 1; i++) {
			const player = connect(`유저${i}`);
			joinRoom(player, 1);
			setReady(player);
		}

		tick(STANDARD_RULES.timing.START_COUNTDOWN + 1);

		assert.equal(target.started, false);
		assert.equal(target.phase, GamePhase.LOBBY);
	});

	it("전원 준비되면 카운트다운 뒤 직업이 배분된다", () => {
		// 이 파일에서 진짜 덱(buildRoleDeck)으로 도는 유일한 테스트다. 나머지는
		// 덱을 입력으로 고정하므로, 추첨 경로가 배선되어 있는지는 여기가 지킨다.
		const players = startGame(MIN_PLAYERS);
		const target = room(1);

		assert.equal(target.started, true);
		assert.equal(target.phase, GamePhase.ROLE_REVEAL);
		assert.equal(target.total, MIN_PLAYERS);

		// 참가 번호는 1부터 빠짐없이 부여된다
		const indices = target.seats.map(seat => seat.index).sort((a, b) => a - b);
		assert.deepEqual(indices, [1, 2, 3, 4]);

		// 인원수와 무관하게 성립하는 것만 본다. 어떤 능력자가 들어오는지는
		// 밸런스 상수가 정하고 그건 domain 테스트의 몫이다
		assert.equal(seatsWithRole(target, Role.MAFIA).length, 1);
		// 정보 직업은 최소 한 명. 의사냐 경찰이냐를 여기서 못 박으면 위 주석과
		// 어긋난다 — 최소 인원 판은 시민 자리가 셋뿐이라 둘 다 들어갈 수 없고,
		// 어느 쪽이 남는지는 매 판 달라진다(domain 테스트의 몫)
		const info =
			seatsWithRole(target, Role.DOCTOR).length + seatsWithRole(target, Role.POLICE).length;
		assert.ok(info >= 1, "정보 직업이 하나도 배분되지 않았습니다");

		for (const player of players) {
			assert.equal(seatOf(player).alive, true);
			/*
			 * 이름표는 두 줄이다 — 참가 번호와 닉네임(Stage.applyNameplate).
			 *
			 * 둘째 줄까지 보는 이유: ZEP이 닉네임을 그려주지 않는다
			 * (index.ts의 showName = false). 이름표를 쓰는 곳이 번호만 넣고
			 * 끝내면 화면에서 그 사람의 이름이 사라지고, 그건 눈으로만 보이는
			 * 종류의 고장이라 여기서 세지 않으면 아무도 모른다.
			 */
			const [badge, nick] = player.title.split("\n");
			assert.match(badge, /^\d+ 번 참가자$/);
			assert.equal(nick, player.name);
		}
	});

	/**
	 * 첫 안내는 처음 온 사람에게만, 그리고 한 번만.
	 *
	 * 판정이 둘(저장소 playCount + 접속 범위 guideSeen)이라 한쪽만 배선해도
	 * 조건 하나는 통과한다. 로그인 사용자·경험자·게스트 셋을 함께 보는 이유다.
	 */
	describe("첫 안내", () => {
		it("처음 온 사람이 방에 들어가면 안내 카드가 뜬다", () => {
			const player = connect("첫사용자");
			assert.equal(hasCard(player), false, "방에 들어가기도 전에 안내가 떴습니다");

			joinRoom(player, 1);

			const init = cardWidget(player).messages[0] as { nav: string; cards: unknown[] };
			assert.equal(init.nav, "steps");
			assert.ok(init.cards.length > 1, "안내가 한 장뿐입니다");
			// 대기실 화면은 카드 뒤에 그대로 살아 있어야 한다. 닫으면 방금 들어온
			// 방의 좌석 목록이 바로 보이는 것이 이 카드가 겹쳐 뜨는 이유다
			assert.ok(findMainWidget(player), "안내가 대기실 화면을 밀어냈습니다");
		});

		it("판을 해 본 사람에게는 뜨지 않는다", () => {
			const player = connect("경험자", { storage: JSON.stringify({ exp: 0, playCount: 1 }) });
			joinRoom(player, 1);
			assert.equal(hasCard(player), false);
		});

		/*
		 * 게스트는 PlayerStorage.update가 통째로 no-op이라 playCount가 영원히 0이다.
		 * 저장소만 보면 방을 드나들 때마다 안내가 다시 뜬다.
		 */
		it("게스트도 한 접속에 한 번만 본다", () => {
			const player = connect("게스트", { isGuest: true });
			joinRoom(player, 1);
			sendCard(player, { type: "close" });
			assert.equal(hasCard(player), false);

			send(player, { type: "quit" });
			joinRoom(player, 1);

			assert.equal(hasCard(player), false, "게스트에게 안내가 다시 떴습니다");
		});

		it("대기실 안내판에 부딪히면 안내를 다시 볼 수 있다", () => {
			// 안내는 한 번만 뜨므로, 넘긴 사람이 규칙을 다시 읽을 통로가 필요하다.
			// 맵 에디터의 param1 문자열이 이 배선의 유일한 입력이다.
			const player = connect("경험자", { storage: JSON.stringify({ exp: 0, playCount: 5 }) });
			joinRoom(player, 1);
			assert.equal(hasCard(player), false);

			touchObject(player, MapTrigger.GUIDE_BOARD);

			const init = cardWidget(player).messages[0] as { nav: string };
			assert.equal(init.nav, "steps");
		});

		it("대기실의 📖 버튼은 직업 도감을 연다", () => {
			const player = connect("구경꾼", { storage: JSON.stringify({ exp: 0, playCount: 3 }) });
			send(player, { type: "book" });

			const init = cardWidget(player).messages[0] as { nav: string; cards: unknown[] };
			assert.equal(init.nav, "grid");
			// 장수를 숫자로 적지 않는다. 여기가 보는 것은 "도감이 통째로 갔는가"이지
			// 도감이 몇 장인가가 아니다. 도감 자체의 완전성은 domain.test.ts가 본다
			assert.equal(init.cards.length, roleBook().length);
		});
	});

	/**
	 * 직업 공개 중에는 직업 카드만 남는다.
	 *
	 * 카드는 메인 위젯과 다른 슬롯이라, 대기실 화면을 닫지 않으면 준비 버튼이
	 * 달린 대기실이 카드 뒤에 그대로 남는다. 같은 순간에 재접속한 사람은
	 * (showPhaseView가 카드만 연다) 그 화면이 없으므로 둘이 갈렸다.
	 */
	it("직업 공개 중에는 대기실 화면이 남지 않는다", () => {
		const players = startGame(MIN_PLAYERS);

		for (const player of players) {
			assert.ok(cardWidget(player), "직업 카드가 열리지 않았습니다");
			assert.equal(
				findMainWidget(player),
				undefined,
				"직업 공개 중에 대기실 화면이 뒤에 남아 있습니다"
			);
		}
	});

	/**
	 * 대기실 버튼도 채팅과 같은 도배 경로다.
	 *
	 * 참가·퇴장은 방 전원의 채팅에 🚪 알림을 남기고 접속자 전원에게 방 목록을
	 * 다시 보낸다. 클릭 한 번의 값을 누른 사람이 아니라 남들이 치르는 구조라,
	 * 참가·퇴장을 반복하는 것만으로 남의 채팅을 밀어낼 수 있었다.
	 *
	 * 관문이 갈래마다가 아니라 handleMessage 하나에 있으므로, 이 테스트가
	 * 초록이면 준비·강퇴 연타도 같은 여유분에 함께 묶여 있다.
	 */
	it("대기실 버튼 연타는 여유분만큼만 통한다", () => {
		const player = connect("연타맨");
		const target = room(1);

		for (let i = 0; i < ACTION_RATE.BURST / 2; i++) {
			joinRoom(player, 1);
			send(player, { type: "quit" });
		}
		assert.equal(target.seats.length, 0);

		joinRoom(player, 1);
		assert.equal(target.seats.length, 0, "여유분이 바닥났는데도 참가가 통했습니다");

		// 벌이 아니라 브레이크다. 아무것도 하지 않아도 돌아와야 한다.
		tick(ACTION_RATE.REFILL_MS / 1000);
		joinRoom(player, 1);
		assert.equal(target.seats.length, 1, "기다렸는데도 풀리지 않았습니다");
	});
});

describe("모드별 정원", () => {
	/**
	 * 정원은 이제 방마다 다르다. 전역 MIN_PLAYERS·MAX_PLAYERS는 맵에 깔린
	 * 좌석 수(상한)로 남고, 실제로 몇 명이 앉고 몇 명부터 시작하는지는
	 * 그 방의 룰셋이 정한다.
	 */
	function fill(roomNum: number, count: number, ready = false): FakePlayer[] {
		const players: FakePlayer[] = [];
		for (let i = 0; i < count; i++) {
			const player = connect(`${roomNum}번방${i + 1}`);
			joinRoom(player, roomNum);
			if (ready) setReady(player);
			players.push(player);
		}
		return players;
	}

	it("속도전 방은 아홉 번째 사람을 앉히지 않는다", () => {
		// 9인은 firstNightPeacefulUpTo(8)를 넘긴다 — 4~8인에서 지켜지던
		// "첫 밤에는 아무도 죽지 않는다"가 9인부터 사라진다. 초보를 받으려고
		// 만든 모드에서 첫 밤에 죽는 사람이 생긴다는 뜻이다
		const target = room(6);
		fill(6, BLITZ_RULES.maxPlayers);
		assert.equal(target.seats.length, BLITZ_RULES.maxPlayers);

		const late = connect("아홉번째");
		joinRoom(late, 6);

		assert.equal(target.seats.length, BLITZ_RULES.maxPlayers, "정원을 넘겨 앉았습니다");
		assert.equal(findSeatOf(late), undefined);
	});

	it("침묵전 방은 여덟 명이 모이기 전에는 시작하지 않는다", () => {
		// 침묵전은 firstNightPeacefulUpTo가 0이다. 4명이 시작하면 첫 밤부터
		// 사람이 죽는데, 그것은 표준전이 일부러 막아 둔 것이다
		const target = room(8);
		fill(8, SILENCE_RULES.minPlayers - 1, true);

		tick(SILENCE_RULES.timing.START_COUNTDOWN + 1);
		assert.equal(target.started, false, "정원 미달인데 시작했습니다");

		const eighth = connect("여덟번째");
		joinRoom(eighth, 8);
		setReady(eighth);
		tick(SILENCE_RULES.timing.START_COUNTDOWN + 1);

		assert.equal(target.started, true, "여덟 명이 모였는데 시작하지 않았습니다");
	});

	it("표준전 방의 정원은 전역 상수와 그대로 같다", () => {
		// 1~5번 방은 이 슬라이스에서 한 톨도 바뀌면 안 된다. 좌석 배치가
		// MAX_PLAYERS개로 깔려 있으므로, 이 동일성이 깨지면 정원이 좌석보다 커진다
		assert.equal(STANDARD_RULES.minPlayers, MIN_PLAYERS);
		assert.equal(STANDARD_RULES.maxPlayers, MAX_PLAYERS);
	});

	it("표준전 방은 열두 명까지 앉고 네 명이면 시작한다", () => {
		const full = room(3);
		fill(3, MAX_PLAYERS);
		assert.equal(full.seats.length, MAX_PLAYERS);

		const late = connect("열세번째");
		joinRoom(late, 3);
		assert.equal(full.seats.length, MAX_PLAYERS, "정원을 넘겨 앉았습니다");

		startGame(MIN_PLAYERS, 2);
		assert.equal(room(2).started, true, "네 명으로는 시작하지 못했습니다");
	});

	/**
	 * 화면이 서버와 같은 정원을 본다.
	 *
	 * 서버만 방별 정원을 알던 동안 8번 방(침묵전)은 네 명이 전원 준비하면
	 * "곧 시작합니다."를 띄운 채 영원히 시작하지 않았다 — 위젯은 접속할 때
	 * 한 번 받은 전역 4/12만 알고 있었기 때문이다. 테스트는 HTML을 그릴 수
	 * 없으므로 화면이 그 문장을 쓰는 근거, 즉 서버가 보낸 payload를 본다.
	 */
	describe("대기실 화면이 받는 정원", () => {
		/** 이 사람의 대기실 위젯이 마지막으로 받은 좌석 목록 */
		function lastInit(player: FakePlayer): Record<string, unknown> {
			const init = mainWidget(player).lastOfType("init");
			assert.ok(init, `${player.name}이(가) 좌석 목록을 받지 못했습니다`);
			return init;
		}

		it("침묵전 방은 여덟 명 하한을 화면에도 보낸다", () => {
			const waiting = fill(8, SILENCE_RULES.minPlayers - 1, true);
			const init = lastInit(waiting[0]);

			assert.equal(init.minPlayers, 8);
			// lobby.html의 #note는 list.length >= min일 때만 "곧 시작합니다."를
			// 쓴다. 일곱 명까지는 그 조건에 닿지 않아야 한다
			assert.ok(
				(init.data as unknown[]).length < (init.minPlayers as number),
				"일곱 명뿐인데 화면이 시작을 예고합니다",
			);
		});

		it("속도전 방은 여덟 명 정원을 화면에도 보낸다", () => {
			const init = lastInit(fill(6, 2)[0]);
			assert.equal(init.minPlayers, 4);
			assert.equal(init.maxPlayers, 8);
		});

		it("표준전 방은 전역 상수를 그대로 보낸다", () => {
			const init = lastInit(fill(1, 2)[0]);
			assert.equal(init.minPlayers, MIN_PLAYERS);
			assert.equal(init.maxPlayers, MAX_PLAYERS);
		});

		it("방 목록은 방마다 다른 정원을 싣는다", () => {
			// 전역 최댓값 하나로 그리면 8명 찬 속도전 방이 "8/12"로 보인다 —
			// 눌러도 "방이 가득 찼습니다."로 튕기는 버튼이다
			const watcher = connect("구경꾼");
			const counts = mainWidget(watcher).lastOfType("updatePlayerCount");
			assert.ok(counts, "방 목록을 받지 못했습니다");
			const rooms = counts.data as { [num: string]: { max: number } };

			assert.equal(rooms["1"].max, 12, "표준전");
			assert.equal(rooms["6"].max, 8, "속도전");
			assert.equal(rooms["8"].max, 12, "침묵전");
		});
	});
});

describe("밤 단계", () => {
	it("밤 화면은 남은 시간과 인원을 담아 열린다", () => {
		// 밤에 할 일이 없는 직업이 필요하다. 무작위 덱에서 찾지 않고 앉힌다
		startGame(MIN_PLAYERS, 1, [Role.POLITICIAN, Role.MAFIA, Role.DOCTOR, Role.POLICE]);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT

		assert.equal(target.phase, GamePhase.NIGHT);

		// 능력이 없는 직업(정치인)이 보는 화면
		const politician = seatsWithRole(target, Role.POLITICIAN)[0];
		const widget = mainWidget(playerOf(politician));

		// 밤과 아침은 같은 파일이다. 어느 쪽인지는 payload의 phase가 정한다
		assert.equal(widget.fileName, WidgetFile.PHASE);
		// 마지막 메시지가 아니라 "열릴 때 받은 것"을 본다. 단계 화면은 열린 뒤에도
		// 진행률 같은 갱신을 계속 받으므로 last()로 잡으면 무엇이 잡힐지 그때그때 다르다
		const payload = widget.lastOfType("init");
		assert.ok(payload, "밤 화면이 payload 없이 열렸습니다");
		// payload가 없으면 위젯의 타이머와 인원수가 초기 HTML 상태로 멈춘다
		assert.equal(payload.phase, "night");
		assert.equal(payload.total, MIN_PLAYERS);
		assert.equal(payload.aliveCount, MIN_PLAYERS);
		// 룰셋의 NIGHT가 아니라 방의 시계와 맞춘다. 단계 앞에 전환 컷이 붙으면서
		// 단계 길이가 상수보다 길어졌고, 화면이 봐야 하는 것은 늘어난 쪽이다
		assert.equal(payload.timer, target.phaseTimer);
		assert.ok(payload.timer > STANDARD_RULES.timing.NIGHT, "컷이 단계 시간을 늘리지 않았습니다");
		// 직업 칩은 모든 화면에 실린다. 자기 능력을 확인할 곳이 여기뿐이다
		assert.equal(payload.role, "정치인");
	});

	it("마피아에게는 지목 위젯이, 생존자 목록과 함께 열린다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target);

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const widget = mainWidget(playerOf(mafia));

		assert.equal(widget.fileName, WidgetFile.ROLE_ACTION);
		// 지목 화면은 열리자마자 진행률(progress)을 한 줄 더 받는다. 여는 payload는
		// init 하나뿐이므로 그것을 집어서 본다
		const payload = widget.lastOfType("init");
		assert.ok(payload);
		assert.equal(payload.myNum, mafia.index);
		// 번호만 보내던 시절에는 화면에 1~8만 있고 이름이 없었다. 이제 이름이 온다
		const seats = payload.seats as Array<{ num: number; name: string }>;
		assert.deepEqual(
			seats.map(seat => seat.num),
			[1, 2, 3, 4]
		);
		assert.ok(
			seats.every(seat => seat.name.length > 0),
			"지목 격자에 이름이 비어 있습니다"
		);
	});

	/**
	 * 사망이 걸린 밤 테스트는 둘째 밤에서 본다.
	 *
	 * 4인 판의 첫 밤에는 아무도 죽지 않는다(룰셋의 firstNightPeacefulUpTo).
	 * 첫 밤에서 보면 "죽었다"도 "살렸다"도 같은 결과가 나와서, 의사 테스트는
	 * 의사가 아무 일도 하지 않아도 통과한다.
	 */
	function reachSecondNight(): ReturnType<typeof room> {
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT (첫 밤, 무사)
		passPeacefulFirstNight(target);
		return target;
	}

	it("마피아가 지목한 대상이 아침에 죽는다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = reachSecondNight();

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const victim = seatsWithRole(target, Role.CITIZEN)[0];

		send(playerOf(mafia), { type: "select", num: victim.index });
		// 클릭은 의도만 남긴다 — 좌석에 적용되는 것은 밤이 끝날 때다
		assert.deepEqual(
			target.nightIntents,
			[{ actor: mafia.index, target: victim.index }],
			"지목이 기록되지 않았습니다"
		);

		finishPhase(target); // NIGHT → 정산 → DAY

		assert.equal(victim.alive, false);
		assert.equal(target.phase, GamePhase.DAY);
	});

	it("의사가 치료한 대상은 죽지 않는다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = reachSecondNight();

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const doctor = seatsWithRole(target, Role.DOCTOR)[0];
		const victim = seatsWithRole(target, Role.CITIZEN)[0];

		send(playerOf(mafia), { type: "select", num: victim.index });
		send(playerOf(doctor), { type: "select", num: victim.index });

		finishPhase(target);

		assert.equal(victim.alive, true, "의사의 치료가 정산에 반영되지 않았습니다");
		assert.equal(target.phase, GamePhase.DAY);
	});

	it("같은 밤에 두 번 지목할 수 없다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target);

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const others = target.seats.filter(seat => seat.role !== Role.MAFIA);

		send(playerOf(mafia), { type: "select", num: others[0].index });
		send(playerOf(mafia), { type: "select", num: others[1].index });

		// 두 번째 클릭은 nightActionBlockedReason이 막으므로 지목이 하나만 남는다.
		// putIntent가 교체하기 때문이 아니라 애초에 두 번째가 오지 않는 것이다
		assert.deepEqual(
			target.nightIntents,
			[{ actor: mafia.index, target: others[0].index }],
			"능력을 두 번 썼습니다"
		);
	});

	/**
	 * 자경단원의 총은 낮을 한 번 보낸 뒤에 나온다.
	 *
	 * 첫 밤은 아무도 아무것도 모르는 상태다. 그때 쏘는 총은 추리가 아니라
	 * 주사위이고, 빗나가면 대상과 본인이 함께 죽어 시민이 둘 사라진다.
	 * 4~7명 판이 첫 아침을 보기도 전에 끝나던 원인이 그것이었다.
	 * 왜 그 판이 끝나는지는 RoleAssignment 테스트가 지키고, 여기서는
	 * 배선만 본다 — 첫 밤엔 격자가 없고, 낮을 한 번 보내면 총이 나간다.
	 */
	it("자경단원은 첫 밤에 쏠 수 없고 둘째 밤부터 쏜다", () => {
		// 마피아 1 < 시민 4라 밤을 하나 그냥 흘려보내도 판이 끝나지 않는다
		startGame(5, 1, [Role.VIGILANTE, Role.MAFIA, Role.DOCTOR, Role.POLICE, Role.CITIZEN]);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT

		const vigilante = seatsWithRole(target, Role.VIGILANTE)[0];
		const victim = seatsWithRole(target, Role.CITIZEN)[0];

		const firstNight = mainWidget(playerOf(vigilante)).lastOfType("init");
		assert.ok(firstNight, "첫 밤 화면이 payload 없이 열렸습니다");
		assert.equal(firstNight.seats, undefined, "첫 밤에 지목 격자가 열렸습니다");
		assert.ok(
			String(firstNight.note).indexOf("첫 밤") >= 0,
			`격자를 감추면서 이유를 알리지 않았습니다: ${firstNight.note}`
		);

		finishPhase(target); // → DAY
		finishPhase(target); // → VOTE
		finishPhase(target); // → VOTE_RESULT (아무도 투표하지 않아 처형 없음)
		finishPhase(target); // → NIGHT

		const secondNight = mainWidget(playerOf(vigilante)).lastOfType("init");
		assert.ok(secondNight, "둘째 밤 화면이 payload 없이 열렸습니다");
		assert.ok(secondNight.seats, "낮을 보냈는데도 지목 격자가 열리지 않았습니다");

		send(playerOf(vigilante), { type: "select", num: victim.index });
		assert.deepEqual(
			target.nightIntents,
			[{ actor: vigilante.index, target: victim.index }],
			"둘째 밤의 사살이 기록되지 않았습니다"
		);
	});

	it("6인 판의 첫 밤에는 아무도 죽지 않는다", () => {
		const players = startPlainGame(6);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT

		// 밤이 시작될 때 미리 알린다. 이 안내가 없으면 마피아는 자기 지목이
		// 실패했다고 믿고 시민은 의사가 막은 줄 알아, 양쪽 다 없는 정보를
		// 추리에 넣는다. 아침 보고("아무도 죽지 않았습니다")와는 다른 줄이다
		assert.ok(
			chatSaw(players[0], "첫 밤에는 아무도 죽지 않습니다"),
			"첫 밤 안내가 시민에게 오지 않았습니다"
		);
		assert.ok(
			chatSaw(playerOf(seatsWithRole(target, Role.MAFIA)[0]), "첫 밤에는 아무도 죽지 않습니다"),
			"첫 밤 안내가 마피아에게 오지 않았습니다"
		);

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const victim = seatsWithRole(target, Role.CITIZEN)[0];
		send(playerOf(mafia), { type: "select", num: victim.index });
		finishPhase(target); // NIGHT → 정산 → DAY

		assert.equal(target.seats.filter(seat => !seat.alive).length, 0);
		assert.ok(chatSaw(players[0], "아무도 죽지 않았습니다"));
	});

	it("첫 밤 무사여도 군인의 방탄은 남는다", () => {
		startGame(6, 1, [
			Role.MAFIA,
			Role.DOCTOR,
			Role.POLICE,
			Role.SOLDIER,
			Role.CITIZEN,
			Role.CITIZEN,
		]);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT

		const soldier = seatsWithRole(target, Role.SOLDIER)[0];
		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		send(playerOf(mafia), { type: "select", num: soldier.index });
		finishPhase(target); // NIGHT → 정산 → DAY

		// 방탄을 소모했다면 군인은 다음 밤에 그냥 죽는다
		assert.equal(soldier.armored, true);
	});

	it("첫 밤이 무사여도 기자의 특종은 아침에 나간다", () => {
		// 첫 밤 무사가 조기 반환이던 시절에는 그 반환 직전에 publishScoops를
		// 한 번 더 불러서 지켰다. 지금은 취재가 AFTER step이라 공격을 건너뛰는
		// 것과 무관하게 지나간다 — 두 경로가 같은 결과를 낸다는 것을 못 박는다.
		// 사망 정산을 건너뛰면서 특종까지 함께 떨어뜨리면 여기서 걸린다.
		startGame(5, 1, [Role.REPORTER, Role.MAFIA, Role.DOCTOR, Role.POLICE, Role.CITIZEN]);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT (첫 밤, 무사)

		const reporter = seatsWithRole(target, Role.REPORTER)[0];
		const scooped = seatsWithRole(target, Role.MAFIA)[0];

		send(playerOf(reporter), { type: "select", num: scooped.index });
		finishPhase(target); // NIGHT → 정산 → DAY

		assert.ok(
			target.nightReport.some(line => line.indexOf("특종") >= 0 && line.indexOf(scooped.name) >= 0),
			`특종이 아침 기록에 없습니다: ${target.nightReport.join(" / ")}`
		);
		assert.equal(scooped.alive, true, "첫 밤은 무사인데 누군가 죽었습니다");
	});

	it("밤이 아닌 때 온 지목은 무시한다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // NIGHT

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const widget = mainWidget(playerOf(mafia));
		const victim = target.seats.filter(seat => seat.role !== Role.MAFIA)[0];

		finishPhase(target); // → DAY. 밤 위젯은 닫혔지만 조작된 메시지는 올 수 있다
		widget.emit(playerOf(mafia), { type: "select", num: victim.index });

		// 좌석의 attackedBy로는 볼 수 없다 — 밤에 들어온 지목도 정산 전에는
		// 좌석을 건드리지 않으므로 그 단언은 무엇이 오든 통과한다
		assert.deepEqual(target.nightIntents, [], "낮에 들어온 지목이 처리됐습니다");
	});
});

describe("투표", () => {
	/** 밤을 아무 일 없이 넘기고 투표까지 진행한다 */
	function reachVote(): ReturnType<typeof room> {
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // NIGHT → DAY
		finishPhase(target); // DAY → VOTE
		assert.equal(target.phase, GamePhase.VOTE);
		return target;
	}

	it("최다 득표자가 처형된다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = reachVote();

		// 마피아를 처형하면 그 자리에서 판이 끝나 처형 자체를 보기 어렵다
		const victim = seatsWithRole(target, Role.CITIZEN)[0];
		for (const seat of target.seats) {
			if (seat.index === victim.index) continue;
			vote(playerOf(seat), victim.index);
		}

		finishPhase(target); // VOTE → VOTE_RESULT (집계와 처형이 여기서 일어난다)

		assert.equal(target.phase, GamePhase.VOTE_RESULT);
		assert.equal(victim.alive, false);
	});

	/**
	 * 처형당한 본인이 개표 화면을 본다.
	 *
	 * 이 판에서 가장 중요한 화면을 정작 당사자만 못 보던 자리다. 개표 화면을
	 * 전원에게 연 직후 kill()이 그 사람의 메인 위젯을 닫아버려서, 처형당한
	 * 사람은 7초 내내 빈 화면을 봤다. 같은 순간에 재접속한 사람은 제대로
	 * 받았다 — "머물러 있으면 못 보고 끊었다 들어오면 보인다"는 어긋남이
	 * 이게 의도가 아니라는 증거다.
	 */
	it("처형당한 사람도 개표 화면을 그대로 본다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = reachVote();

		const victim = seatsWithRole(target, Role.CITIZEN)[0];
		for (const seat of target.seats) {
			if (seat.index === victim.index) continue;
			vote(playerOf(seat), victim.index);
		}

		finishPhase(target); // VOTE → VOTE_RESULT

		const result = mainWidget(playerOf(victim)).lastOfType("result");
		assert.ok(result, "처형당한 사람의 개표 화면이 payload 없이 열렸습니다");
		assert.equal(result.executed, victim.index, "본인이 처형됐다는 사실이 화면에 없습니다");
	});

	it("같은 사람이 두 번 투표해도 한 표만 들어간다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = reachVote();

		const voter = target.seats[0];
		const victim = target.seats[1];

		vote(playerOf(voter), victim.index);
		vote(playerOf(voter), victim.index);

		assert.equal(victim.voteCount, 1, "위젯을 조작하면 표를 무제한으로 넣을 수 있습니다");
	});

	it("동률이면 아무도 처형되지 않는다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = reachVote();

		const [first, second] = target.seats;
		vote(playerOf(first), second.index);
		vote(playerOf(second), first.index);

		finishPhase(target);

		assert.equal(first.alive, true);
		assert.equal(second.alive, true);
	});

	it("정치인은 표를 두 배로 행사하고 처형되지 않는다", () => {
		startGame(MIN_PLAYERS, 1, [Role.POLITICIAN, Role.MAFIA, Role.DOCTOR, Role.POLICE]);
		const target = reachVote();

		const politician = seatsWithRole(target, Role.POLITICIAN)[0];
		const other = seatsWithRole(target, Role.DOCTOR)[0];

		// 정치인 1명이 몰표를 받아도 면역
		for (const seat of target.seats) {
			if (seat.index === politician.index) continue;
			vote(playerOf(seat), politician.index);
		}
		assert.equal(politician.voteCount, MIN_PLAYERS - 1);

		finishPhase(target);
		assert.equal(politician.alive, true, "정치인이 처형됐습니다");

		// 다음 투표에서 정치인의 표는 2로 계산된다
		finishPhase(target); // VOTE_RESULT → NIGHT
		finishPhase(target); // NIGHT → DAY
		finishPhase(target); // DAY → VOTE
		vote(playerOf(politician), other.index);
		assert.equal(other.voteCount, 2);
	});

	it("죽은 사람은 투표할 수 없다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);
		// 첫 밤에는 아무도 죽지 않으므로 유령은 둘째 밤에 나온다
		finishPhase(target); // ROLE_REVEAL → NIGHT (첫 밤, 무사)
		passPeacefulFirstNight(target);

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const victim = seatsWithRole(target, Role.CITIZEN)[0];
		send(playerOf(mafia), { type: "select", num: victim.index });

		finishPhase(target); // → DAY (victim 사망)
		finishPhase(target); // → VOTE
		assert.equal(victim.alive, false, "지목 대상이 죽지 않았습니다");

		const ghost = playerOf(victim);
		vote(ghost, mafia.index);

		assert.equal(mafia.voteCount, 0, "유령의 표가 집계에 들어갔습니다");
	});

	/**
	 * 접속이 끊긴 사람은 진행률 분모에서도 빠진다.
	 *
	 * 채워질 수 없는 칸을 남겨두면 "아직 안 낸 사람이 있다"가 투표 시간
	 * 내내 떠서, 남은 사람들이 이미 다 냈는데도 서로를 기다린다. 자격(canVote)이
	 * 아니라 지금 낼 수 있는가를 묻는 자리라 조건이 하나 더 붙는다.
	 */
	it("접속이 끊긴 사람은 투표 진행률 분모에서 빠진다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = reachVote();

		const gone = target.seats[0];
		const voter = target.seats[1];
		disconnect(playerOf(gone));
		assert.equal(gone.connected, false, "이탈이 좌석에 반영되지 않았습니다");

		vote(playerOf(voter), target.seats[2].index);

		const progress = mainWidget(playerOf(voter)).lastOfType("progress");
		assert.ok(progress, "투표 진행률이 전달되지 않았습니다");
		assert.equal(progress.voted, 1);
		assert.equal(
			progress.alive,
			MIN_PLAYERS - 1,
			"끊긴 사람이 분모에 남아 진행률이 100%에 닿을 수 없습니다"
		);
	});
});

describe("승패와 대기실 복귀", () => {
	it("마피아를 처형하면 시민이 이기고 방이 비워진다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // NIGHT
		finishPhase(target); // DAY
		finishPhase(target); // VOTE

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		for (const seat of target.seats) {
			if (seat.index === mafia.index) continue;
			vote(playerOf(seat), mafia.index);
		}

		finishPhase(target); // VOTE → VOTE_RESULT (마피아 처형)
		assert.equal(mafia.alive, false);

		finishPhase(target); // VOTE_RESULT → 승패 판정
		assert.equal(target.phase, GamePhase.GAME_OVER);

		// 승리 화면과 전원 직업 공개.
		// 진영별로 파일이 따로 있던 시절에는 파일명이 곧 승자였다. 이제
		// 파일은 하나이고 승자는 payload가 말한다 — 진영을 추가해도 파일은 그대로다
		const survivor = playerOf(target.seats.filter(seat => seat.alive)[0]);
		const over = mainWidget(survivor);
		assert.equal(over.fileName, WidgetFile.GAME_OVER);
		const result = over.lastOfType("init");
		assert.ok(result, "종료 화면이 payload 없이 열렸습니다");
		assert.equal(result.winner, Team.CITIZEN);
		// 전원 직업 공개는 채팅이 아니라 화면에 남는다
		assert.equal((result.players as unknown[]).length, MIN_PLAYERS);
		assert.ok(
			chatSaw(survivor, "전원의 직업"),
			"종료 시 직업 공개가 없습니다"
		);
		/*
		 * 표는 문자열이 아니라 구조로 내려간다.
		 *
		 * 문자열로 이어 붙이던 동안에는 마피아였는지 시민이었는지 색으로
		 * 가를 방법이 없었다 — 판이 끝난 순간 가장 먼저 보고 싶은 것이
		 * 그건데도. 다시 join("\n")으로 돌아가면 여기서 걸린다.
		 */
		const reveal = chatLines(survivor).filter(line => line.text === "🔎 전원의 직업")[0];
		assert.ok(reveal, "직업 공개 줄을 찾지 못했습니다");
		assert.equal(reveal.rows.length, MIN_PLAYERS);
		assert.equal(
			reveal.rows.filter(row => row.tone === Team.MAFIA).length,
			1,
			"표에 팀 색이 실려 있지 않습니다"
		);
		// 처형당한 마피아는 흐리게 그려진다. 죽었다고 표에서 지우지는 않는다
		assert.deepEqual(
			reveal.rows.filter(row => row.dim).map(row => row.tone),
			[Team.MAFIA]
		);
		// ZEP 기본 채팅으로는 한 글자도 나가지 않는다. 이 게임의 모든 문장은
		// 채팅 위젯을 지난다 — 여기가 무너지면 밤 채팅 격리도 함께 무너진다.
		assert.equal(
			survivor.chat.length,
			0,
			"ZEP 기본 채팅(player.sendMessage)이 아직 쓰이고 있습니다"
		);

		finishPhase(target); // GAME_OVER → 대기실
		assert.equal(target.started, false);
		assert.equal(target.phase, GamePhase.LOBBY);
		assert.equal(target.seats.length, 0);

		// 전원이 대기실 위젯으로 돌아왔다
		for (const player of players) {
			assert.equal(mainWidget(player).fileName, WidgetFile.LOBBY);
			assert.equal(player.moveSpeed, 80);
			assert.equal(player.hidden, false);
		}
	});

	/**
	 * 판이 끝나면 아바타도 대기실로 돌아온다.
	 *
	 * 방으로 들어가는 이동은 첫 밤(beginNightStage → seatPlayer)에만 일어나는데
	 * 되돌리는 쪽은 이름·스프라이트·이동속도만 복구했다. 그래서 종료 뒤에는
	 * 대기실 위젯을 든 채로 방금 끝난 방 좌석에 그대로 서 있었다 — 화면은
	 * 대기실인데 몸은 방 안이라, 위젯으로 다른 방에 참가해도 여전히 옛 방
	 * 좌석에 서 있게 된다. 다음 판 첫 밤의 seatPlayer가 결국 다시 옮겨줘서
	 * 증상이 자기 자신을 지웠고, 그래서 오래 남아 있었다.
	 */
	it("게임이 끝나면 아바타도 대기실 구역으로 돌아온다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const target = room(1);

		finishPhase(target); // ROLE_REVEAL → NIGHT: 전원이 방 자리로 옮겨진다
		assert.ok(
			players.every(player => !inLobbyArea(player)),
			"밤이 됐는데 아직 대기실 구역에 서 있는 사람이 있습니다"
		);

		// 마피아가 이길 때까지 밤마다 시민을 하나씩 지운다
		let guard = 0;
		while (target.phase !== GamePhase.GAME_OVER && guard++ < 10) {
			if (target.phase === GamePhase.NIGHT) {
				const mafia = seatsWithRole(target, Role.MAFIA)[0];
				const victim = target.seats.filter(
					seat => seat.alive && seat.role !== Role.MAFIA
				)[0];
				send(playerOf(mafia), { type: "select", num: victim.index });
			}
			finishPhase(target);
		}
		assert.equal(target.phase, GamePhase.GAME_OVER, "게임이 끝나지 않았습니다");

		finishPhase(target); // GAME_OVER → 대기실
		assert.equal(target.phase, GamePhase.LOBBY);

		for (const player of players) {
			assert.ok(
				inLobbyArea(player),
				`${player.name} 님이 방금 끝난 방 좌석(${player.tileX}, ${player.tileY})에 그대로 서 있습니다`
			);
		}
	});

	it("마피아가 시민 수 이상이 되면 마피아가 이긴다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);

		// 밤마다 시민을 하나씩 줄인다. 1:1이 되는 순간 끝난다.
		let guard = 0;
		while (target.phase !== GamePhase.GAME_OVER && guard++ < 10) {
			if (target.phase === GamePhase.NIGHT) {
				const mafia = seatsWithRole(target, Role.MAFIA)[0];
				const victim = target.seats.filter(seat => seat.alive && seat.role !== Role.MAFIA)[0];
				send(playerOf(mafia), { type: "select", num: victim.index });
			}
			finishPhase(target);
		}

		assert.equal(target.phase, GamePhase.GAME_OVER);
		const mafiaSeat = target.seats.filter(seat => seat.role === Role.MAFIA)[0];
		assert.equal(mafiaSeat.team, Team.MAFIA);
		const over = mainWidget(playerOf(mafiaSeat));
		assert.equal(over.fileName, WidgetFile.GAME_OVER);
		const result = over.lastOfType("init");
		assert.ok(result, "종료 화면이 payload 없이 열렸습니다");
		assert.equal(result.winner, Team.MAFIA);
		// 왜 끝났는지가 화면에 남는다. 예전에는 그림 한 장뿐이라 이유가 없었다
		assert.ok((result.reason as string).length > 0, "승리 이유가 비어 있습니다");
	});
});

/**
 * 단계와 단계 사이를 덮는 전환 컷.
 *
 * 배선 테스트다. "무엇을 읽히는가"(문구)가 아니라 "컷이 단계 시계와 같이
 * 도는가"를 본다 — 컷이 phaseTimer를 늘려 놓고 제때 걷히지 않으면 화면이
 * 잠긴 채로 다음 단계가 시작되고, 그 어긋남은 문구를 아무리 고쳐도 안 낫는다.
 */
describe("전환 컷", () => {
	it("게임이 시작되면 전원의 화면을 덮고, 단계가 그만큼 길어진다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);

		assert.equal(target.phase, GamePhase.ROLE_REVEAL);
		assert.ok(
			target.phaseTimer > STANDARD_RULES.timing.ROLE_REVEAL,
			"컷을 걸었는데 단계 시간이 그대로입니다"
		);

		for (const seat of target.seats) {
			const player = playerOf(seat);
			const payload = cutWidget(player).lastOfType("init");
			assert.ok(payload, `${seat.name}의 컷이 payload 없이 열렸습니다`);
			// ms가 없으면 위젯이 기본값 3초로 제 속도를 잡고, 서버가 걷는
			// 순간과 어긋나 마지막 줄이 뜨기도 전에 화면이 사라진다
			const cutMs = (target.phaseTimer - STANDARD_RULES.timing.ROLE_REVEAL) * 1000;
			assert.equal(payload.ms, Math.round(cutMs));
			assert.equal(payload.tone, "neutral");
		}
	});

	it("시간이 다 되면 컷만 걷히고 단계 화면은 남는다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);
		const player = playerOf(target.seats[0]);
		const cutLength = target.phaseTimer - STANDARD_RULES.timing.ROLE_REVEAL;

		tick(cutLength + 0.001);

		assert.equal(hasCut(player), false, "시간이 지났는데 컷이 남아 있습니다");
		assert.equal(target.phase, GamePhase.ROLE_REVEAL, "컷이 단계까지 끝냈습니다");
		// 컷은 겹쳐 뜬 네 번째 위젯 자리다. 걷힐 때 자기 것만 닫아야 하고,
		// 밑에 깔린 화면(직업 공개는 카드 슬롯을 쓴다)은 그대로 남아야 한다
		assert.equal(hasCard(player), true, "컷이 걷히면서 밑의 화면까지 닫혔습니다");
	});

	it("처형 결과가 다음 밤 컷의 첫 줄로 이어진다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // → DAY
		finishPhase(target); // → VOTE

		const victim = seatsWithRole(target, Role.CITIZEN)[0];
		for (const seat of target.seats) {
			if (seat.index === victim.index) continue;
			vote(playerOf(seat), victim.index);
		}
		finishPhase(target); // → VOTE_RESULT (처형)
		finishPhase(target); // → NIGHT

		assert.equal(target.phase, GamePhase.NIGHT);
		const payload = cutWidget(playerOf(target.seats[0])).lastOfType("init");
		assert.ok(payload, "밤 컷이 payload 없이 열렸습니다");
		assert.equal(payload.tone, "night");
		const lines = payload.lines as string[];
		// 처형은 자기 컷을 갖지 않는다. 개표 화면이 이미 7초를 쓴 뒤라
		// 같은 소식을 한 번 더 기다리게 하는 대신 밤 컷의 첫 줄로 얹는다
		assert.ok(
			lines.length > 0 && lines[0].indexOf(victim.name) >= 0,
			`처형 결과가 밤 컷에 실리지 않았습니다: ${JSON.stringify(lines)}`
		);
	});
});

/**
 * 밤 진행률.
 *
 * 낮의 개표 진행률과 같은 배선인데 밤은 서로가 보이지 않아서, 숫자가 틀리면
 * 아무도 눈치채지 못한 채 "아직 안 끝났나 보다" 하고 남은 시간을 흘려보낸다.
 */
describe("밤 진행률", () => {
	it("차례가 있는 사람만 세고, 지목이 확정되면 방 전원의 숫자가 오른다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const doctor = seatsWithRole(target, Role.DOCTOR)[0];
		const citizen = seatsWithRole(target, Role.CITIZEN)[0];

		// 마피아·의사·경찰 셋만 밤에 할 일이 있다. 시민은 분모에도 없다 —
		// 넣으면 절대 다 차지 않는 막대가 되어 "누가 뭉개고 있다"로 읽힌다
		const before = mainWidget(playerOf(mafia)).lastOfType("progress");
		assert.ok(before, "밤 화면이 진행률 없이 열렸습니다");
		assert.equal(before.total, MIN_PLAYERS - 1);
		assert.equal(before.acted, 0);

		send(playerOf(mafia), { type: "select", num: citizen.index });

		// 지목한 본인 화면만 바뀌면 나머지는 여전히 0을 보고 기다린다
		const after = mainWidget(playerOf(doctor)).lastOfType("progress");
		assert.ok(after, "지목 뒤 진행률이 전파되지 않았습니다");
		assert.equal(after.acted, 1);
		assert.equal(after.total, MIN_PLAYERS - 1);
	});

	/**
	 * 분모는 접속 상태를 따라 움직인다. 그런데 그 값을 다시 계산하는 계기가
	 * "누가 행동했을 때"뿐이면, 한 명이 끊긴 순간 남은 전원의 막대가 영원히
	 * 덜 찬 채로 멈춘다 — 분모에서 빼는 처리를 해두고도 결과는 같아진다.
	 */
	it("사람이 나가고 돌아오면 남은 사람의 분모도 따라 움직인다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const away = playerOf(seatsWithRole(target, Role.POLICE)[0]);

		disconnect(away);
		const shrunk = mainWidget(playerOf(mafia)).lastOfType("progress");
		assert.ok(shrunk, "이탈이 남은 사람의 진행률에 전파되지 않았습니다");
		assert.equal(shrunk.total, MIN_PLAYERS - 2, "끊긴 사람이 분모에 남아 막대가 끝까지 차지 않습니다");

		reconnect(away);
		const restored = mainWidget(playerOf(mafia)).lastOfType("progress");
		assert.ok(restored);
		assert.equal(restored.total, MIN_PLAYERS - 1, "돌아온 사람이 분모로 복귀하지 않았습니다");
	});
});
/**
 * 시민의 익명 쪽지는 클릭이 두 번이다. 대상을 고르면 격자가 잠기는 대신
 * 문구 목록이 오고, 문구를 고르는 두 번째 클릭에서야 확정된다.
 *
 * 이 배선은 도메인 테스트가 닿지 않는 자리다. recordNightIntent는 needsPhrase를
 * 옳게 내주고 NightPipeline은 noteText를 옳게 배달하지만, 그 사이에서 문구
 * 목록을 보내고 번호를 받아 noteText에 넣는 일은 전부 Night.ts가 한다.
 * 실제로 이 describe를 쓰기 전에는 돌연변이 다섯 개(문구 두 번 고르기 허용,
 * 번호 범위 검사 제거, 지목 없이 확정, phrase 종류 무시, 문구 목록 미전송)가
 * 전부 초록으로 살아남았다.
 */
describe("시민의 익명 쪽지", () => {
	/** 첫 밤부터 쓸 수 있다 — 쪽지에는 firstNightOnly도 needsPriorDay도 없다 */
	function openFirstNight() {
		startGame(5, 1, [Role.MAFIA, Role.MAFIA, Role.POLICE, Role.DOCTOR, Role.CITIZEN]);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		return {
			target,
			citizen: seatsWithRole(target, Role.CITIZEN)[0],
			police: seatsWithRole(target, Role.POLICE)[0],
			doctor: seatsWithRole(target, Role.DOCTOR)[0],
		};
	}

	it("대상을 고르면 격자가 잠기는 대신 문구 목록이 온다", () => {
		const { citizen, police } = openFirstNight();
		const widget = mainWidget(playerOf(citizen));

		send(playerOf(citizen), { type: "select", num: police.index });

		const phrases = widget.lastOfType("phrases");
		assert.ok(phrases, "문구 목록이 오지 않아 두 번째 클릭을 할 방법이 없습니다");
		assert.equal(phrases.num, police.index);
		assert.deepEqual(phrases.options, QUICK_NOTE);
		// 여기서 확정 응답까지 가면 위젯이 격자를 잠근다. 문구를 고를 화면이
		// 열리기도 전에 잠기는 셈이라 시민은 한 번뿐인 능력을 빈손으로 날린다
		assert.equal(
			widget.lastOfType("selectResponse"),
			undefined,
			"문구를 고르기 전에 지목이 확정돼 버렸습니다"
		);
	});

	it("문구를 고르면 확정되고 다음 아침에 대상에게만 도착한다", () => {
		const { target, citizen, police, doctor } = openFirstNight();
		const widget = mainWidget(playerOf(citizen));

		send(playerOf(citizen), { type: "select", num: police.index });
		send(playerOf(citizen), { type: "phrase", index: 1 });

		const confirmed = widget.lastOfType("selectResponse");
		assert.ok(confirmed, "문구를 골랐는데 확정 응답이 없어 화면이 열린 채 남습니다");
		assert.equal(confirmed.num, police.index);

		finishPhase(target); // NIGHT → 정산 → DAY

		const line = `✉️ 익명 쪽지: ${QUICK_NOTE[1]}`;
		assert.ok(chatSaw(playerOf(police), line), "쪽지가 대상에게 도착하지 않았습니다");
		assert.equal(chatSaw(playerOf(doctor), line), false, "쪽지가 제3자에게 샜습니다");
		assert.equal(citizen.usesSpent, 1, "보냈는데 사용 횟수가 줄지 않았습니다");
	});

	it("문구는 한 번만 고를 수 있다", () => {
		const { target, citizen, police } = openFirstNight();

		send(playerOf(citizen), { type: "select", num: police.index });
		send(playerOf(citizen), { type: "phrase", index: 0 });
		// 두 번째 문구가 먹히면 밤이 끝날 때까지 문구를 바꿔가며 고를 수 있다.
		// 확정이 되돌려지는 능력은 한 번뿐인 능력이 아니다
		send(playerOf(citizen), { type: "phrase", index: 3 });

		finishPhase(target);

		assert.ok(
			chatSaw(playerOf(police), `✉️ 익명 쪽지: ${QUICK_NOTE[0]}`),
			"처음 고른 문구가 사라졌습니다"
		);
		assert.equal(
			chatSaw(playerOf(police), `✉️ 익명 쪽지: ${QUICK_NOTE[3]}`),
			false,
			"나중에 온 문구가 처음 것을 덮어썼습니다"
		);
	});

	it("목록에 없는 번호는 한 번뿐인 능력을 태우지 않는다", () => {
		const { target, citizen, police } = openFirstNight();

		send(playerOf(citizen), { type: "select", num: police.index });
		// 위젯이 보내는 값이라 조작될 수 있다. 범위를 안 보면 noteText가
		// 빈 값이 된 채 usedSkill만 켜져서, 아무것도 도착하지 않았는데
		// 시민은 이미 다 쓴 상태가 된다
		send(playerOf(citizen), { type: "phrase", index: QUICK_NOTE.length });
		send(playerOf(citizen), { type: "phrase", index: 2 });

		finishPhase(target);

		assert.ok(
			chatSaw(playerOf(police), `✉️ 익명 쪽지: ${QUICK_NOTE[2]}`),
			"범위 밖 번호가 한 번뿐인 능력을 태워버렸습니다"
		);
	});

	it("지목보다 먼저 온 문구는 아무것도 정하지 못한다", () => {
		const { target, citizen, police } = openFirstNight();

		// 대상은 서버가 갖고 있다. 지목 없이 문구만 오는 순서는 정상 화면에서
		// 나올 수 없으므로 무시해야 한다 — 받아들이면 그 자리에서 능력이
		// 소모되어, 정작 보내려던 사람에게는 보낼 수 없게 된다
		send(playerOf(citizen), { type: "phrase", index: 0 });
		send(playerOf(citizen), { type: "select", num: police.index });
		send(playerOf(citizen), { type: "phrase", index: 4 });

		finishPhase(target);

		assert.ok(
			chatSaw(playerOf(police), `✉️ 익명 쪽지: ${QUICK_NOTE[4]}`),
			"지목 전에 온 문구가 능력을 먼저 태워버렸습니다"
		);
	});

	/*
	 * 지난밤 문구는 밤이 시작될 때 지워진다(resetRound). 그 한 줄이 없으면
	 * 다음 밤에 대상만 새로 찍어도 옛 문구가 클릭 없이 날아간다.
	 *
	 * 닿는 길이 있다는 것이 핵심이다. 쪽지는 대상이 그 밤에 죽으면 환불되므로
	 * (usesSpent가 안 오른다) 시민에게 다음 밤 차례가 그대로 남고, putIntent는
	 * 첫 클릭에서 이미 일어난다 — 즉 그 밤에 문구를 고르지 않아도 지목은
	 * 성립한다. 이론적 방어가 아니라 평범한 판에서 나오는 순서다.
	 */
	it("지난밤 문구는 다음 밤으로 넘어가지 않는다", () => {
		// 5인은 시민 하나가 죽으면 2:2로 판이 끝난다. 사람이 죽어야 하는
		// 시나리오라 판이 살아남는 7인으로 짠다
		startGame(7, 1, [
			Role.MAFIA,
			Role.POLICE,
			Role.DOCTOR,
			Role.CITIZEN,
			Role.POLITICIAN,
			Role.SOLDIER,
			Role.SHAMAN,
		]);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		passPeacefulFirstNight(target); // 첫 밤은 무사라 사람이 죽지 않는다

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const citizen = seatsWithRole(target, Role.CITIZEN)[0];
		const victim = seatsWithRole(target, Role.POLITICIAN)[0];
		const nextTarget = seatsWithRole(target, Role.SHAMAN)[0];

		// 둘째 밤: 쪽지를 끝까지 확정하고, 그 대상을 마피아가 죽인다
		send(playerOf(citizen), { type: "select", num: victim.index });
		send(playerOf(citizen), { type: "phrase", index: 1 });
		send(playerOf(mafia), { type: "select", num: victim.index });
		finishPhase(target); // NIGHT → 정산 → DAY

		// 전제를 못박는다. 대상이 살아 있으면 쪽지가 배달되면서 환불이 없고,
		// 그러면 셋째 밤에 차례가 없어 아래 단언이 빈 밤을 보고 통과한다
		assert.equal(victim.alive, false, "쪽지 대상이 둘째 밤에 죽지 않았습니다");
		assert.equal(citizen.usesSpent, 0, "죽은 대상에게 보낸 쪽지가 환불되지 않았습니다");

		finishPhase(target); // → VOTE
		finishPhase(target); // → VOTE_RESULT (아무도 투표하지 않아 처형 없음)
		finishPhase(target); // → NIGHT (셋째 밤)
		assert.equal(target.phase, GamePhase.NIGHT, "셋째 밤에 도착하지 못했습니다");

		// 셋째 밤: 대상만 새로 찍고 문구는 고르지 않는다
		send(playerOf(citizen), { type: "select", num: nextTarget.index });
		finishPhase(target); // NIGHT → 정산 → DAY

		assert.equal(
			chatSaw(playerOf(nextTarget), `✉️ 익명 쪽지: ${QUICK_NOTE[1]}`),
			false,
			"지난밤에 고른 문구가 클릭 없이 다시 날아갔습니다"
		);
	});
});
/**
 * 밤에 알아낸 것이 실제로 그 사람 손에 들어가는가.
 *
 * 조사 답을 클릭 시점에서 아침으로 옮기면서 "만드는 쪽"(NightPipeline)과
 * "배달하는 쪽"(GameFlow → deliverNightReveals)이 갈라졌다. 도메인 테스트는
 * 앞쪽만 본다 — 뒤쪽은 루프를 통째로 지워도, 승패 판정 뒤로 옮겨도 전부
 * 초록이었다. 이 describe가 덮는 것은 그 사이의 배선이다.
 */
describe("밤에 알아낸 것의 배달", () => {
	/**
	 * 이번 밤에 판이 끝나도록 짜인 판.
	 *
	 * 5명(마피아 2 : 시민 3)에서 시민 하나가 죽으면 2:2가 되어 마피아가 이긴다.
	 * 첫 밤은 무사한 밤이므로 한 바퀴를 돌고 나서 두 번째 밤을 쓴다.
	 */
	function reachDecisiveNight() {
		startGame(5, 1, [Role.MAFIA, Role.MAFIA, Role.POLICE, Role.DOCTOR, Role.CITIZEN]);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT (첫 밤, 무사)
		passPeacefulFirstNight(target);

		const mafias = seatsWithRole(target, Role.MAFIA);
		return {
			target,
			killer: mafias[0],
			accomplice: mafias[1],
			police: seatsWithRole(target, Role.POLICE)[0],
			victim: seatsWithRole(target, Role.CITIZEN)[0],
		};
	}

	/**
	 * 답이 아침으로 밀려난 뒤로, 마지막 밤의 조사는 "판이 끝났으니 없던 일"이
	 * 되기 쉬운 자리에 놓였다. 승패 판정이 먼저 돌면 배달 코드는 도달조차
	 * 하지 않는데, 도메인은 답을 옳게 만들었으므로 아무도 빨개지지 않는다.
	 * 확인하고 죽은 경찰에게는 그 답이 마지막으로 남길 말이기도 하다.
	 */
	it("마지막 밤에 판이 끝나도 조사한 사람은 답을 받는다", () => {
		const { target, killer, accomplice, police, victim } = reachDecisiveNight();

		send(playerOf(killer), { type: "select", num: victim.index });
		send(playerOf(police), { type: "select", num: accomplice.index });
		finishPhase(target); // NIGHT → 정산 → 승패

		// 판이 정말 이 밤에 끝났는지부터 못박는다. 안 끝나면 이 테스트는
		// 평범한 아침 배달을 확인하는 것이 되어 회귀를 못 잡는다
		assert.equal(target.phase, GamePhase.GAME_OVER, "이 밤에 판이 끝나지 않았습니다");
		assert.equal(target.winner, Team.MAFIA);

		assert.ok(
			chatSaw(playerOf(police), `🔍 ${accomplice.index}번 참가자는 마피아입니다!`),
			"판이 끝났다고 조사 답이 사라졌습니다"
		);
	});

	/** 답은 조사한 사람의 것이다. 한 명에게라도 더 가면 그 밤의 정보가 공짜가 된다 */
	it("조사 답은 조사한 사람에게만 간다", () => {
		const { target, killer, accomplice, police, victim } = reachDecisiveNight();

		send(playerOf(killer), { type: "select", num: victim.index });
		send(playerOf(police), { type: "select", num: accomplice.index });
		finishPhase(target);

		const answer = `🔍 ${accomplice.index}번 참가자는 마피아입니다!`;
		assert.ok(chatSaw(playerOf(police), answer));

		for (const seat of target.seats) {
			if (seat === police) continue;
			assert.equal(
				chatSaw(playerOf(seat), answer),
				false,
				`${seat.index}번이 남의 조사 답을 봤습니다`
			);
		}
	});

	/**
	 * 스파이가 마피아를 찾아내면 그 밤에 진영이 바뀐다. 바뀐 진영은 승패
	 * 계산에만 쓰이는 숫자가 아니라 "밀담이 열린다"는 게임 안의 사건이고,
	 * 그 사건을 사람이 알게 되는 통로는 마피아 채널의 안내 한 줄뿐이다.
	 * 안내를 지워도 team 필드는 멀쩡하므로 도메인 테스트로는 잡히지 않는다.
	 */
	it("스파이가 합류하면 마피아 채널에 안내가 뜨고 본인에게 밀담 탭이 열린다", () => {
		startGame(5, 1, [Role.MAFIA, Role.SPY, Role.DOCTOR, Role.POLICE, Role.CITIZEN]);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		// 스파이는 낮 이야기를 듣고 나서야 쓸 수 있다(needsPriorDay)
		passPeacefulFirstNight(target);

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const spy = seatsWithRole(target, Role.SPY)[0];
		const citizen = seatsWithRole(target, Role.CITIZEN)[0];

		// 마피아는 지목하지 않는다. 아무도 죽지 않아야 판이 이어지고,
		// 합류한 뒤의 화면을 볼 수 있다
		send(playerOf(spy), { type: "select", num: mafia.index });
		finishPhase(target); // NIGHT → 정산 → DAY

		assert.equal(target.phase, GamePhase.DAY, "판이 끝나버려 합류 이후를 볼 수 없습니다");
		assert.equal(spy.team, Team.MAFIA);

		const notice = `${playerOf(spy).name}(스파이)님이 마피아 채팅에 합류했습니다`;
		assert.ok(chatSaw(playerOf(mafia), notice), "마피아가 합류 사실을 모릅니다");
		assert.ok(
			chatLines(playerOf(spy), ChatChannel.MAFIA).some(line => line.text.indexOf(notice) >= 0),
			"스파이 본인이 마피아 채널의 안내를 받지 못했습니다"
		);
		// 안내만 오고 탭이 없으면 다음 밤에 밀담을 쓸 수 없다.
		// 쓰기 권한은 보지 않는다 — 밀담은 밤에만 열리므로 낮에는 읽기 전용이다
		assert.ok(
			chatChannels(playerOf(spy)).some(tab => tab.id === ChatChannel.MAFIA),
			"스파이에게 마피아 탭이 열리지 않았습니다"
		);
		assert.equal(
			chatSaw(playerOf(citizen), notice),
			false,
			"마피아 밀담의 안내가 시민에게 샜습니다"
		);
	});

	/**
	 * 차단의 배선 가운데 도메인 테스트가 닿지 못하는 것이 셋 있다. 통째로
	 * 빠져도 domain 쪽은 전부 통과하므로 여기서만 걸린다.
	 *
	 * 하나는 payload의 noSelf — 위젯이 자기 칸을 잠그는 값이다. 둘은 밤마다의
	 * blocked 초기화이고, 이것은 두 밤을 한 판 안에서 이어 봐야 걸린다. 한 밤만
	 * 보면 그 줄을 지워도 아무 데도 빨개지지 않는다. 셋은 아침 통보의 배달이다 —
	 * NightPipeline은 reveals 배열을 만들 뿐이고, 그것을 각자에게 실제로 보내는
	 * deliverNightReveals는 서비스 층에 있다.
	 */
	it("건달에게 막힌 밤은 답이 없고, 다음 밤은 멀쩡하다", () => {
		// 건달의 인원 하한은 8인이라 이 7인 판의 덱에는 들어오지 않는다.
		// 직업을 직접 앉혀서 본다
		startGame(7, 1, [
			Role.MAFIA,
			Role.POLICE,
			Role.THUG,
			Role.CITIZEN,
			Role.POLITICIAN,
			Role.SOLDIER,
			Role.SHAMAN,
		]);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		passPeacefulFirstNight(target); // 둘째 밤

		const thug = seatsWithRole(target, Role.THUG)[0];
		const police = seatsWithRole(target, Role.POLICE)[0];
		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const answer = `🔍 ${mafia.index}번 참가자는 마피아입니다!`;

		// 위젯이 내 칸을 잠그려면 이 한 줄이 payload에 실려야 한다. 값이 상수
		// false가 되어도 게임 규칙은 멀쩡하고 화면만 조용히 열린다
		const payload = mainWidget(playerOf(thug)).lastOfType("init");
		assert.ok(payload);
		assert.equal(payload.noSelf, true, "건달의 지목 화면이 자기 칸을 열어둔 채 열렸습니다");

		// 둘째 밤: 건달이 경찰을 막는다. 마피아는 지목하지 않아 아무도 죽지 않는다
		send(playerOf(thug), { type: "select", num: police.index });
		send(playerOf(police), { type: "select", num: mafia.index });
		finishPhase(target); // NIGHT → 정산 → DAY

		assert.equal(target.phase, GamePhase.DAY, "판이 끝나버려 다음 밤을 볼 수 없습니다");
		assert.equal(chatSaw(playerOf(police), answer), false, "막힌 경찰이 답을 받았습니다");

		// 통보는 도메인이 만들고 서비스의 deliverNightReveals가 보낸다.
		// 그 배달이 빠지면 도메인 테스트는 다 초록인 채로 아무에게도 안 간다
		assert.ok(
			chatSaw(playerOf(police), "누군가 당신을 방해해"),
			"막힌 경찰에게 방해 통보가 오지 않았습니다"
		);
		assert.ok(
			chatSaw(playerOf(thug), `${police.index}번은 어젯밤 능력을 썼고`),
			"막은 건달에게 통보가 오지 않았습니다"
		);

		// 셋째 밤으로. 아무도 투표하지 않아 처형도 없다
		finishPhase(target); // DAY → VOTE
		finishPhase(target); // VOTE → VOTE_RESULT
		finishPhase(target); // → NIGHT
		assert.equal(target.phase, GamePhase.NIGHT, "셋째 밤에 도착하지 못했습니다");
		assert.equal(police.blocked, false, "지난밤의 차단이 다음 밤까지 남았습니다");

		send(playerOf(police), { type: "select", num: mafia.index });
		finishPhase(target);
		assert.ok(chatSaw(playerOf(police), answer), "차단이 풀린 밤에도 답이 오지 않았습니다");
	});
});
