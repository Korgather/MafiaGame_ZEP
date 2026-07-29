const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

/**
 * ZEP은 `zep-script build`(babel 단일 파일 컴파일)를 쓰면 모듈 분리가 불가능하다.
 * 대신 webpack으로 직접 번들링해 res/main.js를 만든다.
 * `zep-script archive`는 res/ 디렉터리 내용을 zip 루트에 넣으므로
 * res/main.js가 곧 ZEP 런타임의 엔트리포인트가 된다.
 */
module.exports = {
	mode: "production",
	entry: "./main.ts",
	module: {
		rules: [{ test: /\.ts$/, use: "babel-loader", exclude: /node_modules/ }],
	},
	resolve: {
		extensions: [".ts", ".js"],
		alias: {
			"zep-script": path.resolve(__dirname, "node_modules/zep-script"),
		},
	},
	output: {
		filename: "main.js",
		// Jint 런타임에는 self/window가 없다
		globalObject: "this",
		path: path.resolve(__dirname, "res"),
	},
	optimization: {
		minimize: true,
		// 단일 파일로 출력해야 ZEP이 엔트리를 찾는다
		splitChunks: false,
		runtimeChunk: false,
		minimizer: [
			new TerserPlugin({
				extractComments: false,
				parallel: true,
				terserOptions: {
					// 런타임 에러 스택을 읽을 수 있게 이름은 유지
					mangle: false,
					format: { comments: false, ecma: 5 },
				},
			}),
		],
	},
};
