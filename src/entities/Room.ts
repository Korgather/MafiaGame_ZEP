/**
 * 방과 좌석의 생성·조회·초기화.
 *
 * 기존 GAMEROOM은 8개 방 리터럴을 통째로 복사·붙여넣기한 114줄이었다.
 * 필드를 하나 추가하면 8곳을 똑같이 고쳐야 했고, 실제로 방마다 미묘하게
 * 다른 초기값이 섞일 위험이 있었다.
 *
 * 초기화 로직도 startState(STATE_INIT)와 gameReset 두 곳에 중복돼 있었고
 * 두 곳이 리셋하는 필드 집합이 서로 달랐다(kickList/ready/kickCount는 한쪽에만).
 * 이제 리셋은 여기 한 곳뿐이다.
 */
import type { Room, Seat } from "../types/Game.types.ts";
import { GamePhase, Role, Team } from "../types/Game.types.ts";
import { roomOrigin } from "../constants/RoomLayout.ts";

export function createRoom(num: number): Room {
	const room: Room = {
		num,
		startPoint: roomOrigin(num),
		phase: GamePhase.LOBBY,
		started: false,
		phaseTimer: 0,
		countdown: 0,
		lastCountdownLabel: -1,
		tickTockPlayed: false,
		turnCount: 0,
		total: 0,
		seats: [],
		silhouettes: [],
	};
	return room;
}

export function createSeat(playerId: string, name: string, level: string): Seat {
	return {
		playerId,
		index: 0,
		name,
		level,
		role: Role.CITIZEN,
		team: Team.CITIZEN,
		alive: false,
		ready: false,
		voted: false,
		voteCount: 0,
		healed: false,
		marked: false,
		usedSkill: false,
		kickedBy: [],
		connected: true,
	};
}

export function findSeat(room: Room, playerId: string): Seat | undefined {
	for (const seat of room.seats) {
		if (seat.playerId === playerId) return seat;
	}
	return undefined;
}

export function seatAt(room: Room, index: number): Seat | undefined {
	for (const seat of room.seats) {
		if (seat.index === index) return seat;
	}
	return undefined;
}

export function aliveSeats(room: Room): Seat[] {
	return room.seats.filter(seat => seat.alive);
}

/**
 * 준비 완료 인원.
 *
 * 기존에는 room.readyCount를 join/ready/cancel/quit 네 곳에서 ++/--로 관리했다.
 * 한 경로라도 빠뜨리면 값이 영구히 어긋나 게임이 시작되지 않거나
 * 인원이 덜 찼는데 시작됐다. 파생값은 저장하지 않고 매번 센다 — 최대 8명이다.
 */
export function readyCount(room: Room): number {
	let count = 0;
	for (const seat of room.seats) {
		if (seat.ready) count++;
	}
	return count;
}

export function removeSeat(room: Room, playerId: string): Seat | undefined {
	for (let i = 0; i < room.seats.length; i++) {
		if (room.seats[i].playerId === playerId) {
			return room.seats.splice(i, 1)[0];
		}
	}
	return undefined;
}

/** 이 좌석을 강퇴 투표한 사람 수 */
export function kickCount(seat: Seat): number {
	return seat.kickedBy.length;
}

/**
 * 강퇴 투표를 토글한다. 돌려주는 값은 토글 후 상태.
 * 기존에는 투표자 쪽 kickList와 대상 쪽 kickCount를 따로 관리해서
 * 둘이 어긋날 수 있었다. 투표자 ID 목록 하나만 두면 개수는 파생된다.
 */
export function toggleKick(target: Seat, voterId: string): boolean {
	const at = target.kickedBy.indexOf(voterId);
	if (at >= 0) {
		target.kickedBy.splice(at, 1);
		return false;
	}
	target.kickedBy.push(voterId);
	return true;
}

/** 떠난 사람이 남긴 강퇴표를 모든 좌석에서 회수한다 */
export function withdrawKicks(room: Room, voterId: string): void {
	for (const seat of room.seats) {
		const at = seat.kickedBy.indexOf(voterId);
		if (at >= 0) seat.kickedBy.splice(at, 1);
	}
}

/** 밤/투표 한 턴이 시작될 때 초기화되는 값 (기존 tagReset) */
export function resetRound(room: Room): void {
	for (const seat of room.seats) {
		seat.usedSkill = false;
		seat.voted = false;
		seat.voteCount = 0;
		seat.healed = false;
		seat.marked = false;
	}
}

/** 게임이 끝나고 대기실로 돌아갈 때 (기존 gameReset + startState(INIT)) */
export function resetRoom(room: Room): void {
	room.phase = GamePhase.LOBBY;
	room.started = false;
	room.phaseTimer = 0;
	room.countdown = 0;
	room.lastCountdownLabel = -1;
	room.tickTockPlayed = false;
	room.turnCount = 0;
	room.total = 0;
	room.seats = [];
	room.silhouettes = [];
}
