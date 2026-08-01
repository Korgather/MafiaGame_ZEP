/**
 * 최후의 반론과 찬반투표 — 개표와 처형 사이에 놓인 두 단계.
 *
 * 마피아42에서 가져온 규칙이다. 여기가 생기기 전에는 개표(VOTE_RESULT)가
 * 곧 처형이었고, 그래서 표가 몰린 사람은 한마디도 못 하고 죽었다. 이제
 * 최다 득표자는 단상(room.nominee)에 오를 뿐이고, 실제로 죽는 자리는
 * resolveJudgement 하나뿐이다.
 *
 * 낮 단계(Voting.ts)와 나눠 둔 이유: 낮은 "누구를 고를까"이고 여기는
 * "고른 사람을 죽일까"라 다루는 상태가 겹치지 않는다. Voting은 votedFor·
 * voteCount를, 여기는 judgement를 만진다.
 */
import type { ScriptPlayer, ScriptWidget } from "zep-script";
import type { Room, Seat } from "../types/Game.types.ts";
import { GamePhase, Judgement } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import { enterPhase, participantLabel, seatAt } from "../entities/Room.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { field, messageType } from "../types/Widget.types.ts";
import { centerLabel, forEachPlayer, label, playSound } from "./Broadcast.ts";
import * as Chat from "./ChatService.ts";
import { DeathCause, kill } from "./Death.ts";
import { bindMessage, openJudgement, updateMain } from "./Widgets.ts";

/**
 * 최후의 반론. 단상에 오른 사람만 말한다.
 *
 * 채팅 권한은 ChatPermission이 room.nominee를 보고 정한다 — 여기서는
 * 화면과 안내만 맡는다.
 */
export function beginDefense(room: Room): void {
	enterPhase(room, GamePhase.DEFENSE);
	room.phaseTimer = room.ruleSet.timing.DEFENSE;
	room.tickTockPlayed = false;

	// 지난 판의 O/X가 남으면 아무도 누르지 않아도 결과가 나온다
	for (const seat of room.seats) seat.judgement = Judgement.NONE;

	const name = nomineeLabel(room);
	centerLabel(room, `${name}의 최후의 반론`);
	Chat.say(room, `🎤 ${name}의 최후의 반론입니다. 다른 사람은 들어 주세요.`);

	forEachPlayer(room, (player, seat) => openJudgementView(room, player, seat));
}

/** 찬반투표. 처형이 확정되는 유일한 자리 */
export function beginJudgement(room: Room): void {
	enterPhase(room, GamePhase.JUDGEMENT);
	room.phaseTimer = room.ruleSet.timing.JUDGEMENT;
	// 5초짜리 단계다. 째깍을 켜면 시작하자마자 울려서 안내가 아니라 소음이 된다
	room.tickTockPlayed = true;

	playSound(room, Sound.VOTE);
	Chat.say(room, `🗳️ ${nomineeLabel(room)}를 처형할지 정하세요. 찬성이 과반이어야 처형됩니다.`);

	forEachPlayer(room, (player, seat) => openJudgementView(room, player, seat));
}

/** 단상에 오른 사람의 이름. 비어 있으면 빈 문자열 */
function nomineeLabel(room: Room): string {
	const seat = seatAt(room, room.nominee);
	return seat ? participantLabel(seat) : "";
}

/**
 * 이 좌석이 O/X를 누를 수 있는가.
 *
 * 단상에 오른 본인은 빠진다. 자기 처형에 반대를 던지는 것은 무의미하고
 * (반대는 어차피 기본값이다) 분모에만 들어가 규칙을 한 표 유리하게 만든다.
 */
function canJudge(room: Room, seat: Seat): boolean {
	return seat.alive && seat.index !== room.nominee;
}

/** 한 사람의 반론/찬반 화면. 두 단계가 같은 위젯을 쓴다 */
export function openJudgementView(room: Room, player: ScriptPlayer, seat: Seat): void {
	const judging = room.phase === GamePhase.JUDGEMENT;
	const widget = openJudgement(player, {
		type: judging ? "judge" : "defense",
		myNum: seat.index,
		nominee: room.nominee,
		nomineeName: nomineeLabel(room),
		timer: room.phaseTimer,
		picked: seat.judgement,
		canJudge: judging && canJudge(room, seat),
	});
	// 반론 단계에서도 물어 둔다. 찬반으로 넘어갈 때 위젯을 다시 열기 때문에
	// 사실상 두 번 무는 셈이지만, 물지 않고 열면 그 화면은 영영 먹통이다
	if (canJudge(room, seat)) bindJudgementWidget(widget);
	sendJudgeProgress(room, player);
}

function bindJudgementWidget(widget: ScriptWidget): void {
	bindMessage(widget, "judge", (sender, data) => {
		if (messageType(data) !== "judge") return;

		const found = locate(sender.id);
		if (!found) return;
		const room = found.room;
		const voter = found.seat;

		// 반론 단계에서는 아직 못 누른다. 위젯이 버튼을 잠그지만 방어는 여기다
		if (room.phase !== GamePhase.JUDGEMENT) return;
		if (!canJudge(room, voter)) return;

		const pick = field(data, "pick");
		if (pick === Judgement.AGREE) {
			voter.judgement = Judgement.AGREE;
			label(sender, "찬성했습니다.");
		} else if (pick === Judgement.OPPOSE) {
			voter.judgement = Judgement.OPPOSE;
			label(sender, "반대했습니다.");
		} else {
			// 같은 버튼을 다시 눌러 취소한 경우. 기권은 반대로 센다
			voter.judgement = Judgement.NONE;
			label(sender, "선택을 취소했습니다.");
		}

		broadcastJudgeProgress(room);
	});
}

/**
 * 몇 명이 O/X를 눌렀는가.
 *
 * 찬성·반대 숫자는 보내지 않는다. 지목 투표에서 실시간 득표를 감추는 것과
 * 같은 이유다 — 5초 안에 앞사람을 따라가는 판이 되면 반론이 의미를 잃는다.
 */
function judgeProgress(room: Room): { type: "judge-progress"; voted: number; voters: number } {
	let voted = 0;
	let voters = 0;
	for (const seat of room.seats) {
		// 접속이 끊긴 좌석은 분모에서 뺀다 — Voting.voteProgress와 같은 이유다.
		// 통과 판정(judgementPassed)의 분모와 다른 것은 의도적이다
		if (!canJudge(room, seat) || !seat.connected) continue;
		voters++;
		if (seat.judgement !== Judgement.NONE) voted++;
	}
	return { type: "judge-progress", voted, voters };
}

function sendJudgeProgress(room: Room, player: ScriptPlayer): void {
	updateMain(player, judgeProgress(room));
}

/** 접속 변화로 분모가 바뀌었을 때도 불린다 — GameFlow.refreshProgress 참고 */
export function broadcastJudgeProgress(room: Room): void {
	const payload = judgeProgress(room);
	forEachPlayer(room, player => updateMain(player, payload));
}

/**
 * 찬반투표 결과.
 *
 * 규칙 그대로 "생존자 과반수가 찬성(O)"이다. 분모는 단상에 오른 본인을 뺀
 * 생존자다(canJudge). 접속이 끊긴 사람은 **분모에 남긴다** — 진행률 표시와
 * 다른 판단이다. 끊긴 사람을 빼면 남은 두세 명의 찬성만으로 처형이 통과해
 * "과반"이 실제 인원과 무관해진다.
 *
 * 기권은 반대로 센다. 확신이 없으면 사람이 죽지 않는 쪽으로 기운다.
 *
 * 정치인의 2표 가중치는 여기에 적용하지 않는다. 지목에서 두 표를 쓰는 것과
 * 처형 면역이 이미 정치인의 몫이고, 찬반까지 두 표면 혼자 판을 뒤집는다.
 */
function judgementPassed(room: Room): boolean {
	let voters = 0;
	let agree = 0;
	for (const seat of room.seats) {
		if (!canJudge(room, seat)) continue;
		voters++;
		if (seat.judgement === Judgement.AGREE) agree++;
	}
	return agree * 2 > voters;
}

/**
 * 찬반투표를 집행한다. 처형이 확정됐으면 true.
 *
 * voteRecord.message를 여기서 덮어쓴다. 그 문장은 다음 밤 컷의 첫 줄로
 * 쓰이는데(Night.beginNight), 개표 시점의 "단상에 올랐습니다"가 그대로
 * 남으면 밤이 결말을 말하지 않는 꼴이 된다.
 */
export function resolveJudgement(room: Room): boolean {
	const nominee = seatAt(room, room.nominee);
	room.nominee = 0;
	if (!nominee) return false;

	if (!judgementPassed(room)) {
		room.rejected.push(nominee.index);
		room.voteRecord.message = `🕊️ 찬성이 과반에 못 미쳐 ${participantLabel(nominee)}는 살아남았습니다.`;
		Chat.announce(room, room.voteRecord.message);
		return false;
	}

	// 처형 사실은 kill이 직접 알린다 — 마피아 팀이었는지까지 밝히므로
	room.voteRecord.message = `☠️ ${participantLabel(nominee)}가 처형되었습니다.`;
	kill(room, nominee, DeathCause.EXECUTION);
	return true;
}
