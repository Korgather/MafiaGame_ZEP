/**
 * 서버와 위젯이 주고받는 계약. 양방향 모두 여기 있다.
 *
 * 올라오는 쪽 (위젯 → 서버): 파싱·검증 함수들.
 *   기존 코드는 위젯이 보낸 값을 그대로 믿었다.
 *     room.players[data.num], p.tag.data.votecount += 2, GAMEROOM[parseInt(data.roomNum)]
 *   위젯은 클라이언트에서 돌아가므로 조작할 수 있다. 예를 들어
 *   { type: "vote", vote: 99 }나 { type: "join", roomNum: "abc" }를 보내면
 *   NaN 인덱스나 undefined 접근이 그대로 서버 로직에 흘러들었다.
 *   여기서 한 번 좁히고 나면 서비스 코드는 검증된 값만 다룬다.
 *
 * 내려가는 쪽 (서버 → 위젯): 화면이 읽는 모양들(*View, WidgetLayout).
 *   이쪽은 Game.types.ts에 게임 상태(Room·Seat·VoteRecord)와 나란히 있었다.
 *   같은 파일이라 "저장하는 값"과 "그려 보낼 값"의 경계가 없었고, 실제로
 *   PlayerTag 위에 붙어 있던 주석이 나중에 끼어든 WidgetLayout에게 밀려나
 *   엉뚱한 타입을 설명하고 있었다. 화면이 바뀔 때마다 게임 규칙의 타입
 *   파일이 함께 더러워지는 것도 같은 원인이다 — 이 프로젝트에서 가장 자주
 *   바뀐 것이 바로 화면이다.
 *
 * 한 파일에 합친 이유는 둘이 같은 하나의 계약이기 때문이다. 위젯 하나를
 * 붙이는 일은 "보낼 모양을 정하고, 받을 값을 좁히는" 두 짝을 항상 함께
 * 요구한다. 짝을 두 파일로 갈라 두면 한쪽만 고치고 끝낼 수 있게 된다.
 *
 * 여기 없는 것: payload 타입(LobbyPayload 등)은 Widgets.ts에 있다. 그것은
 * "무엇을 보낼 수 있는가"가 아니라 "어떤 함수로 보내는가"라서 그 함수 옆이
 * 제자리다.
 */
import type { Team } from "./Game.types.ts";

/** 정수로 해석되면 그 값, 아니면 null */
export function asInt(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isInteger(value) ? value : null;
	}
	if (typeof value === "string" && value.length > 0) {
		const parsed = parseInt(value, 10);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

/** 비어 있지 않은 문자열이면 그 값(길이 제한 적용), 아니면 null */
export function asText(value: unknown, maxLength: number): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/** 위젯이 보낸 payload에서 type 필드 읽기 */
export function messageType(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	const type = (data as { type?: unknown }).type;
	return typeof type === "string" ? type : null;
}

/** 위젯 payload에서 임의 필드 읽기 */
export function field(data: unknown, key: string): unknown {
	if (!data || typeof data !== "object") return undefined;
	return (data as Record<string, unknown>)[key];
}

/**
 * 채팅 한 줄의 최대 길이.
 *
 * 위젯의 maxlength는 사용자 편의일 뿐 방어가 아니다 — 위젯을 조작하면
 * 얼마든지 긴 문자열을 보낼 수 있고, 그 줄은 방 기록(chatLog)에 남아
 * 모두의 화면을 밀어낸다. 서버에서 자르는 이 상수가 실제 한계다.
 */
export const MAX_CHAT_LENGTH = 200;

// ────────────────────────────────────────────────────── 서버 → 위젯 (그려 보낼 모양)

/**
 * ZEP 클라이언트에게 "이 위젯을 이 상자에 담아라"라고 말하는 값.
 *
 * 서버가 정해서 payload에 실어 보내면 bridge.js가 WidgetRearrange로 넘긴다.
 * 길이는 CSS 문자열이라 "96%"와 "320px"이 한 자리에 들어간다 — 데스크톱은
 * 픽셀, 모바일은 화면 대비 %를 쓰기 때문에 이 유연함이 필요하다.
 */
export interface WidgetLayout {
	anchor: string;
	width: string;
	height: string;
	/** 상단바 보정. 위쪽에 붙는 위젯에만 있다 */
	top?: string;
	/**
	 * 쌓임 순서. 화면을 통째로 덮는 위젯에만 있다.
	 *
	 * 보통은 없다 — 위젯끼리 겹치지 않게 자리를 나눠 쓰기 때문이다. 컷 연출만
	 * 예외로 채팅·메인 위젯 위를 지나가야 해서 이 값을 싣는다.
	 */
	zIndex?: number;
}

/**
 * 대기실 목록에 그려지는 한 줄. lobby.html이 읽는 필드와 1:1이다.
 * 위젯에 room 객체를 통째로 넘기던 것을 이 DTO로 좁혔다.
 */
export interface LobbySeatView {
	id: string;
	name: string;
	/** 이미 완성된 표시 문자열. 위젯은 그대로 찍기만 한다 */
	rank: string;
	runCount: number;
	ready: boolean;
	kickCount: number;
}

/**
 * 게임 중 "사람 하나"를 그리는 데 필요한 것. 밤 지목과 투표가 같이 쓴다.
 *
 * 기존에는 두 화면이 number[] (참가 번호만)를 받아 번호 버튼을 그렸다.
 * 여러 명이 도는 판에서 화면에는 번호만 있고 이름이 없어서, 방금 누가 무슨
 * 말을 했는지와 몇 번인지를 사람이 머릿속에서 이어야 했다. 밤에 사람을
 * 잘못 지목하는 가장 흔한 원인이었다.
 */
export interface SeatView {
	num: number;
	name: string;
	alive: boolean;
	/** 같은 마피아 팀인가 (마피아 위젯에서만 채워진다) */
	ally?: boolean;
	/** 개표 화면의 득표수 */
	votes?: number;
}

/**
 * 채팅창의 탭 하나.
 *
 * 위젯은 채널의 규칙을 모른다. "지금 이 탭이 있고, 쓸 수 있고, 안 읽은
 * 것이 N개"라는 결과만 받는다. 밤에 마피아 탭이 생기는 이유도, 죽으면
 * 방 탭에 자물쇠가 걸리는 이유도 서버 쪽 표(ChatPermission)에만 있다.
 */
export interface ChatChannelView {
	id: string;
	label: string;
	glyph: string;
	/** 이 탭에 글을 쓸 수 있는가. false면 입력창이 잠긴다 */
	write: boolean;
	/** 미확인 메시지 수 */
	unread: number;
	placeholder: string;
}

/**
 * 카드 한 장. 직업 공개·첫 안내·직업 도감이 전부 이 모양으로 그려진다.
 *
 * 셋을 각자 다른 위젯으로 만들지 않은 이유는 셋의 화면이 같기 때문이다 —
 * 글리프 하나, 제목 한 줄, 설명 한 문단, 덧붙임 한 문단. 다른 것은
 * "몇 장인가"와 "장을 어떻게 넘기는가"뿐이고, 그건 CardPayload.nav가 정한다.
 */
export interface CardView {
	glyph: string;
	title: string;
	/** null이면 진영 칩을 숨긴다 (규칙 안내 카드에는 진영이 없다) */
	team: Team | null;
	body: string;
	note: string;
}

/** 종료 화면의 직업 공개 한 줄 */
export interface RevealView {
	num: number;
	name: string;
	role: string;
	team: Team;
	alive: boolean;
}

/**
 * 프로필 창의 전적 한 줄.
 *
 * 이름 붙은 필드(mafiaWin, citizenLose, …)로 보내지 않는 이유는 그러면
 * 위젯이 전적 체계를 알게 되기 때문이다. "연승"이나 "최고 레벨"을 더하고
 * 싶어질 때마다 서버와 위젯 양쪽을 고쳐야 하고, 양쪽의 이해가 어긋나면
 * 값이 빈 칸으로 나온다. 라벨과 값만 보내면 위젯은 표를 그리는 기계이고
 * 무엇이 전적인지는 Profile.ts 한 곳만 안다.
 */
export interface ProfileStat {
	label: string;
	value: string;
}
