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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SPRITE_DEFS } from "../src/constants/Assets.ts";
import { NightActionKind, ROLE_DEFS } from "../src/domain/Roles.ts";
import { Role } from "../src/types/Game.types.ts";

// import.meta는 tsconfig의 module: CommonJS에서 막힌다. 테스트는 npm이
// 저장소 루트에서 띄우므로 cwd 기준으로 잡는다.
const RES = join(process.cwd(), "res");

const REQUIRED_CUT_ART = [
	"game-start",
	"role-reveal",
	"night-start",
	"night-result",
	"day-start",
	"discussion-start",
	"vote-start",
	"execution",
	"citizen-win",
	"mafia-win",
] as const;

const REQUIRED_ABILITY_ART = ["attack", "heal", "investigate", "silence", "scoop"] as const;

const REQUIRED_UI_ART = [
	"panel-texture",
	"popup-frame",
	"card-front",
	"card-back",
	"button-primary",
	"button-secondary",
	"button-danger",
	"vote-frame",
	"chat-frame",
	"ability-frame",
	"notification-banner",
	"victory-frame",
	"loading-emblem",
	"tutorial-frame",
] as const;

const REQUIRED_GAME_ICONS = [
	"vote",
	"skip",
	"confirm",
	"cancel",
	"time",
	"player",
	"dead",
	"alive",
	"mute",
	"settings",
	"sound",
	"exit",
	"restart",
] as const;

const REQUIRED_BACKGROUND_ART = [
	"lobby",
	"village-day",
	"village-night",
	"vote-hall",
	"prison",
	"graveyard",
	"title",
	"result",
] as const;

const PLACEHOLDER_REF = /placeholder|temp|dummy|sample|blank/i;
const UI_SOURCE_DIR = join(process.cwd(), "src", "ui");
const FRAME_UI_SOURCES = ["theme.css", "roleAction.html", "card.html", "gameOver.html", "lobby.html", "vote.html"];
const STRETCH_SENSITIVE_UI_ART = [
	"art_ui_popup_frame.png",
	"art_ui_vote_frame.png",
	"art_ui_chat_frame.png",
	"art_ui_ability_frame.png",
	"art_ui_notification_banner.png",
	"art_ui_victory_frame.png",
	"art_ui_tutorial_frame.png",
	"art_ui_button_primary.png",
	"art_ui_button_secondary.png",
	"art_ui_button_danger.png",
] as const;

type AssetEntry =
	| string
	| {
			readonly file: string;
			readonly alpha?: boolean;
			readonly transparent?: boolean;
			readonly class?: string;
			readonly kind?: string;
	  };

interface VisualAssetManifest {
	readonly ROLE_ICONS: Record<string, AssetEntry>;
	readonly CUT_ART: Record<string, AssetEntry>;
	readonly ABILITY_ART: Record<string, AssetEntry>;
	readonly UI_ART: Record<string, AssetEntry>;
	readonly GAME_ICONS: Record<string, AssetEntry>;
	readonly BACKGROUND_ART: Record<string, AssetEntry>;
	readonly ALL_VISUAL_ASSETS: readonly AssetEntry[] | Record<string, AssetEntry>;
}

function visualAssetModuleMissing(error: unknown): Error {
	const reason = error instanceof Error ? error.message : String(error);
	return new Error(`VisualAssets manifest is required at src/constants/VisualAssets.ts: ${reason}`);
}

async function loadVisualAssets(): Promise<VisualAssetManifest> {
	try {
		return (await import("../src/constants/VisualAssets.ts")) as VisualAssetManifest;
	} catch (error) {
		throw visualAssetModuleMissing(error);
	}
}

function fileOf(entry: AssetEntry): string {
	return typeof entry === "string" ? entry : entry.file;
}

function entriesOf(group: Record<string, AssetEntry>): Array<[string, AssetEntry]> {
	return Object.entries(group).sort(([a], [b]) => a.localeCompare(b));
}

function assertExactKeys(actual: readonly string[], expected: readonly string[], label: string): void {
	assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} 키가 PRD와 다릅니다`);
}

function allVisualEntries(manifest: VisualAssetManifest): AssetEntry[] {
	if (Array.isArray(manifest.ALL_VISUAL_ASSETS)) return manifest.ALL_VISUAL_ASSETS.slice();
	return Object.values(manifest.ALL_VISUAL_ASSETS);
}

/** PNG IHDR: 8바이트 시그니처 + 길이·타입 8바이트 뒤에 가로·세로가 온다 */
function pngSize(file: string): { width: number; height: number } {
	const buf = readFileSync(join(RES, file));
	assert.equal(buf.readUInt32BE(0), 0x89504e47, `${file}: PNG이 아닙니다`);
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function pngMeta(file: string): { width: number; height: number; colorType: number; alphaCapable: boolean } {
	const buf = readFileSync(join(RES, file));
	assert.equal(buf.readUInt32BE(0), 0x89504e47, `${file}: PNG이 아닙니다`);
	assert.equal(buf.toString("ascii", 12, 16), "IHDR", `${file}: PNG IHDR이 없습니다`);
	const colorType = buf.readUInt8(25);
	return {
		width: buf.readUInt32BE(16),
		height: buf.readUInt32BE(20),
		colorType,
		alphaCapable: colorType === 4 || colorType === 6,
	};
}

function uiSource(file: string): string {
	return readFileSync(join(UI_SOURCE_DIR, file), "utf8");
}

function allFrameUiSource(): string {
	return FRAME_UI_SOURCES.map(uiSource).join("\n");
}

function cssUrlPattern(file: string): string {
	return file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

describe("프로덕션 비주얼 에셋 매니페스트", () => {
	it("모든 코드 정의 직업에 역할 아이콘이 있다", async () => {
		const { ROLE_ICONS } = await loadVisualAssets();

		assertExactKeys(Object.keys(ROLE_ICONS), Object.values(Role), "ROLE_ICONS");
		for (const role of Object.values(Role)) {
			const file = fileOf(ROLE_ICONS[role]);
			assert.match(file, /^art_role_[a-z]+\.png$/, `${role}: 역할 아이콘 파일명이 안정 규칙과 다릅니다`);
		}
	});

	it("컷 장면 키가 PRD의 생명주기 목록과 같다", async () => {
		const { CUT_ART } = await loadVisualAssets();

		assertExactKeys(Object.keys(CUT_ART), REQUIRED_CUT_ART, "CUT_ART");
	});

	it("능력 아트 키가 활성 능력 목록과 같다", async () => {
		const { ABILITY_ART } = await loadVisualAssets();

		assertExactKeys(Object.keys(ABILITY_ART), REQUIRED_ABILITY_ART, "ABILITY_ART");
	});

	it("UI 아트 키가 요청된 UI 인벤토리와 같다", async () => {
		const { UI_ART } = await loadVisualAssets();

		assertExactKeys(Object.keys(UI_ART), REQUIRED_UI_ART, "UI_ART");
	});

	it("게임 아이콘 키가 요청된 조작 아이콘 목록과 같다", async () => {
		const { GAME_ICONS } = await loadVisualAssets();

		assertExactKeys(Object.keys(GAME_ICONS), REQUIRED_GAME_ICONS, "GAME_ICONS");
	});

	it("배경 아트 키가 요청된 환경 목록과 같다", async () => {
		const { BACKGROUND_ART } = await loadVisualAssets();

		assertExactKeys(Object.keys(BACKGROUND_ART), REQUIRED_BACKGROUND_ART, "BACKGROUND_ART");
	});

	it("전체 매니페스트의 파일명은 중복되지 않는다", async () => {
		const manifest = await loadVisualAssets();
		const files = allVisualEntries(manifest).map(fileOf);

		assert.equal(new Set(files).size, files.length, "서로 다른 에셋이 같은 파일명을 가리킵니다");
	});

	it("선언한 모든 파일이 res에 있는 PNG이다", async () => {
		const manifest = await loadVisualAssets();

		for (const entry of allVisualEntries(manifest)) {
			const file = fileOf(entry);
			assert.ok(existsSync(join(RES, file)), `${file}: res에 없습니다`);
			pngMeta(file);
		}
	});

	it("역할 아이콘은 512px 이상의 정사각 PNG이다", async () => {
		const { ROLE_ICONS } = await loadVisualAssets();

		for (const [role, entry] of entriesOf(ROLE_ICONS)) {
			const file = fileOf(entry);
			const meta = pngMeta(file);
			assert.equal(meta.width, meta.height, `${role}: 역할 아이콘은 정사각형이어야 합니다`);
			assert.ok(meta.width >= 512, `${role}: 역할 아이콘은 최소 512px이어야 합니다`);
		}
	});

	it("게임 아이콘은 256px 이상의 정사각 PNG이다", async () => {
		const { GAME_ICONS } = await loadVisualAssets();

		for (const [key, entry] of entriesOf(GAME_ICONS)) {
			const file = fileOf(entry);
			const meta = pngMeta(file);
			assert.equal(meta.width, meta.height, `${key}: 게임 아이콘은 정사각형이어야 합니다`);
			assert.ok(meta.width >= 256, `${key}: 게임 아이콘은 최소 256px이어야 합니다`);
		}
	});

	it("컷 장면과 배경은 16:9 계열의 1024px 이상 PNG이다", async () => {
		const { BACKGROUND_ART, CUT_ART } = await loadVisualAssets();

		for (const [key, entry] of [...entriesOf(CUT_ART), ...entriesOf(BACKGROUND_ART)]) {
			const file = fileOf(entry);
			const meta = pngMeta(file);
			const ratio = meta.width / meta.height;
			assert.ok(
				ratio >= 1.7 && ratio <= 1.8,
				`${key}: 16:9에 가까운 비율이어야 합니다 (${meta.width}x${meta.height})`
			);
			assert.ok(meta.width >= 1024, `${key}: 가로폭은 최소 1024px이어야 합니다`);
		}
	});

	it("유연한 UI 아트는 0보다 큰 PNG이고 매니페스트 분류가 있다", async () => {
		const { UI_ART } = await loadVisualAssets();

		for (const [key, entry] of entriesOf(UI_ART)) {
			const meta = pngMeta(fileOf(entry));
			const classification = typeof entry === "string" ? "" : entry.class || entry.kind || "";
			assert.ok(meta.width > 0 && meta.height > 0, `${key}: UI 아트 크기가 비어 있습니다`);
			assert.notEqual(classification, "", `${key}: UI 아트 분류가 없습니다`);
		}
	});

	it("투명성이 필요한 아이콘과 프레임은 알파 채널 PNG이다", async () => {
		const { GAME_ICONS, ROLE_ICONS, UI_ART } = await loadVisualAssets();

		for (const [key, entry] of [...entriesOf(ROLE_ICONS), ...entriesOf(GAME_ICONS), ...entriesOf(UI_ART)]) {
			const needsAlpha =
				key.includes("frame") || key.includes("button") || key.includes("banner") || key.includes("emblem");
			if (!needsAlpha && typeof entry !== "string" && entry.alpha !== true && entry.transparent !== true) continue;
			const file = fileOf(entry);
			const meta = pngMeta(file);
			assert.ok(meta.alphaCapable, `${key}: ${file}은 알파 채널을 표현할 수 있는 PNG여야 합니다`);
		}
	});

	it("활성 비주얼 에셋 참조에는 플레이스홀더 이름이 없다", async () => {
		const manifest = await loadVisualAssets();

		for (const entry of allVisualEntries(manifest)) {
			const file = fileOf(entry);
			assert.doesNotMatch(file, PLACEHOLDER_REF, `${file}: 플레이스홀더성 이름이 활성 참조에 남아 있습니다`);
		}
	});

	it("장식 프레임과 버튼은 100% 100% 배경으로 늘려 그리지 않는다", () => {
		const source = allFrameUiSource();

		for (const file of STRETCH_SENSITIVE_UI_ART) {
			const escaped = cssUrlPattern(file);
			assert.doesNotMatch(
				source,
				new RegExp(`url\\(["']?${escaped}["']?\\)[^;{}]*100%\\s+100%`),
				`${file}: 원본 비율이 다른 박스에 background-size: 100% 100%로 늘어나고 있습니다`
			);
		}
	});

	it("장식 프레임과 버튼은 슬라이스 가능한 테두리 레이어로 그린다", () => {
		const source = allFrameUiSource();

		for (const file of [
			"art_ui_popup_frame.png",
			"art_ui_vote_frame.png",
			"art_ui_chat_frame.png",
			"art_ui_ability_frame.png",
			"art_ui_victory_frame.png",
			"art_ui_tutorial_frame.png",
			"art_ui_button_primary.png",
			"art_ui_button_secondary.png",
			"art_ui_button_danger.png",
		]) {
			const escaped = cssUrlPattern(file);
			assert.ok(
				new RegExp(`border-image-source:\\s*url\\(["']?${escaped}["']?\\)`).test(source) ||
					(/border-image-source:\s*var\(--panel-frame\)/.test(source) &&
						new RegExp(`--panel-frame:\\s*url\\(["']?${escaped}["']?\\)`).test(source)),
				`${file}: border-image-source로 9-slice 렌더링되어야 합니다`
			);
		}

		assert.match(source, /border-image-slice:\s*119\s+\d+\s+135\s+\d+\s+fill/, "notification-banner: 보이는 띠 y119..249를 보존해야 합니다");
		assert.match(source, /\.btn\.ok\s*\{[\s\S]*border-image-source:\s*none/, "btn.ok: 보조 버튼 아트를 상속하면 안 됩니다");
		assert.match(source, /--panel-slice:\s*63\s+54\s+63\s+53\s+fill/, "popup-frame: 측정된 내부 경계 slice를 써야 합니다");
		assert.match(source, /--panel-slice:\s*59\s+38\s+51\s+37\s+fill/, "vote-frame: 측정된 내부 경계 slice를 써야 합니다");
		assert.match(source, /border-image-slice:\s*26\s+27\s+45\s+27\s+fill/, "chat-frame: 측정된 내부 경계 slice를 써야 합니다");
		assert.match(source, /border-image-slice:\s*52\s+59\s+47\s+59\s+fill/, "ability-frame: 측정된 내부 경계 slice를 써야 합니다");
		assert.match(source, /border-image-slice:\s*83\s+67\s+70\s+80\s+fill/, "tutorial-frame: 측정된 내부 경계 slice를 써야 합니다");
	});

	it("고정 비율 콘텐츠는 프레임과 별도로 원본 비율을 유지한다", () => {
		const source = allFrameUiSource();

		assert.match(source, /\.ability-art\s*\{[\s\S]*height:\s*clamp\(64px,\s*23vh,\s*132px\)[\s\S]*width:\s*auto[\s\S]*max-width:\s*100%[\s\S]*aspect-ratio:\s*4\s*\/\s*3/, "ability-frame: 낮은 iframe에서도 4:3으로 축소되어야 합니다");
		assert.match(source, /\.ability-art img\s*\{[\s\S]*aspect-ratio:\s*16\s*\/\s*9[\s\S]*object-fit:\s*contain/, "ability art: 768x432를 잘라내지 않아야 합니다");
		assert.match(source, /\.card\s*\{[\s\S]*height:\s*100%[\s\S]*width:\s*auto[\s\S]*max-height:\s*100%[\s\S]*aspect-ratio:\s*2\s*\/\s*3/, "card front: 제한된 body 안에서도 2:3 비율이 필요합니다");
		assert.match(source, /\.card\s*\{[\s\S]*background-image:\s*url\("art_ui_card_front\.png"\)[\s\S]*background-size:\s*100%\s+100%/, "card front: 2:3 컨테이너 안에서 완성형 이미지를 그대로 그려야 합니다");
		assert.match(source, /\.card\.solo::before\s*\{[\s\S]*aspect-ratio:\s*2\s*\/\s*3/, "card back: 2:3 비율이 필요합니다");
		assert.match(source, /\.card\.solo::before\s*\{[\s\S]*background:\s*url\("art_ui_card_back\.png"\)\s*center\s*\/\s*100%\s+100%/, "card back: 2:3 컨테이너 안에서 완성형 이미지를 그대로 그려야 합니다");
		assert.match(source, /\.card\.guide\s*\{[\s\S]*border-image-source:\s*url\("art_ui_tutorial_frame\.png"\)/, "tutorial-frame: portrait 배경으로 늘리면 안 됩니다");
		assert.match(
			source,
			/\.panel\s*\{[\s\S]*padding:\s*var\(--panel-pad,\s*calc\(var\(--panel-border\) \+ 2px\)\)/,
			"panel-frame: 기본 콘텐츠 여백은 프레임 폭보다 커야 합니다"
		);
		assert.match(source, /\.chat\s*\{[\s\S]*padding:\s*18px/, "chat-frame: 콘텐츠 여백은 18px 프레임 폭 이상이어야 합니다");
		assert.match(
			source,
			/\.ability-art\s*\{[\s\S]*--ability-border:\s*clamp\(10px,\s*3vh,\s*18px\)[\s\S]*padding:\s*var\(--ability-border\)/,
			"ability-frame: 콘텐츠 여백과 프레임 폭은 함께 줄어야 합니다"
		);
		assert.match(source, /\.panel\.result\s*\{[\s\S]*--panel-slice:\s*93\s+66\s+56\s+64\s+fill[\s\S]*--panel-pad:\s*24px\s+20px\s+20px/, "victory-frame: 상단 메달과 중앙 안전영역을 별도 slice로 보존해야 합니다");
	});
});
