/**
 * 시즌 1에서 더해진 직업들.
 *
 * 직업마다 "이 직업이 무엇을 바꾸는가" 한 가지씩만 본다. 밤 정산의 순서와
 * 배달은 tests/night-pipeline.test.ts가 이미 지키고 있으므로 여기서 또
 * 확인하지 않는다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role, Team } from "../src/types/Game.types.ts";
import type { Seat } from "../src/types/Game.types.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { ROLE_DEFS } from "../src/domain/Roles.ts";
import {
	hasNightTurn,
	nightActionBlockedReason,
	NightOutcome,
} from "../src/domain/NightResolution.ts";
import type { NightIntent, NightSettlement } from "../src/domain/NightPipeline.ts";
import { putIntent, resolveNightIntents } from "../src/domain/NightPipeline.ts";
import { seat } from "./helpers/seat.ts";

function night(seats: Seat[], clicks: Array<[number, number]>): NightSettlement {
	const intents: NightIntent[] = [];
	for (const [actor, target] of clicks) putIntent(intents, actor, target);
	return resolveNightIntents(seats, intents, { skipAttacks: false });
}

/** 그 좌석에게 간 줄. 없으면 빈 문자열 */
function reveal(settlement: NightSettlement, index: number): string {
	for (const item of settlement.reveals) {
		if (item.seat === index) return item.line;
	}
	return "";
}

describe("사기꾼", () => {
	it("마피아 팀이고 마피아 채팅에 들어간다", () => {
		assert.equal(ROLE_DEFS[Role.CON_ARTIST].team, Team.MAFIA);
		assert.equal(ROLE_DEFS[Role.CON_ARTIST].nightChat, ChatChannel.MAFIA);
	});

	it("밤에 고를 대상이 없다", () => {
		assert.equal(ROLE_DEFS[Role.CON_ARTIST].nightAction, null);
	});

	it("경찰 조사에 마피아로 나오지 않는다", () => {
		// 이 직업의 전부다. appearsAsMafia를 켜지 않는 것 하나로 성립한다
		const seats = [seat(1, Role.POLICE), seat(2, Role.CON_ARTIST)];
		assert.match(reveal(night(seats, [[1, 2]]), 1), /마피아가 아닙니다/);
	});

	it("스파이에게는 정체가 그대로 보이고 합류가 일어난다", () => {
		// 위장은 팀 조사에만 통한다. 직업을 읽는 능력까지 속이면
		// 스파이가 사기꾼을 만났을 때 아무 일도 일어나지 않는다
		const seats = [seat(1, Role.SPY), seat(2, Role.CON_ARTIST)];
		const result = night(seats, [[1, 2]]);
		assert.match(reveal(result, 1), /사기꾼/);
		assert.deepEqual(result.defected, [1]);
	});

	it("조사당하면 다음 아침에 알게 된다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.CON_ARTIST)];
		assert.match(reveal(night(seats, [[1, 2]]), 2), /조사했습니다/);
	});

	it("스파이가 조사해도 다음 아침에 알게 된다", () => {
		// 알림에 닿는 경로가 둘이다 — 경찰의 INSPECT_TEAM과 스파이의 INSPECT_ROLE.
		// 경찰 쪽만 보면 스파이 쪽에서 기록이 통째로 빠져도 아무 테스트도 죽지
		// 않는다. 아래 「여러 명이 조사해도」는 경찰이 함께 앉아 있어서
		// 스파이 쪽이 아무것도 안 남겨도 "한 줄"이 그대로 맞는다
		const seats = [seat(1, Role.SPY), seat(2, Role.CON_ARTIST)];
		const result = night(seats, [[1, 2]]);
		assert.match(reveal(result, 2), /조사했습니다/);
	});

	it("누가 조사했는지는 알려주지 않는다", () => {
		// 조사한 사람이 드러나면 이 알림은 경찰을 지목하는 능력이 된다
		const seats = [seat(1, Role.POLICE), seat(2, Role.CON_ARTIST)];
		const line = reveal(night(seats, [[1, 2]]), 2);
		// 줄이 아예 없어도 doesNotMatch는 통과한다. 먼저 왔는지를 본다
		assert.ok(line.length > 0, "알림 자체가 오지 않았다");
		assert.doesNotMatch(line, /1번/);
	});

	it("여러 명이 조사해도 알림은 한 줄이다", () => {
		// 줄 수가 곧 살아 있는 조사 직업의 수를 알려준다
		const seats = [seat(1, Role.POLICE), seat(2, Role.SPY), seat(3, Role.CON_ARTIST)];
		const result = night(seats, [[1, 3], [2, 3]]);
		// 두 조사가 실제로 돌았는지 먼저 본다. 하나가 조용히 빠지면 "한 줄"은
		// 저절로 맞아 버려서 이 테스트가 아무것도 안 지키게 된다
		assert.match(reveal(result, 1), /마피아가 아닙니다/);
		assert.match(reveal(result, 2), /사기꾼/);
		const mine = result.reveals.filter(item => item.seat === 3);
		assert.equal(mine.length, 1);
	});

	it("아무도 조사하지 않으면 알림이 없다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.CON_ARTIST), seat(3, Role.CITIZEN)];
		assert.equal(reveal(night(seats, [[1, 3]]), 2), "");
	});

	it("다른 직업은 조사당해도 알림을 받지 않는다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.CITIZEN)];
		assert.equal(reveal(night(seats, [[1, 2]]), 2), "");
	});

	it("밤이 시작될 때 이미 죽어 있었으면 알림이 오지 않는다", () => {
		// 조사 자체는 시체에도 답을 준다 — 묻는 것이 "그 사람이 누구였는가"라서다.
		// 그 답은 조사한 쪽에만 간다. 이미 죽은 자리에까지 아침 알림이 가면
		// 나갈 곳 없는 줄이 밤마다 쌓인다
		const seats = [seat(1, Role.POLICE), seat(2, Role.CON_ARTIST, { alive: false })];
		const result = night(seats, [[1, 2]]);
		// 조사가 실제로 돌았는지 먼저 본다. 답이 안 나왔다면 알림이 없는 것은
		// 당연해서 아래 단언이 아무것도 안 지킨다
		assert.match(reveal(result, 1), /마피아가 아닙니다/);
		assert.equal(reveal(result, 2), "");
	});
});

/*
 * 점괘 두 줄. 문구를 통째로 못 박는다.
 *
 * /있습니다/만 보면 문구가 "밤에 쓸 능력이 있습니다"로 되돌아가도 전부
 * 통과한다 — 그 문구는 쪽지를 든 시민에게 '없습니다'를 내보내는 순간
 * 거짓말이 되므로, 무엇을 묻는 문장인지까지 잡아 둔다.
 */
const HAS = /직업 능력이 있습니다/;
const NONE = /직업 능력이 없습니다/;

describe("점쟁이", () => {
	it("첫 밤에는 차례가 있다", () => {
		// turnCount는 밤이 끝날 때 오르므로 첫 밤 동안에는 0이다
		assert.equal(hasNightTurn(seat(1, Role.SEER), 0), true);
	});

	it("둘째 밤부터는 차례가 없다", () => {
		assert.equal(hasNightTurn(seat(1, Role.SEER), 1), false);
		assert.equal(hasNightTurn(seat(1, Role.SEER), 5), false);
	});

	it("차례가 없는 이유를 문장으로 알려준다", () => {
		// 이 문장이 곧 밤 화면의 안내다. null이면 격자가 열리는데 누를 것이 없다
		const reason = nightActionBlockedReason(seat(1, Role.SEER), 1);
		assert.match(reason ?? "", /첫 밤/);
	});

	it("능력을 가진 직업은 '있습니다'로 나온다", () => {
		const seats = [seat(1, Role.SEER), seat(2, Role.DOCTOR)];
		assert.match(reveal(night(seats, [[1, 2]]), 1), HAS);
	});

	it("자경단원은 첫 밤에 못 쓰지만 '있습니다'다", () => {
		// 판정 기준은 보유다. "오늘 쓸 수 있는가"로 바꾸면 첫 밤의 점괘가
		// needsPriorDay 직업 목록을 그대로 흘린다
		const seats = [seat(1, Role.SEER), seat(2, Role.VIGILANTE)];
		assert.match(reveal(night(seats, [[1, 2]]), 1), HAS);
	});

	it("점쟁이 자신도 '있습니다'다", () => {
		const seats = [seat(1, Role.SEER)];
		assert.match(reveal(night(seats, [[1, 1]]), 1), HAS);
	});

	it("사기꾼은 '없습니다'로 나온다", () => {
		const seats = [seat(1, Role.SEER), seat(2, Role.CON_ARTIST)];
		assert.match(reveal(night(seats, [[1, 2]]), 1), NONE);
	});

	it("사기꾼은 점을 당한 것도 알아챈다", () => {
		// 점쟁이만 빼면 사기꾼을 안전하게 걸러내는 경로가 하나 생긴다
		const seats = [seat(1, Role.SEER), seat(2, Role.CON_ARTIST)];
		assert.match(reveal(night(seats, [[1, 2]]), 2), /조사했습니다/);
	});

	it("영매·군인·정치인도 '없습니다'다", () => {
		// 사기꾼과 같은 답을 내는 직업이 넷 더 있는 것이, 이 직업이 확정
		// 정보가 되지 않게 하는 유일한 장치다
		for (const role of [Role.SHAMAN, Role.SOLDIER, Role.POLITICIAN]) {
			const seats = [seat(1, Role.SEER), seat(2, role)];
			assert.match(reveal(night(seats, [[1, 2]]), 1), NONE, role);
		}
	});

	it("시민의 익명 쪽지는 직업 능력으로 세지 않는다", () => {
		// 점괘가 쪽지를 세면 '없습니다'가 나올 사람이 판에서 통째로 사라진다 —
		// 하한을 지우고 4~12인을 200시드씩 돌리면 6인 88판 중 59판이 후보 0명이
		// 되고, 4·5인은 44/44판이 그렇다. 쪽지는 평민이면 누구나 똑같이 들고
		// 있어서 그 사람이 무엇인지를 가르지 못한다.
		// 이 단언은 hasJobAbility에서 NOTE 제외를 빼는 순간 죽는다
		const seats = [seat(1, Role.SEER), seat(2, Role.CITIZEN)];
		assert.match(reveal(night(seats, [[1, 2]]), 1), NONE);
	});

	it("다 쓴 시민도 답이 같다", () => {
		// 묻는 것은 보유다. 답이 갈리면 점괘 한 번이 "저 시민은 이미 썼다"까지
		// 알려주고, 그건 점쟁이가 갖지 않기로 한 확정 정보다
		const spent = [seat(1, Role.SEER), seat(2, Role.CITIZEN, { usesSpent: 1 })];
		assert.match(reveal(night(spent, [[1, 2]]), 1), NONE);
	});

	it("진영은 한 글자도 새지 않는다", () => {
		const seats = [seat(1, Role.SEER), seat(2, Role.MAFIA)];
		const line = reveal(night(seats, [[1, 2]]), 1);
		// 줄이 아예 없어도 doesNotMatch는 통과한다. 먼저 왔는지를 본다
		assert.ok(line.length > 0, "점괘 자체가 오지 않았다");
		assert.doesNotMatch(line, /마피아|시민/);
	});
});

describe("시민의 익명 쪽지", () => {
	it("대상에게 문구가 그대로 간다", () => {
		const sender = seat(1, Role.CITIZEN, { noteText: "당신을 믿습니다" });
		const seats = [sender, seat(2, Role.DOCTOR)];
		assert.match(reveal(night(seats, [[1, 2]]), 2), /당신을 믿습니다/);
	});

	it("보낸 사람은 드러나지 않는다", () => {
		// 익명이 아니면 시민이 정보원이 된다. 그 순간 시민이 밤의 표적이 된다
		const sender = seat(1, Role.CITIZEN, { noteText: "당신이 의심됩니다" });
		const seats = [sender, seat(2, Role.DOCTOR)];
		const line = reveal(night(seats, [[1, 2]]), 2);
		// 줄이 아예 없어도 doesNotMatch는 통과한다. 먼저 왔는지를 본다
		assert.ok(line.length > 0, "쪽지 자체가 오지 않았다");
		assert.doesNotMatch(line, /1번/);
	});

	it("문구를 고르기 전에 밤이 끝나면 아무것도 가지 않는다", () => {
		const sender = seat(1, Role.CITIZEN);
		const seats = [sender, seat(2, Role.DOCTOR)];
		assert.equal(reveal(night(seats, [[1, 2]]), 2), "");
	});

	it("문구를 안 골랐으면 사용 횟수도 안 줄어든다", () => {
		const sender = seat(1, Role.CITIZEN);
		night([sender, seat(2, Role.DOCTOR)], [[1, 2]]);
		assert.equal(sender.usesSpent, 0);
	});

	it("보내면 사용 횟수가 오른다", () => {
		const sender = seat(1, Role.CITIZEN, { noteText: "오늘은 조용히 계세요" });
		night([sender, seat(2, Role.DOCTOR)], [[1, 2]]);
		assert.equal(sender.usesSpent, 1);
	});

	it("대상이 그 밤에 죽으면 배달되지 않고 횟수도 안 닳는다", () => {
		// AFTER step이라 DEATH는 이미 지나갔다. 죽은 사람의 화면에 아침에
		// 쪽지가 뜨면 그건 유령에게 가는 정보다 — 유령 채널은 영매를 통해
		// 낮으로 돌아오므로, 조사 결과와 달리 쪽지는 새 정보를 거기 주입한다
		const sender = seat(1, Role.CITIZEN, { noteText: "내일 나서 주세요" });
		const seats = [sender, seat(2, Role.MAFIA), seat(3, Role.DOCTOR)];
		const result = night(seats, [[1, 3], [2, 3]]);
		// seat.alive는 파이프라인 안에서 내려가지 않는다 — 좌석을 내리는 것은
		// 밖의 kill()이다. "오늘 죽었다"는 정산 결과로만 관측할 수 있다
		assert.deepEqual(
			result.casualties.map(c => [c.seat.index, c.outcome]),
			[[3, NightOutcome.KILLED]]
		);
		assert.equal(reveal(result, 3), "");
		// 배달되지 않았으니 쓴 것도 아니다. 여기가 false면 대상이 죽는 바람에
		// 시민이 한 장을 날린다 — 밤 사망은 어차피 공개되므로 새는 정보는 없다
		assert.equal(sender.usesSpent, 0);
	});

	it("의사가 살린 대상에게는 그대로 배달된다", () => {
		// 배달 조건은 "오늘 죽었는가"이지 "오늘 공격받았는가"가 아니다.
		// 후자로 바꾸면 살아난 사람에게만 쪽지가 안 오고, 그 침묵 자체가
		// "저 사람은 어젯밤 공격받았다"를 알려주는 신호가 된다 —
		// 정보 유출 방어라 흔적이 없어서 조용히 사라지기 쉽다
		const sender = seat(1, Role.CITIZEN, { noteText: "내일 나서 주세요" });
		const seats = [sender, seat(2, Role.MAFIA), seat(3, Role.DOCTOR), seat(4, Role.POLITICIAN)];
		const result = night(seats, [[1, 4], [2, 4], [3, 4]]);
		// 실제로 공격이 있었고 살아남았는지 먼저 본다. 공격이 조용히 빠지면
		// 아래 배달 단언은 평범한 밤을 보고 통과한다
		assert.deepEqual(
			result.casualties.map(c => [c.seat.index, c.outcome]),
			[[4, NightOutcome.SAVED]]
		);
		assert.match(reveal(result, 4), /내일 나서 주세요/);
		assert.equal(sender.usesSpent, 1);
	});

	it("군인의 방탄이 막은 대상에게도 그대로 배달된다", () => {
		// SAVED와 같은 이유다. 결말이 둘이라 한쪽만 잡으면 다른 쪽이 샌다
		const sender = seat(1, Role.CITIZEN, { noteText: "오늘은 조용히 계세요" });
		const seats = [sender, seat(2, Role.MAFIA), seat(3, Role.SOLDIER)];
		const result = night(seats, [[1, 3], [2, 3]]);
		assert.deepEqual(
			result.casualties.map(c => [c.seat.index, c.outcome]),
			[[3, NightOutcome.SHIELDED]]
		);
		assert.match(reveal(result, 3), /오늘은 조용히 계세요/);
		assert.equal(sender.usesSpent, 1);
	});

	it("밤이 시작될 때 이미 죽어 있었으면 배달되지 않는다", () => {
		// 지목 목록은 죽은 자리를 걸러 주지 않는다(targetOf). 어제 죽은 사람을
		// 찍은 지목이 남아 있으면 그 좌석으로 쪽지가 간다 — 유령에게 가는
		// 정보라는 점에서 "그 밤에 죽은 사람"과 같다
		const sender = seat(1, Role.CITIZEN, { noteText: "당신을 믿습니다" });
		const seats = [sender, seat(2, Role.POLITICIAN, { alive: false })];
		const result = night(seats, [[1, 2]]);
		assert.equal(reveal(result, 2), "");
		// 배달되지 않았으니 쓴 것도 아니다
		assert.equal(sender.usesSpent, 0);
	});

	it("한 번 쓰면 다음 밤에는 차례가 없다", () => {
		assert.equal(hasNightTurn(seat(1, Role.CITIZEN, { usesSpent: 1 }), 2), false);
		assert.match(
			nightActionBlockedReason(seat(1, Role.CITIZEN, { usesSpent: 1 }), 2) ?? "",
			/다 썼습니다/
		);
	});

	it("쓴 그 밤까지는 차례에 남는다", () => {
		// 밤이 끝날 때 오르는 값이라 그 밤 동안에는 usedSkill만 켜져 있다
		const tonight = seat(1, Role.CITIZEN, { usedSkill: true });
		assert.equal(hasNightTurn(tonight, 1), true);
	});
});
