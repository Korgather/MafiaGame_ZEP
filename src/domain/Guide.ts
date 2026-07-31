/**
 * 처음 온 사람에게 보여줄 것들.
 *
 * 이 파일이 하는 일은 둘이다.
 *   1. 게임 규칙을 3장으로 요약한 첫 안내 카드 (GUIDE_CARDS)
 *   2. ROLE_DEFS의 모든 직업을 진영별로 묶은 도감 (roleBook)
 *
 * 도감이 여기 있고 Roles.ts에 없는 이유는 방향 때문이다. Roles.ts는 게임이
 * 돌아가는 데 필요한 정의고, 여기는 그 정의를 사람이 읽을 화면 모양으로
 * 옮기는 자리다. 반대로 두면 Roles.ts가 위젯 DTO(CardView)를 알게 된다.
 *
 * 도감의 내용을 따로 쓰지 않는다는 점이 중요하다. 전부 ROLE_DEFS의
 * displayName·glyph·ability·tip을 그대로 읽는다. 직업을 하나 추가하면
 * 도감에 자동으로 한 장이 늘고, 반대로 도감용 설명을 따로 관리하다
 * 실제 능력과 어긋나는 일이 생기지 않는다. 설명이 곧 명세다.
 */
import { Role, Team } from "../types/Game.types.ts";
import type { CardView } from "../types/Widget.types.ts";
import { ROLE_DEFS } from "./Roles.ts";

/**
 * 첫 안내 3장.
 *
 * 3장인 이유는 처음 온 사람이 알아야 할 것이 정확히 셋이기 때문이다 —
 * 무엇을 이기려 하는가 / 시간이 어떻게 흐르는가 / 화면 어디를 보는가.
 * 이보다 늘리면 읽지 않고 넘기고, 줄이면 첫 밤에 무엇을 눌러야 할지 모른다.
 *
 * 초 단위 숫자를 한 글자도 적지 않았다. 룰셋의 타이밍을 조정하는 순간 이 문장이
 * 조용히 거짓말이 되는데, 화면마다 이미 남은 시간을 링으로 보여주고 있어서
 * 여기 적어도 얻는 것이 없다. 안내는 규칙만 말하고 수치는 화면이 말한다.
 */
export const GUIDE_CARDS: readonly CardView[] = [
	{
		glyph: "🎭",
		title: "누가 마피아일까",
		team: null,
		body: "참가자 중 몇 명은 몰래 마피아입니다. 시민은 마피아를 모두 찾아내면 이기고, 마피아는 자기 수가 시민 수와 같아지면 이깁니다.",
		note: "자기 직업은 시작할 때 나에게만 보입니다. 남의 직업은 아무도 모릅니다.",
	},
	{
		glyph: "🌙",
		title: "밤과 낮이 반복됩니다",
		team: null,
		body: "밤에는 능력이 있는 직업만 조용히 한 명을 지목합니다. 아침이 되면 밤에 일어난 일이 공개되고, 모두 모여 토론한 뒤 한 명을 투표로 처형합니다.",
		note: "능력이 없는 직업은 밤에 할 일이 없습니다. 기다렸다가 낮에 토론으로 싸웁니다.",
	},
	{
		glyph: "👀",
		title: "화면 보는 법",
		team: null,
		body: "가운데 화면이 지금 무엇을 할 차례인지 알려줍니다. 사람 타일을 누르면 지목·투표가 되고, 오른쪽 위 링은 남은 시간입니다.",
		note: "채팅창은 늘 떠 있습니다. 밤에는 같은 편끼리만 보이는 탭이 따로 생깁니다.",
	},
];

/** 직업 하나를 카드 한 장으로 (도감·직업 공개가 같이 쓴다) */
export function cardForRole(role: Role): CardView {
	const def = ROLE_DEFS[role];
	return {
		glyph: def.glyph,
		title: def.displayName,
		team: def.team,
		body: def.ability,
		note: def.tip,
	};
}

/**
 * 직업 도감. 마피아 팀이 먼저 오고 시민 팀이 뒤따른다.
 *
 * 마피아를 앞에 두는 이유는 처음 보는 사람이 가장 먼저 궁금해하는 것이
 * "적이 무엇을 할 수 있는가"이기 때문이다. 시민 직업이 열 장이라, 그것을 다
 * 넘긴 뒤에야 마피아가 나오면 정작 알아야 할 것을 못 보고 닫는다.
 *
 * .sort()를 쓰지 않고 두 번 훑는다. ZEP 런타임(Jint)의 정렬 안정성을 기대할
 * 수 없어서, 같은 팀 안의 순서가 판마다 달라질 수 있다. 두 번 훑으면
 * ROLE_DEFS의 선언 순서가 그대로 팀 안의 순서가 된다 — 도감을 두 번 열면
 * 같은 자리에 같은 직업이 있다.
 *
 * 스파이가 시민 쪽에 묶이는 것은 특례가 아니라 def.team을 그대로 따른 결과다.
 * 실제로 시민으로 시작하고, 마피아를 찾으면 넘어간다는 사실은 스파이의
 * tip이 설명한다.
 */
export function roleBook(): CardView[] {
	const keys = Object.keys(ROLE_DEFS) as Role[];
	const cards: CardView[] = [];
	for (let i = 0; i < keys.length; i++) {
		if (ROLE_DEFS[keys[i]].team === Team.MAFIA) cards.push(cardForRole(keys[i]));
	}
	for (let i = 0; i < keys.length; i++) {
		if (ROLE_DEFS[keys[i]].team !== Team.MAFIA) cards.push(cardForRole(keys[i]));
	}
	return cards;
}
