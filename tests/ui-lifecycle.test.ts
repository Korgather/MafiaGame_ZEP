import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const UI = join(process.cwd(), "src", "ui");

describe("재사용 위젯 상태", () => {
	it("단계가 바뀔 때 낮/밤과 신분 클래스를 먼저 초기화한다", () => {
		// HUD는 판 내내, 보드는 관전자에게 단계마다 같은 위젯이 다시 쓰인다
		const hud = readFileSync(join(UI, "hud.html"), "utf8");
		const board = readFileSync(join(UI, "board.html"), "utf8");
		assert.match(hud, /panel\.classList\.remove\("night", "day", "vote"\)/);
		assert.match(hud, /role\.classList\.remove\("dead", "mafia", "citizen"\)/);
		assert.match(board, /panel\.classList\.remove\("night", "day", "vote", "help"\)/);
		assert.match(board, /panel\.classList\.remove\("watching"\)/);
	});

	it("메모는 서버로 보내지 않는다", () => {
		// 적는 곳은 채팅, 읽는 곳은 보드. 둘 다 부모 창(shared.js의 memoLoad/memoSave)에 둔다
		const shared = readFileSync(join(UI, "shared.js"), "utf8");
		assert.match(shared, /Parent\.store\.memo\[gameId\]/);
		const board = readFileSync(join(UI, "board.html"), "utf8");
		const chat = readFileSync(join(UI, "chat.html"), "utf8");
		assert.match(board, /memoLoad\(gameId\)/);
		assert.match(chat, /memoSave\(gameId, memo\)/);
		assert.doesNotMatch(board, /Parent\.send\(\{[^}]*memo/);
		// 메모를 처음 썼다는 사실(필드 없음)만 첫 판 지표로 간다. 내용은 어떤 send에도 실리지 않는다
		assert.doesNotMatch(chat.replace(`Parent.send({ type: "memo-used" })`, ""), /Parent\.send\(\{[^}]*memo/);
	});

	it("게스트의 빈 방 클릭 안내에서 확인하면 로그인 모달을 연다", () => {
		const lobby = readFileSync(join(UI, "lobby.html"), "utf8");
		const bridge = readFileSync(join(UI, "bridge.js"), "utf8");
		assert.match(lobby, /loginRequired\(data\)/);
		assert.match(lobby, /if \(!window\.confirm\(String\(data\.message\)\)\) return/);
		assert.match(lobby, /Parent\.openSignin\(\)/);
		assert.match(bridge, /function openSignin\(\)/);
		assert.match(bridge, /window\.parent\.postMessage/);
		assert.match(bridge, /type: "ScriptAction:OPEN_Signin_Modal"/);
		assert.match(bridge, /zepSystem: true/);
	});

	it("게스트 채팅은 입력창과 발언 조작을 모두 잠근다", () => {
		const chat = readFileSync(join(UI, "chat.html"), "utf8");
		assert.match(chat, /input\.disabled = inputDisabled/);
		assert.match(chat, /function submit\(text\) \{\s*if \(inputDisabled\) return false/);
		assert.match(chat, /function focusInput\(slash\) \{\s*if \(inputDisabled\) return/);
	});
});
