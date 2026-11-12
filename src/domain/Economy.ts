/**
 * 코인과 상점. 순수 함수.
 *
 * 마피아42에서 가져온 것은 "판을 하면 재화가 쌓이고, 그 재화는 꾸밈에만
 * 쓰인다"는 뼈대다. 능력치 카드·뽑기·나쁜 평판은 가져오지 않았다 — 이 게임은
 * 방에 모인 사람이 같은 조건으로 추리하는 것이 전부라, 돈으로 판이 기울면
 * 추리가 성립하지 않는다. 그래서 여기 있는 물건은 전부 판의 결과와 무관하다.
 *
 * 수급: 참가 + 승리 + 오늘의 첫 판 + 받은 칭찬.
 * 사용처: 칭호(등급 줄 뒤에 붙는다) · 유언(죽을 때 채팅에 한 줄 흐른다).
 */
import type { Seat, Team } from "../types/Game.types.ts";

/** 끝까지 한 판을 마치면 받는다. 져도 받는다 — 지는 판을 버리고 나갈 이유를 줄인다 */
export const PLAY_COIN = 10;
/** 이긴 진영에게 더 준다 */
export const WIN_COIN = 10;
/** 하루(KST)의 첫 판에 더 준다 */
export const FIRST_GAME_BONUS = 20;
/** 종료 화면에서 칭찬을 받으면 받는다. 주는 쪽은 받지 않는다 */
export const PRAISE_COIN = 5;

export function coinReward(winner: Team, seat: Seat): number {
	return PLAY_COIN + (seat.team === winner ? WIN_COIN : 0);
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC ms → 한국 날짜의 일 번호. 자정(KST)에 넘어간다 */
export function dayOf(utcMs: number): number {
	return Math.floor((utcMs + KST_OFFSET_MS) / DAY_MS);
}

export type ItemKind = "title" | "lastWord";

export interface ShopItem {
	/** 저장소에 남는 값이다. 한번 팔린 id는 바꾸지 않는다 */
	id: string;
	kind: ItemKind;
	name: string;
	price: number;
}

/**
 * 진열대.
 *
 * 유언이 정해진 문구뿐인 것은 의도다. 직접 쓰게 하면 죽은 사람이 그 한 줄로
 * 자기 직업이나 조사 결과를 말할 수 있다. 누구나 살 수 있는 문구는 아무것도
 * 증명하지 못한다.
 */
export const SHOP: readonly ShopItem[] = [
	{ id: "t_chatter", kind: "title", name: "수다쟁이", price: 50 },
	{ id: "t_detective", kind: "title", name: "명탐정", price: 100 },
	{ id: "t_poker", kind: "title", name: "포커페이스", price: 100 },
	{ id: "t_survivor", kind: "title", name: "생존왕", price: 200 },
	{ id: "t_night", kind: "title", name: "밤의 지배자", price: 300 },
	{ id: "t_legend", kind: "title", name: "전설", price: 1000 },
	{ id: "w_watch", kind: "lastWord", name: "끝까지 지켜보겠습니다.", price: 30 },
	{ id: "w_please", kind: "lastWord", name: "제 몫까지 이겨 주세요.", price: 30 },
	{ id: "w_unfair", kind: "lastWord", name: "억울합니다. 정말로요.", price: 60 },
	{ id: "w_among", kind: "lastWord", name: "범인은 이 안에 있습니다.", price: 60 },
	{ id: "w_regret", kind: "lastWord", name: "후회하게 될 겁니다.", price: 100 },
];

/** 저장소(PlayerStorage) 중 상점이 만지는 부분 */
export interface Wallet {
	coin?: number;
	owned?: string[];
	title?: string;
	lastWord?: string;
}

/**
 * 물건을 누른다 — 없으면 사서 바로 장착하고, 있으면 장착을 켜거나 끈다.
 * 돈이 모자라거나 없는 물건이면 아무것도 바꾸지 않고 false를 돌려준다.
 */
export function useItem(wallet: Wallet, id: string): boolean {
	const item = SHOP.find(candidate => candidate.id === id);
	if (!item) return false;
	const owned = wallet.owned || [];
	if (owned.indexOf(id) < 0) {
		const coin = wallet.coin || 0;
		if (coin < item.price) return false;
		wallet.coin = coin - item.price;
		wallet.owned = owned.concat(id);
		wallet[item.kind] = id;
		return true;
	}
	wallet[item.kind] = wallet[item.kind] === id ? undefined : id;
	return true;
}

/** 장착한 물건의 문구. 없거나 진열대에서 빠진 id면 빈 문자열 */
export function equippedName(wallet: Wallet, kind: ItemKind): string {
	const id = wallet[kind];
	const item = SHOP.find(candidate => candidate.id === id && candidate.kind === kind);
	return item ? item.name : "";
}
