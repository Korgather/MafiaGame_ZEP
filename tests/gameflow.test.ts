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
import type { Seat } from "../src/types/Game.types.ts";
import { WidgetFile } from "../src/constants/Assets.ts";
import { MIN_PLAYERS, TIMING } from "../src/constants/GameConfig.ts";
import {
	connect,
	finishPhase,
	joinRoom,
	mainWidget,
	playerOf,
	resetWorld,
	room,
	seatOf,
	seatsWithRole,
	send,
	setReady,
	startGame,
	tick,
	vote,
} from "./helpers/Harness.ts";

// node:test는 훅에 TestContext를 넘긴다. resetWorld(seed)가 그걸 시드로
// 받아버리지 않도록 인자를 끊는다.
beforeEach(() => resetWorld());

describe("대기실 → 게임 시작", () => {
	it("접속하면 대기실 위젯이 열리고 setID에 isMobile이 들어간다", () => {
		const player = connect("모바일유저", { isMobile: true });
		const widget = mainWidget(player);

		assert.equal(widget.fileName, WidgetFile.LOBBY);
		const setId = widget.lastOfType("setID");
		assert.ok(setId, "setID를 받지 못했습니다");
		assert.equal(setId.id, player.id);
		// WatingRoom.html은 모바일 레이아웃 보정 전체를 이 필드로 판단한다.
		// 빠뜨리면 모바일 유저가 데스크톱 레이아웃을 본다 (실제로 있던 회귀).
		assert.equal(setId.isMobile, true);
	});

	it("최소 인원 미만이면 전원 준비해도 시작하지 않는다", () => {
		const target = room(1);
		for (let i = 0; i < MIN_PLAYERS - 1; i++) {
			const player = connect(`유저${i}`);
			joinRoom(player, 1);
			setReady(player);
		}

		tick(TIMING.START_COUNTDOWN + 1);

		assert.equal(target.started, false);
		assert.equal(target.phase, GamePhase.LOBBY);
	});

	it("전원 준비되면 카운트다운 뒤 직업이 배분된다", () => {
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
		assert.equal(seatsWithRole(target, Role.DOCTOR).length, 1);

		for (const player of players) {
			assert.equal(seatOf(player).alive, true);
			assert.match(player.title, /번 참가자$/);
		}
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
		const payload = widget.last();
		assert.ok(payload, "밤 화면이 payload 없이 열렸습니다");
		// payload가 없으면 위젯의 타이머와 인원수가 초기 HTML 상태로 멈춘다
		assert.equal(payload.phase, "night");
		assert.equal(payload.total, MIN_PLAYERS);
		assert.equal(payload.aliveCount, MIN_PLAYERS);
		assert.equal(payload.timer, TIMING.NIGHT);
		// 직업 칩은 모든 화면에 실린다. 자기 능력을 확인할 곳이 여기뿐이다
		assert.equal(payload.role, "정치인");
	});

	it("마피아에게는 지목 위젯이, 생존자 목록과 함께 열린다", () => {
		startGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target);

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const widget = mainWidget(playerOf(mafia));

		assert.equal(widget.fileName, WidgetFile.ROLE_ACTION);
		const payload = widget.last();
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

	it("마피아가 지목한 대상이 아침에 죽는다", () => {
		startGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target);

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const victim = target.seats.filter(seat => seat.role !== Role.MAFIA)[0];

		send(playerOf(mafia), { type: "select", num: victim.index });
		assert.deepEqual(victim.attackedBy, [mafia.index], "지목이 좌석에 반영되지 않았습니다");

		finishPhase(target); // NIGHT → 정산 → DAY

		assert.equal(victim.alive, false);
		assert.equal(target.phase, GamePhase.DAY);
	});

	it("의사가 치료한 대상은 죽지 않는다", () => {
		startGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target);

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const doctor = seatsWithRole(target, Role.DOCTOR)[0];
		const victim = target.seats.filter(
			seat => seat.role !== Role.MAFIA && seat.role !== Role.DOCTOR
		)[0];

		send(playerOf(mafia), { type: "select", num: victim.index });
		send(playerOf(doctor), { type: "select", num: victim.index });

		finishPhase(target);

		assert.equal(victim.alive, true, "의사의 치료가 정산에 반영되지 않았습니다");
		assert.equal(target.phase, GamePhase.DAY);
	});

	it("같은 밤에 두 번 지목할 수 없다", () => {
		startGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target);

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const others = target.seats.filter(seat => seat.role !== Role.MAFIA);

		send(playerOf(mafia), { type: "select", num: others[0].index });
		send(playerOf(mafia), { type: "select", num: others[1].index });

		assert.deepEqual(others[0].attackedBy, [mafia.index]);
		assert.deepEqual(others[1].attackedBy, [], "능력을 두 번 썼습니다");
	});

	it("밤이 아닌 때 온 지목은 무시한다", () => {
		startGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // NIGHT

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const widget = mainWidget(playerOf(mafia));
		const victim = target.seats.filter(seat => seat.role !== Role.MAFIA)[0];

		finishPhase(target); // → DAY. 밤 위젯은 닫혔지만 조작된 메시지는 올 수 있다
		widget.emit(playerOf(mafia), { type: "select", num: victim.index });

		assert.deepEqual(victim.attackedBy, [], "낮에 들어온 지목이 처리됐습니다");
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

	/**
	 * 정치인을 뺀 좌석들.
	 *
	 * 정치인은 표가 2로 계산되고 처형 면역이라 "1인 1표"·"최다 득표자 처형"의
	 * 예외다. 좌석 순서는 셔플 결과이므로 seats[0]을 그냥 쓰면 정치인이 걸렸을
	 * 때만 깨지는 테스트가 된다. 예외를 명시적으로 걷어내고 시작한다.
	 */
	function plainSeats(target: ReturnType<typeof room>): Seat[] {
		return target.seats.filter(seat => seat.role !== Role.POLITICIAN);
	}

	it("최다 득표자가 처형된다", () => {
		startGame(MIN_PLAYERS);
		const target = reachVote();

		const victim = plainSeats(target)[0];
		for (const seat of target.seats) {
			if (seat.index === victim.index) continue;
			vote(playerOf(seat), victim.index);
		}

		finishPhase(target); // VOTE → VOTE_RESULT (집계와 처형이 여기서 일어난다)

		assert.equal(target.phase, GamePhase.VOTE_RESULT);
		assert.equal(victim.alive, false);
	});

	it("같은 사람이 두 번 투표해도 한 표만 들어간다", () => {
		startGame(MIN_PLAYERS);
		const target = reachVote();

		const voter = plainSeats(target)[0];
		const victim = plainSeats(target)[1];

		vote(playerOf(voter), victim.index);
		vote(playerOf(voter), victim.index);

		assert.equal(victim.voteCount, 1, "위젯을 조작하면 표를 무제한으로 넣을 수 있습니다");
	});

	it("동률이면 아무도 처형되지 않는다", () => {
		startGame(MIN_PLAYERS);
		const target = reachVote();

		const plain = plainSeats(target);
		vote(playerOf(plain[0]), plain[1].index);
		vote(playerOf(plain[1]), plain[0].index);

		finishPhase(target);

		assert.equal(plain[0].alive, true);
		assert.equal(plain[1].alive, true);
	});

	it("정치인은 표를 두 배로 행사하고 처형되지 않는다", () => {
		startGame(MIN_PLAYERS, 1, [Role.POLITICIAN, Role.MAFIA, Role.DOCTOR, Role.POLICE]);
		const target = reachVote();

		const politician = seatsWithRole(target, Role.POLITICIAN)[0];
		const other = plainSeats(target)[0];

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
		startGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // NIGHT

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const victim = target.seats.filter(seat => seat.role !== Role.MAFIA)[0];
		send(playerOf(mafia), { type: "select", num: victim.index });

		finishPhase(target); // → DAY (victim 사망)
		finishPhase(target); // → VOTE

		const ghost = playerOf(victim);
		vote(ghost, mafia.index);

		assert.equal(mafia.voteCount, 0, "유령의 표가 집계에 들어갔습니다");
	});

	/**
	 * 건달의 협박은 한 판정(Voting.canVote)이 세 곳에서 쓰인다.
	 * 화면이 잠기는가 / 표가 거절되는가 / 진행률 분모에서 빠지는가.
	 * 셋 중 하나만 어긋나도 증상이 제각각이라(특히 분모가 어긋나면
	 * 투표 시간 내내 "아직 안 낸 사람이 있다"가 떠 있다) 한 번에 본다.
	 */
	it("협박당한 사람은 화면이 잠기고 표도 진행률도 집계되지 않는다", () => {
		// 마피아 진영 2(마피아·건달) < 시민 진영 3이라 시작하자마자 끝나지 않는다
		startGame(5, 1, [Role.THUG, Role.MAFIA, Role.DOCTOR, Role.POLICE, Role.CITIZEN]);
		const target = room(1);
		finishPhase(target); // ROLE_REVEAL → NIGHT

		const thug = seatsWithRole(target, Role.THUG)[0];
		const muted = seatsWithRole(target, Role.CITIZEN)[0];
		send(playerOf(thug), { type: "select", num: muted.index });

		finishPhase(target); // NIGHT → DAY
		assert.equal(muted.silenced, true, "협박이 좌석에 반영되지 않았습니다");
		finishPhase(target); // DAY → VOTE

		// 1. 화면: 투표 위젯이 잠긴 상태로 열린다
		const init = mainWidget(playerOf(muted)).lastOfType("init");
		assert.ok(init, "투표 화면이 payload 없이 열렸습니다");
		assert.equal(init.silenced, true);

		// 2. 표: 서버도 같은 판정으로 거절한다 (위젯을 우회해도 막혀야 한다)
		vote(playerOf(muted), thug.index);
		assert.equal(thug.voteCount, 0, "협박당한 사람의 표가 집계됐습니다");

		// 3. 진행률: 분모는 협박당한 사람을 뺀 4명이다
		vote(playerOf(seatsWithRole(target, Role.DOCTOR)[0]), thug.index);
		const progress = mainWidget(playerOf(thug)).lastOfType("progress");
		assert.ok(progress, "투표 진행률이 전달되지 않았습니다");
		assert.equal(progress.voted, 1);
		assert.equal(progress.alive, 4, "협박당한 사람이 분모에 남아 있습니다");
	});
});

describe("승패와 대기실 복귀", () => {
	it("마피아를 처형하면 시민이 이기고 방이 비워진다", () => {
		const players = startGame(MIN_PLAYERS);
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
			survivor.chat.some(line => line.includes("전원의 직업")),
			"종료 시 직업 공개가 없습니다"
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

	it("마피아가 시민 수 이상이 되면 마피아가 이긴다", () => {
		startGame(MIN_PLAYERS);
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
