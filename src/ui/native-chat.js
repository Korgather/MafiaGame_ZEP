/*
 * NativeChat — ZEP 기본 채팅으로 한 줄 내보내기.
 *
 * 왜 따로 있는가
 * --------------
 * 이 게임의 발언을 아바타 말풍선으로도 띄우려면 클라이언트가 서버로 쏘는
 * 채팅 패킷(Z_NET_CHAT_MESSAGE_REQUEST)을 직접 보내는 수밖에 없다.
 * zep-script에는 대응하는 함수가 없다 — sayToAll·sendMessage는 앱이
 * 말하는 시스템 줄이라 말한 사람이 누구인지가 붙지 않는다.
 *
 * 그래서 부모 창의 webpack 내부를 뒤진다. bridge.js와는 성격이 다르다.
 * 저쪽은 ZEP이 문서로 약속한 창구(postMessage)이고 이쪽은 약속되지 않은
 * 내부 구조에 기대는 길이다. 같은 파일에 두면 "부모와의 계약"과 "부모의
 * 속사정"이 한 덩어리로 보여서, 클라이언트가 새로 배포됐을 때 무엇이
 * 깨질 수 있는 코드인지 구분이 안 된다.
 *
 * 쓰는 곳은 chat.html 하나뿐이라 그쪽에만 인라인된다(<!--@native-chat-->).
 * 나머지 위젯 6개는 이 파일을 받지 않는다 — 부르지도 않을 코드를 들고
 * 있으면 클라이언트 내부를 뒤지는 방법만 여섯 벌 더 배포하는 꼴이다.
 *
 * 원칙은 하나다 — 없으면 접는다. 말풍선은 덤이고, 게임 채팅 자체는
 * 이 길과 무관하게 서버를 거쳐 배달된다.
 *
 * 접히는 경우가 하나 더 있는데, 이쪽이 실제로는 더 흔하다. 위젯 iframe은
 * allow-same-origin 없이 샌드박스되는 것이 기본이라 부모 창을 아예 못
 * 읽는다(HostWindow === null). 스페이스 설정의 "위젯 iframe 동일 출처
 * 허용"을 켜야만 이 길이 열린다.
 */
const NativeChat = (function () {
	/**
	 * 접힌 이유를 콘솔에 한 번 남기고 null을 돌려준다.
	 *
	 * 이 길은 여러 군데에서 접힐 수 있고 전부 정상 동작이다 — 말풍선은 덤이라
	 * 실패해도 게임은 굴러간다. 문제는 그래서 아무 흔적도 남지 않는다는 것이다.
	 * "말풍선이 안 뜬다"만 들고는 부모를 못 읽은 것인지, 클라이언트 내부 모양이
	 * 바뀐 것인지, 연결이 끊긴 것인지 구분할 방법이 없다.
	 *
	 * 한 번만 남긴다. 한 줄 칠 때마다 같은 경고를 쌓으면 콘솔이 못 쓰게 된다.
	 */
	let folded = false;

	function fold(reason) {
		if (!folded) {
			folded = true;
			console.warn("[마피아] ZEP 기본 채팅으로 내보내지 못했습니다: " + reason);
		}
		return null;
	}

	/**
	 * 창의 프로퍼티 이름들.
	 *
	 * 값이 아니라 키만 읽는다. 창에는 읽는 즉시 던지거나 무언가를 실행하는
	 * 프로퍼티가 섞여 있어서, 훑는 것만으로 부작용을 내면 안 된다.
	 */
	function keysOf(scope) {
		const keys = [];
		try {
			for (const key in scope) keys.push(key);
		} catch (error) {
			// 교차 출처 창은 훑을 수 없다. 빈 목록으로 계속한다
		}
		return keys;
	}

	/** 청크 큐를 못 찾았을 때 단서로 남길 전역들 */
	const MODULEISH = /webpack|chunk|__next/i;

	/**
	 * 청크 큐 하나에 빈 청크를 밀어 넣어 webpack의 require를 받아낸다.
	 *
	 * webpack은 청크를 등록할 때 세 번째 원소를 런타임 콜백으로 보고
	 * require를 넘겨준다. 모듈을 하나도 등록하지 않으므로 클라이언트의
	 * 모듈 등록부는 그대로다. 다만 흔적이 아예 없지는 않다 — 큐 배열에
	 * 이 항목이 남고 청크 ID 하나가 로드된 것으로 표시된다. 아무도 요청하지
	 * 않을 ID라 무해하지만, 없는 셈 치면 안 된다.
	 *
	 * 그 청크 ID는 반드시 하나 이상이어야 한다. webpack의 콜백은
	 * chunkIds.some(id => installedChunks[id] !== 0)이 참일 때만 런타임
	 * 콜백을 부르고, 빈 배열의 some()은 항상 거짓이다 — ID를 비우면
	 * 예외도 경고도 없이 그냥 아무 일도 일어나지 않는다.
	 *
	 * 받는 것은 require 자체이지 그 안의 특정 필드가 아니다. 어느 필드가
	 * 있는지는 빌드마다 다르고, 무엇으로 모듈에 닿을지는 부르는 쪽이 정한다.
	 */
	function requireFrom(chunks) {
		if (!chunks || typeof chunks.push !== "function") return null;
		let req = null;
		try {
			chunks.push([
				["__mafia_chat_probe__"],
				{},
				function (webpackRequire) {
					req = webpackRequire;
				},
			]);
		} catch (error) {
			return null;
		}
		return typeof req === "function" ? req : null;
	}

	/**
	 * 부모 창의 webpack require.
	 *
	 * 후보가 여럿일 수 있어(청크 큐가 여러 개인 빌드, 런타임이 아직 붙지 않아
	 * push가 그냥 배열 push인 큐) require를 내주는 첫 전역을 쓴다. 부모에
	 * 없으면 최상위 창까지 본다 — 게임 화면이 한 겹 더 감싸여 있으면
	 * webpack은 그쪽에 있다.
	 *
	 * 이름은 박지 않고 찾는다. webpackChunk 뒤에 붙는 것은 빌드 설정에서
	 * 나오는 값이라 배포마다 다르다 — 처음 구현이 webpackChunkzep을 박아
	 * 뒀다가 프로덕션(webpackChunk_N_E)에서 못 찾았다. 이름은 규칙이 아니라
	 * 관측 대상이다.
	 */
	function runtime() {
		const scopes = [HostWindow];
		try {
			if (HostWindow.top && HostWindow.top !== HostWindow) scopes.push(HostWindow.top);
		} catch (error) {
			// 최상위가 다른 출처면 볼 수 없다. 부모만으로 계속한다
		}

		// (창, 이름) 쌍을 한 번에 모은다. 실패했을 때의 단서도 이 목록에서
		// 나와야 실제로 훑은 곳을 말한다 — 따로 훑으면 진단이 거짓말을 한다.
		const globals = [];
		for (const scope of scopes) {
			for (const name of keysOf(scope)) globals.push({ scope, name });
		}

		const queues = globals.filter(g => g.name.indexOf("webpackChunk") === 0);
		for (const queue of queues) {
			const req = requireFrom(queue.scope[queue.name]);
			if (req) return req;
		}

		if (queues.length > 0) {
			const names = queues.map(q => q.name).join(", ");
			return fold("청크 큐 " + names + "에서 webpack require를 얻지 못했습니다");
		}
		// 이름 규칙이 또 바뀌었다면 이 목록이 다음 이름을 알려준다
		const hints = globals.filter(g => MODULEISH.test(g.name)).map(g => g.name);
		const clue = hints.length > 0 ? hints.slice(0, 20).join(", ") : "없음";
		return fold("webpackChunk* 전역이 없습니다 (모듈 관련 전역: " + clue + ")");
	}

	/**
	 * 모듈 하나의 export 중 조건에 맞는 값.
	 *
	 * 클래스도 값이므로 함수를 걸러내면 안 된다 — 찾는 GameConnection이
	 * 바로 클래스다.
	 *
	 * export는 getter일 수 있고 getter는 읽는 것만으로 던질 수 있다.
	 * 하나가 던졌다고 탐색 전체를 포기하면 안 되므로 값마다 따로 감싼다.
	 */
	function matchIn(exports, accept) {
		if (!exports) return null;
		for (const key in exports) {
			let value;
			try {
				value = exports[key];
			} catch (error) {
				continue;
			}
			if (!value) continue;
			const kind = typeof value;
			if (kind !== "object" && kind !== "function") continue;
			let ok = false;
			try {
				ok = accept(value);
			} catch (error) {
				continue;
			}
			if (ok) return value;
		}
		return null;
	}

	/**
	 * 이미 만들어진 모듈들만 훑는다.
	 *
	 * require.c는 인스턴스 캐시라 여기를 지나가는 것만으로는 클라이언트에서
	 * 아무것도 실행되지 않는다. 그래서 이 길을 먼저 쓴다.
	 *
	 * 다만 webpack이 필요할 때만 내보내는 필드다. dev 빌드에는 있고
	 * 프로덕션에는 없는 경우가 많다 — 실제로 없어서 이 아래 길이 생겼다.
	 */
	function findInInstances(req, accept) {
		const cache = req.c;
		if (!cache) return null;
		for (const id in cache) {
			let exports;
			try {
				exports = cache[id] && cache[id].exports;
			} catch (error) {
				continue;
			}
			const hit = matchIn(exports, accept);
			if (hit) return hit;
		}
		return null;
	}

	/**
	 * 모듈 팩토리를 훑는다. require.c가 없는 빌드의 길이다.
	 *
	 * require.m은 팩토리 등록부이고, webpack의 청크 콜백 자신이
	 * require.m[id] = ... 로 쓰는 필드라 청크 큐가 있으면 반드시 있다.
	 * 대신 담긴 것은 인스턴스가 아니라 아직 실행되지 않았을 수도 있는
	 * 팩토리다 — require(id)는 이미 만들어진 모듈이면 캐시를 돌려주지만,
	 * 아니면 그 자리에서 실행한다.
	 *
	 * 그래서 전부 부르지 않고 소스에 needle이 있는 것만 부른다. 남의 앱
	 * 안에서 아직 실행되지 않은 모듈 수천 개를 임의로 돌리는 것은 부작용이고,
	 * 말풍선이 덤이라는 원칙에 정면으로 어긋난다.
	 *
	 * needle은 서명과 같은 사실을 가리켜야 한다. 다른 문자열을 새로 고르면
	 * 서명이 바뀔 때 같이 바뀌지 않아 조용히 어긋난다.
	 *
	 * 팩토리 소스를 문자열로 뜨는 비용이 있지만, require.c가 없을 때만 걷고
	 * 위젯 수명에 한 번만 걷는 길이다.
	 */
	function findInFactories(req, accept, needle) {
		const factories = req.m;
		if (!factories) return null;
		for (const id in factories) {
			let source;
			try {
				source = String(factories[id]);
			} catch (error) {
				continue;
			}
			if (source.indexOf(needle) === -1) continue;
			let exports;
			try {
				exports = req(id);
			} catch (error) {
				continue;
			}
			const hit = matchIn(exports, accept);
			if (hit) return hit;
		}
		return null;
	}

	/**
	 * GameConnection인가.
	 *
	 * 서명은 정적 멤버 네 개의 이름이다. 클래스 이름은 압축에 사라질 수
	 * 있지만 멤버 이름은 남는다(terser는 프로퍼티를 기본적으로 건드리지
	 * 않는다).
	 *
	 * hasOwnProperty로 확인하고 값을 읽지는 않는다. instance·send는
	 * getter이고 그 중 send는 아직 연결이 없으면 읽는 즉시 던진다 —
	 * 존재 확인이 곧 예외가 되어서는 안 된다.
	 */
	function isGameConnection(value) {
		if (typeof value !== "function") return false;
		const has = Object.prototype.hasOwnProperty;
		return (
			has.call(value, "instance") &&
			has.call(value, "send") &&
			has.call(value, "connect") &&
			has.call(value, "isMigrating")
		);
	}

	/** 서명 중 팩토리 소스에서도 찾을 수 있는 이름. findInFactories의 사전 필터 */
	const SIGNATURE_NEEDLE = "isMigrating";

	function sizeOf(registry) {
		try {
			return registry ? Object.keys(registry).length + "개" : "없음";
		} catch (error) {
			return "읽을 수 없음";
		}
	}

	/** 실패했을 때 단서로 남길, 런타임이 실제로 내준 길들 */
	function routesOf(req) {
		return "인스턴스 " + sizeOf(req.c) + ", 팩토리 " + sizeOf(req.m);
	}

	/**
	 * 패킷을 쏘는 창구(GameConnection 클래스). 처음 한 번만 찾고 기억한다.
	 *
	 * 못 찾았다는 사실도 기억해야 한다 — 안 그러면 한 줄 칠 때마다 모듈
	 * 수천 개를 다시 훑는다.
	 *
	 * 기억하는 것은 클래스이지 send 함수가 아니다. GameConnection.send는
	 * 현재 연결 인스턴스의 함수를 그때그때 꺼내주는 static getter라,
	 * 한 번 꺼내 들고 있으면 재연결·서버 이전 뒤에 죽은 연결로 쏘게 된다.
	 */
	let gameConnection = null;
	let connectionTried = false;

	function connection() {
		if (connectionTried) return gameConnection;
		connectionTried = true;
		if (!HostWindow) {
			return fold("게임 화면을 읽을 수 없습니다 — 위젯 iframe이 다른 출처이거나 동일 출처 허용이 꺼져 있습니다");
		}

		// 남의 앱 내부를 뒤지는 구간이라 통째로 감싼다. 아래 함수들이 저마다
		// 값 하나·모듈 하나 단위로도 막아 두지만 그것은 "하나가 던져도 탐색은
		// 계속한다"는 뜻이고, 여기 있는 것은 "무슨 일이 있어도 채팅 입력을
		// 망가뜨리지 않는다"는 뜻이다 — 층이 다르므로 둘 다 필요하다.
		try {
			const req = runtime();
			if (!req) return null; // 이유는 runtime이 이미 남겼다

			// 부작용 없는 길을 먼저, 없으면 모듈을 실행할 수도 있는 길을.
			gameConnection =
				findInInstances(req, isGameConnection) ||
				findInFactories(req, isGameConnection, SIGNATURE_NEEDLE);

			if (!gameConnection) {
				// 어느 길이 얼마나 있었는지 함께 남긴다. 둘 다 비어 있으면 require를
				// 잘못 잡은 것이고, 수천 개를 훑고도 못 찾았으면 서명이 바뀐 것이다.
				return fold("GameConnection을 찾지 못했습니다 (" + routesOf(req) + ")");
			}
		} catch (error) {
			return fold("클라이언트 내부를 뒤지는 중 예외: " + error.message);
		}
		return gameConnection;
	}

	/**
	 * ZEP 기본 채팅으로 한 줄 내보낸다. 말한 사람의 아바타 위에 말풍선이 뜬다.
	 *
	 * 무엇을 내보낼지도, 누구에게 들릴지도 여기서 정하지 않는다. 서버
	 * (ChatService)가 발언 권한을 판정한 뒤 "이 줄은 소리 내어 말해도 된다,
	 * 청중은 이쪽이다"까지 정해서 보낸 것만 온다. 위젯이 스스로 판단하면
	 * 권한을 아는 곳이 둘이 되고, 둘이 어긋나는 순간 마피아 밀담이 방 전체에
	 * 뜬다. area에 기본값을 두지 않는 이유도 같다 — 빠뜨린 호출이 조용히
	 * 맵 전체로 나가는 대신 아래에서 걸려 아무 일도 일어나지 않아야 한다.
	 *
	 * 두 인자는 문자열 그대로다. ZNetType·TChatAreaType은 ts-proto가
	 * stringEnums로 뽑은 열거형이라 값이 곧 이름이다("PUBLIC_AREA" 등).
	 * 열거형 객체를 따로 찾아낼 이유가 없다.
	 */
	const AREAS = { PUBLIC_AREA: true, PRIVATE_AREA: true };

	function say(text, area) {
		if (!AREAS[area]) {
			fold("모르는 채팅 청중: " + area);
			return false;
		}
		const target = connection();
		if (!target) return false;
		try {
			// send는 static getter다. 연결이 없으면 여기서 던진다 — 정상이다.
			target.send("Z_NET_CHAT_MESSAGE_REQUEST", {
				message: String(text),
				chatAreaType: area,
			});
			return true;
		} catch (error) {
			fold("패킷 전송 중 예외: " + error.message);
			return false;
		}
	}

	return { say };
})();
