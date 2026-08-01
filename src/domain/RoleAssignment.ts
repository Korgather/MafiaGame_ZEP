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
	// 짐승인간(STALK)은 접선하면 밀담에 앉지만 표적은 끝까지 혼자 고른다.
	// 기준이 "밀담에 앉는가"가 아니라 "누구를 죽일지 혼자 정하는가"이므로
	// 여기 걸린다 — 빠지면 짐승인간이 예산 밖의 공범으로 세어져 한 판에
	// 둘이 서고, 시체가 매 밤 셋씩 나온다.
	if (def.nightAction === NightActionKind.STALK) return true;
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
 * 마피아 자리가 뽑기로 다 차지 않았을 때 넣을 메움패 하나.
 *
 * 첫 선택은 Role.MAFIA다. 아무 능력 없는 공범이라 능력이 겹치지 않고, 밀담에
 * 앉으므로 몇 장을 더 넣어도 밤 사망자가 늘지 않는다 — 밀담은 몇 명이 앉든
 * 상의해서 한 명만 친다. 단독 킬러를 복제했다면 시체가 하나 더 생겨 예산
 * 계산이 통째로 어긋난다. 리드 후보가 전부 걸러졌을 때 Role.MAFIA로 대체하는
 * 것과 같은 판단이고, 같은 이유다.
 *
 * 다만 메움패도 규칙을 지켜야 한다. 인원 하한과 배타를 실제로 통과하는지
 * allowedAt·withoutRivals에 그대로 물어보고, 걸리면 이미 자리를 받은 밀담
 * 직업을 한 번 더 쓴다. 그쪽은 배타를 새로 어길 수 없다 — 이미 덱에 있으므로
 * 그 직업의 그룹 동료는 이 시점에 전부 빠져 있다(withoutRivals는 taken에 든
 * 직업을 막지 않는다).
 *
 * 인원 하한은 한 경우에 예외다. 재사용하는 직업은 대개 뽑힐 때 allowedAt을
 * 통과했지만, 하한이 리드 후보를 전부 걷어내 아래 `lead = Role.MAFIA` 대체가
 * 도는 판에서는 그 마피아가 allowedAt을 거친 적이 없다. 그 판에서 이 가지는
 * 하한을 어긴 마피아를 한 장 더 쓴다. 하한을 깬 것은 메움이 아니라 리드
 * 대체이므로(마피아 없는 판은 성립하지 않는다는 판단이 하한보다 앞선다)
 * 여기서 새로 잃는 것은 없다 — 다만 "이미 통과했다"고 말할 수는 없다.
 *
 * 둘 다 없으면 그래도 Role.MAFIA를 넣는다. 자리가 빈 덱은 인원표를 어기고,
 * 그건 배타 하나를 어기는 것보다 나쁘다. 이 가지는 리드가 밀담도 단독 킬도
 * 아닌 특수한 스펙에서만 닿는다: 리드가 단독 킬러면 리드 검사가 밀담 후보가
 * 남아 있음을 이미 확인했으므로 뽑기가 최소 하나는 밀담 직업을 가져오고,
 * 단독 킬러가 아니면 리드 자신이 밀담 직업이다.
 */
function mafiaFiller(spec: DeckSpec, playerCount: number, taken: readonly Role[]): Role {
	const plain = withoutRivals(
		allowedAt([Role.MAFIA], playerCount, spec.minPlayers),
		taken,
		spec.exclusiveGroups
	);
	if (plain.length > 0) return Role.MAFIA;
	for (const role of taken) if (!killsIndependently(role)) return role;
	return Role.MAFIA;
}

/**
 * 인원수에 맞는 직업 목록을 섞어서 돌려준다.
 *
 * 기존에는 8칸짜리 고정 배열(ROLE_DECK)의 앞에서부터 잘라 쓰고 넘치면 시민을
 * 채웠다. 직업 수가 자리 수와 같던 동안에는 표 하나로 충분했지만, 직업이
 * 자리보다 많아지면 8칸에 무엇을 남길지 고르는 문제로 바뀐다. 고정 배열은 그
 * 선택을 표현할 수 없어서 새 직업이 영원히 나오지 않거나 매 판 똑같이 나온다.
 *
 * 그래서 "반드시 있어야 하는 직업 + 매 판 뽑는 풀"로 나눴다. 직업을 하나 더
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
	 * 하나뿐이라서다. 그래서 예산뿐 아니라 그 후보를 리드로 뽑았을 때 밀담
	 * 후보가 몇 명 남는지까지 보고, 남는 자리보다 적으면 리드에서 뺀다.
	 *
	 * 그 판정은 후보마다 다르다. 밀담 후보 중 그 후보와 같은 배타 그룹에 있는
	 * 직업은 그 후보를 리드로 뽑는 순간 함께 빠지기 때문이다. 풀을 한 번 세는
	 * 것으로는 어느 후보가 몇 자리를 데려갈 수 있는지 구별할 수 없어서, 후보마다
	 * 자기 라이벌을 뺀 뒤 센다 — withoutRivals에 taken으로 그 후보 하나만 주면
	 * 그게 곧 그 후보를 리드로 뽑았을 때 남는 풀이다.
	 *
	 * 이 검사는 자리가 다 찬다는 보장이 아니다. 크기는 필요조건일 뿐이고 뽑기는
	 * 진행하면서 좁아진다(아래 drawExclusive) — 예컨대 살아남은 후보끼리 서로
	 * 배타면 크기는 충분한데 실제로는 하나밖에 못 뽑는다. 검사 뒤에 좁아지는
	 * 뽑기가 있는 한 사전 검사는 원리상 완전해질 수 없으므로, 여기서 하는 일은
	 * "자리를 못 채울 것이 뻔한 후보를 리드에서 빼는 것"까지다. 자리 수 보장은
	 * 뽑기가 끝난 뒤의 메움 단계가 진다.
	 *
	 * 밀담 리드는 이 검사를 하지 않는다. 밀담 리드가 여는 풀이 가장 넓으므로
	 * 거기서 모자라면 리드를 바꿔도 나아지지 않고, 거르면 후보만 줄어든다.
	 * (가장 넓다는 것도 충분하다는 뜻은 아니다 — 그 경우 역시 메움 단계가 받는다)
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
	 * 마피아 자리 수를 여기서 못 박는다.
	 *
	 * 4인 이상이면 이 지점을 지날 때 roles.length는 언제나 teamSize다 — 스펙이
	 * 무엇이든, 시드가 무엇이든. 위 리드 검사는 이것을 보장할 수 없다. 크기 검사
	 * 뒤에 좁아지는 뽑기가 있는 한 검사는 필요조건까지만 말하고, 실제로 몇 개가
	 * 나오는지는 뽑아 봐야 안다.
	 *
	 * 4인 하한을 다는 이유는 인원표가 3인 이하에 0을 적기 때문이다. teamSize가
	 * 0이어도 roles는 이미 리드 하나를 들고 있어서 여기서 teamSize를 넘고, 아래
	 * 메움은 넘친 것을 줄이지 않는다. 그 아래 인원은 GameFlow의
	 * `ready < room.ruleSet.minPlayers`가 막으므로 실제 판에서는 닿지 않는다.
	 *
	 * 메우지 않으면 모자란 자리는 함수 끝의 while이 시민으로 가져간다. 덱
	 * 길이는 맞으므로 인원표가 깨진 것을 아무도 모른다 — 이 결함이 두 번
	 * 반복된 이유가 그 조용함이다.
	 */
	if (roles.length < teamSize) {
		const filler = mafiaFiller(spec, playerCount, roles);
		while (roles.length < teamSize) roles.push(filler);
	}

	/*
	 * 시민 자리는 세 갈래로 나뉜다 — 정보(의사·경찰) / 판마다 뽑는 능력자 /
	 * 평범한 시민. 뒤의 둘은 각각 최소 한 자리를 갖고, 정보 직업은 남는
	 * 만큼만 들어간다.
	 *
	 * 우선순위가 이 순서인 이유는 자리가 모자랄 때 무엇이 먼저 깨지는지가
	 * 다르기 때문이다. 평범한 시민이 0명이면 전원이 "나는 무슨 직업이다"를
	 * 말할 수 있는 판이 되어 마피아가 숨을 곳이 사라진다 — 마피아가 대는
	 * 거짓 직업은 반드시 진짜 그 직업과 부딪힌다. 시민이 익명 쪽지를 갖게
	 * 된 뒤에도 그대로다: 쪽지는 평민이면 누구나 똑같이 들고 있어서 누구를
	 * 가리키지도 못하고, 점쟁이의 점괘도 그것을 능력으로 세지 않는다
	 * (Roles.ts의 hasJobAbility). 추첨 자리가 0이면
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
	//
	// 상한이 막는 것은 "풀에 있는 것보다 많이 요청하기" 하나다. 뽑는 도중에
	// 그룹 동료가 빠져 요청보다 적게 돌아오는 것은 여전히 막지 못한다(그쪽은
	// drawExclusive의 성질이라 앞에서 셀 수 없다). 마피아 자리와 달리 여기서
	// 메우지 않는 이유가 그것이다 — 능력자가 한 명 적고 평민이 한 명 많은 덱은
	// 인원표를 어기지 않는다. 평민은 원래 자리 수가 정해져 있지 않다.
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
