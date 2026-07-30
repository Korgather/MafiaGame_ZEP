/**
 * 예외 격리와 운영 관측. 한 방의 사고가 다른 방으로 번지지 않게 한다.
 *
 * 왜 필요한가: ScriptApp.onUpdate 콜백 하나가 방 8개를 차례로 돌린다.
 * 3번 방을 돌리다 예외가 나면 그 프레임의 4~8번 방은 아예 실행되지 않는다.
 * 게다가 원인이 방 상태에 남아 있으면(잘못된 좌석 참조, 깨진 단계 값)
 * 매 프레임 같은 자리에서 다시 던져서 뒤쪽 방들은 영구히 멈춘다.
 * 서로 아무 관계도 없는 방 다섯 개가 함께 죽는 것이 이 구조의 기본 동작이었다.
 *
 * 왜 관측을 같이 넣는가: 격리만 하면 조용히 죽은 방이 생긴다. 게임이
 * 진행되지 않는데 아무 표시도 없으면 운영자는 신고를 받고서야 알게 되고,
 * 그때도 8개 방 중 어디였는지는 모른다. 반대로 관측만 하면 여전히 다 같이
 * 멈춘다. 둘은 한 작업이다.
 *
 * console을 쓰지 않는 이유: ZEP(Jint) 런타임에 console이 없다. eslint의
 * no-restricted-globals가 이미 막고 있고, 그래서 이 프로젝트에는 로그가
 * 한 줄도 없었다. ScriptApp.sayToStaffs가 ZEP이 주는 관측 채널이고
 * 마침 이 소식을 받아야 하는 사람이 정확히 스태프다 — 플레이어에게는
 * 보이지 않으므로 사고를 알리면서 판을 망치지 않는다.
 *
 * 무엇을 잡지 못하는가: try/catch가 잡는 것은 JS 층에서 던진 예외다.
 * ZEP API(C# 메서드)에 인자를 잘못 넘겨 Jint 인터롭 단계에서 죽는 부류는
 * 호스트 설정에 따라 JS catch를 그냥 지나갈 수 있다 — 이 프로젝트를 실제로
 * 멈췄던 loadSpritesheet 사고가 그 부류다. 그쪽 방어선은 이 파일이 아니라
 * 정적 검사(npm run check:zep)이고, 둘은 겹치지 않는 범위를 나눠 맡는다.
 *
 * 그리고 잡는 순간 ZEP 서버 로그에서는 그 예외가 사라진다. 그래서 삼키기만
 * 하는 경로를 두지 않았다 — guard는 반드시 알린다.
 */
import { FAULT_REPORT_RATE } from "../constants/GameConfig.ts";
import { newBucket, spend } from "../domain/RateLimit.ts";

/** 스태프 채팅에 쓰는 붉은색 */
const STAFF_COLOR = 0xff4444;

/**
 * 예외가 난 누적 횟수.
 *
 * 알림에 붙여 "처음인가 계속인가"를 구분한다. 알림이 도배 제한에 눌려
 * 빠지는 동안에도 이 수는 계속 오르므로, 다음 알림에 그 사이 몇 번이
 * 더 났는지가 드러난다. 눌린 알림이 조용히 없어지지 않게 하는 장치다.
 */
let faultCount = 0;

/**
 * 알림 도배 방지. 매 프레임 던지는 방이 있으면 초당 50줄이 스태프 채팅에 쏟아진다.
 *
 * 새 규칙을 만들지 않고 채팅·버튼과 같은 domain/RateLimit을 쓴다. "잠깐은
 * 몰아 쓸 수 있지만 계속은 못 한다"가 여기서도 그대로 맞는 규칙이다 —
 * 사고가 터진 직후 몇 줄은 다 보고 싶고, 이후로는 살아 있다는 신호만 있으면 된다.
 */
const reportRate = newBucket(FAULT_REPORT_RATE, Time.getUtcTime());

/**
 * work를 돌린다. 던지면 삼킨 뒤 알리고 false를 돌려준다.
 *
 * scope는 사람이 읽는 위치 표시다("방 3 NIGHT", "위젯 vote"). 예외 메시지만
 * 있으면 8개 방 중 어디에서 났는지 알 수 없어서, 잡는 자리마다 이걸 붙인다.
 *
 * 성공/실패를 돌려주는 이유는 부르는 쪽이 복구를 결정해야 하기 때문이다.
 * 방 진행이 실패했으면 그 방을 되돌려야 하지만, 위젯 메시지 하나가 실패한
 * 것은 그 메시지만 버리면 된다. 어느 쪽인지는 이 파일이 알 수 없다.
 */
export function guard(scope: string, work: () => void): boolean {
	try {
		work();
		return true;
	} catch (error) {
		faultCount++;
		notifyStaff(`⚠️ [${scope}] ${describe(error)} (누적 ${faultCount}회)`);
		return false;
	}
}

/** 예외에서 스택까지 뽑아낸다. 스택이 없으면 이름과 메시지로 대신한다 */
function describe(error: unknown): string {
	if (error instanceof Error) {
		const stack = error.stack;
		if (typeof stack === "string" && stack.length > 0) return stack;
		return `${error.name}: ${error.message}`;
	}
	return String(error);
}

/**
 * 스태프에게 한 줄 보낸다.
 *
 * 알리는 코드가 던지면 격리 자체가 무너지므로(catch 안에서 던지면 그 예외는
 * 위로 새어 나간다) 여기서 한 번 더 막는다. 이 catch는 비어 있는 것이 맞다 —
 * 알릴 수단이 고장 났을 때 더 알릴 방법은 없다.
 *
 * 예외 말고도 부를 곳이 있어서 내보낸다(Stage의 맵 자가 점검). 관측 채널이
 * 하나뿐이어야 도배 제한이 의미를 갖는다 — sayToStaffs를 여기저기서 직접
 * 부르면 한쪽이 쏟아질 때 다른 쪽 알림이 그 속에 묻힌다.
 */
export function notifyStaff(line: string): void {
	try {
		if (!spend(reportRate, FAULT_REPORT_RATE, Time.getUtcTime())) return;
		ScriptApp.sayToStaffs(line, STAFF_COLOR);
	} catch (error) {
		// 알림 실패는 삼킨다. 여기서 던지면 격리하려던 예외와 함께 위로 올라간다
	}
}
