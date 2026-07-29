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
import { Team } from "../types/Game.types.ts";
import { CONSOLATION_EXP } from "../domain/Progression.ts";
import { roleName } from "../domain/Roles.ts";
import { sprite } from "../infrastructure/Sprites.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { asText, field, messageType, MAX_CHAT_LENGTH } from "../types/Widget.types.ts";
import { say, tell } from "./Broadcast.ts";
import { relayGhost } from "./Chat.ts";
import { awardExp } from "./Rewards.ts";
import { closeMain, openGhostChat } from "./Widgets.ts";

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
	seat.attackedBy = [];
	seat.healed = false;
	seat.voteCount = 0;

	announce(room, seat, cause);

	const player = ScriptApp.getPlayerByID(seat.playerId);
	if (!player) return;

	// 처형당한 시민 진영에게는 위로 경험치. 전적은 건드리지 않는다.
	// role !== MAFIA로 판정하면 건달·짐승인간이 처형당할 때마다 위로금을 받는다.
	if (cause === DeathCause.EXECUTION && seat.team !== Team.MAFIA) {
		awardExp(player, CONSOLATION_EXP);
	}

	becomeGhost(player, seat);
}

function announce(room: Room, seat: Seat, cause: DeathCause): void {
	if (cause === DeathCause.NIGHT_KILL) {
		// 아침 화면이 그대로 읽는다. 채팅으로만 흘리면 토론에 밀려 사라진다
		const line = `☠️ ${seat.name} 님이 죽었습니다.`;
		room.nightReport.push(line);
		say(room, `☠️ 이번 밤에 ${seat.name} 님이 죽었습니다.`);
		return;
	}
	// 시민이 알아야 하는 것은 직업이 아니라 "마피아를 줄였는가"다.
	// 건달·짐승인간을 처형하고도 "마피아가 아니었다"고 하면 시민이 오판한다.
	say(
		room,
		seat.team === Team.MAFIA
			? `☠️ ${seat.name} 님이 처형당했습니다. 그는 마피아 팀이었습니다!`
			: `☠️ ${seat.name} 님이 처형당했습니다. 그는 마피아 팀이 아니었습니다.`
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

	// 죽으면 밤 능력 위젯은 의미가 없다 (유령 위젯은 openGhostChat이 정리한다)
	closeMain(player);
	openGhostView(player, seat);

	tell(player, "☠️ 당신은 죽었습니다.\n유령들끼리 대화할 수 있습니다.\n밤에는 영매와 대화할 수 있습니다.");
}

/**
 * 유령 채팅창을 연다. 죽는 순간과, 죽은 채로 재접속했을 때 모두 이 경로다.
 *
 * 핸들러를 위젯마다 새로 무는 것이 핵심이다. 위젯은 클라이언트 안의 iframe이라
 * 접속이 끊기면 핸들러와 함께 사라진다. 참조를 재활용하려 하면 이미 죽은
 * 위젯에 말을 거는 것이 된다.
 */
export function openGhostView(player: ScriptPlayer, seat: Seat): void {
	const widget = openGhostChat(player, {
		type: "init",
		myNum: seat.index,
		role: roleName(seat.role),
		team: seat.team,
		alive: false,
		prompt: "",
		seats: [],
		timer: 0,
		chatEnable: true,
		note: "죽은 사람들끼리 대화할 수 있습니다.",
	});
	widget.onMessage.Add((sender, data) => {
		if (messageType(data) !== "sendMessage") return;
		const text = asText(field(data, "message"), MAX_CHAT_LENGTH);
		if (!text) return;
		const found = locate(sender.id);
		if (!found) return;
		relayGhost(found.room, { num: found.seat.index, name: sender.name, message: text });
	});
}
