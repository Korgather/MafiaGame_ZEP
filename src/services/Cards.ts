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
import type { WidgetBox } from "../constants/Assets.ts";
import { Sound, WidgetSize } from "../constants/Assets.ts";
import { GUIDE_CARDS, cardForRole, roleBook } from "../domain/Guide.ts";
import { playSoundTo } from "./Broadcast.ts";
import * as Storage from "../infrastructure/PlayerStorage.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";
import type { CardView } from "../types/Widget.types.ts";
import { field, messageType } from "../types/Widget.types.ts";
import { FtueEvent, trackBeforeFirstGame } from "./FtueAnalytics.ts";
import type { CardPayload } from "./Widgets.ts";
import { bindMessage, closeCard, openCard } from "./Widgets.ts";

/**
 * 카드를 열고 조작을 받는다. 네 화면이 같은 규칙을 쓰도록 여기만 위젯을 만진다.
 *
 * 크기를 받는 이유는 넷 중 하나(도감)만 세로 예산을 넘기기 때문이다.
 * 기본값을 두지 않는다 — 카드를 하나 더 만드는 사람이 크기를 한 번은
 * 생각하게 하려는 것이고, 그 판단을 빠뜨렸을 때 조용히 큰 쪽으로 붙는
 * 것이 바로 도움말에서 일어난 일이다.
 */
function show(player: ScriptPlayer, payload: CardPayload, size: WidgetBox, guide = false): void {
	bindMessage(openCard(player, payload, size), "card", (sender, data) =>
		handleMessage(sender, data, guide)
	);
}

function handleMessage(player: ScriptPlayer, data: unknown, guide: boolean): void {
	switch (messageType(data)) {
		case "close":
			if (guide && field(data, "completed") === true) {
				trackBeforeFirstGame(player, FtueEvent.GUIDE_COMPLETED);
			}
			closeCard(player);
			break;
		case "book":
			if (guide) trackBeforeFirstGame(player, FtueEvent.GUIDE_COMPLETED);
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
	show(
		player,
		{
			type: "init",
			cards: [cardForRole(seat.role)],
			nav: "none",
			timer,
			bookLink: false,
			// nav=none은 머리말 줄을 아예 숨긴다. 채워도 보이지 않는다
			heading: "",
		},
		WidgetSize.CARD
	);
}

/** 규칙과 첫 행동을 잇는 요약 4장. 마지막 장에서 도감으로 이어진다 */
export function showGuide(player: ScriptPlayer): void {
	trackBeforeFirstGame(player, FtueEvent.GUIDE_OPENED);
	tagOf(player).guideSeen = true;
	show(
		player,
		{
			type: "init",
			// readonly 배열을 그대로 넘기면 payload 타입이 맞지 않는다.
			// 복사본을 주면 위젯 쪽 실수로 원본 안내가 바뀔 일도 없다.
			cards: GUIDE_CARDS.slice(),
			nav: "steps",
			timer: 0,
			bookLink: true,
			// nav=steps의 머리말은 "처음이신가요? · 2 / 3"이라 장 번호와 한 몸이다.
			// 그 조합은 위젯이 만든다
			heading: "",
		},
		WidgetSize.CARD,
		true
	);
}

/**
 * 직업 도감. 방이 어느 직업을 쓰는지와 무관하게 ROLE_DEFS 전체를 보여준다.
 * 스스로 닫히지 않는다 — 읽는 속도는 사람마다 다르다.
 *
 * 장수를 여기에 적지 않는다. 직업이 늘 때마다 여러 곳의 숫자를 함께 고쳐야
 * 하는데 실제로 그러지 못했다 — 이 줄과 /도감의 안내가 오랫동안 "14종"이었다.
 */
export function showBook(player: ScriptPlayer): void {
	show(
		player,
		{
			type: "init",
			cards: roleBook(),
			nav: "grid",
			timer: 0,
			bookLink: false,
			// 도감은 이 위젯이 처음부터 알던 화면이라 머리말과 부제(종수·진영 수)를
			// 위젯이 들고 있다. ""을 보내 그 기본값을 그대로 쓴다
			heading: "",
			// 넷 중 유일하게 세로 예산(46%)을 넘는 화면이다. 21종 격자와 진영
			// 구분선이 들어가서 CARD로는 목록이 두 줄만 보이고, 도감은 겹쳐 읽고
			// 곧 닫는 것이라 게임 화면을 항구적으로 먹지 않는다
		},
		WidgetSize.CARD_BOOK
	);
}

/**
 * 도움말. 카드 목록을 인자로 받는다.
 *
 * 무엇이 도움말에 실릴지는 이 파일이 모른다 — 명령어 표를 가진 곳
 * (ChatCommands)이 만들어서 넘긴다. 여기서 COMMANDS를 읽으면 카드 슬롯의
 * 주인이 명령어 표까지 알아야 하고, "운영자 명령은 감춘다"는 판정이
 * 이쪽으로 새어 들어온다.
 *
 * 도감과 같은 격자를 쓴다. 목록이 제 스크롤을 갖고, 한 줄을 눌러 쓰는 법까지
 * 볼 수 있는 화면이 이미 있는데 새 위젯을 만들 이유가 없다.
 */
export function showHelp(player: ScriptPlayer, cards: CardView[]): void {
	show(
		player,
		{
			type: "init",
			cards,
			nav: "grid",
			timer: 0,
			bookLink: false,
			heading: "채팅 도움말",
			// 도감과 같은 격자를 쓰지만 크기는 따라가지 않는다. 이 화면은 읽고
			// 닫는 것이 아니라 보면서 채팅을 치는 것이고, 도감 크기(54%)는 그
			// 채팅창을 덮는다. 도감이 큰 쪽을 받은 이유가 21종이라는 것이니
			// 열 장짜리 목록에는 그 이유도 없다
		},
		WidgetSize.CARD
	);
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
	return !Storage.hasPriorGame(Storage.read(player));
}
