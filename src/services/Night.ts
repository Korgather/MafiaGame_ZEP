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
import { ChatChannel, inMafiaChat, roleDef, roleName } from "../domain/Roles.ts";
import {
	NightOutcome,
	resolveNightCasualties,
	resolveNightSelect,
} from "../domain/NightResolution.ts";
import { aliveSeats, resetRound, seatAt, seatViews } from "../entities/Room.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { asInt, asText, field, messageType, MAX_CHAT_LENGTH } from "../types/Widget.types.ts";
import { forEachPlayer, label, playSound, say, tell } from "./Broadcast.ts";

/** 밤 능력 안내 라벨 표시 시간(ms). 지목할 시간을 충분히 준다 */
const NIGHT_PROMPT_MS = 6000;
import { mafiaChatSize, relayGhost, relayMafia } from "./Chat.ts";
import { DeathCause, kill } from "./Death.ts";
import { applyNightSprite, beginNightStage } from "./Stage.ts";
import type { PhasePayload } from "./Widgets.ts";
import { closeGhost, closeRoleCard, openGhostChat, openPhase, openRoleAction } from "./Widgets.ts";
import { sprite } from "../infrastructure/Sprites.ts";

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
		note: nightNote(seat),
		deaths: [],
	};
}

/**
 * 지목 격자 없이 밤 화면만 보는 사람에게 그 이유를 알려준다.
 *
 * 안내가 하나뿐이었을 때는 능력을 다 쓴 자경단원도 "능력이 있는 직업은
 * 대상을 지목하세요"를 받았다. 지목할 격자는 없는데 지목하라고 하니
 * 화면이 깨진 것처럼 보인다. 이유는 좌석 상태가 정하므로 판정을 여기
 * 한 곳에 두고, 격자를 숨기는 조건(canAct)과 같은 근거를 쓴다.
 */
function nightNote(seat: Seat): string {
	if (!seat.alive) return "당신은 죽었습니다. 관전 중입니다.";
	const def = roleDef(seat.role);
	if (def.oncePerGame && seat.skillSpent) {
		return "능력은 게임당 한 번뿐이고 이미 사용했습니다. 이번 밤은 지켜보세요.";
	}
	return "밤입니다. 능력이 있는 직업은 대상을 지목하세요.";
}

export function beginNight(room: Room): void {
	room.phase = GamePhase.NIGHT;
	room.phaseTimer = TIMING.NIGHT;
	room.tickTockPlayed = false;
	resetRound(room);

	beginNightStage(room);
	playSound(room, Sound.NIGHT);

	forEachPlayer(room, (player, seat) => {
		closeRoleCard(player);
		openNightView(room, player, seat);
	});
}

/** 한 사람의 밤 화면을 연다. 직업별 차이는 전부 ROLE_DEFS에서 읽는다 */
export function openNightView(room: Room, player: ScriptPlayer, seat: Seat): void {
	if (!seat.alive) {
		// 죽은 사람은 유령 채팅창(사망 시 이미 열림)만 유지하고 밤 화면을 본다
		openPhase(player, nightPhaseView(room, seat));
		return;
	}

	const def = roleDef(seat.role);
	applyNightSprite(player, def.nightSprite);
	player.attackSprite = def.nightAttackSprite ? sprite(def.nightAttackSprite) : player.attackSprite;
	player.sendUpdated();

	const mafiaChat = inMafiaChat(seat);
	tell(player, mafiaChat ? mafiaNotice(room, seat) : def.nightNotice);

	// 게임당 한 번뿐인 능력을 이미 썼다면 지목할 것이 남아 있지 않다.
	// 이걸 보지 않으면 자경단원이 매일 밤 눌러도 아무 일 없는 격자를 받는다.
	const canAct = def.nightAction !== null && !(def.oncePerGame && seat.skillSpent);

	// 영매는 지목할 대상이 없고 유령들과 대화만 한다
	if (!canAct && def.nightChat === ChatChannel.GHOST) {
		const ghost = openGhostChat(player, {
			type: "init",
			myNum: seat.index,
			role: roleName(seat.role),
			team: seat.team,
			alive: true,
			prompt: "",
			seats: [],
			timer: room.phaseTimer,
			chatEnable: true,
			note: def.nightNotice,
		});
		bindChat(ghost, ChatChannel.GHOST);
		openPhase(player, nightPhaseView(room, seat));
		return;
	}

	// 능력도 채팅도 없는 직업은 밤 안내 화면만 본다
	if (!canAct && def.nightChat === null) {
		openPhase(player, nightPhaseView(room, seat));
		return;
	}

	if (canAct && def.nightPrompt) {
		label(player, def.nightPrompt, NIGHT_PROMPT_MS);
	}

	const widget = openRoleAction(player, {
		type: "init",
		myNum: seat.index,
		role: roleName(seat.role),
		team: seat.team,
		alive: true,
		prompt: canAct && def.nightPrompt ? def.nightPrompt : "",
		// 지목할 것이 없는 마피아팀(채팅만)이면 격자를 보내지 않는다
		seats: canAct ? seatViews(room, mafiaChat ? seat.team : undefined) : [],
		timer: room.phaseTimer,
		chatEnable: mafiaChat && mafiaChatSize(room) > 1,
		note: mafiaChat ? mafiaNotice(room, seat) : def.nightNotice,
	});
	bindNightWidget(widget);
}

function mafiaNotice(room: Room, seat: Seat): string {
	return mafiaChatSize(room) > 1
		? "🌙 밤에는 마피아팀끼리 채팅을 공유할 수 있습니다."
		: roleDef(seat.role).nightNotice;
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
		const type = messageType(data);
		if (type === "sendMessage") {
			relay(sender, data, ChatChannel.MAFIA);
			return;
		}
		if (type !== "select") return;

		const found = locate(sender.id);
		if (!found) return;
		const room = found.room;
		const seat = found.seat;
		if (room.phase !== GamePhase.NIGHT || !seat.alive) return;

		if (seat.usedSkill) {
			label(sender, "이미 대상을 선택했습니다.");
			return;
		}
		const def = roleDef(seat.role);
		if (def.oncePerGame && seat.skillSpent) {
			label(sender, "이 판에 쓸 수 있는 능력을 이미 사용했습니다.");
			return;
		}

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
		if (result.joinedMafia) announceSpyJoin(room, sender, seat, widget);
	});
}

/** 유령 채팅 전용 위젯 (영매) */
function bindChat(widget: ScriptWidget, channel: ChatChannel): void {
	widget.onMessage.Add((sender, data) => {
		if (messageType(data) !== "sendMessage") return;
		relay(sender, data, channel);
	});
}

function relay(sender: ScriptPlayer, data: unknown, channel: ChatChannel): void {
	const text = asText(field(data, "message"), MAX_CHAT_LENGTH);
	if (!text) return;
	const found = locate(sender.id);
	if (!found) return;
	const line = { num: found.seat.index, name: sender.name, message: text };
	if (channel === ChatChannel.MAFIA) relayMafia(found.room, line);
	else relayGhost(found.room, line);
}

/** 스파이가 마피아를 찾아내 합류했을 때 */
function announceSpyJoin(
	room: Room,
	player: ScriptPlayer,
	seat: Seat,
	widget: ScriptWidget
): void {
	widget.sendMessage({ type: "chatEnable" });
	forEachPlayer(room, (other, otherSeat) => {
		if (!otherSeat.alive || otherSeat.playerId === seat.playerId) return;
		if (otherSeat.team !== seat.team) return;
		tell(other, `🕵️ ${player.name}(스파이)님이 마피아 채팅에 합류했습니다.`);
	});
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

	// 영매의 유령 채팅은 밤에만 열린다
	forEachPlayer(room, (player, seat) => {
		if (seat.alive) closeGhost(player);
	});

	const casualties = resolveNightCasualties(room.seats);
	if (casualties.length === 0) report(room, "✨ 이번 밤에 아무도 죽지 않았습니다.");

	for (const casualty of casualties) {
		switch (casualty.outcome) {
			case NightOutcome.SAVED:
				report(room, "💖 의사가 누군가를 살려냈습니다.");
				break;
			case NightOutcome.SHIELDED:
				report(room, "🛡️ 누군가가 공격을 받았지만 버텨냈습니다.");
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

/** 아침 화면과 채팅에 같은 한 줄을 남긴다 */
function report(room: Room, line: string): void {
	room.nightReport.push(line);
	say(room, line);
}

function tellSeat(seat: Seat, message: string): void {
	const player = ScriptApp.getPlayerByID(seat.playerId);
	if (player) tell(player, message);
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
