/**
 * 위젯 생성. 모바일/데스크톱 정렬 분기가 사는 유일한 곳.
 *
 * 기존에는 `p.isMobile ? p.showWidget(x, "top", ...) : p.showWidget(x, "topright", ...)`
 * 형태의 if가 7곳에 흩어져 있었고 크기 숫자도 매번 다시 적혀 있었다.
 * 위젯을 닫는 코드(`if (tag.widget) { tag.widget.destroy(); tag.widget = null; }`)는
 * 12곳에 복사돼 있었는데, 그중 몇 곳은 null 대입을 빠뜨려 이미 파괴된 위젯에
 * sendMessage를 호출했다.
 */
import type { ScriptPlayer, ScriptWidget } from "zep-script";
import { WidgetFile, WidgetSize } from "../constants/Assets.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";

/** 화면 위쪽 고정 위젯의 정렬. 모바일은 가로 폭이 좁아 중앙 상단을 쓴다 */
function topAlign(player: ScriptPlayer): "top" | "topright" {
	return player.isMobile ? "top" : "topright";
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
	const tag = tagOf(player);
	const widget = player.showWidget(
		WidgetFile.LOBBY,
		topAlign(player),
		WidgetSize.LOBBY.width,
		WidgetSize.LOBBY.height
	);
	tag.widget = widget;
	return widget;
}

/** morning / night / vote / voteResult / winCitizen / winMafia 공통 */
export function openPhase(player: ScriptPlayer, fileName: string): ScriptWidget {
	closeMain(player);
	const tag = tagOf(player);
	const widget = player.showWidget(
		fileName,
		topAlign(player),
		WidgetSize.PHASE.width,
		WidgetSize.PHASE.height
	);
	tag.widget = widget;
	return widget;
}

/** 밤 능력 위젯. 조작 대상이 많아 모바일에서도 상단 중앙 고정 */
export function openRoleAction(player: ScriptPlayer): ScriptWidget {
	closeMain(player);
	const tag = tagOf(player);
	const widget = player.showWidget(
		WidgetFile.ROLE_ACTION,
		"top",
		WidgetSize.ROLE_ACTION.width,
		WidgetSize.ROLE_ACTION.height
	);
	tag.widget = widget;
	return widget;
}

/** 유령/영매 채팅 위젯. 메인 위젯과 별도로 떠 있는다 */
export function openGhostChat(player: ScriptPlayer): ScriptWidget {
	closeGhost(player);
	const tag = tagOf(player);
	const widget = player.showWidget(
		WidgetFile.ROLE_ACTION,
		"top",
		WidgetSize.ROLE_ACTION.width,
		WidgetSize.ROLE_ACTION.height
	);
	tag.ghostWidget = widget;
	return widget;
}

/** 직업 공개 카드 */
export function openRoleCard(player: ScriptPlayer, fileName: string): ScriptWidget {
	closeRoleCard(player);
	const tag = tagOf(player);
	const widget = player.showWidget(
		fileName,
		player.isMobile ? "middle" : "middleright",
		WidgetSize.ROLE_CARD.width,
		WidgetSize.ROLE_CARD.height
	);
	tag.roleWidget = widget;
	return widget;
}
