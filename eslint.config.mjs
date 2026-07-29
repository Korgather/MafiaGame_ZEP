import pluginJs from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
	{ ignores: ["res/**/*", "node_modules/**/*", "tools/**/*"] },
	{ files: ["src/**/*.ts", "main.ts"], ...pluginJs.configs.recommended },
	...tseslint.configs.recommended.map(config => ({
		...config,
		files: ["src/**/*.ts", "main.ts"],
	})),
	{
		files: ["src/**/*.ts", "main.ts"],
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
