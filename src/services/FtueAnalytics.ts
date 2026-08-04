/** 첫 안내부터 두 번째 게임 시작까지의 익명 FTUE 퍼널. */
import type { ScriptPlayer } from "zep-script";
import { guard } from "../infrastructure/Fault.ts";
import { sendLiveMetric } from "../infrastructure/LiveMetrics.ts";
import * as Storage from "../infrastructure/PlayerStorage.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";

export const FtueEvent = {
	GUIDE_OPENED: "guide_opened",
	GUIDE_COMPLETED: "guide_completed",
	ROOM_JOINED: "room_joined",
	FIRST_GAME_STARTED: "first_game_started",
	FIRST_NIGHT_ACTION_COMPLETED: "first_night_action_completed",
	FIRST_VOTE_COMPLETED: "first_vote_completed",
	FIRST_GAME_FINISHED: "first_game_finished",
	REMATCH_SELECTED: "rematch_selected",
	SECOND_GAME_STARTED: "second_game_started",
} as const;
export type FtueEvent = (typeof FtueEvent)[keyof typeof FtueEvent];

const EVENT_BIT: { [event: string]: number } = {
	[FtueEvent.GUIDE_OPENED]: 1 << 0,
	[FtueEvent.GUIDE_COMPLETED]: 1 << 1,
	[FtueEvent.ROOM_JOINED]: 1 << 2,
	[FtueEvent.FIRST_GAME_STARTED]: 1 << 3,
	[FtueEvent.FIRST_NIGHT_ACTION_COMPLETED]: 1 << 4,
	[FtueEvent.FIRST_VOTE_COMPLETED]: 1 << 5,
	[FtueEvent.FIRST_GAME_FINISHED]: 1 << 6,
	[FtueEvent.REMATCH_SELECTED]: 1 << 7,
	[FtueEvent.SECOND_GAME_STARTED]: 1 << 8,
};

export function trackBeforeFirstGame(player: ScriptPlayer, event: FtueEvent): void {
	// 게스트는 관전만 가능해 first_game_started로 전환될 수 없다. 이들을
	// room_joined 분모에 넣으면 첫 판 시작 전환율이 제품 정책 때문에 낮아진다.
	if (player.isGuest) return;
	if (!tagOf(player).ftueEligible || tagOf(player).playStarts !== 0) return;
	track(player, event);
}

export function trackDuringFirstGame(player: ScriptPlayer, event: FtueEvent): void {
	if (player.isGuest) return;
	if (!tagOf(player).ftueEligible || tagOf(player).playStarts !== 1) return;
	track(player, event);
}

export function trackGameStarted(player: ScriptPlayer): void {
	if (player.isGuest) return;
	const tag = tagOf(player);
	if (!tag.ftueEligible) {
		tag.playStarts++;
		return;
	}
	if (tag.playStarts === 0) track(player, FtueEvent.FIRST_GAME_STARTED);
	else if (tag.playStarts === 1) track(player, FtueEvent.SECOND_GAME_STARTED);
	tag.playStarts++;
}

function track(player: ScriptPlayer, event: FtueEvent): void {
	const bit = EVENT_BIT[event];
	const tag = tagOf(player);
	if ((tag.ftueEvents & bit) !== 0) return;

	guard(`FTUE ${event}`, () => {
		const eventId = newEventId();
		const key = `FTUE_mafia_${ScriptApp.spaceHashID}_${ScriptApp.mapHashID}_${event}_${eventId}`;
		// ZEP 런타임이 요청 시작 자체를 거절하면 아직 보낸 것이 아니다. 비트를
		// 남기지 않아 같은 사건이 다시 관측될 때 재시도할 수 있게 한다.
		if (!sendLiveMetric("FTUE", key, { event, eventId, schemaVersion: 1 })) return;

		tag.ftueEvents |= bit;
		Storage.update(player, storage => {
			storage.ftueEvents = (storage.ftueEvents || 0) | bit;
		});
	});
}

/** 이벤트마다 새 값을 써 사용자별 연결이 불가능하도록 한다. */
function newEventId(): string {
	const now = Math.floor(Time.getUtcTime()).toString(36);
	const random = Math.floor(Math.random() * 0x100000000)
		.toString(36)
		.padStart(7, "0");
	return `${now}_${random}`;
}
