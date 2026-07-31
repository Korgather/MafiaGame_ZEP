/*
 * 차단(BLOCK)과 건달.
 *
 * 이 파일이 지키는 것은 한 문장이다 — "막힌 능력은 일어나지 않는다".
 * 능력마다 흔적이 남는 자리가 다르다(healed·attackedBy·reveals·usesSpent).
 * 그래서 하나로 대표하지 않고 직업별로 한 번씩 확인한다. 대표 하나만
 * 두면 새 step이 생겼을 때 가드를 빠뜨린 것을 아무도 못 잡는다.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Role, Team } from "../src/types/Game.types.ts";
import type { Seat } from "../src/types/Game.types.ts";
import { ROLE_DEFS } from "../src/domain/Roles.ts";
import { NightOutcome, recordNightIntent } from "../src/domain/NightResolution.ts";
import type { NightIntent, NightReveal } from "../src/domain/NightPipeline.ts";
import { putIntent, resolveNightIntents } from "../src/domain/NightPipeline.ts";
import { seat } from "./helpers/seat.ts";

/** 밤을 한 번 돌린다. clicks는 누른 순서대로 준다 */
function night(seats: Seat[], clicks: Array<[number, number]>, skipAttacks = false) {
	const intents: NightIntent[] = [];
	for (const [actor, target] of clicks) putIntent(intents, actor, target);
	return resolveNightIntents(seats, intents, { skipAttacks });
}

/** 이 좌석에게 아침에 가는 줄이 몇 개인가 */
function linesFor(reveals: readonly NightReveal[], index: number): number {
	let count = 0;
	for (const reveal of reveals) {
		if (reveal.seat === index) count++;
	}
	return count;
}

/** 이 좌석에게 가는 첫 줄. 없으면 빈 문자열 */
function lineFor(reveals: readonly NightReveal[], index: number): string {
	for (const reveal of reveals) {
		if (reveal.seat === index) return reveal.line;
	}
	return "";
}

describe("차단 — 막힌 능력은 일어나지 않는다", () => {
	it("막힌 마피아는 아무도 죽이지 못한다", () => {
		const seats = [seat(1, Role.THUG), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 2], [2, 3]]);
		assert.equal(result.casualties.length, 0);
		assert.equal(seats[2].alive, true);
		// 공격 자체가 없었다. "공격했지만 살았다"와는 다른 상태다
		assert.deepEqual(seats[2].attackedBy, []);
	});

	it("막힌 의사는 살리지 못한다", () => {
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.DOCTOR),
			seat(3, Role.MAFIA),
			seat(4, Role.CITIZEN),
		];
		const result = night(seats, [[1, 2], [2, 4], [3, 4]]);
		assert.equal(result.casualties.length, 1);
		assert.equal(result.casualties[0].outcome, NightOutcome.KILLED);
		assert.equal(seats[3].healed, false);
	});

	it("막힌 경찰은 답도 못 받고 흔적도 남기지 않는다", () => {
		// 조사가 일어나지 않았으므로 사기꾼에게 가는 "조사당했습니다"도 없다.
		// 한쪽만 막고 다른 쪽이 새면 그 한 줄이 곧 "경찰이 살아 있다"는 정보다
		const seats = [seat(1, Role.THUG), seat(2, Role.POLICE), seat(3, Role.CON_ARTIST)];
		const result = night(seats, [[1, 2], [2, 3]]);
		// 경찰이 받는 것은 방해 통보 한 줄뿐이다. 조사 답은 그 안에 없다
		assert.equal(linesFor(result.reveals, 2), 1);
		const line = lineFor(result.reveals, 2);
		assert.ok(line.length > 0, "막힌 경찰에게 아무 줄도 오지 않았습니다");
		assert.doesNotMatch(line, /마피아입니다|마피아가 아닙니다/);
		assert.equal(linesFor(result.reveals, 3), 0);
	});

	it("막힌 스파이는 마피아팀에 합류하지 않는다", () => {
		// 합류는 되돌릴 수 없는 사건이다. 막혔는데 합류까지 됐다면
		// 그 밤의 결과가 아니라 게임 전체가 어긋난다
		const seats = [seat(1, Role.THUG), seat(2, Role.SPY), seat(3, Role.MAFIA)];
		const result = night(seats, [[1, 2], [2, 3]]);
		assert.equal(result.defected.length, 0);
		assert.equal(seats[1].team, Team.CITIZEN);
		// 방해 통보 한 줄만 온다. 직업을 읽은 답도 합류 안내도 없다
		assert.equal(linesFor(result.reveals, 2), 1);
		const line = lineFor(result.reveals, 2);
		assert.ok(line.length > 0, "막힌 스파이에게 아무 줄도 오지 않았습니다");
		assert.doesNotMatch(line, /직업은|합류/);
	});

	it("막힌 자경단원은 총알을 잃지 않는다", () => {
		const seats = [seat(1, Role.THUG), seat(2, Role.VIGILANTE), seat(3, Role.CITIZEN)];
		night(seats, [[1, 2], [2, 3]]);
		assert.equal(seats[2].alive, true);
		// 이 단언이 Task 8의 "apply가 참을 돌려줄 때만 센다"를 지킨다
		assert.equal(seats[1].usesSpent, 0);
	});

	it("막힌 기자의 특종은 나가지 않는다", () => {
		const seats = [seat(1, Role.THUG), seat(2, Role.REPORTER), seat(3, Role.CITIZEN)];
		night(seats, [[1, 2], [2, 3]]);
		assert.equal(seats[2].scooped, false);
		assert.equal(seats[1].usesSpent, 0);
	});

	it("막힌 시민의 쪽지는 배달되지 않는다", () => {
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.CITIZEN, { noteText: "당신을 믿습니다" }),
			seat(3, Role.CITIZEN),
		];
		const result = night(seats, [[1, 2], [2, 3]]);
		assert.equal(linesFor(result.reveals, 3), 0);
		assert.equal(seats[1].usesSpent, 0);
	});
});

describe("차단 — 닿지 않는 것", () => {
	it("군인의 방탄은 차단으로 벗겨지지 않는다", () => {
		// armored는 밤에 쓰는 능력이 아니라 배정 때 켜진 상태다. 군인은
		// nightAction이 null이라 intent를 남기지 못하고, 방탄을 읽는 곳
		// (resolveNightCasualties)은 blocked를 보지 않는다. 그래서 차단은
		// 걸리되(blocked === true) 아무것도 벗기지 못한다.
		//
		// alive와 armored를 함께 본다: 살아남았고 방탄은 소모됐다 —
		// 즉 "방탄이 제 일을 했다"이다. armored만 보면 "처음부터 없었다"와
		// 구분되지 않는다.
		// (실전 덱에서는 RuleSet.ts의 배타 그룹 때문에 군인과 건달이 함께
		//  서지 않는다. 그래도 규칙과 코드는 따로 지킨다)
		const seats = [seat(1, Role.THUG), seat(2, Role.SOLDIER), seat(3, Role.MAFIA)];
		night(seats, [[1, 2], [3, 2]]);
		assert.equal(seats[1].blocked, true);
		assert.equal(seats[1].alive, true);
		assert.equal(seats[1].armored, false);
	});

	it("정치인은 차단당해도 좌석 상태가 멀쩡하다", () => {
		// 스펙 엣지케이스 #20. voteWeight는 RoleDef의 값이라 좌석 상태가 아니고,
		// Voting.ts의 voteWeight()도 서비스 내부 private이라 도메인에서 부를 수
		// 없다. 즉 차단이 닿을 표면이 없다 — 여기서 단언할 수 있는 것은
		// "차단은 걸렸고, 정치인 쪽에서 사라진 것이 없다"까지다.
		// 언젠가 voteWeight를 Seat으로 옮기면 이 테스트가 그 결정을 마주한다
		const seats = [seat(1, Role.THUG), seat(2, Role.POLITICIAN)];
		night(seats, [[1, 2]]);
		assert.equal(seats[1].blocked, true);
		assert.equal(seats[1].alive, true);
	});

	it("막힌 사기꾼도 조사당했다는 통보는 그대로 받는다", () => {
		// 스펙 전수표의 "사기꾼을 차단해도 아무 일도 없다" 행이다. 사기꾼은
		// nightAction이 null이라 막을 능력 자체가 없고, 역알림은 밤에 쓰는
		// 능력이 아니라 조사가 남긴 흔적을 아침에 읽어 주는 사후 통보다
		// (NightPipeline의 notifyInspected). 규칙은 "막을 것이 없는 사람을
		// 막아도 사후 통보는 간다"이다.
		//
		// 반대가 훨씬 자연스러워 보인다 — "막힌 사람은 아무 통보도 못 받는다".
		// notifyInspected 순회에 if (seat.blocked) continue; 한 줄을 넣으면
		// 이 파일을 포함한 다른 모든 테스트가 그대로 통과한다. 확인했다.
		// 그 한 줄을 막는 것은 이 테스트뿐이다
		const seats = [seat(1, Role.THUG), seat(2, Role.POLICE), seat(3, Role.CON_ARTIST)];
		const result = night(seats, [[1, 3], [2, 3]]);
		assert.equal(seats[2].blocked, true);
		// 문구보다 줄 수를 먼저 본다. 줄이 통째로 사라져도 문구 단언만으로는
		// 빈 문자열이 조용히 지나간다
		assert.equal(linesFor(result.reveals, 3), 1, "막힌 사기꾼에게 역알림이 오지 않았습니다");
		const notice = result.reveals.filter(item => item.seat === 3)[0];
		assert.match(notice.line, /조사했습니다/);
	});

	it("차단끼리는 서로를 막지 않는다", () => {
		// step 20 안에는 순서가 없다. 건달 A가 건달 B에게 막혀도 A의 차단은
		// 성립한다 — 아니면 누가 먼저 눌렀는지가 다시 밤을 가른다.
		//
		// 여기서는 막히는 쪽(1번)이 좌석 배열에서 앞에 있다. 순회가 좌석
		// 순서를 따르므로 이 배치만으로는 가드가 옳은지 알 수 없다 —
		// 1번은 어차피 막히기 전에 자기 차례를 마친다. 반대 배치가 아래에
		// 따로 있고, 규칙을 실제로 지키는 것은 그쪽이다
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.THUG),
			seat(3, Role.MAFIA),
			seat(4, Role.CITIZEN),
		];
		const result = night(seats, [[1, 3], [2, 1], [3, 4]]);
		assert.equal(seats[0].blocked, true);
		assert.equal(seats[2].blocked, true);
		assert.equal(result.casualties.length, 0);
		// 차단은 걸렸으니 닳는다. 막힌 마피아만 한 장도 쓰지 않았다 —
		// 파이프라인의 "apply가 참을 돌려줄 때만 센다"가 세 좌석에서 한 번에 보인다
		assert.equal(seats[0].usesSpent, 1);
		assert.equal(seats[1].usesSpent, 1);
		assert.equal(seats[2].usesSpent, 0);
	});

	it("먼저 놓인 건달에게 막혀도 뒤 건달의 차단은 성립한다", () => {
		// 위 테스트와 좌석 배치만 반대다. 이번에는 막는 쪽(1번)이 먼저라
		// 2번은 자기 차례가 오기 전에 이미 blocked다. 가드에서 BLOCK 예외를
		// 빼면 정확히 여기서만 밤이 갈린다 — 2번의 차단이 통째로 사라지고
		// 마피아가 4번을 죽인다. 앞 테스트는 이 변경을 통과시킨다
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.THUG),
			seat(3, Role.MAFIA),
			seat(4, Role.CITIZEN),
		];
		const result = night(seats, [[1, 2], [2, 3], [3, 4]]);
		assert.equal(seats[1].blocked, true);
		assert.equal(seats[2].blocked, true, "막힌 건달의 차단이 사라졌습니다");
		assert.equal(result.casualties.length, 0);
		assert.equal(seats[3].alive, true);
		// 막힌 채로도 자기 차단은 했으니 한 장 닳는다
		assert.equal(seats[1].usesSpent, 1);
	});

	it("첫 밤에도 차단은 작동한다", () => {
		// skipAttacks가 건너뛰는 것은 step 40·50뿐이다. step 20은 그대로 돈다
		const seats = [seat(1, Role.THUG), seat(2, Role.POLICE), seat(3, Role.MAFIA)];
		const result = night(seats, [[1, 2], [2, 3]], true);
		assert.equal(seats[1].blocked, true);
		// 통보도 첫 밤에 그대로 간다. 건달의 하한(8인)과 첫 밤 무사(8인 이하)가
		// 겹치므로 8인 판에서는 이쪽이 오히려 흔한 경우다
		assert.equal(linesFor(result.reveals, 2), 1);
		const line = lineFor(result.reveals, 2);
		assert.ok(line.length > 0, "첫 밤에 막힌 경찰에게 아무 줄도 오지 않았습니다");
		assert.doesNotMatch(line, /마피아입니다|마피아가 아닙니다/);
	});
});

describe("건달 — 자기 자신은 고를 수 없다", () => {
	it("건달이 자기를 지목하면 기록되지 않는다", () => {
		const thug = seat(1, Role.THUG);
		assert.equal(recordNightIntent(thug, thug), null);
	});

	it("의사의 자가 치유는 그대로 된다", () => {
		// 전역 금지가 아니라 직업별 플래그인 이유가 이 한 줄이다
		const doctor = seat(1, Role.DOCTOR);
		assert.notEqual(recordNightIntent(doctor, doctor), null);
	});

	it("다시 쓴 건달도 시민팀이다", () => {
		// Task 1이 고친 진영을 정의를 통째로 다시 쓰면서 되돌리기 쉽다.
		// Task 1의 테스트와 겹치지만, 겹치는 값이 아니라 겹치는 위험을 본다
		assert.equal(ROLE_DEFS[Role.THUG].team, Team.CITIZEN);
		assert.equal(ROLE_DEFS[Role.THUG].appearsAsMafia, undefined);
	});
});

describe("차단 통보", () => {
	it("막은 건달은 상대가 움직였다는 것을 안다", () => {
		const seats = [seat(1, Role.THUG), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 2], [2, 3]]);
		assert.equal(linesFor(result.reveals, 1), 1);
		assert.match(lineFor(result.reveals, 1), /2번은 어젯밤 능력을 썼고/);
	});

	it("움직이지 않은 사람을 막으면 그렇게 알려준다", () => {
		// 능력이 없는 사람과 있는데 안 쓴 사람을 합친 문안이다. 구분되면
		// 점쟁이의 정보와 완전히 겹친다
		const seats = [seat(1, Role.THUG), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 2]]);
		assert.match(lineFor(result.reveals, 1), /2번은 어젯밤 아무것도 하지 않았습니다/);
	});

	it("막힌 사람은 막혔다는 것만 안다", () => {
		const seats = [seat(1, Role.THUG), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 2], [2, 3]]);
		const line = lineFor(result.reveals, 2);
		assert.match(line, /누군가 당신을 방해해/);
		// 건달의 번호가 들어가면 다음 낮에 건달이 처형된다
		assert.equal(line.indexOf("1번"), -1);
	});

	it("사기꾼을 막으면 사기꾼에게는 아무것도 가지 않는다", () => {
		// "능력이 없는데 방해받았다"는 곧 건달의 존재 확정이다.
		// 손해가 없었으므로 알릴 것도 없다
		const seats = [seat(1, Role.THUG), seat(2, Role.CON_ARTIST), seat(3, Role.MAFIA)];
		const result = night(seats, [[1, 2]]);
		assert.equal(linesFor(result.reveals, 2), 0);
		assert.match(lineFor(result.reveals, 1), /아무것도 하지 않았습니다/);
	});

	it("밤에 죽은 사람에게는 통보가 가지 않는다", () => {
		// 유령에게 가는 줄이다. 건달 쪽 통보는 그대로 간다 — 막은 것은 사실이다.
		//
		// 오늘의 시체를 seat.alive로는 알 수 없다. 파이프라인은 판정만 하고
		// 좌석을 실제로 내리는 것은 밖의 kill()이라 DEATH를 지난 뒤에도 alive가
		// 참이다 — 그래서 casualties로 죽음을 확인하고, 구현도 ledger.killed를 본다
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.POLICE),
			seat(3, Role.MAFIA),
			seat(4, Role.CITIZEN),
		];
		const result = night(seats, [[1, 2], [2, 4], [3, 2]]);
		assert.equal(result.casualties.length, 1);
		assert.equal(result.casualties[0].seat.index, 2);
		assert.equal(result.casualties[0].outcome, NightOutcome.KILLED);
		assert.equal(linesFor(result.reveals, 2), 0);
		assert.equal(linesFor(result.reveals, 1), 1);
	});

	it("막은 건달이 그 밤에 죽어도 통보는 간다", () => {
		// 건달의 죽음은 BLOCK(20)보다 뒤인 DEATH(50)에서 확정된다. 이미 성립한
		// 차단을 되돌리지 않고, 통보도 삼키지 않는다 — 유령 채널로 흘려보내야
		// 남은 시민이 "어젯밤 3번이 움직였다"를 쓸 수 있다
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.MAFIA),
			seat(3, Role.POLICE),
			seat(4, Role.CITIZEN),
		];
		const result = night(seats, [[1, 3], [2, 1], [3, 4]]);
		assert.equal(result.casualties.length, 1);
		assert.equal(result.casualties[0].seat.index, 1);
		assert.match(lineFor(result.reveals, 1), /3번은 어젯밤 능력을 썼고/);
		// 막힌 경찰은 조사 답 대신 방해 통보 한 줄만 받는다
		assert.equal(linesFor(result.reveals, 3), 1);
		assert.match(lineFor(result.reveals, 3), /방해/);
	});

	it("건달이 둘이면 각자 자기 대상만 안다", () => {
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.THUG),
			seat(3, Role.MAFIA),
			seat(4, Role.POLICE),
			seat(5, Role.CITIZEN),
		];
		const result = night(seats, [[1, 3], [2, 4], [3, 5], [4, 5]]);
		assert.match(lineFor(result.reveals, 1), /3번/);
		assert.match(lineFor(result.reveals, 2), /4번/);
		assert.equal(linesFor(result.reveals, 1), 1);
		assert.equal(linesFor(result.reveals, 2), 1);
	});

	it("둘이 같은 사람을 막아도 당사자에게는 한 줄만 간다", () => {
		// 줄 수가 곧 건달의 수가 되면 안 된다
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.THUG),
			seat(3, Role.MAFIA),
			seat(4, Role.CITIZEN),
		];
		const result = night(seats, [[1, 3], [2, 3], [3, 4]]);
		assert.equal(linesFor(result.reveals, 3), 1);
		// 반대로 건달 둘은 각자 받는다. 하나만 받으면 나머지 하나는
		// 자기 능력이 작동했는지조차 모른다
		assert.equal(linesFor(result.reveals, 1), 1);
		assert.equal(linesFor(result.reveals, 2), 1);
	});

	it("어젯밤 이전에 이미 죽어 있던 사람에게는 통보가 가지 않는다", () => {
		// 위의 "밤에 죽은 사람"과는 다른 좌석 상태다. 저쪽은 alive가 아직 참이고
		// ledger.killed로만 알 수 있는 오늘의 시체이고, 이쪽은 밤이 시작될 때부터
		// alive가 거짓인 어제까지의 시체다. 그래서 가드가 둘 다 필요하다.
		//
		// 아래로 흘려보내도 걸러 주는 곳이 없다 — deliverNightReveals는 죽은
		// 사람에게도 그대로 전한다(그 밤에 죽은 경찰의 마지막 조사를 살리려는
		// 설계다). 서비스 계층이 죽은 좌석을 지목 대상에서 빼 주기는 하지만
		// 이 파이프라인은 그 바깥 가드에 기대지 않는다
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.POLICE, { alive: false }),
			seat(3, Role.CITIZEN),
		];
		const result = night(seats, [[1, 2], [2, 3]]);
		assert.equal(linesFor(result.reveals, 2), 0);
		// 죽은 경찰의 조사도 일어나지 않는다. 산 사람만 능력을 쓴다
		assert.equal(linesFor(result.reveals, 3), 0);
	});

	it("건달이 뒤 좌석이어도 양쪽 통보가 그대로 간다", () => {
		// 위 아홉은 전부 건달이 1번 좌석이다. 통보 루프가 좌석 순서를 도는
		// 이상 그 배치만으로는 규칙이 순서에 기대고 있는지 알 수 없다 —
		// Task 10에서 살아남은 변이의 원인이 정확히 그것이었다.
		// 여기서는 막는 쪽이 배열 끝에 있고 막히는 쪽이 앞에 있다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.POLICE), seat(3, Role.THUG)];
		const result = night(seats, [[3, 1], [1, 2], [2, 1]]);
		assert.equal(seats[0].blocked, true);
		assert.equal(result.casualties.length, 0);
		assert.equal(linesFor(result.reveals, 3), 1);
		assert.match(lineFor(result.reveals, 3), /1번은 어젯밤 능력을 썼고/);
		assert.equal(linesFor(result.reveals, 1), 1);
		assert.match(lineFor(result.reveals, 1), /누군가 당신을 방해해/);
	});
});
