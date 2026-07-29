/*
 * ParentBridge — ZEP 클라이언트(부모 창)와 주고받는 유일한 통로.
 *
 * 왜 따로 있는가
 * --------------
 * 위젯은 ZEP 클라이언트 안의 iframe이다. 그래서 부모와의 대화가 세 종류인데,
 * 지금까지는 셋 다 그냥 window.parent를 직접 만지는 코드였다.
 *
 *   1. 게임 서버(Jint)에게 보내기 — ZEP이 widget.onMessage로 넘겨준다
 *   2. ZEP 클라이언트 자체에게 시키기 — WidgetRearrange 같은 것
 *   3. 부모 문서의 키 입력 가로채기 — 게임 화면에 포커스가 있을 때
 *
 * 셋이 섞여 있으면 "이 postMessage는 서버가 받나 ZEP이 받나"를 볼 때마다
 * 다시 알아내야 한다. 여기 모아두면 부모와의 계약이 이 파일 하나에 다 있다.
 * 빌드(tools/build-widgets.js)가 위젯 HTML에서 window.parent를 직접 쓰면
 * 실패시키므로, 이 파일을 우회하는 길은 막혀 있다.
 *
 * 이벤트를 늘리는 법: 아래 세 묶음 중 맞는 곳에 함수를 하나 더한다.
 * 위젯은 Parent.무엇 만 부르므로 부모 쪽 사정이 바뀌어도 고칠 곳은 여기뿐이다.
 */
const Parent = (function () {
	/*
	 * 부모 문서에 직접 닿을 수 있는가.
	 *
	 * 같은 출처면 부모의 window를 그대로 만질 수 있고, 그러면 게임 화면에
	 * 포커스가 있는 동안 눌린 키까지 받을 수 있다. 교차 출처면 만지는 순간
	 * SecurityError가 나므로 postMessage 말고는 길이 없다.
	 *
	 * 판정은 로드 때 한 번만 하고, 안 되면 조용히 기능을 접는다 — 여기서
	 * 예외가 새어 나가면 위젯 스크립트 전체가 로드에 실패한다.
	 */
	const win = (function () {
		try {
			// 존재 확인만으로는 부족하다. 실제로 읽어야 교차 출처가 드러난다
			void window.parent.document.readyState;
			return window.parent;
		} catch (error) {
			return null;
		}
	})();

	/*
	 * 프레임보다 오래 살아야 하는 것을 두는 자리.
	 *
	 * 채팅창 접기/펴기는 CSS가 아니라 크기가 다른 위젯으로 다시 여는
	 * 것이라(Widgets.ts의 openChat) 그때마다 문서가 통째로 새로 만들어진다.
	 * 입력 기록 같은 것을 위젯 안에만 두면 접을 때마다 지워진다.
	 *
	 * 교차 출처면 그냥 빈 객체다 — 기능이 사라지는 게 아니라 수명만 짧아진다.
	 */
	const store = (function () {
		if (!win) return {};
		if (!win.__mafiaWidget) win.__mafiaWidget = {};
		return win.__mafiaWidget;
	})();

	// ────────────────────────────────────────────── 1. 게임 서버에게

	/** 게임 서버(widget.onMessage)로 보낸다 */
	function send(message) {
		window.parent.postMessage(message, "*");
	}

	/**
	 * 서버 메시지 구독. type별 핸들러 표를 받는다.
	 *
	 * 기존 위젯은 전부 addEventListener("message") + switch였고, morning/night는
	 * type을 아예 보지 않아 어떤 메시지가 와도 타이머를 다시 시작했다.
	 */
	function on(handlers) {
		window.addEventListener("message", function (event) {
			const data = event && event.data;
			if (!data) return;
			// 크기는 메시지 종류와 상관없이 실려 온다. 위젯이 "부르는 것을 잊는"
			// 자리를 없애기 위해 핸들러보다 먼저, 표에 없는 종류에도 적용한다.
			if (data.layout) applyLayout(data.layout);
			const handler = handlers[data.type];
			if (handler) handler(data);
		});
	}

	// ────────────────────────────────────────────── 2. ZEP 클라이언트에게

	/**
	 * 위젯이 차지할 상자를 ZEP 클라이언트에게 알린다.
	 * 서버가 아니라 클라이언트가 읽고 처리하는 메시지다.
	 *
	 * 기존 구조의 문제
	 * ----------------
	 * 여기서 기기를 보고 크기를 스스로 정했다(rearrange). 그런데 세로는
	 * 아무도 정하지 않아 모바일에서도 데스크톱 픽셀이 그대로 남았고,
	 * 이 함수를 부를지 말지는 위젯 각자의 자유라 채팅과 직업 카드는
	 * 아예 부르지 않았다 — 모바일 보정이 통째로 빠진 화면이 둘 있었다.
	 *
	 * 지금은 서버(Widgets.ts의 layoutOf)가 한 곳에서 정해 payload에 실어
	 * 보내고, 여기서는 받은 대로 넘기기만 한다. 기기 판정도 서버가 한다
	 * (player.isMobile / isTablet) — window.screen.width로 태블릿을
	 * 넘겨짚을 이유가 없어졌다.
	 */
	function applyLayout(layout) {
		const message = {
			type: "WidgetRearrange",
			anchor: layout.anchor,
			width: layout.width,
			height: layout.height,
		};
		// 상단바 보정은 위쪽에 붙는 위젯에만 실려 온다
		if (layout.top) message.top = layout.top;
		send(message);
	}

	// ────────────────────────────────────────────── 3. 부모 문서의 키 입력

	/** 남이 글을 쓰고 있는 칸인가. ZEP 기본 채팅 입력창이 여기 걸린다 */
	function editable(el) {
		if (!el || !el.tagName) return false;
		const tag = String(el.tagName).toUpperCase();
		if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
		return el.isContentEditable === true;
	}

	/**
	 * 게임 화면(캔버스)에 포커스가 있는 동안 눌린 키를 받는다.
	 *
	 * 위젯 안에 포커스가 있을 때는 여기로 오지 않는다 — 키 이벤트는 프레임
	 * 경계를 넘지 않기 때문이다. 그래서 "게임 중일 때"와 "채팅 치는 중일 때"를
	 * 따로 판정할 필요가 없다. 브라우저가 이미 나눠준다.
	 *
	 * 같은 이유로 "채팅 입력 중 이동·단축키 비활성화"도 따로 할 일이 없다.
	 * 입력창에 포커스가 있으면 WASD는 애초에 ZEP 캔버스에 도달하지 않는다.
	 *
	 * 돌려주는 함수를 부르면 구독이 끊긴다. 프레임이 사라질 때도 자동으로 끊는다.
	 */
	function onKey(handler) {
		if (!win) return function () {};

		function off() {
			win.removeEventListener("keydown", listener, true);
			window.removeEventListener("pagehide", off);
		}

		function listener(event) {
			// 접었다 펴는 순간 옛 프레임과 새 프레임이 잠깐 함께 산다.
			// 죽은 쪽이 반응하면 이미 사라진 입력창에 포커스를 주게 된다.
			const frame = window.frameElement;
			if (frame && frame.isConnected === false) {
				off();
				return;
			}
			// 부모에는 ZEP 기본 채팅 입력창이 그대로 남아 있다(0.16.5에는 숨기는
			// API가 없다). 남이 글을 쓰고 있는 칸은 건드리지 않는다.
			if (editable(event.target)) return;
			// 조합키는 브라우저와 ZEP의 몫이다
			if (event.altKey || event.ctrlKey || event.metaKey) return;
			handler(event);
		}

		// 부모 window의 캡처 단계. 이 프레임에서 닿을 수 있는 가장 이른 지점이다.
		// 그래도 ZEP이 먼저 등록한 리스너보다 앞설 수는 없다 — 같은 대상·같은
		// 단계에서는 등록 순서가 곧 실행 순서고, 부모 문서가 우리보다 먼저 뜬다.
		win.addEventListener("keydown", listener, true);
		// 위젯이 파괴되면 부모에는 리스너만 남는다. 반드시 같이 떼야 한다
		window.addEventListener("pagehide", off);
		return off;
	}

	/**
	 * 이 프레임으로 포커스를 가져온다.
	 *
	 * 부모 문서에서 키를 받아 들어오는 길에서는 포커스가 아직 캔버스에 있다.
	 * 안쪽 엘리먼트에 focus()만 하면 되는 경우가 대부분이지만, 프레임 자체를
	 * 먼저 깨워두는 편이 확실하다.
	 */
	function grabFocus() {
		window.focus();
	}

	return {
		send,
		on,
		onKey,
		grabFocus,
		store,
		/** 게임 화면의 키 입력을 받을 수 있는가 (부모와 같은 출처인가) */
		canReadKeys: win !== null,
	};
})();
