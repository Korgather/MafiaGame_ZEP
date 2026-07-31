/**
 * 겹쳐 읽는 카드 슬롯(tag.cardWidget)의 유일한 주인.
 *
 * 왜 서비스를 하나 더 두는가
 * --------------------------
 * 카드를 여는 세 자리가 서로 멀다. 직업 공개는 게임 시작(GameFlow),
 * 첫 안내는 방 참가(Lobby), 도감은 대기실 버튼과 /도감 명령(ChatService)이다.
 * 여는 코드를 각자 두면 "닫기를 눌렀을 때 무엇을 하는가"라는 같은 판단이
 * 세 곳에 복사되고, 도감으로 건너가는 길이 생기는 순간 셋이 어긋난다.
 *
 * 실제로 직전 구조가 그랬다 — GameFlow가 openRoleCard와 그 onMessage
 * 핸들러를 함께 들고 있었고, 카드는 게임 진행과 아무 상관이 없는데도
 * 상태 머신 파일 안에 살았다.
 *
 * 여기 모으면 슬롯의 수명이 한 파일에 다 있다. 카드를 하나 더 만들고
 * 싶으면 show*를 하나 더하면 되고, 그 카드도 같은 닫기 규칙을 물려받는다.
 */
import type { ScriptPlayer } from "zep-script";
import type { Seat } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import { GUIDE_CARDS, cardForRole, roleBook } from "../domain/Guide.ts";
import { playSoundTo } from "./Broadcast.ts";
import * as Storage from "../infrastructure/PlayerStorage.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";
import { messageType } from "../types/Widget.types.ts";
import type { CardPayload } from "./Widgets.ts";
import { bindMessage, closeCard, openCard } from "./Widgets.ts";

/** 카드를 열고 조작을 받는다. 세 화면이 같은 규칙을 쓰도록 여기만 위젯을 만진다 */
function show(player: ScriptPlayer, payload: CardPayload): void {
	bindMessage(openCard(player, payload), "card", handleMessage);
}

function handleMessage(player: ScriptPlayer, data: unknown): void {
	switch (messageType(data)) {
		case "close":
			closeCard(player);
			break;
		case "book":
			// 안내 마지막 장에서 도감으로 건너간다. 같은 슬롯을 이어받으므로
			// 카드가 둘 겹치지 않는다 (openCard가 먼저 닫는다)
			showBook(player);
			break;
	}
}

/**
 * 게임이 시작될 때 자기 직업 한 장.
 *
 * 남은 시간 막대를 함께 보낸다 — 카드가 곧 사라진다는 것을 모르면
 * 다 읽기 전에 화면이 바뀌고, 그다음 밤 화면에서 자기 능력을 다시 찾는다.
 *
 * 그 시간을 인자로 받는다. 전에는 룰셋의 ROLE_REVEAL을 여기서 직접 읽었는데,
 * 그러면 "이 단계의 길이"와 "화면에 그리는 길이"가 두 곳에서 따로 정해진다.
 * 실제로 두 가지가 어긋났다 — 공개 도중 재접속하면 남은 5초짜리 단계 위에
 * 9초를 처음부터 세는 막대가 떴고, 앞에 전환 컷이 붙으면서 단계가 길어지자
 * 정상 경로에서도 어긋나게 됐다. 남은 시간을 아는 것은 방(room.phaseTimer)뿐이다.
 */
export function showRoleReveal(player: ScriptPlayer, seat: Seat, timer: number): void {
	// 게임이 시작되는 순간 유일하게 나는 소리다. 전에는 카드가 조용히 떴고,
	// 앞에 붙는 "🎭 게임 시작" 컷도 소리가 없어서 판이 열린 것을 화면으로만
	// 알았다. 컷에 따로 소리를 더 얹지 않는 이유는 둘이 같은 순간이기 때문이다
	playSoundTo(player, Sound.REVEAL);
	show(player, {
		type: "init",
		cards: [cardForRole(seat.role)],
		nav: "none",
		timer,
		bookLink: false,
	});
}

/** 규칙 요약 3장. 마지막 장에서 도감으로 이어진다 */
export function showGuide(player: ScriptPlayer): void {
	tagOf(player).guideSeen = true;
	show(player, {
		type: "init",
		// readonly 배열을 그대로 넘기면 payload 타입이 맞지 않는다.
		// 복사본을 주면 위젯 쪽 실수로 원본 안내가 바뀔 일도 없다.
		cards: GUIDE_CARDS.slice(),
		nav: "steps",
		timer: 0,
		bookLink: true,
	});
}

/** 직업 14종 도감. 스스로 닫히지 않는다 — 읽는 속도는 사람마다 다르다 */
export function showBook(player: ScriptPlayer): void {
	show(player, {
		type: "init",
		cards: roleBook(),
		nav: "grid",
		timer: 0,
		bookLink: false,
	});
}

/**
 * 이 사람에게 첫 안내를 띄워야 하는가.
 *
 * 판정이 둘인 이유는 게스트다. 영구 판정은 playCount가 하는데
 * (countPlay가 판을 시작할 때 올린다), PlayerStorage.update는 게스트에게
 * 통째로 no-op이라 게스트의 playCount는 영원히 0이다. 그것만 보면
 * 게스트는 방에 들어갈 때마다 안내를 다시 받는다.
 *
 * 그래서 접속 범위 플래그를 함께 본다. 로그인한 사람은 첫 판 이후 영영
 * 보지 않고, 게스트는 접속당 한 번만 본다. 도감은 언제든 대기실 📖과
 * /도감으로 다시 열 수 있으므로 이 정도로 충분하다.
 */
export function needsGuide(player: ScriptPlayer): boolean {
	if (tagOf(player).guideSeen) return false;
	return !Storage.read(player).playCount;
}
