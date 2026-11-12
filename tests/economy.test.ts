/** 코인·상점(domain/Economy.ts) 규칙. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role, Team } from "../src/types/Game.types.ts";
import {
	coinReward,
	dayOf,
	equippedName,
	PLAY_COIN,
	useItem,
	WIN_COIN,
} from "../src/domain/Economy.ts";
import type { Wallet } from "../src/domain/Economy.ts";
import { seat } from "./helpers/seat.ts";

describe("코인", () => {
	it("져도 참가 코인을 받고 이긴 진영은 더 받는다", () => {
		assert.equal(coinReward(Team.CITIZEN, seat(1, Role.MAFIA)), PLAY_COIN);
		assert.equal(coinReward(Team.CITIZEN, seat(2, Role.CITIZEN)), PLAY_COIN + WIN_COIN);
	});

	it("날짜는 한국 자정에 넘어간다", () => {
		const kstMidnight = Date.UTC(2026, 10, 11, 15, 0, 0);
		assert.equal(dayOf(kstMidnight) - dayOf(kstMidnight - 1), 1);
		assert.equal(dayOf(kstMidnight), dayOf(kstMidnight + 1000));
	});
});

describe("상점", () => {
	it("사면 코인이 줄고 바로 장착된다", () => {
		const wallet: Wallet = { coin: 120 };
		assert.equal(useItem(wallet, "t_detective"), true);
		assert.deepEqual(wallet, { coin: 20, owned: ["t_detective"], title: "t_detective" });
		assert.equal(equippedName(wallet, "title"), "명탐정");
	});

	it("돈이 모자라거나 없는 물건이면 아무것도 바뀌지 않는다", () => {
		const wallet: Wallet = { coin: 20 };
		assert.equal(useItem(wallet, "t_detective"), false);
		assert.equal(useItem(wallet, "nope"), false);
		assert.deepEqual(wallet, { coin: 20 });
	});

	it("가진 물건은 돈 없이 장착을 켜고 끈다", () => {
		const wallet: Wallet = { coin: 0, owned: ["w_watch"] };
		useItem(wallet, "w_watch");
		assert.equal(equippedName(wallet, "lastWord"), "끝까지 지켜보겠습니다.");
		useItem(wallet, "w_watch");
		assert.equal(equippedName(wallet, "lastWord"), "");
		assert.equal(wallet.coin, 0);
	});
});
