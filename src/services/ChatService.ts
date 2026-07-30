/**
 * 통합 채팅. 메시지를 만들고, 기록하고, 볼 자격이 있는 사람에게만 보낸다.
 *
 * 걷어낸 것: ZEP 기본 채팅(player.sendMessage / ScriptApp.onSay).
 *
 * 기본 채팅은 세 가지를 할 수 없었고, 세 가지 모두 마피아 게임에서는
 * 있으면 좋은 것이 아니라 없으면 게임이 성립하지 않는 것이다.
 *   1. 청중을 고를 수 없다. ZEP 0.16.5에는 chatEnabled도 chatGroupID도 없어
 *      "밤에는 마피아끼리만"을 기본 채팅으로 표현할 방법이 아예 없었다.
 *      원본의 "밤에는 채팅 금지" 안내는 그래서 실제로는 죽은 코드였다.
 *   2. 기록이 남지 않는다. 재접속하면 그 판에 무슨 일이 있었는지 사라졌다.
 *   3. 게임 UI와 분리돼 있다. 사망 안내와 잡담이 같은 창에 섞여 흘렀다.
 *
 * 층 나누기:
 *   ChatChannel    - 청중이 누구인가 (값)
 *   ChatPermission - 어떤 상황에서 읽고 쓸 수 있는가 (순수 함수 표)
 *   ChatMessage    - 한 줄이 무엇을 담는가 (값 객체)
 *   ChatFilter     - 걸러야 할 말인가 (순수 함수)
 *   QuickPhrases   - 지금 내밀 만한 문구는 무엇인가 (순수 함수 + 문구 표)
 *   ChatService    - 만들고 저장하고 배달한다 (여기)
 *   ChatCommands   - "/"로 시작하는 줄을 해석한다 (ChatVoice로만 여기와 닿는다)
 *   chat.html      - 그린다. 직업도 단계도 모른다
 *
 * 이 층 나누기가 값을 한 이유는 뒤에 붙은 기능들이 전부 예고한 자리에
 * 그대로 들어갔기 때문이다. 새 개념은 하나도 생기지 않았다:
 *   귓속말   - ChatMessage.to에 상대 playerId를 넣고 post (whisperTo)
 *   차단     - deliverTo와 visibleLog의 필터 한 줄 (isBlockedBy)
 *   필터링   - submit()의 text 한 곳 (ChatFilter.maskProfanity)
 *   신고     - ChatMessage.senderId로 대상을 지목 (ChatCommands)
 *   명령어   - ChatCommands의 COMMANDS 표에 한 줄
 *
 * 남은 확장 지점:
 *   이모지·스티커 - 지금은 QuickPhrases의 빠른 문구가 그 자리를 맡고 있다.
 *                   그림을 붙이려면 위젯에 격자 하나와 MessageKind 하나,
 *                   그리고 에셋 배포 경로가 함께 필요하다.
 *
 * 주의: 남는 것은 ZEP 기본 채팅 UI 자체다. 0.16.5에는 그 패널을 숨기는
 * API가 없어서, 우리가 쓰지 않을 뿐 화면에서 없앨 수는 없다.
 */
import type { ScriptPlayer, ScriptWidget } from "zep-script";
import type { PlayerTag, Room } from "../types/Game.types.ts";
import type { ChatMessage, MessageDraft, MessageRow } from "../domain/chat/ChatMessage.ts";
import {
	addressedTo,
	buildMessage,
	isUserMessage,
	MessageKind,
} from "../domain/chat/ChatMessage.ts";
import { maskProfanity } from "../domain/chat/ChatFilter.ts";
import { ChatChannel, channelDef, toChannel, zepAudienceFor } from "../domain/chat/ChatChannel.ts";
import { quickFor } from "../domain/chat/QuickPhrases.ts";
import type { ChatContext } from "../domain/chat/ChatPermission.ts";
import {
	accessOf,
	LOOSE_CONTEXT,
	preferredChannel,
	readableChannels,
} from "../domain/chat/ChatPermission.ts";
import { hearsGhosts, inMafiaChat, roleName } from "../domain/Roles.ts";
import { spend } from "../domain/RateLimit.ts";
import { locate, locateSpectator } from "../entities/RoomRegistry.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";
import { CHAT_RATE } from "../constants/GameConfig.ts";
import type { ChatChannelView } from "../types/Widget.types.ts";
import { asText, field, MAX_CHAT_LENGTH, messageType } from "../types/Widget.types.ts";
import { forEachAudience, label } from "./Broadcast.ts";
import { inOwnRoomArea } from "./Stage.ts";
import type { ChatVoice } from "./ChatCommands.ts";
import { runCommand } from "./ChatCommands.ts";
import type { ChatFocus } from "./Widgets.ts";
import { bindMessage, openChat, squeezeMain, updateChat } from "./Widgets.ts";

/** 방이 기억하는 줄 수. 한 판이 길어야 밤낮 10턴이라 이 정도면 전부 남는다 */
const ROOM_LOG_LIMIT = 120;
/** 월드 전체 채팅이 기억하는 줄 수 */
const GLOBAL_LOG_LIMIT = 40;
/** 창을 열 때 되살려 주는 줄 수 */
const HISTORY_LIMIT = 60;

let nextSeq = 1;
const globalLog: ChatMessage[] = [];

/**
 * 월드가 통째로 내려갈 때 전체 채팅 기록을 비운다.
 * (테스트 사이의 격리도 이 함수 하나로 해결된다)
 */
export function resetGlobalLog(): void {
	globalLog.length = 0;
	nextSeq = 1;
}

// ────────────────────────────────────────────────────────────── 상황 파악

function contextOf(playerId: string): ChatContext {
	const found = locate(playerId);
	if (!found) return spectatorContext(playerId);
	const room = found.room;
	const seat = found.seat;
	return {
		seated: true,
		started: room.started,
		phase: room.phase,
		// 대기실 좌석은 alive가 false로 시작한다(assignRole이 게임 시작 때 켠다).
		// 그 값을 그대로 쓰면 대기실에 앉은 전원이 유령 취급을 받아
		// 로비 채팅이 통째로 잠긴다. 진행 중일 때만 좌석 값을 믿는다.
		alive: !room.started || seat.alive,
		spectating: false,
		mafiaChat: inMafiaChat(seat),
		ghostChat: hearsGhosts(seat),
		// alive와 같은 이유로 started를 함께 본다. 좌석의 silenced는 밤 정산이
		// 켜고 다음 밤이 끄는 값이라, 판이 끝난 뒤 남아 있으면 대기실에서
		// 말을 못 하는 사람이 생긴다.
		silenced: room.started && seat.silenced,
		chatMode: room.ruleSet.chatMode,
	};
}

/**
 * 좌석이 없는 사람. 진행 중인 방을 보고 있으면 관전, 아니면 로비.
 *
 * 관전자의 좌석 값(role·alive·silenced)은 createSeat이 준 기본값 그대로라
 * 아무 의미가 없다. 그래서 좌석을 들여다보지 않고 상수로 채운다 — 여기서
 * seat을 읽기 시작하면 "관전자의 직업"이라는 없는 개념이 생긴다.
 */
function spectatorContext(playerId: string): ChatContext {
	const watching = locateSpectator(playerId);
	if (!watching) return LOOSE_CONTEXT;
	return {
		seated: true,
		started: true,
		phase: watching.room.phase,
		// 죽은 것이 아니라 애초에 참가하지 않았다. 유령 채널은 spectating이 막는다
		alive: false,
		spectating: true,
		mafiaChat: false,
		ghostChat: false,
		silenced: false,
		chatMode: watching.room.ruleSet.chatMode,
	};
}

// ────────────────────────────────────────────────────────────── 기록

function logOf(room: Room | null, channel: ChatChannel): ChatMessage[] | null {
	if (channel === ChatChannel.GLOBAL) return globalLog;
	return room ? room.chatLog : null;
}

function store(room: Room | null, message: ChatMessage): void {
	const log = logOf(room, message.channel);
	if (!log) return;
	log.push(message);
	const limit = message.channel === ChatChannel.GLOBAL ? GLOBAL_LOG_LIMIT : ROOM_LOG_LIMIT;
	if (log.length > limit) log.splice(0, log.length - limit);
}

/**
 * 이 사람이 지금 볼 수 있는 모든 기록을 시간순으로.
 *
 * 창을 열 때의 되살리기와 미확인 개수 세기가 같은 함수를 쓴다. 두 곳이
 * 서로 다른 기준으로 거르면 "안 읽음 3"이라고 떠 있는데 열어보면
 * 아무것도 없는 상태가 만들어진다. 차단도 같은 이유로 여기를 지난다 —
 * 배달에서만 막으면 창을 다시 열 때 차단한 사람의 말이 되살아난다.
 */
function visibleLog(player: ScriptPlayer, ctx: ChatContext): ChatMessage[] {
	const found = locate(player.id);
	const pool = found ? globalLog.concat(found.room.chatLog) : globalLog.slice();
	const tag = tagOf(player);
	const visible = pool.filter(
		message =>
			addressedTo(message, player.id) &&
			accessOf(ctx, message.channel).read &&
			!isBlockedBy(tag, message)
	);
	visible.sort((a, b) => a.seq - b.seq);
	return visible;
}

/**
 * 이 사람이 차단한 상대가 보낸 말인가.
 *
 * 사람이 친 말만 걸린다. 시스템 안내와 사망 기록까지 가리면 차단이
 * "저 사람을 안 본다"가 아니라 "게임 진행을 못 본다"가 된다 —
 * 차단한 사람이 처형당한 사실조차 모르게 된다.
 */
function isBlockedBy(tag: PlayerTag, message: ChatMessage): boolean {
	if (!isUserMessage(message)) return false;
	if (message.senderId === "") return false;
	return Object.prototype.hasOwnProperty.call(tag.blocked, message.senderId);
}

function lastSeqIn(log: ChatMessage[], channel: ChatChannel): number {
	let last = 0;
	for (const message of log) {
		if (message.channel === channel && message.seq > last) last = message.seq;
	}
	return last;
}

function markSeen(seen: { [channel: string]: number }, channel: ChatChannel, seq: number): void {
	if (seq > (seen[channel] || 0)) seen[channel] = seq;
}

// ────────────────────────────────────────────────────────────── 위젯에 보낼 모습

function channelViews(player: ScriptPlayer, ctx: ChatContext): ChatChannelView[] {
	const seen = tagOf(player).chatSeen;
	const log = visibleLog(player, ctx);
	return readableChannels(ctx).map(channel => {
		const def = channelDef(channel);
		const access = accessOf(ctx, channel);
		const floor = seen[channel] || 0;
		let unread = 0;
		for (const message of log) {
			if (message.channel === channel && message.seq > floor) unread++;
		}
		return {
			id: channel,
			label: def.label,
			glyph: def.glyph,
			write: access.write,
			unread,
			// 잠긴 탭의 안내 문구는 채널이 아니라 잠근 이유가 정한다.
			// 위젯이 지어내던 문장(“지금은 읽기만 됩니다”)이 밤·사망·협박을
			// 한 마디로 덮고 있었다 — 세 경우에 해야 할 행동이 전혀 다르다.
			placeholder:
				access.write && access.freeText ? def.placeholder : `${access.note} (/도움말)`,
		};
	});
}

// ────────────────────────────────────────────────────────────── 배달

function deliverTo(player: ScriptPlayer, message: ChatMessage): void {
	if (!addressedTo(message, player.id)) return;
	const ctx = contextOf(player.id);
	if (!accessOf(ctx, message.channel).read) return;
	const tag = tagOf(player);
	if (!tag.chatWidget) return;
	// 차단은 배달에서만 막는다. 기록에는 남으므로 차단을 풀면 그 사이의 말도
	// 다시 보이고, 무엇보다 "이 사람에게만 안 보인다"가 방 전체의 대화
	// 흐름을 바꾸지 않는다 — 발언 자체를 지우면 남들과 대화가 어긋난다.
	if (isBlockedBy(tag, message)) return;
	// 펼쳐진 채로 지금 보고 있는 탭에 도착했으면 곧바로 읽은 것으로 친다.
	// 그렇지 않으면 눈앞에 뜬 메시지에 "안 읽음 1"이 계속 붙어 있게 된다.
	if (tag.chatOpen && tag.chatChannel === message.channel) {
		markSeen(tag.chatSeen, message.channel, message.seq);
	}
	updateChat(player, { type: "line", line: message, channels: channelViews(player, ctx) });
}

function post(room: Room | null, draft: MessageDraft): void {
	const message = buildMessage(nextSeq++, Time.getUtcTime(), draft);
	store(room, message);
	if (message.channel === ChatChannel.GLOBAL) {
		for (const player of ScriptApp.players) deliverTo(player, message);
		return;
	}
	// 관전자까지 돈다. 실제로 무엇이 보이는지는 deliverTo 안의 accessOf가
	// 사람마다 다시 판정하므로, 넓게 돌아도 마피아·유령 줄은 새지 않는다.
	if (room) forEachAudience(room, player => deliverTo(player, message));
}

// ────────────────────────────────────────────────────────────── 서버가 쓰는 입구

/** 방 전체에 보내는 진행 안내 */
export function say(room: Room, text: string): void {
	post(room, { channel: ChatChannel.ROOM, kind: MessageKind.SYSTEM, text });
}

/**
 * 방 전체에 보내는 사건 기록 (사망·처형·특종·직업 공개).
 *
 * say와 나눈 이유는 "게임 이벤트 로그"를 따로 뽑기 위해서다. 안내와 사건이
 * 같은 종류였다면 나중에 이벤트만 모아 보여주려 할 때 문자열을 파싱하는
 * 수밖에 없다. 지금은 kind로 거르면 된다.
 *
 * rows를 주면 text는 본문이 아니라 그 표의 제목이 된다 (MessageRow 참고).
 */
export function announce(room: Room, text: string, rows?: MessageRow[]): void {
	post(room, { channel: ChatChannel.ROOM, kind: MessageKind.EVENT, text, rows });
}

/** 마피아·유령처럼 특정 채널 안에서만 보이는 안내 */
export function channelSay(room: Room, channel: ChatChannel, text: string): void {
	post(room, { channel, kind: MessageKind.SYSTEM, text });
}

/** 입장·퇴장 알림 */
export function notice(room: Room, text: string): void {
	post(room, { channel: ChatChannel.ROOM, kind: MessageKind.NOTICE, text });
}

/** 월드 전체에 보이는 알림 */
export function worldNotice(text: string): void {
	post(null, { channel: ChatChannel.GLOBAL, kind: MessageKind.NOTICE, text });
}

/**
 * 이 사람 앞으로만 가는 줄을 어느 탭에 놓을지 정한다.
 *
 * 지금 보고 있는 탭이 기본이다. 밤에 마피아 탭을 보고 있는데 개인 안내가
 * 방 탭에 쌓이면 읽으라고 보낸 문장을 못 읽는다 — 안 읽음 표시만 뜨고
 * 정작 글은 눈앞에 없는 상태가 된다. 지금 탭을 읽을 권한이 없으면
 * (관전자가 마피아 탭을 켜둔 채 좌석을 잃은 경우 등) 누구에게나 열려 있는
 * 전체로 물러선다.
 *
 * 방을 함께 돌려주는 이유: GLOBAL이 아닌 채널은 post가 방을 알아야 배달한다.
 * 채널과 방은 따로 고르면 어긋날 수 있는 한 쌍이라 한자리에서 정한다.
 * 어긋나지 않는 근거는 권한 표에 있다 — GLOBAL 아닌 채널은 전부
 * `!ctx.seated`에서 막히므로, 읽을 수 있다면 좌석이 있고 방도 있다.
 */
function personalTarget(player: ScriptPlayer): { room: Room | null; channel: ChatChannel } {
	const found = locate(player.id);
	const tag = tagOf(player);
	const ctx = contextOf(player.id);
	return {
		room: found ? found.room : null,
		channel: accessOf(ctx, tag.chatChannel).read ? tag.chatChannel : ChatChannel.GLOBAL,
	};
}

/** 한 사람에게만 보이는 안내 */
export function tell(player: ScriptPlayer, text: string, rows?: MessageRow[]): void {
	const target = personalTarget(player);
	post(target.room, {
		channel: target.channel,
		kind: MessageKind.SYSTEM,
		text,
		rows,
		to: player.id,
	});
}

// ────────────────────────────────────────────────────────────── 창 열고 닫기

/**
 * 접속 직후·재접속 직후. 권한에 맞는 기록까지 함께 되살린다.
 *
 * focus는 창이 뜬 뒤 입력창을 잡을지 정한다. 부르는 쪽이 반드시 적어야 하고
 * 기본값을 두지 않았다 — 포커스를 뺏는 것은 눈에 띄는 동작이라 "그냥 열기"와
 * "눌러서 열기"를 호출부에서 구분해 두는 편이 안전하다.
 */
export function openFor(player: ScriptPlayer, focus: ChatFocus): void {
	const ctx = contextOf(player.id);
	const tag = tagOf(player);
	const log = visibleLog(player, ctx);

	// 처음 들어온 사람은 자기가 오기 전의 대화까지 "안 읽음"으로 떠안을 이유가 없다
	if (isFirstOpen(tag.chatSeen)) {
		for (const channel of readableChannels(ctx)) {
			markSeen(tag.chatSeen, channel, lastSeqIn(log, channel));
		}
	}
	tag.chatChannel = preferredChannel(ctx, tag.chatChannel);
	markSeen(tag.chatSeen, tag.chatChannel, lastSeqIn(log, tag.chatChannel));

	const widget = openChat(player, {
		type: "init",
		channels: channelViews(player, ctx),
		active: tag.chatChannel,
		quick: quickFor(ctx),
		open: tag.chatOpen,
		myId: player.id,
		lines: log.slice(-HISTORY_LIMIT),
		focus,
	});
	bind(widget);
}

function isFirstOpen(seen: { [channel: string]: number }): boolean {
	for (const key in seen) {
		if (Object.prototype.hasOwnProperty.call(seen, key)) return false;
	}
	return true;
}

/**
 * 단계가 바뀌거나 누가 죽었을 때 탭 목록을 다시 보낸다.
 *
 * 창을 다시 열지 않는 이유는 입력 중이던 글자와 스크롤 위치가 날아가기
 * 때문이다. 바뀐 것은 권한뿐이므로 권한만 보낸다.
 */
export function refresh(player: ScriptPlayer): void {
	const tag = tagOf(player);
	if (!tag.chatWidget) return;
	const ctx = contextOf(player.id);
	tag.chatChannel = preferredChannel(ctx, tag.chatChannel);
	markSeen(tag.chatSeen, tag.chatChannel, lastSeqIn(visibleLog(player, ctx), tag.chatChannel));
	updateChat(player, {
		type: "channels",
		channels: channelViews(player, ctx),
		active: tag.chatChannel,
		quick: quickFor(ctx),
	});
}

export function refreshRoom(room: Room): void {
	forEachAudience(room, player => refresh(player));
}

// ────────────────────────────────────────────────────────────── 위젯이 보내오는 것

function bind(widget: ScriptWidget): void {
	bindMessage(widget, "chat", (sender, data) => {
		const type = messageType(data);
		if (type === "send") submit(sender, data);
		else if (type === "channel") switchChannel(sender, data);
		else if (type === "toggle") toggle(sender, data);
	});
}

function submit(sender: ScriptPlayer, data: unknown): void {
	const raw = asText(field(data, "text"), MAX_CHAT_LENGTH);
	if (raw === null) return;
	/*
	 * 체는 여기 한 곳만 지난다.
	 *
	 * 명령어 분기보다 앞이라 귓속말 내용도 같이 걸러진다. 뒤에 두면
	 * "전체 채팅은 걸러지는데 귓속말은 안 걸러지는" 구멍이 생기고, 그
	 * 구멍은 새 명령어를 만들 때마다 다시 뚫린다.
	 *
	 * 대가는 `/차단 시발놈` 같은 입력에서 상대 이름까지 가려진다는 것이다.
	 * 걸리는 말이 든 닉네임은 그 자체로 신고 대상이니 감수할 만하다.
	 */
	const text = maskProfanity(raw);

	/*
	 * 여유분을 값이 나가기 직전에 치른다.
	 *
	 * 명령어 분기보다 앞에 둔 이유: /도움말도 연타하면 tell이 그만큼 쏟아진다.
	 * 도배 경로는 발언과 명령 둘인데 관문을 하나만 세우면 반만 막힌다.
	 * 반대로 빈 줄 검사보다는 뒤다 — 서버가 어차피 버릴 줄을 세면 조작된
	 * 클라이언트가 빈 줄만 보내 남의 발언권을 깎을 수 있다.
	 *
	 * 알림이 채팅이 아니라 라벨인 것이 중요하다. 채팅으로 보내면 연타하는
	 * 사람의 창이 경고로 뒤덮여서, 도배를 막으려다 그 경고가 다시 도배가 된다.
	 * 라벨은 서로 덮어쓰고 저절로 사라져 몇 번을 맞아도 한 줄이다.
	 *
	 * 서버에 두는 이유는 MAX_CHAT_LENGTH와 같다 — 위젯에 같은 제한을 걸면
	 * 입력창이 즉각 반응해 손맛이 좋아지지만 위젯은 조작할 수 있다. 그쪽은
	 * 어디까지나 표시이고 실제 한계는 여기다.
	 */
	if (!spend(tagOf(sender).chatRate, CHAT_RATE, Time.getUtcTime())) {
		label(sender, "🕐 조금 천천히 말해 주세요.");
		return;
	}

	if (text.charAt(0) === "/") {
		runCommand(VOICE, sender, text);
		return;
	}

	const channel = toChannel(field(data, "channel"));
	if (!channel) return;
	const ctx = contextOf(sender.id);
	// 조작된 클라이언트는 어떤 채널이든 보낼 수 있다. 서버가 마지막 관문이다 —
	// 여기가 뚫리면 죽은 사람이 낮 채팅으로 범인을 불러 게임이 끝난다.
	if (!accessOf(ctx, channel).write) return;
	// 침묵전. 자유 입력이 막힌 채널에는 준비된 문구만 통과시킨다 —
	// 위젯이 입력창을 감춰도 조작된 클라이언트는 아무 문자열이나 보낸다
	if (!accessOf(ctx, channel).freeText && quickFor(ctx).indexOf(text) < 0) {
		label(sender, "🤐 준비된 문구만 보낼 수 있습니다.");
		return;
	}

	const found = locate(sender.id);
	const def = channelDef(channel);
	const reveals = def.revealsRole;
	post(found ? found.room : null, {
		channel,
		kind: MessageKind.USER,
		senderId: sender.id,
		num: found ? found.seat.index : 0,
		name: sender.name,
		role: reveals && found ? roleName(found.seat.role) : "",
		team: reveals && found ? found.seat.team : "",
		text,
	});

	/*
	 * ZEP 기본 채팅에도 같은 말을 내보낸다 — 아바타 위 말풍선.
	 *
	 * 위 accessOf 관문을 지난 뒤라야 한다. 여기가 관문보다 앞에 있으면
	 * 서버가 버린 발언이 말풍선으로만 뜨고, 죽은 사람이 낮에 말하게 된다.
	 *
	 * 실제로 쏘는 것은 보낸 사람의 클라이언트다(native-chat.js의 NativeChat.say).
	 * 말풍선은 자기 아바타 위에만 띄울 수 있어서 서버가 대신 못 한다.
	 * 못 쏘는 환경(교차 출처, 클라이언트 내부 구조 변경)에서는 조용히
	 * 아무 일도 일어나지 않는다 — 채팅 자체는 이미 위에서 배달됐다.
	 *
	 * 청중을 고르는 판단은 전부 zepAudienceFor 안에 있다. 여기서는 그 답을
	 * 그대로 위젯에 넘긴다 — null이면 아무것도 보내지 않는 것이 곧 침묵이다.
	 */
	const area = zepAudienceFor(channel, found ? inOwnRoomArea(found.room, sender) : false);
	if (area) updateChat(sender, { type: "say", text, area });
}

function switchChannel(sender: ScriptPlayer, data: unknown): void {
	const channel = toChannel(field(data, "channel"));
	if (!channel) return;
	const ctx = contextOf(sender.id);
	if (!accessOf(ctx, channel).read) return;
	const tag = tagOf(sender);
	tag.chatChannel = channel;
	markSeen(tag.chatSeen, channel, lastSeqIn(visibleLog(sender, ctx), channel));
	updateChat(sender, {
		type: "channels",
		channels: channelViews(sender, ctx),
		active: channel,
		quick: quickFor(ctx),
	});
}

function toggle(sender: ScriptPlayer, data: unknown): void {
	const open = field(data, "open") === true;
	tagOf(sender).chatOpen = open;
	// 접기는 CSS가 아니라 더 작은 위젯으로 다시 여는 것이다 (WidgetSize.CHAT 주석 참고).
	// 그래서 "게임 화면에서 Enter로 폈다"는 사실도 위젯이 혼자 이어갈 수 없다 —
	// 앞 문서가 알려준 의도를 그대로 새 문서에 넘겨준다.
	openFor(sender, asFocus(field(data, "focus")));
	// 모바일은 세로가 좁아 채팅과 단계 위젯이 제 크기로 함께 뜰 수 없다.
	// 펼치는 쪽이 아니라 자리를 내주는 쪽을 여기서 줄인다 — 채팅은 늘 제
	// 크기로 뜨고, 단계 위젯은 다시 열리지 않으므로 누르던 것이 살아 있다.
	squeezeMain(sender, open);
}

/**
 * 위젯이 보낸 포커스 요청을 아는 값으로만 좁힌다.
 *
 * 위젯에서 오는 것은 전부 남이 보낸 값이다. 조작된 클라이언트가 아무 문자열을
 * 넣어도 여기서 ""가 된다 — 모르는 값에 대한 답은 "아무것도 하지 않는다"다.
 */
function asFocus(value: unknown): ChatFocus {
	if (value === "input") return "input";
	if (value === "command") return "command";
	return "";
}

// ────────────────────────────────────────────────────── 명령어에게 빌려주는 목소리

/**
 * 귓속말 한 줄을 만든다.
 *
 * "누구에게 보낼지"는 명령어가 정하고, "어떤 줄이 되는지"는 여기가 정한다.
 * 줄을 만드는 규칙이 채팅 쪽에 남아야 하는 이유는 아래 USER 주석 그대로다 —
 * 명령어 파일에 두면 다음에 귓속말을 부르는 곳(예: 위젯의 답장 버튼)이
 * 같은 규칙을 다시 적게 된다.
 */
function whisperTo(from: ScriptPlayer, to: ScriptPlayer, body: string): void {
	// USER로 보내는 것이 핵심이다. 받은 사람이 이 줄을 그대로 /차단·/신고의
	// 대상으로 삼을 수 있어야 한다 — SYSTEM으로 보내면 senderId가 비어
	// 귓속말만 아무 제재도 받지 않는 통로가 된다.
	//
	// 놓을 자리는 tell과 같은 personalTarget이 정한다. 여기서 GLOBAL로 못박으면
	// 방 탭을 보던 사람은 안 읽음 표시만 받고 정작 귓속말은 못 본다. 보내는 쪽
	// 사본(아래 tell)은 눈앞에 뜨는데 받는 쪽만 안 뜨는, 두 사람이 서로 다른
	// 화면을 보는 상태가 된다.
	const target = personalTarget(to);
	post(target.room, {
		channel: target.channel,
		kind: MessageKind.USER,
		senderId: from.id,
		name: from.name,
		text: `💌 ${body}`,
		to: to.id,
	});
	tell(from, `💌 ${to.name} 님에게: ${body}`);
}

/**
 * 귓속말이 게임 밖에서만 열리는 이유:
 *   귓속말이 판 안에서 통하면 마피아가 낮에 몰래 합을 맞추고, 죽은 사람이
 *   산 사람에게 범인을 찍어줄 수 있다. 채널 표(ChatPermission)가 막아 둔 것을
 *   명령어 하나로 우회하는 셈이다.
 *
 * 그래서 새 조건을 쓰지 않고 전체 채팅의 쓰기 권한을 그대로 묻는다.
 * 둘의 규칙("게임 밖에서만")이 같으므로, 한쪽 규칙이 바뀌면 다른 쪽도
 * 저절로 따라간다 — 조건을 복사했다면 여기가 먼저 어긋났을 자리다.
 */
function canWhisper(player: ScriptPlayer): boolean {
	return accessOf(contextOf(player.id), ChatChannel.GLOBAL).write;
}

/**
 * 명령어가 채팅에 닿는 유일한 통로.
 *
 * 여기 없는 일은 명령어가 할 수 없다. 표를 넓히기 전에 "이게 정말 채팅이
 * 해줘야 할 일인가"를 한 번 묻게 만드는 것이 이 객체의 목적이다.
 */
const VOICE: ChatVoice = { tell, whisper: whisperTo, canWhisper };
