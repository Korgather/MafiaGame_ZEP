/**
 * 위젯이 화면에서 차지하는 자리.
 *
 * 이 파일이 지키는 것은 "모바일에서 게임 화면이 남는가" 하나다.
 * 예전에는 이 질문을 가진 층이 없었다 — 서버는 픽셀을 showWidget에 넘기고,
 * 위젯은 뜬 뒤에 스스로 가로 폭만 %로 덮어썼다. 세로는 아무도 덮지 않아
 * 세로 850px 폰이 데스크톱 픽셀을 그대로 받았고, 대기실 400px과 채팅 320px이
 * 화면의 85%를 가렸다. 게다가 덮어쓰기를 부를지 말지는 위젯 각자의 자유라
 * 채팅과 직업 카드는 아예 부르지 않았다.
 *
 * 지금은 서버(Widgets.layoutOf)가 한 곳에서 정해 payload에 실어 보낸다.
 * 그래서 여기서 검증할 수 있는 문장이 생겼다: "열린 위젯은 모두 크기를 받는다".
 */
import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { MAIN_TIGHT, MobileWidth, TopNudge, WidgetSize } from "../src/constants/Assets.ts";
import type { FakeWidget } from "./helpers/Harness.ts";
import {
	chatWidget,
	connect,
	finishPhase,
	hudWidget,
	joinRoom,
	mainWidget,
	resetWorld,
	room,
	sendChat,
	startPlainGame,
} from "./helpers/Harness.ts";

beforeEach(() => resetWorld());

interface Layout {
	anchor: string;
	width: string;
	height: string;
	top?: string;
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** 데스크톱 픽셀 layout을 화면 위 사각형으로. WidgetRearrange의 기준점 셋만 쓴다 */
function rectOf(layout: Layout, screenW: number, screenH: number): Rect {
	const w = parseInt(layout.width, 10);
	const h = parseInt(layout.height, 10);
	const top = parseInt(layout.top || "0", 10);
	if (layout.anchor === "topright") return { x: screenW - w, y: top, w, h };
	if (layout.anchor === "topleft") return { x: 0, y: top, w, h };
	if (layout.anchor === "bottomleft") return { x: 0, y: screenH - h, w, h };
	assert.equal(layout.anchor, "top", `계산할 수 없는 기준점: ${layout.anchor}`);
	return { x: (screenW - w) / 2, y: top, w, h };
}

function overlaps(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * 이 위젯이 마지막으로 받은 크기.
 *
 * 크기는 특정 메시지 종류가 아니라 아무 payload에나 실려 온다 —
 * 위젯이 "크기 메시지를 처리하는 것을 잊는" 자리를 없애기 위해서다.
 * 그래서 종류를 묻지 않고 뒤에서부터 찾는다.
 */
function layoutOf(widget: FakeWidget): Layout {
	const messages = widget.messages;
	for (let i = messages.length - 1; i >= 0; i--) {
		const payload = messages[i] as { layout?: Layout };
		if (payload.layout) return payload.layout;
	}
	throw new Error("위젯이 크기를 한 번도 받지 못했습니다.");
}

/** 모바일 세로는 화면 대비 %다. 숫자만 꺼낸다 */
function heightPercent(widget: FakeWidget): number {
	const height = layoutOf(widget).height;
	assert.ok(height.endsWith("%"), `모바일인데 세로가 %가 아닙니다: ${height}`);
	return Number(height.slice(0, -1));
}

describe("위젯 크기", () => {
	it("데스크톱은 픽셀 그대로, 상단 보정만 붙는다", () => {
		const player = connect("데스크톱");
		const layout = layoutOf(mainWidget(player));

		assert.equal(layout.anchor, "topright");
		assert.equal(layout.width, `${WidgetSize.LOBBY_ROOMS.width}px`);
		assert.equal(layout.height, `${WidgetSize.LOBBY_ROOMS.height}px`);
		assert.equal(layout.top, TopNudge.DESKTOP);
	});

	it("폰은 가로를 꽉 채우고 세로는 화면 대비 %로 받는다", () => {
		const player = connect("폰", { isMobile: true });
		const layout = layoutOf(mainWidget(player));

		assert.equal(layout.anchor, "top");
		assert.equal(layout.width, MobileWidth.PHONE);
		assert.equal(layout.height, `${WidgetSize.LOBBY_ROOMS.mobile}%`);
		assert.equal(layout.top, TopNudge.PHONE);
	});

	it("태블릿은 폰보다 좁게, 상단 보정도 따로 받는다", () => {
		const player = connect("태블릿", { isTablet: true });
		const layout = layoutOf(mainWidget(player));

		// 예전에는 이 판정을 위젯이 window.screen.width로 넘겨짚었다.
		// 지금은 서버가 player.isTablet으로 안다.
		assert.equal(layout.width, MobileWidth.TABLET);
		assert.equal(layout.top, TopNudge.TABLET);
	});

	it("아래·가운데에 붙는 위젯에는 상단 보정이 붙지 않는다", () => {
		const player = connect("폰", { isMobile: true });

		// 상단바를 피하려고 위로 당기는 값이라, 아래에 붙는 채팅에 그대로
		// 적용하면 제자리에서 그만큼 밀려난다.
		assert.equal(layoutOf(chatWidget(player)).top, undefined);
	});

	it("접은 채팅 바는 폰에서도 픽셀 폭이다", () => {
		// 96%로 늘이면 한 줄짜리 버튼이 화면 아래를 통째로 막는다
		const player = connect("폰", { isMobile: true });
		const layout = layoutOf(chatWidget(player));

		assert.equal(layout.width, `${WidgetSize.CHAT_BAR.width}px`);
		assert.equal(layout.height, `${WidgetSize.CHAT_BAR.height}px`);
	});

	it("방 선택 화면은 좌석 목록보다 낮다", () => {
		const player = connect("폰", { isMobile: true });
		const before = heightPercent(mainWidget(player));

		joinRoom(player, 1);

		// 같은 lobby.html이 두 화면을 그리는데 크기는 하나뿐이었다.
		// 방 버튼만 있는 화면이 좌석 8줄짜리 높이를 차지한 채
		// 아래 절반이 비어 있었다.
		assert.ok(before < heightPercent(mainWidget(player)), "방에 들어가도 크기가 그대로입니다.");
	});

	it("단계가 바뀔 때마다 새 위젯도 크기를 함께 받는다", () => {
		const players = startPlainGame(5);
		const target = room(1);

		// 직업 공개 → 밤 → 아침 → 투표. 위젯이 매번 새로 열린다.
		for (let i = 0; i < 4; i++) {
			finishPhase(target);
			for (const player of players) {
				// 크기를 못 받은 위젯이 하나라도 있으면 여기서 던진다
				layoutOf(mainWidget(player));
			}
		}
	});
});

describe("HUD와 보드의 자리", () => {
	/*
	 * 폰 세로(850px)의 세로 예산. 위에 HUD 한 줄 + 보드, 아래에 접은 채팅 바.
	 * 둘을 뺀 가운데가 게임 화면이고 그것이 절반 가까이는 남아야 한다.
	 */
	it("폰에서 HUD+보드는 52% 이하, 게임 화면은 48% 이상 남는다", () => {
		const SCREEN_H = 850;
		const players = startPlainGame(5);
		const player = players[0];
		player.isMobile = true;
		const target = room(1);

		// 밤(능력) → 낮(진행) → 투표 → 개표 → 반론. 화면마다 보드 높이가 다르다
		for (let i = 0; i < 5; i++) {
			finishPhase(target);
			const hud = layoutOf(hudWidget(player));
			const board = layoutOf(mainWidget(player));
			// 첫 판은 "지금 할 일" 줄 몫만큼 큰 HUD_COACH다
			const bar = parseInt(hud.height, 10);
			assert.ok(bar === WidgetSize.HUD.bar || bar === WidgetSize.HUD_COACH.bar, hud.height);
			// 보드는 HUD 바로 아래에 붙는다. 같은 "top" 자리라 내려 주지 않으면 겹친다
			assert.equal(parseInt(board.top || "", 10) - parseInt(hud.top || "", 10), bar);

			const stack = bar + (heightPercent(mainWidget(player)) / 100) * SCREEN_H;
			const game = SCREEN_H - stack - WidgetSize.CHAT_BAR.height;
			assert.ok(stack <= SCREEN_H * 0.52, `${target.phase}: 위쪽이 ${Math.round((stack / SCREEN_H) * 100)}%를 덮습니다`);
			assert.ok(game >= SCREEN_H * 0.48, `${target.phase}: 게임 화면이 ${Math.round((game / SCREEN_H) * 100)}%뿐입니다`);
		}
	});

	it("데스크톱 1366×768·1280×720·1024×768에서 HUD·보드·채팅이 겹치지 않는다", () => {
		const players = startPlainGame(5);
		const player = players[0];
		const target = room(1);

		for (let i = 0; i < 5; i++) {
			finishPhase(target);
			for (const [w, h] of [
				[1366, 768],
				[1280, 720],
				[1024, 768],
			]) {
				const hud = rectOf(layoutOf(hudWidget(player)), w, h);
				const board = rectOf(layoutOf(mainWidget(player)), w, h);
				const chat = rectOf(layoutOf(chatWidget(player)), w, h);
				assert.ok(!overlaps(hud, board), `${w}px ${target.phase}: HUD가 보드와 겹칩니다`);
				assert.ok(!overlaps(hud, chat), `${w}px ${target.phase}: HUD가 채팅과 겹칩니다`);
				assert.ok(!overlaps(board, chat), `${w}px ${target.phase}: 보드가 채팅과 겹칩니다`);
				// 시계와 행동은 한 덩어리로 읽혀야 한다. 화면 양 끝에 떨어져 있으면
				// 남은 시간을 보려고 눈이 화면을 가로지른다
				assert.equal(hud.x + hud.w, board.x + board.w, `${w}px ${target.phase}: HUD와 보드가 같은 모서리에 있지 않습니다`);
				assert.ok(board.y - (hud.y + hud.h) <= 32, `${w}px ${target.phase}: 보드가 HUD에서 떨어져 있습니다`);
			}
		}
	});
});

describe("모바일 채팅과 메인 위젯", () => {
	it("모바일은 접힌 채로 시작하고 데스크톱은 펼친 채로 시작한다", () => {
		// 펼친 채팅은 세로의 34%를 먹는다. 접어도 💬 막대와 미확인 배지는
		// 남으므로 "채팅이 있다"는 사실은 접힌 채로도 전해진다.
		const phone = connect("폰", { isMobile: true });
		assert.equal(chatWidget(phone).lastOfType("init")?.open, false);

		const desktop = connect("데스크톱");
		assert.equal(chatWidget(desktop).lastOfType("init")?.open, true);
	});

	it("모바일에서 채팅을 펼치면 메인 위젯이 자리를 내주고, 접으면 되돌아온다", () => {
		const player = connect("폰", { isMobile: true });
		joinRoom(player, 1);
		const full = heightPercent(mainWidget(player));

		sendChat(player, { type: "toggle", open: true });
		assert.equal(heightPercent(mainWidget(player)), Math.round(full * MAIN_TIGHT));

		sendChat(player, { type: "toggle", open: false });
		assert.equal(heightPercent(mainWidget(player)), full);
	});

	it("메인 위젯을 다시 열지 않고 크기만 바꾼다", () => {
		const player = connect("폰", { isMobile: true });
		joinRoom(player, 1);
		const before = mainWidget(player);

		sendChat(player, { type: "toggle", open: true });

		// 다시 열면 투표 중에 누르던 것이 사라진다. 같은 위젯이어야 한다.
		assert.equal(mainWidget(player), before);
	});

	it("채팅이 펼쳐진 채로 단계가 바뀌어도 새 위젯이 줄어든 채로 뜬다", () => {
		const players = startPlainGame(5);
		const player = players[0];
		// startPlainGame은 데스크톱으로 접속시킨다. 다음 단계부터 모바일로 뜬다
		player.isMobile = true;
		const target = room(1);
		finishPhase(target);

		sendChat(player, { type: "toggle", open: true });
		finishPhase(target);
		const squeezed = heightPercent(mainWidget(player));

		// 줄어든 상태는 위젯이 아니라 서버(PlayerTag.chatOpen)가 기억한다.
		// 그래서 위젯이 통째로 새로 열려도 이어진다.
		// (단계마다 뜨는 위젯이 달라 절대값은 비교할 수 없다. 같은 위젯을
		//  펼친 크기로 되돌려 그 비율을 확인한다)
		sendChat(player, { type: "toggle", open: false });
		assert.equal(squeezed, Math.round(heightPercent(mainWidget(player)) * MAIN_TIGHT));
	});

	it("데스크톱은 채팅을 펼쳐도 메인 위젯이 그대로다", () => {
		const player = connect("데스크톱");
		joinRoom(player, 1);
		const before = layoutOf(mainWidget(player)).height;

		sendChat(player, { type: "toggle", open: true });

		// 세로가 넉넉해서 둘이 함께 떠도 게임 화면이 남는다
		assert.equal(layoutOf(mainWidget(player)).height, before);
	});
});
