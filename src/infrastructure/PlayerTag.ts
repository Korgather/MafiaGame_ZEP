/**
 * player.tag 접근을 한 곳으로 모은다.
 *
 * 기존에는 onJoinPlayer가 player.tag = { ... } 로 통째로 덮어썼다.
 * 그래서 재접속하면 방이 들고 있던 참조가 고아가 됐고, 반대로 tag가
 * 아직 없는 시점에 player.tag.data.joined을 읽어 죽는 경로도 있었다.
 *
 * 지금은 게임 상태가 전부 Seat(방 소유)에 있으므로 tag에는 위젯 핸들만 남는다.
 * 없으면 만들어서 돌려주므로 "tag가 없어서 터지는" 경우가 구조적으로 없다.
 */
import type { ScriptPlayer } from "zep-script";
import type { PlayerTag } from "../types/Game.types.ts";
import { ChatChannel } from "../domain/chat/ChatChannel.ts";

export function tagOf(player: ScriptPlayer): PlayerTag {
	const existing = player.tag as PlayerTag | undefined | null;
	if (existing && typeof existing === "object" && "originalName" in existing) {
		return existing;
	}
	const created: PlayerTag = {
		widget: null,
		roleWidget: null,
		chatWidget: null,
		// 처음 들어오면 펼친 채로 시작한다. 채팅이 있다는 사실 자체를
		// 모르고 지나가는 것이 접혀 있어서 얻는 시야보다 손해가 크다.
		chatOpen: true,
		chatChannel: ChatChannel.GLOBAL,
		chatSeen: {},
		originalName: player.name,
	};
	player.tag = created;
	return created;
}

/** 위젯 3종을 모두 닫는다. 방을 떠나거나 접속이 끊길 때 쓴다 */
export function destroyWidgets(player: ScriptPlayer): void {
	const tag = tagOf(player);
	if (tag.widget) {
		tag.widget.destroy();
		tag.widget = null;
	}
	if (tag.roleWidget) {
		tag.roleWidget.destroy();
		tag.roleWidget = null;
	}
	if (tag.chatWidget) {
		tag.chatWidget.destroy();
		tag.chatWidget = null;
	}
}
