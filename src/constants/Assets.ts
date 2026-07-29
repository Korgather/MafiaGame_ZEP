/**
 * res/ 안의 리소스 파일명.
 *
 * 기존에는 "tickTockSound.mp3" 같은 문자열이 호출부마다 직접 적혀 있어서
 * 파일 이름을 바꾸면 어디가 깨지는지 알 수 없었다.
 */

export const Sound = {
	JOIN: "joinSound.mp3",
	NIGHT: "nightSound.mp3",
	MORNING: "morningSound.wav",
	VOTE: "voteSound.wav",
	TICK_TOCK: "tickTockSound.mp3",
	/** 마피아가 대상을 지목했을 때 */
	GUN: "gunSound.WAV",
	/** 의사가 대상을 지목했을 때 */
	HEAL: "healSound.WAV",
	/** 경찰·스파이가 조사했을 때 */
	INVESTIGATE: "policeAttackSound.mp3",
	CITIZEN_WIN: "citizenWinSound.mp3",
	MAFIA_WIN: "mafiaWinSound.mp3",
} as const;

/**
 * 위젯 HTML 파일명.
 * WatingRoom은 오타지만 실제 res 파일명이므로 그대로 둔다.
 */
export const WidgetFile = {
	LOBBY: "WatingRoom.html",
	ROLE_ACTION: "roleAction.html",
	MORNING: "morning.html",
	NIGHT: "night.html",
	VOTE: "vote.html",
	VOTE_RESULT: "voteResult.html",
	WIN_CITIZEN: "winCitizen.html",
	WIN_MAFIA: "winMafia.html",
} as const;

/** 위젯 크기 (align은 모바일 여부에 따라 런타임에 결정) */
export const WidgetSize = {
	LOBBY: { width: 400, height: 350 },
	ROLE_ACTION: { width: 400, height: 500 },
	ROLE_CARD: { width: 300, height: 400 },
	/** morning/night/vote/voteResult 공통 */
	PHASE: { width: 400, height: 260 },
} as const;

/**
 * 스프라이트시트 정의.
 *
 * 기존에는 App.loadSpritesheet 호출 11개가 모듈 최상단에 펼쳐져 있었고,
 * 그중 detectiveSprite / doctorAttackSprite / policeAttackSprite 3개는
 * 삭제된 테스트용 존(addOnLocationTouched) 에서만 쓰이는 죽은 리소스였다.
 * 여기에는 실제로 쓰이는 것만 남긴다.
 */
export interface SpriteDef {
	readonly file: string;
	readonly width: number;
	readonly height: number;
	readonly frames: { left: number[]; right: number[]; up: number[]; down: number[] };
	readonly fps?: number;
}

export type SpriteKey =
	| "mafia"
	| "doctor"
	| "police"
	| "spy"
	| "ghost"
	| "mafiaAttack"
	| "silhouette"
	| "blank";

/** 4방향 3프레임 걷기 (48x48 기본 캐릭터 시트) */
function walk48(file: string): SpriteDef {
	return {
		file,
		width: 48,
		height: 48,
		frames: { left: [3, 4, 5], up: [9, 10, 11], down: [0, 1, 2], right: [6, 7, 8] },
		fps: 8,
	};
}

/** 방향별 단일 프레임 (정지 오브젝트) */
function still(file: string, width: number, height: number, frame: number): SpriteDef {
	return {
		file,
		width,
		height,
		frames: { left: [frame], right: [frame], up: [frame], down: [frame] },
	};
}

export const SPRITE_DEFS: Record<SpriteKey, SpriteDef> = {
	mafia: walk48("mafiaSprite.png"),
	doctor: walk48("doctorSprite.png"),
	police: walk48("policeSprite.png"),
	ghost: walk48("ghost.png"),
	spy: {
		file: "spySprite.png",
		width: 64,
		height: 70,
		frames: {
			left: [6, 7, 8, 9, 10, 11],
			right: [12, 13, 14, 15, 16, 17],
			up: [18, 19, 20, 21, 22, 23],
			down: [0, 1, 2, 3, 4, 5],
		},
	},
	mafiaAttack: {
		file: "bulletSprite2.png",
		width: 24,
		height: 24,
		frames: { left: [2], right: [0], up: [3], down: [1] },
		fps: 8,
	},
	silhouette: still("silhouette2.png", 48, 48, 0),
	blank: still("blank.png", 32, 32, 0),
};

/** 라벨 색상 */
export const LabelColor = {
	TEXT: 0xffffff,
	BACKGROUND: 0x000000,
	/** sendMessage용 시스템 메시지 색 */
	SYSTEM: 0x00ff00,
} as const;
