/**
 * 밤 전용 채팅 중계(마피아 채널 / 유령 채널).
 *
 * 기존 mafiaChatNotify / ghostChatNotify는 거의 같은 함수였고, 둘 다
 * `if (!player) return;` 으로 루프를 통째로 끊었다. 접속이 끊긴 사람이
 * 목록 앞쪽에 있으면 그 뒤의 모두가 채팅을 못 받았다.
 *
 * 참고: ZEP 0.16.5에는 player.chatEnabled / chatGroupID API가 없다.
 * 기존 코드의 "밤에는 채팅 금지"는 이미 동작하지 않는 죽은 코드였고,
 * 실제 밤 채팅은 전부 이 위젯 채널로만 이뤄진다.
 */
import type { Room } from "../types/Game.types.ts";
import { ChatChannel, inMafiaChat, roleDef } from "../domain/Roles.ts";
import { forEachPlayer } from "./Broadcast.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";

export interface ChatLine {
	/** 보낸 사람의 참가 번호. 0이면 시스템 공지 */
	num: number;
	name: string;
	message: string;
}

/** 살아 있는 마피아 채팅 참가자끼리. 보낸 사람 본인에게는 되돌리지 않는다 */
export function relayMafia(room: Room, line: ChatLine): void {
	forEachPlayer(room, (player, seat) => {
		if (!seat.alive || !inMafiaChat(seat)) return;
		if (seat.index === line.num) return;
		const widget = tagOf(player).widget;
		if (widget) widget.sendMessage({ type: "chatNotify", ...line });
	});
}

/**
 * 죽은 사람들과 유령 채널을 가진 직업(영매)끼리.
 *
 * 판정을 `role !== SHAMAN`으로 두면 유령과 대화하는 직업을 하나 더
 * 만드는 순간 조용히 빠진다. relayMafia와 같은 이유로 채널을 본다.
 */
export function relayGhost(room: Room, line: ChatLine): void {
	forEachPlayer(room, (player, seat) => {
		if (seat.alive && roleDef(seat.role).nightChat !== ChatChannel.GHOST) return;
		if (seat.index === line.num) return;
		const widget = tagOf(player).ghostWidget;
		if (widget) widget.sendMessage({ type: "chatNotify", ...line });
	});
}

/**
 * 살아 있는 마피아 채팅 참가자 수. 2명 이상일 때만 채팅창을 연다.
 *
 * 기존 이름은 mafiaTeamSize였고 실제로 진영 인원을 셌다. 건달·짐승인간은
 * 마피아 팀이지만 채팅에 없으므로, 이름대로 진영을 세면 혼자인 마피아에게
 * "대화 상대가 있다"고 알리고 아무도 답하지 않는 빈 채팅창을 열어준다.
 * 세는 대상이 이름과 어긋나 있던 것이 원인이라 이름도 함께 고친다.
 */
export function mafiaChatSize(room: Room): number {
	let count = 0;
	for (const seat of room.seats) {
		if (seat.alive && inMafiaChat(seat)) count++;
	}
	return count;
}
