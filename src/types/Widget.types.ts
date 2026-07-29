/**
 * 위젯(HTML) → 서버 메시지의 파싱·검증.
 *
 * 기존 코드는 위젯이 보낸 값을 그대로 믿었다.
 *   room.players[data.num], p.tag.data.votecount += 2, GAMEROOM[parseInt(data.roomNum)]
 * 위젯은 클라이언트에서 돌아가므로 조작할 수 있다. 예를 들어
 * { type: "vote", vote: 99 }나 { type: "join", roomNum: "abc" }를 보내면
 * NaN 인덱스나 undefined 접근이 그대로 서버 로직에 흘러들었다.
 *
 * 여기서 한 번 좁히고 나면 서비스 코드는 검증된 값만 다룬다.
 */

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
