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
import { Role, Team } from "../types/Game.types.ts";
import { forEachPlayer } from "./Broadcast.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";

export interface ChatLine {
	/** 보낸 사람의 참가 번호. 0이면 시스템 공지 */
	num: number;
	name: string;
	message: string;
}

/** 살아 있는 마피아 진영끼리. 보낸 사람 본인에게는 되돌리지 않는다 */
export function relayMafia(room: Room, line: ChatLine): void {
	forEachPlayer(room, (player, seat) => {
		if (!seat.alive || seat.team !== Team.MAFIA) return;
		if (seat.index === line.num) return;
		const widget = tagOf(player).widget;
		if (widget) widget.sendMessage({ type: "chatNotify", ...line });
	});
}

/** 죽은 사람들과 영매끼리 */
export function relayGhost(room: Room, line: ChatLine): void {
	forEachPlayer(room, (player, seat) => {
		if (seat.alive && seat.role !== Role.SHAMAN) return;
		if (seat.index === line.num) return;
		const widget = tagOf(player).ghostWidget;
		if (widget) widget.sendMessage({ type: "chatNotify", ...line });
	});
}

/** 살아 있는 마피아 진영 인원 수. 2명 이상일 때만 채팅창을 연다 */
export function mafiaTeamSize(room: Room): number {
	let count = 0;
	for (const seat of room.seats) {
		if (seat.alive && seat.team === Team.MAFIA) count++;
	}
	return count;
}

/** 마피아 위젯에 표시할 팀원 목록 */
export function mafiaTeamView(room: Room): Array<{ index: number; role: string }> {
	const view: Array<{ index: number; role: string }> = [];
	for (const seat of room.seats) {
		if (seat.alive && seat.team === Team.MAFIA) {
			view.push({ index: seat.index, role: seat.role });
		}
	}
	return view;
}
