/**
 * 스프라이트시트 로딩. ScriptApp에 닿는 유일한 지점이라
 * 도메인·서비스 코드는 SpriteKey 문자열만 알면 된다.
 */
import { SPRITE_DEFS } from "../constants/Assets.ts";
import type { SpriteKey } from "../constants/Assets.ts";

export type SpriteInstance = ReturnType<typeof ScriptApp.loadSpritesheet>;

const cache: { [key: string]: SpriteInstance } = {};

// 게임 도중 로딩이 끼어들지 않도록 스크립트 시작 시 한 번에 올린다.
//
// fps가 없는 시트(spy·silhouette·blank)에 undefined를 넘기면 안 된다.
// ZEP 런타임(Jint)은 인자 "개수와 타입"으로 C# 오버로드를 고르기 때문에
// 명시적 undefined는 생략이 아니라 숫자 자리에 들어온 잘못된 인자가 되고,
// 스크립트 로드 자체가 실패한다:
//   No public methods with the specified arguments were found
// .d.ts의 `frameRate?: number`는 "생략 가능"이지 "undefined 허용"이 아니다.
for (const key of Object.keys(SPRITE_DEFS)) {
	const def = SPRITE_DEFS[key as SpriteKey];
	cache[key] =
		def.fps === undefined
			? ScriptApp.loadSpritesheet(def.file, def.width, def.height, def.frames)
			: ScriptApp.loadSpritesheet(def.file, def.width, def.height, def.frames, def.fps);
}

export function sprite(key: SpriteKey): SpriteInstance {
	return cache[key];
}
