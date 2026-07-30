/**
 * 도메인 로직 테스트.
 *
 * src/domain/* 는 ZEP API를 전혀 참조하지 않으므로 Node에서 그대로 돌아간다.
 * 기존 구조에서는 이 규칙들이 전부 App.getPlayerByID 호출과 위젯 조작 사이에
 * 끼어 있어서 ZEP을 띄우지 않고는 한 줄도 검증할 수 없었다.
 *
 * 실행: npm test  (node --test, Node 22.18+ 의 타입 스트리핑 사용)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role, Team } from "../src/types/Game.types.ts";
import type { Seat } from "../src/types/Game.types.ts";
import { buildRoleDeck, mafiaCount } from "../src/domain/RoleAssignment.ts";
import {
	hasNightTurn,
	nightActionBlockedReason,
	NightOutcome,
	resolveNightCasualties,
	resolveNightSelect,
} from "../src/domain/NightResolution.ts";
import { expReward, levelFromExp, recordKey } from "../src/domain/Progression.ts";
import { tallyVotes, VoteOutcome } from "../src/domain/Vote.ts";
import { evaluateWinner } from "../src/domain/WinCondition.ts";
import { NightActionKind, ROLE_DEFS } from "../src/domain/Roles.ts";
import { cardForRole, GUIDE_CARDS, roleBook } from "../src/domain/Guide.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { newBucket, spend } from "../src/domain/RateLimit.ts";
import {
	MAX_PLAYERS,
	MIN_PLAIN_CITIZENS,
	MIN_PLAYERS,
	MIN_SPECIAL_CITIZENS,
	ROOM_COUNT,
} from "../src/constants/GameConfig.ts";
import { isInsideRoom, seatPosition } from "../src/constants/RoomLayout.ts";

function seat(index: number, role: Role, overrides: Partial<Seat> = {}): Seat {
	return {
		playerId: `p${index}`,
		index,
		name: `p${index}`,
		rank: "Lv.1",
		role,
		team: ROLE_DEFS[role].team,
		alive: true,
		ready: false,
		votedFor: 0,
		voteCount: 0,
		healed: false,
		attackedBy: [],
		armored: ROLE_DEFS[role].survivesFirstAttack === true,
		silenced: false,
		scooped: false,
		usedSkill: false,
		skillSpent: false,
		kickedBy: [],
		connected: true,
		...overrides,
	};
}

/** 그 진영의 좌석이 몇 개인가. 직업이 아니라 진영으로 세야 하는 곳이 많다 */
function teamCount(deck: Role[], team: Team): number {
	return deck.filter(role => ROLE_DEFS[role].team === team).length;
}

/**
 * 지원하는 모든 인원수. 4..8을 손으로 적어둔 루프가 여섯 개 있었고,
 * MAX_PLAYERS를 8에서 12로 올릴 때 그 여섯 개가 전부 8에 머물러 있었다 —
 * 늘어난 인원수는 아무 테스트도 통과하지 않은 채 배포됐을 수 있었다.
 */
const EVERY_COUNT: number[] = [];
for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) EVERY_COUNT.push(count);

/**
 * isInsideRoom이 참인 사각형. 좌석에서 사방으로 걸어 나가며 알아낸다.
 *
 * 상자를 만드는 값(ROOM_BOX_MARGIN, 좌석 경계)은 RoomLayout 안에 있고 밖으로
 * 내보내지 않는다 — 계산이 한 곳에만 있어야 하기 때문이다. 그래서 테스트도
 * 그 값을 다시 적지 않고 판정 함수에게 직접 물어본다. 상자 계산식을 바꿔도
 * 이 검사는 그대로 유효하다.
 *
 * 200칸에서 멈추는 것은 무한 루프 방지다. 판정이 늘 참이 되는 버그가 나면
 * 상자가 서로 겹쳐서 아래 검사가 잡는다.
 */
function roomBox(roomNum: number): {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
} {
	const seatOne = seatPosition(roomNum, 1);
	assert.ok(seatOne, `${roomNum}번 방에 1번 자리가 없다`);
	const { x, y } = seatOne;
	const reach = (stepX: number, stepY: number): number => {
		let steps = 0;
		while (steps < 200 && isInsideRoom(roomNum, x + stepX * (steps + 1), y + stepY * (steps + 1))) {
			steps++;
		}
		return steps;
	};
	return {
		minX: x - reach(-1, 0),
		maxX: x + reach(1, 0),
		minY: y - reach(0, -1),
		maxY: y + reach(0, 1),
	};
}

describe("RoleAssignment", () => {
	it("인원수만큼 직업을 배분한다", () => {
		for (const count of EVERY_COUNT) {
			assert.equal(buildRoleDeck(count).length, count);
		}
	});

	it("마피아 진영 인원이 mafiaCount와 정확히 같다", () => {
		// 직업이 아니라 진영으로 센다. 두 번째 마피아 자리는 건달이나 짐승인간이
		// 뽑힐 수 있고, 그래도 마피아 진영이 둘이라는 사실은 달라지지 않는다.
		//
		// "4명은 1, 8명은 2"만 보던 시절에는 두 숫자가 맞는지만 알 수 있었다.
		// 지금 보는 것은 배분이 mafiaCount의 약속을 지키는가다 — 풀이 인원을
		// 다 공급하지 못하면 draw가 조용히 덜 뽑고 남은 자리가 시민으로 채워져
		// 마피아가 약속보다 적은 판이 나온다. 정원을 더 올릴 때 여기서 걸린다.
		for (const count of EVERY_COUNT) {
			for (let trial = 0; trial < 50; trial++) {
				assert.equal(
					teamCount(buildRoleDeck(count), Team.MAFIA),
					mafiaCount(count),
					`${count}명`,
				);
			}
		}
	});

	it("인원이 늘수록 마피아가 줄지는 않는다", () => {
		// 비율에서 반올림하므로 문턱이 어디인지는 상수가 아니라 계산이 정한다.
		// 그 계산이 뒤집히지 않는다는 것만 못 박는다 — 4~5명 1, 6~9명 2, 10명부터 3.
		for (const count of EVERY_COUNT) {
			assert.ok(mafiaCount(count) >= mafiaCount(count - 1), `${count}명에서 줄었다`);
			assert.ok(mafiaCount(count) < count / 2, `${count}명에서 마피아가 절반 이상이다`);
		}
	});

	it("마피아 채팅을 여는 직업이 최소 한 명 들어간다", () => {
		// 이 테스트는 원래 "정확히 한 명"을 봤고, rng를 () => 0으로 고정해 두어
		// 통과했다. 실제로는 MAFIA_POOL에 Role.MAFIA가 다시 들어 있어서
		// (능력 없는 공범도 마피아 자리의 한 갈래다) 둘이 나오는 판이 있다.
		// 지켜야 하는 것은 "정확히 하나"가 아니라 "하나도 없는 판은 없다"다 —
		// 마피아 채팅을 여는 직업이 0이면 마피아가 밤에 아무것도 못 한다.
		for (const count of EVERY_COUNT) {
			for (let trial = 0; trial < 50; trial++) {
				const deck = buildRoleDeck(count);
				assert.ok(deck.includes(Role.MAFIA), `${count}명 [${deck.join(", ")}]`);
			}
		}
	});

	it("평범한 시민이 최소 한 명은 있다", () => {
		// 4명 판은 마피아·의사·경찰이 확정이라 남는 자리가 하나였고, 비율
		// 0.5의 반올림이 그 하나까지 능력자로 채워서 평범한 시민이 0명이었다.
		// 전원이 "나는 무엇을 할 수 있다"를 말할 수 있는 판에서는 마피아가
		// 숨을 곳이 없다 — 비율이 뜻한 것과 정반대의 결과였다.
		for (const count of EVERY_COUNT) {
			for (let trial = 0; trial < 50; trial++) {
				const deck = buildRoleDeck(count);
				assert.ok(
					deck.filter(role => role === Role.CITIZEN).length >= MIN_PLAIN_CITIZENS,
					`${count}명 [${deck.join(", ")}]`,
				);
			}
		}
	});

	it("능력이 있는 직업은 중복되지 않는다", () => {
		// 풀에서 중복 없이 뽑기 때문에 같은 능력이 두 벌 나오면 안 된다.
		// 의사가 둘이면 밤마다 두 명이 살아나고, 경찰이 둘이면 정보가 두 배다.
		//
		// 여럿일 수 있는 둘은 능력이 없는 직업이다 — 평범한 시민과, 밀담에서
		// 표적만 고르는 공범(Role.MAFIA). 이 둘은 인원이 늘어난 자리를 채우는
		// 몫이라 개수가 인원에 따라 변한다.
		const MAY_REPEAT: Role[] = [Role.CITIZEN, Role.MAFIA];
		for (const count of EVERY_COUNT) {
			for (let trial = 0; trial < 50; trial++) {
				const deck = buildRoleDeck(count).filter(role => !MAY_REPEAT.includes(role));
				assert.equal(new Set(deck).size, deck.length, `${count}명 [${deck.join(", ")}]`);
			}
		}
	});

	it("정보 직업은 최소 하나, 자리가 되면 의사와 경찰 둘 다 들어간다", () => {
		// 정보도 방어도 없는 판은 시민이 이길 방법이 없다.
		//
		// 4명 판만 예외다. 시민 자리가 셋뿐이라 평범한 시민 1 + 추첨 능력자 1을
		// 남기면 정보 직업 자리가 하나다. 셋 중 무엇을 포기할지의 문제이고,
		// 정보원이 하나여도 토론은 근거를 갖는 반면 나머지 둘이 비면 판의
		// 성격 자체가 사라지므로 여기를 줄였다. 어느 쪽이 남는지는 판마다 다르다.
		for (const count of EVERY_COUNT) {
			for (let trial = 0; trial < 50; trial++) {
				const deck = buildRoleDeck(count);
				const info = deck.filter(role => role === Role.DOCTOR || role === Role.POLICE);
				if (count - mafiaCount(count) - MIN_PLAIN_CITIZENS - MIN_SPECIAL_CITIZENS >= 2) {
					assert.ok(deck.includes(Role.DOCTOR), `${count}명에 의사가 없다`);
					assert.ok(deck.includes(Role.POLICE), `${count}명에 경찰이 없다`);
				} else {
					assert.equal(info.length, 1, `${count}명 [${deck.join(", ")}]`);
				}
			}
		}
	});

	it("정보 직업이 하나로 잘릴 때 남는 쪽이 고정되지 않는다", () => {
		// 앞에서부터 자르면(slice) 4명 판에 경찰이 영원히 나오지 않는다.
		// 직업을 12개 만들어 두고 최소 인원 판에서는 그중 하나가 사장되는 셈이다.
		const survivors = new Set<Role>();
		for (let trial = 0; trial < 200; trial++) {
			for (const role of buildRoleDeck(MIN_PLAYERS)) {
				if (role === Role.DOCTOR || role === Role.POLICE) survivors.add(role);
			}
		}
		assert.equal(survivors.size, 2, `${MIN_PLAYERS}명 판에 ${[...survivors].join(", ")}만 나온다`);
	});

	it("모든 참가 번호가 앉을 자리를 갖는다", () => {
		// 좌석 좌표는 8개짜리 배열이고 정원만 12로 올린 적이 있다. 그때
		// seatPosition이 null을 돌려주고 Stage.seatPlayer가 배치를 조용히
		// 건너뛰어서, 게임은 시작되는데 9번째부터는 방 밖에 서 있었다.
		for (let roomNum = 1; roomNum <= ROOM_COUNT; roomNum++) {
			for (let index = 1; index <= MAX_PLAYERS; index++) {
				assert.ok(seatPosition(roomNum, index), `${roomNum}번 방 ${index}번 자리가 없다`);
			}
		}
	});

	it("좌석은 서로 겹치지 않는다", () => {
		// 두 사람이 같은 타일에 서면 한 명은 상대에게 가려 보이지 않는다.
		const taken = new Set<string>();
		for (let index = 1; index <= MAX_PLAYERS; index++) {
			const at = seatPosition(1, index);
			const key = `${at?.x},${at?.y}`;
			assert.ok(!taken.has(key), `${index}번 자리가 ${key}에서 겹친다`);
			taken.add(key);
		}
	});

	it("모든 좌석은 자기 방 상자 안이다", () => {
		// 상자가 좌석보다 좁으면 앉아 있는 사람이 "방 밖"으로 판정되고
		// (Stage.inOwnRoomArea) 방 채팅 말풍선이 통째로 사라진다.
		// 오류도 로그도 남지 않아서, 눈으로 보기 전에는 아무도 모른다.
		for (let roomNum = 1; roomNum <= ROOM_COUNT; roomNum++) {
			for (let index = 1; index <= MAX_PLAYERS; index++) {
				const at = seatPosition(roomNum, index);
				assert.ok(at);
				assert.ok(
					isInsideRoom(roomNum, at.x, at.y),
					`${roomNum}번 방 ${index}번 자리(${at.x}, ${at.y})가 상자 밖이다`
				);
			}
		}
	});

	it("방 상자는 서로 겹치지 않는다", () => {
		/*
		 * 상자는 "이 좌표를 어느 방으로 볼 것인가"를 정한다(isInsideRoom).
		 * 두 방의 상자가 겹치면 그 칸에 선 사람은 두 방 어느 쪽의 방 채팅이든
		 * 말풍선으로 내보낼 수 있게 되고, 자기 방이 아닌 방 사람들 화면에
		 * 남의 토론이 뜬다.
		 *
		 * ROOM_BOX_MARGIN을 키우거나 ROOM_ORIGINS를 옮길 때 조용히 무너지는
		 * 조건이다 — 상자 계산이 파일 안에 갇혀 있어 컴파일러가 잡아주지 않는다.
		 */
		for (let a = 1; a <= ROOM_COUNT; a++) {
			for (let b = a + 1; b <= ROOM_COUNT; b++) {
				const one = roomBox(a);
				const other = roomBox(b);
				const overlaps =
					one.minX <= other.maxX &&
					other.minX <= one.maxX &&
					one.minY <= other.maxY &&
					other.minY <= one.maxY;
				assert.ok(!overlaps, `${a}번 방과 ${b}번 방의 상자가 겹친다`);
			}
		}
	});

	it("첫 밤만으로 게임이 끝나는 덱은 나오지 않는다", () => {
		// 6명 판에 마피아+짐승인간이 뽑히면 첫 밤에 둘이 죽어 2 대 2가 되고,
		// 아침에 곧바로 마피아 승이 선언됐다 — 토론도 투표도 한 번 없이.
		// 인원 구성 자체는 맞았기 때문에 위의 덱 테스트 다섯 개는 전부 통과했다.
		// 세어야 할 것은 마피아의 "인원"이 아니라 첫 밤이 지난 뒤의 진영 격차다.
		// 사망자만 세던 시절에는 스파이의 진영 전환이 이 그물을 그냥 통과했다.
		//
		// 판정은 evaluateWinner에 맡긴다. 승리 조건을 테스트가 다시 적어두면
		// 규칙이 바뀔 때 둘이 조용히 어긋난다.
		for (let count = MIN_PLAYERS; count <= MAX_PLAYERS + 2; count++) {
			for (let trial = 0; trial < 200; trial++) {
				const deck = buildRoleDeck(count);
				const seats = afterWorstFirstNight(deck);
				const alive = seats.filter(s => s.alive);
				assert.equal(
					evaluateWinner(seats),
					null,
					`${count}명 [${deck.join(", ")}] — 첫 밤 뒤 마피아 ${alive.filter(s => s.team === Team.MAFIA).length}`
						+ ` 대 시민 ${alive.filter(s => s.team === Team.CITIZEN).length}로 끝났다`,
				);
			}
		}
	});

	it("최소 인원 판도 매번 같은 구성이 아니다", () => {
		// floor(0.5) = 0이라 4명 판에는 능력자 자리가 없었고, 그래서 구성이
		// 마피아·의사·경찰·시민 하나로 굳어 있었다. 직업을 12개까지 늘려놓고
		// 최소 인원으로 노는 방은 그 중 넷만 영원히 보는 상태였다.
		const compositions = new Set<string>();
		for (let trial = 0; trial < 200; trial++) {
			compositions.add(buildRoleDeck(MIN_PLAYERS).slice().sort().join(","));
		}
		assert.ok(
			compositions.size > 1,
			`${MIN_PLAYERS}명 판의 구성이 [${[...compositions][0]}] 하나뿐이다`,
		);
	});
});

/**
 * 첫 밤이 최악으로 끝난 좌석들 — 의사가 아무도 못 살리고, 공격이 전부
 * 평범한 시민에게 꽂히고, 스파이는 첫 조사에서 하필 마피아를 짚은 상태.
 * 군인의 방탄이나 겹친 표적은 시민에게 유리한 경우이므로 하한을 보려면 빼고 센다.
 *
 * 이 함수는 원래 "밤에 시체가 몇 구 나오는가"만 셌다. 그런데 승패를 가르는
 * 값은 시체 수가 아니라 마진(시민 - 마피아)이고, 마진을 깎는 수단은 살인만이
 * 아니다 — 스파이가 마피아를 찾아내면 아무도 죽지 않은 채로 마진이 2 움직인다
 * (마피아 +1, 시민 -1). 그래서 4·6명 판은 사망자 0명으로 첫 아침에 끝날 수
 * 있었는데도 이 테스트는 통과했다. 시체를 세는 대신 직업마다 "첫 밤에 좌석을
 * 어떻게 바꾸는가"를 그대로 적용하면 새로운 수단이 생겨도 같은 자리에서 잡힌다.
 *
 * 시민 진영이 깎이는 쪽만 본다. 반대 가지(자경단원이 첫 밤에 마피아를
 * 맞혀 시민이 즉시 이기는 경우)는 여기서 모델링하지 않는다 — 지금은
 * needsPriorDay가 첫 밤 사격 자체를 막아 두 가지가 함께 사라지기 때문이다.
 * 첫 밤에 쏠 수 있는 시민 편 공격 직업이 새로 생기면 이 함수도 갈라져야 한다.
 */
function afterWorstFirstNight(deck: Role[]): Seat[] {
	const seats = deck.map((role, i) => seat(i + 1, role));

	// 밀담에 낀 공격자는 몇 명이든 상의해서 한 명만 치므로 통틀어 1,
	// 밀담 밖에서 죽이는 직업은 표적을 맞출 방법이 없으므로 각자 1이다.
	let mafiaChatKill = 0;
	let loneKills = 0;
	for (const actor of seats) {
		const def = ROLE_DEFS[actor.role];
		// 첫 밤에 못 쓰는 능력은 첫 밤 균형을 건드릴 수 없다
		if (def.needsPriorDay) continue;
		if (def.nightAction === NightActionKind.INSPECT_ROLE) {
			// 조사한 사람이 하필 마피아였던 경우. 진영이 통째로 옮겨간다
			actor.team = Team.MAFIA;
		} else if (def.nightAction === NightActionKind.ATTACK) {
			if (def.nightChat === ChatChannel.MAFIA) mafiaChatKill = 1;
			// 자책이 있는 직업이 시민을 쏘면 시전자까지 둘이 사라진다
			else loneKills += def.backfiresOnAlly ? 2 : 1;
		}
	}

	// 진영이 바뀐 뒤에 표적을 고른다 — 마피아가 된 스파이는 밤에 죽지 않는다
	let remaining = mafiaChatKill + loneKills;
	for (const victim of seats) {
		if (remaining === 0) break;
		if (victim.team !== Team.CITIZEN || victim.armored) continue;
		victim.alive = false;
		remaining--;
	}
	return seats;
}

describe("WinCondition", () => {
	it("마피아가 전멸하면 시민 승리", () => {
		const seats = [seat(1, Role.MAFIA, { alive: false }), seat(2, Role.CITIZEN)];
		assert.equal(evaluateWinner(seats), Team.CITIZEN);
	});

	it("마피아 수가 시민 이상이면 마피아 승리", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN)];
		assert.equal(evaluateWinner(seats), Team.MAFIA);
	});

	it("시민이 더 많으면 아직 끝나지 않았다", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN), seat(3, Role.DOCTOR)];
		assert.equal(evaluateWinner(seats), null);
	});

	it("마피아에 합류한 스파이는 마피아 진영으로 센다", () => {
		const spy = seat(3, Role.SPY, { team: Team.MAFIA });
		const seats = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN), spy];
		assert.equal(evaluateWinner(seats), Team.MAFIA);
	});
});

describe("Vote", () => {
	it("아무도 표를 받지 않으면 처형 없음", () => {
		const result = tallyVotes([seat(1, Role.CITIZEN), seat(2, Role.MAFIA)]);
		assert.equal(result.outcome, VoteOutcome.NO_VOTES);
		assert.equal(result.target, null);
	});

	it("동률이면 처형 없음", () => {
		const result = tallyVotes([
			seat(1, Role.CITIZEN, { voteCount: 2 }),
			seat(2, Role.MAFIA, { voteCount: 2 }),
		]);
		assert.equal(result.outcome, VoteOutcome.TIE);
	});

	it("최다 득표자를 처형한다", () => {
		const result = tallyVotes([
			seat(1, Role.CITIZEN, { voteCount: 1 }),
			seat(2, Role.MAFIA, { voteCount: 3 }),
		]);
		assert.equal(result.outcome, VoteOutcome.EXECUTE);
		assert.equal(result.target?.index, 2);
	});

	it("정치인은 최다 득표여도 처형되지 않는다", () => {
		const result = tallyVotes([
			seat(1, Role.POLITICIAN, { voteCount: 3 }),
			seat(2, Role.MAFIA, { voteCount: 1 }),
		]);
		assert.equal(result.outcome, VoteOutcome.IMMUNE);
		assert.equal(result.target?.index, 1);
	});

	it("죽은 사람의 표는 집계에 들어가지 않는다", () => {
		// 기존 voteResult는 죽은 플레이어의 votecount도 최대값 계산에 넣었다
		const result = tallyVotes([
			seat(1, Role.CITIZEN, { voteCount: 9, alive: false }),
			seat(2, Role.MAFIA, { voteCount: 1 }),
		]);
		assert.equal(result.outcome, VoteOutcome.EXECUTE);
		assert.equal(result.target?.index, 2);
		assert.equal(result.board.length, 1);
	});

	it("결과판은 득표 내림차순", () => {
		const result = tallyVotes([
			seat(1, Role.CITIZEN, { voteCount: 1 }),
			seat(2, Role.MAFIA, { voteCount: 3 }),
			seat(3, Role.DOCTOR, { voteCount: 2 }),
		]);
		assert.deepEqual(result.board, [
			[2, 3],
			[3, 2],
			[1, 1],
		]);
	});
});

describe("NightResolution", () => {
	it("의사가 치료하면 healed가 선다", () => {
		const doctor = seat(1, Role.DOCTOR);
		const target = seat(2, Role.CITIZEN);
		const result = resolveNightSelect(doctor, target);
		assert.equal(result?.consumed, true);
		assert.equal(target.healed, true);
	});

	it("공격은 공격자의 번호를 대상에 남긴다", () => {
		const mafia = seat(1, Role.MAFIA);
		const target = seat(2, Role.CITIZEN);
		const result = resolveNightSelect(mafia, target);
		assert.equal(result?.consumed, true);
		assert.deepEqual(target.attackedBy, [1]);
	});

	it("여러 공격자가 같은 사람을 노려도 각자 기록된다", () => {
		// 예전에는 이미 지목된 대상이면 "다른 마피아가 골랐다"며 되돌렸다.
		// 그 문구가 자경단원에게 마피아의 동선을 알려주기 때문에 규칙을 없앴다.
		const target = seat(3, Role.CITIZEN);
		resolveNightSelect(seat(1, Role.MAFIA), target);
		resolveNightSelect(seat(2, Role.BEAST), target);
		assert.deepEqual(target.attackedBy, [1, 2]);
	});

	it("마피아만 총성을 낸다", () => {
		// 공격자마다 소리가 나면 밤마다 소리 횟수로 공격자 수가 샌다
		assert.ok(resolveNightSelect(seat(1, Role.MAFIA), seat(2, Role.CITIZEN))?.roomSound);
		assert.equal(resolveNightSelect(seat(1, Role.VIGILANTE), seat(2, Role.CITIZEN))?.roomSound, undefined);
		assert.equal(resolveNightSelect(seat(1, Role.BEAST), seat(2, Role.CITIZEN))?.roomSound, undefined);
	});

	it("경찰은 짐승인간도 건달도 마피아로 보지 못한다", () => {
		// 짐승인간은 위장해서 안 잡히고, 건달은 애초에 시민이라 잡을 것이 없다.
		// 경찰이 "마피아입니다"를 듣는 상대는 진짜 마피아 진영뿐이어야 한다
		const police = seat(1, Role.POLICE);
		assert.match(resolveNightSelect(police, seat(2, Role.BEAST))!.label, /마피아가 아닙니다/);
		assert.match(resolveNightSelect(police, seat(3, Role.THUG))!.label, /마피아가 아닙니다/);
		assert.match(resolveNightSelect(police, seat(4, Role.MAFIA))!.label, /마피아입니다/);
	});

	it("건달이 협박하면 대상의 투표가 막힌다", () => {
		const target = seat(2, Role.CITIZEN);
		const result = resolveNightSelect(seat(1, Role.THUG), target);
		assert.equal(result?.consumed, true);
		assert.equal(target.silenced, true);
	});

	it("기자가 취재하면 대상에 표식이 남는다", () => {
		const target = seat(2, Role.MAFIA);
		const result = resolveNightSelect(seat(1, Role.REPORTER), target);
		assert.equal(result?.consumed, true);
		assert.equal(target.scooped, true);
	});

	it("스파이가 마피아를 찾으면 진영이 바뀌고 능력이 남는다", () => {
		const spy = seat(1, Role.SPY);
		const result = resolveNightSelect(spy, seat(2, Role.MAFIA));
		assert.equal(spy.team, Team.MAFIA);
		assert.equal(result?.consumed, false);
		assert.equal(result?.joinedMafia, true);
	});

	it("스파이가 시민을 조사하면 능력을 소모한다", () => {
		const spy = seat(1, Role.SPY);
		const result = resolveNightSelect(spy, seat(2, Role.DOCTOR));
		assert.equal(spy.team, Team.CITIZEN);
		assert.equal(result?.consumed, true);
	});

	it("능력이 없는 직업은 null", () => {
		assert.equal(resolveNightSelect(seat(1, Role.CITIZEN), seat(2, Role.MAFIA)), null);
		assert.equal(resolveNightSelect(seat(1, Role.SHAMAN), seat(2, Role.MAFIA)), null);
	});

	it("스파이가 건달을 찾아도 합류하지 않는다", () => {
		// 건달은 시민이다. 스파이가 합류할 마피아 진영이 아니다
		const spy = seat(1, Role.SPY);
		const result = resolveNightSelect(spy, seat(2, Role.THUG));
		assert.notEqual(result?.joinedMafia, true);
		assert.equal(spy.team, Team.CITIZEN);
		assert.equal(result?.consumed, true);
	});
});

describe("NightResolution - 정산", () => {
	it("치료받으면 살고 아니면 죽는다", () => {
		const casualties = resolveNightCasualties([
			seat(1, Role.CITIZEN, { attackedBy: [9], healed: true }),
			seat(2, Role.POLICE, { attackedBy: [9] }),
			seat(3, Role.DOCTOR),
		]);
		assert.equal(casualties.length, 2);
		assert.equal(casualties[0].outcome, NightOutcome.SAVED);
		assert.equal(casualties[1].outcome, NightOutcome.KILLED);
		assert.equal(casualties[1].seat.index, 2);
	});

	it("군인은 첫 공격을 버티고 방탄을 잃는다", () => {
		const soldier = seat(1, Role.SOLDIER, { attackedBy: [9] });
		assert.equal(soldier.armored, true, "군인은 방탄을 갖고 시작한다");

		const first = resolveNightCasualties([soldier]);
		assert.equal(first[0].outcome, NightOutcome.SHIELDED);
		assert.equal(soldier.armored, false, "방탄이 소모되지 않았다");

		// 다음 밤: 같은 좌석이 또 맞으면 이번엔 죽는다
		soldier.attackedBy = [9];
		assert.equal(resolveNightCasualties([soldier])[0].outcome, NightOutcome.KILLED);
	});

	it("치료가 방탄보다 먼저 쓰인다", () => {
		// 순서가 반대면 의사가 지킨 군인이 방탄을 헛되이 잃는다
		const soldier = seat(1, Role.SOLDIER, { attackedBy: [9], healed: true });
		assert.equal(resolveNightCasualties([soldier])[0].outcome, NightOutcome.SAVED);
		assert.equal(soldier.armored, true, "방탄이 헛되이 소모됐다");
	});

	/*
	 * 밤 진행률의 분모("3명 중 1명")는 밤이 시작될 때 정해져야 한다.
	 * 지목하는 순간 그 사람이 분모에서도 빠지면 1/3이 아니라 0/2가 되고,
	 * 막대가 앞으로 가는 대신 제자리이거나 뒤로 간다.
	 */
	it("차례 판정은 이번 밤에 이미 썼는지를 보지 않는다", () => {
		const doctor = seat(1, Role.DOCTOR, { usedSkill: true });
		assert.equal(hasNightTurn(doctor, 1), true);
		assert.equal(nightActionBlockedReason(doctor, 1), "이미 대상을 선택했습니다.");
	});

	it("1회성 능력자는 쓴 그 밤까지만 차례에 남는다", () => {
		// 자경단원은 쏘는 순간 usedSkill·skillSpent가 함께 켜진다. 둘을 구분하지
		// 않으면 쏜 사람이 그 밤의 분모에서 사라진다
		const tonight = seat(1, Role.VIGILANTE, { usedSkill: true, skillSpent: true });
		assert.equal(hasNightTurn(tonight, 1), true);
		assert.equal(nightActionBlockedReason(tonight, 1), "이미 대상을 선택했습니다.");

		// 다음 밤에는 usedSkill이 초기화되고(resetRound) 차례 자체가 없어진다
		const later = seat(1, Role.VIGILANTE, { skillSpent: true });
		assert.equal(hasNightTurn(later, 2), false);
		assert.match(nightActionBlockedReason(later, 2)!, /게임당 한 번/);
	});

	it("자경단원이 시민을 죽이면 자신도 죽는다", () => {
		const vigilante = seat(1, Role.VIGILANTE);
		const casualties = resolveNightCasualties([
			vigilante,
			seat(2, Role.CITIZEN, { attackedBy: [1] }),
		]);
		assert.equal(casualties.length, 2);
		assert.equal(casualties[0].outcome, NightOutcome.KILLED);
		assert.equal(casualties[1].seat, vigilante);
		assert.equal(casualties[1].outcome, NightOutcome.BACKFIRED);
	});

	it("자경단원이 마피아를 죽이면 멀쩡하다", () => {
		const casualties = resolveNightCasualties([
			seat(1, Role.VIGILANTE),
			seat(2, Role.MAFIA, { attackedBy: [1] }),
		]);
		assert.equal(casualties.length, 1);
		assert.equal(casualties[0].outcome, NightOutcome.KILLED);
	});

	it("쏜 시민이 살아나면 자책하지 않는다", () => {
		// 자책은 "쐈다"가 아니라 "죽였다"에 걸린다
		for (const rescued of [{ healed: true }, { armored: true }]) {
			const casualties = resolveNightCasualties([
				seat(1, Role.VIGILANTE),
				seat(2, Role.CITIZEN, { attackedBy: [1], ...rescued }),
			]);
			assert.equal(casualties.length, 1, JSON.stringify(rescued));
			assert.notEqual(casualties[0].outcome, NightOutcome.KILLED);
		}
	});

	it("마피아와 자경단원이 같은 시민을 노리면 자경단원도 죽는다", () => {
		// 누가 결정타였는지 가릴 방법이 없다. 방아쇠를 당긴 이상 책임진다.
		const vigilante = seat(1, Role.VIGILANTE);
		const casualties = resolveNightCasualties([
			vigilante,
			seat(2, Role.MAFIA),
			seat(3, Role.CITIZEN, { attackedBy: [2, 1] }),
		]);
		assert.equal(casualties.length, 2);
		assert.equal(casualties[1].seat, vigilante);
		assert.equal(casualties[1].outcome, NightOutcome.BACKFIRED);
	});

	it("이미 죽은 자경단원은 자책하지 않는다", () => {
		// 같은 밤에 마피아에게 당했다면 사망 처리가 두 번 나가면 안 된다
		const casualties = resolveNightCasualties([
			seat(1, Role.VIGILANTE, { attackedBy: [9] }),
			seat(2, Role.CITIZEN, { attackedBy: [1] }),
		]);
		assert.equal(casualties.length, 2);
		assert.equal(casualties.filter(c => c.seat.index === 1).length, 1);
	});

	it("공격받지 않은 사람은 목록에 없다", () => {
		assert.equal(resolveNightCasualties([seat(1, Role.CITIZEN), seat(2, Role.MAFIA)]).length, 0);
	});
});

describe("Progression", () => {
	it("마피아 승리 시 생존 마피아의 보상이 가장 크다", () => {
		const mafia = seat(1, Role.MAFIA);
		const citizen = seat(2, Role.CITIZEN);
		assert.equal(expReward(Team.MAFIA, mafia), 12);
		assert.equal(expReward(Team.MAFIA, citizen), 4);
		assert.equal(expReward(Team.CITIZEN, citizen), 5);
	});

	it("죽은 참가자는 보상이 줄어든다", () => {
		assert.equal(expReward(Team.MAFIA, seat(1, Role.MAFIA, { alive: false })), 8);
	});

	it("전적은 최종 진영으로 기록된다", () => {
		// 기존에는 직업이 스파이면 무조건 마피아 전적으로 기록됐다
		const spyStayed = seat(1, Role.SPY);
		const spyJoined = seat(2, Role.SPY, { team: Team.MAFIA });
		assert.equal(recordKey(Team.CITIZEN, spyStayed), "citizenWin");
		assert.equal(recordKey(Team.CITIZEN, spyJoined), "mafiaLose");
		assert.equal(recordKey(Team.MAFIA, spyJoined), "mafiaWin");
	});

	it("레벨 계산은 항상 끝나고 단조 증가한다", () => {
		assert.equal(levelFromExp(0), 0);
		assert.equal(levelFromExp(16), 2);
		assert.equal(levelFromExp(17), 3);
		assert.equal(levelFromExp(51), 4);

		let previous = 0;
		for (let exp = 0; exp <= 5000; exp += 7) {
			const level = levelFromExp(exp);
			assert.ok(level >= previous);
			previous = level;
		}
	});
});

/**
 * 직업 테이블 자체의 불변식.
 *
 * 직업 추가는 ROLE_DEFS에 항목 하나를 넣는 일이고, 타입은 필드가 다 찼는지까지만
 * 본다. "지목은 있는데 안내 문구가 없다" 같은 조합은 컴파일을 통과하고 밤에 빈
 * 화면으로 나타난다. 여기서 잡으면 항목을 쓰는 순간 잡힌다.
 */
describe("ROLE_DEFS", () => {
	const roles = Object.keys(ROLE_DEFS) as Role[];

	it("밤에 지목이 있는 직업은 안내 문구가 있다", () => {
		for (const role of roles) {
			const def = ROLE_DEFS[role];
			if (def.nightAction !== null) {
				assert.ok(def.nightPrompt, `${role}에 nightPrompt가 없다`);
			}
		}
	});

	it("지목이 없는 직업에는 안내 문구도 없다", () => {
		for (const role of roles) {
			const def = ROLE_DEFS[role];
			if (def.nightAction === null) {
				assert.equal(def.nightPrompt, null, `${role}은 지목이 없는데 nightPrompt가 있다`);
			}
		}
	});

	it("모든 직업에 카드에 쓸 이름·기호·설명이 있다", () => {
		for (const role of roles) {
			const def = ROLE_DEFS[role];
			assert.ok(def.displayName, `${role}에 displayName이 없다`);
			assert.ok(def.glyph, `${role}에 glyph가 없다`);
			assert.match(def.icon, /^art_role_[a-z]+\.png$/, `${role}에 프로덕션 아이콘이 없다`);
			assert.ok(def.ability, `${role}에 ability가 없다`);
			assert.ok(def.tip, `${role}에 tip이 없다`);
		}
	});

	it("한글 이름은 겹치지 않는다", () => {
		// 위젯은 이름만 보여준다. 겹치면 플레이어가 구분할 방법이 없다
		const names = roles.map(role => ROLE_DEFS[role].displayName);
		assert.equal(new Set(names).size, names.length);
	});

	it("배신하는 직업은 시민으로 시작해 마피아 채팅에 들어간다", () => {
		// defectsToMafia는 "찾아내면 그 편이 된다"는 규칙이다. 마피아로 시작하면
		// 옮길 진영이 없고, 옮긴 뒤 낄 채팅이 없으면 합류가 화면에 나타나지 않는다.
		// needsPriorDay가 필수인 이유는 밸런스다 — 첫 밤 배신은 승패 마진을 2
		// 깎아(마피아 +1, 시민 -1) 최소 인원 판을 첫 아침 전에 끝냈다.
		for (const role of roles) {
			const def = ROLE_DEFS[role];
			if (!def.defectsToMafia) continue;
			assert.equal(def.team, Team.CITIZEN, `${role}은 이미 마피아인데 배신한다`);
			assert.equal(def.nightChat, ChatChannel.MAFIA, `${role}이 합류해도 낄 채팅이 없다`);
			assert.ok(def.needsPriorDay, `${role}이 첫 밤에 진영을 옮길 수 있다`);
		}
	});

	it("마피아 팀인데 채팅이 없는 직업은 혼자라는 안내를 받는다", () => {
		// 안내가 없으면 "왜 나만 채팅창이 없지"로 끝난다
		for (const role of roles) {
			const def = ROLE_DEFS[role];
			if (def.team !== Team.MAFIA || def.nightChat !== null) continue;
			assert.match(def.nightNotice, /마피아 팀/, `${role}에 진영 안내가 없다`);
		}
	});
});

describe("Guide", () => {
	it("도감은 직업을 하나도 빠뜨리지 않는다", () => {
		// 직업을 추가하고 도감에 넣는 것을 잊는 자리를 막는다.
		// ROLE_DEFS를 훑는 구조라 지금은 잊을 수 없지만, 나중에 "숨김 직업"
		// 같은 이유로 걸러내기 시작하면 그때 이 테스트가 결정을 강제한다
		assert.equal(roleBook().length, Object.keys(ROLE_DEFS).length);
	});

	it("도감은 마피아 팀을 먼저 보여준다", () => {
		// 처음 보는 사람이 가장 먼저 알아야 하는 것은 "누가 적인가"다
		const teams = roleBook().map(card => card.team);
		const firstCitizen = teams.indexOf(Team.CITIZEN);
		assert.ok(firstCitizen > 0, "마피아 팀이 하나도 없거나 맨 앞이 아니다");
		assert.equal(teams.indexOf(Team.MAFIA, firstCitizen), -1, "진영이 섞여 있다");
	});

	it("모든 카드에 읽을 내용이 있다", () => {
		// 카드는 글리프·제목·본문·덧붙임 네 칸을 그린다. 비면 빈 칸이 보인다
		for (const card of roleBook().concat(GUIDE_CARDS.slice())) {
			assert.ok(card.glyph, `${card.title}에 glyph가 없다`);
			assert.match(card.image, /^art_(?:role|icon)_[a-z]+\.png$/, `${card.title}에 이미지가 없다`);
			assert.ok(card.title, "제목이 없는 카드가 있다");
			assert.ok(card.body, `${card.title}에 본문이 없다`);
			assert.ok(card.note, `${card.title}에 덧붙임이 없다`);
		}
	});

	it("직업 카드는 ROLE_DEFS의 글을 그대로 쓴다", () => {
		// 도감이 자기 사본을 들면 직업을 고칠 때 고칠 곳이 둘이 되고,
		// 그중 하나만 고쳐진 채로 남는다
		const card = cardForRole(Role.MAFIA);
		const def = ROLE_DEFS[Role.MAFIA];
		assert.equal(card.title, def.displayName);
		assert.equal(card.image, def.icon);
		assert.equal(card.body, def.ability);
		assert.equal(card.note, def.tip);
	});

	it("규칙 안내에는 진영이 없다", () => {
		// 진영 칩을 숨기는 신호가 null이다. 빈 문자열이면 칩이 빈 채로 뜬다
		for (const card of GUIDE_CARDS) {
			assert.equal(card.team, null, `${card.title}에 진영이 붙어 있다`);
		}
	});
});

/**
 * 도배 방지의 규칙 자체.
 *
 * 서비스 테스트(chat/gameflow)는 "관문이 배선되어 있는가"를 보고,
 * 여기서는 "규칙이 옳은가"를 본다. 둘을 나눠 두면 나중에 세 번째 관문을
 * 다는 사람이 규칙을 다시 검증할 필요가 없다.
 */
describe("RateLimit", () => {
	const LIMIT = { BURST: 3, REFILL_MS: 1000 };

	it("여유분만큼 몰아 쓸 수 있고 그 다음부터 막힌다", () => {
		const bucket = newBucket(LIMIT, 0);

		assert.deepEqual(
			[spend(bucket, LIMIT, 0), spend(bucket, LIMIT, 0), spend(bucket, LIMIT, 0)],
			[true, true, true]
		);
		assert.equal(spend(bucket, LIMIT, 0), false);
	});

	it("REFILL_MS보다 짧은 간격도 쌓여서 언젠가 한 번이 된다", () => {
		// 소수점을 버리면 REFILL_MS 미만으로 두들기는 사람은 영영 안 풀린다.
		// 그건 브레이크가 아니라 음소거다.
		const bucket = newBucket(LIMIT, 0);
		for (let i = 0; i < LIMIT.BURST; i++) spend(bucket, LIMIT, 0);

		for (let ms = 100; ms < 1000; ms += 100) {
			assert.equal(spend(bucket, LIMIT, ms), false, `${ms}ms에 벌써 풀렸다`);
		}
		assert.equal(spend(bucket, LIMIT, 1000), true);
	});

	it("오래 쉬어도 여유분이 BURST를 넘지 않는다", () => {
		// 상한이 없으면 한 시간 조용히 있다가 수백 줄을 한꺼번에 쏟을 수 있다.
		const bucket = newBucket(LIMIT, 0);

		for (let i = 0; i < LIMIT.BURST; i++) {
			assert.equal(spend(bucket, LIMIT, 3_600_000), true);
		}
		assert.equal(spend(bucket, LIMIT, 3_600_000), false);
	});
});
