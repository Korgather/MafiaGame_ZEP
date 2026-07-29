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
import type { Room, Seat, SeatView } from "../types/Game.types.ts";
import { GamePhase } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import { TIMING } from "../constants/GameConfig.ts";
import type { VoteResult } from "../domain/Vote.ts";
import { tallyVotes, VoteOutcome } from "../domain/Vote.ts";
import { roleDef, roleName } from "../domain/Roles.ts";
import { aliveSeats, seatAt, seatViews } from "../entities/Room.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { asInt, field, messageType } from "../types/Widget.types.ts";
import { centerLabel, forEachPlayer, label, playSound, say, tell } from "./Broadcast.ts";
import { DeathCause, kill } from "./Death.ts";
import { beginDayStage } from "./Stage.ts";
import { closeGhost, openPhase, openVote, updateMain } from "./Widgets.ts";

/** 생존자 수에 비례하는 토론 시간 */
function dayDuration(aliveCount: number): number {
	const seconds = TIMING.DAY_PER_ALIVE * aliveCount;
	return seconds > TIMING.DAY_MAX ? TIMING.DAY_MAX : seconds;
}

export function beginDay(room: Room): void {
	room.phase = GamePhase.DAY;
	room.phaseTimer = dayDuration(aliveSeats(room).length);
	room.tickTockPlayed = false;

	beginDayStage(room);
	playSound(room, Sound.MORNING);

	forEachPlayer(room, (player, seat) => {
		openDayView(room, player, seat);
		tell(player, `🌞 ${room.turnCount}번째 아침`);
	});
}

/** 한 사람의 아침 화면 */
export function openDayView(room: Room, player: ScriptPlayer, seat: Seat): void {
	if (seat.alive) closeGhost(player);
	openPhase(player, {
		type: "init",
		phase: "day",
		turn: room.turnCount,
		total: room.total,
		aliveCount: aliveSeats(room).length,
		timer: room.phaseTimer,
		role: roleName(seat.role),
		team: seat.team,
		alive: seat.alive,
		note: seat.alive ? "투표 전까지 이야기를 나누세요." : "당신은 죽었습니다. 관전 중입니다.",
		// 밤사이 무슨 일이 있었는지는 채팅이 아니라 화면에 남는다
		deaths: room.nightReport,
	});
}

export function beginVote(room: Room): void {
	room.phase = GamePhase.VOTE;
	room.phaseTimer = TIMING.VOTE;
	room.tickTockPlayed = false;

	// 표는 이번 투표에서만 유효하다
	for (const seat of room.seats) {
		seat.votedFor = 0;
		seat.voteCount = 0;
	}

	playSound(room, Sound.VOTE);
	centerLabel(room, "투표가 시작되었습니다.");

	forEachPlayer(room, (player, seat) => openVoteView(room, player, seat));
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
		silenced: seat.silenced,
	});
	if (canVote(seat)) bindVoteWidget(widget);
	sendVoteProgress(room, player);
}

/**
 * 이 좌석이 이번 투표에 참여할 수 있는가.
 *
 * 판정이 세 곳(핸들러를 무는가 / 표를 받는가 / 진행률의 분모에 드는가)에서
 * 필요한데, 셋이 어긋나면 증상이 제각각이다 — 핸들러만 빠뜨리면 위젯을
 * 조작해 표를 넣을 수 있고, 분모만 빠뜨리면 진행률이 영원히 100%에
 * 닿지 않아 아무도 투표를 끝내지 못한 것처럼 보인다. 조건은 한 줄로 둔다.
 */
function canVote(seat: Seat): boolean {
	return seat.alive && !seat.silenced;
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
	const previous = seatAt(room, voter.votedFor);
	if (previous) previous.voteCount -= voteWeight(voter);
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
	widget.onMessage.Add((sender, data) => {
		if (messageType(data) !== "vote") return;

		const found = locate(sender.id);
		if (!found) return;
		const room = found.room;
		const voter = found.seat;

		if (room.phase !== GamePhase.VOTE) return;
		if (!canVote(voter)) {
			label(sender, voter.silenced ? "협박당해 이번 투표에는 참여할 수 없습니다." : "투표 권한이 없습니다.");
			return;
		}

		// target이 없으면 기권 (같은 사람을 다시 눌러 취소한 경우)
		const choice = asInt(field(data, "target"));
		const target = choice === null ? null : seatAt(room, choice);
		if (choice !== null && (!target || !target.alive)) return;

		withdrawVote(room, voter);
		if (target) {
			voter.votedFor = target.index;
			target.voteCount += voteWeight(voter);
			label(sender, `${target.index}번 ${target.name} 님에게 투표했습니다.`);
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
		// 협박당한 사람은 분모에서도 빠진다. 남겨두면 그 한 칸이 절대 채워지지
		// 않아 "아직 안 낸 사람이 있다"가 투표 시간 내내 떠 있는다.
		if (!canVote(seat)) continue;
		alive++;
		if (seat.votedFor > 0) voted++;
	}
	return { type: "progress", voted, alive };
}

function sendVoteProgress(room: Room, player: ScriptPlayer): void {
	updateMain(player, voteProgress(room));
}

function broadcastVoteProgress(room: Room): void {
	const payload = voteProgress(room);
	forEachPlayer(room, player => updateMain(player, payload));
}

export function beginVoteResult(room: Room): void {
	room.phase = GamePhase.VOTE_RESULT;
	room.phaseTimer = TIMING.VOTE_RESULT;
	room.tickTockPlayed = true; // 결과 발표 중에는 째깍 사운드를 울리지 않는다

	// 판을 먼저 남긴다. 아래 kill이 처형자를 좌석에서 죽이면 집계가 달라진다.
	const result = tallyVotes(room.seats);
	room.voteRecord = {
		board: result.board,
		executed: result.outcome === VoteOutcome.EXECUTE && result.target ? result.target.index : 0,
		message: outcomeMessage(result),
	};

	forEachPlayer(room, (player, seat) => openVoteResultView(room, player, seat));

	// 처형은 kill이 직접 알린다(마피아였는지까지 밝히므로). 나머지는 여기서.
	if (result.outcome === VoteOutcome.EXECUTE) {
		if (result.target) kill(room, result.target, DeathCause.EXECUTION);
	} else {
		say(room, room.voteRecord.message);
	}
}

/**
 * 개표 결과 한 줄.
 *
 * 기존에는 이 문구가 switch 안에서 say()로 직접 나갔다. 채팅으로만 나가니
 * 결과 화면에는 숫자 막대만 있고 "그래서 어떻게 됐는가"가 없었다.
 * 문자열을 값으로 만들면 화면과 채팅이 같은 문장을 쓴다.
 */
function outcomeMessage(result: VoteResult): string {
	const name = result.target ? result.target.name : "";
	switch (result.outcome) {
		case VoteOutcome.NO_VOTES:
			return "🕊️ 아무도 표를 받지 않아 처형이 무산되었습니다.";
		case VoteOutcome.TIE:
			return "🕊️ 동률이 나와 아무도 처형되지 않았습니다.";
		case VoteOutcome.IMMUNE:
			return `🎖️ ${name} 님은 정치인이라 처형되지 않았습니다.`;
		case VoteOutcome.EXECUTE:
			return `☠️ ${name} 님이 처형되었습니다.`;
	}
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
		executed: room.voteRecord.executed,
		message: room.voteRecord.message,
		timer: room.phaseTimer,
	});
}
