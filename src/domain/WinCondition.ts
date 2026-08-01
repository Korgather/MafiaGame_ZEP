/**
 * 승패 판정. 순수 함수.
 *
 * 기존 gameEndCheck는 판정과 보상 지급과 위젯 전환과 다음 상태 예약을
 * 한 함수 안에서 다 했다(90줄). 그래서 "마피아가 이겼는가"만 알고 싶어도
 * 부작용 없이 물어볼 방법이 없었고, 테스트도 불가능했다.
 */
import type { Seat } from "../types/Game.types.ts";
import { Team } from "../types/Game.types.ts";
import { countsForMafiaWin, winWeightOf } from "./Roles.ts";

/**
 * 생존자를 네 가지로 센다. 넷이 따로 있는 이유는 각자 다른 질문에 답해서다.
 *
 * 머릿수(`*Alive`)는 팀 소속만 본다 — "그 진영이 전멸했는가".
 * 무게(`*Power`)는 접선 상태와 승리 가중치까지 본다 — "마피아가 판을 쥐었는가".
 *
 * 둘을 한 숫자로 합칠 수 없다. 접선하지 못한 짐승인간은 무게로는 마피아가
 * 아니지만(마피아도 그를 모른다) 팀 소속으로는 분명히 마피아 진영이고, 매
 * 밤 혼자 사람을 죽인다. 합쳐 두면 마피아 본진이 전멸한 순간 시민 승리가
 * 선언되고, 살아 있는 살인자가 그 자리에서 판과 함께 사라진다.
 *
 * `mafiaRole`(직업이 마피아인 생존자 수)이라는 필드가 예전에 있었지만
 * 아무도 읽지 않았다. 승패는 직업으로 갈리지 않기 때문이다 —
 * 짐승인간·사기꾼은 마피아 팀이지만 직업이 마피아가 아니다.
 */
export interface AliveCount {
	/** 팀 소속이 마피아인 생존자 머릿수. 접선 여부도 가중치도 보지 않는다 */
	mafiaAlive: number;
	/** 팀 소속이 시민인 생존자 머릿수 */
	citizenAlive: number;
	/** 승리 판정에 서는 마피아 무게. 접선한 마피아팀 좌석만 winWeight로 더한다 */
	mafiaPower: number;
	/** 승리 판정에 서는 시민 무게. 접선하지 못한 마피아팀 좌석도 여기 든다 */
	citizenPower: number;
}

export function countAlive(seats: readonly Seat[]): AliveCount {
	const result: AliveCount = { mafiaAlive: 0, citizenAlive: 0, mafiaPower: 0, citizenPower: 0 };
	for (const seat of seats) {
		if (!seat.alive) continue;
		if (seat.team === Team.MAFIA) result.mafiaAlive++;
		else result.citizenAlive++;

		/*
		 * 무게는 팀 소속이 아니라 접선으로 갈린다.
		 *
		 * 접선하지 못한 스파이·짐승인간을 시민 쪽에 두는 것은 "아직 마피아로
		 * 세지 않는다"의 자연스러운 귀결이다. 어느 쪽에도 두지 않는 길도
		 * 있었지만, 그러면 "마피아 ≥ 시민"의 오른쪽이 판마다 조용히 줄어
		 * 마피아가 더 빨리 이긴다 — 아무 일도 하지 않은 스파이가 자기 팀을
		 * 돕는 셈이라 위험을 무릅쓰고 접선할 이유가 사라진다.
		 */
		const weight = winWeightOf(seat);
		if (countsForMafiaWin(seat)) result.mafiaPower += weight;
		else result.citizenPower += weight;
	}
	return result;
}

/**
 * 승리 진영. 아직 안 끝났으면 null.
 *
 * 세 줄의 순서가 곧 규칙이다.
 *
 *   1. 마피아 진영이 한 명도 없으면 시민 승리. 무게가 아니라 머릿수로 보는
 *      이유는 위와 같다 — 접선하지 못한 짐승인간이 살아 있는 판은 끝난 판이
 *      아니다.
 *   2. 시민 진영이 한 명도 없으면 마피아 승리. 접선하지 못한 스파이만 남은
 *      판이 여기 걸린다. 무게로만 보면 그 스파이가 시민 쪽에 서 있어서
 *      혼자 남은 방이 영원히 끝나지 않는다.
 *   3. 마피아 무게가 시민 무게 이상이면 마피아 승리 — 낮 투표로 뒤집을 수
 *      없기 때문이다. 건달이 시민이면서 3의 무게를 갖는 것이 여기서 산다:
 *      마피아는 건달을 먼저 치우지 않고서는 이 줄에 닿지 못한다.
 */
export function evaluateWinner(seats: readonly Seat[]): Team | null {
	const alive = countAlive(seats);
	if (alive.mafiaAlive <= 0) return Team.CITIZEN;
	if (alive.citizenAlive <= 0) return Team.MAFIA;
	if (alive.mafiaPower >= alive.citizenPower) return Team.MAFIA;
	return null;
}
