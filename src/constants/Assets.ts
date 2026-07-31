/**
 * res/ 안의 리소스 파일명.
 *
 * 기존에는 "tickTockSound.mp3" 같은 문자열이 호출부마다 직접 적혀 있어서
 * 파일 이름을 바꾸면 어디가 깨지는지 알 수 없었다.
 */

/**
 * 효과음.
 *
 * 열여섯 개 전부 tools/make-sfx.py가 만든다 — 받아 온 음원이 아니다.
 * 그 파일의 머리말에 이유가 적혀 있지만, 여기서 알아야 할 것은 하나다:
 * **파일 사이의 크기 균형은 이미 맞춰져 있다.** 세 계층으로 구워져 있고
 * (전원이 듣는 사건 -18dBFS / 개인 알림 -20.5 / 깔리는 소리 -23),
 * 계층 안의 편차는 0.7dB를 넘지 않는다. 호출부가 볼륨을 따로 손볼 이유가
 * 없다는 뜻이다. 전체를 키우거나 줄이려면 SFX_VOLUME 하나만 만지면 된다.
 *
 * 교체 전에는 열 개가 출처도 규격도 제각각이었다. 실측하면
 * RMS가 -17.9에서 -25.7dBFS까지 8dB 흩어져 있었고, morningSound.wav는
 * peak 1.000으로 이미 깎여 있었으며, gunSound.WAV는 8비트 11kHz 모노였다.
 * 그리고 처형·밤사망·차단·쪽지·점쟁이·카드공개에는 소리가 아예 없었다.
 */
export const Sound = {
	/** 대기실 입장 */
	JOIN: "sfx_join.mp3",
	/** 직업 카드가 뒤집힐 때 */
	REVEAL: "sfx_reveal.mp3",
	NIGHT: "sfx_night.mp3",
	MORNING: "sfx_morning.mp3",
	VOTE: "sfx_vote.mp3",
	TICK_TOCK: "sfx_tick.mp3",
	/**
	 * 마피아·짐승인간이 대상을 지목했을 때.
	 *
	 * 전에는 총성(gunSound.WAV)이었다. 품질도 문제였지만 더 큰 문제는
	 * 톤이다 — 이 게임의 그림은 실루엣과 촛불이고, 실제 총성 한 방은
	 * 추리가 아니라 액션으로 읽힌다. 지금은 쇳소리와 심장박동이다.
	 */
	STRIKE: "sfx_strike.mp3",
	/** 의사가 대상을 지목했을 때 */
	HEAL: "sfx_heal.mp3",
	/** 경찰·스파이가 진영을 조사했을 때 */
	INVESTIGATE: "sfx_investigate.mp3",
	/**
	 * 점쟁이가 능력을 들여다봤을 때.
	 *
	 * 경찰의 조사음과 재료를 나눈 이유는 보는 것이 다르기 때문이다.
	 * 같은 소리를 쓰면 밤마다 무엇을 확인했는지 소리로 구분되지 않는다.
	 */
	INSPECT: "sfx_inspect.mp3",
	/** 건달에게 막혀 능력이 불발됐을 때 */
	BLOCKED: "sfx_blocked.mp3",
	/** 쪽지를 보냈을 때 */
	NOTE: "sfx_note.mp3",
	/** 낮 투표로 처형됐을 때 */
	EXECUTE: "sfx_execute.mp3",
	/** 밤사이 죽은 사람이 있을 때 */
	DEATH: "sfx_death.mp3",
	CITIZEN_WIN: "sfx_citizen_win.mp3",
	MAFIA_WIN: "sfx_mafia_win.mp3",
} as const;

/**
 * 효과음 공통 볼륨 (0~1, ScriptPlayer.playSound의 5번째 인자).
 *
 * 파일 사이의 균형이 아니라 게임 전체에서 효과음이 차지하는 자리를 정하는
 * 값이다. 1.0은 ZEP이 낼 수 있는 최대라 맵 배경음과 발소리를 덮는다 —
 * 효과음은 배경 위에 얹히는 것이지 배경을 밀어내는 것이 아니므로 조금 낮춘다.
 */
export const SFX_VOLUME = 0.8;

/**
 * 위젯 HTML 파일명. 소스는 src/ui/, 산출물은 res/ (tools/build-widgets.js).
 *
 * 기존에는 11개였다. 그중 직업 카드 7개는 background-image URL 한 줄만
 * 다른 같은 파일이었고, night/morning은 이미지 URL과 타이머 색만,
 * winCitizen/winMafia는 <img> 한 줄만 달랐다. 직업이 12종이 되면
 * 카드도 12개가 되는 구조였다.
 *
 * 지금은 화면의 종류만큼만 있다. 같은 화면의 다른 내용은 파일이 아니라
 * payload로 보낸다 — 직업을 추가해도 여기는 늘지 않는다.
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
	/** 최후의 반론 + 찬반투표. defense / judge 메시지로 갈린다 */
	JUDGEMENT: "judgement.html",
	GAME_OVER: "gameOver.html",
	/** 통합 채팅. 접속해 있는 내내 떠 있는 유일한 위젯 */
	CHAT: "chat.html",
	/** 단계 전환 컷. 화면을 통째로 덮고 서버가 정한 시간에 스스로 닫힌다 */
	CUT: "cut.html",
	/** 사람을 클릭했을 때 뜨는 프로필. ZEP 기본 창을 끄고 대신 이걸 띄운다 */
	PROFILE: "profile.html",
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
 * ScriptMap.getTile에 넘기고 되돌려받는 값.
 *
 * zep-script에 TileEffectType이라는 enum이 선언돼 있지만 .d.ts에만 있다 —
 * 런타임에는 존재하지 않아서 값으로 import하면 배포본이 죽는다. 이 프로젝트가
 * zep-script를 전부 `import type`으로만 쓰는 이유가 이것이다.
 *
 * MapTrigger와 같은 성질의 값이라 옆에 둔다: 맵 쪽 사실이고, 어긋나도
 * 컴파일러가 잡아주지 않는다. 둘을 한 객체에 넣은 것은 항상 함께 쓰이기
 * 때문이다 — 레이어를 틀리면 값 비교는 의미가 없다.
 */
export const Tile = {
	/** 타일 효과 레이어 */
	EFFECT_LAYER: 2,
	/** 효과 레이어의 값: 프라이빗 영역 */
	PRIVATE_AREA: 4,
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
	/**
	 * 화면을 통째로 덮는가. 켜면 width/height/mobile을 모두 무시하고
	 * 100% × 100% + OVERLAY_Z가 된다 (Widgets.ts의 layoutOf).
	 *
	 * 위 세로 예산이 적용되지 않는 유일한 예외다. 예산은 "게임 화면을 얼마나
	 * 남길 것인가"를 정하는데, 덮는 위젯은 게임 화면을 남기지 않는 것이
	 * 목적이고 서버가 정한 시간에 스스로 닫힌다.
	 */
	readonly fill?: true;
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
	/**
	 * 최후의 반론 / 찬반투표.
	 *
	 * 단상에 오른 사람 하나와 O/X 두 버튼뿐이라 목록이 없다. VOTE보다 낮고
	 * PHASE보다 높다 — 읽을 것(반론 안내)과 누를 것(O/X)이 함께 있다.
	 */
	JUDGEMENT: { width: 380, height: 320, mobile: 36 },
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
	/**
	 * 단계 전환 컷.
	 *
	 * 화면을 덮는다. 위젯이 iframe이라 투명해도 클릭을 먹는다는 성질이 여기서는
	 * 오히려 필요한 것이다 — 컷이 도는 동안은 아무것도 누를 수 없어야 한다.
	 * 이 방식이 허용되는 조건은 "서버가 닫아 준다"이고(Assets의 CHAT 주석),
	 * 컷은 그 조건을 만족하는 유일한 화면이다.
	 *
	 * width/height는 fill이 켜져 있어 쓰이지 않지만 showWidget이 픽셀을
	 * 요구해서 남는다 — 첫 프레임의 상자 크기다.
	 */
	CUT: { width: 480, height: 320, fill: true },
	/**
	 * 프로필 창.
	 *
	 * 카드와 같은 성질이다 — 겹쳐 읽고 닫는다. 그래서 도감처럼 예산(46%)을
	 * 조금 넘겨도 되지만 그럴 필요가 없다: 내용이 아바타 한 장과 여덟 줄이라
	 * 카드보다 낮게 잡아도 스크롤이 생기지 않는다.
	 */
	PROFILE: { width: 300, height: 340, mobile: 42 },
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
 * 화면을 덮는 위젯의 쌓임 순서.
 *
 * ZEP은 위젯이 뜬 순서대로 쌓는다. 채팅창은 접속 내내 떠 있고 컷은 나중에
 * 뜨므로 보통은 컷이 위지만, 채팅을 접었다 펴면 그 순간 채팅이 다시 떠서
 * 컷 위를 덮는다 — 순서에 기대면 "언제 접었는가"가 연출을 가린다.
 * 값을 못으로 박아 순서와 무관하게 만든다.
 */
export const OVERLAY_Z = 9999;

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
	readonly frames: Record<string, number[]>;
	readonly fps?: number;
}

export type SpriteKey =
	| "basic"
	| "mafia"
	| "doctor"
	| "police"
	| "spy"
	| "ghost"
	| "bullet"
	| "claw"
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

/**
 * 날아가는 공격 이펙트 (24x24 시트, 오른쪽·아래·왼쪽·위 순서 4프레임).
 *
 * 이펙트 하나가 더 생기는 순간 24·24·프레임 배치·fps 네 값이 두 군데로
 * 갈라진다. 시트를 같은 규격으로 그리기로 한 이상 규격도 한 곳에 둔다.
 */
function projectile24(file: string): SpriteDef {
	return {
		file,
		width: 24,
		height: 24,
		frames: { left: [2], right: [0], up: [3], down: [1] },
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
	basic: {
		file: "character_basic.png",
		width: 48,
		height: 48,
		frames: {
			left_idle: [0, 1, 2, 3],
			right_idle: [4, 5, 6, 7],
			down_idle: [8, 9, 10, 11],
			up_idle: [12, 13, 14, 15],
			left: [16, 17, 18, 19, 20, 21, 22, 23],
			right: [24, 25, 26, 27, 28, 29, 30, 31],
			down: [32, 33, 34, 35, 36, 37, 38, 39],
			up: [40, 41, 42, 43, 44, 45, 46, 47],
		},
		fps: 8,
	},
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
	 * 짐승인간에게 빌려주지 않는 이유는 아래 claw 참고.
	 */
	bullet: projectile24("bulletSprite2.png"),
	/**
	 * 발톱 자국. 짐승인간 전용.
	 *
	 * 총알을 빌려 쓸 수도 있었지만 그러면 밤마다 총성 없이 총알만 두 번 날아
	 * "총을 안 쏘는 쪽이 짐승인간"이라는 공짜 단서가 생긴다. 이펙트는 정체를
	 * 가리키면 안 되므로 총알과 겹치지 않는 붉은 계열 그림을 따로 둔다.
	 */
	claw: projectile24("clawSprite.png"),
	/**
	 * 밤에 자리마다 세워두는 실루엣. 세로 두 칸(32x64)을 한 오브젝트로 덮는다
	 * — placeSilhouettes가 머리 위 칸에 놓고 두 칸을 정리 목록에 넣는 이유다.
	 *
	 * 전에는 48x48로 적혀 있었다. 실제 파일은 32x64라 프레임 0의 사각형이
	 * 시트를 벗어났고, 클라이언트가 잘라 그려 준 덕분에 "대충 보이는" 상태로
	 * 남아 있었다. tests/assets.test.ts가 이제 이런 어긋남을 잡는다.
	 */
	silhouette: still("silhouette2.png", 32, 64, 0),
	blank: still("blank.png", 32, 32, 0),
};

/** 라벨 색상 */
export const LabelColor = {
	TEXT: 0xffffff,
	BACKGROUND: 0x000000,
} as const;
