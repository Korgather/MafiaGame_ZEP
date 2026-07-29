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
 *   ChatService    - 만들고 저장하고 배달한다 (여기)
 *   chat.html      - 그린다. 직업도 단계도 모른다
 *
 * 확장 지점:
 *   귓속말   - ChatMessage.to에 상대 playerId를 넣고 post하면 끝이다.
 *              tell()이 이미 그 경로로 동작한다.
 *   신고·차단 - ChatMessage.senderId가 대상. deliver()에 차단 목록 필터 한 줄.
 *   필터링   - submit()의 text 한 곳만 지나면 모든 발언이 걸러진다.
 *   명령어   - COMMANDS 표에 한 줄.
 *
 * 주의: 남는 것은 ZEP 기본 채팅 UI 자체다. 0.16.5에는 그 패널을 숨기는
 * API가 없어서, 우리가 쓰지 않을 뿐 화면에서 없앨 수는 없다.
 */
import type { ScriptPlayer, ScriptWidget } from "zep-script";
import type { ChatChannelView, Room } from "../types/Game.types.ts";
import { GamePhase } from "../types/Game.types.ts";
import type { ChatMessage, MessageDraft } from "../domain/chat/ChatMessage.ts";
import { addressedTo, buildMessage, MessageKind } from "../domain/chat/ChatMessage.ts";
import { ChatChannel, channelDef, toChannel } from "../domain/chat/ChatChannel.ts";
import type { ChatContext } from "../domain/chat/ChatPermission.ts";
import {
	accessOf,
	LOOSE_CONTEXT,
	preferredChannel,
	readableChannels,
} from "../domain/chat/ChatPermission.ts";
import { hearsGhosts, inMafiaChat, roleName } from "../domain/Roles.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";
import { ADMIN_EXP_GRANT, ADMIN_ROLE_LEVEL } from "../constants/GameConfig.ts";
import { asText, field, MAX_CHAT_LENGTH, messageType } from "../types/Widget.types.ts";
import { forEachPlayer } from "./Broadcast.ts";
import { awardExp } from "./Rewards.ts";
import type { ChatFocus } from "./Widgets.ts";
import { openChat, squeezeMain, updateChat } from "./Widgets.ts";

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
	if (!found) return LOOSE_CONTEXT;
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
		mafiaChat: inMafiaChat(seat),
		ghostChat: hearsGhosts(seat),
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
 * 아무것도 없는 상태가 만들어진다.
 */
function visibleLog(playerId: string, ctx: ChatContext): ChatMessage[] {
	const found = locate(playerId);
	const pool = found ? globalLog.concat(found.room.chatLog) : globalLog.slice();
	const visible = pool.filter(
		message => addressedTo(message, playerId) && accessOf(ctx, message.channel).read
	);
	visible.sort((a, b) => a.seq - b.seq);
	return visible;
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
	const log = visibleLog(player.id, ctx);
	return readableChannels(ctx).map(channel => {
		const def = channelDef(channel);
		const floor = seen[channel] || 0;
		let unread = 0;
		for (const message of log) {
			if (message.channel === channel && message.seq > floor) unread++;
		}
		return {
			id: channel,
			label: def.label,
			glyph: def.glyph,
			write: accessOf(ctx, channel).write,
			unread,
			placeholder: def.placeholder,
		};
	});
}

/**
 * 지금 상황에서 한 번에 보낼 만한 말.
 *
 * 서버가 고르는 이유는 위젯을 단계·직업으로부터 떼어놓기 위해서다.
 * 밤에 마피아에게 "이 사람 칩시다"를 내미는 판단이 위젯에 있으면
 * chat.html이 마피아가 무엇인지 알아야 한다.
 */
const QUICK_WORLD: string[] = ["안녕하세요", "같이 하실 분?", "ㅋㅋㅋ"];
const QUICK_LOBBY: string[] = ["준비 완료", "잠깐만요", "한 명만 더!"];
const QUICK_DAY: string[] = ["투표해주세요", "저는 시민입니다", "의심됩니다", "정보 있어요"];
const QUICK_VOTE: string[] = ["투표했습니다", "기권합니다", "다시 생각해보죠"];
const QUICK_MAFIA: string[] = ["이 사람 칩시다", "오늘은 넘기죠", "제가 갈게요"];
const QUICK_GHOST: string[] = ["누가 죽였는지 봤어요", "억울합니다", "잘 싸웠습니다"];
const QUICK_NONE: string[] = [];

function quickFor(ctx: ChatContext): string[] {
	if (!ctx.seated) return QUICK_WORLD;
	if (!ctx.alive) return QUICK_GHOST;
	// 밤에 마피아가 아니면 말할 곳 자체가 없다 — 칩을 띄우면 눌러도 아무 일이 없다
	if (ctx.phase === GamePhase.NIGHT) return ctx.mafiaChat ? QUICK_MAFIA : QUICK_NONE;
	if (ctx.phase === GamePhase.LOBBY) return QUICK_LOBBY;
	if (ctx.phase === GamePhase.VOTE || ctx.phase === GamePhase.VOTE_RESULT) return QUICK_VOTE;
	if (ctx.phase === GamePhase.DAY) return QUICK_DAY;
	return QUICK_WORLD;
}

// ────────────────────────────────────────────────────────────── 배달

function deliverTo(player: ScriptPlayer, message: ChatMessage): void {
	if (!addressedTo(message, player.id)) return;
	const ctx = contextOf(player.id);
	if (!accessOf(ctx, message.channel).read) return;
	const tag = tagOf(player);
	if (!tag.chatWidget) return;
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
	if (room) forEachPlayer(room, player => deliverTo(player, message));
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
 */
export function announce(room: Room, text: string): void {
	post(room, { channel: ChatChannel.ROOM, kind: MessageKind.EVENT, text });
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
 * 한 사람에게만 보이는 안내.
 *
 * 지금 보고 있는 탭에 띄운다. 밤에 마피아 탭을 보고 있는데 개인 안내가
 * 방 탭에 쌓이면 읽으라고 보낸 문장을 못 읽는다. 귓속말도 같은 경로다 —
 * to를 상대 id로 바꾸기만 하면 된다.
 */
export function tell(player: ScriptPlayer, text: string): void {
	const found = locate(player.id);
	const tag = tagOf(player);
	const ctx = contextOf(player.id);
	const channel = accessOf(ctx, tag.chatChannel).read ? tag.chatChannel : ChatChannel.GLOBAL;
	post(found ? found.room : null, {
		channel,
		kind: MessageKind.SYSTEM,
		text,
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
	const log = visibleLog(player.id, ctx);

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
	markSeen(tag.chatSeen, tag.chatChannel, lastSeqIn(visibleLog(player.id, ctx), tag.chatChannel));
	updateChat(player, {
		type: "channels",
		channels: channelViews(player, ctx),
		active: tag.chatChannel,
		quick: quickFor(ctx),
	});
}

export function refreshRoom(room: Room): void {
	forEachPlayer(room, player => refresh(player));
}

// ────────────────────────────────────────────────────────────── 위젯이 보내오는 것

function bind(widget: ScriptWidget): void {
	widget.onMessage.Add((sender, data) => {
		const type = messageType(data);
		if (type === "send") submit(sender, data);
		else if (type === "channel") switchChannel(sender, data);
		else if (type === "toggle") toggle(sender, data);
	});
}

/**
 * 도배를 막되 대화는 막지 않는다 — 여유분(토큰) 방식.
 *
 * 마지막 계산 이후 흐른 시간만큼 여유분을 채우고, 한 줄에 하나를 쓴다.
 * 남은 것이 없으면 그 줄만 버린다. 음소거도 강퇴도 없고 잠시 뒤 저절로
 * 풀리므로, 정상적으로 대화하던 사람은 제한이 있다는 사실조차 모른다.
 *
 * 알림을 채팅이 아니라 라벨로 보내는 것이 중요하다. 채팅으로 보내면
 * 연타하는 사람의 창이 경고로 뒤덮여서, 도배를 막으려다 그 경고가 다시
 * 도배가 된다. 라벨은 서로 덮어쓰고 저절로 사라져 몇 번을 맞아도 한 줄이다.
 *
 * 서버에 두는 이유는 MAX_CHAT_LENGTH와 같다 — 위젯에 같은 제한을 걸면
 * 입력창이 즉각 반응해 손맛이 좋아지지만, 위젯은 조작할 수 있으므로 그쪽은
 * 어디까지나 표시이고 실제 한계는 이 함수다.
 */
function spendChatToken(sender: ScriptPlayer): boolean {
	const tag = tagOf(sender);
	const now = Time.getUtcTime();
	const refilled = tag.chatTokens + (now - tag.chatRefilledAt) / CHAT_RATE.REFILL_MS;
	tag.chatTokens = Math.min(CHAT_RATE.BURST, refilled);
	tag.chatRefilledAt = now;

	if (tag.chatTokens < 1) {
		label(sender, "🕐 조금 천천히 말해 주세요.");
		return false;
	}
	tag.chatTokens -= 1;
	return true;
}

function submit(sender: ScriptPlayer, data: unknown): void {
	const text = asText(field(data, "text"), MAX_CHAT_LENGTH);
	if (text === null) return;
	// 명령어보다 앞에 둔다. /도움말도 연타하면 tell이 그만큼 쏟아진다 —
	// 도배 경로는 발언과 명령 둘인데 관문을 하나만 세우면 반만 막힌다.
	if (!spendChatToken(sender)) return;
	if (text.charAt(0) === "/") {
		runCommand(sender, text);
		return;
	}

	const channel = toChannel(field(data, "channel"));
	if (!channel) return;
	const ctx = contextOf(sender.id);
	// 조작된 클라이언트는 어떤 채널이든 보낼 수 있다. 서버가 마지막 관문이다 —
	// 여기가 뚫리면 죽은 사람이 낮 채팅으로 범인을 불러 게임이 끝난다.
	if (!accessOf(ctx, channel).write) return;

	const found = locate(sender.id);
	const reveals = channelDef(channel).revealsRole;
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
}

function switchChannel(sender: ScriptPlayer, data: unknown): void {
	const channel = toChannel(field(data, "channel"));
	if (!channel) return;
	const ctx = contextOf(sender.id);
	if (!accessOf(ctx, channel).read) return;
	const tag = tagOf(sender);
	tag.chatChannel = channel;
	markSeen(tag.chatSeen, channel, lastSeqIn(visibleLog(sender.id, ctx), channel));
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

// ────────────────────────────────────────────────────────────── 채팅 명령어

interface ChatCommand {
	/** 운영자만 쓸 수 있는가 */
	readonly admin: boolean;
	readonly help: string;
	run(player: ScriptPlayer): void;
}

/**
 * 명령어 표.
 *
 * 기존의 `/경험치`는 ScriptApp.onSay 핸들러 안의 if 한 줄이었다. 그 핸들러는
 * 원본에서 `.add`(소문자)로 등록돼 한 번도 불리지 않았고 — ZEP API는 `.Add`다 —
 * 아무도 눈치채지 못했다. 명령이 하나뿐이고 등록도 확인도 한 곳에서만
 * 일어났기 때문이다. 표로 만들면 명령을 늘려도 배선은 그대로다.
 *
 * 키가 전부 "/"로 시작하므로 사용자 입력이 Object.prototype의 멤버("constructor"
 * 등)에 닿을 수 없다. 그것이 여기서 인덱스 조회를 그대로 써도 되는 이유다.
 */
const COMMANDS: { [name: string]: ChatCommand } = {
	"/도움말": {
		admin: false,
		help: "쓸 수 있는 명령어를 봅니다",
		run: player => tell(player, helpText(player)),
	},
	"/경험치": {
		admin: true,
		help: "경험치를 지급합니다 (운영자)",
		run: player => awardExp(player, ADMIN_EXP_GRANT),
	},
};

function helpText(player: ScriptPlayer): string {
	const lines = ["📖 채팅 명령어"];
	for (const name in COMMANDS) {
		if (!Object.prototype.hasOwnProperty.call(COMMANDS, name)) continue;
		const command = COMMANDS[name];
		if (command.admin && player.role < ADMIN_ROLE_LEVEL) continue;
		lines.push(`${name} - ${command.help}`);
	}
	return lines.join("\n");
}

function runCommand(player: ScriptPlayer, text: string): void {
	const command = COMMANDS[text];
	if (!command) {
		tell(player, `❓ 모르는 명령어입니다: ${text}\n/도움말 을 쳐보세요.`);
		return;
	}
	if (command.admin && player.role < ADMIN_ROLE_LEVEL) {
		tell(player, "🔒 운영자만 쓸 수 있는 명령어입니다.");
		return;
	}
	command.run(player);
}
