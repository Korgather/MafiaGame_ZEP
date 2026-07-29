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
import type { RevealView, Room, Seat, SeatView, VoteRecord } from "../types/Game.types.ts";
import { GamePhase, Role, Team } from "../types/Game.types.ts";
import { roomOrigin } from "../constants/RoomLayout.ts";
import { roleDef, roleName } from "../domain/Roles.ts";

/** 아직 개표가 없었을 때의 값 */
function emptyVoteRecord(): VoteRecord {
	return { board: [], executed: 0, message: "" };
}

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
		winner: null,
		voteRecord: emptyVoteRecord(),
		nightReport: [],
		seats: [],
		silhouettes: [],
		chatLog: [],
	};
	return room;
}

export function createSeat(playerId: string, name: string, rank: string): Seat {
	return {
		playerId,
		index: 0,
		name,
		rank,
		role: Role.CITIZEN,
		team: Team.CITIZEN,
		alive: false,
		ready: false,
		votedFor: 0,
		voteCount: 0,
		healed: false,
		attackedBy: [],
		armored: false,
		silenced: false,
		scooped: false,
		usedSkill: false,
		skillSpent: false,
		kickedBy: [],
		connected: true,
	};
}

/**
 * 게임이 시작될 때 좌석에 번호와 직업을 앉힌다.
 *
 * 기존에는 GameFlow.beginGame이 seat의 필드를 하나씩 직접 세웠다. 좌석에
 * 필드가 늘 때마다 그 목록을 createSeat과 beginGame 두 곳에서 맞춰야 했는데,
 * 한쪽만 고치면 "지난 판의 값이 남은 좌석"이 조용히 만들어진다. 게임 내내
 * 유지되는 값(군인의 방탄, 1회성 능력의 소진 여부)이 생기면서 실제 위험이 됐다 —
 * 예전 필드는 전부 매 밤 초기화돼서 한 판을 넘어 새지 않았다.
 */
export function assignRole(seat: Seat, index: number, role: Role): void {
	const def = roleDef(role);
	seat.index = index;
	seat.role = role;
	seat.team = def.team;
	seat.alive = true;
	seat.ready = false;
	seat.armored = def.survivesFirstAttack === true;
	seat.skillSpent = false;
	seat.usedSkill = false;
	seat.votedFor = 0;
	seat.voteCount = 0;
	seat.healed = false;
	seat.attackedBy = [];
	seat.silenced = false;
	seat.scooped = false;
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
 * 게임 중 화면이 그리는 참가자 목록.
 *
 * 기존에는 Night.ts와 Voting.ts가 각각 aliveIndices()라는 같은 함수를 갖고
 * 생존자의 번호 배열만 위젯에 보냈다. 함수가 두 벌이면 두 벌 다 고쳐야
 * 하는데, 실제로 밤 화면과 투표 화면은 대상 목록이 달라야 할 이유가 없다.
 *
 * 죽은 사람도 포함한다. 목록에서 사라지면 남은 사람들의 자리가 매 라운드
 * 밀려서, 어제 3번을 눌렀던 자리에 오늘은 다른 사람이 앉는다. 자리를
 * 고정하고 죽은 칸을 비활성으로 남기는 편이 오조작이 적다.
 */
export function seatViews(room: Room, allyTeam?: Team): SeatView[] {
	return room.seats
		.slice()
		.sort((a, b) => a.index - b.index)
		.map(seat => ({
			num: seat.index,
			name: seat.name,
			alive: seat.alive,
			ally: allyTeam !== undefined && seat.alive && seat.team === allyTeam,
			votes: seat.voteCount,
		}));
}

/** 종료 화면의 전원 직업 공개 */
export function revealViews(room: Room): RevealView[] {
	return room.seats
		.slice()
		.sort((a, b) => a.index - b.index)
		.map(seat => ({
			num: seat.index,
			name: seat.name,
			role: roleName(seat.role),
			team: seat.team,
			alive: seat.alive,
		}));
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

/**
 * 밤/투표 한 턴이 시작될 때 초기화되는 값 (기존 tagReset).
 *
 * armored(군인의 방탄)와 skillSpent(자경단원·기자의 1회성 능력)는 **일부러
 * 남긴다.** 게임당 한 번뿐인 자원이라 밤이 바뀔 때마다 되돌아오면 능력이
 * 무제한이 된다. 소모는 각각 resolveNightCasualties와 밤 위젯 핸들러에서만
 * 일어나고, 되돌리는 곳은 assignRole(게임 시작) 하나뿐이다.
 */
export function resetRound(room: Room): void {
	room.voteRecord = emptyVoteRecord();
	for (const seat of room.seats) {
		seat.usedSkill = false;
		seat.votedFor = 0;
		seat.voteCount = 0;
		seat.healed = false;
		seat.attackedBy = [];
		seat.silenced = false;
		seat.scooped = false;
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
	room.winner = null;
	room.voteRecord = emptyVoteRecord();
	room.nightReport = [];
	room.seats = [];
	room.silhouettes = [];
	// 지난 판의 대화는 다음 판에 남기지 않는다. 죽은 사람의 유령 채팅이
	// 다음 판 대기실에 되살아나면 그 자체로 정보 유출이다.
	room.chatLog = [];
}
