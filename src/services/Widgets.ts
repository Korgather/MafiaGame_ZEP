/**
 * 위젯 생성. 모바일/데스크톱 분기와 초기 payload가 사는 유일한 곳.
 *
 * 기존에는 `p.isMobile ? p.showWidget(x, "top", ...) : p.showWidget(x, "topright", ...)`
 * 형태의 if가 7곳에 흩어져 있었고 크기 숫자도 매번 다시 적혀 있었다.
 * 위젯을 닫는 코드(`if (tag.widget) { tag.widget.destroy(); tag.widget = null; }`)는
 * 12곳에 복사돼 있었는데, 그중 몇 곳은 null 대입을 빠뜨려 이미 파괴된 위젯에
 * sendMessage를 호출했다.
 */
import type { ScriptPlayer, ScriptWidget, WidgetAlign } from "zep-script";
import type { CutTone, Seat, Team } from "../types/Game.types.ts";
import type {
	CardView,
	ChatChannelView,
	LobbySeatView,
	ProfileStat,
	RevealView,
	SeatView,
	WidgetLayout,
} from "../types/Widget.types.ts";
import { roleName } from "../domain/Roles.ts";
import type { RuleSet } from "../domain/RuleSet.ts";
import type { ZepAudience } from "../domain/chat/ChatChannel.ts";
import type { ChatMessage } from "../domain/chat/ChatMessage.ts";
import type { WidgetBox } from "../constants/Assets.ts";
import {
	MAIN_TIGHT,
	MobileWidth,
	OVERLAY_Z,
	TopNudge,
	WidgetFile,
	WidgetSize,
} from "../constants/Assets.ts";
import { kickVotesNeeded } from "../entities/Room.ts";
import { guard } from "../infrastructure/Fault.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";

/**
 * 위젯 메시지 핸들러를 등록한다. `.onMessage.Add`를 직접 부르는 곳은 여기뿐이다.
 *
 * 왜 관문을 하나 두는가: 위젯은 클라이언트에서 도는 코드라 서버가 보낸 적
 * 없는 값이 올 수 있고, 핸들러가 던지면 그 예외는 ZEP 이벤트 콜백을 타고
 * 위로 올라간다. 한 사람의 조작된 메시지 하나가 그 프레임 전체를 세우는
 * 셈이라, 여섯 개 핸들러가 각자 방어하는 대신 등록 지점에서 한 번 감싼다.
 *
 * eslint의 no-restricted-syntax가 이 파일 밖에서 `.onMessage.Add`를 막는다.
 * 새 위젯을 붙이는 사람이 이 관문을 기억하지 않아도 되게 하기 위해서다 —
 * 규칙을 문서에 적어두는 것과 컴파일 단계에서 막는 것은 다른 일이다.
 */
export function bindMessage(
	widget: ScriptWidget,
	scope: string,
	handler: (sender: ScriptPlayer, data: unknown) => void,
): void {
	// 관문 자체는 등록해야 한다. 파일 단위로 규칙을 끄면 같은 규칙에 들어 있는
	// undefined 인자 검사까지 함께 꺼지므로 이 한 줄만 예외로 둔다.
	// eslint-disable-next-line no-restricted-syntax
	widget.onMessage.Add((sender, data) => {
		guard(`위젯 ${scope}`, () => handler(sender, data));
	});
}

/** 화면 위쪽 고정 위젯의 정렬. 모바일은 가로 폭이 좁아 중앙 상단을 쓴다 */
function topAlign(player: ScriptPlayer): "top" | "topright" {
	return player.isMobile ? "top" : "topright";
}

/**
 * 위젯이 실제로 차지할 상자. 여는 쪽에서 한 번 정해 payload에 실어 보낸다.
 *
 * 기존 구조의 문제
 * ----------------
 * 크기 결정이 두 층으로 갈려 있었다. 서버는 픽셀을 showWidget에 넘기고,
 * 위젯은 뜬 뒤에 bridge.js의 rearrange()를 불러 가로 폭만 %로 덮어썼다.
 * 세로는 어느 쪽도 덮지 않아 모바일에서도 픽셀 그대로 남았다 —
 * 이것이 화면의 85%가 위젯으로 덮인 직접 원인이다.
 * 게다가 rearrange를 부르는 것은 위젯의 자유라서 채팅과 직업 카드
 * 두 개는 아예 부르지 않았고, 모바일 보정이 통째로 빠져 있었다.
 *
 * 지금은 이 함수가 유일한 결정 지점이고 bridge.js는 받은 대로 적용만 한다.
 * 위젯이 "부르는 것을 잊을" 수 있는 자리가 없어졌다.
 *
 * @param tight 채팅이 펼쳐져 있어 자리를 내주어야 하는가 (모바일 전용)
 */
function layoutOf(
	player: ScriptPlayer,
	align: WidgetAlign,
	size: WidgetBox,
	tight: boolean
): WidgetLayout {
	// 덮는 위젯은 기기도 채팅 상태도 보지 않는다. 화면 전체가 곧 크기다.
	// 이 분기가 여기 있는 이유는 "크기를 정하는 곳은 하나"라는 이 함수의
	// 약속 때문이다 — 부르는 쪽에서 layout을 손수 지으면 그 약속이 깨진다.
	if (size.fill) {
		return { anchor: align, width: "100%", height: "100%", zIndex: OVERLAY_Z };
	}

	const mobile = player.isMobile;
	const tablet = mobile && player.isTablet;
	const percent = size.mobile ? Math.round(size.mobile * (tight ? MAIN_TIGHT : 1)) : 0;
	const layout: WidgetLayout = {
		anchor: align,
		width: mobile ? (tablet ? MobileWidth.TABLET : MobileWidth.PHONE) : `${size.width}px`,
		height: mobile && percent > 0 ? `${percent}%` : `${size.height}px`,
	};
	// 상단 보정은 위쪽에 붙는 위젯에만 뜻이 있다. 아래(채팅)나 가운데(직업
	// 카드)에 붙이면 제자리에서 그만큼 밀려난다. startsWith는 Jint에 없다.
	if (align.indexOf("top") === 0) {
		layout.top = !mobile ? TopNudge.DESKTOP : tablet ? TopNudge.TABLET : TopNudge.PHONE;
	}
	return layout;
}

/**
 * 채팅창의 정렬. 다른 위젯이 전부 위쪽을 쓰므로 아래쪽에 둔다.
 *
 * 화면을 가리지 않는 것이 이 위젯의 요구사항 1번인데, 위쪽은 이미 진행
 * 화면·투표·능력 위젯이 번갈아 차지한다. 아래로 내리면 겹칠 일이 없다.
 */
function chatAlign(player: ScriptPlayer): "bottom" | "bottomleft" {
	return player.isMobile ? "bottom" : "bottomleft";
}

/**
 * 위젯을 열면서 초기 payload를 함께 보낸다.
 *
 * 예전에는 여는 함수가 ScriptWidget만 돌려주고 payload는 호출부가 각자
 * sendMessage로 보냈다. 안 보내도 컴파일이 통과했기 때문에 실제로 두 부류가 샜다.
 *
 *   - night.html: 세 호출부가 전부 payload를 빠뜨려, 남은 시간과 인원수가
 *     초기 HTML 상태에서 멈춰 있었다
 *   - WatingRoom.html: setID에 isMobile을 빠뜨려 모바일·태블릿 레이아웃
 *     보정(WidgetRearrange)이 통째로 실행되지 않았다
 *
 * payload를 여는 함수의 필수 인자로 만들면 이 부류가 전부 컴파일 에러가 된다.
 * layout을 여기서 붙이는 것도 같은 이유다 — 크기를 아는 곳이 하나뿐이면
 * 호출부가 빠뜨릴 수 없다. 예전에는 isMobile만 실어 보내고 그것으로 무엇을
 * 할지는 위젯에게 맡겼는데, 그래서 둘이 아무것도 하지 않았다.
 */
function open(
	player: ScriptPlayer,
	fileName: string,
	align: WidgetAlign,
	size: WidgetBox,
	payload: object,
	tight: boolean
): ScriptWidget {
	const widget = player.showWidget(fileName, align, size.width, size.height);
	widget.sendMessage({ ...payload, layout: layoutOf(player, align, size, tight) });
	return widget;
}

/**
 * 단계별 메인 위젯을 연다. 한 사람에게 하나만 떠 있다 (tag.widget).
 *
 * 다섯 개의 여는 함수가 전부 "닫고 · 열고 · tag에 물리는" 같은 세 줄이었다.
 * 모바일 축소(tight)와 상자 기억(mainBox)이 늘면서 같은 것을 다섯 번
 * 적어야 할 뻔했으므로 여기서 한 번만 적는다.
 */
function openMain(
	player: ScriptPlayer,
	fileName: string,
	align: WidgetAlign,
	size: WidgetBox,
	payload: object
): ScriptWidget {
	closeMain(player);
	const tag = tagOf(player);
	// 채팅이 이미 펼쳐진 채로 단계가 바뀌면 새 위젯도 줄어든 채로 떠야 한다
	const widget = open(player, fileName, align, size, payload, player.isMobile && tag.chatOpen);
	// 나중에 채팅을 펼칠 때 이 위젯의 상자를 다시 계산해야 한다.
	// 위젯 핸들에는 자기가 어떤 크기로 열렸는지가 남지 않아 여기 적어둔다.
	tag.mainBox = { align, size };
	tag.widget = widget;
	return widget;
}

/**
 * 모바일에서 채팅을 펼치면 메인 위젯이 자리를 내주고, 접으면 되돌린다.
 *
 * 위젯을 다시 열지 않는다 — 투표 중이라면 누르던 것이 사라진다.
 * bridge.js가 payload에 실린 layout을 종류와 무관하게 적용하므로,
 * 상자만 바꾸는 메시지에 위젯 쪽 핸들러는 필요 없다.
 */
export function squeezeMain(player: ScriptPlayer, chatOpen: boolean): void {
	const tag = tagOf(player);
	if (!player.isMobile || !tag.widget || !tag.mainBox) return;
	tag.widget.sendMessage({
		type: "layout",
		layout: layoutOf(player, tag.mainBox.align, tag.mainBox.size, chatOpen),
	});
}

/**
 * 게임 중 화면 어디에나 실리는 "나는 누구인가".
 *
 * 기존에는 직업이 시작 직후 카드 5초에만 나오고 그 뒤로는 어디에도 없었다.
 * 처음 해보는 사람이 가장 많이 막히던 지점이 이것이다 — 자기 능력이
 * 무엇인지 확인할 방법이 없어서 밤 화면에서 아무거나 눌러 봤다.
 * 화면마다 직업 칩 하나를 상시 노출하면 그 질문이 사라진다.
 */
interface Identity {
	/** 칩에 그대로 찍히는 문구. 유령이면 "유령" */
	role: string;
	team: Team;
	/** false면 유령 색으로 표시된다 */
	alive: boolean;
}

/**
 * 좌석에서 직업 칩을 만든다.
 *
 * "죽으면 유령으로 보인다"는 규칙이 전에는 phase.html 안에만 있었다
 * (`data.alive === false ? "유령" : data.role`). 그래서 같은 칩을 쓰는
 * roleAction 위젯은 그 규칙을 몰라 죽은 사람에게 직업을 그대로 보여줬고,
 * 서버는 세 곳(밤 화면·낮 화면·밤 능력)에서 role/team/alive 세 줄을
 * 각각 손으로 적고 있었다. 규칙과 조립을 서버 한 곳으로 모은다 —
 * 관전자 칩("관전")도 같은 자리에 들어갈 수 있게 된다.
 */
export function identityOf(seat: Seat): Identity {
	return {
		role: seat.alive ? roleName(seat.role) : "유령",
		team: seat.team,
		alive: seat.alive,
	};
}

/** 밤/아침 진행 화면 */
export interface PhasePayload extends Identity {
	type: "init";
	phase: "night" | "day";
	/** 몇 번째 밤/아침인가 */
	turn: number;
	total: number;
	aliveCount: number;
	timer: number;
	note: string;
	/** 밤사이 일어난 일. 채팅으로 흘러가면 놓친다 */
	deaths: string[];
	/**
	 * 좌석 없이 보고만 있는가.
	 *
	 * 선택 항목이 아니라 필수다. 빠뜨리면 undefined가 되어 "관전이 아니다"로
	 * 조용히 읽히는데, 그 실수의 결과가 "관전 종료 버튼이 없어 갇힌 사람"이다.
	 * 화면을 여는 네 곳이 전부 한 번씩 답하게 만든다.
	 */
	spectating: boolean;
}

/** 투표 화면 */
export interface VotePayload {
	type: "init";
	myNum: number;
	seats: SeatView[];
	timer: number;
	/** 이미 찍어둔 대상. 재접속으로 화면을 다시 열 때 표시를 복원한다 */
	picked: number;
}

/** 개표 화면. 같은 vote.html이 받는다 */
export interface VoteResultPayload {
	type: "result";
	myNum: number;
	seats: SeatView[];
	/** 처형된 참가 번호. 없으면 0 */
	executed: number;
	message: string;
	timer: number;
}

/** 투표 진행률. 누가 누구를 찍었는지는 개표 전까지 보내지 않는다 */
export interface VoteProgressPayload {
	type: "progress";
	voted: number;
	alive: number;
}

/** 종료 화면 */
export interface GameOverPayload {
	type: "init";
	winner: Team;
	/** 보는 사람의 진영. 자기가 이겼는지부터 알려주기 위해 */
	team: Team;
	reason: string;
	players: RevealView[];
	/** 대기실로 돌아가기까지. 이 화면만 남은 시간이 없으면 갑자기 사라진다 */
	timer: number;
}

/**
 * 겹쳐 읽는 카드. 직업 공개·첫 안내·직업 도감이 이 하나를 함께 쓴다.
 *
 * 셋의 차이는 내용이 아니라 "몇 장을 어떻게 넘기는가"뿐이라 nav 하나로
 * 갈린다. 직업별 문구는 물론이고 안내 문구까지 서버가 완성해서 보내므로
 * 위젯은 직업이 몇 종인지도, 규칙이 무엇인지도 알 필요가 없다.
 */
export interface CardPayload {
	type: "init";
	cards: CardView[];
	/** none=한 장 · steps=앞으로만 · grid=목록에서 골라 들어간다 */
	nav: "none" | "steps" | "grid";
	/** 0이면 남은 시간 막대를 숨긴다 (스스로 닫히지 않는 카드) */
	timer: number;
	/** 마지막 장에 "직업 보러 가기"를 붙인다 */
	bookLink: boolean;
}

/**
 * 밤 능력 위젯.
 *
 * 기존 payload는 total·liveList(번호 배열)·teamIndexArray를 따로 보냈고,
 * 위젯은 직업 이름(한글)을 switch해서 "무엇을 하라"는 문구를 골랐다.
 * 직업을 추가하면 서버와 위젯 두 곳을 고쳐야 했다. 이제 문구는 서버가
 * 보내고, 위젯은 어떤 직업이 있는지 알 필요가 없다.
 */
export interface NightActionPayload extends Identity {
	type: "init";
	myNum: number;
	/** 무엇을 하라는 한 줄. 지목이 없으면 빈 문자열 */
	prompt: string;
	/** 지목 대상. 비어 있으면 격자를 숨긴다 */
	seats: SeatView[];
	timer: number;
	note: string;
}

/**
 * 새로 열린 채팅창이 어디에 포커스를 둘지.
 *
 * ""는 건드리지 않는다는 뜻이다. 게임을 보고 있던 사람의 포커스를 뺏는 것은
 * 채팅창이 뜨는 것보다 훨씬 거슬리므로 이쪽이 기본이다. 나머지 둘은
 * "게임 화면에서 Enter(또는 /)를 눌러서 열었다"는 뜻이고, 그때만 포커스를
 * 가져간다. "command"는 /까지 미리 찍어준다.
 */
export type ChatFocus = "" | "input" | "command";

/**
 * 통합 채팅창을 여는 payload.
 *
 * 위젯은 직업도 단계도 모른다. 어떤 탭이 있는지(channels), 어디에 쓸 수
 * 있는지(write), 무엇을 빠른 메시지로 내밀지(quick)를 전부 서버가 정해서
 * 보낸다. 밤에 마피아 탭이 열리는 규칙은 ChatPermission 한 곳에만 있고
 * 위젯은 받은 목록을 그릴 뿐이다 — 직업이 늘어도 chat.html은 그대로다.
 */
export interface ChatPayload {
	type: "init";
	/** 지금 열려 있는 탭들 (표시 순서대로) */
	channels: ChatChannelView[];
	active: string;
	/** 지금 단계에 어울리는 빠른 메시지 */
	quick: string[];
	/** 펼친 상태인가. 위젯 크기가 이 값으로 갈린다 */
	open: boolean;
	/**
	 * 내 playerId.
	 *
	 * 위젯이 "내가 쓴 말"을 오른쪽에 그리려면 기준이 필요하다. 참가 번호로는
	 * 안 된다 — 좌석이 없는 전체 채팅에서는 모두가 0번이라 모든 발언이
	 * 내 것처럼 보인다. id는 어디서든 나 하나만 가리킨다.
	 */
	myId: string;
	/** 권한에 맞게 걸러낸 지난 기록 (오래된 것부터) */
	lines: ChatMessage[];
	/**
	 * 뜨자마자 어디에 포커스를 둘지.
	 *
	 * 접기/펴기가 위젯 재생성이라 "펴고 나서 입력창에 포커스"를 위젯이 혼자
	 * 이어 할 수 없다. 앞 문서가 남긴 의도를 서버가 한 번 들고 있다가 새 문서에
	 * 넘겨준다. 서버에 저장하지는 않는다 — 저장하면 재접속 때 되살아나서
	 * 게임을 보고 있는 사람의 포커스를 뜬금없이 가져간다.
	 */
	focus: ChatFocus;
}

/**
 * 단계 전환 컷.
 *
 * 카드와 같은 겹치는 위젯이지만 자리는 따로다(tag.cutWidget). 한 자리를
 * 나눠 쓰면 "밤이 되는 컷이 도는 동안 직업 도감을 열어 둔 사람"에서 둘 중
 * 하나가 조용히 사라진다 — 어느 쪽이 사라져도 잘못이다.
 */
export interface CutPayload {
	type: "init";
	title: string;
	/** 한 줄씩 차례로 떠오른다. 비어 있으면 제목만 */
	lines: string[];
	tone: CutTone;
	/**
	 * 연출 길이(ms).
	 *
	 * 위젯이 스스로 정하지 않는다. 컷을 닫는 것은 서버(Cut.ts의 advanceCut)라
	 * 양쪽이 각자 계산하면 어긋난 만큼 빈 화면이 남거나 마지막 줄이 잘린다.
	 */
	ms: number;
}

/**
 * 사람을 클릭했을 때 뜨는 프로필 창.
 *
 * 직업·진영은 절대 들어가지 않는다. 이 창은 "남을 클릭한다"로 열리므로
 * 여기에 직업이 실리면 게임이 끝난다. 그래서 payload에 role 자리를 아예
 * 두지 않았다 — 나중에 누가 실수로 채울 수 있는 칸을 만들지 않는 것이
 * 주석으로 금지하는 것보다 확실하다.
 */
export interface ProfilePayload {
	type: "init";
	name: string;
	/** 등급 한 줄 (Rewards.rankOf) */
	rank: string;
	/**
	 * 아바타 이미지 URL. 빈 문자열이면 위젯이 글리프로 대신한다.
	 *
	 * 위젯이 아니라 서버가 URL을 조립한다. 외부 호스트 문자열이 위젯 HTML에
	 * 있으면 빌드가 막는다(tools/build-widgets.js의 EXTERNAL) — 위젯이 스스로
	 * 어딘가로 요청을 보내기 시작하는 것을 그 검사가 지키고 있다.
	 */
	avatar: string;
	/** 지금 어디에 있는가. "3번 방 (진행 중)" / "대기실" */
	where: string;
	stats: ProfileStat[];
	/** 자기 자신을 클릭했는가. 머리말이 갈린다 */
	self: boolean;
}

/** 채널 목록·빠른 메시지만 다시 보낸다. 단계가 바뀌거나 죽었을 때 */
export interface ChatChannelsPayload {
	type: "channels";
	channels: ChatChannelView[];
	active: string;
	quick: string[];
}

/** 새 메시지 한 줄 + 갱신된 미확인 개수 */
export interface ChatLinePayload {
	type: "line";
	line: ChatMessage;
	channels: ChatChannelView[];
}

/**
 * 방금 한 말을 ZEP 기본 채팅으로도 내보내라는 지시. 보낸 사람에게만 간다.
 *
 * 말풍선은 말한 사람의 클라이언트가 자기 아바타 위에 띄우는 것이라, 서버가
 * 대신 띄워줄 수 없다. 그래서 발언은 서버까지 갔다가 허가와 함께 되돌아온다.
 *
 * 위젯이 보내는 김에 바로 띄우면 왕복 한 번을 아낄 수 있지만, 그러면 발언
 * 권한을 아는 곳이 서버와 위젯 둘이 된다. 둘이 어긋나는 순간(밤이 되기
 * 직전, 죽은 직후)에 서버가 버린 말이 말풍선으로는 뜬다.
 */
export interface ChatSayPayload {
	type: "say";
	text: string;
	/**
	 * 이 말이 닿아도 되는 범위. 위젯이 그대로 chatAreaType으로 쓴다.
	 *
	 * 필수 필드인 것이 중요하다. 기본값을 두면 청중을 정하는 것을 잊은 호출이
	 * 조용히 맵 전체로 나간다 — 방 채팅에는 그것이 곧 사고다. 판단은 전부
	 * ChatChannel의 zepAudienceFor 안에 있고 여기는 그 답을 옮기는 자리다.
	 */
	area: ZepAudience;
}

/**
 * 이미 열려 있는 메인 위젯을 갱신한다. 없으면 조용히 넘어간다.
 *
 * 화면을 다시 여는 것과 값 하나를 고쳐 보내는 것은 다르다. 투표 진행률처럼
 * 자주 바뀌는 값 때문에 위젯을 재생성하면 사용자가 누르던 것이 사라진다.
 */
export function updateMain(player: ScriptPlayer, payload: object): void {
	const widget = tagOf(player).widget;
	if (widget) widget.sendMessage(payload);
}

export function closeMain(player: ScriptPlayer): void {
	const tag = tagOf(player);
	if (tag.widget) {
		tag.widget.destroy();
		tag.widget = null;
	}
}

export function closeCard(player: ScriptPlayer): void {
	const tag = tagOf(player);
	if (tag.cardWidget) {
		tag.cardWidget.destroy();
		tag.cardWidget = null;
	}
}

export function closeCut(player: ScriptPlayer): void {
	const tag = tagOf(player);
	if (tag.cutWidget) {
		tag.cutWidget.destroy();
		tag.cutWidget = null;
	}
}

export function closeProfile(player: ScriptPlayer): void {
	const tag = tagOf(player);
	if (tag.profileWidget) {
		tag.profileWidget.destroy();
		tag.profileWidget = null;
	}
}

export function closeChat(player: ScriptPlayer): void {
	const tag = tagOf(player);
	if (tag.chatWidget) {
		tag.chatWidget.destroy();
		tag.chatWidget = null;
	}
}

/** 이미 열려 있는 채팅창에 메시지를 보낸다. 닫혀 있으면 조용히 넘어간다 */
export function updateChat(
	player: ScriptPlayer,
	payload: ChatChannelsPayload | ChatLinePayload | ChatSayPayload
): void {
	const widget = tagOf(player).chatWidget;
	if (widget) widget.sendMessage(payload);
}

/**
 * 대기실 위젯을 열고 tag.widget에 물린다.
 *
 * 정원(최소·최대 인원)은 여기서 보내지 않는다. 이 메시지는 월드에 들어올 때
 * 한 번만 나가는데, 그 시점에는 아직 어느 방도 고르지 않았다. 정원은 방마다
 * 다르므로(속도전 4~8, 침묵전 8~12) 여기 실으면 화면은 영원히 전역값만 알고,
 * 8번 방에서 네 명이 준비했을 때 "곧 시작합니다."를 띄운 채 시작하지 않는다.
 *
 * 강퇴 필요 표수도 같은 이유로 빠진다. 둘 다 좌석 목록(pushLobby)에 실린다.
 */
export function openLobby(player: ScriptPlayer): ScriptWidget {
	// 방 선택 크기로 연다. 방 안이었다면 곧바로 오는 pushLobby가 늘려준다
	return openMain(player, WidgetFile.LOBBY, topAlign(player), WidgetSize.LOBBY_ROOMS, {
		type: "setID",
		id: player.id,
	});
}

/**
 * 대기실 좌석 목록을 다시 그린다. 빈 목록은 "방 밖"이라는 뜻이다.
 *
 * 크기를 여기서 함께 보내는 이유: lobby.html은 방 선택과 좌석 목록
 * 두 화면을 그리는데 크기는 하나뿐이라, 방 버튼 8개만 있는 화면도
 * 좌석 8줄짜리 높이를 차지한 채 아래 절반이 비어 있었다.
 * 어느 화면인지는 목록이 비었는지로 정해지므로 보내는 쪽이 곧 아는 쪽이다.
 *
 * 정원과 강퇴 필요 표수도 같이 보낸다. 둘 다 한 번 보내고 마는 setID에 실을
 * 수 없는 값이다 — 정원은 어느 방에 앉았는지가, 강퇴 표수는 지금 인원이
 * 정한다. 좌석이 늘거나 줄면 이 메시지가 어차피 다시 오므로 화면의
 * "3명 더 모이면"과 "강퇴 2/3"이 항상 서버가 판정하는 수를 가리킨다.
 *
 * rules가 null이면 방 밖이다. 그 화면(방 선택)에는 정원이라는 것이 없으므로
 * 전역 상수로 메우지 않고 0을 보낸다 — 위젯은 0을 "받지 않았다"로 읽는다.
 */
export function pushLobby(
	player: ScriptPlayer,
	seats: LobbySeatView[],
	rules: RuleSet | null
): void {
	const tag = tagOf(player);
	if (!tag.widget) return;
	const size = seats.length > 0 ? WidgetSize.LOBBY : WidgetSize.LOBBY_ROOMS;
	const align = topAlign(player);
	tag.mainBox = { align, size };
	tag.widget.sendMessage({
		type: "init",
		data: seats,
		kickVotes: kickVotesNeeded(seats.length),
		minPlayers: rules ? rules.minPlayers : 0,
		maxPlayers: rules ? rules.maxPlayers : 0,
		layout: layoutOf(player, align, size, player.isMobile && tag.chatOpen),
	});
}

/** 밤/아침 진행 화면 */
export function openPhase(player: ScriptPlayer, payload: PhasePayload): ScriptWidget {
	return openMain(player, WidgetFile.PHASE, topAlign(player), WidgetSize.PHASE, payload);
}

/** 투표 화면. 개표도 같은 파일이라 payload 타입만 다르다 */
export function openVote(
	player: ScriptPlayer,
	payload: VotePayload | VoteResultPayload
): ScriptWidget {
	return openMain(player, WidgetFile.VOTE, topAlign(player), WidgetSize.VOTE, payload);
}

/** 종료 화면 */
export function openGameOver(player: ScriptPlayer, payload: GameOverPayload): ScriptWidget {
	return openMain(player, WidgetFile.GAME_OVER, topAlign(player), WidgetSize.GAME_OVER, payload);
}

/** 밤 능력 위젯. 조작 대상이 많아 모바일에서도 상단 중앙 고정 */
export function openRoleAction(player: ScriptPlayer, payload: NightActionPayload): ScriptWidget {
	return openMain(player, WidgetFile.ROLE_ACTION, "top", WidgetSize.ROLE_ACTION, payload);
}

/**
 * 통합 채팅창. 메인 위젯과 독립이라 단계가 바뀌어도 닫히지 않는다.
 *
 * 접기/펼치기가 크기를 바꿔 다시 여는 것으로 구현되어 있으므로 이 함수는
 * 토글에서도 그대로 재사용된다 (payload.open이 크기를 고른다).
 */
export function openChat(player: ScriptPlayer, payload: ChatPayload): ScriptWidget {
	closeChat(player);
	const widget = open(
		player,
		WidgetFile.CHAT,
		chatAlign(player),
		payload.open ? WidgetSize.CHAT : WidgetSize.CHAT_BAR,
		payload,
		// 자리를 내주는 쪽은 메인 위젯이다. 채팅은 늘 제 크기로 뜬다
		false
	);
	tagOf(player).chatWidget = widget;
	return widget;
}

/**
 * 겹쳐 읽는 카드를 연다.
 *
 * 기존에는 직업별 HTML 파일명을 인자로 받았고 payload는 아예 보내지 않았다
 * (카드가 읽을 것이 없었으니까). 그래서 카드는 그림 한 장이었고,
 * 5초 동안 "당신은 의사입니다"만 말한 뒤 사라졌다. 무엇을 해야 하는지는
 * 알려주지 않았다.
 *
 * 메인 위젯(tag.widget)을 건드리지 않는다. 대기실에서 도감을 열면 대기실이
 * 그대로 살아 있고 카드만 위에 뜬다. 반대로 단계가 바뀌면 그 단계가
 * closeCard로 이 자리를 회수하므로, 밤이 되었는데 도감이 지목 화면을
 * 덮고 있는 일은 생기지 않는다.
 */
export function openCard(player: ScriptPlayer, payload: CardPayload): ScriptWidget {
	closeCard(player);
	// 도감만 격자가 들어가 더 크다. 나머지는 카드 한 장 크기로 충분하다
	const size = payload.nav === "grid" ? WidgetSize.CARD_BOOK : WidgetSize.CARD;
	const widget = open(
		player,
		WidgetFile.CARD,
		player.isMobile ? "middle" : "middleright",
		size,
		payload,
		false
	);
	tagOf(player).cardWidget = widget;
	return widget;
}

/**
 * 단계 전환 컷을 연다. 화면을 통째로 덮는 유일한 위젯이다.
 *
 * 메인 위젯을 대신하지 않고 그 위에 뜬다. 대신하게 만들면 컷이 끝날 때
 * 좌석에게는 단계 화면을, 관전자에게는 관전 화면을 각각 다시 열어 줘야 하고
 * (관전 화면은 여는 함수가 private이라 재바인딩 경로도 없다), 그 재개
 * 경로가 컷을 하나 추가할 때마다 늘어난다. 겹쳐 두면 끝은 destroy 한 번이다.
 */
export function openCut(player: ScriptPlayer, payload: CutPayload): ScriptWidget {
	closeCut(player);
	// align은 덮는 위젯에서 뜻이 없지만(layoutOf가 100%로 덮어쓴다)
	// showWidget이 첫 프레임을 그릴 자리로 쓴다
	const widget = open(player, WidgetFile.CUT, "middle", WidgetSize.CUT, payload, false);
	tagOf(player).cutWidget = widget;
	return widget;
}

/**
 * 프로필 창을 연다.
 *
 * 먼저 닫는 것이 핵심이다. 이 창은 "클릭"으로 열리므로 사람이 마음대로
 * 연타할 수 있는 유일한 위젯인데, 닫지 않고 또 열면 위젯 핸들만 갈리고
 * 이전 위젯은 화면에 남는다 — onMessage 핸들러도 함께 쌓여서 닫기 한 번에
 * 여러 번 반응한다. 열기 전에 닫으면 그 상태가 구조적으로 생기지 않는다.
 *
 * 카드와 자리를 나눠 쓰지 않는다(PlayerTag.profileWidget). 직업 카드를 읽는
 * 중에 옆 사람을 잘못 눌러 카드가 사라지는 쪽이 더 나쁘다.
 *
 * 자리는 카드의 반대편이다. 둘이 함께 떠 있을 수 있는데(도감 + 프로필)
 * 같은 쪽에 두면 뒤엣것이 완전히 가려진다.
 */
export function openProfile(player: ScriptPlayer, payload: ProfilePayload): ScriptWidget {
	closeProfile(player);
	const widget = open(
		player,
		WidgetFile.PROFILE,
		player.isMobile ? "middle" : "middleleft",
		WidgetSize.PROFILE,
		payload,
		false
	);
	tagOf(player).profileWidget = widget;
	return widget;
}
