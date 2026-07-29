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

/**
 * 모든 위젯에 인라인되는 공통 스크립트. 순서가 곧 정의 순서다.
 * bridge.js의 const Parent는 최상위 스코프라 호이스팅되지 않는다 —
 * 위젯 본문 스크립트보다 먼저 와야 한다.
 */
const SHARED = ["shared.js", "bridge.js"];

/**
 * 부모(ZEP 클라이언트)를 만지는 일은 bridge.js 하나로 모았다.
 * 위젯이 window.parent를 직접 쓰면 그 계약이 다시 흩어지므로 빌드에서 막는다.
 * 이 검사가 없으면 규칙은 주석에만 남고, 주석은 지켜지지 않는다.
 */
const DIRECT_PARENT = /\bwindow\s*\.\s*parent\b/;

function read(file) {
	return fs.readFileSync(file, "utf8");
}

/**
 * 인라인 대상 안에 있으면 안 되는 것: 감싸는 태그를 조기 종료시키는 문자열.
 * shared.js 안의 "</script", theme.css 안의 "</style"이 그렇다.
 * 들어가면 조용히 깨지므로 빌드에서 막는다.
 */
function assertInlineSafe(name, code, closer) {
	if (new RegExp(closer, "i").test(code)) {
		throw new Error(`${name}: "${closer}" 문자열은 인라인할 수 없습니다`);
	}
}

function build() {
	const theme = read(path.join(SRC, "theme.css"));
	const shared = SHARED.map(name => read(path.join(SRC, name))).join("\n");
	assertInlineSafe(SHARED.join(" + "), shared, "</script");
	assertInlineSafe("theme.css", theme, "</style");

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

		// 같은 이유로 소스에만 건다. bridge.js는 window.parent를 쓰는 게 일이다
		if (DIRECT_PARENT.test(source)) {
			problems.push(`${name}: window.parent를 직접 씁니다. bridge.js의 Parent를 쓰세요`);
		}

		// 치환값은 반드시 함수로 준다.
		//
		// String.replace(문자열, 문자열)은 두 번째 인자 안의 $$ · $& · $` · $' ·
		// $1 을 치환 지시자로 해석한다. shared.js의 `function $$(selector, root)`가
		// 그래서 `function $(selector, root)`로 바뀌어 나갔다. 산출물에는 $가
		// 두 번 정의됐고 나중 것($$의 몸통)이 이겨서, 모든 위젯에서 $()가
		// 엘리먼트 대신 배열을 돌려줬다. $(...).addEventListener is not a function.
		//
		// 치환값을 함수로 주면 반환값이 글자 그대로 쓰인다.
		const output = source
			.replace("<!--@theme-->", () => `<style>\n${theme}\n</style>`)
			.replace("<!--@shared-->", () => `<script>\n${shared}\n</script>`);

		// 인라인한 것이 글자 하나까지 그대로 나갔는가.
		// 위 실수는 빌드도 테스트도 통과하고 ZEP에 올린 뒤에야 드러났다.
		// 이 검사가 있으면 같은 종류의 변형은 무엇이든 빌드에서 멈춘다.
		if (!output.includes(theme)) problems.push(`${name}: theme.css가 변형되어 들어갔습니다`);
		if (!output.includes(shared)) problems.push(`${name}: ${SHARED.join(" + ")}가 변형되어 들어갔습니다`);

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
