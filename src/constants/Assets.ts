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
 * 위젯 HTML 파일명. 소스는 src/ui/, 산출물은 res/ (tools/build-widgets.js).
 *
 * 기존에는 11개였다. 그중 직업 카드 7개는 background-image URL 한 줄만
 * 다른 같은 파일이었고, night/morning은 이미지 URL과 타이머 색만,
 * winCitizen/winMafia는 <img> 한 줄만 달랐다. 직업이 12종이 되면
 * 카드도 12개가 되는 구조였다.
 *
 * 지금은 6개다. 다른 것은 파일이 아니라 payload로 보낸다.
 * 직업을 추가해도 여기는 늘지 않는다.
 */
export const WidgetFile = {
	LOBBY: "lobby.html",
	/** 직업 공개 카드. 내용은 payload가 정한다 */
	ROLE_CARD: "roleCard.html",
	/** 밤 능력 지목 */
	ROLE_ACTION: "roleAction.html",
	/** 밤/아침 진행 화면. phase 필드로 갈린다 */
	PHASE: "phase.html",
	/** 투표 + 개표. init / result 메시지로 갈린다 */
	VOTE: "vote.html",
	GAME_OVER: "gameOver.html",
	/** 통합 채팅. 접속해 있는 내내 떠 있는 유일한 위젯 */
	CHAT: "chat.html",
} as const;

/** 위젯 크기 (align은 모바일 여부에 따라 런타임에 결정) */
export const WidgetSize = {
	LOBBY: { width: 400, height: 400 },
	ROLE_ACTION: { width: 400, height: 460 },
	ROLE_CARD: { width: 320, height: 400 },
	/** 사람 8명을 타일로 그린다. PHASE보다 높아야 한다 */
	VOTE: { width: 400, height: 400 },
	/** 전원의 직업 공개 목록이 들어간다 */
	GAME_OVER: { width: 380, height: 420 },
	/** 밤/아침: 읽을 것만 있고 조작이 없다 */
	PHASE: { width: 380, height: 260 },
	/**
	 * 펼친 채팅창.
	 *
	 * 위젯은 iframe이라 크기만큼 화면을 실제로 가린다(투명해도 클릭을 먹는다).
	 * 접었을 때 CSS로 내용만 숨기면 그 자리는 여전히 막혀 있으므로,
	 * 접기는 CHAT_BAR 크기로 다시 여는 것으로 구현한다. 미확인 개수 같은
	 * 상태는 서버(PlayerTag)가 들고 있어서 다시 열어도 잃지 않는다.
	 */
	CHAT: { width: 330, height: 320 },
	/** 접은 채팅창. 채널 아이콘과 미확인 배지만 보인다 */
	CHAT_BAR: { width: 190, height: 44 },
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
