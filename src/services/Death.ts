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
import { ChatChannel } from "../domain/chat/ChatChannel.ts";
import { participantLabel } from "../entities/Room.ts";
import { sprite } from "../infrastructure/Sprites.ts";
import * as Chat from "./ChatService.ts";
import { awardExp } from "./Rewards.ts";
import { applyNameplate } from "./Stage.ts";

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

	becomeGhost(room, player, seat);
}

function announce(room: Room, seat: Seat, cause: DeathCause): void {
	const name = participantLabel(seat);
	if (cause === DeathCause.NIGHT_KILL) {
		// 아침 화면이 그대로 읽는다. 채팅으로만 흘리면 토론에 밀려 사라진다
		const line = `☠️ ${name}가 죽었습니다.`;
		room.nightReport.push(line);
		Chat.announce(room, `☠️ 이번 밤에 ${name}가 죽었습니다.`);
		return;
	}
	// 시민이 알아야 하는 것은 직업이 아니라 "마피아를 줄였는가"다.
	// 건달·짐승인간을 처형하고도 "마피아가 아니었다"고 하면 시민이 오판한다.
	Chat.announce(
		room,
		seat.team === Team.MAFIA
			? `☠️ ${name}가 처형당했습니다. 그는 마피아 팀이었습니다!`
			: `☠️ ${name}가 처형당했습니다. 그는 마피아 팀이 아니었습니다.`
	);
}

/**
 * 유령 외형으로 바꾸고 유령 채널을 열어 준다.
 *
 * 전에는 여기서 유령 전용 위젯을 새로 띄웠고, 죽은 채로 재접속하는 경로가
 * 같은 위젯을 다시 여는 두 번째 입구를 따로 갖고 있었다. 지금은 채팅창이
 * 접속 내내 하나뿐이므로 "권한이 바뀌었다"고 알리기만 하면 된다 —
 * 재접속 경로는 openFor 한 곳으로 합쳐졌다.
 *
 * 메인 위젯은 건드리지 않는다. 전에는 여기서 closeMain을 불렀는데("죽으면
 * 밤 능력 위젯은 의미가 없다"), 사망은 자기가 언제 불리는지를 모른다.
 * 밤 정산 뒤라면 곧 아침 화면이 덮어써서 무해했지만, 처형은 개표 화면을
 * 전원에게 연 **뒤에** 일어나므로 정작 처형당한 본인의 화면만 지워졌다.
 * 화면의 주인은 단계다 — beginX/showPhaseView가 열고 다음 open*이 닫는다.
 * 사망은 좌석 상태만 바꾸고 화면 판단은 하지 않는다.
 */
function becomeGhost(room: Room, player: ScriptPlayer, seat: Seat): void {
	applyNameplate(player, seat);
	player.sprite = sprite("ghost");
	player.moveSpeed = 80;
	player.hidden = false;
	player.sendUpdated();

	Chat.tell(player, "☠️ 당신은 죽었습니다. 유령 탭에서 죽은 사람들과 대화하세요.");
	// 유령 채널로 탭을 옮겨 준다. 자동 전환은 ChatPermission이 정한다
	Chat.refresh(player);
	Chat.channelSay(room, ChatChannel.GHOST, `👻 ${participantLabel(seat)}가 유령이 되었습니다.`);
}
