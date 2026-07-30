/**
 * 스프라이트 정의와 실제 파일이 맞는지.
 *
 * SPRITE_DEFS는 파일 이름·프레임 크기·프레임 번호를 손으로 적는 표다. 셋 중
 * 무엇이 틀려도 타입 검사와 단위 테스트를 전부 통과한다 — 어긋남은 ZEP
 * 클라이언트가 시트를 자를 때에야 드러나고, 그마저도 예외가 아니라 "뭔가
 * 이상하게 그려진다"로 나타난다. 실제로 silhouette은 32x64 파일을 48x48로
 * 적어 프레임 0이 시트 밖을 가리킨 채 오래 살아남았다.
 *
 * 그래서 표가 아니라 파일에 물어본다. PNG 헤더의 IHDR은 첫 24바이트 안에
 * 있어서 파일을 통째로 디코딩할 필요가 없고, 의존성도 필요 없다.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SPRITE_DEFS } from "../src/constants/Assets.ts";
import { NightActionKind, ROLE_DEFS } from "../src/domain/Roles.ts";

// import.meta는 tsconfig의 module: CommonJS에서 막힌다. 테스트는 npm이
// 저장소 루트에서 띄우므로 cwd 기준으로 잡는다.
const RES = join(process.cwd(), "res");

/** PNG IHDR: 8바이트 시그니처 + 길이·타입 8바이트 뒤에 가로·세로가 온다 */
function pngSize(file: string): { width: number; height: number } {
	const buf = readFileSync(join(RES, file));
	assert.equal(buf.readUInt32BE(0), 0x89504e47, `${file}: PNG이 아닙니다`);
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("스프라이트 시트", () => {
	it("정의한 파일이 모두 res에 있다", () => {
		for (const [key, def] of Object.entries(SPRITE_DEFS)) {
			assert.doesNotThrow(() => pngSize(def.file), `${key}: ${def.file}이 없습니다`);
		}
	});

	/**
	 * 프레임 번호는 시트를 프레임 크기로 자른 격자의 칸 번호다. 범위를 넘으면
	 * 그 방향은 그려지지 않거나 엉뚱한 칸이 나온다.
	 */
	it("모든 프레임 번호가 시트 안에 있다", () => {
		for (const [key, def] of Object.entries(SPRITE_DEFS)) {
			const sheet = pngSize(def.file);
			const columns = Math.floor(sheet.width / def.width);
			const rows = Math.floor(sheet.height / def.height);
			const count = columns * rows;
			assert.ok(
				count > 0,
				`${key}: ${def.width}x${def.height} 프레임이 ${sheet.width}x${sheet.height} 시트보다 큽니다`
			);
			for (const [dir, frames] of Object.entries(def.frames)) {
				for (const frame of frames) {
					assert.ok(
						frame >= 0 && frame < count,
						`${key}.${dir}: 프레임 ${frame}은 ${count}칸짜리 시트 밖입니다`
					);
				}
			}
		}
	});

	/**
	 * 시트를 프레임 크기로 나눴을 때 남는 자투리는 십중팔구 둘 중 하나가
	 * 잘못 적힌 것이다. silhouette이 딱 그 경우였다.
	 */
	it("시트가 프레임 크기로 정확히 나뉜다", () => {
		for (const [key, def] of Object.entries(SPRITE_DEFS)) {
			const sheet = pngSize(def.file);
			assert.equal(sheet.width % def.width, 0, `${key}: 가로 ${sheet.width}가 ${def.width}로 나뉘지 않습니다`);
			assert.equal(sheet.height % def.height, 0, `${key}: 세로 ${sheet.height}가 ${def.height}로 나뉘지 않습니다`);
		}
	});

	/**
	 * 밤에 사람을 죽이는 직업은 날아가는 이펙트가 있어야 한다.
	 *
	 * 짐승인간은 이 문장이 없어서 오래 비어 있었다. 나머지 공격 직업은 총알이
	 * 날아가는데 혼자만 아무 일도 일어나지 않아, 밤 화면을 보고 있으면 "이번엔
	 * 누가 죽는지"가 아니라 "이펙트가 없으니 짐승인간이구나"가 먼저 읽혔다.
	 * 다음에 공격 직업을 추가하는 사람은 여기서 걸린다.
	 */
	it("공격하는 직업은 모두 이펙트를 갖는다", () => {
		for (const [role, def] of Object.entries(ROLE_DEFS)) {
			if (def.nightAction !== NightActionKind.ATTACK) continue;
			assert.ok(def.nightAttackSprite, `${role}: 공격 이펙트가 없습니다`);
		}
	});
});
