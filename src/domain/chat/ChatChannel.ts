/**
 * 채팅 채널 = "이 발언이 누구에게 보이는가"를 나타내는 청중 범위.
 *
 * 기존에는 채널이라는 개념 자체가 없었다. 밤 마피아 채팅은 roleAction 위젯의
 * chatEnable 플래그였고, 유령 채팅은 두 번째 roleAction 인스턴스였고, 시스템
 * 안내는 ZEP 기본 채팅(player.sendMessage)이었다. 세 가지가 서로 다른 방식으로
 * "누가 볼 수 있는가"를 표현하니 규칙을 한 줄로 바꿀 방법이 없었고,
 * 로비·전체 채팅처럼 새 청중이 필요해지면 네 번째 방식이 또 생길 참이었다.
 *
 * 채널을 값으로 만들면 청중 규칙이 ChatPermission 한 곳의 표가 된다.
 *
 * 왜 SPECTATOR(관전자)가 따로 없는가:
 *   이 게임에서 관전자는 곧 사망자다. 좌석 없이 구경만 하는 자리는 없다.
 *   따로 만들면 영원히 비어 있는 채널이 하나 생긴다. 진짜 관전 좌석이
 *   생기는 날에는 여기 한 줄과 ChatPermission의 한 줄만 늘면 된다.
 */

export const ChatChannel = {
	/** 월드 전체. 방 안팎을 가리지 않고 보인다 */
	GLOBAL: "GLOBAL",
	/** 지금 속한 방. 대기실이면 로비 채팅, 게임 중이면 낮 토론 */
	ROOM: "ROOM",
	/** 마피아 팀 야간 밀담 */
	MAFIA: "MAFIA",
	/** 사망자(=관전자)와 영매 */
	GHOST: "GHOST",
} as const;

export type ChatChannel = (typeof ChatChannel)[keyof typeof ChatChannel];

/**
 * 직업이 밤에 배정받을 수 있는 비밀 채널.
 * RoleDef.nightChat이 GLOBAL이나 ROOM을 가리키는 일은 없어야 하므로 좁혀둔다.
 */
export type NightChannel = typeof ChatChannel.MAFIA | typeof ChatChannel.GHOST;

/**
 * ZEP 기본 채팅의 청중.
 *
 * ZEP 서버는 발언을 두 방식으로만 퍼뜨린다. 어느 쪽인지는 패킷의
 * chatAreaType 한 필드가 정하고, 실제 수신자는 **서버가 말한 사람의 위치에서
 * 계산한다** — 스크립트가 "누구에게"를 지정할 방법은 없다. 그래서 이 타입에는
 * 대상 id가 없고, 아래 zepAudienceFor가 위치 조건을 대신 지킨다.
 */
export type ZepAudience =
	/** 맵 전체 */
	| "PUBLIC_AREA"
	/**
	 * 말한 사람이 서 있는 프라이빗 영역.
	 *
	 * 영역 밖에는 들리지 않는다 — 단, ZEP은 "어느 영역에도 없음"을 0번
	 * 영역으로 취급한다. 영역 밖에서 이걸로 말하면 영역 밖에 있는 전원이
	 * 하나의 청중이 된다. 열려 있는 쪽으로 실패하는 값이다.
	 */
	| "PRIVATE_AREA";

export interface ChannelDef {
	/** 탭에 표시되는 이름 */
	readonly label: string;
	readonly glyph: string;
	/**
	 * 이 채널의 발언에 보낸 사람의 직업·진영을 붙여도 되는가.
	 *
	 * 마피아 채팅과 유령 채팅은 이미 서로의 정체를 아는 사람들만 모여 있으므로
	 * 직업을 표시해도 새어 나갈 정보가 없다. 반대로 ROOM에서 직업을 표시하면
	 * 게임이 그 자리에서 끝난다. 표시 여부를 채널의 성질로 못 박아두면
	 * "여기서는 붙이고 저기서는 빼는" 판단이 UI에 흩어지지 않는다.
	 */
	readonly revealsRole: boolean;
	/**
	 * 이 채널의 발언을 ZEP 기본 채팅의 어느 청중으로 내보내는가. 안 내보내면 null.
	 *
	 * 내보내면 말한 사람의 아바타 위에 말풍선이 뜬다 — 채팅창을 접어둔 사람도
	 * 누가 말하는지 보인다. 대신 그 순간 발언은 이 게임의 채널 규칙 바깥으로
	 * 나간다: 말풍선을 볼 수 있는 사람은 ChatPermission이 아니라 ZEP이 정한다.
	 *
	 * 그래서 revealsRole과 같은 자리에 둔다. 둘 다 "이 채널의 말이 어디까지
	 * 새어도 되는가"를 채널의 성질로 못 박는 값이고, 판단이 UI나 호출부로
	 * 흩어지면 새 채널이 생길 때마다 다시 틀린다.
	 *
	 * 고를 수 있는 조건은 하나다: **ZEP의 청중이 이 채널의 청중보다 넓지 않을 것.**
	 * 넓은 만큼이 그대로 유출이다. 불리언이 아니라 청중 값인 이유가 여기 있다 —
	 * ZEP에는 청중이 둘 있고, 어느 쪽과 같은지는 채널마다 다르다.
	 * 불리언 두 개로 나누면 둘 다 켠 무의미한 상태를 타입이 막지 못한다.
	 *
	 * PRIVATE_AREA에는 위치 조건이 딸린다. 표에 적을 수 없는 조건이므로
	 * 아래 zepAudienceFor 한 곳에서만 지킨다.
	 */
	readonly speaksInto: ZepAudience | null;
	/** 입력창 안내 문구 */
	readonly placeholder: string;
}

export const CHANNEL_DEFS: Record<ChatChannel, ChannelDef> = {
	GLOBAL: {
		label: "전체",
		glyph: "🌐",
		revealsRole: false,
		speaksInto: "PUBLIC_AREA",
		placeholder: "전체에게 보내기",
	},
	ROOM: {
		label: "방",
		glyph: "💬",
		revealsRole: false,
		/*
		 * 방은 여럿인데 ZEP의 PUBLIC_AREA는 맵 하나다. 그걸로 내보내면 이 방의
		 * 낮 토론이 옆 방 사람들에게도 뜬다 — 판마다 따로 돌아가야 할 추리가
		 * 섞이고, 방 채널이라는 경계가 말풍선 하나로 무의미해진다.
		 *
		 * PRIVATE_AREA는 그 경계를 ZEP 쪽에도 그린다. 방마다 프라이빗 영역이
		 * 하나씩 있으면(방 번호 = 영역 id, RoomLayout 참고) ZEP의 청중이 곧
		 * 그 방 사람들이 되어 이 채널의 청중과 정확히 겹친다.
		 */
		speaksInto: "PRIVATE_AREA",
		placeholder: "같은 방 사람들에게",
	},
	MAFIA: {
		label: "마피아",
		glyph: "🔪",
		revealsRole: true,
		/*
		 * 밤의 마피아는 자기 방 안에 서 있으므로 PRIVATE_AREA를 골라도 청중은
		 * 그 방까지만 좁혀진다 — 그런데 그 방에는 마피아가 아닌 사람들이 앉아
		 * 있다. 채널의 청중(마피아 팀)보다 넓으므로 그 차이가 그대로 유출이다.
		 * ZEP에 "이 사람들에게만"이라는 청중은 없다.
		 */
		speaksInto: null,
		placeholder: "마피아 팀에게만",
	},
	GHOST: {
		label: "유령",
		glyph: "👻",
		revealsRole: true,
		// 죽은 사람의 말풍선은 같은 방의 산 사람에게 보인다. 그 순간 판이 끝난다.
		speaksInto: null,
		placeholder: "죽은 사람들에게",
	},
};

/**
 * 탭 표시 순서이자 자동 전환 우선순위.
 *
 * 위에 있을수록 먼저 고른다. 밤이 되면 ROOM은 발언이 막히고 MAFIA만 열리므로
 * 마피아의 탭은 저절로 마피아 채팅으로 넘어가고, 죽으면 GHOST로 넘어간다.
 * "게임 상태에 따라 채팅이 자동으로 바뀐다"가 별도 분기 없이 여기서 나온다.
 */
export const CHANNEL_ORDER: readonly ChatChannel[] = [
	ChatChannel.MAFIA,
	ChatChannel.GHOST,
	ChatChannel.ROOM,
	ChatChannel.GLOBAL,
];

export function channelDef(channel: ChatChannel): ChannelDef {
	return CHANNEL_DEFS[channel];
}

/**
 * 이 발언을 ZEP 기본 채팅으로 내보낼 청중. 내보내지 않으면 null.
 *
 * inOwnRoomArea = "말한 사람이 지금 자기 방의 프라이빗 영역 안에 서 있는가".
 * 이 값이 거짓인데 PRIVATE_AREA로 내보내면 방 채팅이 **프라이빗 영역 밖에 있는
 * 전원**에게 들린다 — ZEP이 "영역 없음"을 0번 영역으로 묶기 때문이다.
 * 방 밖으로 걸어 나간 사람, 대기실에 선 사람, 옆 방으로 들어간 사람이
 * 전부 그 경로를 지난다. 그래서 확인되지 않으면 침묵이 기본이다.
 *
 * 표(speaksInto)와 나눠 둔 이유: 표는 채널의 성질이라 정적이고, 이 조건은
 * 말하는 순간의 위치라 동적이다. 둘을 한 값에 섞으면 표를 읽는 사람이
 * "여기 적힌 대로 나간다"고 믿게 되는데, 실제로는 그렇지 않다.
 *
 * 조건을 호출부(ChatService)에 두지 않은 이유는 speaksInto 주석 그대로다 —
 * 판단이 호출부로 흩어지면 다음에 내보내는 곳이 생길 때 다시 틀린다.
 */
export function zepAudienceFor(
	channel: ChatChannel,
	inOwnRoomArea: boolean
): ZepAudience | null {
	const into = channelDef(channel).speaksInto;
	if (into === "PRIVATE_AREA" && !inOwnRoomArea) return null;
	return into;
}

/** 문자열이 아는 채널인지 확인한다. 위젯이 보내온 값은 믿을 수 없다 */
export function toChannel(value: unknown): ChatChannel | null {
	if (typeof value !== "string") return null;
	for (const channel of CHANNEL_ORDER) {
		if (channel === value) return channel;
	}
	return null;
}
