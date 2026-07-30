/**
 * 단계 전환 컷 — 화면을 덮고 "지금 무슨 일이 일어났는가"를 장면 순서대로 말한다.
 *
 * 왜 필요한가
 * -----------
 * 단계 전환은 지금까지 채팅 한 줄(Chat.say)과 효과음 하나가 전부였다.
 * 그런데 채팅은 흘러가고, 효과음은 무엇이 바뀌었는지 말해주지 않는다.
 * 밤이 되는 순간과 아침이 되는 순간은 이 게임에서 가장 중요한 두 지점인데
 * 그 사이에 아무 사건도 없이 위젯 하나가 다른 위젯으로 바뀌기만 했다.
 *
 * 왜 별도 위젯 자리인가
 * ---------------------
 * 메인 위젯(tag.widget)을 잠깐 빌려 쓰는 방법도 있었다. 그러면 컷이 끝날 때
 * 좌석에게는 단계 화면을, 관전자에게는 관전 화면을 각각 되살려야 하는데,
 * 그 재개 경로는 컷을 하나 늘릴 때마다 함께 늘어난다. 관전 화면을 여는
 * 함수는 Lobby.ts 안에 숨어 있어 되살릴 방법조차 없다.
 * 겹쳐 뜨는 자리(tag.cutWidget)를 하나 더 두면 끝은 destroy 한 번이다.
 *
 * 왜 leaf인가
 * -----------
 * GameFlow·Night·Voting·Outcome이 전부 이 파일을 부른다. 반대로 이 파일은
 * Broadcast와 Widgets만 부른다. 단계 서비스 쪽으로 화살표가 하나라도
 * 돌아가면 GameFlow ↔ Night 순환이 생기고, 그 순환은 webpack/Jint 초기화
 * 순서에서 undefined로 터진다 (GameFlow.ts의 showPhaseView 주석 참고).
 */
import type { ScriptPlayer } from "zep-script";
import type { CutTone, Room } from "../types/Game.types.ts";
import { CUT_ART, type CutScene } from "../constants/VisualAssets.ts";
import { forEachAudience } from "./Broadcast.ts";
import { closeCut, openCut } from "./Widgets.ts";

/** 제목이 떠오르는 데 걸리는 시간(초) */
const LEAD = 1.2;
/** 줄 하나가 더 머무는 시간(초) */
const STEP = 0.8;
/** 마지막 줄을 읽고 화면이 걷히기까지(초) */
const TAIL = 0.8;
/**
 * 아무리 길어도 여기서 끊는다(초).
 *
 * 밤 사이 사건은 인원에 비례해 늘어난다(사망·치료·반격이 한 밤에 다 나올 수
 * 있다). 상한이 없으면 12인 판의 아침 컷이 10초를 넘고, 그만큼 낮 토론이
 * 아니라 컷을 보며 기다리게 된다. 넘치는 줄은 채팅 기록이 받는다.
 */
const MAX = 6;

function lengthOf(lineCount: number): number {
	const raw = LEAD + STEP * lineCount + TAIL;
	return raw > MAX ? MAX : raw;
}

export interface CutSpec {
	readonly scene: CutScene;
	readonly tone: CutTone;
	readonly title: string;
	readonly lines: readonly string[];
}

function activeCut(spec: CutSpec) {
	const length = lengthOf(spec.lines.length);
	return {
		scene: spec.scene,
		title: spec.title,
		lines: spec.lines.slice(),
		tone: spec.tone,
		length,
		timer: length,
	};
}

/**
 * 한 단계에서 이어질 컷들을 시작한다. 단계를 여는 함수가 화면을 열기
 * **직전**에 부른다.
 *
 * phaseTimer를 컷 길이만큼 늘리는 것이 이 함수의 두 번째 일이다.
 * 늘리지 않으면 연출이 그 단계의 시간을 먹는다 — 밤 22초 중 3초가 컷이면
 * 실제로 지목할 수 있는 시간은 19초다. 그렇다고 TIMING.NIGHT를 25로 올려
 * 두면 컷 길이를 손볼 때마다 상수를 함께 고쳐야 하고, 그 둘이 어긋난 것을
 * 알아차릴 방법이 없다. 늘리는 쪽이 컷 길이의 유일한 주인이 된다.
 *
 * 부르는 순서가 중요하다. 여기서 phaseTimer가 늘어난 뒤에 단계 화면을 열어야
 * 화면의 남은 시간과 서버의 남은 시간이 같다.
 */
export function playCuts(room: Room, specs: readonly CutSpec[]): void {
	if (specs.length === 0) return;
	const cuts = specs.map(activeCut);
	room.cut = cuts[0];
	room.cutQueue = cuts.slice(1);
	room.phaseTimer += cuts.reduce((sum, cut) => sum + cut.length, 0);
	forEachAudience(room, player => showCut(room, player));
}

export function playCut(
	room: Room,
	scene: CutScene,
	tone: CutTone,
	title: string,
	lines: readonly string[]
): void {
	playCuts(room, [{ scene, tone, title, lines }]);
}

/**
 * 도는 중인 컷을 한 사람에게 띄운다.
 *
 * 컷을 처음 여는 길과 도중에 들어온 사람에게 보여주는 길이 같은 함수다.
 * 남은 시간이 아니라 전체 길이를 보내는 것은 의도다 — 위젯은 줄을 차례로
 * 띄우는 순서만 알면 되고, 언제 걷히는지는 서버(advanceCut)가 정한다.
 * 남은 시간을 보내면 늦게 들어온 사람의 화면에서 줄이 빨리 감긴다.
 */
export function showCut(room: Room, player: ScriptPlayer): void {
	const cut = room.cut;
	if (!cut) return;
	openCut(player, {
		type: "init",
		scene: cut.scene,
		art: CUT_ART[cut.scene].file,
		title: cut.title,
		lines: cut.lines,
		tone: cut.tone,
		ms: Math.round(cut.length * 1000),
	});
}

/** 매 프레임. 현재 컷이 끝나면 다음 컷을 열고, 마지막이면 전원의 컷을 걷는다 */
export function advanceCut(room: Room, dt: number): void {
	let remaining = dt;
	while (room.cut) {
		room.cut.timer -= remaining;
		if (room.cut.timer > 0) return;
		remaining = -room.cut.timer;

		const next = room.cutQueue.shift() || null;
		room.cut = next;
		if (!next) {
			forEachAudience(room, closeCut);
			return;
		}
		forEachAudience(room, player => showCut(room, player));
		if (remaining <= 0) return;
	}
}
