import pluginJs from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/** ZEP(Jint) 런타임에서 실행되는 코드. 아래 제약이 전부 여기에만 적용된다 */
const ZEP_RUNTIME = ["src/**/*.ts", "main.ts"];

/** Node에서 실행되는 테스트. 문법 규칙은 같지만 ZEP 런타임 제약은 무관하다 */
const NODE_TESTS = ["tests/**/*.ts"];

const ALL = [...ZEP_RUNTIME, ...NODE_TESTS];

export default [
	{ ignores: ["res/**/*", "node_modules/**/*", "tools/**/*"] },
	{ files: ALL, ...pluginJs.configs.recommended },
	...tseslint.configs.recommended.map(config => ({ ...config, files: ALL })),
	{
		files: ALL,
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: { ecmaVersion: "latest", sourceType: "module" },
			globals: { ...globals.node },
		},
		plugins: { "@typescript-eslint": tseslint.plugin },
		rules: {
			"no-empty": ["error", { allowEmptyCatch: true }],
			"@typescript-eslint/no-explicit-any": "off",

			// catch 바인딩은 문법상 필요할 뿐 죽은 변수가 아니다.
			// (선택적 catch 바인딩은 Jint 지원 여부가 불확실해 쓰지 않는다)
			"@typescript-eslint/no-unused-vars": ["error", { caughtErrors: "none" }],
		},
	},
	{
		files: ZEP_RUNTIME,
		rules: {
			// ZEP API는 C# 메서드다. Jint는 인자 "개수"로 오버로드를 고르므로
			// 자리를 채우려 넣은 undefined는 생략이 아니라 잘못된 인자가 되고,
			// "No public methods with the specified arguments were found"로 죽는다.
			// .d.ts의 `param?: T`는 "생략 가능"이지 "undefined 허용"이 아니다.
			//
			// 여기서는 리터럴 undefined만 잡는다. 편집 중 즉시 뜨는 게 목적이고,
			// `number | undefined` 같은 변수 경로까지 보는 진짜 방어선은
			// npm run check:zep (tools/check-zep-calls.js)이다.
			"no-restricted-syntax": [
				"error",
				{
					selector: "CallExpression > Identifier[name='undefined']",
					message:
						"ZEP(Jint) API에 undefined를 인자로 넘기면 오버로드를 찾지 못합니다. 인자를 아예 생략하도록 호출을 분기하세요.",
				},
				// 위젯 메시지는 클라이언트에서 온다. 핸들러가 던지면 예외가 ZEP
				// 이벤트 콜백을 타고 올라가 그 프레임이 통째로 사라진다 — 조작된
				// 메시지 하나로 방 8개를 함께 세울 수 있다는 뜻이다.
				// Widgets.bindMessage가 등록 지점에서 격리와 관측을 한 번에 붙이므로,
				// 새 위젯을 붙이는 사람이 그 관문을 기억하지 않아도 되게 막는다.
				{
					selector:
						"CallExpression[callee.object.property.name='onMessage'][callee.property.name='Add']",
					message:
						"widget.onMessage.Add를 직접 부르지 마세요. Widgets.bindMessage(widget, scope, handler)를 쓰면 예외 격리와 스태프 알림이 함께 붙습니다.",
					},
			],

			// ZEP(Jint) 런타임에 존재하지 않는 전역. 원본 코드가 실제로
			// player.chatEnabled 같은 없는 API를 호출하고 있었기 때문에 방어한다.
			"no-restricted-globals": [
				"error",
				{
					name: "console",
					message: "ZEP 런타임에는 console이 없습니다.",
				},
				{
					name: "window",
					message: "ZEP 런타임에는 window가 없습니다.",
				},
				{
					name: "document",
					message: "ZEP 런타임에는 document가 없습니다.",
				},
				{
					name: "fetch",
					message: "ZEP 런타임에는 fetch가 없습니다. ScriptApp.httpPostJson을 사용하세요.",
				},
				{
					name: "Map",
					message:
						"전역 Map은 babel 플러그인이 ScriptMap으로 치환합니다. 자료구조가 필요하면 일반 객체를 쓰세요.",
				},
				{
					name: "Set",
					message: "Jint 호환성을 위해 Set 대신 배열을 사용하세요.",
				},
			],
		},
	},
	{
		// App 이벤트 등록은 부트스트랩에서만
		files: ["src/index.ts"],
		rules: { "no-restricted-globals": "off" },
	},
];
