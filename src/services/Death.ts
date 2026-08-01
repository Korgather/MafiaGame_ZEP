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
import { Judgement, Role, Team } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import { CONSOLATION_EXP } from "../domain/Progression.ts";
import { ChatChannel } from "../domain/chat/ChatChannel.ts";
import { participantLabel, seatAt } from "../entities/Room.ts";
import { sprite } from "../infrastructure/Sprites.ts";
import { playSound, playSoundTo } from "./Broadcast.ts";
import * as Chat from "./ChatService.ts";
import { awardExp } from "./Rewards.ts";
import { applyNameplate, restoreAppearance, seatPlayer } from "./Stage.ts";

/**
 * 사인. 문구·소리·보상·연쇄가 전부 여기서 갈린다.
 *
 * 하나로 뭉뚱그리지 않는 이유는 "무엇을 알려도 되는가"가 사인마다 다르기
 * 때문이다. 처형은 마피아 팀 여부까지 공개하고, 자책은 죽은 본인에게만
 * 이유를 말하며(알리면 자경단원이 시체와 함께 공개된다), 자폭과 희생은
 * 두 사람의 관계가 이미 드러난 사건이라 방 전체에 그대로 알린다.
 */
export const DeathCause = {
	/** 낮 투표 처형 */
	EXECUTION: "EXECUTION",
	/** 밤의 제거 — 마피아 팀·자경단원의 공격 */
	NIGHT_KILL: "NIGHT_KILL",
	/** 자경단원이 같은 편을 쏘고 스스로 목숨을 끊었다 */
	BACKFIRE: "BACKFIRE",
	/** 테러리스트의 폭탄에 끌려갔다 */
	SUICIDE_BOMB: "SUICIDE_BOMB",
	/** 연인이 죽어 뒤따랐다 */
	SACRIFICE: "SACRIFICE",
} as const;
export type DeathCause = (typeof DeathCause)[keyof typeof DeathCause];

/**
 * 좌석을 사망 처리한다.
 * 좌석은 방에 남는다 — 종료 화면의 직업 공개와 유령 채팅이 그 위에서 돌아간다.
 *
 * 이미 죽은 좌석이면 아무 일도 하지 않는다. 이 한 줄이 연쇄의 멱등성을
 * 통째로 떠받친다 — 폭사한 사람의 연인이 마침 폭탄의 주인이었던 판에서도
 * 같은 좌석이 두 번 죽거나 안내가 두 번 나가지 않는다.
 */
export function kill(room: Room, seat: Seat, cause: DeathCause): void {
	if (!seat.alive) return;
	seat.alive = false;
	seat.attackedBy = [];
	seat.healed = false;
	seat.voteCount = 0;

	announce(room, seat, cause);
	// 마담이 죽으면 그 밤의 유혹이 풀린다(클래식 규칙). 유혹은 누가 걸었는지를
	// 좌석에 적지 않으므로 마담이 하나뿐이라는 클래식 구성에 기대어 전부 푼다.
	// blocked는 건드리지 않는다 — 그쪽은 이미 지나간 밤의 결과다
	if (seat.role === Role.MADAM) {
		for (const other of room.seats) other.seduced = false;
	}

	const player = ScriptApp.getPlayerByID(seat.playerId);
	if (player) {
		// 밤 사망은 죽은 본인만 듣는다. 방 전체에 내면 곧바로 이어지는 아침
		// 소리와 겹치고, 한 밤에 둘이 죽으면 같은 소리가 두 번 난다.
		// 처형이 방의 소리인 것과 반대다 — 그쪽은 개표 화면을 다 같이 보는 중이다.
		if (cause !== DeathCause.EXECUTION) playSoundTo(player, Sound.DEATH);

		// 처형당한 시민 진영에게는 위로 경험치. 전적은 건드리지 않는다.
		// role !== MAFIA로 판정하면 짐승인간·사기꾼이 처형당할 때마다 위로금을 받는다.
		if (cause === DeathCause.EXECUTION && seat.team !== Team.MAFIA) {
			awardExp(player, CONSOLATION_EXP);
		}

		becomeGhost(room, player, seat);
	}

	// 낮의 연쇄만 여기서 잇는다. 밤의 연쇄는 파이프라인이 이미 결말 목록으로
	// 만들어 두었고(NightPipeline.detonateBombs·chainLovers), 그 목록을 읽는
	// resolveNight이 이 함수를 죽은 사람 수만큼 부른다. 여기서 밤까지 이으면
	// 같은 규칙이 두 층에서 각각 돌아 순서가 어긋날 자리가 생긴다
	if (cause === DeathCause.EXECUTION) {
		detonate(room, seat);
		mourn(room, seat);
	}
}

/**
 * 처형당한 사람이 안고 있던 폭탄을 터뜨린다.
 *
 * 팀을 보는 이유는 NightPipeline.detonateBombs와 같다 — 같은 편을 데려가면
 * 테러리스트가 시민 편의 손해로만 남는다. 판정을 두 곳에 적는 대신 한쪽으로
 * 모으지 않은 것은, 밤은 "결말 목록"을 만들고 낮은 "지금 죽인다"라서
 * 두 층의 반환값이 애초에 다르기 때문이다.
 */
function detonate(room: Room, seat: Seat): void {
	if (seat.markIndex === 0) return;
	const mark = seatAt(room, seat.markIndex);
	if (!mark || !mark.alive) return;
	if (mark.team === seat.team) return;
	kill(room, mark, DeathCause.SUICIDE_BOMB);
	// 폭사한 사람의 연인도 뒤따른다. kill이 EXECUTION에서만 연쇄하므로
	// 여기서 한 번 더 불러 준다 — 자폭이 또 자폭을 부르는 길은 막아 둔 채
	mourn(room, mark);
}

/** 연인은 함께 죽는다. 밤이든 낮이든 같은 규칙이고, 낮 몫이 여기다 */
function mourn(room: Room, seat: Seat): void {
	if (seat.loverIndex === 0) return;
	const partner = seatAt(room, seat.loverIndex);
	if (!partner || !partner.alive) return;
	kill(room, partner, DeathCause.SACRIFICE);
}

function announce(room: Room, seat: Seat, cause: DeathCause): void {
	const name = participantLabel(seat);
	if (cause === DeathCause.EXECUTION) {
		// 찬반 화면이 아직 떠 있고 방금 세어진 O가 그 위에 남아 있다. 그 위에
		// 소리를 얹어야 "과반이 찬성했다"와 "그래서 죽었다"가 한 사건으로 읽힌다
		playSound(room, Sound.EXECUTE);
		// 시민이 알아야 하는 것은 직업이 아니라 "마피아를 줄였는가"다.
		// 짐승인간·사기꾼을 처형하고도 "마피아가 아니었다"고 하면 시민이 오판한다.
		Chat.announce(
			room,
			seat.team === Team.MAFIA
				? `☠️ ${name}가 처형당했습니다. 그는 마피아 팀이었습니다!`
				: `☠️ ${name}가 처형당했습니다. 그는 마피아 팀이 아니었습니다.`
		);
		return;
	}
	// 아침 화면이 그대로 읽는다. 채팅으로만 흘리면 토론에 밀려 사라진다.
	//
	// 자책(BACKFIRE)이 평범한 제거와 같은 문구인 것은 의도다. 다른 문구를
	// 주면 그 한 줄이 "이 방에 자경단원이 있고 방금 헛짚었다"를 알린다.
	// 왜 죽었는지는 죽은 본인에게만 따로 간다(Night.resolveNight).
	const line =
		cause === DeathCause.SUICIDE_BOMB
			? `💥 ${name}가 폭발에 휘말려 죽었습니다.`
			: cause === DeathCause.SACRIFICE
				? `💔 ${name}가 연인을 잃고 뒤따랐습니다.`
				: `☠️ ${name}가 죽었습니다.`;
	room.nightReport.push(line);
	Chat.announce(room, line);
}

/**
 * 성직자가 되살린다. 사망의 취소이지 사망이 아니라서 DeathCause가 아니다.
 *
 * 되살아난 사람은 원래 직업과 팀을 유지한다. 군인의 방탄은 복구하지 않는다 —
 * 한 판에 한 번인 자원이고, 부활 자체가 이미 한 번의 구원이다.
 */
export function revive(room: Room, seat: Seat): void {
	if (seat.alive) return;
	seat.alive = true;
	seat.attackedBy = [];
	seat.healed = false;
	seat.voteCount = 0;
	seat.votedFor = 0;
	seat.judgement = Judgement.NONE;

	const line = `⛪ ${participantLabel(seat)}가 다시 살아났습니다.`;
	room.nightReport.push(line);
	Chat.announce(room, line);

	const player = ScriptApp.getPlayerByID(seat.playerId);
	if (!player) return;
	// 자리로 되돌려 다시 묶는다. becomeGhost가 moveSpeed를 80으로 풀어 놓았기
	// 때문에 외형만 바꾸면 산 사람인데 맵을 걸어 다니는 상태가 된다
	seatPlayer(room, player, seat);
	// 유령 외형을 되돌리고 숨김 여부를 지금 단계에 맞춘다. becomeGhost의
	// 반대편을 따로 적지 않는 이유는 재접속 경로가 이미 같은 일을 하기 때문이다
	restoreAppearance(room, player, seat);
	Chat.tell(player, "⛪ 성직자의 기도로 되살아났습니다. 다시 판에 섰습니다.");
	// 유령 탭을 닫고 산 사람의 권한으로 돌린다
	Chat.refresh(player);
	playSoundTo(player, Sound.HEAL);
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
 * 밤 정산 뒤라면 곧 아침 화면이 덮어써서 무해했지만, 처형은 재판 화면을
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
