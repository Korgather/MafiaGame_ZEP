/**
 * 사망 처리.
 *
 * 기존 dead()의 문제 두 가지를 여기서 고친다.
 *
 * 1. `player.tag.role = ""` 로 직업을 지웠다. 죽는 순간 그 사람이 무엇이었는지가
 *    영영 사라져서 종료 화면에서 직업을 공개할 수 없었고, 승패 판정과
 *    보상 지급도 죽은 사람을 시민으로 오인했다.
 *    이제 좌석의 role은 그대로 두고 alive만 false로 내린다.
 *
 * 2. 밤에 죽어도 "처형당했습니다"라는 안내가 나갔다. dead()가 호출 맥락을
 *    구분하지 않았기 때문이다. 사인을 인자로 받아 문구를 나눈다.
 */
import type { ScriptPlayer } from "zep-script";
import type { Room, Seat } from "../types/Game.types.ts";
import { Role } from "../types/Game.types.ts";
import { CONSOLATION_EXP } from "../domain/Progression.ts";
import { WidgetFile, WidgetSize } from "../constants/Assets.ts";
import { sprite } from "../infrastructure/Sprites.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { asText, field, messageType, MAX_CHAT_LENGTH } from "../types/Widget.types.ts";
import { say, tell } from "./Broadcast.ts";
import { relayGhost } from "./Chat.ts";
import { awardExp } from "./Rewards.ts";
import { closeMain, closeGhost } from "./Widgets.ts";

export const DeathCause = {
	/** 낮 투표 처형 */
	EXECUTION: "EXECUTION",
	/** 밤에 마피아에게 살해 */
	NIGHT_KILL: "NIGHT_KILL",
} as const;
export type DeathCause = (typeof DeathCause)[keyof typeof DeathCause];

/**
 * 좌석을 사망 처리한다.
 * 좌석은 방에 남는다 — 종료 화면의 직업 공개와 유령 채팅이 그 위에서 돌아간다.
 */
export function kill(room: Room, seat: Seat, cause: DeathCause): void {
	if (!seat.alive) return;
	seat.alive = false;
	seat.marked = false;
	seat.healed = false;
	seat.voteCount = 0;

	announce(room, seat, cause);

	const player = ScriptApp.getPlayerByID(seat.playerId);
	if (!player) return;

	// 처형당한 시민에게는 위로 경험치. 전적은 건드리지 않는다.
	if (cause === DeathCause.EXECUTION && seat.role !== Role.MAFIA) {
		awardExp(player, CONSOLATION_EXP);
	}

	becomeGhost(player, seat);
}

function announce(room: Room, seat: Seat, cause: DeathCause): void {
	if (cause === DeathCause.NIGHT_KILL) {
		say(room, `☠️ 이번 밤에 ${seat.name} 님이 죽었습니다.`);
		return;
	}
	say(
		room,
		seat.role === Role.MAFIA
			? `☠️ ${seat.name} 님이 처형당했습니다. 그는 마피아였습니다!`
			: `☠️ ${seat.name} 님이 처형당했습니다. 그는 마피아가 아니었습니다.`
	);
}

/** 유령 외형으로 바꾸고 유령 채팅 위젯을 연다 */
function becomeGhost(player: ScriptPlayer, seat: Seat): void {
	const tag = tagOf(player);

	player.title = "유령";
	player.name = `${tag.originalName}(유령)`;
	player.sprite = sprite("ghost");
	player.moveSpeed = 80;
	player.hidden = false;
	player.sendUpdated();

	// 죽으면 밤 능력 위젯은 의미가 없다
	closeMain(player);
	closeGhost(player);

	const widget = player.showWidget(
		WidgetFile.ROLE_ACTION,
		"top",
		WidgetSize.ROLE_ACTION.width,
		WidgetSize.ROLE_ACTION.height
	);
	tag.ghostWidget = widget;
	widget.sendMessage({
		type: "init",
		myNum: seat.index,
		role: "",
		isMobile: player.isMobile,
		chatEnable: true,
	});
	widget.onMessage.Add((sender, data) => {
		if (messageType(data) !== "sendMessage") return;
		const text = asText(field(data, "message"), MAX_CHAT_LENGTH);
		if (!text) return;
		const found = locate(sender.id);
		if (!found) return;
		relayGhost(found.room, { num: found.seat.index, name: sender.name, message: text });
	});

	tell(player, "☠️ 당신은 죽었습니다.\n유령들끼리 대화할 수 있습니다.\n밤에는 영매와 대화할 수 있습니다.");
}
