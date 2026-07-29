/**
 * "이 상황에서 이 채널을 읽을 수 있는가 / 쓸 수 있는가"를 정하는 표.
 *
 * 기존에 채팅 권한은 세 곳에 서로 다른 모습으로 흩어져 있었다.
 *   - roleAction 위젯에 넘기는 chatEnable 불리언 (밤 마피아 채팅)
 *   - Chat.relayGhost 안의 `if (seat.alive && nightChat !== GHOST) return`
 *   - "밤에는 채팅 금지"라는 주석 — 실제로는 아무것도 하지 않는 죽은 코드
 * 규칙을 하나 바꾸려면 세 곳을 찾아 세 가지 방식으로 고쳐야 했고, 그 중
 * 한 곳은 이미 규칙과 코드가 어긋나 있었다.
 *
 * 순수 함수로 떼어낸 이유는 두 가지다.
 *   1. 밸런스 규칙이므로 게임 규칙(domain)이지 전송 로직(service)이 아니다.
 *   2. ZEP 없이 표 자체를 테스트할 수 있다. 밤에 시민이 말할 수 있는지는
 *      한 판을 돌리지 않고 한 줄로 확인할 수 있어야 한다.
 *
 * 읽기와 쓰기를 나눈 것이 핵심이다. 마피아는 낮에도 지난밤 밀담을 다시
 * 읽을 수 있어야 하지만(read) 낮에 그 채널로 말하면 안 된다(write).
 * 하나의 불리언으로는 이 구분을 표현할 수 없었다.
 */
import { GamePhase } from "../../types/Game.types.ts";
import { ChatChannel, CHANNEL_ORDER } from "./ChatChannel.ts";

export interface ChatContext {
	/** 어느 방에 좌석이 있는가 */
	readonly seated: boolean;
	/** 그 방이 게임 중인가 */
	readonly started: boolean;
	readonly phase: GamePhase;
	/** 살아 있는가. 대기실에서는 항상 true로 본다 */
	readonly alive: boolean;
	/** 마피아 밀담 참가자인가 (마피아 본인 + 합류한 스파이) */
	readonly mafiaChat: boolean;
	/** 유령의 목소리를 듣는 직업인가 (영매) */
	readonly ghostChat: boolean;
}

export interface ChannelAccess {
	readonly read: boolean;
	readonly write: boolean;
}

const NONE: ChannelAccess = { read: false, write: false };
const BOTH: ChannelAccess = { read: true, write: true };
const READ_ONLY: ChannelAccess = { read: true, write: false };

/** 방 밖(월드 로비)에 서 있는 사람의 기본 상태 */
export const LOOSE_CONTEXT: ChatContext = {
	seated: false,
	started: false,
	phase: GamePhase.LOBBY,
	alive: true,
	mafiaChat: false,
	ghostChat: false,
};

/**
 * 낮에 방 채팅으로 말할 수 있는 단계.
 *
 * NIGHT만 빠진다. 밤에 전원이 자유롭게 말할 수 있으면 마피아가 밤에
 * 무엇을 하든 의미가 없어진다 — 밤이 정보 비대칭을 만드는 유일한 시간이다.
 */
function roomTalkAllowed(phase: GamePhase): boolean {
	return phase !== GamePhase.NIGHT;
}

export function accessOf(ctx: ChatContext, channel: ChatChannel): ChannelAccess {
	if (channel === ChatChannel.GLOBAL) {
		// 듣는 것은 언제나 자유다. 다만 게임 중에는 말할 수 없다 —
		// 전체 채널이 열려 있으면 밤에 마피아가 바깥으로 신호를 보내거나
		// 죽은 사람이 산 사람에게 정보를 흘릴 수 있고, 그러면 아래 세 채널의
		// 제약이 전부 무의미해진다. 게임 밖에서만 열리는 로비 광장이다.
		return ctx.started ? READ_ONLY : BOTH;
	}

	if (channel === ChatChannel.ROOM) {
		if (!ctx.seated) return NONE;
		// 죽은 사람이 방 채팅으로 말하면 산 사람에게 정보가 샌다. 읽기는 남긴다 —
		// 관전의 재미가 낮 토론을 지켜보는 데 있기 때문이다.
		const write = ctx.alive && roomTalkAllowed(ctx.phase);
		return write ? BOTH : READ_ONLY;
	}

	if (channel === ChatChannel.MAFIA) {
		if (!ctx.mafiaChat) return NONE;
		const write = ctx.alive && ctx.phase === GamePhase.NIGHT;
		return write ? BOTH : READ_ONLY;
	}

	// GHOST — 사망자는 언제나, 영매는 밤에만.
	if (!ctx.seated) return NONE;
	if (!ctx.alive) return BOTH;
	if (!ctx.ghostChat) return NONE;
	return ctx.phase === GamePhase.NIGHT ? BOTH : NONE;
}

/** 지금 이 사람에게 보이는 채널들 (표시 순서대로) */
export function readableChannels(ctx: ChatContext): ChatChannel[] {
	return CHANNEL_ORDER.filter(channel => accessOf(ctx, channel).read);
}

/**
 * 지금 활성 탭으로 삼기에 가장 알맞은 채널.
 *
 * 지금 탭이 여전히 말할 수 있는 곳이면 그대로 둔다 — 멀쩡한 탭을 밑에서
 * 바꿔치우면 방금 친 말이 엉뚱한 곳으로 간다. 말할 수 없게 되었을 때만
 * 옮기고, 그때는 CHANNEL_ORDER의 우선순위를 따른다.
 */
export function preferredChannel(ctx: ChatContext, current: ChatChannel): ChatChannel {
	if (accessOf(ctx, current).write) return current;
	for (const channel of CHANNEL_ORDER) {
		if (accessOf(ctx, channel).write) return channel;
	}
	if (accessOf(ctx, current).read) return current;
	const readable = readableChannels(ctx);
	return readable.length > 0 ? readable[0] : ChatChannel.GLOBAL;
}
