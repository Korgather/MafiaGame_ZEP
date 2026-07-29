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
	/** 입력창 안내 문구 */
	readonly placeholder: string;
}

export const CHANNEL_DEFS: Record<ChatChannel, ChannelDef> = {
	GLOBAL: {
		label: "전체",
		glyph: "🌐",
		revealsRole: false,
		placeholder: "전체에게 보내기",
	},
	ROOM: {
		label: "방",
		glyph: "💬",
		revealsRole: false,
		placeholder: "같은 방 사람들에게",
	},
	MAFIA: {
		label: "마피아",
		glyph: "🔪",
		revealsRole: true,
		placeholder: "마피아 팀에게만",
	},
	GHOST: {
		label: "유령",
		glyph: "👻",
		revealsRole: true,
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

/** 문자열이 아는 채널인지 확인한다. 위젯이 보내온 값은 믿을 수 없다 */
export function toChannel(value: unknown): ChatChannel | null {
	if (typeof value !== "string") return null;
	for (const channel of CHANNEL_ORDER) {
		if (channel === value) return channel;
	}
	return null;
}
