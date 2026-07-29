/*
 * 위젯 미리보기 페이지 생성: res/*.html -> preview/widgets.html
 *
 * 왜 필요한가
 * -----------
 * 지금까지 위젯 화면을 눈으로 보는 유일한 방법은 ZEP에 올리고 4명을 모아
 * 한 판을 시작해서 그 단계까지 진행하는 것이었다. 개표 화면 하나를 고치려면
 * 매번 밤·낮·투표를 거쳐야 했다. 그래서 아무도 화면을 손보지 않았고,
 * voteResult.html의 격자가 6명 전용으로 굳은 채 MAX_PLAYERS만 8로 올라갔다.
 *
 * 이 파일은 tools/widget-scenes.js의 장면들을 각 위젯에 넣어 한 페이지에
 * 늘어놓는다. 브라우저로 열면 끝이다. 같은 장면을 tools/check-widgets.js가
 * 기계로도 한 번 열어보므로, 눈에 보이는 것과 검사받는 것이 항상 같다.
 *
 * 산출물은 preview/ 아래에 떨어지며 배포에 포함되지 않는다.
 */
const fs = require("fs");
const path = require("path");
const { SCENES } = require("./widget-scenes.js");

const ROOT = path.join(__dirname, "..");
const RES = path.join(ROOT, "res");
const OUT = path.join(ROOT, "preview");

/** srcdoc 속성에 넣으려면 따옴표만 막으면 된다 */
function attr(html) {
	return html.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * 장면의 메시지를 위젯 문서 안에서 스스로 전달하게 만든다.
 *
 * 부모에서 iframe.load를 기다려 postMessage하던 방식은 못 쓴다. srcdoc
 * 프레임은 부모의 마지막 스크립트가 돌기 전에 이미 다 뜰 수 있어서 load를
 * 놓치고, 그렇다고 readyState를 봐도 소용없다 — 아직 시작도 안 한 iframe의
 * about:blank 문서가 이미 "complete"이라 빈 문서에 대고 쏘게 된다.
 * 어느 쪽이든 앞쪽 몇 장면이 payload를 못 받은 빈 화면으로 남았다.
 *
 * 같은 문서 안의 <script>는 순서가 보장된다. 위젯이 onServer로 구독을
 * 마친 뒤에 실행되므로 경합 자체가 없어진다.
 */
function inject(source, messages) {
	const payload = messages.map(m => JSON.stringify({ ...m, isMobile: false })).join(",");
	const script = `<script>[${payload}].forEach(function (data) {
		window.dispatchEvent(new MessageEvent("message", { data: data }));
	});<\/script>`;
	return source.replace("</body>", `${script}</body>`);
}

function build() {
	const cache = {};
	const cards = SCENES.map((scene, i) => {
		if (!cache[scene.file]) cache[scene.file] = fs.readFileSync(path.join(RES, scene.file), "utf8");
		// 위젯은 자기 크기를 모른 채 부모가 정한 폭에 맞춘다. ZEP과 같은 조건이다.
		const doc = inject(cache[scene.file], scene.messages);
		return `<figure>
	<figcaption><b>${scene.label}</b><span>${scene.file} · ${scene.size[0]}×${scene.size[1]}</span></figcaption>
	<iframe id="f${i}" width="${scene.size[0]}" height="${scene.size[1]}" srcdoc="${attr(doc)}"></iframe>
</figure>`;
	}).join("\n");

	const page = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>마피아 위젯 미리보기</title>
<style>
	body { margin: 0; padding: 24px; background: #17171c; color: #c8c8d0;
		font-family: "Pretendard", system-ui, sans-serif; }
	h1 { font-size: 18px; margin: 0 0 4px; color: #fff; }
	p.lead { margin: 0 0 24px; font-size: 13px; color: #8a8a96; }
	.wrap { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
	figure { margin: 0; }
	figcaption { display: flex; flex-direction: column; gap: 2px; padding-bottom: 8px; font-size: 12px; }
	figcaption b { color: #fff; font-weight: 600; }
	figcaption span { color: #6e6e7a; font-size: 11px; }
	iframe { border: 1px solid #2e2e38; border-radius: 10px; background: #000; display: block; }
</style>
</head>
<body>
<h1>마피아 위젯 미리보기</h1>
<p class="lead">서버가 실제로 보내는 것과 같은 payload를 넣은 상태입니다. 눌러도 서버가 없어 응답은 오지 않습니다.</p>
<div class="wrap">
${cards}
</div>
</body>
</html>
`;

	fs.mkdirSync(OUT, { recursive: true });
	const file = path.join(OUT, "widgets.html");
	fs.writeFileSync(file, page);
	console.log(`미리보기 생성: ${path.relative(ROOT, file)} (장면 ${SCENES.length}개)`);
}

build();
