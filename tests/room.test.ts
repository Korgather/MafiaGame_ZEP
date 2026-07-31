/**
 * 좌석을 판 사이에 다시 쓰는 자리.
 *
 * Room.ts의 assignRole은 "지난 판의 값이 한 칸도 남지 않는다"를 위해 존재한다.
 * 그 불변식은 필드가 늘 때마다 조용히 깨진다 — createSeat만 고치고 여기를
 * 빠뜨려도 컴파일은 통과하고, 그 판에서 처음 죽는 것은 몇 판 뒤의 누군가다.
 *
 * 이 파일이 따로 있는 이유: 대부분의 필드는 resetRound가 매 밤 한 번 더
 * 지운다. 겹으로 막는 줄은 게임 화면에 흔적을 남기지 않아서, 지워도 아무
 * 테스트가 빨개지지 않는다. 겹이라는 이유로 조용히 사라지는 것을 막는다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role, Team } from "../src/types/Game.types.ts";
import { assignRole } from "../src/entities/Room.ts";
import { seat } from "./helpers/seat.ts";

describe("assignRole", () => {
	it("지난 판의 값은 한 칸도 넘어오지 않는다", () => {
		// 게임 내내 유지되는 값(방탄·사용 횟수·고른 문구)이 생긴 뒤로
		// "매 밤 초기화되니까 한 판을 넘지 않는다"는 옛 전제가 깨졌다
		const reused = seat(3, Role.CITIZEN, {
			alive: false,
			ready: true,
			armored: true,
			usesSpent: 1,
			noteText: "지난 판에 고른 문구",
			usedSkill: true,
			votedFor: 5,
			voteCount: 2,
			healed: true,
			attackedBy: [7],
			blocked: true,
			scooped: true,
		});

		assignRole(reused, 1, Role.POLICE);

		assert.equal(reused.index, 1);
		assert.equal(reused.role, Role.POLICE);
		assert.equal(reused.team, Team.CITIZEN);
		assert.equal(reused.alive, true);
		assert.equal(reused.ready, false);
		assert.equal(reused.armored, false);
		assert.equal(reused.usesSpent, 0);
		assert.equal(reused.noteText, "", "지난 판에 고른 문구가 새 판으로 넘어왔습니다");
		assert.equal(reused.usedSkill, false);
		assert.equal(reused.votedFor, 0);
		assert.equal(reused.voteCount, 0);
		assert.equal(reused.healed, false);
		assert.deepEqual(reused.attackedBy, []);
		assert.equal(reused.blocked, false);
		assert.equal(reused.scooped, false);
	});

	it("방탄은 지우는 것이 아니라 직업에서 다시 정한다", () => {
		// 위 테스트가 전부 false로만 끝나면 armored를 상수 false로 만들어도
		// 통과한다. 군인의 방탄은 판이 시작될 때 켜져 있어야 하는 값이다
		const spent = seat(1, Role.CITIZEN, { armored: false });
		assignRole(spent, 2, Role.SOLDIER);
		assert.equal(spent.armored, true, "군인이 방탄 없이 판을 시작했습니다");
	});
});
