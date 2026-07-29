/**
 * webpack 재빌드 전에 res/ 안의 이전 번들 결과물을 지운다.
 * 남아 있으면 zep-script archive가 stale한 js까지 zip에 담는다.
 */
const fs = require("fs");
const path = require("path");

const resDir = path.resolve(__dirname, "..", "res");

for (const entry of fs.readdirSync(resDir)) {
	if (entry.endsWith(".js")) {
		fs.rmSync(path.join(resDir, entry), { force: true });
	}
}
