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
import { WidgetFile, WidgetSize } from "../constants/Assets.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";

/** 화면 위쪽 고정 위젯의 정렬. 모바일은 가로 폭이 좁아 중앙 상단을 쓴다 */
function topAlign(player: ScriptPlayer): "top" | "topright" {
	return player.isMobile ? "top" : "topright";
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

/** morning/night 화면이 그리는 남은 시간과 인원 */
interface PhaseStatus {
	total: number;
	alive: number;
	timer: number;
	description: string;
}

/** 승리 화면은 payload에서 읽는 필드가 없다 */
type NoPayload = Record<string, never>;

/**
 * 위상 위젯별 초기 payload. 각 HTML이 실제로 읽는 필드가 곧 계약이다.
 * 위젯을 추가하면 여기에 항목을 넣기 전까지 openPhase로 열 수 없다.
 */
export type PhasePayloads = {
	[WidgetFile.MORNING]: PhaseStatus;
	[WidgetFile.NIGHT]: PhaseStatus;
	/** vote.html은 description을 읽지 않는다 */
	[WidgetFile.VOTE]: Omit<PhaseStatus, "description"> & {
		type: "init";
		liveList: number[];
	};
	[WidgetFile.VOTE_RESULT]: { type: "voteResult"; result: Array<[number, number]> };
	[WidgetFile.WIN_CITIZEN]: NoPayload;
	[WidgetFile.WIN_MAFIA]: NoPayload;
};

type PhaseFile = keyof PhasePayloads;

/** 밤 능력 위젯이 지목 버튼을 그리는 데 필요한 것 */
export interface NightActionPayload {
	type: "init";
	myNum: number;
	role: string;
	total: number;
	liveList: number[];
	time: number;
	chatEnable: boolean;
	teamIndexArray: Array<{ index: number; role: string }>;
}

/** 유령·영매 채팅. 지목이 없어 대상 목록도 제한 시간도 필요 없다 */
export interface GhostChatPayload {
	type: "init";
	myNum: number;
	role: string;
	chatEnable: boolean;
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

export function closeGhost(player: ScriptPlayer): void {
	const tag = tagOf(player);
	if (tag.ghostWidget) {
		tag.ghostWidget.destroy();
		tag.ghostWidget = null;
	}
}

/** 대기실 위젯을 열고 tag.widget에 물린다 */
export function openLobby(player: ScriptPlayer): ScriptWidget {
	closeMain(player);
	const widget = open(player, WidgetFile.LOBBY, topAlign(player), WidgetSize.LOBBY, {
		type: "setID",
		id: player.id,
	});
	tagOf(player).widget = widget;
	return widget;
}

/** morning / night / vote / voteResult / winCitizen / winMafia 공통 */
export function openPhase<F extends PhaseFile>(
	player: ScriptPlayer,
	fileName: F,
	payload: PhasePayloads[F]
): ScriptWidget {
	closeMain(player);
	const widget = open(player, fileName, topAlign(player), WidgetSize.PHASE, payload);
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

/** 유령/영매 채팅 위젯. 메인 위젯과 별도로 떠 있는다 */
export function openGhostChat(player: ScriptPlayer, payload: GhostChatPayload): ScriptWidget {
	closeGhost(player);
	const widget = open(player, WidgetFile.ROLE_ACTION, "top", WidgetSize.ROLE_ACTION, payload);
	tagOf(player).ghostWidget = widget;
	return widget;
}

/** 직업 공개 카드. 카드 HTML은 payload를 읽지 않는다 */
export function openRoleCard(player: ScriptPlayer, fileName: string): ScriptWidget {
	closeRoleCard(player);
	const widget = player.showWidget(
		fileName,
		player.isMobile ? "middle" : "middleright",
		WidgetSize.ROLE_CARD.width,
		WidgetSize.ROLE_CARD.height
	);
	tagOf(player).roleWidget = widget;
	return widget;
}
