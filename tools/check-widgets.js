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
		disabled: "disabled" in attrs,
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
		addEventListener() {},
		setAttribute(name, value) {
			attrs[name.toLowerCase()] = String(value);
		},
		getAttribute(name) {
			const key = name.toLowerCase();
			return key in attrs ? attrs[key] : null;
		},
		focus() {},
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

function checkWidget(name) {
	const source = fs.readFileSync(path.join(RES, name), "utf8");
	const problems = [];
	const report = message => problems.push(message);
	const document = makeDocument(source, report);

	const listeners = [];
	let timerSeq = 0;

	const window = {
		parent: { postMessage() {} },
		screen: { width: 1280 },
		addEventListener(type, handler) {
			if (type === "message") listeners.push(handler);
		},
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

	for (const scene of SCENES) {
		if (scene.file !== name) continue;
		for (const message of scene.messages) {
			for (const handler of listeners) {
				try {
					handler({ data: { ...message, isMobile: false } });
				} catch (error) {
					report(`[${scene.label}] ${message.type} 처리 중 예외: ${error.message}`);
				}
			}
		}
	}

	return problems.map(p => `${name}: ${p}`);
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
		problems.push(...checkWidget(name));
	}

	if (problems.length > 0) {
		console.error("위젯 검사 실패:");
		for (const problem of problems) console.error(`  - ${problem}`);
		process.exit(1);
	}

	console.log(`위젯 ${names.length}개 로드 확인 (장면 ${SCENES.length}개)`);
}

check();
