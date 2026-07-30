/**
 * 발언을 내보내기 전에 한 번 훑는 체.
 *
 * 순수 함수인 이유는 ChatPermission과 같다. "이 문장이 어떻게 나가는가"는
 * 게임 운영 규칙이지 전송 로직이 아니고, ZEP 없이 한 줄로 검증할 수 있어야
 * 목록을 고칠 때마다 판을 돌려보지 않는다.
 *
 * 거르지 않고 **가리는** 쪽을 골랐다. 문장을 통째로 버리면 보낸 사람은
 * 자기 말이 안 나갔다는 사실조차 모른 채 같은 말을 다시 친다. 가리면
 * 무엇이 걸렸는지 본인도 보는 사람도 알고, 대화의 맥락도 끊기지 않는다.
 *
 * ponytail: 부분 문자열 대조라 오탐이 난다 ("시발점"의 앞 두 글자가 걸린다).
 * 한국어에서 이걸 제대로 하려면 형태소 분석이 필요한데 Jint 위에 올릴 수
 * 있는 형태소 분석기가 없다. 지금은 목록을 짧게 유지하는 것이 방어책이고,
 * 오탐이 문제가 되면 BANNED를 앞뒤 경계 조건이 붙은 정규식 표로 올린다.
 */

/**
 * 가릴 말.
 *
 * 표 하나로 둔 이유는 COMMANDS와 같다 — 목록을 늘리는 일과 거르는 방식을
 * 바꾸는 일이 서로 다른 파일을 건드리게 만들면 둘 다 무서워진다.
 * 변형(ㅅㅂ, 시1발)까지 쫓지 않는다. 우회를 완전히 막는 것은 목표가 아니고,
 * 눈에 그대로 박히는 말을 눈에서 치우는 것이 목표다.
 */
export const BANNED: readonly string[] = [
	"시발",
	"씨발",
	"씨빨",
	"좆",
	"병신",
	"지랄",
	"새끼",
	"미친놈",
	"fuck",
	"shit",
	"bitch",
];

const MASK = "●";

function maskOf(length: number): string {
	let masked = "";
	for (let i = 0; i < length; i++) masked += MASK;
	return masked;
}

/**
 * 걸린 말을 ●로 덮은 문장.
 *
 * 대소문자는 무시한다(FUCK도 fuck도 같은 말이다). 한글에는 대소문자가
 * 없으므로 이 변환이 한글 부분을 건드리지 않는다.
 */
export function maskProfanity(text: string): string {
	let result = text;
	for (const word of BANNED) {
		const mask = maskOf(word.length);
		// 대소문자 무시 검색은 소문자 사본에서 하고, 자르기는 원본에서 한다.
		// 원본을 소문자로 바꿔 내보내면 남의 문장을 멋대로 고치는 셈이 된다.
		for (;;) {
			const at = result.toLowerCase().indexOf(word);
			if (at < 0) break;
			result = result.slice(0, at) + mask + result.slice(at + word.length);
		}
	}
	return result;
}
