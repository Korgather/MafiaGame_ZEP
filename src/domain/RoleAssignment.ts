/**
 * 직업 배분. ZEP API에 의존하지 않는 순수 함수라 Node에서 그대로 테스트한다.
 *
 * 기존 createRole은 Array.from 콜백 안에서 i를 0..7과 비교하는 if 7개였다.
 * 배분표를 읽으려면 코드를 실행해봐야 했고, 6번 자리가 시민인 것도
 * "if (i === 7)" 앞에 아무것도 없다는 사실로만 알 수 있었다.
 */
import { Role } from "../types/Game.types.ts";
import {
	CITIZENS_PER_NIGHT_KILL,
	MIN_PLAIN_CITIZENS,
	MIN_SPECIAL_CITIZENS,
	SPECIAL_CITIZEN_RATIO,
} from "../constants/GameConfig.ts";
import { ChatChannel } from "./chat/ChatChannel.ts";
import { NightActionKind, roleDef } from "./Roles.ts";
import type { DeckSpec } from "./RuleSet.ts";

/** Fisher-Yates. rng를 주입할 수 있어 테스트에서 결정적으로 돌릴 수 있다 */
export function shuffle<T>(array: T[], rng: () => number = Math.random): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const tmp = array[i];
		array[i] = array[j];
		array[j] = tmp;
	}
	return array;
}

/**
 * 그 인원 판의 마피아 진영 인원. 표를 그대로 읽는다.
 *
 * 정원 밖(테스트가 정원 + 2까지 부른다)은 마지막 칸으로 자른다. 표를 벗어난
 * 인원에 답이 없는 것보다, 가장 큰 판과 같게 다루는 편이 안전하다.
 */
export function mafiaCount(deck: DeckSpec, playerCount: number): number {
	const last = deck.mafiaTeamSize.length - 1;
	return deck.mafiaTeamSize[playerCount > last ? last : playerCount];
}

/**
 * 이 직업이 밤 사망자를 한 구 더 만드는가.
 *
 * 마피아 밀담에서 죽이는 직업은 몇 명이 있든 상의해서 한 명만 친다.
 * 밀담 밖에서 죽이는 직업은 표적을 맞출 방법이 없어 시체가 따로 생긴다.
 * 그래서 판정 기준은 "공격하는가"가 아니라 "혼자 공격하는가"다.
 */
function killsIndependently(role: Role): boolean {
	const def = roleDef(role);
	return def.nightAction === NightActionKind.ATTACK && def.nightChat !== ChatChannel.MAFIA;
}

/**
 * 이 인원의 시민 진영이 감당할 수 있는 밤 사망자 수.
 * 마피아 밀담이 이미 하나를 쓰므로 2 이상이어야 단독 킬러가 들어갈 수 있다.
 */
function nightKillBudget(citizenSlots: number): number {
	return Math.max(1, Math.floor(citizenSlots / CITIZENS_PER_NIGHT_KILL));
}

/** 풀에서 중복 없이 n개를 뽑는다 */
function draw(pool: readonly Role[], count: number, rng: () => number): Role[] {
	if (count <= 0) return [];
	return shuffle(pool.slice(), rng).slice(0, count);
}

/** spec.minPlayers를 넘지 못하는 직업을 뺀다 */
function allowedAt(
	pool: readonly Role[],
	playerCount: number,
	floors: Partial<Record<Role, number>>
): Role[] {
	return pool.filter(role => {
		const floor = floors[role];
		return floor === undefined || playerCount >= floor;
	});
}

/**
 * 이미 뽑힌 직업과 같은 배타 그룹에 있는 후보를 뺀다.
 *
 * 그룹은 진영을 가로지를 수 있다. 마피아 자리를 먼저 확정하고 그 결과를
 * 시민 필터의 입력으로 넘기면 방향이 한쪽이라 순환이 생기지 않는다.
 */
function withoutRivals(
	pool: readonly Role[],
	taken: readonly Role[],
	groups: readonly (readonly Role[])[]
): Role[] {
	const banned: Role[] = [];
	for (const group of groups) {
		let hit = false;
		for (const role of group) if (taken.indexOf(role) >= 0) hit = true;
		if (!hit) continue;
		for (const role of group) if (taken.indexOf(role) < 0) banned.push(role);
	}
	return pool.filter(role => banned.indexOf(role) < 0);
}

/**
 * 풀에서 count개를 뽑되, 하나 뽑을 때마다 그 직업의 그룹 동료를 남은 풀에서 뺀다.
 *
 * 배타는 뽑는 순서에 의존한다. 먼저 섞고 앞에서부터 채우면 그룹 안에서
 * 어느 쪽이 남는지가 매 판 균등해진다 — 배열 순서대로 거르면 항상 앞의
 * 직업만 나온다.
 */
function drawExclusive(
	pool: readonly Role[],
	count: number,
	groups: readonly (readonly Role[])[],
	rng: () => number
): Role[] {
	if (count <= 0) return [];
	let remaining = shuffle(pool.slice(), rng);
	const picked: Role[] = [];
	while (picked.length < count && remaining.length > 0) {
		picked.push(remaining[0]);
		remaining = withoutRivals(remaining.slice(1), picked, groups);
	}
	return picked;
}

/**
 * 인원수에 맞는 직업 목록을 섞어서 돌려준다.
 *
 * 기존에는 8칸짜리 고정 배열(ROLE_DECK)의 앞에서부터 잘라 쓰고 넘치면 시민을
 * 채웠다. 직업 수가 자리 수와 같던 동안에는 표 하나로 충분했지만, 직업이
 * 12개가 되면 8칸에 무엇을 남길지 고르는 문제로 바뀐다. 고정 배열은 그 선택을
 * 표현할 수 없어서 새 직업이 영원히 나오지 않거나 매 판 똑같이 나온다.
 *
 * 그래서 "반드시 있어야 하는 직업 + 매 판 뽑는 풀"로 나눴다. 13번째 직업을
 * 추가할 때 이 파일에서 할 일은 풀 배열에 한 줄 넣는 것뿐이다.
 * (인원수별 구성표를 두는 길도 있었지만, 그쪽은 직업 하나를 추가할 때마다
 *  4~8명 다섯 줄을 전부 손봐야 해서 확장성에서 진다)
 */
export function buildRoleDeck(
	spec: DeckSpec,
	playerCount: number,
	rng: () => number = Math.random
): Role[] {
	const teamSize = mafiaCount(spec, playerCount);
	const citizenSlots = playerCount - teamSize;
	const budget = nightKillBudget(citizenSlots);

	/*
	 * 리드 선정.
	 *
	 * 단독 킬러가 리드가 되면 남은 자리는 전부 밀담 쪽에서 와야 한다 — 예산이
	 * 하나뿐이라서다. 그런데 그 자리를 채울 후보가 모자라면 자리는 채워지지 않고
	 * 아래 while이 시민으로 메운다. 덱 길이는 맞으므로 인원표가 깨진 것을
	 * 아무도 모른다. 그래서 예산뿐 아니라 "남은 자리를 채울 수 있는가"까지 본다.
	 *
	 * 그 판정은 후보마다 다르다. 밀담 후보 중 그 후보와 같은 배타 그룹에 있는
	 * 직업은 그 후보를 리드로 뽑는 순간 함께 빠지기 때문이다. 풀을 한 번 세는
	 * 것으로는 어느 후보가 몇 자리를 데려갈 수 있는지 구별할 수 없어서, 후보마다
	 * 자기 라이벌을 뺀 뒤 센다 — withoutRivals에 taken으로 그 후보 하나만 주면
	 * 그게 곧 그 후보를 리드로 뽑았을 때 남는 풀이다.
	 *
	 * 밀담 리드는 이 검사를 하지 않는다. 밀담 리드가 여는 풀이 가장 넓으므로
	 * 거기서 모자라면 리드를 바꿔도 나아지지 않고, 거르면 후보만 줄어든다.
	 *
	 * 조건을 인원이 아니라 예산과 후보 수로 적은 이유: 정원이나 인원표가 바뀌어도
	 * 따라온다. "7~9인"이라고 적으면 표가 바뀔 때마다 여기를 다시 고쳐야 한다.
	 */
	// 밀담 자리를 채울 수 있는 후보. 리드 검사와 아래 뽑기가 같은 배열을 본다
	const talkers = allowedAt(
		spec.mafiaPool.filter(role => !killsIndependently(role)),
		playerCount,
		spec.minPlayers
	);
	const leadPool = allowedAt(spec.leadPool, playerCount, spec.minPlayers);
	const leadCandidates = leadPool.filter(role => {
		// 남는 자리가 없거나 리드가 밀담에 앉으면 채우기 문제가 생기지 않는다
		if (teamSize < 2 || !killsIndependently(role)) return true;
		return (
			budget > 1 &&
			withoutRivals(talkers, [role], spec.exclusiveGroups).length >= teamSize - 1
		);
	});
	// 거른 뒤에 섞는다. 순서가 있는 배열의 앞을 집으면 후보 사이에 편향이 생긴다.
	// 후보가 전부 걸러지면 마피아로 대체한다 — 마피아 없는 판은 성립하지 않는다
	const lead = leadCandidates.length > 0 ? shuffle(leadCandidates, rng)[0] : Role.MAFIA;
	const roles: Role[] = [lead];

	/*
	 * 나머지 마피아 자리.
	 *
	 * 리드가 이미 밤 사망자 하나를 쓴다 — 밀담이든 단독이든 마찬가지다.
	 * 예산이 남지 않으면 따로 죽이지 않는 직업 중에서만 뽑는다.
	 *
	 * 리드가 이미 단독 킬러면 예산이 남아도 하나 더는 안 된다. 예산 2는
	 * "밀담 하나 + 단독 하나"를 뜻하지 "단독 둘"이 아니다.
	 *
	 * 예산이 없는 가지가 talkers 그 자체인 것은 위 리드 검사의 전제다. 같은
	 * 집합을 두 번 계산하면 언젠가 한쪽만 바뀌고, 그때 검사는 실제로 뽑을 수
	 * 없는 리드를 통과시킨다.
	 */
	const budgeted = budget > 1 && !killsIndependently(lead)
		? allowedAt(spec.mafiaPool, playerCount, spec.minPlayers)
		: talkers;
	const mafiaPool = withoutRivals(budgeted, roles, spec.exclusiveGroups);
	for (const role of drawExclusive(mafiaPool, teamSize - 1, spec.exclusiveGroups, rng)) {
		roles.push(role);
	}

	/*
	 * 시민 자리는 세 갈래로 나뉜다 — 정보(의사·경찰) / 판마다 뽑는 능력자 /
	 * 평범한 시민. 뒤의 둘은 각각 최소 한 자리를 갖고, 정보 직업은 남는
	 * 만큼만 들어간다.
	 *
	 * 우선순위가 이 순서인 이유는 자리가 모자랄 때 무엇이 먼저 깨지는지가
	 * 다르기 때문이다. 평범한 시민이 0명이면 전원이 "나는 무엇을 할 수 있다"를
	 * 말할 수 있는 판이 되어 마피아가 숨을 곳이 사라진다. 추첨 자리가 0이면
	 * 그 인원의 구성이 매 판 똑같아져 두 번째 판을 할 이유가 없어진다.
	 * 정보 직업은 하나만 있어도 토론이 근거를 갖는다.
	 *
	 * 실제로 잘리는 것은 시민 자리가 3개뿐인 4명 판 하나다(1+1+1). 5명
	 * 이상에서는 셋 다 온전히 들어가므로 아래 계산은 기존 결과를 그대로
	 * 재현한다 — 인원이 늘면 비율이 하한보다 먼저 조여든다.
	 */
	const reservedSlots = MIN_PLAIN_CITIZENS + MIN_SPECIAL_CITIZENS;
	const requiredSlots = Math.max(
		Math.min(spec.citizenRequired.length, citizenSlots - reservedSlots),
		0,
	);
	// 잘릴 때 의사·경찰 중 누가 남는지는 판마다 다르다. 앞에서부터 자르면
	// 4명 판에 경찰이 영원히 나오지 않는다.
	for (const role of draw(spec.citizenRequired, requiredSlots, rng)) roles.push(role);

	// 남은 시민 자리의 일부만 능력자로 채운다.
	//
	// floor가 아니라 round인 이유: 자리가 둘 남는 4명 판은 floor(1)=1로 같지만,
	// 예전 계산(자리 하나)에서는 floor(0.5)=0이라 능력자가 아예 못 들어왔다.
	// (7명도 floor(1.5)=1이라 5명과 구성이 같았다 — 절벽이 두 군데였다)
	// 인원 제한과 배타를 먼저 걸고, 그 결과의 길이를 추첨 수의 상한으로 쓴다.
	// 상한을 걸지 않으면 draw가 요청한 수를 못 채우고 부족분이 아래
	// while에서 평민으로 메워진다 — 덱 길이는 맞으므로 실패가 조용하다
	const citizenPool = withoutRivals(
		allowedAt(spec.citizenPool, playerCount, spec.minPlayers),
		roles,
		spec.exclusiveGroups
	);
	const plainSlots = citizenSlots - requiredSlots;
	const special = Math.min(
		Math.max(Math.round(plainSlots * SPECIAL_CITIZEN_RATIO), MIN_SPECIAL_CITIZENS),
		Math.max(plainSlots - MIN_PLAIN_CITIZENS, 0),
		citizenPool.length,
	);
	for (const role of drawExclusive(citizenPool, special, spec.exclusiveGroups, rng)) {
		roles.push(role);
	}

	while (roles.length < playerCount) roles.push(Role.CITIZEN);
	return shuffle(roles, rng);
}
