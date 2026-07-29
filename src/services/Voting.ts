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
import type { ScriptWidget } from "zep-script";
import type { Room } from "../types/Game.types.ts";
import { GamePhase, Role } from "../types/Game.types.ts";
import { Sound, WidgetFile } from "../constants/Assets.ts";
import { POLITICIAN_VOTE_WEIGHT, TIMING } from "../constants/GameConfig.ts";
import { tallyVotes, VoteOutcome } from "../domain/Vote.ts";
import { seatAt } from "../entities/Room.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { asInt, field } from "../types/Widget.types.ts";
import { centerLabel, forEachPlayer, label, playSound, say, tell } from "./Broadcast.ts";
import { DeathCause, kill } from "./Death.ts";
import { beginDayStage } from "./Stage.ts";
import { closeGhost, openPhase } from "./Widgets.ts";

/** 생존자 수에 비례하는 토론 시간 */
function dayDuration(aliveCount: number): number {
	const seconds = TIMING.DAY_PER_ALIVE * aliveCount;
	return seconds > TIMING.DAY_MAX ? TIMING.DAY_MAX : seconds;
}

export function beginDay(room: Room): void {
	let alive = 0;
	for (const seat of room.seats) {
		if (seat.alive) alive++;
	}

	room.phase = GamePhase.DAY;
	room.phaseTimer = dayDuration(alive);
	room.tickTockPlayed = false;

	beginDayStage(room);
	playSound(room, Sound.MORNING);

	forEachPlayer(room, (player, seat) => {
		if (seat.alive) closeGhost(player);
		openPhase(player, WidgetFile.MORNING, {
			total: room.total,
			alive,
			timer: room.phaseTimer,
			description: "투표 전까지 이야기를 나누세요.",
		});
		tell(player, `🌞 ${room.turnCount}번째 아침`);
	});
}

export function beginVote(room: Room): void {
	room.phase = GamePhase.VOTE;
	room.phaseTimer = TIMING.VOTE;
	room.tickTockPlayed = false;

	// 표는 이번 투표에서만 유효하다
	const live: number[] = [];
	for (const seat of room.seats) {
		seat.voted = false;
		seat.voteCount = 0;
		if (seat.alive) live.push(seat.index);
	}

	playSound(room, Sound.VOTE);
	centerLabel(room, "투표가 시작되었습니다.");

	forEachPlayer(room, (player, seat) => {
		const widget = openPhase(player, WidgetFile.VOTE, {
			type: "init",
			total: room.total,
			alive: live.length,
			timer: room.phaseTimer,
			liveList: live,
		});
		if (seat.alive) bindVoteWidget(widget);
	});
}

function bindVoteWidget(widget: ScriptWidget): void {
	widget.onMessage.Add((sender, data) => {
		const choice = asInt(field(data, "vote"));
		if (choice === null) return;

		const found = locate(sender.id);
		if (!found) return;
		const room = found.room;
		const voter = found.seat;

		if (room.phase !== GamePhase.VOTE) return;
		if (!voter.alive) {
			label(sender, "투표 권한이 없습니다.");
			return;
		}
		if (voter.voted) {
			label(sender, "이미 투표했습니다.");
			return;
		}

		const target = seatAt(room, choice);
		if (!target || !target.alive) return;

		voter.voted = true;
		target.voteCount += voter.role === Role.POLITICIAN ? POLITICIAN_VOTE_WEIGHT : 1;
		label(sender, `${choice}번 참가자에게 투표했습니다.`);
	});
}

export function beginVoteResult(room: Room): void {
	room.phase = GamePhase.VOTE_RESULT;
	room.phaseTimer = TIMING.VOTE_RESULT;
	room.tickTockPlayed = true; // 결과 발표 중에는 째깍 사운드를 울리지 않는다

	const result = tallyVotes(room.seats);

	forEachPlayer(room, player => {
		openPhase(player, WidgetFile.VOTE_RESULT, {
			type: "voteResult",
			result: result.board,
		});
	});

	switch (result.outcome) {
		case VoteOutcome.NO_VOTES:
			say(room, "🕊️ 아무도 표를 받지 않아 처형이 무산되었습니다.");
			break;
		case VoteOutcome.TIE:
			say(room, "🕊️ 동률이 나와 아무도 처형되지 않았습니다.");
			break;
		case VoteOutcome.IMMUNE:
			say(
				room,
				`🎖️ ${result.target ? result.target.name : ""} 님은 정치인이라 처형되지 않았습니다.`
			);
			break;
		case VoteOutcome.EXECUTE:
			if (result.target) kill(room, result.target, DeathCause.EXECUTION);
			break;
	}
}
