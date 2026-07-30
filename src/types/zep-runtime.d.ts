/**
 * zep-script 0.16.5의 타입 정의에 빠진 ZEP API를 이 프로젝트가 직접 선언한다.
 *
 * 왜 필요한가: 라이브러리의 .d.ts가 실제 런타임보다 좁다. 아래 세 개는
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
	interface ScriptPlayer {
		/**
		 * @internal 비공개 API. 구운 아바타 이미지의 파일명.
		 *
		 * cdn-static.zep.us의 baked-avartar-images/ 아래 이름이다
		 * (Profile.ts의 AVATAR_BASE). 비공개 API라 언제든 사라질 수 있으므로
		 * 읽는 쪽은 값이 없는 경우를 함께 처리한다.
		 */
		avatarFileName: string;
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
