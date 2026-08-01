/**
 * 시드에서 나오는 난수.
 *
 * 왜 필요한가: 직업 배정이 Math.random을 직접 부르면 같은 판을 두 번
 * 재현할 수 없다. 배정 하나가 틀어졌을 때 "무엇이 나왔길래 그랬는가"를
 * 되짚을 방법이 없고, 시뮬레이션도 매번 다른 판을 돌려 회귀를 못 잡는다.
 * 판 시작 때 시드 하나를 방에 적어 두면 그 숫자 하나로 판 전체가 재현된다.
 *
 * Park-Miller(최소 표준 LCG)를 쓴다. 곱셈 한 번과 나머지 한 번이라
 * Jint에서도 빠르고, 중간값이 2^31 × 16807 ≈ 3.6e13으로 double의 정수
 * 정밀도(2^53) 안에 들어와 비트 연산 없이 정확하다. 암호용은 아니지만
 * 여기서 필요한 것은 "같은 시드는 같은 판"과 "치우치지 않은 분포"뿐이다.
 */

/** LCG의 법(2^31 - 1). 소수라서 0을 제외한 전 구간을 한 바퀴 돈다 */
const MODULUS = 2147483647;
/** Park-Miller가 정한 곱수 */
const MULTIPLIER = 16807;

/**
 * 시드에서 [0, 1) 난수를 내는 함수를 만든다.
 *
 * 상태가 0이 되면 그 뒤로 영원히 0이므로 시드를 1..MODULUS-1로 접어 넣는다.
 * 0이나 음수를 주더라도 조용히 망가지지 않고 유효한 구간으로 옮겨진다.
 */
export function seededRng(seed: number): () => number {
	let state = Math.floor(seed) % MODULUS;
	if (state <= 0) state += MODULUS - 1;
	return function (): number {
		state = (state * MULTIPLIER) % MODULUS;
		return (state - 1) / (MODULUS - 1);
	};
}

/**
 * 새 판에 쓸 시드 하나. 1 이상 MODULUS-1 이하라 seededRng가 그대로 받는다.
 *
 * Math.random을 여기서만 부른다 — 시드를 뽑는 것이 판 전체에서 유일하게
 * 재현 불가능한 지점이고, 그 지점이 하나뿐이어야 "시드를 고정하면 판이
 * 고정된다"가 성립한다.
 */
export function newSeed(): number {
	return Math.floor(Math.random() * (MODULUS - 1)) + 1;
}
