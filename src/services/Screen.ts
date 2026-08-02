/**
 * 화면 연출 — 카메라 배율, 클로즈업, 흔들기, 비네팅, 배경음.
 *
 * 왜 한 파일인가
 * --------------
 * 연출은 성질상 흩어지기 쉽다. 밤을 여는 코드가 "조금 당겨 보자"고
 * displayRatio를 직접 만지고, 처형하는 코드가 그 옆에서 shakeScreen을 부르고,
 * 승리 화면이 또 어딘가에서 소리를 끄는 식이다. 그렇게 되면 세기와 길이를
 * 조율하려 할 때 값이 여덟 파일에 흩어져 있고, 무엇보다 **되돌리는 코드가
 * 빠진 곳**을 찾을 수 없다. 카메라·배율·비네팅은 사람에게 붙는 상태라 한 번
 * 어긋나면 그 사람은 다음 판 내내 남의 자리를, 혹은 어두운 화면을 본다.
 *
 * 그래서 단계 코드가 부르는 것은 대부분 setScene 한 줄이고, 값은 아래 세 표
 * (Zoom·Tremor·Veil)에만 있다. "지속시간과 강도를 자연스럽게 조정"하는 일은
 * 이 파일의 상수만 만지면 끝난다.
 *
 * 왜 leaf인가
 * -----------
 * Cut.ts와 같은 이유다. GameFlow·Night·Voting·Trial·Outcome·Stage가 전부 이
 * 파일을 부른다. 반대 방향 화살표가 하나라도 생기면 순환 import가 되고, 그
 * 순환은 webpack/Jint 초기화 순서에서 undefined로 터진다. 이 파일이 아는 것은
 * Broadcast(전달)와 상수·타입뿐이다.
 */
import type { ScriptPlayer } from "zep-script";
import type { Room, VeilSpec } from "../types/Game.types.ts";
import { BGM_VOLUME } from "../constants/Assets.ts";
import { seatPosition } from "../constants/RoomLayout.ts";
import { forEachAudience } from "./Broadcast.ts";

/**
 * 단계마다 카메라를 얼마나 당길 것인가. 각자의 기본 배율에 **곱하는** 값이다.
 *
 * 절대값이 아닌 이유는 모바일이다. 폰은 화면이 좁아 기본이 0.7로 더 멀리
 * 잡혀 있고(baseRatio), 여기에 1.25를 절대값으로 넣으면 폰에서만 밤마다
 * 화면이 두 배 가까이 확대된다. 배수로 두면 "밤은 낮보다 조금 가깝다"라는
 * 관계가 기기와 무관하게 유지된다.
 *
 * 값의 폭이 좁은 것은 의도다. 1.0과 1.25의 차이는 눈이 알아채지만 멀미가
 * 나지 않는 범위이고, 이 게임에서 카메라는 주인공이 아니라 배경이다.
 */
export const Zoom = {
	/** 대기실 — 손대지 않는다 */
	LOBBY: 1,
	/** 직업 공개 — 카드에 집중하도록 살짝 */
	REVEAL: 1.15,
	/** 밤 — 가장 가깝다. 좁아진 시야가 곧 긴장이다 */
	NIGHT: 1.25,
	/** 낮 — 전원이 보여야 하므로 기준으로 돌아온다 */
	DAY: 1,
	/** 투표 — 낮보다 아주 조금 */
	VOTE: 1.1,
	/** 최후의 반론과 찬반 — 단상 하나에 방이 집중한다 */
	TRIAL: 1.2,
	/** 한 사람을 비추는 클로즈업 */
	SPOT: 1.35,
	/** 게임 종료 — 물러서서 방 전체를 본다 */
	FINALE: 0.9,
} as const;

/** 흔들기 한 번의 길이와 세기 */
export interface TremorSpec {
	/** 흔드는 시간(밀리초) */
	readonly ms: number;
	/** 화면 크기에 대한 비율. 0.002가 "무슨 일이 일어났다" 정도다 */
	readonly power: number;
}

/**
 * 언제 얼마나 흔들 것인가.
 *
 * 상한을 0.004로 잡았다. 그 위는 글자가 읽히지 않는데, 흔들리는 동안 화면에
 * 뜨는 것이 하필 "누가 죽었는가"라서 읽히지 않으면 연출이 정보를 가린다.
 * 방 전체가 함께 겪는 사건일수록 세고(처형), 혼자 겪는 사건은 약하다 —
 * 남들은 아무렇지 않은데 내 화면만 크게 흔들리면 사고처럼 보인다.
 *
 * 게임 종료에는 흔들기가 없다. 판이 끝나는 두 길 중 하나는 처형이고, 그때
 * 종료 흔들기를 더하면 같은 틱에 두 번 흔들린다. 밤에 끝난 판만 흔들면
 * 이번엔 끝나는 방식에 따라 연출이 달라진다 — 어느 쪽도 좋지 않아서
 * 종료는 배율과 음악으로만 말한다(Outcome.finish).
 */
export const Tremor = {
	/** 처형. 이 게임에서 가장 큰 사건이라 가장 세다 */
	EXECUTION: { ms: 520, power: 0.004 },
	/** 밤에 죽은 본인에게만 */
	DEATH: { ms: 320, power: 0.003 },
	/** 능력이 막혔다 */
	BLOCKED: { ms: 220, power: 0.002 },
	/** 살아남았다 — 안도는 짧고 약하게 */
	SAVED: { ms: 200, power: 0.0015 },
} as const;

/**
 * 클로즈업을 얼마나 물고 있을 것인가(초).
 *
 * 전부 그 단계의 길이보다 한참 짧다. 카메라가 남의 자리에 가 있는 동안에는
 * 내 주변에서 무슨 일이 일어나는지 보이지 않으므로, 클로즈업은 "봐야 할
 * 한순간"에만 걸리고 나머지 시간은 각자에게 돌려주는 것이 맞다.
 */
export const Hold = {
	/** 개표에서 단상에 오른 사람 (단계 7초) */
	NOMINEE: 2.8,
	/** 최후의 반론 (단계 15초) — 말을 시작하는 동안만 */
	DEFENSE: 4.5,
} as const;

/**
 * 단계마다 화면 가장자리를 어떻게 덮을 것인가.
 *
 * 배율(Zoom)이 "얼마나 가까운가"를 말한다면 이쪽은 "얼마나 보이는가"를
 * 말한다. 밤에 카메라를 당기는 것만으로는 밤이 되지 않는다 — 30초쯤 지나면
 * 눈이 배율에 적응해서 그냥 평소 화면으로 읽힌다. 시야가 좁아진 것은
 * 가장자리가 있어야 보인다.
 *
 * ### opacity가 안전장치다
 *
 * radius의 단위가 픽셀이라는 것은 스튜디오 입력값(blur: 100)에서 추정한
 * 것이지 문서로 확인한 사실이 아니다. 추정이 틀리면 값 하나가 전원의 화면을
 * 덮는데, 그 사고는 판이 끝날 때까지 되돌릴 기회가 없다. 그래서 짙기에
 * 상한(OPACITY_CAP)을 두었다 — 단위가 무엇이든 이 값 아래에서는 최악의 경우가
 * "가장자리가 좀 어둡다"이지 "화면이 검다"가 아니다. 이 표의 값을 올릴 때
 * 상한부터 확인할 것.
 *
 * ### 왜 네 개뿐인가
 *
 * 단계마다 다른 비네팅을 걸면 그건 연출이 아니라 깜빡임이다. 여기서 가르는
 * 것은 "가려진 판(밤)"과 "드러난 판(낮)", 그리고 그 사이에 한 사람만 서는
 * 순간(재판)뿐이다.
 */
export const Veil = {
	/** 없음 — 낮·투표·대기실·종료. opacity가 0이라 반지름은 형식일 뿐이다 */
	NONE: {
		radius: 2200,
		color: 0x000000,
		blur: 160,
		opacity: 0,
		ms: 600,
		easing: "Sine.easeOut",
	},
	/** 밤과 직업 공개 — 푸른 기가 도는 어둠이 천천히 조여든다 */
	NIGHT: {
		radius: 760,
		color: 0x060912,
		blur: 240,
		opacity: 0.5,
		ms: 1600,
		easing: "Sine.easeInOut",
	},
	/** 최후의 반론과 찬반 — 단상 하나에 떨어지는 조명 */
	TRIAL: {
		radius: 620,
		color: 0x120308,
		blur: 200,
		opacity: 0.44,
		ms: 900,
		easing: "Sine.easeInOut",
	},
	/**
	 * 처형이 집행되는 순간. 유일하게 색이 있고 유일하게 빠르다(0.24초).
	 *
	 * 이 상태는 다음 setScene까지 남는다. 그 사이를 밤 컷이 덮고 있어서
	 * 실제로 붉은 화면을 보는 시간은 컷이 열리기 전 한순간뿐이다 —
	 * 그래서 짙기가 이 표에서 가장 낮은데도 충분히 읽힌다.
	 */
	STRIKE: {
		radius: 480,
		color: 0x8c1410,
		blur: 140,
		opacity: 0.38,
		ms: 240,
		easing: "Quart.easeOut",
	},
} as const;

/**
 * 어떤 비네팅도 이보다 짙을 수 없다. 위 표를 만질 때의 상한이자, radius의
 * 단위 추정이 틀렸을 때 판을 구하는 값이다(Veil 주석).
 */
const OPACITY_CAP = 0.55;

/**
 * 폰에서 반지름을 줄이는 배수.
 *
 * 반지름이 픽셀이면 같은 값이 기기마다 다른 세기가 된다. 데스크톱 뷰포트의
 * 대각선 절반은 900px 안팎이고 폰은 470px 안팎이라, 데스크톱에 맞춘 760을
 * 폰에 그대로 주면 원이 화면보다 커서 아무것도 덮이지 않는다. 폰에서만
 * 밤이 밤처럼 보이지 않는 것은 조용한 종류의 고장이라 아무도 신고하지 않는다.
 *
 * 두 대각선의 비가 대략 0.52인데 0.65로 둔 것은 방향 때문이다. 이 값이
 * 너무 크면 효과가 약해질 뿐이고, 너무 작으면 폰 화면이 필요 이상으로
 * 어두워진다. 확인할 수 없는 값은 약해지는 쪽으로 틀리게 둔다.
 */
const MOBILE_VEIL = 0.65;

/** 카메라가 목표로 이동하는 데 걸리는 시간(초) */
const PAN = 0.6;
/** 자기 캐릭터로 돌아오는 시간(초). 갈 때보다 조금 빠르다 */
const RETURN = 0.45;

/**
 * BGM을 담는 사운드 슬롯 이름. 방마다 다를 필요가 없다 — 한 사람은 한
 * 방에만 있으므로, 이 키 하나면 "지금 이 사람에게 깔린 곡"이 유일하다.
 *
 * 효과음은 파일 이름을 키로 쓴다(Broadcast.playSoundTo). 키가 겹치지 않아야
 * 효과음이 BGM을 끊지 않는데, 실제 파일 이름이 "bgm"일 수 없으므로 안전하다.
 */
const BGM_KEY = "bgm";

/**
 * 이 사람의 기본 배율. 모든 Zoom 값이 여기에 곱해진다.
 *
 * 폰은 세로로 길고 좁아서 데스크톱과 같은 배율로 두면 주변 좌석이 화면
 * 밖으로 밀려난다 — 누가 어디 앉았는지가 이 게임의 정보라 그건 손해다.
 * 이 값이 0.7이라는 사실이 흩어져 있던 것을(index.ts의 접속 처리) 여기로
 * 모았다. 배율을 만지는 코드가 전부 이 파일에 있으므로 기준도 여기 있어야 한다.
 */
export function baseRatio(player: ScriptPlayer): number {
	return player.isMobile ? 0.7 : 1;
}

function applyRatio(player: ScriptPlayer, factor: number): void {
	player.displayRatio = baseRatio(player) * factor;
	player.sendUpdated();
}

/**
 * BGM을 갈아 끼운다. 빈 문자열이면 끄기만 한다.
 *
 * loop=true, overlap=true가 핵심이다. overlap을 끄면 이 곡이 시작되는 순간
 * 그 사람에게 나던 다른 소리가 전부 끊긴다 — 밤이 시작되자마자 능력음이
 * 사라지는 사고가 그것이다(Broadcast.playSoundTo의 주석과 같은 함정).
 * 대신 끄는 일은 명시적으로 stopSound(키)가 한다.
 */
function applyAmbience(player: ScriptPlayer, file: string): void {
	player.stopSound(BGM_KEY);
	if (file === "") return;
	player.playSound(file, true, true, BGM_KEY, BGM_VOLUME);
}

/**
 * 비네팅을 from에서 to로 옮긴다.
 *
 * 이전 상태를 인자로 받는 이유는 API가 그것을 요구하기 때문이다 —
 * tweenOption.startRadius가 없으면 새 반지름이 즉시 적용되어, 밤이 시작될 때
 * 어둠이 조여드는 대신 툭 나타난다. "지금 걸려 있는 값"은 방이 기억한다
 * (Room.veil).
 */
function applyVeil(player: ScriptPlayer, from: VeilSpec, to: VeilSpec): void {
	const scale = player.isMobile ? MOBILE_VEIL : 1;
	player.applyVignetteEffect(to.radius * scale, {
		color: to.color,
		blur: to.blur,
		// 표를 고치는 사람이 상한을 잊어도 여기서 막힌다. 상한을 Veil 쪽
		// 주석으로만 두면 그것은 규칙이 아니라 부탁이다
		opacity: Math.min(to.opacity, OPACITY_CAP),
		tweenOption: {
			startRadius: from.radius * scale,
			duration: to.ms,
			easingType: to.easing,
			repeat: 0,
		},
	});
}

/**
 * 이 방의 "장면"을 바꾼다. 단계를 여는 함수가 한 줄로 부른다.
 *
 * 네 가지를 한꺼번에 한다: 돌던 클로즈업 해제, 방 전체 배율, BGM 교체,
 * 비네팅 교체. 넷을 따로 두지 않은 이유는 넷 다 빠뜨리면 티가 나지 않기
 * 때문이다. 클로즈업만 안 풀면 다음 단계 내내 남의 자리를 보고 있게 되는데,
 * 화면은 정상으로 보이므로 아무도 버그라고 말하지 않는다.
 *
 * bgm이 지금 곡과 같으면 다시 시작하지 않는다. 낮→투표→개표처럼 곡이
 * 이어지는 구간에서 3초마다 곡이 처음으로 돌아가면 그건 음악이 아니라
 * 소음이다. 곡을 단계가 아니라 "장면"(밤·낮·재판) 단위로만 가른 것도 같은
 * 이유이고, 그래서 BGM은 세 개뿐이다. 비네팅도 같은 이유로 같은 값이면
 * 건너뛴다 — 다시 걸면 tween이 처음부터 돌아 이미 자리잡은 어둠이 한 번
 * 출렁인다.
 */
export function setScene(room: Room, factor: number, bgm: string, veil: VeilSpec): void {
	const hadShot = room.shot !== null;
	room.shot = null;
	const changed = room.ambience !== bgm;
	room.ambience = bgm;
	room.zoom = factor;
	const from = room.veil;
	const shifted = from !== veil;
	room.veil = veil;
	forEachAudience(room, player => {
		applyRatio(player, factor);
		// 클로즈업이 걸려 있었을 때만 되돌린다. 아무 데도 안 갔는데 돌아오라고
		// 하면 카메라가 자기 캐릭터를 향해 한 번 미끄러진다 — 단계가 바뀔 때마다
		// 화면이 흔들리는 것처럼 보인다
		if (hadShot) player.setCameraTarget(player, RETURN);
		if (changed) applyAmbience(player, bgm);
		if (shifted) applyVeil(player, from, veil);
	});
}

/**
 * 한 좌석을 클로즈업한다. 단상에 오른 사람처럼 방 전체가 함께 봐야 하는 순간.
 *
 * hold(초)가 지나면 각자 자기 캐릭터로 돌아간다. 되돌리는 일을 여기서
 * 예약하지 못하는 이유는 ZEP 런타임에 타이머가 없어서다 — 방에 남겨 두고
 * GameFlow의 프레임 루프가 굴린다(advanceShot).
 *
 * hold는 그 단계의 남은 시간보다 짧아야 한다. 넘겨도 사고는 나지 않는다:
 * 다음 단계의 setScene이 클로즈업을 걷는다. 다만 그 순간 카메라가 두 번
 * 움직이므로 값은 넉넉히 잡는 편이 낫다.
 */
export function focusSeat(
	room: Room,
	seatIndex: number,
	hold: number,
	factor: number,
	back: number
): void {
	const position = seatPosition(room.num, seatIndex);
	// 자리를 못 찾으면 연출을 건너뛴다. 카메라를 0,0으로 보내는 것보다
	// 아무것도 하지 않는 쪽이 낫다
	if (!position) return;
	room.shot = { tileX: position.x, tileY: position.y, timer: hold, back };
	room.zoom = factor;
	forEachAudience(room, player => {
		applyRatio(player, factor);
		player.setCameraTarget(position.x, position.y, PAN);
	});
}

/** 매 프레임. 시간이 다 되면 카메라를 각자에게 돌려준다 */
export function advanceShot(room: Room, dt: number): void {
	const shot = room.shot;
	if (!shot) return;
	shot.timer -= dt;
	if (shot.timer > 0) return;
	releaseShot(room);
}

/**
 * 클로즈업을 지금 끝낸다. 시간이 남았어도 사건이 끝났으면 부른다
 * (부결처럼 단상이 그 자리에서 해제되는 경우).
 */
export function releaseShot(room: Room): void {
	const shot = room.shot;
	if (!shot) return;
	// 상태를 먼저 지운다. 되돌리는 도중에 예외가 나도 클로즈업이 영원히
	// 남지 않는다 (Cut.advanceCut과 같은 순서)
	room.shot = null;
	room.zoom = shot.back;
	forEachAudience(room, player => {
		applyRatio(player, shot.back);
		player.setCameraTarget(player, RETURN);
	});
}

/** 방 전체가 함께 겪는 충격 */
export function shake(room: Room, tremor: TremorSpec): void {
	forEachAudience(room, player => {
		shakeOne(player, tremor);
	});
}

/** 혼자만 겪는 충격 — 밤에 죽거나, 능력이 막혔거나 */
export function shakeOne(player: ScriptPlayer, tremor: TremorSpec): void {
	player.shakeScreen(tremor.ms, tremor.power);
}

/**
 * 비네팅만 바꾼다. 단계가 넘어가지 않는데 화면이 반응해야 하는 순간 —
 * 지금은 처형 하나뿐이다.
 *
 * setScene과 달리 배율·음악·클로즈업을 건드리지 않는다. 처형은 재판 화면
 * 안에서 일어나는 사건이라 카메라가 그대로 있어야 하고, 음악을 여기서
 * 끊으면 다음 단계가 곡을 다시 시작하면서 두 번 끊긴다.
 *
 * 이 상태를 걷는 것은 다음 setScene이다. 걷는 코드를 여기 둘 수 없는 것은
 * ZEP 런타임에 타이머가 없어서인데(focusSeat의 hold와 같은 사정), 처형
 * 직후에는 반드시 밤이나 종료가 이어지므로 프레임 루프까지 동원할 이유는
 * 없다. 그 둘이 아닌 경로가 생기면 여기에 걷는 자리를 만들어야 한다.
 */
export function flash(room: Room, veil: VeilSpec): void {
	const from = room.veil;
	room.veil = veil;
	forEachAudience(room, player => {
		applyVeil(player, from, veil);
	});
}

/**
 * 도중에 들어온 사람에게 지금 방의 화면을 맞춰준다. 재접속 복구 경로.
 *
 * 배율·BGM·비네팅은 사람에게 붙는 상태라 새 접속에는 아무것도 걸려 있지
 * 않다. 그래서 재접속한 사람만 밤에 낮 배율로, 음악 없이, 밝은 화면으로
 * 앉아 있게 된다 — 화면이 깨진 것은 아니라서 본인도 무엇이 다른지 말하기
 * 어렵다.
 */
export function restoreView(room: Room, player: ScriptPlayer): void {
	applyRatio(player, room.zoom);
	const shot = room.shot;
	if (shot) player.setCameraTarget(shot.tileX, shot.tileY, PAN);
	applyAmbience(player, room.ambience);
	// from과 to가 같다. 이 사람에게는 옮겨올 이전 상태가 없으므로 지금 방의
	// 어둠을 그대로 입혀야 한다 — 다른 값에서 출발시키면 이미 밤인 방에
	// 들어온 사람의 화면에서만 어둠이 뒤늦게 조여든다
	applyVeil(player, room.veil, room.veil);
}

/**
 * 판 밖의 상태로 되돌린다 — 접속 직후, 대기실 복귀, 스크립트 종료.
 *
 * 방을 인자로 받지 않는 것은 의도다. 이 함수를 부르는 순간 그 사람은 어느
 * 방에도 속하지 않거나(접속 직후), 방이 이미 비워진 뒤다(returnToLobby가
 * resetRoom을 먼저 부른다). 방에서 값을 읽으려 하면 그 두 경로 중 하나는
 * 반드시 틀린다.
 */
export function resetView(player: ScriptPlayer): void {
	player.displayRatio = baseRatio(player);
	player.setCameraTarget(player, RETURN);
	player.stopSound(BGM_KEY);
	// NONE은 짙기가 0이라 tween이 무엇이든 그 자리에서 사라진다. 이 함수가
	// 불리는 곳(대기실 복귀·스크립트 종료)에서는 그게 맞다 — 판을 떠나는
	// 사람의 화면에서 어둠이 1.6초에 걸쳐 걷히는 것을 볼 사람은 없다
	applyVeil(player, Veil.NONE, Veil.NONE);
	player.sendUpdated();
}
