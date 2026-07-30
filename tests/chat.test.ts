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
import { CHAT_RATE, MAX_PLAYERS, MIN_PLAYERS, ROOM_COUNT } from "../src/constants/GameConfig.ts";
import { isInsideRoom, seatPosition } from "../src/constants/RoomLayout.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { maskProfanity } from "../src/domain/chat/ChatFilter.ts";
import { MessageKind } from "../src/domain/chat/ChatMessage.ts";
import type { ChatContext } from "../src/domain/chat/ChatPermission.ts";
import {
	accessOf,
	LOOSE_CONTEXT,
	preferredChannel,
	readableChannels,
} from "../src/domain/chat/ChatPermission.ts";
import { auditRoomAreas } from "../src/services/Stage.ts";
import type { FakePlayer } from "./helpers/Harness.ts";
import {
	activeChannel,
	chat,
	chatChannels,
	chatLines,
	chatSaw,
	clearTile,
	connect,
	disconnect,
	finishPhase,
	joinRoom,
	paintPrivateArea,
	passPeacefulFirstNight,
	playerOf,
	reconnect,
	resetWorld,
	room,
	seatsWithRole,
	send,
	sendChat,
	spokenAloud,
	standAt,
	startGame,
	startPlainGame,
	switchChannel,
	tick,
	world,
} from "./helpers/Harness.ts";

beforeEach(() => resetWorld());

/** 게임 중인 생존 시민의 기본 상황. 바꾸고 싶은 것만 덮어쓴다 */
function ctx(over: Partial<ChatContext> = {}): ChatContext {
	const base: ChatContext = {
		seated: true,
		started: true,
		phase: GamePhase.DAY,
		alive: true,
		spectating: false,
		mafiaChat: false,
		ghostChat: false,
		silenced: false,
	};
	return { ...base, ...over };
}

/**
 * 권한 표의 결과를 읽기·쓰기만으로 본다.
 *
 * note(잠긴 이유)까지 deepEqual로 묶으면 안내 문구를 다듬을 때마다 규칙과
 * 무관한 테스트가 깨진다. 문구가 규칙을 대신 지키는 곳(협박·사망)에서만
 * 따로 확인한다.
 */
function rw(access: { read: boolean; write: boolean }): { read: boolean; write: boolean } {
	return { read: access.read, write: access.write };
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

/**
 * 밤에 서 있는 판을 둘째 밤까지 끌고 가 victim을 실제로 죽인다.
 * 돌아온 시점은 낮이고 victim은 유령이다.
 *
 * 8인 이하 판의 첫 밤에는 아무도 죽지 않는다(FIRST_NIGHT_PEACEFUL_UP_TO).
 * 그래서 "죽은 뒤"를 보는 테스트가 첫 밤에 지목하면, 단언이 산 사람을
 * 상대로 돌아 조용히 통과한다 — 채널이 유령으로 옮겨갔는지 같은 것은
 * 애초에 아무것도 옮겨가지 않았으므로 검사할 대상이 없다.
 */
function killOnSecondNight(target: Room, mafia: FakePlayer, victim: Seat): void {
	passPeacefulFirstNight(target);
	send(mafia, { type: "select", num: victim.index });
	finishPhase(target); // → 정산 → DAY
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
		assert.deepEqual(rw(accessOf(ctx({ mafiaChat: true }), ChatChannel.MAFIA)), {
			read: true,
			write: false,
		});
		assert.deepEqual(rw(accessOf(ctx({ mafiaChat: true, phase: GamePhase.NIGHT }), ChatChannel.MAFIA)), {
			read: true,
			write: true,
		});
	});

	it("죽은 사람은 낮 토론을 보되 끼어들 수 없다", () => {
		const dead = ctx({ alive: false });
		assert.deepEqual(rw(accessOf(dead, ChatChannel.ROOM)), { read: true, write: false });
		assert.deepEqual(rw(accessOf(dead, ChatChannel.GHOST)), { read: true, write: true });
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

	it("협박당한 사람은 방 채팅에서만 입이 막힌다", () => {
		// 협박은 "오늘 낮에 말을 못 한다"는 규칙이다. 마피아인 채로 협박당해도
		// 밤의 밀담까지 잠기면 건달이 같은 편의 작전을 끊어버리게 된다.
		const muted = ctx({ silenced: true });
		assert.equal(accessOf(muted, ChatChannel.ROOM).write, false);
		assert.ok(accessOf(muted, ChatChannel.ROOM).note.indexOf("협박") >= 0);
		// 듣는 것은 그대로다 — 오늘의 토론을 못 보면 내일 판단할 근거가 없다
		assert.equal(accessOf(muted, ChatChannel.ROOM).read, true);

		const mafia = ctx({ silenced: true, mafiaChat: true, phase: GamePhase.NIGHT });
		assert.equal(accessOf(mafia, ChatChannel.MAFIA).write, true);
	});

	it("잠긴 탭은 저마다 다른 이유를 들고 온다", () => {
		// 위젯이 "지금은 읽기만 됩니다" 한 문장으로 덮던 자리다. 밤·사망·협박은
		// 해야 할 행동이 전혀 다른데, 같은 문구를 보면 셋을 구분할 수 없다.
		const notes = [
			accessOf(ctx({ phase: GamePhase.NIGHT }), ChatChannel.ROOM).note,
			accessOf(ctx({ alive: false }), ChatChannel.ROOM).note,
			accessOf(ctx({ silenced: true }), ChatChannel.ROOM).note,
		];
		for (const note of notes) assert.notEqual(note, "");
		assert.equal(new Set(notes).size, notes.length, "잠긴 이유가 서로 겹칩니다");
		// 말할 수 있는 탭은 이유를 달지 않는다
		assert.equal(accessOf(ctx(), ChatChannel.ROOM).note, "");
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

		killOnSecondNight(target, mafia, victim);

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

		killOnSecondNight(target, mafia, victim);
		assert.equal(victim.alive, false, "지목 대상이 죽지 않았습니다");

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
		killOnSecondNight(target, mafia, victim); // 둘째 밤에 죽고 낮으로 나온다
		finishPhase(target); // → VOTE
		finishPhase(target); // → VOTE_RESULT (아무도 투표하지 않아 처형 없음)
		finishPhase(target); // → NIGHT (셋째 밤)

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

/*
 * 말풍선은 이 게임의 채널 규칙 바깥으로 나가는 유일한 출구다.
 *
 * 다른 배달 경로는 전부 deliverTo의 accessOf가 사람마다 다시 판정하지만,
 * 말풍선은 ZEP이 띄우므로 한 번 나가면 누가 보는지를 이 게임이 통제하지
 * 못한다. 그래서 "무엇이 어느 청중에게 나가는가"를 여기서 못 박아 둔다.
 *
 * 청중은 두 가지뿐이다(ChatChannel의 ZepAudience).
 *   PUBLIC_AREA  — 맵 전체. 전체 채팅만 이 자리에 온다.
 *   PRIVATE_AREA — 말한 사람이 서 있는 프라이빗 영역. 방 채팅이 이 자리다.
 *
 * PRIVATE_AREA는 조건부다. ZEP은 어느 영역에도 없는 사람들을 0번 영역
 * 하나로 묶어 서로 들리게 하므로, 영역 밖에서 PRIVATE_AREA로 말하면 맵
 * 전체에 외친 것과 다름없다. 그래서 텍스트만 비교하는 검사는 절반만 지킨
 * 것이다 — 아래 검사들이 area까지 함께 보는 이유가 그것이다.
 */
describe("ZEP 기본 채팅으로 내보내기", () => {
	it("전체 채팅은 맵 전체 청중으로 나간다", () => {
		const player = connect("가");
		joinRoom(player, 1);

		chat(player, "같이 하실 분", ChatChannel.GLOBAL);

		assert.deepEqual(spokenAloud(player), [{ text: "같이 하실 분", area: "PUBLIC_AREA" }]);
	});

	it("낮 토론은 자기 방 영역 청중으로 나간다", () => {
		const { target, doctor } = nightGame();
		paintPrivateArea(target.num);
		finishPhase(target); // NIGHT → DAY

		chat(doctor, "3번이 수상해요", ChatChannel.ROOM);

		assert.ok(chatSaw(doctor, "3번이 수상해요"), "토론 자체는 방 화면에 떠야 합니다");
		assert.deepEqual(spokenAloud(doctor), [
			{ text: "3번이 수상해요", area: "PRIVATE_AREA" },
		]);
	});

	/*
	 * 아래 세 가지가 이 파일에서 가장 미끄러운 자리다.
	 *
	 * 영역을 칠하는 것은 ZEP 에디터에서 손으로 하는 일이라 코드가 확인할 수
	 * 없다(ROOM_ORIGINS 주석). 못 지켜졌을 때 말풍선을 포기하는 것과 그냥
	 * 쏘는 것의 차이는 화면에서 티가 나지 않는다 — 옆 방 사람 눈에만 남의 방
	 * 토론이 뜬다. 그래서 어긋난 세 경로를 각각 검사로 박아 둔다.
	 */
	it("영역을 칠하지 않은 방에서는 말풍선을 포기한다", () => {
		const { target, doctor } = nightGame();
		finishPhase(target); // NIGHT → DAY, 좌석에 앉은 상태

		chat(doctor, "3번이 수상해요", ChatChannel.ROOM);

		assert.ok(chatSaw(doctor, "3번이 수상해요"), "토론 자체는 방 화면에 떠야 합니다");
		assert.deepEqual(spokenAloud(doctor), [], "영역 없이 쏘면 0번 영역 전원에게 들린다");
	});

	it("방 안이라도 영역 밖 타일에서는 말풍선을 포기한다", () => {
		const { target, doctor } = nightGame();
		paintPrivateArea(target.num);
		finishPhase(target);
		// 좌석 사이·문간처럼 칠하지 않은 칸. 맵에 칠한 영역이 상자보다 좁을 때
		// 생기는 틈이고, 상자만 보고 판정하면 이 자리가 그대로 새는 구멍이 된다.
		const seat = seatPosition(target.num, 1);
		assert.ok(seat);
		standAt(doctor, seat.x, seat.y + 1);
		assert.ok(
			isInsideRoom(target.num, doctor.tileX, doctor.tileY),
			"상자 밖으로 나가버리면 이 검사는 타일 판정을 확인하지 못합니다"
		);

		chat(doctor, "3번이 수상해요", ChatChannel.ROOM);

		assert.deepEqual(spokenAloud(doctor), [], "영역 밖에서 방 채팅이 나갔습니다");
	});

	it("옆 방 영역으로 걸어가도 그 방으로 말이 가지 않는다", () => {
		const { target, doctor } = nightGame();
		paintPrivateArea(2); // 이 사람의 방은 1번이다
		finishPhase(target);
		const elsewhere = seatPosition(2, 1);
		assert.ok(elsewhere);
		standAt(doctor, elsewhere.x, elsewhere.y);

		chat(doctor, "3번이 수상해요", ChatChannel.ROOM);

		assert.deepEqual(spokenAloud(doctor), [], "1번 방의 토론이 2번 방 영역에 뜹니다");
	});

	it("대기 중 방 채팅은 말풍선으로 나가지 않는다", () => {
		/*
		 * 방에 들어가는 것은 명단에 이름을 올리는 것이고, 몸은 게임이 시작할
		 * 때까지 대기실에 서 있다(seatPlayer는 첫 밤에만 부른다). 대기실은
		 * 8개 방의 사람이 전부 모여 있는 곳이라 여기서 방 채팅이 새면
		 * 방을 나눈 의미가 없어진다.
		 */
		const player = connect("가");
		joinRoom(player, 1);
		paintPrivateArea(1);

		chat(player, "빨리 시작해요", ChatChannel.ROOM);

		assert.ok(chatSaw(player, "빨리 시작해요"), "대기 중 방 채팅 자체는 열려 있어야 합니다");
		assert.deepEqual(spokenAloud(player), [], "대기실에서 방 채팅이 새어 나갔습니다");
	});

	it("말풍선 지시는 말한 사람에게만 간다", () => {
		// 남의 클라이언트가 대신 띄우면 그 사람 아바타 위에 남의 말이 뜬다.
		const a = connect("가");
		const b = connect("나");
		joinRoom(a, 1);
		joinRoom(b, 1);

		chat(a, "안녕하세요", ChatChannel.GLOBAL);

		assert.deepEqual(spokenAloud(a), [{ text: "안녕하세요", area: "PUBLIC_AREA" }]);
		assert.deepEqual(spokenAloud(b), [], "남의 말이 다른 사람 아바타로 나갔습니다");
	});

	it("밤 밀담은 말풍선으로 나가지 않는다", () => {
		const { mafia } = nightGame();

		chat(mafia, "3번 칩시다");

		assert.equal(activeChannel(mafia), ChatChannel.MAFIA);
		assert.ok(chatSaw(mafia, "3번 칩시다"), "밀담 자체는 마피아 화면에 떠야 합니다");
		assert.deepEqual(spokenAloud(mafia), [], "밀담이 방 전체에 외쳐졌습니다");
	});

	it("유령의 말은 말풍선으로 나가지 않는다", () => {
		const { target, mafia, victim } = nightGame();
		send(mafia, { type: "select", num: victim.index });
		finishPhase(target); // NIGHT → 정산 → DAY
		const ghost = playerOf(victim);

		chat(ghost, "죽인 건 1번입니다");

		assert.ok(chatSaw(ghost, "죽인 건 1번입니다"));
		assert.deepEqual(spokenAloud(ghost), [], "죽은 사람이 산 사람 앞에서 말했습니다");
	});

	it("서버가 버린 발언은 말풍선도 뜨지 않는다", () => {
		// 조작된 클라이언트가 게임 중에 전체 채팅을 보내는 경로. 배달이 막히는
		// 것과 말풍선이 막히는 것은 같은 관문이어야 한다 — 둘이 갈리면 죽은
		// 사람과 밤의 시민이 화면에는 안 뜨는 말을 아바타 위로 외친다.
		const { victim } = nightGame();
		const citizen = playerOf(victim);

		sendChat(citizen, { type: "send", channel: ChatChannel.GLOBAL, text: "마피아는 1번" });

		assert.ok(!chatSaw(citizen, "마피아는 1번"), "서버가 버렸어야 할 발언이 배달됐습니다");
		assert.deepEqual(spokenAloud(citizen), []);
	});

	it("명령어는 말풍선으로 나가지 않는다", () => {
		const player = connect("가");
		joinRoom(player, 1);

		chat(player, "/도움말", ChatChannel.GLOBAL);

		assert.deepEqual(spokenAloud(player), [], "명령어가 그대로 외쳐졌습니다");
	});

	it("가려진 욕설은 가려진 채로 나간다", () => {
		// 필터를 통과한 원문이 말풍선으로 새면 필터가 반쪽이 된다.
		const player = connect("가");
		joinRoom(player, 1);
		const raw = "시발 뭐야";

		chat(player, raw, ChatChannel.GLOBAL);

		const said = spokenAloud(player);
		assert.equal(said.length, 1);
		assert.equal(said[0].text, maskProfanity(raw));
		assert.notEqual(said[0].text, raw, "필터가 아무것도 가리지 못했다면 이 검사는 의미가 없습니다");
	});
});

/*
 * 맵과 코드 사이의 계약을 맵 쪽에서 확인한다.
 *
 * 위 검사들은 전부 "영역이 칠해져 있다면"을 전제로 한다. 정작 칠하는 일은
 * 사람이 ZEP 에디터에서 하고, 빠뜨려도 코드는 조용히 말풍선만 포기한다 —
 * 설계상 그게 맞지만, 아무도 모르는 채로 계속 도는 것은 맞지 않다.
 */
describe("맵 자가 점검", () => {
	it("영역이 없는 방을 스태프에게 알린다", () => {
		paintPrivateArea(1);
		paintPrivateArea(3);

		assert.deepEqual(
			auditRoomAreas(),
			[2, 4, 5, 6, 7, 8],
			"칠하지 않은 방을 찾지 못했습니다"
		);
		assert.equal(world.staffSays.length, 1, "스태프에게 알리지 않았습니다");
		assert.match(world.staffSays[0], /2, 4, 5, 6, 7, 8번/);
	});

	it("좌석 한 칸만 빠져도 그 방을 짚는다", () => {
		// 부분적으로 칠한 방이 가장 찾기 어렵다. 열한 명은 멀쩡히 말풍선이
		// 뜨고 한 명만 안 뜨므로, 그 한 명이 신고하지 않으면 아무도 모른다.
		for (let roomNum = 1; roomNum <= ROOM_COUNT; roomNum++) paintPrivateArea(roomNum);
		const hole = seatPosition(5, MAX_PLAYERS);
		assert.ok(hole);
		clearTile(hole.x, hole.y);

		assert.deepEqual(auditRoomAreas(), [5]);
	});

	it("맵이 뜰 때 저절로 점검한다", () => {
		// 점검 함수가 있어도 아무도 부르지 않으면 없는 것과 같다.
		// index.ts의 배선까지 확인하는 것이 이 검사의 전부다.
		world.hooks.start.emit();

		assert.equal(world.staffSays.length, 1, "시작할 때 맵을 훑지 않았습니다");
	});

	it("다 칠했으면 아무 말도 하지 않는다", () => {
		for (let roomNum = 1; roomNum <= ROOM_COUNT; roomNum++) paintPrivateArea(roomNum);

		assert.deepEqual(auditRoomAreas(), []);
		// 이상 없을 때 조용한 것이 중요하다. 매번 한 줄씩 나오면 스태프 채팅에서
		// 진짜 사고 알림(Fault.guard)이 그 사이에 묻힌다.
		assert.deepEqual(world.staffSays, []);
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

		killOnSecondNight(target, mafia, victim);

		// 죽었는지부터 확인한다. 이름만 훑는 아래 단언은 지목이 통째로 빗나가도
		// "누가 입장했습니다" 같은 다른 줄에 이름이 있으면 통과한다
		assert.equal(victim.alive, false, "지목 대상이 죽지 않았습니다");

		const events = chatLines(doctor).filter(line => line.kind === MessageKind.EVENT);
		assert.ok(events.length > 0, "사건 기록이 하나도 없습니다");
		assert.ok(events.some(line => line.text.indexOf(victim.name) >= 0));
	});

	it("단계 전환은 안내로 남고 사건과 섞이지 않는다", () => {
		// SYSTEM/EVENT를 나눠 놓고 SYSTEM 입구를 아무도 쓰지 않으면, 구분은
		// 존재하지만 아무것도 구분하지 않는다. 밤·아침·투표가 실제로 안내로
		// 남는지, 그리고 그것들이 사건 목록을 오염시키지 않는지 함께 본다.
		const { target, mafia, doctor, victim } = nightGame();

		// 첫 밤이라 지목해도 아무도 죽지 않는다. 그 "무사" 보고가 사건으로
		// 남으므로 사건 목록은 비지 않는다 — 둘째 밤까지 끌고 가면 개표를
		// 한 번 지나게 되고, 처형 무산 보고가 아래 규칙에 걸린다
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

		// 결착은 둘째 밤부터 세야 맞는다
		passPeacefulFirstNight(target);

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

describe("채팅 속도 제한", () => {
	/** 이 사람이 실제로 화면에 띄운 발언만 센다 */
	function spoken(player: FakePlayer): string[] {
		return chatLines(player)
			.filter(line => line.kind === MessageKind.USER && line.senderId === player.id)
			.map(line => line.text);
	}

	it("몰아 쳐도 여유분만큼은 그대로 나가고, 그 다음 줄부터 막힌다", () => {
		// 제한의 목적은 도배를 막는 것이지 대화를 막는 것이 아니다. 짧은 말을
		// 잇달아 치는 것은 낮 토론의 정상적인 모습이라 여기서 걸리면 안 된다.
		const player = connect("수다쟁이");

		for (let i = 1; i <= CHAT_RATE.BURST + 1; i++) chat(player, `말${i}`);

		assert.deepEqual(spoken(player), ["말1", "말2", "말3", "말4"]);
	});

	it("잠시 기다리면 저절로 풀린다", () => {
		// 음소거도 강퇴도 아니다. 걸린 사람이 아무것도 하지 않아도 돌아와야 한다.
		const player = connect("수다쟁이");
		for (let i = 0; i < CHAT_RATE.BURST + 1; i++) chat(player, "도배");

		tick(CHAT_RATE.REFILL_MS / 1000);
		chat(player, "이제 됩니다");

		assert.equal(spoken(player).slice(-1)[0], "이제 됩니다");
	});

	it("막힌 줄은 다른 사람에게도 가지 않는다", () => {
		// 보낸 사람 화면에서만 지우는 것은 제한이 아니라 착시다.
		const speaker = connect("수다쟁이");
		const listener = connect("옆사람");

		for (let i = 0; i < CHAT_RATE.BURST; i++) chat(speaker, "여유분");
		chat(speaker, "넘친줄");

		assert.equal(chatSaw(listener, "넘친줄"), false);
	});

	it("명령어 연타도 같은 여유분을 쓴다", () => {
		// 관문이 발언에만 있으면 /도움말 연타로 tell이 그대로 쏟아진다.
		// 도배 경로는 발언과 명령 둘이고, 여유분은 둘이 함께 쓰는 하나여야 한다.
		const player = connect("수다쟁이");

		for (let i = 0; i < CHAT_RATE.BURST; i++) chat(player, "/도움말");
		const before = chatLines(player).length;
		chat(player, "/도움말");

		assert.equal(chatLines(player).length, before);
	});

	it("빈 줄은 여유분을 쓰지 않는다", () => {
		// 서버가 버릴 줄을 세면, 조작된 클라이언트가 빈 줄만 보내 남의 발언권을
		// 깎을 수 있다. 값을 치르는 시점은 실제로 무언가를 하기 직전이다.
		const player = connect("수다쟁이");

		for (let i = 0; i < 20; i++) chat(player, "   ");
		for (let i = 1; i <= CHAT_RATE.BURST; i++) chat(player, `말${i}`);

		assert.deepEqual(spoken(player), ["말1", "말2", "말3", "말4"]);
	});
});

describe("건달의 협박", () => {
	/** 건달 하나가 시민 하나를 협박할 수 있는 밤 */
	function thugGame(): {
		target: Room;
		thug: FakePlayer;
		muted: FakePlayer;
		mutedSeat: Seat;
		bystander: FakePlayer;
	} {
		startGame(6, 1, [Role.THUG, Role.MAFIA, Role.DOCTOR, Role.POLICE, Role.CITIZEN, Role.CITIZEN]);
		const target = room(1);
		const citizens = seatsWithRole(target, Role.CITIZEN);
		finishPhase(target); // ROLE_REVEAL → NIGHT
		return {
			target,
			thug: playerOf(seatsWithRole(target, Role.THUG)[0]),
			muted: playerOf(citizens[0]),
			mutedSeat: citizens[0],
			bystander: playerOf(citizens[1]),
		};
	}

	it("협박당한 사람은 다음 낮에 말할 수 없다", () => {
		// 원본에서 silenced는 투표만 막았다. 협박의 본체는 발언 봉쇄이고
		// 투표 차단은 그 결과인데, 기본 채팅을 쓰던 시절에는 발언을 가로챌
		// 지점이 없어 절반만 구현돼 있었다.
		const { target, thug, muted, mutedSeat, bystander } = thugGame();

		send(thug, { type: "select", num: mutedSeat.index });
		finishPhase(target); // → DAY

		const roomTab = chatChannels(muted).filter(tab => tab.id === ChatChannel.ROOM)[0];
		assert.equal(roomTab.write, false, "협박당했는데 방 탭이 열려 있습니다");
		assert.ok(roomTab.placeholder.indexOf("협박") >= 0, "잠긴 이유가 화면에 전해지지 않았습니다");

		chat(muted, "저는 시민입니다", ChatChannel.ROOM);
		assert.equal(chatSaw(bystander, "저는 시민입니다"), false, "협박당한 사람의 말이 나갔습니다");

		// 듣기는 그대로다. 오늘 토론을 못 보면 내일 판단할 근거까지 사라진다
		chat(bystander, "누가 수상한가요", ChatChannel.ROOM);
		assert.ok(chatSaw(muted, "누가 수상한가요"), "협박이 듣는 것까지 막았습니다");
	});

	it("협박당했다는 사실은 당사자만 안다", () => {
		// 방 전체에 알리면 그것이 곧 "건달이 누구를 지목했는가"의 단서가 된다.
		const { target, thug, muted, mutedSeat, bystander } = thugGame();

		send(thug, { type: "select", num: mutedSeat.index });
		finishPhase(target); // → DAY

		assert.ok(chatSaw(muted, "간밤에 협박당했습니다"), "본인이 안내받지 못했습니다");
		assert.equal(chatSaw(bystander, "협박당했습니다"), false, "협박 사실이 새어 나갔습니다");
	});

	it("협박은 딱 하루만 간다", () => {
		const { target, thug, muted, mutedSeat, bystander } = thugGame();

		send(thug, { type: "select", num: mutedSeat.index });
		finishPhase(target); // → DAY
		finishPhase(target); // → VOTE
		finishPhase(target); // → VOTE_RESULT (아무도 투표하지 않아 처형 없음)
		finishPhase(target); // → NIGHT (여기서 좌석이 초기화된다)
		finishPhase(target); // → DAY (건달이 이번 밤엔 아무도 지목하지 않았다)

		assert.equal(mutedSeat.silenced, false, "협박이 다음 날까지 남았습니다");
		chat(muted, "이제 말할 수 있습니다", ChatChannel.ROOM);
		assert.ok(chatSaw(bystander, "이제 말할 수 있습니다"));
	});
});

describe("귓속말", () => {
	it("적은 사람에게만 닿는다", () => {
		const sender = connect("가");
		const target = connect("나");
		const other = connect("다");

		chat(sender, "/귓속말 나 둘만 아는 얘기");

		assert.ok(chatSaw(target, "둘만 아는 얘기"));
		assert.ok(chatSaw(sender, "둘만 아는 얘기"), "보낸 사람이 자기 귓속말을 못 봅니다");
		assert.equal(chatSaw(other, "둘만 아는 얘기"), false, "귓속말이 제삼자에게 샜습니다");
	});

	it("게임이 시작되면 막힌다", () => {
		// 판 안에서 통하면 마피아가 낮에 몰래 합을 맞추고 죽은 사람이 산 사람에게
		// 범인을 찍어줄 수 있다. 채널 표가 막아 둔 것을 명령어로 우회하는 셈이다.
		const players = startPlainGame(MIN_PLAYERS);

		chat(players[0], `/귓속말 ${players[1].name} 마피아 누구야`);

		assert.ok(chatSaw(players[0], "게임 중에는 귓속말을 보낼 수 없습니다"));
		assert.equal(chatSaw(players[1], "마피아 누구야"), false);
	});

	it("받는 사람이 보고 있는 탭에 뜬다", () => {
		// 전체 탭으로 못박아 두면 방 탭을 보던 사람은 안 읽음 표시만 받는다.
		// 보내는 쪽 사본은 눈앞에 뜨는데 받는 쪽만 안 뜨는, 두 사람이 서로
		// 다른 화면을 보는 상태가 된다.
		const sender = connect("가");
		const target = connect("나");
		joinRoom(target, 1);
		switchChannel(target, ChatChannel.ROOM);

		chat(sender, "/귓속말 나 여기 봐");

		assert.ok(
			chatLines(target, ChatChannel.ROOM).some(line => line.text.indexOf("여기 봐") >= 0),
			"귓속말이 보고 있지 않은 탭으로 갔습니다"
		);
	});

	it("없는 사람을 부르면 알려준다", () => {
		const sender = connect("가");

		chat(sender, "/귓속말 없는사람 안녕");

		assert.ok(chatSaw(sender, "찾지 못했습니다"));
	});
});

describe("차단", () => {
	it("차단한 사람의 말은 내 화면에서만 사라진다", () => {
		const me = connect("가");
		const rude = connect("나");
		const other = connect("다");

		chat(me, "/차단 나");
		chat(rude, "안 보일 말");

		assert.equal(chatSaw(me, "안 보일 말"), false);
		assert.ok(chatSaw(other, "안 보일 말"), "차단이 남의 화면까지 지웠습니다");
	});

	it("창을 다시 열어도 되살아나지 않는다", () => {
		// 배달에서만 막으면 기록을 되살릴 때 차단한 사람의 말이 그대로 돌아온다.
		const me = connect("가");
		const rude = connect("나");

		chat(me, "/차단 나");
		chat(rude, "안 보일 말");
		sendChat(me, { type: "toggle", open: true }); // 기록을 통째로 다시 받는 경로

		assert.equal(chatSaw(me, "안 보일 말"), false);
	});

	it("진행 안내까지 가리지는 않는다", () => {
		// 사람이 친 말만 가린다. 시스템 안내와 사건 기록까지 덮으면 차단이
		// "저 사람을 안 본다"가 아니라 "게임 진행을 못 본다"가 된다.
		const me = connect("가");
		const rude = connect("나");
		joinRoom(me, 1);
		joinRoom(rude, 1);

		chat(me, "/차단 나");
		disconnect(rude);

		assert.ok(chatSaw(me, "나 님이 퇴장했습니다"), "차단이 진행 안내까지 가렸습니다");
	});

	it("나간 사람의 차단도 이름으로 풀 수 있다", () => {
		// id로만 풀 수 있으면 접속을 끊은 사람의 차단은 영영 남는다.
		const me = connect("가");
		const rude = connect("나");

		chat(me, "/차단 나");
		disconnect(rude);
		chat(me, "/차단해제 나");
		chat(me, "/차단목록");

		assert.ok(chatSaw(me, "차단한 사람이 없습니다"));
	});
});

describe("신고", () => {
	it("접속한 운영자에게만 간다", () => {
		const admin = connect("운영자", { role: 3000 });
		const reporter = connect("신고자");
		const rude = connect("무례한사람");

		chat(reporter, "/신고 무례한사람 계속 도배합니다");

		assert.ok(chatSaw(admin, "신고한 사람 신고자"));
		assert.ok(chatSaw(admin, "계속 도배합니다"));
		assert.ok(chatSaw(reporter, "운영자 1명에게 전달"));
		assert.equal(chatSaw(rude, "신고"), false, "신고당한 사실이 당사자에게 알려졌습니다");
	});

	it("운영자가 없으면 전달되지 않았다고 말한다", () => {
		// 앱 전역 저장소가 없어 신고는 접속한 운영자에게 닿지 않으면 사라진다.
		// 접수된 것처럼 말해두고 아무 일도 일어나지 않는 쪽이 더 나쁘다.
		const reporter = connect("신고자");
		connect("무례한사람");

		chat(reporter, "/신고 무례한사람");

		assert.ok(chatSaw(reporter, "전달되지 않았습니다"));
	});

	it("같은 사람을 두 번 신고할 수 없다", () => {
		const reporter = connect("신고자");
		connect("무례한사람");

		chat(reporter, "/신고 무례한사람");
		chat(reporter, "/신고 무례한사람");

		assert.ok(chatSaw(reporter, "이미 신고한 사람입니다"));
	});
});

describe("채팅 필터", () => {
	it("걸리는 말은 가려서 나간다", () => {
		const speaker = connect("가");
		const listener = connect("나");

		chat(speaker, "야 이 병신아");

		assert.equal(chatSaw(listener, "병신"), false);
		assert.ok(chatSaw(listener, "야 이 ●●아"));
	});

	it("귓속말도 같은 체를 지난다", () => {
		// 체가 명령어 분기보다 앞에 있어야 하는 이유. 뒤에 두면 새 명령을
		// 만들 때마다 거르지 않는 통로가 하나씩 늘어난다.
		const sender = connect("가");
		const target = connect("나");

		chat(sender, "/귓속말 나 이 병신아");

		assert.equal(chatSaw(target, "병신"), false);
	});

	it("영어 욕은 대소문자를 가리지 않는다", () => {
		assert.equal(maskProfanity("What the FUCK"), "What the ●●●●");
	});
});
