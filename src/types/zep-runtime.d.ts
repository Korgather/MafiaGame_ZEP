/**
 * zep-script 0.16.5의 타입 정의에 빠진 ZEP API를 이 프로젝트가 직접 선언한다.
 *
 * 왜 필요한가: 라이브러리의 .d.ts가 실제 런타임보다 좁다. 아래 다섯 개는
 * ZEP 런타임에 실제로 있는데 선언이 없어서, 그대로 쓰면 type-check가 막는다.
 *
 * 왜 //@ts-ignore가 아닌가: 그 주석은 그 줄의 오류를 종류에 상관없이 전부
 * 지운다 — 이름 오타(showProfileOnUnitClicked)든 인자 개수 실수든 조용히
 * 통과한다. 억제를 호출부마다 흩뿌리는 것이기도 해서, 이 API가 몇 곳에서
 * 쓰이는지도 알 수 없게 된다. tseslint recommended의 ban-ts-comment가 이
 * 프로젝트에서 켜져 있는 이유가 그것이다.
 *
 * 여기 한 번 선언해 두면 호출부는 평범한 코드가 되고, 라이브러리가 이 API를
 * 정식 지원하는 날 이 파일에서 해당 줄을 지우면 끝난다 — 그때 남아 있는
 * 잘못된 선언은 컴파일러가 충돌로 알려준다.
 *
 * 런타임에는 아무것도 남기지 않는다. .d.ts는 선언만 있어서 번들에 들어가지 않는다.
 */
import type { ScriptPlayer } from "zep-script";

declare module "zep-script" {
	/**
	 * 비네팅이 목표 상태로 가는 방식. ZEP 스튜디오의 입력 칸과 이름이 같다.
	 */
	export type VignetteEasing =
		| "Linear"
		| "Quad.easeIn"
		| "Cubic.easeIn"
		| "Quart.easeIn"
		| "Quint.easeIn"
		| "Sine.easeIn"
		| "Expo.easeIn"
		| "Circ.easeIn"
		| "Back.easeIn"
		| "Bounce.easeIn"
		| "Quad.easeOut"
		| "Cubic.easeOut"
		| "Quart.easeOut"
		| "Quint.easeOut"
		| "Sine.easeOut"
		| "Expo.easeOut"
		| "Circ.easeOut"
		| "Back.easeOut"
		| "Bounce.easeOut"
		| "Quad.easeInOut"
		| "Cubic.easeInOut"
		| "Quart.easeInOut"
		| "Quint.easeInOut"
		| "Sine.easeInOut"
		| "Expo.easeInOut"
		| "Circ.easeInOut"
		| "Back.easeInOut"
		| "Bounce.easeInOut";

	/** 비네팅의 반지름이 변해 가는 방식 */
	export interface VignetteTween {
		/** 시작 반지름(px). 여기서 applyVignetteEffect의 radius까지 간다 */
		startRadius: number;
		/** 걸리는 시간(밀리초) */
		duration: number;
		easingType: VignetteEasing;
		/** 반복 횟수. 0이면 한 번만 */
		repeat: number;
	}

	/** 비네팅의 색·흐림·짙기와 도달 방식 */
	export interface VignetteOption {
		/** 0xRRGGBB */
		color: number;
		/** 뚫린 원의 가장자리를 얼마나 흐리게 번지게 할 것인가(px) */
		blur: number;
		/** 가장 짙은 곳의 불투명도. 0이면 보이지 않는다 */
		opacity: number;
		tweenOption: VignetteTween;
	}

	interface ScriptPlayer {
		/**
		 * @internal 비공개 API. 구운 아바타 이미지의 파일명.
		 *
		 * cdn-static.zep.us의 baked-avartar-images/ 아래 이름이다
		 * (Profile.ts의 AVATAR_BASE). 비공개 API라 언제든 사라질 수 있으므로
		 * 읽는 쪽은 값이 없는 경우를 함께 처리한다.
		 */
		avatarFileName: string;

		/**
		 * 이 사람의 화면을 흔든다. 처형처럼 방 전체가 함께 겪는 충격에 쓴다.
		 *
		 * @param durationMs 흔드는 시간(밀리초)
		 * @param intensity 흔드는 세기. 화면 크기에 대한 비율이라 값이 아주 작다 —
		 *   0.002가 "무슨 일이 일어났다" 정도이고 0.005면 이미 세다. 0.01을 넘기면
		 *   글자를 읽을 수 없다.
		 *
		 * 선언만 빠져 있고 런타임에는 있다. 인자는 둘 다 필수라 선택 인자
		 * 자리를 건너뛰는 Jint 함정(파일 머리말)은 여기서는 문제가 되지 않는다.
		 */
		shakeScreen(durationMs: number, intensity: number): void;

		/**
		 * 이 사람의 화면 가장자리를 덮는다. 가운데 반지름 radius만큼이 뚫려
		 * 있고, 거기서 바깥으로 갈수록 option.color가 option.opacity까지 짙어진다.
		 *
		 * @param radius 뚫린 원의 반지름(px). **클수록 밝은 영역이 넓다** —
		 *   즉 값이 클수록 효과가 약하고, 화면 대각선의 절반을 넘어서면
		 *   사실상 보이지 않는다. 세게 하려면 값을 줄인다.
		 * @param option 색·흐림·짙기, 그리고 그 반지름까지 가는 방식.
		 *
		 * 걷는 방법이 따로 없다. option.opacity를 0으로 주면 어떤 반지름이든
		 * 보이지 않으므로 그것이 해제다(Screen.Veil.NONE).
		 *
		 * 선언만 빠져 있고 런타임에는 있다. 인자는 둘 다 필수라 선택 인자
		 * 자리를 건너뛰는 Jint 함정(파일 머리말)은 여기서도 문제가 되지 않는다.
		 */
		applyVignetteEffect(radius: number, option: VignetteOption): void;
	}
}

declare global {
	namespace ScriptApp {
		/** 유닛을 클릭했을 때 ZEP 기본 프로필 창을 띄울지 여부 */
		let showProfileOnUnitClick: boolean;

		/** 맵 위의 사람(자기 자신 포함)을 클릭했다 */
		namespace onUnitClicked {
			function Add(callback: (clicker: ScriptPlayer, target: ScriptPlayer) => void): void;
		}
	}
}

export {};
