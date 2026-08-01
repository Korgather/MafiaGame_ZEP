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
