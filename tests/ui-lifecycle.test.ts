import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const UI = join(process.cwd(), "src", "ui");

describe("재사용 위젯 상태", () => {
	it("관전 단계가 바뀔 때 낮/밤과 신분 클래스를 먼저 초기화한다", () => {
		const phase = readFileSync(join(UI, "phase.html"), "utf8");
		assert.match(phase, /panel\.classList\.remove\("night", "day"\)/);
		assert.match(phase, /role\.classList\.remove\("dead", "mafia", "citizen"\)/);
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
