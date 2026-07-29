/*
 * 위젯 공통 스크립트.
 *
 * 기존에는 toHHMMSS가 4개 파일에, esc가 2개 파일에 복사돼 있었다.
 * 복사본은 갈라진다 — night.html의 타이머는 다 되면 글자를 흰색으로,
 * morning.html은 #484848로 되돌렸다. 같은 타이머인데 화면마다 달랐다.
 *
 * tools/build-widgets.js가 각 위젯 HTML의 <!--@shared--> 자리에 인라인한다.
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

function $(selector, root) {
	return (root || document).querySelector(selector);
}

function $$(selector, root) {
	return Array.prototype.slice.call((root || document).querySelectorAll(selector));
}

/** 부모(ZEP 클라이언트)에게 보낸다 */
function send(message) {
	window.parent.postMessage(message, "*");
}

/**
 * 서버 메시지 구독. type별 핸들러 표를 받는다.
 *
 * 기존 위젯은 전부 addEventListener("message") + switch였고, morning/night는
 * type을 아예 보지 않아 어떤 메시지가 와도 타이머를 다시 시작했다.
 */
function onServer(handlers) {
	window.addEventListener("message", function (event) {
		var data = event && event.data;
		if (!data) return;
		var handler = handlers[data.type];
		if (handler) handler(data);
	});
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
	var total = Math.max(1, Math.round(seconds));
	var left = total;
	var label = document.createElement("span");
	var RADIUS = 19;
	var CIRC = 2 * Math.PI * RADIUS;

	el.innerHTML =
		'<svg viewBox="0 0 44 44" aria-hidden="true">' +
		'<circle class="track" cx="22" cy="22" r="' +
		RADIUS +
		'"></circle>' +
		'<circle class="bar" cx="22" cy="22" r="' +
		RADIUS +
		'" stroke-dasharray="' +
		CIRC +
		'" stroke-dashoffset="0"></circle>' +
		"</svg>";
	el.appendChild(label);
	el.setAttribute("role", "timer");

	var bar = $(".bar", el);

	function paint() {
		label.textContent = String(Math.max(0, left));
		el.setAttribute("aria-label", "남은 시간 " + Math.max(0, left) + "초");
		bar.style.strokeDashoffset = String(CIRC * (1 - Math.max(0, left) / total));
		// 마지막 10초는 색과 맥동으로도 알린다. 소리를 못 듣는 환경이 있다
		if (left <= 10) el.classList.add("urgent");
		else el.classList.remove("urgent");
	}

	paint();
	var id = setInterval(function () {
		left--;
		paint();
		if (left <= 0) clearInterval(id);
	}, 1000);
	el.dataset.timerId = String(id);
	return id;
}

/**
 * 위젯 위치 보정.
 *
 * 기존에는 이 계산이 3개 파일에 서로 다르게 복사돼 있었다. 대기실은
 * 태블릿을 768px로, 밤 위젯은 같은 768px을 다른 의미로 썼고, 투표·개표
 * 화면은 보정 자체가 없어 모바일에서 화면 밖으로 나갔다.
 */
function rearrange(isMobile) {
	if (!isMobile) {
		send({ type: "WidgetRearrange", top: "-12px", anchor: "topright" });
		return;
	}
	var tablet = window.screen.width >= 768;
	send({
		type: "WidgetRearrange",
		anchor: "top",
		top: tablet ? "-40px" : "-24px",
		width: tablet ? "60%" : "96%",
	});
}

/** 로그 맨 아래로. 붙인 뒤에 호출해야 한다 */
function scrollToEnd(el) {
	if (el) el.scrollTop = el.scrollHeight;
}
