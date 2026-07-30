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
	/** 겹쳐 읽고 닫는 카드 — 직업 공개·첫 안내·직업 도감. 내용은 payload가 정한다 */
	CARD: "card.html",
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

/**
 * 맵 오브젝트의 param1 값. 맵 에디터에 손으로 적어 넣는 문자열이라
 * 코드 쪽 오타를 컴파일러가 잡아주지 못한다 — 최소한 코드 안에서는
 * 한 곳만 보게 모아 둔다.
 */
export const MapTrigger = {
	/** 대기실 안내판. 부딪히면 첫 안내 카드가 다시 뜬다 */
	GUIDE_BOARD: "GUIDE_CARDS",
} as const;

/**
 * 위젯이 화면에서 차지하는 자리.
 *
 * width/height는 픽셀이다 — showWidget이 픽셀만 받는다. mobile은 그중
 * 세로만 다시 적은 값으로, 화면 높이에 대한 %다.
 *
 * 왜 모바일만 %인가
 * -----------------
 * 400px은 데스크톱에서 화면의 1/4쯤이지만 세로 850px 폰에서는 절반이다.
 * "게임 화면을 얼마나 남길 것인가"는 픽셀로는 말할 수 없는 값인데, 지금까지
 * 이 질문을 가진 층이 아무 데도 없었다. 그래서 대기실 400px(47%)과
 * 채팅 320px(38%)이 아무도 말리지 않는 사이 화면의 85%를 덮었고, 남은
 * 게임 화면은 위아래로 갈린 두 조각이었다.
 *
 * 세로 예산 (모바일)
 *   메인 위젯          ≤ 46%
 *   + 접힌 채팅 막대     44px  (모바일 기본값, PlayerTag)
 *   ------------------------
 *   게임 화면          ≥ 48%
 *
 * 채팅을 펼치면 CHAT(34%)이 올라오므로 메인 위젯은 MAIN_TIGHT배로 줄어든다
 * (Widgets.ts의 layoutOf). 둘이 동시에 제 크기로 뜨는 경우는 없다.
 */
export interface WidgetBox {
	readonly width: number;
	readonly height: number;
	/** 모바일 세로. 화면 높이 대비 %. 없으면 height(px)를 그대로 쓴다 */
	readonly mobile?: number;
}

export const WidgetSize = {
	/** 대기실 — 좌석 목록. 8줄 + 머리말 + 준비/나가기 */
	LOBBY: { width: 400, height: 400, mobile: 46 },
	/**
	 * 대기실 — 방 선택.
	 *
	 * 같은 lobby.html이 두 화면을 그리는데 크기는 하나뿐이었다. 방 버튼
	 * 8개는 좌석 목록의 2/3면 충분해서, 방 선택 중에는 아래 절반이 늘 빈
	 * 채로 게임 화면을 가리고 있었다 (모바일에서 특히 눈에 띈다).
	 */
	LOBBY_ROOMS: { width: 400, height: 280, mobile: 30 },
	ROLE_ACTION: { width: 400, height: 460, mobile: 46 },
	/** 카드 한 장 또는 몇 장 — 직업 공개, 첫 안내 */
	CARD: { width: 320, height: 400, mobile: 44 },
	/**
	 * 직업 도감.
	 *
	 * 12칸 격자와 진영 구분선이 들어가서 CARD로는 목록이 두 줄만 보인다.
	 * 이 화면만 메인 위젯 예산(46%)을 넘는데, 도감은 메인 위젯 위에 겹쳐
	 * 읽고 곧 닫는 것이라 게임 화면을 항구적으로 먹지 않는다.
	 */
	CARD_BOOK: { width: 360, height: 480, mobile: 54 },
	/** 사람 8명을 타일로 그린다. PHASE보다 높아야 한다 */
	VOTE: { width: 400, height: 400, mobile: 46 },
	/** 전원의 직업 공개 목록이 들어간다 */
	GAME_OVER: { width: 380, height: 420, mobile: 46 },
	/** 밤/아침: 읽을 것만 있고 조작이 없다 */
	PHASE: { width: 380, height: 260, mobile: 28 },
	/**
	 * 펼친 채팅창.
	 *
	 * 위젯은 iframe이라 크기만큼 화면을 실제로 가린다(투명해도 클릭을 먹는다).
	 * 접었을 때 CSS로 내용만 숨기면 그 자리는 여전히 막혀 있으므로,
	 * 접기는 CHAT_BAR 크기로 다시 여는 것으로 구현한다. 미확인 개수 같은
	 * 상태는 서버(PlayerTag)가 들고 있어서 다시 열어도 잃지 않는다.
	 */
	CHAT: { width: 330, height: 320, mobile: 34 },
	/**
	 * 접은 채팅창. 채널 아이콘과 미확인 배지만 보인다.
	 * 글자 한 줄이라 화면이 커진다고 같이 커질 이유가 없다 — 여기만 픽셀 그대로다.
	 */
	CHAT_BAR: { width: 190, height: 44 },
} as const;

/**
 * 모바일 가로 폭. 화면 대비 %.
 *
 * 세로와 달리 가로는 위젯마다 다를 이유가 없다. 폰은 꽉 채우는 편이 읽기
 * 좋고, 태블릿에서 꽉 채우면 글줄이 너무 길어져 오히려 읽기 나빠진다.
 */
export const MobileWidth = { PHONE: "96%", TABLET: "60%" } as const;

/**
 * 상단 고정 위젯을 ZEP 상단바 아래로 끌어올리는 보정.
 * 기기마다 상단바 높이가 달라 값이 셋이다.
 */
export const TopNudge = { DESKTOP: "-12px", PHONE: "-62px", TABLET: "-40px" } as const;

/** 채팅을 펼쳤을 때 메인 위젯이 줄어드는 비율 (위 세로 예산 참고) */
export const MAIN_TIGHT = 0.6;

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
	| "bullet"
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
	/**
	 * 총알. 마피아와 자경단원이 함께 쓴다.
	 *
	 * 전에는 이름이 mafiaAttack이었다. 쓰는 직업이 마피아뿐일 때는 맞았지만
	 * 자경단원이 생기면서 "시민 편이 마피아 리소스를 빌려 쓴다"로 읽혔다.
	 * 파일은 총알 그림이지 마피아 그림이 아니므로 이름을 그림에 맞춘다.
	 *
	 * 짐승인간은 물어 죽이는데 여기에 맞는 그림이 없어 이펙트가 없다(에셋 공백).
	 * 총알을 빌려주면 밤마다 총성 대신 총알이 두 번 날아 정체가 새어 나간다.
	 */
	bullet: {
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
} as const;
