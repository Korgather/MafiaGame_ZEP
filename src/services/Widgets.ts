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
import type { ChatChannelView, RevealView, SeatView, Team } from "../types/Game.types.ts";
import type { ChatMessage } from "../domain/chat/ChatMessage.ts";
import { WidgetFile, WidgetSize } from "../constants/Assets.ts";
import { KICK, MAX_PLAYERS, MIN_PLAYERS } from "../constants/GameConfig.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";

/** 화면 위쪽 고정 위젯의 정렬. 모바일은 가로 폭이 좁아 중앙 상단을 쓴다 */
function topAlign(player: ScriptPlayer): "top" | "topright" {
	return player.isMobile ? "top" : "topright";
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
 * isMobile을 여기서 붙이는 것도 같은 이유다 — 정렬 분기가 이미 여기 있으니
 * "모바일이냐"를 아는 곳을 하나로 못 박으면 호출부가 빠뜨릴 수 없다.
 */
function open(
	player: ScriptPlayer,
	fileName: string,
	align: WidgetAlign,
	size: { readonly width: number; readonly height: number },
	payload: object
): ScriptWidget {
	const widget = player.showWidget(fileName, align, size.width, size.height);
	widget.sendMessage({ ...payload, isMobile: player.isMobile });
	return widget;
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
	role: string;
	team: Team;
	/** false면 유령으로 표시된다 */
	alive: boolean;
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
}

/** 투표 화면 */
export interface VotePayload {
	type: "init";
	myNum: number;
	seats: SeatView[];
	timer: number;
	/** 이미 찍어둔 대상. 재접속으로 화면을 다시 열 때 표시를 복원한다 */
	picked: number;
	/** 건달에게 협박당해 이번 투표가 막혔는가 */
	silenced: boolean;
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

/** 직업 공개 카드. 직업별 차이는 전부 payload로 온다 */
export interface RoleCardPayload {
	type: "init";
	role: string;
	team: Team;
	glyph: string;
	ability: string;
	tip: string;
	timer: number;
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
	/** 내 참가 번호. 0이면 좌석 없음 */
	myNum: number;
	/** 권한에 맞게 걸러낸 지난 기록 (오래된 것부터) */
	lines: ChatMessage[];
}

/** 채널 목록·빠른 메시지만 다시 보낸다. 단계가 바뀌거나 죽었을 때 */
export interface ChatChannelsPayload {
	type: "channels";
	channels: ChatChannelView[];
	active: string;
	quick: string[];
	myNum: number;
}

/** 새 메시지 한 줄 + 갱신된 미확인 개수 */
export interface ChatLinePayload {
	type: "line";
	line: ChatMessage;
	channels: ChatChannelView[];
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

export function closeRoleCard(player: ScriptPlayer): void {
	const tag = tagOf(player);
	if (tag.roleWidget) {
		tag.roleWidget.destroy();
		tag.roleWidget = null;
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
export function updateChat(player: ScriptPlayer, payload: object): void {
	const widget = tagOf(player).chatWidget;
	if (widget) widget.sendMessage(payload);
}

/**
 * 대기실 위젯을 열고 tag.widget에 물린다.
 *
 * 최소·최대 인원과 강퇴 필요 표수를 함께 보낸다. 기존 위젯은 이 값들을
 * 몰라서 "왜 시작하지 않는지", "강퇴에 몇 표가 더 필요한지"를 화면에
 * 쓸 수 없었다. HTML에 4/8/3을 다시 적는 대신 서버가 알려준다 —
 * GameConfig를 바꾸면 화면도 따라 바뀐다.
 */
export function openLobby(player: ScriptPlayer): ScriptWidget {
	closeMain(player);
	const widget = open(player, WidgetFile.LOBBY, topAlign(player), WidgetSize.LOBBY, {
		type: "setID",
		id: player.id,
		minPlayers: MIN_PLAYERS,
		maxPlayers: MAX_PLAYERS,
		kickVotes: KICK.VOTES_REQUIRED,
	});
	tagOf(player).widget = widget;
	return widget;
}

/** 밤/아침 진행 화면 */
export function openPhase(player: ScriptPlayer, payload: PhasePayload): ScriptWidget {
	closeMain(player);
	const widget = open(player, WidgetFile.PHASE, topAlign(player), WidgetSize.PHASE, payload);
	tagOf(player).widget = widget;
	return widget;
}

/** 투표 화면. 개표도 같은 파일이라 payload 타입만 다르다 */
export function openVote(
	player: ScriptPlayer,
	payload: VotePayload | VoteResultPayload
): ScriptWidget {
	closeMain(player);
	const widget = open(player, WidgetFile.VOTE, topAlign(player), WidgetSize.VOTE, payload);
	tagOf(player).widget = widget;
	return widget;
}

/** 종료 화면 */
export function openGameOver(player: ScriptPlayer, payload: GameOverPayload): ScriptWidget {
	closeMain(player);
	const widget = open(player, WidgetFile.GAME_OVER, topAlign(player), WidgetSize.GAME_OVER, payload);
	tagOf(player).widget = widget;
	return widget;
}

/** 밤 능력 위젯. 조작 대상이 많아 모바일에서도 상단 중앙 고정 */
export function openRoleAction(player: ScriptPlayer, payload: NightActionPayload): ScriptWidget {
	closeMain(player);
	const widget = open(player, WidgetFile.ROLE_ACTION, "top", WidgetSize.ROLE_ACTION, payload);
	tagOf(player).widget = widget;
	return widget;
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
		payload
	);
	tagOf(player).chatWidget = widget;
	return widget;
}

/**
 * 직업 공개 카드.
 *
 * 기존에는 직업별 HTML 파일명을 인자로 받았고 payload는 아예 보내지 않았다
 * (카드가 읽을 것이 없었으니까). 그래서 카드는 그림 한 장이었고,
 * 5초 동안 "당신은 의사입니다"만 말한 뒤 사라졌다. 무엇을 해야 하는지는
 * 알려주지 않았다.
 */
export function openRoleCard(player: ScriptPlayer, payload: RoleCardPayload): ScriptWidget {
	closeRoleCard(player);
	const widget = open(
		player,
		WidgetFile.ROLE_CARD,
		player.isMobile ? "middle" : "middleright",
		WidgetSize.ROLE_CARD,
		payload
	);
	tagOf(player).roleWidget = widget;
	return widget;
}
