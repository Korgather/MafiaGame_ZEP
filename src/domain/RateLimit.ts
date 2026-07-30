/**
 * 도배 방지 — "잠깐은 몰아 쓸 수 있지만 계속은 못 한다".
 *
 * 고정 간격("한 번 하면 1초 대기")으로 하지 않았다. 그러면 평범한 사용이
 * 먼저 걸린다 — 짧은 말을 두세 줄 잇달아 치는 것도, 방 목록에서 이 방 저 방
 * 눌러보는 것도 원래 그렇게 생겼다. 막아야 하는 것은 연타가 아니라
 * **끊이지 않는** 연타라서, 여유분을 모아 뒀다가 쓰는 방식으로 둘을 나눈다.
 *
 * 지속 속도는 REFILL_MS당 한 번이고, 그 위로 BURST만큼을 언제든 몰아 쓸 수
 * 있다. 넘겨도 잃는 것은 그 한 번뿐이고 기다리면 저절로 풀린다 — 벌이 아니라
 * 브레이크다.
 *
 * 남은 개수를 세지 않는 이유:
 * 처음에는 "남은 토큰 수 + 마지막 계산 시각" 두 값을 들고, 부를 때마다
 * 흐른 시간을 토큰으로 환산해 더했다. 규칙은 같지만 부동소수점 오차가
 * 호출 횟수만큼 쌓인다 — 0.1씩 열 번 더하면 1이 아니라 0.9999…라서, 딱
 * 맞게 기다린 사람이 한 박자 더 막힌다. 두들길수록 오차가 커지는 방향이라
 * 하필 제일 억울한 사람에게 제일 크게 나타난다.
 *
 * 그래서 개수 대신 "언제까지 미리 써 뒀는가" 시각 하나만 든다. 더하기가
 * 한 번뿐이라 오차가 쌓일 자리가 없고, 값도 하나로 줄었다.
 *
 * now를 인자로 받는 이유는 이 파일을 시계에서 떼어놓기 위해서다. 그래야
 * 규칙 자체를 시간 흐름 없이 검사할 수 있고, ZEP 전역(Time)에 묶이는 지점이
 * 호출부 한 줄로 좁아진다.
 */

/** 한 사람이 한 종류의 행동에 대해 들고 있는 여유분 */
export interface Bucket {
	/**
	 * 여기까지는 이미 쓴 것으로 친다(ms).
	 *
	 * now보다 뒤면 앞당겨 쓴 것이고, 그 차이가 곧 "남은 여유분"이다.
	 * 한 번 쓸 때마다 REFILL_MS씩 뒤로 밀린다.
	 */
	bookedUntil: number;
}

/** 얼마나 몰아 쓸 수 있고 얼마나 빨리 차는가 */
export interface RateLimit {
	readonly BURST: number;
	readonly REFILL_MS: number;
}

/** 여유분이 가득 찬 시점 — 이보다 과거는 의미가 없으므로 바닥이 된다 */
function floorOf(limit: RateLimit, now: number): number {
	return now - limit.BURST * limit.REFILL_MS;
}

/**
 * 여유분을 가득 채운 채로 시작한다.
 *
 * 빈 채로 시작하면 막 들어온 사람이 첫 인사부터 걸린다. 그건 제한이 아니라
 * 고장으로 보인다.
 */
export function newBucket(limit: RateLimit, now: number): Bucket {
	return { bookedUntil: floorOf(limit, now) };
}

/**
 * 한 번 쓴다. 여유분이 없으면 false를 돌려주고 아무것도 소모하지 않는다.
 *
 * 바닥으로 끌어올리는 첫 줄이 상한이다. 이게 없으면 한 시간 조용히 있던
 * 사람이 수백 번을 한꺼번에 쏟을 수 있다.
 */
export function spend(bucket: Bucket, limit: RateLimit, now: number): boolean {
	const floor = floorOf(limit, now);
	if (bucket.bookedUntil < floor) bucket.bookedUntil = floor;

	if (bucket.bookedUntil + limit.REFILL_MS > now) return false;
	bucket.bookedUntil += limit.REFILL_MS;
	return true;
}
