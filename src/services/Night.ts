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
import { Sound, WidgetFile } from "../constants/Assets.ts";
import { TIMING } from "../constants/GameConfig.ts";
import { ChatChannel, roleDef, roleName } from "../domain/Roles.ts";
import { resolveNightCasualties, resolveNightSelect } from "../domain/NightResolution.ts";
import { resetRound, seatAt } from "../entities/Room.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { asInt, asText, field, messageType, MAX_CHAT_LENGTH } from "../types/Widget.types.ts";
import { forEachPlayer, label, playSound, say, tell } from "./Broadcast.ts";

/** 밤 능력 안내 라벨 표시 시간(ms). 지목할 시간을 충분히 준다 */
const NIGHT_PROMPT_MS = 6000;
import { mafiaTeamSize, mafiaTeamView, relayGhost, relayMafia } from "./Chat.ts";
import { DeathCause, kill } from "./Death.ts";
import { applyNightSprite, beginNightStage } from "./Stage.ts";
import { closeGhost, closeRoleCard, openGhostChat, openPhase, openRoleAction } from "./Widgets.ts";
import { sprite } from "../infrastructure/Sprites.ts";

/** 생존자의 참가 번호 목록. 위젯이 선택 버튼을 그리는 데 쓴다 */
function aliveIndices(room: Room): number[] {
	const list: number[] = [];
	for (const seat of room.seats) {
		if (seat.alive) list.push(seat.index);
	}
	return list;
}

export function beginNight(room: Room): void {
	room.phase = GamePhase.NIGHT;
	room.phaseTimer = TIMING.NIGHT;
	room.tickTockPlayed = false;
	resetRound(room);

	beginNightStage(room);
	playSound(room, Sound.NIGHT);

	const live = aliveIndices(room);
	forEachPlayer(room, (player, seat) => {
		closeRoleCard(player);
		openNightView(room, player, seat, live);
	});
}

/** 한 사람의 밤 화면을 연다. 직업별 차이는 전부 ROLE_DEFS에서 읽는다 */
function openNightView(room: Room, player: ScriptPlayer, seat: Seat, live: number[]): void {
	if (!seat.alive) {
		// 죽은 사람은 유령 채팅창(사망 시 이미 열림)만 유지하고 밤 화면을 본다
		openPhase(player, WidgetFile.NIGHT);
		return;
	}

	const def = roleDef(seat.role);
	applyNightSprite(player, def.nightSprite);
	player.attackSprite = def.nightAttackSprite ? sprite(def.nightAttackSprite) : player.attackSprite;
	player.sendUpdated();

	const inMafiaChat = def.nightChat === ChatChannel.MAFIA;
	tell(player, inMafiaChat ? mafiaNotice(room, seat) : def.nightNotice);

	// 영매는 지목할 대상이 없고 유령들과 대화만 한다
	if (def.nightAction === null && def.nightChat === ChatChannel.GHOST) {
		const ghost = openGhostChat(player);
		ghost.sendMessage({
			type: "init",
			myNum: seat.index,
			role: roleName(seat.role),
			isMobile: player.isMobile,
			chatEnable: true,
		});
		bindChat(ghost, ChatChannel.GHOST);
		openPhase(player, WidgetFile.NIGHT);
		return;
	}

	// 능력도 채팅도 없는 직업은 밤 안내 화면만 본다
	if (def.nightAction === null && def.nightChat === null) {
		openPhase(player, WidgetFile.NIGHT);
		return;
	}

	if (def.nightPrompt) {
		label(player, def.nightPrompt, NIGHT_PROMPT_MS);
	}

	const widget = openRoleAction(player);
	widget.sendMessage({
		type: "init",
		myNum: seat.index,
		role: roleName(seat.role),
		total: room.total,
		liveList: live,
		time: room.phaseTimer,
		isMobile: player.isMobile,
		chatEnable: inMafiaChat && mafiaTeamSize(room) > 1,
		teamIndexArray: inMafiaChat ? mafiaTeamView(room) : [],
	});
	bindNightWidget(widget);
}

function mafiaNotice(room: Room, seat: Seat): string {
	return mafiaTeamSize(room) > 1
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

		const targetIndex = asInt(field(data, "num"));
		if (targetIndex === null) return;
		const target = seatAt(room, targetIndex);
		if (!target || !target.alive) return;

		const result = resolveNightSelect(seat, target);
		if (!result) return;

		if (result.consumed) seat.usedSkill = true;
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

	// 영매의 유령 채팅은 밤에만 열린다
	forEachPlayer(room, (player, seat) => {
		if (seat.alive) closeGhost(player);
	});

	const casualties = resolveNightCasualties(room.seats);
	if (casualties.length === 0) {
		say(room, "✨ 이번 밤에 아무도 죽지 않았습니다.");
		return;
	}

	for (const casualty of casualties) {
		if (casualty.saved) {
			say(room, "💖 어느 훌륭하신 의사가 기적적으로 시민을 살렸습니다.");
			continue;
		}
		kill(room, casualty.seat, DeathCause.NIGHT_KILL);
	}
}
