module.exports = {
	presets: ["@babel/preset-typescript"],
	// ScriptApp -> App, ScriptMap -> Map 치환 및 `import "zep-script"` 제거
	plugins: ["@zep.us/zep-script"],
};
