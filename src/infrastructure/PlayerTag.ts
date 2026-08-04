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
import { newBucket } from "../domain/RateLimit.ts";
import { ACTION_RATE, CHAT_RATE } from "../constants/GameConfig.ts";
import * as Storage from "./PlayerStorage.ts";

export function tagOf(player: ScriptPlayer): PlayerTag {
	const existing = player.tag as PlayerTag | undefined | null;
	// chatRate로 알아본다. 없어서는 안 되는 필드 아무거나 하나면 되는데,
	// 선택적(?)이거나 언젠가 지울 만한 필드를 쓰면 그날 tag가 조용히 초기화된다
	if (existing && typeof existing === "object" && "chatRate" in existing) {
		return existing;
	}
	const storage = Storage.read(player);
	const created: PlayerTag = {
		widget: null,
		mainBox: null,
		mainStamp: null,
		cardWidget: null,
		cutWidget: null,
		profileWidget: null,
		guideSeen: false,
		ftueEvents: storage.ftueEvents || 0,
		playStarts: Storage.priorPlayStarts(storage),
		ftueEligible: !Storage.hasPriorGame(storage) || (storage.ftueEvents || 0) !== 0,
		chatWidget: null,
		/*
		 * 데스크톱은 펼친 채로 시작한다. 채팅이 있다는 사실 자체를 모르고
		 * 지나가는 것이 접혀 있어서 얻는 시야보다 손해가 크기 때문이다.
		 *
		 * 모바일은 반대다. 펼친 채팅이 세로의 34%를 먹는데, 접어도 💬 막대와
		 * 미확인 배지는 그대로 남는다 — 채팅이 있다는 사실은 접힌 채로도
		 * 전해지므로 펼쳐 둘 이유가 없다. 세로가 좁은 쪽에서는 "있다는 것을
		 * 알린다"와 "화면을 가린다"의 값이 뒤집힌다.
		 */
		chatOpen: !player.isMobile,
		chatChannel: ChatChannel.GLOBAL,
		chatSeen: {},
		chatRate: newBucket(CHAT_RATE, Time.getUtcTime()),
		actionRate: newBucket(ACTION_RATE, Time.getUtcTime()),
		blocked: {},
		reported: {},
	};
	player.tag = created;
	return created;
}

/** 위젯 5종을 모두 닫는다. 방을 떠나거나 접속이 끊길 때 쓴다 */
export function destroyWidgets(player: ScriptPlayer): void {
	const tag = tagOf(player);
	if (tag.widget) {
		tag.widget.destroy();
		tag.widget = null;
	}
	if (tag.cardWidget) {
		tag.cardWidget.destroy();
		tag.cardWidget = null;
	}
	if (tag.cutWidget) {
		tag.cutWidget.destroy();
		tag.cutWidget = null;
	}
	if (tag.profileWidget) {
		tag.profileWidget.destroy();
		tag.profileWidget = null;
	}
	if (tag.chatWidget) {
		tag.chatWidget.destroy();
		tag.chatWidget = null;
	}
}
