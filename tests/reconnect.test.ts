/**
 * 이탈·재접속·예외 경로.
 *
 * "게임 중에 끊겨도 좌석을 남긴다"는 이번 리팩터링에서 새로 설계한 규칙이고,
 * 수동 플레이테스트로는 재현하기 가장 번거로운 경로다(둘 이상이 동시에
 * 접속을 끊어야 한다). 여기서 처음으로 실행된다.
 */
import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { GamePhase, Role, Team } from "../src/types/Game.types.ts";
import { WidgetFile } from "../src/constants/Assets.ts";
import { MIN_PLAYERS } from "../src/constants/GameConfig.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import type { ScriptPlayer } from "zep-script";
import { leave } from "../src/services/Lobby.ts";
import { finish } from "../src/services/Outcome.ts";
import type { FakePlayer, FakeWidget } from "./helpers/FakeZep.ts";
import {
	chatChannels,
	chatLines,
	connect,
	disconnect,
	findMainWidget,
	findSeatOf,
	finishPhase,
	joinRoom,
	leaveWhileStillListed,
	mainWidget,
	playerOf,
	reconnect,
	resetWorld,
	room,
	seatOf,
	seatsWithRole,
	send,
	startPlainGame,
	tick,
	vote,
} from "./helpers/Harness.ts";

beforeEach(() => resetWorld());

describe("게임 중 이탈", () => {
	it("좌석과 직업이 남아 재접속을 기다린다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const leaver = players[0];
		const seat = seatOf(leaver);
		const role = seat.role;
		const index = seat.index;

		disconnect(leaver);

		assert.equal(findSeatOf(leaver), seat, "좌석이 사라졌습니다");
		assert.equal(seat.role, role);
		assert.equal(seat.index, index);
		assert.equal(seat.connected, false);
	});

	it("ZEP이 목록에서 늦게 빼도 접속 끊김이 유지된다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const leaver = players[0];
		const seat = seatOf(leaver);

		// onLeavePlayer가 불리는 시점에 ZEP이 아직 players에서 빼지 않았을 수 있다.
		// 어느 쪽인지는 문서에 없으므로 두 순서 모두에서 결과가 같아야 한다.
		leaveWhileStillListed(leaver);

		assert.equal(
			seat.connected,
			false,
			"브로드캐스트가 끊긴 좌석을 다시 접속 중으로 되돌렸습니다"
		);
	});

	it("한 명이 끊겨도 나머지의 게임은 그대로 진행된다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const target = room(1);
		disconnect(players[0]);

		finishPhase(target); // ROLE_REVEAL → NIGHT
		finishPhase(target); // NIGHT → DAY

		assert.equal(target.phase, GamePhase.DAY);
	});

	it("끊긴 마피아가 지목하지 않아도 밤이 정상적으로 끝난다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // → NIGHT

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		disconnect(playerOf(mafia));

		finishPhase(target); // → DAY

		assert.equal(target.phase, GamePhase.DAY);
		for (const seat of target.seats) {
			assert.equal(seat.alive, true, `${seat.index}번이 죽었습니다`);
		}
	});

	it("접속 인원이 2명 미만이 되면 게임이 중단되고 대기실로 돌아간다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const target = room(1);

		disconnect(players[0]);
		disconnect(players[1]);
		disconnect(players[2]);

		tick(0.1); // 다음 프레임에 중단 판정

		assert.equal(target.started, false);
		assert.equal(target.phase, GamePhase.LOBBY);
		assert.equal(target.seats.length, 0, "방이 비워지지 않아 아무도 못 들어옵니다");
	});

	/**
	 * 게임이 시작되면 나가기 요청은 두 겹으로 막힌다.
	 *
	 * 전에는 이 테스트가 대기실 위젯으로 quit을 보냈다. 지금은 게임이
	 * 시작될 때 대기실 화면을 닫으므로 그 경로 자체가 사라졌다 — 진행 중인
	 * 방에서 대기실 핸들러(참가·준비·강퇴·나가기)에 닿는 위젯은 하나도 없다.
	 * 화면이 사라진 것에 기대지는 않는다. 위젯은 클라이언트에서 도는 코드라
	 * 조작될 수 있으므로, 서버가 직접 거절하는지를 서비스에 대고 확인한다.
	 */
	it("게임 중에는 스스로 나갈 수 없다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const seat = seatOf(players[0]);

		assert.equal(
			findMainWidget(players[0]),
			undefined,
			"게임 중인데 대기실 화면이 남아 나가기 요청이 도달합니다"
		);

		leave(players[0] as unknown as ScriptPlayer);

		assert.equal(findSeatOf(players[0]), seat, "게임 중에 좌석이 비워졌습니다");
	});
});

describe("재접속", () => {
	/**
	 * 재접속 뒤 **다시 열린** 메인 위젯.
	 *
	 * tag에는 끊기기 전 위젯의 참조가 남아 있어 fileName만 보면 그냥 통과한다.
	 * 그 위젯은 클라이언트와 함께 죽었으므로 화면에는 아무것도 없다.
	 * 살아 있는지까지 확인해야 "다시 그려줬다"를 검증하는 것이 된다.
	 */
	function freshMain(player: FakePlayer): FakeWidget {
		const widget = mainWidget(player);
		assert.equal(widget.destroyed, false, "끊기기 전의 죽은 위젯이 그대로 남아 있습니다");
		return widget;
	}

	it("같은 좌석·직업으로 돌아온다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const leaver = players[0];
		const seat = seatOf(leaver);
		const role = seat.role;

		disconnect(leaver);
		reconnect(leaver);

		assert.equal(seatOf(leaver), seat);
		assert.equal(seat.role, role);
		assert.equal(seat.connected, true);
	});

	it("밤에 돌아오면 자기 직업의 밤 화면을 다시 받는다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // → NIGHT

		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const player = playerOf(mafia);
		disconnect(player);
		reconnect(player);

		const widget = freshMain(player);
		assert.equal(widget.fileName, WidgetFile.ROLE_ACTION, "밤 능력 화면이 열리지 않았습니다");
		const init = widget.lastOfType("init");
		assert.ok(init, "init 페이로드를 받지 못했습니다");
		assert.equal(init.myNum, mafia.index);
	});

	it("낮에 돌아오면 아침 화면을 다시 받는다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // → NIGHT
		finishPhase(target); // → DAY

		const player = players[0];
		disconnect(player);
		reconnect(player);

		const widget = freshMain(player);
		assert.equal(widget.fileName, WidgetFile.PHASE);
		const payload = widget.lastOfType("init");
		assert.ok(payload, "아침 화면이 payload 없이 열렸습니다");
		assert.equal(payload.phase, "day");
	});

	it("투표 중에 돌아오면 투표 화면을 다시 받고 투표할 수 있다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // → NIGHT
		finishPhase(target); // → DAY
		finishPhase(target); // → VOTE

		const player = players[0];
		const voter = seatOf(player);
		const victim = target.seats.filter(seat => seat.index !== voter.index)[0];

		disconnect(player);
		reconnect(player);

		assert.equal(freshMain(player).fileName, WidgetFile.VOTE);
		vote(player, victim.index);
		assert.ok(victim.voteCount > 0, "재접속 후 투표가 집계되지 않았습니다");
	});

	it("직업 공개 중에 돌아오면 직업 카드를 다시 받는다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const target = room(1);
		assert.equal(target.phase, GamePhase.ROLE_REVEAL);

		const player = players[0];
		disconnect(player);
		reconnect(player);

		const tag = player.tag as { roleWidget: { destroyed: boolean } | null };
		assert.ok(tag.roleWidget, "직업 카드가 다시 열리지 않았습니다");
		assert.equal(tag.roleWidget.destroyed, false);
	});

	it("죽은 채로 돌아오면 유령 이름과 밤 화면을 받는다", () => {
		startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // → NIGHT

		// 마피아가 평범한 시민을 지목해 아침에 죽인다
		const mafia = seatsWithRole(target, Role.MAFIA)[0];
		const victim = seatsWithRole(target, Role.CITIZEN)[0];
		send(playerOf(mafia), { type: "select", num: victim.index });

		finishPhase(target); // → DAY (사망 정산)
		assert.equal(victim.alive, false, "지목 대상이 죽지 않았습니다");

		const ghost = playerOf(victim);
		disconnect(ghost);
		reconnect(ghost);

		assert.ok(ghost.name.indexOf("(유령)") >= 0, `이름이 ${ghost.name}입니다`);
		const widget = freshMain(ghost);
		assert.equal(widget.fileName, WidgetFile.PHASE);
		const payload = widget.lastOfType("init");
		assert.ok(payload, "아침 화면이 payload 없이 열렸습니다");
		assert.equal(payload.alive, false, "유령이 산 사람 화면을 보고 있습니다");
		// 밤사이 일어난 일은 채팅으로 흘러가 버린다. 화면이 들고 있어야
		// 끊겼다 돌아온 사람도 누가 죽었는지 알 수 있다
		assert.ok(
			(payload.deaths as string[]).length > 0,
			"아침 화면에 밤 결과가 없습니다 — 돌아온 사람은 무슨 일이 있었는지 알 수 없습니다"
		);
		assert.ok(
			chatChannels(ghost).some(view => view.id === ChatChannel.GHOST),
			"돌아온 사망자에게 유령 탭이 없습니다 — 죽은 사람이 아무와도 대화할 수 없습니다"
		);
		// 채팅 기록은 위젯이 아니라 서버에 있으므로 끊긴 동안의 대화도 따라온다.
		// 기존 구조에서는 위젯이 죽는 순간 그때까지의 대화가 함께 사라졌다.
		assert.ok(
			chatLines(ghost, ChatChannel.ROOM).length > 0,
			"돌아온 사람의 채팅이 비어 있습니다 — 끊긴 동안의 진행을 따라잡을 수 없습니다"
		);
	});

	it("투표 결과 발표 중에 돌아오면 처형 직전의 개표판을 그대로 받는다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // → NIGHT
		finishPhase(target); // → DAY
		finishPhase(target); // → VOTE

		// 마피아를 처형하면 개표 화면 대신 승패 화면으로 넘어간다
		const victim = seatsWithRole(target, Role.CITIZEN)[0];
		const aliveBefore = target.seats.filter(seat => seat.alive).length;
		for (const seat of target.seats) {
			if (seat.index !== victim.index) vote(playerOf(seat), victim.index);
		}

		finishPhase(target); // → VOTE_RESULT (처형 발생)
		assert.equal(victim.alive, false, "최다 득표자가 처형되지 않았습니다");

		const player = players.filter(p => seatOf(p).index !== victim.index)[0];
		disconnect(player);
		reconnect(player);

		// 투표와 개표는 같은 파일이다. 구분은 payload의 type이 한다
		const widget = freshMain(player);
		assert.equal(widget.fileName, WidgetFile.VOTE);
		const board = widget.lastOfType("result");
		assert.ok(board, "개표판을 받지 못했습니다");
		assert.equal(
			(board.seats as unknown[]).length,
			aliveBefore,
			"처형된 사람이 개표판에서 빠졌습니다 — 남들과 다른 화면을 보고 있습니다"
		);
		// 개표 결과는 room.voteRecord에 남는다. 다시 집계하면 kill()이 이미
		// 0으로 만든 처형자의 득표가 사라져 돌아온 사람만 다른 숫자를 본다
		assert.equal(board.executed, victim.index);
	});

	it("승패 연출 중에 돌아오면 결과 화면을 받는다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finish(target, Team.MAFIA);

		const player = players[0];
		disconnect(player);
		reconnect(player);

		const widget = freshMain(player);
		assert.equal(widget.fileName, WidgetFile.GAME_OVER);
		const result = widget.lastOfType("init");
		assert.ok(result, "결과 화면이 payload 없이 열렸습니다");
		assert.equal(result.winner, Team.MAFIA);
	});
});

describe("대기실 이탈", () => {
	it("끊기면 좌석이 사라지고 남은 사람의 목록이 갱신된다", () => {
		const stay = connect("남는사람");
		const leaver = connect("나가는사람");
		joinRoom(stay, 1);
		joinRoom(leaver, 1);
		assert.equal(room(1).seats.length, 2);

		disconnect(leaver);

		assert.equal(room(1).seats.length, 1);
		const list = mainWidget(stay).lastOfType("init");
		assert.ok(list, "목록 갱신을 받지 못했습니다");
		assert.equal((list.data as unknown[]).length, 1);
	});

	it("방에 들어가지 않은 채 끊겨도 아무 일도 일어나지 않는다", () => {
		const player = connect("로비유저");
		disconnect(player);
		assert.equal(findSeatOf(player), undefined);
	});
});
