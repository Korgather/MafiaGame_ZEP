/**
 * 스프라이트시트 로딩. ScriptApp에 닿는 유일한 지점이라
 * 도메인·서비스 코드는 SpriteKey 문자열만 알면 된다.
 */
import { SPRITE_DEFS } from "../constants/Assets.ts";
import type { SpriteKey } from "../constants/Assets.ts";

export type SpriteInstance = ReturnType<typeof ScriptApp.loadSpritesheet>;

const cache: { [key: string]: SpriteInstance } = {};

// 게임 도중 로딩이 끼어들지 않도록 스크립트 시작 시 한 번에 올린다.
for (const key of Object.keys(SPRITE_DEFS)) {
	const def = SPRITE_DEFS[key as SpriteKey];
	cache[key] = ScriptApp.loadSpritesheet(def.file, def.width, def.height, def.frames, def.fps);
}

export function sprite(key: SpriteKey): SpriteInstance {
	return cache[key];
}
