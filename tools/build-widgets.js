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
const { minify } = require("terser");

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
 * 모든 위젯이 아니라 필요하다고 선언한 위젯에만 들어가는 것.
 *
 * native-chat.js는 클라이언트 번들 내부를 뒤져 채팅 패킷을 쏘는 코드라
 * 쓰는 곳이 chat.html 하나뿐이다. SHARED에 넣으면 나머지 6개가 부르지도
 * 않을 26KB를 지고 다닌다 — 실제로 그랬고, 그래서 나눴다.
 *
 * 자리표시자로 고르게 한다. 빌드 쪽에 { "chat.html": [...] } 표를 두는 방법도
 * 있지만, 그러면 위젯을 읽는 사람이 무엇이 들어오는지 알려고 빌드 스크립트를
 * 열어야 한다. 자리표시자는 파일 자신이 자기가 필요한 것을 말한다.
 */
const OPTIONAL = { "<!--@native-chat-->": { file: "native-chat.js", uses: "NativeChat." } };

/**
 * 부모(ZEP 클라이언트)를 만지는 일은 공유 스크립트 안에만 둔다.
 * 위젯이 window.parent나 HostWindow를 직접 쓰면 그 계약이 다시 흩어지므로
 * 빌드에서 막는다. 이 검사가 없으면 규칙은 주석에만 남고, 주석은 지켜지지 않는다.
 */
const DIRECT_PARENT = /\bwindow\s*\.\s*parent\b|\bHostWindow\b/;

function read(file) {
	return fs.readFileSync(file, "utf8");
}

/*
 * 주석 제거
 * ---------
 * res/*.html은 손대지 않은 채로 플레이어 브라우저에 뜬다. 소스의 주석은 이
 * 프로젝트의 설계 기록이지 플레이어에게 읽히려고 쓴 것이 아니고, 특히
 * bridge.js의 주석은 클라이언트 내부에 닿는 방법을 순서대로 적어 둔 문서다.
 *
 * 이것은 보안이 아니다. 주석을 지워도 send("Z_NET_CHAT_MESSAGE_REQUEST", ...)는
 * 그대로 읽힌다. 권한 판정은 서버(ChatService)에 있고, 여기서 하는 일은
 * "굳이 안내문까지 같이 배포하지는 않는다" 정도다.
 *
 * 지우는 것은 주석뿐이다. 이름을 뭉개거나 압축하지 않는다 — 프로덕션에서
 * 콘솔에 뜨는 것이 이 코드이고, 읽을 수 없게 만들면 지난번 webpackChunk_N_E
 * 같은 문제를 다시 로그만 보고 잡을 수 없다.
 */

/** CSS 주석. 중첩되지 않고 여는 기호가 문자열 값에 쓰이는 곳도 없어 정규식으로 충분하다 */
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;

/** HTML 주석. <!--@theme--> 같은 자리표시자는 남겨야 하므로 @는 건드리지 않는다 */
const HTML_COMMENT = /<!--(?!@)[\s\S]*?-->/g;

function stripCss(code) {
	// 주석이 빠진 자리에 남는 빈 줄까지 걷는다. 남겨 두면 "여기 뭔가 있었다"가
	// 그대로 보여서 절반만 지운 꼴이 된다.
	return code.replace(CSS_COMMENT, "").replace(/^[ \t]*\n/gm, "");
}

/**
 * 위젯 소스 한 벌에서 주석을 걷어낸다 — HTML 주석, 그리고 위젯이 자기
 * <style>·<script>에 직접 쓴 주석까지.
 *
 * 공유 파일만 지우면 절반만 지운 것이다. 채팅 위젯 본문 스크립트에도
 * "이 순서로 재지 않으면 자동 스크롤이 영영 멈춘다" 같은 기록이 그대로 있다.
 *
 * 자리표시자는 아직 주석 상태라 여기 걸리지 않는다. 그래서 이 함수가 치환보다
 * 먼저 돌아야 하고, 그 덕에 이미 처리한 theme·shared를 두 번 건드리지 않는다.
 */
async function stripBody(name, code) {
	const withoutCss = code
		.replace(HTML_COMMENT, "")
		.replace(/(<style>)([\s\S]*?)(<\/style>)/gi, (_, open, css, close) => open + stripCss(css) + close);

	// terser는 비동기라 replace 콜백에서 쓸 수 없다. 조각으로 갈라 이어 붙인다
	const parts = withoutCss.split(/(<script>[\s\S]*?<\/script>)/g);
	for (let i = 0; i < parts.length; i++) {
		const script = /^<script>([\s\S]*?)<\/script>$/.exec(parts[i]);
		if (script) parts[i] = `<script>\n${await stripJs(name, script[1])}\n</script>`;
	}
	return parts.join("").replace(/^[ \t]+$\n/gm, "");
}

/**
 * JS 주석은 정규식으로 지우면 안 된다. //가 문자열·정규식 리터럴 안에도
 * 나올 수 있어서, 실제로 파싱하는 물건이 필요하다. terser는 webpack이
 * 이미 끌고 오는 의존성이라 새로 받을 것이 없다.
 */
async function stripJs(name, code) {
	const result = await minify(code, {
		compress: false,
		mangle: false,
		format: { comments: false, beautify: true, indent_level: 1 },
	});
	if (typeof result.code !== "string") throw new Error(`${name}: 주석을 제거하지 못했습니다`);
	return result.code;
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

async function build() {
	const rawTheme = read(path.join(SRC, "theme.css"));
	const rawShared = SHARED.map(name => read(path.join(SRC, name))).join("\n");

	// 주석은 인라인하기 전에 지운다. 그래야 아래 무결성 검사(output.includes)가
	// "인라인하려던 것이 글자 하나까지 그대로 나갔는가"라는 뜻을 그대로 유지한다 —
	// 합친 뒤에 지우면 그 검사가 항상 실패하고, 검사를 빼면 예전에 산출물을
	// 조용히 망가뜨렸던 그 구멍이 다시 열린다.
	const theme = stripCss(rawTheme);
	const shared = await stripJs(SHARED.join(" + "), rawShared);

	// 검사는 실제로 나가는 것에 건다. 주석 안에 있던 </script는 이미 사라졌다
	assertInlineSafe(SHARED.join(" + "), shared, "</script");
	assertInlineSafe("theme.css", theme, "</style");

	// 선택 파일도 같은 대접을 받는다 — 주석을 먼저 지우고, 인라인이 그것을
	// 글자 하나까지 옮겼는지 아래에서 확인한다.
	const optional = {};
	for (const [placeholder, spec] of Object.entries(OPTIONAL)) {
		const raw = read(path.join(SRC, spec.file));
		const code = await stripJs(spec.file, raw);
		assertInlineSafe(spec.file, code, "</script");
		optional[placeholder] = { ...spec, code, saved: Buffer.byteLength(raw) - Buffer.byteLength(code) };
	}

	const sharedSaved =
		Buffer.byteLength(rawTheme) -
		Buffer.byteLength(theme) +
		(Buffer.byteLength(rawShared) - Buffer.byteLength(shared));
	let saved = 0;

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
		let leftover = source.replace("<!--@theme-->", "").replace("<!--@shared-->", "");
		for (const placeholder of Object.keys(optional)) leftover = leftover.replace(placeholder, "");
		if (leftover.includes("<!--@")) {
			problems.push(`${name}: 치환되지 않은 자리표시자가 남았습니다`);
		}

		// 선택 파일은 양방향으로 맞춘다. 자리표시자 없이 쓰면 위젯이 로드
		// 도중 죽고, 쓰지 않으면서 자리만 있으면 이 분리로 걷어낸 짐이
		// 조용히 다시 쌓인다 — 둘 다 사람 눈에는 안 보이는 종류의 실수다.
		for (const [placeholder, spec] of Object.entries(optional)) {
			const wanted = source.includes(placeholder);
			const used = source.includes(spec.uses);
			if (used && !wanted) problems.push(`${name}: ${spec.uses}.. 을 쓰려면 ${placeholder} 자리가 필요합니다`);
			if (wanted && !used) problems.push(`${name}: ${placeholder}만 있고 ${spec.file}을 쓰지 않습니다`);
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
		//
		// 위젯 본문의 주석은 여기서 지운다. 위의 검사들은 소스에 걸어야 하고
		// (자리표시자·window.parent는 어떻게 쓰느냐의 규칙이다) 치환은 지운
		// 뒤에 해야 한다 — 순서가 바뀌면 자리표시자가 주석과 함께 날아간다.
		const body = await stripBody(name, source);
		saved += sharedSaved + (Buffer.byteLength(source) - Buffer.byteLength(body));

		let output = body
			.replace("<!--@theme-->", () => `<style>\n${theme}\n</style>`)
			.replace("<!--@shared-->", () => `<script>\n${shared}\n</script>`);

		for (const [placeholder, spec] of Object.entries(optional)) {
			if (!source.includes(placeholder)) continue;
			output = output.replace(placeholder, () => `<script>\n${spec.code}\n</script>`);
			saved += spec.saved;
			if (!output.includes(spec.code)) problems.push(`${name}: ${spec.file}이 변형되어 들어갔습니다`);
		}

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

	// 지운 양을 함께 남긴다. 0으로 떨어지면 주석 제거가 조용히 멈춘 것이다
	const savedKiB = (saved / 1024).toFixed(1);
	console.log(`위젯 ${sources.length}개 생성 (${(bytes / 1024).toFixed(1)} KiB, 주석 ${savedKiB} KiB 제외)`);
}

build().catch(error => {
	console.error(error.message);
	process.exit(1);
});
