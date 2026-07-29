/**
 * 통합 채팅.
 *
 * 두 층을 나눠서 본다.
 *   1. 권한 표(ChatPermission)   — 한 판을 돌리지 않고 규칙만 확인한다.
 *   2. 배달(ChatService)         — 그 표가 실제 전송에 걸려 있는지 확인한다.
 *
 * 1번만 있으면 표는 옳은데 아무도 그 표를 안 보는 상태를 못 잡고,
 * 2번만 있으면 규칙 하나를 바꿀 때마다 판을 통째로 돌려야 한다.
 *
 * 이 파일이 지키는 문장 중 가장 중요한 것은 "마피아 밀담이 시민 화면에
 * 도착하지 않는다"이다. 여기가 뚫리면 게임이 성립하지 않는다.
 */
import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import type { Room, Seat } from "../src/types/Game.types.ts";
import { GamePhase, Role } from "../src/types/Game.types.ts";
import { MIN_PLAYERS } from "../src/constants/GameConfig.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { MessageKind } from "../src/domain/chat/ChatMessage.ts";
import type { ChatContext } from "../src/domain/chat/ChatPermission.ts";
import {
	accessOf,
	LOOSE_CONTEXT,
	preferredChannel,
	readableChannels,
} from "../src/domain/chat/ChatPermission.ts";
import type { FakePlayer } from "./helpers/Harness.ts";
import {
	activeChannel,
	chat,
	chatChannels,
	chatLines,
	chatSaw,
	connect,
	disconnect,
	finishPhase,
	joinRoom,
	playerOf,
	reconnect,
	resetWorld,
	room,
	seatsWithRole,
	send,
	sendChat,
	startGame,
	startPlainGame,
	switchChannel,
} from "./helpers/Harness.ts";

beforeEach(() => resetWorld());

/** 게임 중인 생존 시민의 기본 상황. 바꾸고 싶은 것만 덮어쓴다 */
function ctx(over: Partial<ChatContext> = {}): ChatContext {
	const base: ChatContext = {
		seated: true,
		started: true,
		phase: GamePhase.DAY,
		alive: true,
		mafiaChat: false,
		ghostChat: false,
	};
	return { ...base, ...over };
}

function unreadOf(player: FakePlayer, channel: ChatChannel): number {
	const view = chatChannels(player).filter(tab => tab.id === channel)[0];
	if (!view) throw new Error(`${player.name}에게 ${channel} 탭이 없습니다.`);
	return view.unread;
}

/**
 * plainDeck 판을 밤까지 끌고 간다.
 *
 * 사람은 좌석에서 찾는다. 접속 순서와 좌석 번호는 같지 않다 —
 * 게임 시작 때 좌석을 섞어 번호를 다시 매기기 때문이다. players[0]을
 * 마피아로 가정하면 지목이 조용히 무시되고, 그러면 "아무도 안 죽었으니
 * 밀담도 안 샜다"는 식으로 통과하는 가짜 초록불이 만들어진다.
 */
function nightGame(): {
	target: Room;
	everyone: FakePlayer[];
	mafia: FakePlayer;
	doctor: FakePlayer;
	victim: Seat;
} {
	startPlainGame(MIN_PLAYERS);
	const target = room(1);
	finishPhase(target); // ROLE_REVEAL → NIGHT
	return {
		target,
		everyone: target.seats.map(playerOf),
		mafia: playerOf(seatsWithRole(target, Role.MAFIA)[0]),
		doctor: playerOf(seatsWithRole(target, Role.DOCTOR)[0]),
		victim: seatsWithRole(target, Role.CITIZEN)[0],
	};
}

describe("채널 권한 표", () => {
	it("밤의 시민은 어느 채널로도 말할 수 없다", () => {
		// 이 판정이 무너지면 밤이 만드는 정보 비대칭이 통째로 사라진다.
		const night = ctx({ phase: GamePhase.NIGHT });
		for (const channel of [ChatChannel.GLOBAL, ChatChannel.ROOM, ChatChannel.MAFIA, ChatChannel.GHOST]) {
			assert.equal(accessOf(night, channel).write, false, `${channel}이 열려 있습니다`);
		}
		// 다만 듣는 것은 막지 않는다 — 시스템 안내가 그 길로 온다
		assert.equal(accessOf(night, ChatChannel.ROOM).read, true);
	});

	it("마피아는 낮에 지난밤 밀담을 읽되 새로 쓰지는 못한다", () => {
		assert.deepEqual(accessOf(ctx({ mafiaChat: true }), ChatChannel.MAFIA), {
			read: true,
			write: false,
		});
		assert.deepEqual(accessOf(ctx({ mafiaChat: true, phase: GamePhase.NIGHT }), ChatChannel.MAFIA), {
			read: true,
			write: true,
		});
	});

	it("죽은 사람은 낮 토론을 보되 끼어들 수 없다", () => {
		const dead = ctx({ alive: false });
		assert.deepEqual(accessOf(dead, ChatChannel.ROOM), { read: true, write: false });
		assert.deepEqual(accessOf(dead, ChatChannel.GHOST), { read: true, write: true });
	});

	it("영매는 밤에만 유령의 말을 듣는다", () => {
		const shaman = ctx({ ghostChat: true });
		assert.equal(accessOf(shaman, ChatChannel.GHOST).read, false);
		assert.equal(accessOf(ctx({ ghostChat: true, phase: GamePhase.NIGHT }), ChatChannel.GHOST).read, true);
	});

	it("판이 끝나면 유령도 방 채팅으로 모인다", () => {
		const over = ctx({ alive: false, phase: GamePhase.GAME_OVER });
		assert.equal(accessOf(over, ChatChannel.ROOM).write, true);
		// 유령 탭은 기록만 남긴다. 여기를 열어두면 아래 preferredChannel이
		// 죽은 사람을 유령 탭에 붙잡아 둔 채 종료 화면을 맞는다.
		assert.equal(accessOf(over, ChatChannel.GHOST).write, false);
		assert.equal(preferredChannel(over, ChatChannel.GHOST), ChatChannel.ROOM);
	});

	it("방 밖에 선 사람에게는 전체 채팅만 보인다", () => {
		assert.deepEqual(readableChannels(LOOSE_CONTEXT), [ChatChannel.GLOBAL]);
	});

	it("말할 수 있는 탭은 밑에서 바꿔치우지 않는다", () => {
		// 멀쩡한 탭을 서버가 옮기면 방금 친 말이 엉뚱한 청중에게 간다.
		const lobby = ctx({ started: false, phase: GamePhase.LOBBY });
		assert.equal(preferredChannel(lobby, ChatChannel.GLOBAL), ChatChannel.GLOBAL);
		assert.equal(preferredChannel(lobby, ChatChannel.ROOM), ChatChannel.ROOM);
	});
});

describe("채널 격리", () => {
	it("밤 밀담은 마피아 화면에만 도착한다", () => {
		const { everyone, mafia } = nightGame();

		chat(mafia, "3번 칩시다");

		assert.equal(activeChannel(mafia), ChatChannel.MAFIA, "밤이 되면 탭이 밀담으로 옮겨가야 합니다");
		assert.ok(chatSaw(mafia, "3번 칩시다"));
		for (const player of everyone) {
			if (player === mafia) continue;
			assert.equal(chatSaw(player, "3번 칩시다"), false, `${player.name}에게 밀담이 샜습니다`);
		}
	});

	it("채널을 속여 보낸 발언은 서버가 버린다", () => {
		// 위젯은 밤의 시민에게 입력을 막지만, 조작된 클라이언트는 무엇이든 보낼 수 있다.
		const { everyone, victim } = nightGame();
		const citizen = playerOf(victim);

		sendChat(citizen, { type: "send", channel: ChatChannel.ROOM, text: "마피아는 1번" });
		sendChat(citizen, { type: "send", channel: ChatChannel.MAFIA, text: "저 여기 있어요" });
		sendChat(citizen, { type: "send", channel: "ADMIN", text: "없는 채널" });

		for (const player of everyone) {
			assert.equal(chatSaw(player, "마피아는 1번"), false, "밤에 방 채팅이 나갔습니다");
			assert.equal(chatSaw(player, "저 여기 있어요"), false, "시민이 밀담에 끼어들었습니다");
			assert.equal(chatSaw(player, "없는 채널"), false);
		}
	});

	it("유령의 대화는 산 사람에게 보이지 않는다", () => {
		const { target, mafia, doctor, victim } = nightGame();
		const ghost = playerOf(victim);

		send(mafia, { type: "select", num: victim.index });
		finishPhase(target); // NIGHT → 정산 → DAY

		assert.equal(victim.alive, false, "지목 대상이 죽지 않았습니다");
		assert.equal(activeChannel(ghost), ChatChannel.GHOST, "죽으면 탭이 유령으로 옮겨가야 합니다");

		chat(ghost, "죽인 건 1번입니다");

		assert.ok(chatSaw(ghost, "죽인 건 1번입니다"));
		assert.equal(chatSaw(doctor, "죽인 건 1번입니다"), false, "유령의 말이 산 사람에게 샜습니다");
		assert.equal(chatSaw(mafia, "죽인 건 1번입니다"), false);
	});

	it("죽은 사람도 낮 토론은 계속 본다", () => {
		// 관전의 재미가 여기 있다. 쓰기만 막고 읽기는 남기는 이유.
		const { target, mafia, doctor, victim } = nightGame();
		const ghost = playerOf(victim);

		send(mafia, { type: "select", num: victim.index });
		finishPhase(target); // → DAY

		chat(doctor, "저는 의사입니다", ChatChannel.ROOM);

		assert.ok(chatSaw(ghost, "저는 의사입니다"), "유령이 낮 토론을 놓쳤습니다");
	});

	it("영매는 다음 밤에 유령의 말을 듣는다", () => {
		startGame(5, 1, [Role.MAFIA, Role.SHAMAN, Role.DOCTOR, Role.POLICE, Role.CITIZEN]);
		const target = room(1);
		const mafia = playerOf(seatsWithRole(target, Role.MAFIA)[0]);
		const shaman = playerOf(seatsWithRole(target, Role.SHAMAN)[0]);
		const doctor = playerOf(seatsWithRole(target, Role.DOCTOR)[0]);
		const victim = seatsWithRole(target, Role.CITIZEN)[0];

		finishPhase(target); // ROLE_REVEAL → NIGHT
		send(mafia, { type: "select", num: victim.index });
		finishPhase(target); // → DAY
		finishPhase(target); // → VOTE
		finishPhase(target); // → VOTE_RESULT (아무도 투표하지 않아 처형 없음)
		finishPhase(target); // → NIGHT

		assert.equal(target.phase, GamePhase.NIGHT);
		assert.equal(victim.alive, false, "지목 대상이 죽지 않았습니다");
		chat(playerOf(victim), "저를 죽인 건 1번입니다", ChatChannel.GHOST);

		assert.ok(chatSaw(shaman, "저를 죽인 건 1번입니다"), "영매가 유령의 말을 듣지 못했습니다");
		assert.equal(chatSaw(doctor, "저를 죽인 건 1번입니다"), false, "영매가 아닌데 들었습니다");
	});

	it("전체 채팅은 방을 넘어 닿지만 방 채팅은 넘지 않는다", () => {
		const outside = connect("바깥사람");
		const inside = connect("방사람");
		joinRoom(inside, 1);

		chat(inside, "1번 방 한 명 더 구합니다", ChatChannel.GLOBAL);
		chat(inside, "곧 시작합니다", ChatChannel.ROOM);

		assert.ok(chatSaw(outside, "1번 방 한 명 더 구합니다"));
		assert.equal(chatSaw(outside, "곧 시작합니다"), false, "방 채팅이 방 밖으로 샜습니다");
	});

	it("게임이 시작되면 전체 채팅으로 말할 수 없다", () => {
		// 열어두면 밤의 마피아가 바깥으로 신호를 보내거나 죽은 사람이
		// 산 사람에게 정보를 흘릴 수 있어 다른 채널의 제약이 전부 무의미해진다.
		const outside = connect("바깥사람");
		const players = startPlainGame(MIN_PLAYERS, 2);

		sendChat(players[0], { type: "send", channel: ChatChannel.GLOBAL, text: "저 좀 살려주세요" });

		assert.equal(chatSaw(outside, "저 좀 살려주세요"), false);
		// 듣는 것은 여전히 자유다
		chat(outside, "구경 중입니다");
		assert.ok(chatSaw(players[0], "구경 중입니다"));
	});
});

describe("탭과 미확인 표시", () => {
	it("보고 있지 않은 탭에 숫자가 쌓이고, 옮기면 사라진다", () => {
		const a = connect("가");
		const b = connect("나");
		joinRoom(a, 1);
		joinRoom(b, 1);

		// 둘 다 전체 탭을 보고 있다. 방 탭의 말은 안 읽음으로 쌓인다.
		// (입장 알림도 방 탭의 줄이라 이미 몇 개 쌓여 있다 — 증가분을 본다)
		assert.equal(activeChannel(a), ChatChannel.GLOBAL);
		const before = unreadOf(a, ChatChannel.ROOM);
		chat(b, "안녕하세요", ChatChannel.ROOM);
		assert.equal(unreadOf(a, ChatChannel.ROOM), before + 1);

		switchChannel(a, ChatChannel.ROOM);
		assert.equal(unreadOf(a, ChatChannel.ROOM), 0);
		assert.equal(activeChannel(a), ChatChannel.ROOM);
	});

	it("보고 있는 탭에 온 줄은 곧바로 읽은 것이 된다", () => {
		// 그러지 않으면 눈앞에 뜬 메시지에 "안 읽음 1"이 계속 붙어 있는다.
		const a = connect("가");
		const b = connect("나");
		joinRoom(a, 1);
		joinRoom(b, 1);
		switchChannel(a, ChatChannel.ROOM);

		chat(b, "안녕하세요", ChatChannel.ROOM);

		assert.equal(unreadOf(a, ChatChannel.ROOM), 0);
	});

	it("나중에 들어온 사람은 오기 전 대화를 안 읽음으로 떠안지 않는다", () => {
		const first = connect("먼저");
		chat(first, "1번 방 갑니다");
		chat(first, "누구 없나요");

		const later = connect("나중");

		assert.equal(unreadOf(later, ChatChannel.GLOBAL), 0);
		// 그렇다고 기록을 못 보는 것은 아니다 — 열면 지난 대화가 보인다
		assert.ok(chatSaw(later, "누구 없나요"));
	});

	it("읽을 수 없는 채널은 탭 자체가 없다", () => {
		const { victim, mafia } = nightGame();
		const citizen = playerOf(victim);

		const citizenTabs = chatChannels(citizen).map(tab => tab.id);
		assert.equal(citizenTabs.indexOf(ChatChannel.MAFIA), -1, "시민에게 마피아 탭이 보입니다");
		assert.equal(citizenTabs.indexOf(ChatChannel.GHOST), -1, "산 사람에게 유령 탭이 보입니다");

		assert.ok(chatChannels(mafia).some(tab => tab.id === ChatChannel.MAFIA && tab.write));
	});
});

describe("알림과 기록", () => {
	it("입장과 퇴장이 방 채팅에 남는다", () => {
		const a = connect("먼저");
		joinRoom(a, 1);
		const b = connect("나중");
		joinRoom(b, 1);

		assert.ok(chatSaw(a, "나중 님이 입장했습니다"));
		// 본인도 자기 입장 알림을 본다. 방 탭을 먼저 만들고 알림을 흘리는
		// Lobby의 순서가 지키는 것이라 뒤집히면 여기서 잡힌다.
		assert.ok(chatSaw(b, "나중 님이 입장했습니다"));

		disconnect(b);
		assert.ok(chatSaw(a, "나중 님이 퇴장했습니다"));
	});

	it("사망은 사건으로 남아 이벤트만 따로 뽑을 수 있다", () => {
		// kind로 거를 수 있어야 나중에 "게임 이벤트 로그"만 따로 보여줄 때
		// 문자열을 파싱하지 않아도 된다.
		const { target, mafia, doctor, victim } = nightGame();

		send(mafia, { type: "select", num: victim.index });
		finishPhase(target); // → DAY

		const events = chatLines(doctor).filter(line => line.kind === MessageKind.EVENT);
		assert.ok(events.length > 0, "사건 기록이 하나도 없습니다");
		assert.ok(events.some(line => line.text.indexOf(victim.name) >= 0));
	});

	it("단계 전환은 안내로 남고 사건과 섞이지 않는다", () => {
		// SYSTEM/EVENT를 나눠 놓고 SYSTEM 입구를 아무도 쓰지 않으면, 구분은
		// 존재하지만 아무것도 구분하지 않는다. 밤·아침·투표가 실제로 안내로
		// 남는지, 그리고 그것들이 사건 목록을 오염시키지 않는지 함께 본다.
		const { target, mafia, doctor, victim } = nightGame();

		send(mafia, { type: "select", num: victim.index });
		finishPhase(target); // → DAY
		finishPhase(target); // → VOTE

		const lines = chatLines(doctor);
		const system = lines.filter(line => line.kind === MessageKind.SYSTEM);
		const events = lines.filter(line => line.kind === MessageKind.EVENT);

		for (const mark of ["게임을 시작합니다", "밤이 되었습니다", "아침이 밝았습니다", "투표가 시작"]) {
			assert.ok(
				system.some(line => line.text.indexOf(mark) >= 0),
				`단계 안내에 "${mark}"가 없습니다`,
			);
		}
		// 사건 목록에는 실제로 벌어진 일만 남는다
		assert.ok(events.length > 0, "사건 기록이 하나도 없습니다");
		assert.ok(
			events.every(line => line.text.indexOf("되었습니다.") < 0 || line.text.indexOf("☠️") >= 0),
			"단계 안내가 사건으로 분류되어 있습니다",
		);
	});

	it("판이 끝나면 방 밖에도 결과가 한 줄 흐른다", () => {
		const outside = connect("바깥사람");
		const { target, mafia } = nightGame();
		const mafiaSeat = seatsWithRole(target, Role.MAFIA)[0];

		// 마피아가 시민을 계속 줄이면 결국 인원이 같아진다
		for (const seat of target.seats.filter(s => s !== mafiaSeat).slice(0, 2)) {
			send(mafia, { type: "select", num: seat.index });
			finishPhase(target); // → DAY
			if (target.phase === GamePhase.GAME_OVER) break;
			finishPhase(target); // → VOTE
			finishPhase(target); // → VOTE_RESULT
			finishPhase(target); // → NIGHT
		}

		assert.equal(target.phase, GamePhase.GAME_OVER, "게임이 끝나지 않았습니다");
		assert.ok(chatSaw(outside, "마피아 승리"), "방 밖에 결과가 전해지지 않았습니다");
	});

	it("재접속하면 그동안의 기록을 다시 받는다", () => {
		const players = startPlainGame(MIN_PLAYERS);
		const target = room(1);
		finishPhase(target); // → NIGHT
		finishPhase(target); // → DAY (아무도 지목하지 않아 사망 없음)

		chat(players[1], "저는 시민입니다", ChatChannel.ROOM);

		const away = players[2];
		disconnect(away);
		reconnect(away);

		assert.ok(chatSaw(away, "저는 시민입니다"), "재접속 뒤 기록이 비어 있습니다");
	});
});

describe("채팅 명령어", () => {
	it("말할 곳이 없는 밤에도 명령어는 답한다", () => {
		// 입력창을 권한으로 잠그면 이 경로가 통째로 막힌다.
		const { victim } = nightGame();
		const citizen = playerOf(victim);

		chat(citizen, "/도움말");

		assert.ok(chatSaw(citizen, "채팅 명령어"));
	});

	it("모르는 명령어는 안내를 돌려준다", () => {
		const player = connect("손님");

		chat(player, "/없는명령");

		assert.ok(chatSaw(player, "모르는 명령어입니다"));
	});

	it("운영자 명령은 운영자에게만 열린다", () => {
		const guest = connect("손님");
		const admin = connect("운영자", { role: 3000 });

		chat(guest, "/경험치");
		chat(admin, "/경험치");

		assert.ok(chatSaw(guest, "운영자만 쓸 수 있는"));
		assert.equal(chatSaw(admin, "운영자만 쓸 수 있는"), false);
		// 안내는 본인에게만 간다
		assert.equal(chatSaw(admin, "모르는 명령어입니다"), false);
	});
});
