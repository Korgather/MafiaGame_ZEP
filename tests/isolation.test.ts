/**
 * 사고의 범위가 사고가 난 곳에서 끝나는지 검증한다.
 *
 * 이 파일이 지키는 문장은 하나다: **한 방의 예외가 다른 방을 멈추지 않는다.**
 * 진행 루프는 방 8개를 onUpdate 콜백 하나 안에서 차례로 돌리므로, 격리가
 * 없으면 3번 방의 예외가 4~8번 방의 그 프레임을 통째로 지운다. 게다가 원인이
 * 방 상태에 남아 있으면 매 프레임 같은 자리에서 다시 던져 뒤쪽 방들이 영구히
 * 멈춘다 — 서로 아무 관계도 없는 방 다섯 개가 함께 죽는다.
 *
 * "던져도 계속 돈다"만 보는 것으로는 검사가 반쪽이다. 조용히 삼키는 코드도
 * 그 조건을 만족하고, 그건 지금보다 나쁘다(잡는 순간 ZEP 서버 로그에서도
 * 사라지므로 아무도 모르는 죽은 방이 남는다). 그래서 모든 케이스가 알림이
 * 실제로 밖으로 나갔는지(world.staffSays)를 함께 본다.
 */
import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import type { Room, Seat } from "../src/types/Game.types.ts";
import { bindMessage } from "../src/services/Widgets.ts";
import {
	FakeWidget,
	chatSaw,
	connect,
	resetWorld,
	room,
	startPlainGame,
	tick,
	world,
} from "./helpers/Harness.ts";

beforeEach(() => resetWorld());

/**
 * 방 하나의 진행을 고장 낸다.
 *
 * 프로덕션 코드에 테스트용 훅을 심지 않으려고 게터로 던진다. 읽는 필드는
 * tickTockPlayed를 골랐다 — 진행(advanceGame)만 읽고 복구 경로는 읽지 않는
 * 유일한 필드다. 그래서 "진행은 실패하고 복구는 성공한다"는 정상 경로가
 * 검사된다. 세터를 비워 두는 이유는 복구가 방을 초기화할 때 이 필드에 쓰기
 * 때문이다. 게터만 두면 그 대입이 다시 던져 복구까지 실패해 버린다.
 */
function breakAdvance(target: Room): void {
	Object.defineProperty(target, "tickTockPlayed", {
		configurable: true,
		get(): boolean {
			throw new Error("진행 중 고장");
		},
		set(): void {},
	});
}

describe("방 단위 예외 격리", () => {
	it("한 방이 던져도 뒤쪽 방은 그 프레임을 계속 진행한다", () => {
		const broken = startPlainGame(5, 1);
		startPlainGame(5, 2);
		// 앞쪽 방을 고장 낸다. 격리가 없으면 이 방에서 루프가 끊겨
		// 뒤쪽 방은 아래 tick에서 한 프레임도 진행하지 못한다.
		breakAdvance(room(1));
		const healthyTimer = room(2).phaseTimer;

		tick(1);

		assert.equal(room(2).phaseTimer, healthyTimer - 1);
		// 조용히 삼키지 않았다
		assert.equal(world.staffSays.length, 1);
		assert.ok(world.staffSays[0].indexOf("방 1") >= 0, world.staffSays[0]);
		// 사고가 난 방은 대기실로 풀렸다. 잠긴 채 남으면 서버 재시작까지 그 자리를 쓸 수 없다
		assert.equal(room(1).started, false);
		assert.equal(room(1).seats.length, 0);
		// 안에 있던 사람은 왜 게임이 끊겼는지 들었다
		assert.ok(chatSaw(broken[0], "오류가 발생해"));
	});

	it("복구된 방은 다음 프레임에 다시 던지지 않는다", () => {
		startPlainGame(5, 1);
		breakAdvance(room(1));

		tick(1);
		tick(1);

		// 격리만 하고 방을 되돌리지 않으면 원인이 방에 남아 매 프레임 다시 던진다
		assert.equal(world.staffSays.length, 1);
	});

	it("복구까지 실패해도 방은 비워져 다시 쓸 수 있다", () => {
		startPlainGame(5, 1);
		// 좌석 목록이 깨진 경우. 진행도 복구도 좌석을 순회하므로 둘 다 던진다
		room(1).seats[0] = null as unknown as Seat;

		tick(1);

		assert.equal(world.staffSays.length, 2);
		assert.ok(world.staffSays[1].indexOf("복구") >= 0, world.staffSays[1]);
		assert.equal(room(1).started, false);
		assert.equal(room(1).seats.length, 0);
	});
});

describe("위젯 메시지 격리", () => {
	it("핸들러가 던져도 위로 새지 않고 스태프에게 알린다", () => {
		const player = connect("조작된클라이언트");
		const widget = new FakeWidget("test.html", "top", 100, 100);
		bindMessage(widget as never, "테스트", () => {
			throw new Error("조작된 payload");
		});

		// 여기서 던지면 실제로는 ZEP 이벤트 콜백을 타고 올라가 그 프레임이 사라진다
		widget.emit(player, { type: "무엇이든" });

		assert.equal(world.staffSays.length, 1);
		assert.ok(world.staffSays[0].indexOf("위젯 테스트") >= 0, world.staffSays[0]);
	});
});
