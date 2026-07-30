/*
 * 위젯 공통 스크립트 — 화면을 만드는 쪽.
 *
 * 기존에는 toHHMMSS가 4개 파일에, esc가 2개 파일에 복사돼 있었다.
 * 복사본은 갈라진다 — night.html의 타이머는 다 되면 글자를 흰색으로,
 * morning.html은 #484848로 되돌렸다. 같은 타이머인데 화면마다 달랐다.
 *
 * 부모(ZEP 클라이언트)와 주고받는 일은 여기 없다. 전부 bridge.js에 있다 —
 * "글자를 escape한다"와 "부모 창에 키 리스너를 단다"는 같은 파일에 있을
 * 이유가 없고, 섞여 있으면 부모와의 계약이 어디까지인지 보이지 않는다.
 *
 * tools/build-widgets.js가 각 위젯 HTML의 <!--@shared--> 자리에 bridge.js와
 * 함께 인라인한다. 여기는 클라이언트(브라우저·웹뷰)에서 도는 코드다.
 * Jint에서 도는 서버 쪽 src/*.ts 와 달리 최신 문법 제약이 없다.
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
 *
 * 기존에는 위젯마다 문자열 concat으로 태그를 쌓았다. tabHtml() 하나가
 * 22줄이었고, 따옴표와 + 사이에서 esc()를 한 군데 빠뜨려도(chat.html의
 * view.glyph가 그랬다) 눈에 띄지 않았다. 여기서는 빠뜨릴 자리가 없다 —
 * escape가 기본이고, escape를 건너뛰려면 Html 조각이어야 한다.
 */
function html(strings) {
	let out = strings[0];
	for (let i = 1; i < arguments.length; i++) out += frag(arguments[i]) + strings[i];
	return new Html(out);
}

/**
 * boolean 속성. 참이면 속성 이름을, 거짓이면 빈 조각을 낸다.
 *
 *   html`<button class="tile" ${flag(!seat.alive, "disabled")}>`
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
 * $ / $$ 라는 이름이었는데 두 가지 이유로 바꿨다. 하나는 $가 jQuery로
 * 읽힌다는 것이고(이 프로젝트는 라이브러리를 하나도 쓰지 않는다),
 * 다른 하나는 $가 String.replace의 치환 지시자라는 것이다 —
 * 빌드가 shared.js를 인라인하면서 `function $$`를 `function $`로 바꿔
 * 모든 위젯의 $()가 배열을 돌려준 적이 있다. 이름에 $가 없으면
 * 그 사고 자체가 성립하지 않는다.
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
 * 기존 toHHMMSS는 90초를 "00:01:30"으로 그렸다. 이 게임의 최장 단계는
 * 60초라 시(時) 자리는 영원히 00이고, 분 자리도 대부분 00이다.
 * 화면에서 실제로 변하는 것은 초뿐인데 6글자를 읽게 했다.
 *
 * el은 .timer이며 내부에 진행률 링(svg)을 갖는다. 남은 비율을 함께
 * 그려서 숫자를 읽지 않아도 얼마나 남았는지 보이게 한다.
 */
function startTimer(el, seconds) {
	if (!el) return;
	// 같은 위젯이 payload를 두 번 받으면 타이머도 두 개가 된다. 둘 다 살아서
	// 서로 다른 숫자를 번갈아 쓰기 때문에 남은 시간이 튀어 보인다.
	// 이전 것을 먼저 끄면 몇 번을 다시 받든 항상 하나만 돈다.
	if (el.dataset.timerId) clearInterval(Number(el.dataset.timerId));
	const total = Math.max(1, Math.round(seconds));
	let left = total;
	const label = document.createElement("span");
	const RADIUS = 19;
	const CIRC = 2 * Math.PI * RADIUS;

	el.innerHTML = html`<svg viewBox="0 0 44 44" aria-hidden="true">
		<circle class="track" cx="22" cy="22" r="${RADIUS}"></circle>
		<circle
			class="bar"
			cx="22"
			cy="22"
			r="${RADIUS}"
			stroke-dasharray="${CIRC}"
			stroke-dashoffset="0"
		></circle>
	</svg>`;
	el.appendChild(label);
	el.setAttribute("role", "timer");

	const bar = qs(".bar", el);

	function paint() {
		label.textContent = String(Math.max(0, left));
		el.setAttribute("aria-label", "남은 시간 " + Math.max(0, left) + "초");
		bar.style.strokeDashoffset = String(CIRC * (1 - Math.max(0, left) / total));
		// 마지막 10초는 색과 맥동으로도 알린다. 소리를 못 듣는 환경이 있다
		el.classList.toggle("urgent", left <= 10);
		// 마지막 3초는 박동만 빨라진다. 10초를 같은 속도로 뛰면 그 급함이
		// 배경이 되어 정작 끝나는 순간을 놓친다
		el.classList.toggle("critical", left <= 3);
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
