/*
 * 위젯 HTML 빌드: src/ui/*.html -> res/*.html
 *
 * 왜 필요한가
 * -----------
 * ZEP 위젯은 클라이언트 안의 iframe이고, 로드 기준 경로가 문서화돼 있지 않다.
 * 그래서 <link rel="stylesheet" href="theme.css">가 해석된다는 보장이 없다.
 * "그러니 각 파일이 CSS를 다 갖는다"가 지금까지의 결론이었고, 그 결과
 * 위젯 11개가 각자 CSS를 처음부터 다시 써서 색 26종·타이머 구현 4벌이 됐다.
 *
 * 소스를 나누고 산출물을 합치면 둘 다 얻는다. 편집은 한 곳에서 하고,
 * res/에 떨어지는 파일은 여전히 자기완결이다.
 *
 * 검사도 함께 한다 (외부 호스트 금지). 기존 위젯은 imgur 10곳, cdnjs 7곳,
 * jsdelivr 2곳에 의존했다. 그중 font-awesome 7곳은 아이콘을 한 개도 쓰지
 * 않으면서 매번 70KB를 받았고, imgur가 죽으면 게임 화면이 통째로 빈다.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "ui");
const OUT = path.join(ROOT, "res");

/** 위젯이 외부에서 받아오면 안 되는 것. 오프라인·CDN 차단 환경에서 화면이 빈다 */
const EXTERNAL = /\b(?:https?:)?\/\/(?!localhost)[a-z0-9-]+\.[a-z]/gi;

function read(file) {
	return fs.readFileSync(file, "utf8");
}

/**
 * 인라인 대상 안에 있으면 안 되는 것: </script> 는 <script> 블록을
 * 조기 종료시킨다. shared.js에 그런 문자열이 생기면 조용히 깨지므로 막는다.
 */
function assertInlineSafe(name, code) {
	if (/<\/script/i.test(code)) {
		throw new Error(`${name}: "</script" 문자열은 인라인할 수 없습니다`);
	}
}

function build() {
	const theme = read(path.join(SRC, "theme.css"));
	const shared = read(path.join(SRC, "shared.js"));
	assertInlineSafe("shared.js", shared);

	const sources = fs
		.readdirSync(SRC)
		.filter(name => name.endsWith(".html"))
		.sort();

	if (sources.length === 0) throw new Error("src/ui 에 위젯 소스가 없습니다");

	const problems = [];
	let bytes = 0;

	for (const name of sources) {
		const source = read(path.join(SRC, name));

		if (!source.includes("<!--@theme-->")) {
			problems.push(`${name}: <!--@theme--> 자리가 없습니다`);
		}

		// 자리표시자 검사는 산출물이 아니라 소스에 한다. theme.css와 shared.js는
		// 주석에서 자기 자리표시자를 설명하고 있어서, 합친 뒤에 세면 항상 걸린다.
		const leftover = source.replace("<!--@theme-->", "").replace("<!--@shared-->", "");
		if (leftover.includes("<!--@")) {
			problems.push(`${name}: 치환되지 않은 자리표시자가 남았습니다`);
		}

		const output = source
			.replace("<!--@theme-->", `<style>\n${theme}\n</style>`)
			.replace("<!--@shared-->", `<script>\n${shared}\n</script>`);

		const external = output.match(EXTERNAL);
		if (external) {
			problems.push(`${name}: 외부 호스트 참조 ${[...new Set(external)].join(", ")}`);
		}

		fs.writeFileSync(path.join(OUT, name), output);
		bytes += Buffer.byteLength(output);
	}

	if (problems.length > 0) {
		console.error("위젯 빌드 실패:");
		for (const problem of problems) console.error(`  - ${problem}`);
		process.exit(1);
	}

	console.log(`위젯 ${sources.length}개 생성 (${(bytes / 1024).toFixed(1)} KiB)`);
}

build();
