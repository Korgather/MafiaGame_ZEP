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
import { bindMessage, isStaleEvent, openJudgement, updateMain } from "./Widgets.ts";

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
	Chat.say(room, `🗳️ ${nomineeLabel(room)}를 처형할지 정하세요. 찬성이 반대보다 많아야 처형됩니다.`);

	forEachPlayer(room, (player, seat) => openJudgementView(room, player, seat));
}

/** 단상에 오른 사람의 이름. 비어 있으면 빈 문자열 */
function nomineeLabel(room: Room): string {
	const seat = seatAt(room, room.nominee);
	return seat ? participantLabel(seat) : "";
}

/**
 * 이 좌석이 찬반의 **분모에 드는가**.
 *
 * 단상에 오른 본인은 빠진다. 자기 처형에 반대를 던지는 것은 무의미하고
 * (반대는 어차피 기본값이다) 분모에만 들어가 규칙을 한 표 유리하게 만든다.
 *
 * 협박당한 사람은 여기 남는다 — 그의 몫은 사라지는 것이 아니라 반대로
 * 세어지기 때문이다(judgementPassed). 버튼을 누를 수 있느냐는 다른 질문이고
 * 그쪽은 canPressJudge가 답한다.
 */
function canJudge(room: Room, seat: Seat): boolean {
	return seat.alive && seat.index !== room.nominee;
}

/**
 * 이 좌석이 O/X 버튼을 누를 수 있는가.
 *
 * canJudge와 나눠 둔 이유는 협박이다. 협박당한 사람을 canJudge에서 빼면
 * 그가 판정의 분모에서도 사라져 건달의 협박이 "한 표를 지운다"가 되는데,
 * 클래식 규칙은 "던지지 못한 찬반은 반대로 센다"이다. 반대로 canJudge
 * 하나로 버튼까지 열어 두면 협박이 아무것도 막지 못한다.
 *
 * 진행률(judgeProgress)의 분모도 이쪽을 쓴다. 누를 수 없는 사람을 분모에
 * 남기면 그 화면은 영원히 100%에 닿지 못한다.
 */
function canPressJudge(room: Room, seat: Seat): boolean {
	return canJudge(room, seat) && !seat.intimidated;
}

/** 한 사람의 반론/찬반 화면. 두 단계가 같은 위젯을 쓴다 */
export function openJudgementView(room: Room, player: ScriptPlayer, seat: Seat): void {
	const judging = room.phase === GamePhase.JUDGEMENT;
	const widget = openJudgement(player, room, {
		type: judging ? "judge" : "defense",
		myNum: seat.index,
		nominee: room.nominee,
		nomineeName: nomineeLabel(room),
		timer: room.phaseTimer,
		picked: seat.judgement,
		canJudge: judging && canPressJudge(room, seat),
	});
	// 반론 단계에서도 물어 둔다. 찬반으로 넘어갈 때 위젯을 다시 열기 때문에
	// 사실상 두 번 무는 셈이지만, 물지 않고 열면 그 화면은 영영 먹통이다
	if (canPressJudge(room, seat)) bindJudgementWidget(widget);
	sendJudgeProgress(room, player);
}

function bindJudgementWidget(widget: ScriptWidget): void {
	bindMessage(widget, "judge", (sender, data) => {
		if (messageType(data) !== "judge") return;

		const found = locate(sender.id);
		if (!found) return;
		const room = found.room;
		const voter = found.seat;
		// 지난 판·지난 단계의 화면에서 늦게 도착한 입력은 버린다. 아래 phase
		// 검사는 같은 이름의 단계가 다시 왔을 때 통과시키므로 이 한 줄이 더 필요하다
		if (isStaleEvent(room, sender)) return;

		// 반론 단계에서는 아직 못 누른다. 위젯이 버튼을 잠그지만 방어는 여기다
		if (room.phase !== GamePhase.JUDGEMENT) return;
		if (!canPressJudge(room, voter)) return;

		const pick = field(data, "pick");
		if (pick === Judgement.AGREE) {
			voter.judgement = Judgement.AGREE;
			label(sender, "찬성했습니다.");
		} else if (pick === Judgement.OPPOSE) {
			voter.judgement = Judgement.OPPOSE;
			label(sender, "반대했습니다.");
		} else {
			// 같은 버튼을 다시 눌러 취소한 경우. 기권은 어느 쪽으로도 세지 않는다
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
		if (!canPressJudge(room, seat) || !seat.connected) continue;
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
 * 찬반투표 결과. 찬성이 반대보다 많아야 처형된다.
 *
 * 예전에는 `agree * 2 > voters`, 즉 "안 누른 사람은 전부 반대"였다. 5초
 * 안에 버튼을 못 찾은 사람과 화면을 보고 있지 않은 사람이 전부 반대편에
 * 서는 셈이라, 인원이 늘수록 처형이 구조적으로 불가능해졌다.
 *
 * 지금은 기권이 어느 쪽도 아니다. 같은 코드베이스가 이미 tallyVotes에서
 * "처형은 되돌릴 수 없고 스킵은 밤 한 번을 내주는 것뿐이라, 표가 갈렸을 때
 * 값이 싼 쪽을 고른다"고 정해 두었다. 찬반도 같은 저울을 쓴다 — 3:3이면
 * 살린다. `agree > oppose`는 둘 다 0일 때(아무도 안 누른 낮) 자동으로
 * 거짓이라 별도의 방어가 필요 없다.
 *
 * **협박당한 사람은 반대로 센다.** 좌석 문서가 정한 규칙이고, 건달의 협박이
 * "한 표를 지운다"가 아니라 "한 표를 뺏어 반대편에 놓는다"여야 능력에 값이
 * 생긴다. 눌러 보지도 못한 사람이라 canJudge가 아니라 여기서 갈린다.
 *
 * 접속이 끊긴 사람은 기권으로 흘러간다. 예전에는 분모에 남아 반대로 세어졌고
 * 주석도 그렇게 적혀 있었지만, 기권을 중립으로 옮긴 이상 따로 다룰 이유가
 * 없다 — 끊긴 사람에게 찬성과 반대 중 하나를 대신 골라 줄 근거가 없다.
 *
 * 정치인의 2표 가중치는 여기에 적용하지 않는다. 지목에서 두 표를 쓰는 것과
 * 처형 면역이 이미 정치인의 몫이고, 찬반까지 두 표면 혼자 판을 뒤집는다.
 */
function judgementPassed(room: Room): boolean {
	let agree = 0;
	let oppose = 0;
	for (const seat of room.seats) {
		if (!canJudge(room, seat)) continue;
		if (seat.intimidated) {
			oppose++;
			continue;
		}
		if (seat.judgement === Judgement.AGREE) agree++;
		else if (seat.judgement === Judgement.OPPOSE) oppose++;
	}
	return agree > oppose;
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
		room.voteRecord.message = `🕊️ 찬성이 반대를 넘지 못해 ${participantLabel(nominee)}는 살아남았습니다.`;
		Chat.announce(room, room.voteRecord.message);
		return false;
	}

	// 처형 사실은 kill이 직접 알린다 — 마피아 팀이었는지까지 밝히므로
	room.voteRecord.message = `☠️ ${participantLabel(nominee)}가 처형되었습니다.`;
	kill(room, nominee, DeathCause.EXECUTION);
	return true;
}
