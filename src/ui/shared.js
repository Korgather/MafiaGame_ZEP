/*
 * 위젯 공통 스크립트 — 화면을 만드는 쪽.
 *
 * 부모(ZEP 클라이언트)와 주고받는 일은 여기 없다. 전부 bridge.js에 있다.
 * tools/build-widgets.js가 각 위젯 HTML의 <!--@shared--> 자리에 bridge.js와
 * 함께 인라인한다.
 *
 * 개정에서 바뀐 것은 startTimer 하나다. 나머지 함수는 그대로다 —
 * 이름·인자·반환이 같아야 위젯 열 개의 호출부를 건드리지 않는다.
 */

/** 서버가 보낸 문자열은 다른 플레이어가 정한 값이다. 태그로 해석되면 안 된다 */
function esc(value) {
	return String(value == null ? "" : value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * 이미 escape를 마친 HTML 조각. html`` 이 만들고 html`` 이 알아본다.
 *
 * 이 표시가 없으면 조각을 조각에 끼울 때마다 두 번 escape되어
 * &amp;lt; 같은 글자가 화면에 뜬다. 표시가 있으니 중첩이 그냥 된다.
 */
function Html(text) {
	this.text = text;
}

Html.prototype.toString = function () {
	return this.text;
};

function frag(value) {
	if (value instanceof Html) return value.text;
	// 배열은 이어 붙인다. 호출부가 .join("")을 하면 그 순간 표시가 벗겨져서
	// 바깥 템플릿이 조각 전체를 다시 escape해 버린다 — 그 함정을 없앤다.
	if (Array.isArray(value)) return value.map(frag).join("");
	return esc(value);
}

/**
 * HTML 조립. 끼워 넣는 값은 전부 자동으로 escape된다.
 *
 *   el.innerHTML = html`<span class="nm">${seat.name}</span>`;
 */
function html(strings) {
	let out = strings[0];
	for (let i = 1; i < arguments.length; i++) out += frag(arguments[i]) + strings[i];
	return new Html(out);
}

/**
 * boolean 속성. 참이면 속성 이름을, 거짓이면 빈 조각을 낸다.
 *
 * 값을 끼우는 방식으로는 끌 수 없다 — HTML의 boolean 속성은 값이 아니라
 * 존재로 판정되므로 disabled="false"도 disabled다.
 */
function flag(on, name) {
	return new Html(on ? name : "");
}

/*
 * querySelector 두 종.
 *
 * $ / $$ 라는 이름이었는데, $가 String.replace의 치환 지시자라서 빌드가
 * shared.js를 인라인하면서 `function $$`를 `function $`로 바꿔 모든 위젯의
 * $()가 배열을 돌려준 적이 있다. 이름에 $가 없으면 그 사고가 성립하지 않는다.
 */
function qs(selector, root) {
	return (root || document).querySelector(selector);
}

function qsa(selector, root) {
	return Array.prototype.slice.call((root || document).querySelectorAll(selector));
}

/**
 * 남은 시간 표시.
 *
 * 인자와 이름은 그대로다(el, 초). 바뀐 것은 el 안에 무엇을 그리는가다.
 *
 * 전에는 44x44 링 안에 숫자를 넣었다. 링은 두 가지를 한 자리에서 말하려다
 * 둘 다 작게 만들었다 — 숫자는 18px이 한계이고, 위젯이 96% 폭으로 뜨면
 * 그 44px 원이 오른쪽 끝 구석에 박혀 시야 밖이다. "남은 시간이 안 보인다"가
 * 나온 자리가 여기다.
 *
 * 지금은 둘을 나눈다. 숫자는 지시 줄 오른쪽에서 t-3xl(최대 40px)로 크게,
 * 진행 비율은 위젯 폭 전체를 쓰는 .timeline이 그린다. 폭이 넓어질수록
 * 선도 같이 길어지므로 어떤 상자에서도 같은 비율이 같은 길이감으로 읽힌다.
 *
 * .timeline을 인자로 받지 않고 문서에서 찾는 이유: 인자를 늘리면 위젯
 * 열 개의 호출부를 전부 고쳐야 하고, 한 판에 타이머는 하나뿐이라 찾을
 * 대상이 애초에 하나다. 선이 없는 화면(카드)에서는 조용히 넘어간다.
 */
function startTimer(el, seconds) {
	if (!el) return;
	// 같은 위젯이 payload를 두 번 받으면 타이머도 두 개가 된다. 둘 다 살아서
	// 서로 다른 숫자를 번갈아 쓰기 때문에 남은 시간이 튀어 보인다.
	if (el.dataset.timerId) clearInterval(Number(el.dataset.timerId));

	const total = Math.max(1, Math.round(seconds));
	let left = total;

	el.classList.add("clock");
	el.setAttribute("role", "timer");
	el.innerHTML = html`<span class="n"></span><span class="u">초</span>`;
	const label = qs(".n", el);

	const line = qs(".timeline");
	const bar = line ? qs("i", line) : null;

	function paint() {
		const n = Math.max(0, left);
		// 두 자리로 고정한다. 9에서 8로 넘어갈 때 글자 폭이 줄면 옆의 지시
		// 문구가 그때마다 밀린다 — tabular-nums는 자릿수까지 고정해주지 않는다
		label.textContent = n < 10 ? "0" + n : String(n);
		el.setAttribute("aria-label", "남은 시간 " + n + "초");
		if (bar) bar.style.width = (n / total) * 100 + "%";
		// 마지막 10초는 색과 맥동으로도 알린다. 소리를 못 듣는 환경이 있다
		el.classList.toggle("urgent", left <= 10);
		// 마지막 3초는 박동만 빨라진다. 10초를 같은 속도로 뛰면 그 급함이
		// 배경이 되어 정작 끝나는 순간을 놓친다
		el.classList.toggle("critical", left <= 3);
		if (line) line.classList.toggle("urgent", left <= 10);
	}

	paint();
	const id = setInterval(function () {
		left--;
		paint();
		if (left <= 0) clearInterval(id);
	}, 1000);
	el.dataset.timerId = String(id);
	return id;
}

/** 로그 맨 아래로. 붙인 뒤에 호출해야 한다 */
function scrollToEnd(el) {
	if (el) el.scrollTop = el.scrollHeight;
}

/**
 * res/ 그림 파일의 주소.
 *
 * 위젯은 /spaces/app/file?appHashId=..&fileName=<위젯>.html 에서 열리므로
 * 상대경로 ui_x.png는 /spaces/app/ui_x.png로 풀려 404가 난다. 자기 주소의
 * fileName만 바꿔 앱 파일 주소를 만든다. appHashId가 없는 곳(미리보기)은
 * 상대경로 그대로 둔다. 앱을 올린 뒤에야 보인다.
 *
 * GIF는 앱 파일 주소로는 불러지지 않고, 컷 배경 webp는 커서 앱 zip을 키운다.
 * 둘 다 zep-script-resources 레포의 res/mafia/ 에 올려 CDN에서 받는다
 * (main에 push하면 S3에 올라간다).
 */
const CDN = "https://cdn-static-script.zep.us/mafia/";
function assetUrl(file) {
	if (/\.(gif|webp)$/.test(file)) return CDN + file;
	try {
		const url = new URL(document.baseURI);
		if (!url.searchParams.has("appHashId")) return file;
		url.searchParams.set("fileName", file);
		return url.href;
	} catch (e) {
		return file;
	}
}

/** 서버가 보내는 글리프(이모지) → res/ui_<이름>.png (codex 생성). 없는 글리프는 글자 그대로 */
const GLYPH_ICON = {
	"🔪": "mafia",
	"💉": "doctor",
	"🔍": "police",
	"🕵️": "spy",
	"🔮": "shaman",
	"🎖️": "politician",
	"🔫": "vigilante",
	"🪖": "soldier",
	"🥊": "gangster",
	"📰": "reporter",
	"🐺": "werewolf",
	"🎭": "swindler",
	"🃏": "fortune",
	"💋": "madam",
	"🧤": "thief",
	"💞": "lover",
	"🔦": "detective",
	"⛏️": "graverobber",
	"💣": "terrorist",
	"⛪": "priest",
	"🧑": "citizen",
	"🌙": "moon",
	"🌅": "sunrise",
	"🌞": "sunrise",
	"🎤": "mic",
	"🗳️": "ballot",
	"🏆": "trophy",
	"☠": "skull",
	"☠️": "skull",
	"👻": "ghost",
	"🕊️": "dove",
	"💬": "chat",
	"🙂": "face",
	"?": "unknown",
};

/** codex가 움직이는 GIF로 만든 글리프(CDN mafia/ui_<이름>.gif, assetUrl 참고). 나머지는 정지 PNG다 */
const GLYPH_ANIMATED = new Set([
	"trophy",
	"mic",
	"ballot",
	"ghost",
	"dove",
	"moon",
	"shaman",
	"sunrise",
	"terrorist",
]);

/** 글리프 하나를 그림으로. 그림이 안 뜨면 alt의 이모지가 대신 보인다 */
function glyphHtml(glyph) {
	const name = GLYPH_ICON[glyph];
	if (!name) return html`${glyph || ""}`;
	return html`<img
		class="gi"
		src="${assetUrl(`ui_${name}.${GLYPH_ANIMATED.has(name) ? "gif" : "png"}`)}"
		alt="${glyph === "?" ? "" : glyph}"
	/>`;
}

function setGlyph(el, glyph) {
	if (el) el.innerHTML = String(glyphHtml(glyph));
}

/** 마크업에 박힌 글리프(data-glyph)를 그림으로 바꾼다. shared는 body 끝에 들어가 DOM이 이미 있다 */
qsa('[data-glyph="auto"]').forEach(el => setGlyph(el, el.textContent.trim()));

/** 방에 공개된 사건 기록을 날(밤·낮)마다 접어 그린다. 보드(유령·관전)와 종료 화면이 함께 쓴다.
 * 마지막 묶음만 펼친다 — 방금 일어난 일이 먼저 눈에 들어와야 한다 */
function replayHtml(entries) {
	const groups = [];
	for (const entry of Array.isArray(entries) ? entries : []) {
		const last = groups[groups.length - 1];
		if (last && last.when === entry.when) last.lines.push(entry.text);
		else groups.push({ when: entry.when, lines: [entry.text] });
	}
	return html`${groups.map(
		(group, i) => html`<details ${flag(i === groups.length - 1, "open")}>
			<summary>${group.when} <span class="n">${group.lines.length}건</span></summary>
			${group.lines.map(line => html`<p>${line}</p>`)}
		</details>`
	)}`;
}

/*
 * 처음 하는 사람이 막히는 낱말. 단계 이름·모드 제목·직업 칩에 마우스를 올리면
 * 뜻이 뜬다(title). 위젯 셋(HUD·보드·찬반)이 같은 낱말을 쓰므로 한 표에 둔다.
 */
const TERMS = {
	"직업 확인": "카드를 뒤집어 이번 판의 내 직업과 능력을 확인하는 시간",
	밤: "마피아와 능력이 있는 직업이 몰래 대상을 고르는 시간",
	낮: "밤사이 일을 듣고 채팅으로 누가 마피아인지 토론하는 시간",
	투표: "처형 후보를 한 명 지목하는 투표. 가장 많이 받은 사람이 단상에 오른다",
	개표: "투표 결과를 공개한다. 동률이거나 '투표 없음'이 많으면 아무도 오르지 않는다",
	"최후의 반론": "단상에 오른 사람이 처형 전에 해명하는 시간. 나머지는 듣는다",
	"찬반 투표": "단상에 오른 사람을 처형할지 찬성(O)·반대(X)로 정한다",
	지목: "투표나 밤 능력으로 대상을 고르는 일",
	유령: "죽은 사람. 유령끼리만 대화할 수 있고 투표·능력은 쓸 수 없다",
	영매: "밤마다 유령과 대화하고, 그중 한 명을 성불시켜 직업을 보는 시민 직업",
	여론조사: "낮 토론 중 의심 가는 사람을 표시한다. 투표·처형과는 무관한 참고용이다",
};

/** 낱말이 표에 없으면 title을 비운다. 지난 단계의 설명이 남지 않게 */
function termTitle(el, word) {
	el.title = TERMS[word] || "";
}

/*
 * 내 추정 메모. 채팅이 적고(명단 칩·말한 사람 번호) 보드가 읽는다(칸의 점선 칩).
 *
 * 판마다 따로 적는다(gameId). Parent.store는 위젯을 다시 열어도 남고,
 * localStorage는 새로고침(재접속)에도 남는다. 교차 출처라 store가 위젯마다
 * 따로 놀아도 localStorage는 같은 출처의 두 위젯이 함께 본다. 서버로는 보내지 않는다.
 */
const MEMO_KEY = "mafia.memo";

function memoLoad(gameId) {
	try {
		const memo = Parent.store.memo && Parent.store.memo[gameId];
		if (memo) return memo;
	} catch (e) {
		// 아래 localStorage가 받는다
	}
	try {
		const saved = JSON.parse(localStorage.getItem(MEMO_KEY) || "null");
		// 지난 판 메모는 버린다. 한 판 것만 두므로 저장소가 자라지 않는다
		if (saved && saved.gameId === gameId && saved.memo) return saved.memo;
	} catch (e) {
		// 사생활 보호 모드에서는 localStorage가 던진다
	}
	return {};
}

function memoSave(gameId, memo) {
	try {
		if (!Parent.store.memo) Parent.store.memo = {};
		Parent.store.memo[gameId] = memo;
	} catch (e) {
		// 아래 localStorage가 받는다
	}
	try {
		localStorage.setItem(MEMO_KEY, JSON.stringify({ gameId, memo }));
	} catch (e) {
		// 둘 다 막히면 이 위젯이 살아 있는 동안만 남는다
	}
}
