/**
 * 낮 토론과 투표.
 *
 * 기존 투표 처리의 문제:
 *   - 서버가 같은 사람의 표를 몇 번이든 받았다. 위젯이 투표 후 스스로 닫혔을 뿐,
 *     서버에는 "이미 투표했는가"를 확인하는 코드가 없었다.
 *     위젯을 조작하면 표를 무제한으로 넣을 수 있었다.
 *   - 죽은 사람의 votecount도 최다 득표 계산에 들어갔다.
 *   - `player.tag.widget.destroy()` 뒤에 null을 넣지 않아 이미 파괴된 위젯에
 *     메시지를 보내는 경로가 남았다.
 */
import type { ScriptPlayer, ScriptWidget } from "zep-script";
import type { Room, Seat } from "../types/Game.types.ts";
import type { SeatView } from "../types/Widget.types.ts";
import { GamePhase } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import type { VoteResult } from "../domain/Vote.ts";
import { SKIP_VOTE, tallyVotes, VoteOutcome } from "../domain/Vote.ts";
import { roleDef } from "../domain/Roles.ts";
import { aliveSeats, enterPhase, participantLabel, seatAt, seatViews } from "../entities/Room.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { asInt, field, messageType } from "../types/Widget.types.ts";
import { centerLabel, forEachPlayer, label, playSound } from "./Broadcast.ts";
import * as Chat from "./ChatService.ts";
import { playCut } from "./Cut.ts";
import { beginDayStage } from "./Stage.ts";
import { bindMessage, identityOf, openPhase, openVote, updateMain } from "./Widgets.ts";

/**
 * 한 낮에 지목 투표를 몇 번까지 돌리는가. 2 = 첫 투표 + 재지목 한 번.
 *
 * 찬반투표가 부결되면 낮으로 돌아가는데, 상한이 없으면 반대만 눌러
 * 낮을 무한히 늘일 수 있다. 값이 2인 이유는 tools/balance로 재 봤기
 * 때문이다 — 재지목 1회는 시민 승률을 거의 바꾸지 않는다(11인 21.1%→20.7%).
 * 비싼 것은 찬반투표라는 관문 자체지 몇 번 돌리느냐가 아니다.
 */
const MAX_VOTE_ROUNDS = 2;

/** 시간 조절 버튼 한 번의 크기(초). 연장은 +, 단축은 - */
const TIME_STEP = 15;

/**
 * 시간을 줄여도 남겨 두는 최소 시간(초).
 *
 * 0까지 줄이면 누른 사람만 다음 단계를 예상하고 나머지는 문장을 쓰다 만다.
 * 째깍 사운드가 울리는 구간(TICK_TOCK_AT)만큼은 남긴다.
 */
const MIN_DAY_LEFT = 5;

/** 생존자 수에 비례하는 토론 시간 */
function dayDuration(room: Room, aliveCount: number): number {
	const timing = room.ruleSet.timing;
	const seconds = timing.DAY_PER_ALIVE * aliveCount;
	return seconds > timing.DAY_MAX ? timing.DAY_MAX : seconds;
}

export function beginDay(room: Room): void {
	enterPhase(room, GamePhase.DAY);
	room.phaseTimer = dayDuration(room, aliveSeats(room).length);
	room.tickTockPlayed = false;

	// 시간 조절권은 하루에 하나다. 부결로 낮이 다시 열려도(resumeDay)
	// 새로 주지 않는다 — 재지목은 같은 낮이고, 두 번 주면 한 사람이
	// 하루에 30초를 늘릴 수 있다
	for (const seat of room.seats) seat.timeVoteSpent = false;

	beginDayStage(room);
	playSound(room, Sound.MORNING);

	// 아침이 왔다는 사실은 방 전체가 같이 겪는 일이다. 전에는 사람 수만큼
	// 개인 안내를 보냈고, 그래서 재접속한 사람의 기록에는 아침이 없었다.
	//
	// say(진행 안내)지 announce(사건)가 아니다. 단계 전환은 게임이 알려주는
	// 것이고, 사건은 게임 안에서 벌어진 일이다. 나중에 "이벤트만 보기"를
	// 켰을 때 아침·밤이 사망과 섞여 나오면 걸러낸 의미가 없다.
	Chat.say(room, `🌞 ${room.turnCount}번째 아침이 밝았습니다.`);

	/*
	 * 밤 사이 사건을 컷으로 한 번 읽힌다.
	 *
	 * 같은 내용이 낮 화면에도 남아 있지만(openDayView가 deaths로 싣는다)
	 * 역할이 다르다. 컷은 "무슨 일이 있었는지 다 같이 확인하는 순간"이고
	 * 낮 화면 목록은 "토론하다 다시 확인하는 곳"이다. 컷이 없으면 낮이
	 * 시작하자마자 각자 목록을 읽느라 첫 몇 초가 조용하다.
	 *
	 * 조용한 밤이면 lines가 비어 제목만 도는 짧은 컷이 된다 — 그것도
	 * 정보다("아무도 죽지 않았다").
	 */
	playCut(room, "day", `🌞 ${room.turnCount}번째 아침`, room.nightReport);

	forEachPlayer(room, (player, seat) => openDayView(room, player, seat));

	// 채팅 권한 갱신(밤 탭 잠그기)은 여기서 하지 않는다.
	// GameFlow.advancePhase가 모든 전이 뒤에 한 번 부른다.
}

/**
 * 찬반투표가 부결돼 다시 열리는 낮.
 *
 * 처음 낮의 절반만 준다. 규칙은 "다시 낮 토론으로 돌아간다"까지만 정하고
 * 길이를 말하지 않는데, 온전한 한 낮을 다시 주면 12인 판의 하루가 6분이
 * 된다. 절반이면 "한 명은 아니었으니 다시 고르자"에 필요한 만큼은 되고
 * 판이 늘어지지는 않는다.
 *
 * 아침 사운드도 아침 컷도 다시 틀지 않는다. 새 아침이 아니라 같은 낮이다.
 * 무대(beginDayStage)도 이미 낮 상태 그대로다.
 */
export function resumeDay(room: Room): void {
	enterPhase(room, GamePhase.DAY);
	room.phaseTimer = Math.floor(dayDuration(room, aliveSeats(room).length) / 2);
	room.tickTockPlayed = false;

	Chat.say(room, "🌞 처형이 무산되어 토론을 이어갑니다. 곧 다시 투표합니다.");
	forEachPlayer(room, (player, seat) => openDayView(room, player, seat));
}

/** 한 사람의 아침 화면 */
export function openDayView(room: Room, player: ScriptPlayer, seat: Seat): void {
	const widget = openPhase(player, {
		type: "init",
		phase: "day",
		turn: room.turnCount,
		total: room.total,
		aliveCount: aliveSeats(room).length,
		timer: room.phaseTimer,
		...identityOf(seat),
		note: seat.alive ? "투표 전까지 이야기를 나누세요." : "당신은 죽었습니다. 관전 중입니다.",
		// 밤사이 무슨 일이 있었는지는 채팅이 아니라 화면에 남는다
		deaths: room.nightReport,
		spectating: false,
		// 죽은 사람에게는 버튼을 그리지 않는다. 남은 사람들의 시간이다
		timeVote: seat.alive && !seat.timeVoteSpent,
	});
	if (seat.alive) bindTimeWidget(widget);
}

/**
 * 낮 화면의 ±15초 버튼.
 *
 * 위젯이 버튼을 숨기는 것은 안내일 뿐 방어가 아니다. 이미 썼는지, 지금이
 * 낮인지, 살아 있는지는 전부 서버가 다시 본다.
 */
function bindTimeWidget(widget: ScriptWidget): void {
	bindMessage(widget, "day", (sender, data) => {
		if (messageType(data) !== "time") return;

		const found = locate(sender.id);
		if (!found) return;
		const room = found.room;
		const seat = found.seat;

		if (room.phase !== GamePhase.DAY) return;
		if (!seat.alive) return;
		if (seat.timeVoteSpent) {
			label(sender, "이번 낮에는 이미 시간을 조절했습니다.");
			return;
		}

		// 연장과 단축이 횟수를 공유한다 — 값은 딱 두 개뿐이다
		const delta = asInt(field(data, "delta"));
		if (delta !== TIME_STEP && delta !== -TIME_STEP) return;
		if (delta < 0 && room.phaseTimer <= MIN_DAY_LEFT) {
			label(sender, "더 줄일 시간이 없습니다.");
			return;
		}

		seat.timeVoteSpent = true;
		const next = room.phaseTimer + delta;
		room.phaseTimer = next < MIN_DAY_LEFT ? MIN_DAY_LEFT : next;

		// 누가 늘렸는지를 남긴다. 시간이 갑자기 바뀌면 조작으로 보이고,
		// 누구인지 알면 그 자체가 토론 재료가 된다("왜 늘렸지?")
		Chat.say(
			room,
			delta > 0
				? `⏳ ${participantLabel(seat)}가 토론 시간을 ${TIME_STEP}초 늘렸습니다.`
				: `⏩ ${participantLabel(seat)}가 토론 시간을 ${TIME_STEP}초 줄였습니다.`
		);
		broadcastDayTimer(room);
	});
}

/**
 * 바뀐 남은 시간을 모두의 화면에 다시 싣는다.
 *
 * 위젯은 자기 시계를 따로 돌린다(서버가 매 초 보내면 사람 수만큼 메시지가
 * 난다). 그래서 시간이 바깥에서 바뀐 순간에는 한 번 맞춰 줘야 한다.
 */
function broadcastDayTimer(room: Room): void {
	const payload = { type: "timer", timer: room.phaseTimer, timeVote: false };
	forEachPlayer(room, (player, seat) => {
		updateMain(player, { ...payload, timeVote: seat.alive && !seat.timeVoteSpent });
	});
}

export function beginVote(room: Room): void {
	enterPhase(room, GamePhase.VOTE);
	room.phaseTimer = room.ruleSet.timing.VOTE;
	room.tickTockPlayed = false;
	room.voteRound++;

	// 표는 이번 투표에서만 유효하다
	for (const seat of room.seats) {
		seat.votedFor = 0;
		seat.voteCount = 0;
	}

	playSound(room, Sound.VOTE);
	centerLabel(room, "투표가 시작되었습니다.");
	// 중앙 라벨은 몇 초 뒤 사라진다. 늦게 화면을 본 사람과 재접속한 사람에게는
	// 채팅 기록만 남으므로, 사라지는 안내는 항상 남는 안내와 짝을 이룬다
	Chat.say(
		room,
		room.voteRound > 1
			? "🗳️ 다시 투표합니다. 방금 부결된 사람은 고를 수 없습니다."
			: "🗳️ 투표가 시작되었습니다. 처형할 사람을 고르거나 '투표 없음'을 누르세요."
	);

	forEachPlayer(room, (player, seat) => openVoteView(room, player, seat));
}

/** 이번 낮에 이미 부결된 번호인가. 같은 사람을 다시 단상에 세우지 않는다 */
function isRejected(room: Room, num: number): boolean {
	return room.rejected.indexOf(num) >= 0;
}

/**
 * 한 사람의 투표 화면.
 *
 * 핸들러는 위젯마다 새로 문다. 위젯이 죽으면 핸들러도 같이 죽으므로
 * 재접속으로 새 위젯을 열 때 다시 물어야 표가 서버에 도달한다.
 */
export function openVoteView(room: Room, player: ScriptPlayer, seat: Seat): void {
	const widget = openVote(player, {
		type: "init",
		myNum: seat.index,
		seats: seatViews(room),
		timer: room.phaseTimer,
		picked: seat.votedFor,
		rejected: room.rejected,
	});
	if (canVote(seat)) bindVoteWidget(widget);
	sendVoteProgress(room, player);
}

/**
 * 이 좌석이 이번 투표에 참여할 수 있는가.
 *
 * 지금은 생사 하나뿐이지만 판정이 세 곳(핸들러를 무는가 / 표를 받는가 /
 * 진행률의 분모에 드는가)에서 필요하고, 셋이 어긋나면 증상이 제각각이다 —
 * 핸들러만 빠뜨리면 위젯을 조작해 표를 넣을 수 있고, 분모만 빠뜨리면
 * 진행률이 영원히 100%에 닿지 않아 아무도 투표를 끝내지 못한 것처럼 보인다.
 * 조건이 하나여도 이름을 남겨 두는 이유다.
 */
function canVote(seat: Seat): boolean {
	return seat.alive;
}

/**
 * 표 하나의 무게. 표를 회수할 때도 같은 값을 빼야 하므로 계산이 한 곳에 있어야 한다.
 *
 * `??`를 쓰지 않는 것은 의도적이다. 이 프로젝트의 산출물은 Jint에서 돌고,
 * 어떤 ES 문법까지 받아주는지 확인할 방법이 없다. 코드베이스 어디에도
 * `??`·`?.`가 없는 상태를 굳이 이 한 줄로 깨지 않는다.
 */
function voteWeight(voter: Seat): number {
	const weight = roleDef(voter.role).voteWeight;
	return weight === undefined ? 1 : weight;
}

/** 이미 넣은 표를 회수한다. 표를 바꿀 수 있으려면 어디에 줬는지를 알아야 한다 */
function withdrawVote(room: Room, voter: Seat): void {
	if (voter.votedFor === 0) return;
	// 스킵은 표를 받는 좌석이 없다. votedFor만 비우면 집계에서 빠진다
	if (voter.votedFor !== SKIP_VOTE) {
		const previous = seatAt(room, voter.votedFor);
		if (previous) previous.voteCount -= voteWeight(voter);
	}
	voter.votedFor = 0;
}

/**
 * 투표 위젯의 메시지 처리.
 *
 * 기존에는 표를 한 번 넣으면 되돌릴 수 없었다("이미 투표했습니다"). 규칙상
 * 그래야 할 이유는 없었고, 단지 서버가 누구에게 줬는지를 기억하지 않아서
 * 되돌릴 방법이 없었을 뿐이다. 좌석이 대상 번호를 들고 있게 되면서
 * 표 변경과 기권이 모두 자연스럽게 가능해졌다.
 */
function bindVoteWidget(widget: ScriptWidget): void {
	bindMessage(widget, "vote", (sender, data) => {
		if (messageType(data) !== "vote") return;

		const found = locate(sender.id);
		if (!found) return;
		const room = found.room;
		const voter = found.seat;

		if (room.phase !== GamePhase.VOTE) return;
		if (!canVote(voter)) {
			label(sender, "투표 권한이 없습니다.");
			return;
		}

		// target이 없으면 기권 (같은 사람을 다시 눌러 취소한 경우),
		// SKIP_VOTE면 "투표 없음" — 셋 다 다른 선택이다
		const choice = asInt(field(data, "target"));
		const skip = choice === SKIP_VOTE;
		const target = choice === null || skip ? null : seatAt(room, choice);
		if (choice !== null && !skip) {
			if (!target || !target.alive) return;
			if (isRejected(room, target.index)) {
				label(sender, "방금 부결된 사람은 다시 고를 수 없습니다.");
				return;
			}
		}

		withdrawVote(room, voter);
		if (target) {
			voter.votedFor = target.index;
			target.voteCount += voteWeight(voter);
			label(sender, `${participantLabel(target)}에게 투표했습니다.`);
		} else if (skip) {
			voter.votedFor = SKIP_VOTE;
			label(sender, "'투표 없음'을 골랐습니다.");
		} else {
			label(sender, "기권했습니다.");
		}

		broadcastVoteProgress(room);
	});
}

/**
 * 몇 명이 투표를 마쳤는가.
 *
 * 누가 누구를 찍었는지는 개표 전까지 보내지 않는다. 실시간 득표를 보여주면
 * 뒤에 누르는 사람이 앞사람을 따라가게 되어 게임 규칙 자체가 바뀐다.
 * 반대로 "아직 몇 명 남았는가"를 모르면 화면만 보며 기다리게 된다.
 */
function voteProgress(room: Room): { type: "progress"; voted: number; alive: number } {
	let voted = 0;
	let alive = 0;
	for (const seat of room.seats) {
		// 접속이 끊긴 좌석은 분모에서 뺀다. 남겨두면 그 한 칸이 절대 채워지지
		// 않아 "아직 안 낸 사람이 있다"가 투표 시간 내내 떠 있는다.
		//
		// canVote에 넣지 않는 것은 의도적이다 — 그쪽은 "표를 낼 자격이
		// 있는가"이고 끊긴 사람의 자격은 그대로다(돌아오면 낸다). 여기서 묻는
		// 것은 "지금 이 칸이 채워질 수 있는가"라 질문이 다르다. 한 문장으로
		// 합치면 재접속한 사람의 표를 거절하게 된다.
		if (!canVote(seat) || !seat.connected) continue;
		alive++;
		// 스킵도 낸 표다(votedFor === SKIP_VOTE). "아직 안 냈다"는 0 하나뿐이다
		if (seat.votedFor !== 0) voted++;
	}
	return { type: "progress", voted, alive };
}

function sendVoteProgress(room: Room, player: ScriptPlayer): void {
	updateMain(player, voteProgress(room));
}

/** 접속 변화로 분모가 바뀌었을 때도 불린다 — GameFlow.refreshProgress 참고 */
export function broadcastVoteProgress(room: Room): void {
	const payload = voteProgress(room);
	forEachPlayer(room, player => updateMain(player, payload));
}

/**
 * 개표. 여기서 죽는 사람은 없다 — 최다 득표자를 단상에 세울 뿐이다.
 *
 * 처형이 확정되는 자리는 찬반투표(JUDGEMENT) 끝이다. 개표와 처형을
 * 갈라놓은 것이 마피아42 규칙의 핵심이고, 지목당한 사람에게 마지막으로
 * 말할 기회를 주기 때문에 "표가 몰렸다 = 죽는다"가 성립하지 않는다.
 */
export function beginVoteResult(room: Room): void {
	enterPhase(room, GamePhase.VOTE_RESULT);
	room.phaseTimer = room.ruleSet.timing.VOTE_RESULT;
	room.tickTockPlayed = true; // 결과 발표 중에는 째깍 사운드를 울리지 않는다

	const result = tallyVotes(room.seats);
	const nominee =
		result.outcome === VoteOutcome.EXECUTE && result.target ? result.target.index : 0;
	room.nominee = nominee;
	room.voteRecord = {
		board: result.board,
		nominee,
		message: outcomeMessage(result),
	};

	forEachPlayer(room, (player, seat) => openVoteResultView(room, player, seat));
	Chat.announce(room, room.voteRecord.message);
}

/**
 * 개표 결과 한 줄.
 *
 * 기존에는 이 문구가 switch 안에서 say()로 직접 나갔다. 채팅으로만 나가니
 * 결과 화면에는 숫자 막대만 있고 "그래서 어떻게 됐는가"가 없었다.
 * 문자열을 값으로 만들면 화면과 채팅이 같은 문장을 쓴다.
 *
 * EXECUTE가 더 이상 사망을 뜻하지 않으므로 문구도 "단상에 올랐다"까지만
 * 말한다. 처형 문구는 resolveJudgement가 쓴다.
 */
function outcomeMessage(result: VoteResult): string {
	const name = result.target ? participantLabel(result.target) : "";
	switch (result.outcome) {
		case VoteOutcome.SKIPPED:
			return "🕊️ '투표 없음'이 가장 많아 오늘은 아무도 단상에 오르지 않습니다.";
		case VoteOutcome.NO_VOTES:
			return "🕊️ 아무도 표를 받지 않아 단상이 비었습니다.";
		case VoteOutcome.TIE:
			return "🕊️ 동률이 나와 아무도 단상에 오르지 않습니다.";
		case VoteOutcome.IMMUNE:
			return `🎖️ ${name}는 정치인이라 단상에 오르지 않습니다.`;
		case VoteOutcome.EXECUTE:
			return `⚖️ ${name}가 최다 득표로 단상에 올랐습니다.`;
	}
}

/** 부결 뒤 다시 지목 투표를 돌릴 수 있는가 — 판정은 Trial.resolveJudgement */
export function canRevote(room: Room): boolean {
	return room.voteRound < MAX_VOTE_ROUNDS;
}

/**
 * 개표 화면이 그리는 좌석 목록.
 *
 * 득표수는 살아 있는 좌석이 아니라 집계 당시의 판에서 읽는다. 결과 화면이
 * 뜬 직후 처형이 일어나 그 좌석의 voteCount가 0으로 지워지기 때문이다.
 */
function resultSeats(room: Room): SeatView[] {
	return seatViews(room).map(view => {
		let votes = 0;
		for (const entry of room.voteRecord.board) {
			if (entry[0] === view.num) votes = entry[1];
		}
		return { ...view, votes };
	});
}

/** 한 사람의 투표 결과 화면 */
export function openVoteResultView(room: Room, player: ScriptPlayer, seat: Seat): void {
	openVote(player, {
		type: "result",
		myNum: seat.index,
		seats: resultSeats(room),
		nominee: room.voteRecord.nominee,
		message: room.voteRecord.message,
		timer: room.phaseTimer,
	});
}
