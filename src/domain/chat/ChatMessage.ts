/**
 * 채팅 한 줄의 값 객체.
 *
 * 기존에는 밤 채팅이 { num, name, message } 세 필드짜리 임시 구조체였고
 * 시스템 안내는 아예 구조 없이 문자열 하나였다. 그래서 (1) 채팅 기록을 남길
 * 수 없었고 — 위젯이 닫히면 사라졌다 — (2) 재접속하면 그 판에 무슨 일이
 * 있었는지 알 방법이 없었으며 (3) 귓속말·신고처럼 "누가 보냈는가"가
 * 필요한 기능을 붙일 자리가 없었다.
 *
 * 확장 지점이 필드로 이미 열려 있다:
 *   senderId - 신고·차단이 지목할 대상. 이름은 바뀌지만 id는 안 바뀐다
 *   to       - 귓속말. ""이면 채널 전체, 아니면 그 한 사람에게만
 *   kind     - 게임 이벤트 로그만 따로 뽑아보는 필터
 */
import type { ChatChannel } from "./ChatChannel.ts";

export const MessageKind = {
	/** 사람이 친 말 */
	USER: "USER",
	/** 진행 안내 (단계 전환, 규칙 설명) */
	SYSTEM: "SYSTEM",
	/** 게임에서 실제로 벌어진 사건 (사망·처형·특종·직업 공개) */
	EVENT: "EVENT",
	/** 입장·퇴장 */
	NOTICE: "NOTICE",
} as const;

export type MessageKind = (typeof MessageKind)[keyof typeof MessageKind];

export interface ChatMessage {
	/** 전역 단조 증가. 정렬과 미확인 계산의 기준이다 */
	readonly seq: number;
	readonly channel: ChatChannel;
	readonly kind: MessageKind;
	/** 보낸 사람의 playerId. 서버가 만든 메시지는 "" */
	readonly senderId: string;
	/** 참가 번호. 좌석이 없으면 0 */
	readonly num: number;
	readonly name: string;
	/** 직업 이름. 채널이 revealsRole일 때만 채워진다 */
	readonly role: string;
	readonly team: string;
	readonly text: string;
	/** 보낸 시각(epoch ms). 표시 형식은 위젯이 정한다 */
	readonly at: number;
	/** 받는 사람의 playerId. ""면 채널 전체 */
	readonly to: string;
}

/** 필수 필드만 받고 나머지는 기본값으로 채운다 */
export interface MessageDraft {
	channel: ChatChannel;
	kind: MessageKind;
	text: string;
	senderId?: string;
	num?: number;
	name?: string;
	role?: string;
	team?: string;
	to?: string;
}

export function buildMessage(seq: number, at: number, draft: MessageDraft): ChatMessage {
	return {
		seq,
		at,
		channel: draft.channel,
		kind: draft.kind,
		text: draft.text,
		senderId: draft.senderId || "",
		num: draft.num || 0,
		name: draft.name || "",
		role: draft.role || "",
		team: draft.team || "",
		to: draft.to || "",
	};
}

/**
 * 이 사람이 이 메시지를 받을 대상인가.
 *
 * 채널 권한과는 다른 축이다. 채널 권한이 "이 방송을 들을 수 있는가"라면
 * 이쪽은 "이 편지가 내 앞으로 왔는가"다. 둘 다 통과해야 보인다.
 */
export function addressedTo(message: ChatMessage, playerId: string): boolean {
	return message.to === "" || message.to === playerId;
}

/** 사람이 친 말인가. 신고·차단·필터링이 걸리는 대상은 이것뿐이다 */
export function isUserMessage(message: ChatMessage): boolean {
	return message.kind === MessageKind.USER;
}
