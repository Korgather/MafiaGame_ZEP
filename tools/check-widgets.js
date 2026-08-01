/*
 * 빌드된 위젯을 실제로 열어본다: res/*.html
 *
 * 왜 필요한가
 * -----------
 * 테스트는 src/ 만 본다. res/*.html은 아무도 로드하지 않았다.
 * 그래서 이런 일이 있었다 — build-widgets.js가 String.replace의 치환
 * 지시자($$) 때문에 shared.js의 `function $$`를 `function $`로 바꿔서
 * 내보냈고, 산출물에서 $가 두 번 정의돼 모든 위젯의 $()가 엘리먼트 대신
 * 배열을 돌려줬다. type-check도 lint도 test도 build도 전부 통과했다.
 * ZEP에 올려서 게임을 켠 사람이 콘솔을 보고서야 알았다.
 *
 * 빠져 있던 것은 "산출물을 한 번 열어본다"는 단계 하나뿐이었다.
 * 이 파일이 그 단계다. 각 res/*.html의 <script>를 실제로 실행하고,
 * tools/widget-scenes.js의 payload를 서버처럼 던져 넣는다.
 * 하나라도 예외가 나거나 console.error가 찍히면 빌드가 멈춘다.
 *
 * DOM은 여기서 직접 만든다 (jsdom 같은 의존성 없음). 필요한 것은
 * 위젯이 실제로 쓰는 만큼 — 선택자, class, dataset, innerHTML뿐이다.
 * 완전한 브라우저가 아니어도 "선택자가 아무것도 못 찾는다", "없는
 * 함수를 부른다", "핸들러가 던진다"는 전부 여기서 잡힌다.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { SCENES } = require("./widget-scenes.js");

const ROOT = path.join(__dirname, "..");
const RES = path.join(ROOT, "res");

/** 닫는 태그가 없는 것들. 스택에 쌓으면 그 뒤가 전부 자식이 된다 */
const VOID_TAGS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"source",
	"track",
	"wbr",
]);

const TAG = /<(\/?)([a-z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/gi;
const ATTR = /([\w:.-]+)(?:\s*=\s*"([^"]*)")?/g;

function parseAttrs(text) {
	const attrs = {};
	let m;
	ATTR.lastIndex = 0;
	while ((m = ATTR.exec(text))) attrs[m[1].toLowerCase()] = m[2] === undefined ? "" : m[2];
	return attrs;
}

/**
 * 태그만 세는 최소 파서. 텍스트 노드는 만들지 않는다 —
 * 위젯이 선택자로 찾는 것은 전부 엘리먼트다.
 */
function parseNodes(html, parent) {
	const roots = [];
	const stack = [];
	let m;
	TAG.lastIndex = 0;
	while ((m = TAG.exec(html))) {
		const tag = m[2].toLowerCase();
		if (m[1]) {
			for (let i = stack.length - 1; i >= 0; i--) {
				if (stack[i].tag === tag) {
					stack.length = i;
					break;
				}
			}
			continue;
		}
		const node = { tag, attrs: parseAttrs(m[3]), children: [], parent: null, el: null };
		const top = stack[stack.length - 1];
		node.parent = top || parent || null;
		(top ? top.children : roots).push(node);
		if (!m[4] && !VOID_TAGS.has(tag)) stack.push(node);
	}
	return roots;
}

const SELECTOR = /^([.#]?)([\w-]+)(?:\[([\w-]+)="([^"]*)"\])?$/;

function matches(node, selector) {
	const m = SELECTOR.exec(selector.trim());
	// 못 읽는 선택자는 조용히 null을 돌려주면 안 된다. 이 검사기가
	// 못 따라간 것인지 위젯이 틀린 것인지 구분되지 않기 때문이다.
	if (!m) throw new Error(`검사기가 읽지 못한 선택자: ${selector}`);
	const [, kind, name, attr, value] = m;

	if (kind === "#") {
		if (node.attrs.id !== name) return false;
	} else if (kind === ".") {
		if (!(node.attrs.class || "").split(/\s+/).includes(name)) return false;
	} else if (node.tag !== name.toLowerCase()) {
		return false;
	}
	return !attr || node.attrs[attr] === value;
}

function walk(nodes, visit) {
	for (const node of nodes) {
		if (visit(node) === false) return false;
		if (walk(node.children, visit) === false) return false;
	}
	return true;
}

function camel(name) {
	return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * 엘리먼트 스텁 하나. 노드당 한 번만 만들어 재사용한다 —
 * 매번 새로 만들면 classList.toggle이 다음 호출에서 사라진다.
 */
function element(node, doc) {
	if (node.el) return node.el;

	const attrs = node.attrs;
	const dataset = {};
	for (const key of Object.keys(attrs)) {
		if (key.startsWith("data-")) dataset[camel(key.slice(5))] = attrs[key];
	}
	const classes = new Set((attrs.class || "").split(/\s+/).filter(Boolean));

	const el = {
		tagName: node.tag.toUpperCase(),
		dataset,
		style: {},
		textContent: "",
		value: "",
		placeholder: "",
		scrollTop: 0,
		scrollHeight: 0,
		clientHeight: 0,
		classList: {
			add(...names) {
				for (const name of names) classes.add(name);
			},
			remove(...names) {
				for (const name of names) classes.delete(name);
			},
			toggle(name, force) {
				const on = force === undefined ? !classes.has(name) : !!force;
				if (on) classes.add(name);
				else classes.delete(name);
				return on;
			},
			contains(name) {
				return classes.has(name);
			},
		},
		get innerHTML() {
			return node.inner || "";
		},
		set innerHTML(value) {
			// innerHTML 세터는 명세상 인자를 ToString한다. html`` 이 돌려주는
			// Html 조각이 그대로 들어오는 자리라, 여기서도 똑같이 해야 한다.
			const text = String(value);
			doc.sawHtml(text);
			node.inner = text;
			node.children = parseNodes(text, node);
		},
		insertAdjacentHTML(position, value) {
			const text = String(value);
			doc.sawHtml(text);
			const kids = parseNodes(text, node);
			if (position === "beforeend") node.children.push(...kids);
			else if (position === "afterbegin") node.children.unshift(...kids);
			else throw new Error(`검사기가 모르는 위치: ${position}`);
		},
		appendChild(child) {
			if (child && child.__node) node.children.push(child.__node);
			return child;
		},
		removeChild(child) {
			node.children = node.children.filter(n => n !== (child && child.__node));
			return child;
		},
		remove() {
			if (node.parent) node.parent.children = node.parent.children.filter(n => n !== node);
		},
		get firstElementChild() {
			return node.children.length > 0 ? element(node.children[0], doc) : null;
		},
		get childElementCount() {
			return node.children.length;
		},
		// 클릭은 흉내내지 않지만 키는 흉내낸다. 채팅 입력창의 Enter·Escape·
		// Tab·↑↓은 마우스만큼 자주 쓰는 조작이라 눌러보지 않으면 검사가 반쪽이다
		addEventListener(type, handler) {
			if (type === "keydown") doc.keys.push({ el, handler });
		},
		/*
		 * disabled는 반사되는 속성이다. 브라우저에서 el.disabled = true 는
		 * disabled="" 를 붙이고 false 는 그 속성을 지운다.
		 *
		 * 스텁이 이걸 흉내내지 않으면 잠긴 버튼을 button[disabled=""] 로
		 * 세는 장면이 프로퍼티로 잠근 버튼을 못 본다 — 잠금이 통째로
		 * 빠져도 검사는 초록이다. 위젯 셋이 이 방식으로 잠근다
		 * (vote의 '투표 없음', judgement의 찬반, roleAction의 못 고를 자리).
		 */
		get disabled() {
			return "disabled" in attrs;
		},
		set disabled(on) {
			if (on) attrs.disabled = "";
			else delete attrs.disabled;
		},
		setAttribute(name, value) {
			attrs[name.toLowerCase()] = String(value);
		},
		getAttribute(name) {
			const key = name.toLowerCase();
			return key in attrs ? attrs[key] : null;
		},
		focus() {},
		blur() {},
		setSelectionRange() {},
		// 클릭을 흉내내지는 않으므로 위임 핸들러 안쪽까지는 가지 않는다
		closest() {
			return null;
		},
		querySelector(selector) {
			return doc.find(node.children, selector);
		},
		querySelectorAll(selector) {
			return doc.findAll(node.children, selector);
		},
		__node: node,
	};

	node.el = el;
	return el;
}

function makeDocument(source, report) {
	const stripped = source.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
	const roots = parseNodes(stripped, null);

	const doc = {
		/** 엘리먼트에 걸린 keydown 핸들러들. 장면을 다 넣은 뒤 실제로 눌러본다 */
		keys: [],
		sawHtml(text) {
			// 조각이 조각을 만나는 자리에서 표시가 벗겨지면 여기에 찍힌다.
			// html`` 대신 객체를 그냥 끼워 넣어도 마찬가지다.
			if (text.includes("[object Object]")) {
				report(`HTML에 [object Object]가 들어갔습니다: ${text.slice(0, 120)}`);
			}
		},
		find(nodes, selector) {
			let found = null;
			walk(nodes, node => {
				if (!matches(node, selector)) return true;
				found = element(node, doc);
				return false;
			});
			return found;
		},
		findAll(nodes, selector) {
			const out = [];
			walk(nodes, node => {
				if (matches(node, selector)) out.push(element(node, doc));
				return true;
			});
			return out;
		},
		querySelector(selector) {
			return doc.find(roots, selector);
		},
		querySelectorAll(selector) {
			return doc.findAll(roots, selector);
		},
		createElement(tag) {
			return element({ tag, attrs: {}, children: [], parent: null, el: null }, doc);
		},
	};

	return doc;
}

/**
 * 부모 창(ZEP 클라이언트)의 webpack 내부를 흉내낸다.
 *
 * native-chat.js는 공개 API가 없어 클라이언트 번들 안을 뒤져
 * GameConnection을 찾는다. 그 탐색은 못 찾으면 조용히 접도록 만들어져 있다 —
 * 말풍선은 덤이고 채팅 자체는 서버로 배달되니까. 대신 깨져도 예외도 로그도
 * 남지 않아서, 여기서 세지 않으면 기능이 통째로 사라진 것을 아무도 모른다.
 *
 * 진짜와 같은 함정을 심는다. 읽는 순간 던지는 export와, 서명이 반쯤 맞는
 * 가짜다. 둘 다 실제 클라이언트의 성질이다 — GameConnection.send와 instance는
 * getter이고 연결이 없으면 읽는 즉시 던진다. 그래서 탐색은 값을 읽지 않고
 * 이름만으로 서명을 확인해야 하고, 하나가 던졌다고 탐색 전체를 포기해도
 * 안 된다. 함정을 진짜보다 앞에 둔 이유다.
 *
 * @param {Array<{type: string, payload: unknown}>} spoken 나간 패킷을 적어 둘 곳
 * @param {string[]} executed 탐색이 실행시킨, 실행되면 안 되는 모듈들
 * @param {"cache"|"factories"} mode 런타임이 내주는 길.
 *   "cache"는 require.c가 있는 빌드(dev), "factories"는 없는 빌드(프로덕션).
 *   실제로 프로덕션에서 .c가 없어 기능이 조용히 죽었다.
 */
function fakeZepClient(spoken, executed, mode) {
	/*
	 * 모듈 팩토리들. 클래스 본문이 팩토리 안에 있어야 한다 — 탐색은 팩토리
	 * 소스에서 서명 이름을 찾아 후보를 좁히므로, 밖에 두면 진짜 번들과 달리
	 * 소스에 이름이 없어서 사전 필터가 검사되지 않는다.
	 */
	const factories = {
		/*
		 * 서명과 상관없는 모듈. 소스에 isMigrating이 없으니 탐색이 이 모듈을
		 * 실행해서는 안 된다 — 아직 실행되지 않은 남의 모듈을 임의로 돌리는
		 * 것은 부작용이고, 말풍선이 덤이라는 원칙에 어긋난다.
		 */
		"1": function irrelevant() {
			executed.push("1");
			return { plain: {} };
		},

		/*
		 * 서명 이름을 소스에 갖고 있지만 GameConnection은 아닌 모듈.
		 * PlayLostConnection이 실제로 이렇다 — isMigrating만 읽는다.
		 * 사전 필터는 통과하므로 여기서 멈추면 안 된다.
		 */
		"2": function reader() {
			class NotConnection {
				static get instance() {
					throw new Error("연결이 없습니다");
				}
				static get send() {
					throw new Error("연결이 없습니다");
				}
			}
			NotConnection.isMigrating = false;
			return { NotConnection, plain: {} };
		},

		/** 진짜 */
		"3": function real() {
			class GameConnection {
				static get instance() {
					return {};
				}
				static get send() {
					return (type, payload) => spoken.push({ type, payload });
				}
				static connect() {}
			}
			GameConnection.isMigrating = false;
			return { GameConnection };
		},
	};

	/** 이미 만들어진 모듈들. require.c에 담기는 것 */
	const instances = {};
	const req = id => {
		if (!(id in instances)) instances[id] = { exports: factories[id]() };
		return instances[id].exports;
	};
	req.m = factories;
	if (mode === "cache") {
		// 살아 있는 클라이언트라면 GameConnection은 이미 만들어져 있다.
		// 1번은 청크만 받고 아직 실행되지 않은 모듈로 남겨 둔다.
		req("2");
		req("3");
		req.c = instances;
	}

	/*
	 * 런타임이 아직 붙지 않은 청크 큐. push가 그냥 Array.prototype.push라
	 * 런타임 콜백이 불리지 않는다. 첫 후보에서 멈추면 이런 빌드에서 실패한다.
	 */
	const bare = [];

	const live = [];
	live.push = chunk => {
		const ids = chunk && chunk[0];
		/*
		 * webpack은 chunkIds.some(id => installedChunks[id] !== 0)이 참일 때만
		 * 런타임 콜백을 부른다. 빈 배열의 some()은 항상 거짓이라, 청크 ID를
		 * 비우면 예외도 경고도 없이 아무 일도 일어나지 않는다.
		 */
		if (!Array.isArray(ids) || ids.length === 0) return 0;
		const done = chunk[2];
		if (typeof done === "function") done(req);
		return 0;
	};

	/*
	 * 전역 이름을 일부러 다르게 준다.
	 *
	 * 첫 구현이 webpackChunkzep을 박아 뒀다가 프로덕션(webpackChunk_N_E)에서
	 * 못 찾았다. 이름은 빌드 설정에서 나오는 값이라 규칙이 아니다 — 검사기가
	 * 실제 이름을 그대로 쓰면 그 의존이 되살아나도 아무도 모른다.
	 */
	return { webpackChunkNothingHere: bare, webpackChunkSomeOtherName: live };
}

/**
 * @param {string} name 검사할 위젯 파일 이름
 * @param {"cache"|"factories"|"none"} client 부모 창에 심어 둘 환경.
 *   "cache"는 require.c가 있는 빌드, "factories"는 없는 빌드(프로덕션),
 *   "none"은 클라이언트 내부를 아예 못 찾는 경우다. 셋 다 실제로 일어나고
 *   지나가는 코드가 서로 다르다. "none"이 실제 스페이스 대부분인데 —
 *   위젯 iframe은 동일 출처 허용을 켜지 않으면 부모를 못 읽는다 — 그 길이
 *   조용히 성공해야 채팅창 자체가 멈추지 않는다.
 */
function checkWidget(name, client) {
	const source = fs.readFileSync(path.join(RES, name), "utf8");
	const problems = [];
	const report = message => problems.push(message);
	const document = makeDocument(source, report);

	const listeners = [];
	/** 부모 문서(게임 화면)에 걸린 keydown 핸들러들 */
	const parentKeys = [];
	/** 위젯이 ZEP 클라이언트로 쏜 패킷들 */
	const spoken = [];
	/** 탐색이 실행시킨, 실행되면 안 되는 모듈들 */
	const executed = [];
	let timerSeq = 0;

	/*
	 * 부모는 같은 출처인 것으로 둔다.
	 *
	 * bridge.js는 window.parent.document를 실제로 읽어 교차 출처를 판정한다.
	 * document가 없으면 거기서 예외가 나 canReadKeys가 false가 되고, 그러면
	 * 게임 화면에서 Enter를 받는 길이 통째로 검사되지 않는다 — 이번 변경의
	 * 핵심이 바로 그 길이라 검사기는 되는 쪽을 흉내내야 한다.
	 */
	const window = {
		parent: {
			postMessage() {},
			document: { readyState: "complete" },
			// 포커스를 게임 화면으로 되돌리는 길(Parent.releaseFocus). 진짜
			// 부모 창에는 당연히 있는 함수라 흉내에도 있어야 한다 — 빠뜨리면
			// "예외 없이 지나가는가"를 보는 이 검사기가 흉내의 구멍을
			// 위젯의 버그로 보고한다
			focus() {},
			addEventListener(type, handler) {
				if (type === "keydown") parentKeys.push(handler);
			},
			removeEventListener() {},
			...(client === "none" ? {} : fakeZepClient(spoken, executed, client)),
		},
		screen: { width: 1280 },
		// iframe이 살아 있는 상태. bridge.js가 죽은 프레임을 걸러내는 데 쓴다
		frameElement: null,
		focus() {},
		addEventListener(type, handler) {
			if (type === "message") listeners.push(handler);
		},
		removeEventListener() {},
	};

	const sandbox = {
		window,
		document,
		console: {
			log() {},
			warn() {},
			error(...args) {
				report(`console.error: ${args.join(" ")}`);
			},
		},
		// 타이머는 등록만 하고 울리지 않는다. 울리면 검사가 영영 끝나지 않는다 —
		// 위젯의 startTimer는 남은 초가 0이 될 때까지 1초마다 돈다.
		setInterval: () => ++timerSeq,
		clearInterval() {},
		setTimeout: () => ++timerSeq,
		clearTimeout() {},
		// 반대로 rAF는 즉시 부른다. 콜백 안에서 나는 예외를 놓치지 않기 위해서다
		requestAnimationFrame(fn) {
			fn(0);
			return ++timerSeq;
		},
	};
	sandbox.globalThis = sandbox;
	vm.createContext(sandbox);

	const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
	if (scripts.length === 0) return [`${name}: <script>가 하나도 없습니다`];

	// 브라우저에서 여러 <script>는 같은 전역을 공유한다. 합쳐서 한 번에 돌린다 —
	// 따로 돌리면 shared.js가 정의한 함수를 위젯 스크립트가 못 본다.
	try {
		vm.runInContext(scripts.join("\n"), sandbox, { filename: name, timeout: 5000 });
	} catch (error) {
		report(`로드 중 예외: ${error.message}`);
		return problems.map(p => `${name}: ${p}`);
	}

	if (listeners.length === 0) report("서버 메시지를 구독하지 않았습니다");

	// Parent.onKey를 부르고도 부모에 아무것도 안 걸렸다면 같은 출처 판정이
	// 깨진 것이다. 그러면 아래 pressKeys는 돌 것이 없어 조용히 통과한다 —
	// 검사가 없어졌다는 사실 자체를 놓치게 된다.
	if (source.includes("Parent.onKey(") && parentKeys.length === 0) {
		report("Parent.onKey를 불렀는데 부모 문서에 keydown이 걸리지 않았습니다");
	}

	/** 장면이 "이 줄을 말풍선으로 내보내라"고 지시한 내용들 */
	const asked = [];
	for (const scene of SCENES) {
		if (scene.file !== name) continue;
		for (const message of scene.messages) {
			if (message.type === "say") asked.push(message);
			for (const handler of listeners) {
				try {
					handler({ data: { ...message, isMobile: false } });
				} catch (error) {
					report(`[${scene.label}] ${message.type} 처리 중 예외: ${error.message}`);
				}
			}
		}

		/*
		 * 장면이 "화면에 이런 것이 몇 개 있어야 한다"고 적어둔 것 (scene.expect).
		 *
		 * 지금까지 이 검사기가 본 것은 "예외 없이 그려졌는가"뿐이었다. 그래서
		 * 어떤 줄이 어떤 모습으로 나가는지는 아무도 지키지 않았다 — 귓속말이
		 * 잡담과 같은 글씨로 나가던 것이 정확히 그 틈이다. 눈에만 보이는 차이는
		 * 눈을 뗀 순간 사라진다.
		 *
		 * 색이나 크기까지 보지는 않는다. 그건 theme.css의 몫이고 여기서 흉내내면
		 * 시트를 두 벌 관리하게 된다. 대신 "그 모습을 고르는 갈림길을 지났는가"를
		 * class 하나로 확인한다. 갈림길이 사라지면 개수가 어긋나 걸린다.
		 */
		for (const selector of Object.keys(scene.expect || {})) {
			const want = scene.expect[selector];
			const found = document.querySelectorAll(selector).length;
			if (found !== want) {
				report(`[${scene.label}] ${selector} ${want}개를 기대했는데 ${found}개입니다`);
			}
		}
	}

	/*
	 * 지시한 만큼, 지시한 내용 그대로, 지시한 청중에게 나갔는가.
	 *
	 * 위젯은 무엇을 말할지도 누구에게 말할지도 스스로 정하지 않는다 — 판정은
	 * 서버(ChatService)에만 있고, 여기 한 줄이 그 약속을 지킨다. 위젯이 한
	 * 글자라도 보태거나 빼면, 청중을 바꿔치우면 걸린다.
	 *
	 * 청중이 없는 지시(area 없음)는 want에서 빠진다. 즉 "아무것도 나가지
	 * 않아야 한다"가 기댓값이다 — 위젯이 기본값으로 메꾸면 이 자리에 패킷
	 * 하나가 더 나와 걸린다.
	 */
	if (asked.length > 0 && client !== "none") {
		const want = asked
			.filter(say => say.area)
			.map(say => ({
				type: "Z_NET_CHAT_MESSAGE_REQUEST",
				payload: { message: say.text, chatAreaType: say.area },
			}));
		if (JSON.stringify(spoken) !== JSON.stringify(want)) {
			report(`말풍선 패킷이 다릅니다\n    나간 것:   ${JSON.stringify(spoken)}\n    나가야 할 것: ${JSON.stringify(want)}`);
		}
	}

	// 찾다가 남의 모듈을 실행시키지 않았는가. 팩토리 등록부에는 청크만 받고
	// 아직 실행되지 않은 모듈이 섞여 있고, require(id)는 그런 모듈을 그 자리에서
	// 돌린다. 사전 필터 없이 전부 부르면 살아 있는 게임 화면에서 무슨 일이
	// 벌어질지 알 수 없다.
	if (executed.length > 0) {
		report(`탐색이 관계없는 모듈을 실행했습니다: ${executed.join(", ")}`);
	}

	// 장면을 다 넣은 뒤에 눌러본다. 빈 화면에서 누르는 것과 탭·줄이 다
	// 들어찬 화면에서 누르는 것은 지나가는 코드가 다르다.
	pressKeys(document.keys, parentKeys, report);

	return problems.map(p => `${name}: ${p}`);
}

/** 실제로 눌러보는 키. 채팅 위젯이 다루는 것 전부다 */
const KEYS = ["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "/", "a"];

function keyEvent(key, shiftKey, target) {
	return {
		key,
		shiftKey,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		target,
		preventDefault() {},
		stopPropagation() {},
		stopImmediatePropagation() {},
	};
}

/**
 * 키를 눌러본다. 확인하는 것은 "예외 없이 지나가는가" 하나다.
 *
 * 무엇이 포커스를 받았는지까지 보려면 진짜 DOM이 필요하고, 그러면 이 검사기가
 * 브라우저가 된다. 실제로 깨졌던 것들 — 없는 함수 호출(setSelectionRange),
 * 빈 배열에서의 인덱스 계산, 아직 안 그려진 엘리먼트 참조 — 은 전부 예외로
 * 드러나므로 여기까지가 값이 있는 만큼이다.
 */
function pressKeys(elementKeys, parentKeys, report) {
	// 게임 화면에서 누른 것처럼. ZEP 기본 채팅 입력창에 대고 누른 경우도 함께 —
	// 그때는 bridge.js가 걸러내야 한다
	const outside = [
		{ tagName: "CANVAS", isContentEditable: false },
		{ tagName: "INPUT", isContentEditable: false },
	];

	for (const key of KEYS) {
		for (const target of outside) {
			for (const handler of parentKeys) {
				try {
					handler(keyEvent(key, false, target));
				} catch (error) {
					report(`게임 화면에서 ${key} 처리 중 예외: ${error.message}`);
				}
			}
		}

		for (const shiftKey of [false, true]) {
			for (const entry of elementKeys) {
				try {
					entry.handler(keyEvent(key, shiftKey, entry.el));
				} catch (error) {
					report(`위젯에서 ${shiftKey ? "Shift+" : ""}${key} 처리 중 예외: ${error.message}`);
				}
			}
		}
	}
}

function check() {
	const names = fs
		.readdirSync(RES)
		.filter(name => name.endsWith(".html"))
		.sort();

	if (names.length === 0) throw new Error("res 에 위젯이 없습니다");

	const covered = new Set(SCENES.map(scene => scene.file));
	const problems = [];

	for (const name of names) {
		// 장면이 없는 위젯은 로드까지만 확인된다. 조용히 넘어가면
		// "검사했다"는 말이 반쪽이 되므로 소리 내어 알린다.
		if (!covered.has(name)) problems.push(`${name}: widget-scenes.js에 장면이 없습니다`);
		// 세 환경을 모두 걷는다. 지나가는 코드가 서로 다르고 전부 실제로
		// 일어난다 — 빌드에 따라 require.c가 있기도 없기도 하고, 스페이스
		// 설정에 따라 부모 창을 아예 못 읽기도 한다.
		for (const client of ["cache", "factories", "none"]) {
			problems.push(...checkWidget(name, client).map(p => `${p} [${client}]`));
		}
	}

	if (problems.length > 0) {
		console.error("위젯 검사 실패:");
		for (const problem of problems) console.error(`  - ${problem}`);
		process.exit(1);
	}

	console.log(`위젯 ${names.length}개 로드 확인 (장면 ${SCENES.length}개)`);
}

check();
