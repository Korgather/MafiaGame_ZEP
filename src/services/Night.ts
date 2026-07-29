/**
 * 밤 단계.
 *
 * 기존 nightPlayerEvent는 직업 이름으로 분기하는 약 300줄짜리 switch였다.
 * 분기 7개가 각각 위젯을 열고, init 페이로드를 조립하고, onMessage 핸들러를
 * 등록하고, "index가 일치하는 대상을 찾는" 루프를 따로 갖고 있었다.
 * 같은 코드가 4벌 있었으니 4벌 다 조금씩 달랐다 —
 * 경찰 분기에는 break가 없어 대상을 찾은 뒤에도 루프를 계속 돌았고,
 * 마피아 분기만 return으로 빠져나갔다.
 *
 * 지금 이 파일에는 위젯 조립과 대상 탐색이 각각 한 벌만 있다.
 * "무슨 일이 일어나는가"는 domain/NightResolution.ts의 순수 함수가 정한다.
 * 직업을 추가할 때 이 파일은 건드리지 않는다.
 */
import type { ScriptPlayer, ScriptWidget } from "zep-script";
import type { Room, Seat } from "../types/Game.types.ts";
import { GamePhase } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import { TIMING } from "../constants/GameConfig.ts";
import { inMafiaChat, roleDef, roleName } from "../domain/Roles.ts";
import { ChatChannel } from "../domain/chat/ChatChannel.ts";
import {
	nightActionBlockedReason,
	NightOutcome,
	resolveNightCasualties,
	resolveNightSelect,
} from "../domain/NightResolution.ts";
import { aliveSeats, resetRound, seatAt, seatViews } from "../entities/Room.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { asInt, field, messageType } from "../types/Widget.types.ts";
import { forEachPlayer, label, playSound } from "./Broadcast.ts";
import * as Chat from "./ChatService.ts";
import { DeathCause, kill } from "./Death.ts";
import { applyNightSprite, beginNightStage } from "./Stage.ts";
import type { PhasePayload } from "./Widgets.ts";
import { closeRoleCard, openPhase, openRoleAction } from "./Widgets.ts";
import { sprite } from "../infrastructure/Sprites.ts";

/** 밤 능력 안내 라벨 표시 시간(ms). 지목할 시간을 충분히 준다 */
const NIGHT_PROMPT_MS = 6000;

/**
 * 지목할 것이 없는 사람들이 보는 밤 화면.
 *
 * 원본 문구는 "마피아, 경찰, 의사는 밤에 움직일 수 있습니다"로 직업을 나열했다.
 * 그 뒤 영매·스파이·정치인이 추가되면서 문구만 낡았는데 아무도 몰랐다.
 * 직업 목록을 문구에서 빼면 직업을 추가해도 여기가 낡지 않는다.
 */
function nightPhaseView(room: Room, seat: Seat): PhasePayload {
	return {
		type: "init",
		phase: "night",
		turn: room.turnCount + 1,
		total: room.total,
		aliveCount: aliveSeats(room).length,
		timer: room.phaseTimer,
		role: roleName(seat.role),
		team: seat.team,
		alive: seat.alive,
		note: nightNote(room, seat),
		deaths: [],
	};
}

/**
 * 지목 격자 없이 밤 화면만 보는 사람에게 그 이유를 알려준다.
 *
 * 안내가 하나뿐이었을 때는 능력을 다 쓴 자경단원도 "능력이 있는 직업은
 * 대상을 지목하세요"를 받았다. 지목할 격자는 없는데 지목하라고 하니
 * 화면이 깨진 것처럼 보인다. 격자를 숨기는 판정과 같은 함수를 쓰므로
 * "격자가 없다"와 "이유를 설명한다"가 어긋날 수 없다.
 */
function nightNote(room: Room, seat: Seat): string {
	if (!seat.alive) return "당신은 죽었습니다. 관전 중입니다.";
	const blocked = nightActionBlockedReason(seat, room.turnCount);
	if (blocked) return blocked;
	return "밤입니다. 대상을 지목하세요.";
}

export function beginNight(room: Room): void {
	room.phase = GamePhase.NIGHT;
	room.phaseTimer = TIMING.NIGHT;
	room.tickTockPlayed = false;
	resetRound(room);

	beginNightStage(room);
	playSound(room, Sound.NIGHT);
	// 밤에는 방 채팅이 잠기지만 읽기는 열려 있다. 이 한 줄이 없으면 채팅
	// 기록만 봤을 때 아침과 아침 사이가 비어 무슨 일이 있었는지 알 수 없다
	Chat.say(room, `🌙 ${room.turnCount + 1}번째 밤이 되었습니다.`);

	forEachPlayer(room, (player, seat) => {
		closeRoleCard(player);
		openNightView(room, player, seat);
	});
}

/** 한 사람의 밤 화면을 연다. 직업별 차이는 전부 ROLE_DEFS에서 읽는다 */
export function openNightView(room: Room, player: ScriptPlayer, seat: Seat): void {
	if (!seat.alive) {
		// 죽은 사람은 통합 채팅의 유령 채널로 대화한다. 밤 화면만 열어준다
		openPhase(player, nightPhaseView(room, seat));
		return;
	}

	const def = roleDef(seat.role);
	applyNightSprite(player, def.nightSprite);
	player.attackSprite = def.nightAttackSprite ? sprite(def.nightAttackSprite) : player.attackSprite;
	player.sendUpdated();

	Chat.tell(player, nightNotice(room, seat));

	// 지목할 것이 남아 있지 않은 이유는 여러 가지고(능력이 없다, 다 썼다,
	// 첫 밤이다, 이미 골랐다) 전부 한 함수가 안다. 이걸 보지 않으면
	// 자경단원이 매일 밤 눌러도 아무 일 없는 격자를 받는다.
	const canAct = nightActionBlockedReason(seat, room.turnCount) === null;

	// 지목할 것이 없으면 밤 안내 화면만 본다.
	//
	// 전에는 여기에 분기가 셋 있었다. 영매용, 채팅 없는 직업용, 그리고 격자가
	// 빈 채로 열리는 마피아팀용. 셋이 갈렸던 이유는 밤 채팅이 이 위젯에
	// 얹혀 있었기 때문이다. 채팅이 자기 위젯으로 나가면서 남은 질문은
	// "지목할 것이 있는가" 하나뿐이 됐다.
	if (!canAct) {
		openPhase(player, nightPhaseView(room, seat));
		return;
	}

	if (def.nightPrompt) label(player, def.nightPrompt, NIGHT_PROMPT_MS);

	const widget = openRoleAction(player, {
		type: "init",
		myNum: seat.index,
		role: roleName(seat.role),
		team: seat.team,
		alive: true,
		prompt: def.nightPrompt || "",
		seats: seatViews(room, inMafiaChat(seat) ? seat.team : undefined),
		timer: room.phaseTimer,
		note: def.nightNotice,
	});
	bindNightWidget(widget);
}

function nightNotice(room: Room, seat: Seat): string {
	if (inMafiaChat(seat) && mafiaChatSize(room) > 1) {
		return "🌙 마피아 탭에서 팀원과 대화할 수 있습니다.";
	}
	return roleDef(seat.role).nightNotice;
}

/**
 * 살아 있는 마피아 채팅 참가자 수. 2명 이상일 때만 "대화할 수 있다"고 알린다.
 *
 * 기존 이름은 mafiaTeamSize였고 실제로 진영 인원을 셌다. 건달·짐승인간은
 * 마피아 팀이지만 채팅에 없으므로, 이름대로 진영을 세면 혼자인 마피아에게
 * 대화 상대가 있다고 알리고 아무도 답하지 않게 된다.
 */
function mafiaChatSize(room: Room): number {
	let count = 0;
	for (const seat of room.seats) {
		if (seat.alive && inMafiaChat(seat)) count++;
	}
	return count;
}

/**
 * 밤 위젯의 메시지 처리. 위젯 하나당 한 번만 등록된다.
 *
 * 기존 핸들러는 위젯이 보낸 값을 검증하지 않았고, 밤이 아닌 시점에 온
 * select도 그대로 처리했다. 위젯은 클라이언트에서 도는 코드라
 * 조작된 메시지가 올 수 있다.
 */
function bindNightWidget(widget: ScriptWidget): void {
	widget.onMessage.Add((sender, data) => {
		if (messageType(data) !== "select") return;

		const found = locate(sender.id);
		if (!found) return;
		const room = found.room;
		const seat = found.seat;
		if (room.phase !== GamePhase.NIGHT || !seat.alive) return;

		// 위젯을 잠그는 판정과 같은 함수다. 조작된 select가 와도 서버가
		// 같은 근거로 거절하므로, 화면에서 격자가 사라진 상태와 서버가
		// 허용하는 상태가 갈라질 수 없다.
		const blocked = nightActionBlockedReason(seat, room.turnCount);
		if (blocked) {
			label(sender, blocked);
			return;
		}
		const def = roleDef(seat.role);

		const targetIndex = asInt(field(data, "num"));
		if (targetIndex === null) return;
		const target = seatAt(room, targetIndex);
		if (!target || !target.alive) return;

		const result = resolveNightSelect(seat, target);
		if (!result) return;

		if (result.consumed) {
			seat.usedSkill = true;
			if (def.oncePerGame) seat.skillSpent = true;
		}
		label(sender, result.label, result.labelDurationMs);
		if (result.confirmed) widget.sendMessage({ type: "selectResponse", num: targetIndex });
		if (result.privateSound) sender.playSound(result.privateSound);
		if (result.roomSound) playSound(room, result.roomSound);
		if (result.joinedMafia) announceSpyJoin(room, sender);
	});
}

/**
 * 스파이가 마피아를 찾아내 합류했을 때.
 *
 * 전에는 팀원 각각에게 개인 안내를 보내고 스파이 위젯에는 chatEnable을
 * 따로 쏘았다 — 같은 사실을 두 경로로 알리는 구조라 한쪽만 고치기 쉬웠다.
 * 지금은 마피아 채널에 한 줄 남기고 본인의 탭 목록만 새로 고친다.
 * 채널에 쓴 한 줄은 기록에도 남아서 나중에 합류한 사람도 볼 수 있다.
 */
function announceSpyJoin(room: Room, player: ScriptPlayer): void {
	Chat.channelSay(
		room,
		ChatChannel.MAFIA,
		`🕵️ ${player.name}(스파이)님이 마피아 채팅에 합류했습니다.`
	);
	Chat.refresh(player);
}

/**
 * 밤이 끝났을 때의 정산. 낮으로 넘어가기 직전에 호출한다.
 *
 * 기존에는 이 처리가 startState(STATE_PLAYING_DAY) 안에 인라인되어 있었고
 * 사망 안내 문구를 dead()가 "처형당했습니다"로 덮어썼다.
 */
export function resolveNight(room: Room): void {
	room.turnCount++;
	// 아침 화면이 읽을 밤 기록. kill()이 사망 한 줄씩 채워 넣는다
	room.nightReport = [];

	const casualties = resolveNightCasualties(room.seats);
	if (casualties.length === 0) report(room, "✨ 이번 밤에 아무도 죽지 않았습니다.");

	for (const casualty of casualties) {
		switch (casualty.outcome) {
			case NightOutcome.SAVED:
				report(room, "💖 의사가 누군가를 살려냈습니다.");
				break;
			case NightOutcome.SHIELDED:
				// 방에는 누구인지 알리지 않는다 — 알리면 군인이 첫 밤에 공개된다.
				// 대신 본인에게는 반드시 말해준다. 방탄은 판당 한 번뿐이라
				// 이 안내가 없으면 군인은 아직 남아 있다고 믿은 채 다음 밤에 죽고,
				// 자기 능력이 언제 소모됐는지 끝까지 알 수 없다.
				report(room, "🛡️ 누군가가 공격을 받았지만 버텨냈습니다.");
				tellSeat(casualty.seat, "🛡️ 밤새 공격을 받았지만 버텨냈습니다. 방탄은 이제 남아 있지 않습니다.");
				break;
			case NightOutcome.BACKFIRED:
				// 자책의 이유는 방에 알리지 않는다 — 알리면 자경단원의 정체가
				// 시체와 함께 공개된다. 본인에게만 왜 죽었는지 말해준다.
				kill(room, casualty.seat, DeathCause.NIGHT_KILL);
				tellSeat(casualty.seat, "🔫 당신이 쏜 사람은 같은 편이었습니다. 책임을 지고 스스로 목숨을 끊었습니다.");
				break;
			case NightOutcome.KILLED:
				kill(room, casualty.seat, DeathCause.NIGHT_KILL);
				break;
		}
	}

	publishScoops(room);
}

/** 아침 화면과 채팅 기록에 같은 한 줄을 남긴다 */
function report(room: Room, line: string): void {
	room.nightReport.push(line);
	Chat.announce(room, line);
}

function tellSeat(seat: Seat, message: string): void {
	const player = ScriptApp.getPlayerByID(seat.playerId);
	if (player) Chat.tell(player, message);
}

/**
 * 기자가 취재한 직업을 전체 공개한다. 사망 소식 뒤에 붙는다.
 *
 * 죽은 사람도 공개 대상이다 — 그 밤에 죽었다면 오히려 "누구를 죽였는가"가
 * 드러나 더 중요한 정보가 된다.
 */
function publishScoops(room: Room): void {
	for (const seat of room.seats) {
		if (!seat.scooped) continue;
		report(room, `📰 특종: ${seat.index}번 ${seat.name} 님의 직업은 ${roleName(seat.role)}입니다.`);
	}
}
