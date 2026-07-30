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
 *
 * 세 번째 칸(note)이 붙은 이유:
 *   막힌 이유는 이 표만 안다. 그런데 그 이유를 보여주는 곳은 위젯이라,
 *   chat.html이 "지금은 읽기만 됩니다" 한 문장을 지어내 밤·사망·협박을
 *   모두 같은 말로 덮고 있었다. 이유를 별도 함수로 빼면 같은 조건표가
 *   두 벌이 되는데 — 이 파일이 생긴 원인이 바로 그 중복이다.
 *   그래서 판정과 이유를 한 번에 돌려준다.
 */
import { GamePhase } from "../../types/Game.types.ts";
import { ChatChannel, CHANNEL_ORDER } from "./ChatChannel.ts";

export interface ChatContext {
	/** 어느 방에 매여 있는가 (좌석이든 관전이든 — 방 채널이 보이는가) */
	readonly seated: boolean;
	/** 그 방이 게임 중인가 */
	readonly started: boolean;
	readonly phase: GamePhase;
	/** 살아 있는가. 대기실에서는 항상 true로 본다 */
	readonly alive: boolean;
	/**
	 * 좌석 없이 지켜보기만 하는 사람인가.
	 *
	 * alive=false로 뭉뚱그릴 수 없다. "죽었다"는 이 판에 참가했다가 탈락한
	 * 것이고, 유령 채널은 그 사람들이 서로 복기하는 자리다. 관전자는 이
	 * 판에 참가한 적이 없으므로 그 자리에 낄 이유가 없고, 무엇보다 낄 수
	 * 있으면 안 된다 — 유령 채널에는 누가 마피아인지가 그대로 오간다.
	 * 밖에서 들어온 사람이 그것을 읽고 나가서 옮기면 판이 끝난다.
	 *
	 * 그래서 이 값은 표시용 구분이 아니라 밸런스 값이다. alive와 나눠 둔다.
	 */
	readonly spectating: boolean;
	/** 마피아 밀담 참가자인가 (마피아 본인 + 합류한 스파이) */
	readonly mafiaChat: boolean;
	/** 유령의 목소리를 듣는 직업인가 (영매) */
	readonly ghostChat: boolean;
	/** 건달에게 협박당해 오늘 입이 막혔는가 */
	readonly silenced: boolean;
}

export interface ChannelAccess {
	readonly read: boolean;
	readonly write: boolean;
	/**
	 * 쓸 수 없는 이유. 쓸 수 있으면 "".
	 *
	 * 화면에 그대로 나가는 문장이다. 코드가 분기할 값이 아니므로 enum이
	 * 아니라 문자열이다 — 이유가 하나 늘 때 타입·번역표·분기 세 곳을
	 * 고치게 만들 만큼 이 값이 무겁지 않다.
	 */
	readonly note: string;
}

const NONE: ChannelAccess = { read: false, write: false, note: "" };
const OPEN: ChannelAccess = { read: true, write: true, note: "" };

/** 읽을 수는 있지만 쓸 수 없는 상태. 이유를 반드시 적게 한다 */
function locked(note: string): ChannelAccess {
	return { read: true, write: false, note };
}

/** 방 밖(월드 로비)에 서 있는 사람의 기본 상태 */
export const LOOSE_CONTEXT: ChatContext = {
	seated: false,
	started: false,
	phase: GamePhase.LOBBY,
	alive: true,
	spectating: false,
	mafiaChat: false,
	ghostChat: false,
	silenced: false,
};

export function accessOf(ctx: ChatContext, channel: ChatChannel): ChannelAccess {
	/*
	 * 관전자에게 비밀 채널은 아예 없다.
	 *
	 * 두 채널 각각의 분기에 조건을 하나씩 붙일 수도 있었지만, 이것은 채널별
	 * 규칙이 아니라 "판 밖의 사람"에 대한 한 줄짜리 정책이다. 위에 모아 두면
	 * 나중에 비밀 채널(예: 연인·공범)이 늘어도 여기가 그대로 막아준다 —
	 * 아래에 흩어 두면 새 채널을 만든 사람이 이 조건을 다시 적어야 하고,
	 * 잊으면 그 채널만 관전자에게 열린다.
	 *
	 * GLOBAL은 ctx.started가 이미 잠그고(게임 중에는 아무도 못 쓴다),
	 * ROOM은 아래에서 읽기만 열어준다.
	 */
	if (ctx.spectating && (channel === ChatChannel.MAFIA || channel === ChatChannel.GHOST)) {
		return NONE;
	}

	if (channel === ChatChannel.GLOBAL) {
		// 듣는 것은 언제나 자유다. 다만 게임 중에는 말할 수 없다 —
		// 전체 채널이 열려 있으면 밤에 마피아가 바깥으로 신호를 보내거나
		// 죽은 사람이 산 사람에게 정보를 흘릴 수 있고, 그러면 아래 세 채널의
		// 제약이 전부 무의미해진다. 게임 밖에서만 열리는 로비 광장이다.
		return ctx.started ? locked("게임 중에는 전체 채팅을 쓸 수 없습니다") : OPEN;
	}

	if (channel === ChatChannel.ROOM) {
		if (!ctx.seated) return NONE;
		// 판이 끝나면 산 사람과 죽은 사람의 구분이 사라진다. 감출 것이 없으니
		// 전원이 한자리에 모여 복기한다 — 이긴 쪽만 떠드는 종료 화면은 재미없다.
		if (ctx.phase === GamePhase.GAME_OVER) return OPEN;
		// 관전자도 결과적으로는 읽기 전용이라 아래 !alive 분기에 걸리지만,
		// 그 분기의 이유("죽은 사람은…")는 관전자에게 거짓말이다. 판정이
		// 같아도 화면에 나가는 문장이 다르면 분기를 나눠야 한다 —
		// 이 note는 사용자가 읽는 유일한 설명이다.
		if (ctx.spectating) return locked("관전 중에는 읽기만 할 수 있습니다");
		// 죽은 사람이 방 채팅으로 말하면 산 사람에게 정보가 샌다. 읽기는 남긴다 —
		// 관전의 재미가 낮 토론을 지켜보는 데 있기 때문이다.
		if (!ctx.alive) return locked("죽은 사람은 산 사람에게 말할 수 없습니다");
		/*
		 * 건달의 협박.
		 *
		 * 원래 규칙은 "다음 낮에 말을 못 한다"이고 투표 차단은 그 결과인데,
		 * 이 게임에서는 오래도록 투표만 막혔다. ZEP 기본 채팅을 가로챌 방법이
		 * 없어 입을 막을 자리가 아예 없었기 때문이다. 자체 채팅이 생기면서
		 * 그 제약이 사라졌고, 규칙이 표의 한 줄로 돌아왔다.
		 *
		 * 막는 것은 ROOM뿐이다. 협박의 값은 낮 토론에서 배제하는 데 있지
		 * 모든 대화를 끊는 데 있지 않다 — 마피아 밀담과 유령 채널까지 막으면
		 * 협박당한 마피아가 팀과 상의도 못 하는 별개의 페널티가 붙는다.
		 */
		if (ctx.silenced) return locked("🥊 협박당해 오늘은 말할 수 없습니다");
		// 밤에 전원이 자유롭게 말할 수 있으면 마피아가 밤에 무엇을 하든
		// 의미가 없어진다 — 밤이 정보 비대칭을 만드는 유일한 시간이다.
		if (ctx.phase === GamePhase.NIGHT) return locked("밤에는 방 채팅이 잠깁니다");
		return OPEN;
	}

	if (channel === ChatChannel.MAFIA) {
		if (!ctx.mafiaChat) return NONE;
		if (!ctx.alive) return locked("죽은 뒤에는 밀담에 낄 수 없습니다");
		if (ctx.phase !== GamePhase.NIGHT) return locked("마피아 밀담은 밤에만 열립니다");
		return OPEN;
	}

	// GHOST — 사망자는 언제나, 영매는 밤에만.
	if (!ctx.seated) return NONE;
	// 죽었거나(관전) 유령을 듣는 직업(영매)이거나 — 둘 다 아니면 채널 자체가 없다
	if (ctx.alive && !ctx.ghostChat) return NONE;
	// 판이 끝나면 대화는 방 채팅으로 모은다. 기록은 남긴다 —
	// 여기를 열어두면 preferredChannel이 죽은 사람을 유령 탭에 붙잡아 둔다.
	if (ctx.phase === GamePhase.GAME_OVER) return locked("판이 끝났습니다. 방 채팅으로 이야기하세요");
	if (!ctx.alive) return OPEN;
	// 영매의 낮. locked가 아니라 NONE인 것이 중요하다 — 읽기만 열어주면
	// 영매가 지난밤 유령들의 대화를 대낮에 그대로 읽는다. 이것은 표시의
	// 문제가 아니라 밸런스다.
	return ctx.phase === GamePhase.NIGHT ? OPEN : NONE;
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
