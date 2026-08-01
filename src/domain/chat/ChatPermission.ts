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
 *   chat.html이 "지금은 읽기만 됩니다" 한 문장을 지어내 밤·사망·관전을
 *   모두 같은 말로 덮고 있었다. 이유를 별도 함수로 빼면 같은 조건표가
 *   두 벌이 되는데 — 이 파일이 생긴 원인이 바로 그 중복이다.
 *   그래서 판정과 이유를 한 번에 돌려준다.
 */
import { GamePhase } from "../../types/Game.types.ts";
import type { ChatMode } from "../RuleSet.ts";
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
	/**
	 * 지금 단상에 올라 있는 본인인가.
	 *
	 * 최후의 반론은 단상에 오른 사람 혼자 말하는 시간이다. 좌석 번호를
	 * 넘기고 여기서 room.nominee와 비교할 수도 있었지만, 그러면 이 표가
	 * 방 상태를 알아야 한다 — 지금은 "나는 어떤 사람인가"만 받는다.
	 */
	readonly nominee: boolean;
	/**
	 * 마담에게 유혹당했는가. 이번 낮에는 방 채팅으로 한마디도 못 한다.
	 *
	 * 좌석의 blocked(밤 능력 차단)와 다른 값이다. 능력을 막는 것과 입을
	 * 막는 것은 다른 일이고, 무엇보다 수명이 다르다 — blocked는 밤 정산이
	 * 끝나면 지워지지만 이 값은 다음 낮을 지나 그 다음 밤 시작에 풀린다.
	 */
	readonly seduced: boolean;
	/** 마피아 밀담 참가자인가 (마피아 본인 + 합류한 스파이) */
	readonly mafiaChat: boolean;
	/**
	 * 연인 밀담 참가자인가 (짝이 맺어진 좌석).
	 *
	 * 짝의 신원이 아니라 소속 여부만 받는다. 청중을 고르는 곳이
	 * "사람마다 이 채널을 읽을 수 있는가"를 묻는 구조라(ChatService의
	 * deliverTo) 여기에 짝 번호를 넣어도 쓸 곳이 없다. 클래식은 한 방에
	 * 연인이 정확히 한 쌍이므로 소속 여부가 곧 청중이다.
	 * 한 방에 쌍이 둘 이상인 모드가 생기면 그때 이 값이 짝 식별자가 되고,
	 * deliverTo가 보낸 사람의 짝과 비교해야 한다 — 그 전에는 없는 문제다.
	 */
	readonly loverChat: boolean;
	/** 유령의 목소리를 듣는 직업인가 (영매) */
	readonly ghostChat: boolean;
	/** 이 방의 채팅 방식. 침묵전이면 낮에 준비된 문구만 쓸 수 있다 */
	readonly chatMode: ChatMode;
}

export interface ChannelAccess {
	readonly read: boolean;
	readonly write: boolean;
	/**
	 * 쓰기가 제한된 이유. 제한이 없으면 "".
	 *
	 * 원래는 "쓸 수 없는 이유"였고 write=true면 항상 빈 문자열이었다.
	 * 침묵전(phrasesOnly)이 그 불변식을 깼다 — write=true인데 note가 차 있는
	 * 첫 경우다. 이때의 제한은 쓰기 자체가 아니라 입력 수단에 걸려 있다.
	 * 그래서 "말할 수 있는가"를 보려면 note가 비었는지가 아니라 write와
	 * freeText를 함께 읽어야 한다(ChatService.channelViews가 그렇게 한다).
	 *
	 * 화면에 그대로 나가는 문장이다. 코드가 분기할 값이 아니므로 enum이
	 * 아니라 문자열이다 — 이유가 하나 늘 때 타입·번역표·분기 세 곳을
	 * 고치게 만들 만큼 이 값이 무겁지 않다.
	 */
	readonly note: string;
	/**
	 * 자유롭게 타이핑할 수 있는가.
	 *
	 * write와 나눈 이유는 침묵전이다. "준비된 문구만"은 쓸 수 없는 상태가
	 * 아니라 쓸 수 있는 방식이 좁아진 상태다 — write를 false로 하면 빠른
	 * 문구 버튼까지 죽는다. 버튼도 자유 입력과 똑같은 전송 경로를 탄다.
	 *
	 * write=false면 이 값은 언제나 false다. 쓸 수 없는데 자유롭게 쓸 수는 없다.
	 */
	readonly freeText: boolean;
}

const NONE: ChannelAccess = { read: false, write: false, note: "", freeText: false };
const OPEN: ChannelAccess = { read: true, write: true, note: "", freeText: true };

/** 읽을 수는 있지만 쓸 수 없는 상태. 이유를 반드시 적게 한다 */
function locked(note: string): ChannelAccess {
	return { read: true, write: false, note, freeText: false };
}

/** 쓸 수는 있지만 준비된 문구만. 이유는 입력창 자리에 그대로 나간다 */
function phrasesOnly(note: string): ChannelAccess {
	return { read: true, write: true, note, freeText: false };
}

/**
 * 침묵전이 좁히는 단계. 방 채팅에만 적용된다.
 *
 * 빼는 쪽이 아니라 넣는 쪽으로 적는다. 제외 목록으로 두면 단계가 하나 늘 때
 * 아무도 이 파일을 열지 않아도 그 단계가 자동으로 좁혀진다 — 좁히는 것은
 * 밸런스 결정이므로 결정한 자리에만 있어야 한다.
 */
const PHRASES_ONLY_PHASES: readonly GamePhase[] = [
	GamePhase.DAY,
	GamePhase.VOTE,
	GamePhase.VOTE_RESULT,
	// 반론과 찬반도 토론의 일부다. 빼면 침묵전에서 단상에 오른 사람만
	// 갑자기 자유롭게 타이핑하게 되는데, 그 자리가 하필 가장 말이 무거운 자리다
	GamePhase.DEFENSE,
	GamePhase.JUDGEMENT,
];

/** 방 밖(월드 로비)에 서 있는 사람의 기본 상태 */
export const LOOSE_CONTEXT: ChatContext = {
	seated: false,
	started: false,
	phase: GamePhase.LOBBY,
	alive: true,
	spectating: false,
	nominee: false,
	seduced: false,
	mafiaChat: false,
	loverChat: false,
	ghostChat: false,
	chatMode: "free",
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
	if (
		ctx.spectating &&
		(channel === ChatChannel.MAFIA ||
			channel === ChatChannel.LOVER ||
			channel === ChatChannel.GHOST)
	) {
		return NONE;
	}

	if (channel === ChatChannel.GLOBAL) {
		// 게임 밖에서만 열리는 로비 광장이다. 판 안에서는 말하기뿐 아니라
		// 탭 자체를 숨긴다 — 방·밀담·유령 채널만으로 게임에 필요한 대화가 끝난다.
		return ctx.started ? NONE : OPEN;
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
		if (ctx.phase === GamePhase.ROLE_REVEAL) {
			return locked("직업 확인 중에는 채팅이 잠깁니다");
		}
		// 죽은 사람이 방 채팅으로 말하면 산 사람에게 정보가 샌다. 읽기는 남긴다 —
		// 관전의 재미가 낮 토론을 지켜보는 데 있기 때문이다.
		if (!ctx.alive) return locked("죽은 사람은 산 사람에게 말할 수 없습니다");
		// 밤에 전원이 자유롭게 말할 수 있으면 마피아가 밤에 무엇을 하든
		// 의미가 없어진다 — 밤이 정보 비대칭을 만드는 유일한 시간이다.
		if (ctx.phase === GamePhase.NIGHT) return locked("밤에는 방 채팅이 잠깁니다");
		/*
		 * 마담의 유혹. 이 낮 동안 방 채팅으로 한마디도 못 한다.
		 *
		 * 방 채널만 막으면 된다. 마피아 밀담과 연인 대화는 밤에만 열리는데
		 * 유혹은 밤 정산 뒤에 걸려 다음 밤 시작에 풀리므로, 두 채널이 열려
		 * 있는 시간과 이 상태가 살아 있는 시간이 겹치지 않는다. 유령 채널은
		 * 죽은 사람의 자리라 유혹이 닿기 전에 이미 다른 규칙이 정한다.
		 *
		 * 아래 DEFENSE 분기보다 위에 둔다. 유혹당한 사람이 단상에 오르면
		 * 최후의 반론조차 못 한다 — 그것이 이 능력의 값이다. 순서를 뒤집으면
		 * 단상에 오른 사람만 유혹을 뚫고 말하게 되는데, 하필 가장 말이 무거운
		 * 자리에서 능력이 무력해진다.
		 *
		 * 읽기는 남긴다(locked). 말을 막는 능력이지 눈을 가리는 능력이 아니다.
		 */
		if (ctx.seduced) return locked("마담에게 유혹당해 오늘은 말할 수 없습니다");
		/*
		 * 최후의 반론. 단상에 오른 사람 말고는 아무도 말하지 않는다.
		 *
		 * 이 단계의 값이 여기서 나온다 — 처형 직전 15초를 혼자 쓰게 해 주는
		 * 것이 마피아42 규칙의 요점이고, 그 사이 다른 사람이 끼어들면 반론이
		 * 아니라 그냥 짧은 낮이 된다. 읽기는 열어 둔다(locked).
		 *
		 * 이어지는 찬반투표(JUDGEMENT)는 잠그지 않는다. 5초짜리라 어차피
		 * 대화가 되지 않고, "O 눌러" 한마디까지 막을 이유는 없다.
		 */
		if (ctx.phase === GamePhase.DEFENSE && !ctx.nominee) {
			return locked("최후의 반론 중입니다. 단상에 오른 사람만 말할 수 있습니다");
		}
		/*
		 * 침묵전. 좁히는 단계는 낮·투표·개표·반론·찬반 다섯이다.
		 *
		 * 여기까지 내려왔다는 것은 단계가 LOBBY이거나 그 다섯 중 하나다.
		 * GAME_OVER·ROLE_REVEAL·NIGHT은 위에서 이미 돌아갔다. 그래서
		 * 조건을 chatMode 하나로 두면 대기실까지 함께 좁혀지는데,
		 * 대기실을 뺀 이유는 분명하다.
		 *   - 대기실: 좁혀도 지키는 것이 없다. started가 false인 동안 전체 채널이
		 *     OPEN이라(위 GLOBAL 분기) 기다리는 사람들은 거기서 그대로 떠든다.
		 *     방 탭만 잠그는 것은 규칙이 아니라 불편이다.
		 * 남은 다섯은 이 모드의 제약이 값을 갖는 자리(토론과 투표)이고, 다섯 다
		 * 그 상황에 맞는 문구셋이 준비되어 있다.
		 *
		 * 자리도 그대로 둔다 — 위 GAME_OVER·NIGHT 분기를 지난 뒤라야 종료 후
		 * 복기와 밤 잠금이 표준전과 같게 남는다.
		 */
		if (ctx.chatMode === "phrasesOnly" && PHRASES_ONLY_PHASES.indexOf(ctx.phase) >= 0) {
			return phrasesOnly("🤐 침묵전에서는 준비된 문구만 쓸 수 있습니다");
		}
		return OPEN;
	}

	if (channel === ChatChannel.MAFIA) {
		/*
		 * 죽은 사람은 밀담을 엿듣는다. 클래식의 기본 규칙이고, 영매의 값이
		 * 여기서 나온다 — 무덤 쪽에서 밀담을 읽은 사람들이 유령 채널에
		 * 그것을 옮기면, 살아 있는 영매가 밤에 그 채널을 읽는다.
		 * 상호작용 22번이 이 경로를 끝에서 끝까지 고정한다.
		 *
		 * mafiaChat 검사보다 **위**에 두어야 한다. 죽은 시민은 밀담 참가자가
		 * 아니라 아래 줄에서 NONE으로 걸리기 때문이다 — 순서를 뒤집으면 이
		 * 규칙이 죽은 마피아에게만 남고, 그들이 읽는 것은 살아서 이미 알던
		 * 이야기라 아무것도 달라지지 않는다.
		 *
		 * seated를 함께 묻는다. 관전자는 맨 위에서 이미 돌아갔지만 방 밖에
		 * 서 있는 사람은 그렇지 않고, 그들의 alive는 LOOSE_CONTEXT의 참이라
		 * 이 줄에 걸리지 않는다 — 그래도 "판에 앉았다가 죽은 사람"이 조건임을
		 * 조건문 자체가 말하게 둔다.
		 *
		 * 단계를 묻지 않는 것은 위 잠금과 다른 점이다. 밀담은 밤에만 오가므로
		 * 낮에 열어 두어도 보이는 것은 어젯밤 기록뿐이고, 그것은 죽은 사람이
		 * 이미 읽은 줄이다.
		 */
		if (ctx.seated && !ctx.alive) return locked("죽은 뒤에는 밀담을 듣기만 합니다");
		if (!ctx.mafiaChat) return NONE;
		if (ctx.phase !== GamePhase.NIGHT) return locked("마피아 밀담은 밤에만 열립니다");
		return OPEN;
	}

	/*
	 * LOVER — 마피아 밀담과 같은 모양이다. 밤에만, 산 사람만.
	 *
	 * 이 분기가 없으면 LOVER가 아래 GHOST 규칙으로 흘러내린다. 그러면 죽은
	 * 사람 전원이 연인 채널을 쓸 수 있게 되고, CHANNEL_ORDER에서 LOVER가
	 * GHOST보다 앞이라 죽는 순간 탭이 유령이 아니라 연인으로 옮겨간다.
	 * 채널을 값으로 만든 대가가 여기 있다 — 표에 한 줄을 더하면 판정에도
	 * 한 가지가 늘고, 빠뜨리면 새 채널이 조용히 옆 채널의 규칙을 물려받는다.
	 */
	if (channel === ChatChannel.LOVER) {
		/*
		 * 밀담과 같은 이유로 죽은 사람에게 읽기를 연다. 여기서 새는 것은
		 * 마피아의 정체가 아니라 짝이 누구인가인데, 그 역시 영매가 무덤에서
		 * 건져 오라고 만든 정보다.
		 *
		 * 쓰기를 계속 막는 이유는 따로 있다. 한쪽이 죽으면 그날 밤 다른 쪽도
		 * 상심으로 따라 죽지만(NightPipeline의 chainLovers) 연쇄가 도는 것은
		 * 밤의 끝이라, 그 사이에 죽은 쪽이 남은 짝에게 범인을 불러 줄 창이
		 * 열린다. 듣는 것과 말하는 것은 다르다.
		 */
		if (ctx.seated && !ctx.alive) return locked("죽은 뒤에는 연인의 이야기를 듣기만 합니다");
		if (!ctx.loverChat) return NONE;
		if (ctx.phase !== GamePhase.NIGHT) return locked("연인의 대화는 밤에만 열립니다");
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
