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
import type { Room, Seat, VoteRecord } from "../types/Game.types.ts";
import type { RevealView, SeatView } from "../types/Widget.types.ts";
import { GamePhase, Judgement, Role, Team } from "../types/Game.types.ts";
import { KICK } from "../constants/GameConfig.ts";
import { roomOrigin } from "../constants/RoomLayout.ts";
import { roleDef, roleName, startsContacted } from "../domain/Roles.ts";
import { rulesForRoom } from "../domain/RuleSet.ts";
// 이 파일이 services를 부르는 유일한 자리다. 순환이 되지 않는 것은 Screen이
// leaf이기 때문이다 — 그쪽은 타입·상수와 Broadcast만 알고 entities를 모른다.
// 표 전체가 아니라 이름 하나만 가져오는 것도 그 경계를 눈에 보이게 두려는
// 것이다(다른 파일들의 `import * as Screen`과 다른 이유).
import { Veil } from "../services/Screen.ts";

/** 아직 개표가 없었을 때의 값 */
function emptyVoteRecord(): VoteRecord {
	return { board: [], nominee: 0, message: "" };
}

export function createRoom(num: number): Room {
	const room: Room = {
		num,
		startPoint: roomOrigin(num),
		ruleSet: rulesForRoom(num),
		phase: GamePhase.LOBBY,
		// 대기실에는 판이 없다. 빈 문자열과 0은 "아직 아무 판도 시작되지
		// 않았다"는 뜻이고, 그래서 이 상태에서 도착하는 게임 이벤트는
		// gameId 비교 하나로 전부 걸러진다
		gameId: "",
		phaseId: 0,
		seed: 0,
		started: false,
		phaseTimer: 0,
		countdown: 0,
		lastCountdownLabel: -1,
		tickTockPlayed: false,
		turnCount: 0,
		total: 0,
		winner: null,
		voteRecord: emptyVoteRecord(),
		nominee: 0,
		rejected: [],
		voteRound: 0,
		nightReport: [],
		nightIntents: [],
		nightReveals: [],
		seats: [],
		spectators: [],
		silhouettes: [],
		chatLog: [],
		cut: null,
		shot: null,
		ambience: "",
		// 1은 "각자의 기본 배율 그대로"다(Screen.Zoom.LOBBY). 대기실에서
		// 카메라를 건드리지 않는다는 뜻이라 0이 아니라 1이 초기값이다
		zoom: 1,
		veil: Veil.NONE,
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
		rematch: false,
		votedFor: 0,
		voteCount: 0,
		judgement: Judgement.NONE,
		timeVoteSpent: false,
		healed: false,
		attackedBy: [],
		armored: false,
		blocked: false,
		scooped: false,
		// 보조직업이 아닌 좌석에서는 언제나 참이다(Seat 선언 참고). 대기실
		// 좌석은 아직 직업이 없으므로 참으로 두고, assignRole이 다시 정한다
		contacted: true,
		seduced: false,
		intimidated: false,
		exorcised: false,
		loverIndex: 0,
		borrowedRole: null,
		markIndex: 0,
		extraProbeIndex: 0,
		extraProbeSpent: false,
		usedSkill: false,
		usesSpent: 0,
		noteText: "",
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
	seat.usesSpent = 0;
	seat.noteText = "";
	seat.usedSkill = false;
	seat.votedFor = 0;
	seat.voteCount = 0;
	seat.judgement = Judgement.NONE;
	seat.timeVoteSpent = false;
	seat.healed = false;
	seat.attackedBy = [];
	seat.blocked = false;
	seat.scooped = false;
	seat.contacted = startsContacted(role);
	seat.seduced = false;
	seat.intimidated = false;
	seat.exorcised = false;
	seat.borrowedRole = null;
	// 폭탄은 한 판을 넘기지 않는다. 밤마다 지우지 않는 값이라(다음 낮의 처형
	// 까지 살아야 한다) 판이 바뀌는 이 자리에서 반드시 지워야 한다
	seat.markIndex = 0;
	// 추가 첩보도 같다. 판에 한 번뿐이라 밤 리셋이 손대지 않으므로 여기서
	// 되돌리지 않으면 지난 판에 쓴 스파이가 이번 판에 못 쓴다
	seat.extraProbeIndex = 0;
	seat.extraProbeSpent = false;
	// loverIndex는 여기서 건드리지 않는다. 짝은 좌석 하나로 정할 수 없어
	// 배정이 끝난 뒤 두 좌석을 함께 보는 쪽(GameFlow)이 서로를 적는다.
	// 이 함수가 0으로 밀면 그 쌍이 배정 순서에 따라 반쪽만 남는다
}

/*
 * 아래 네 함수는 "어느 목록에서 찾는가"만 다르다. 좌석과 관전자가 같은 Seat
 * 값이면서 다른 배열에 살기 때문인데, 찾기·빼기를 각 목록마다 다시 적으면
 * 네 벌이 조금씩 어긋난다(실제로 removeSeat만 splice 반환값을 돌려줬다).
 * 목록을 인자로 받는 두 함수를 두고 나머지는 이름만 붙인다.
 */
function findIn(seats: Seat[], playerId: string): Seat | undefined {
	for (const seat of seats) {
		if (seat.playerId === playerId) return seat;
	}
	return undefined;
}

function removeFrom(seats: Seat[], playerId: string): Seat | undefined {
	for (let i = 0; i < seats.length; i++) {
		if (seats[i].playerId === playerId) {
			return seats.splice(i, 1)[0];
		}
	}
	return undefined;
}

export function findSeat(room: Room, playerId: string): Seat | undefined {
	return findIn(room.seats, playerId);
}

/** 관전자 목록에서 찾는다. 좌석과 섞이지 않게 이름을 나눠 둔다 */
export function findSpectator(room: Room, playerId: string): Seat | undefined {
	return findIn(room.spectators, playerId);
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
 * 죽은 좌석. 영매·성직자의 대상 목록이자, 그들에게 이번 밤 차례가 도는지의 근거다.
 *
 * 좌석이 판 내내 남아 있어서(사망 처리는 alive만 내린다) 이 숫자는
 * room.total에서 생존자를 빼도 같다. 그래도 직접 세는 이유는 total이
 * 판 시작 시점의 값이고, 이쪽은 "지금 무덤에 몇 명 있는가"라서다.
 */
export function deadSeats(room: Room): Seat[] {
	return room.seats.filter(seat => !seat.alive);
}

export function participantLabel(seat: Pick<Seat, "index">): string {
	return `${seat.index}번 참가자`;
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
 *
 * **득표수는 여기서 나가지 않는다.** 예전에는 `votes: seat.voteCount`가 붙어
 * 있었는데, 투표 화면(Voting.openVoteView)이 이 목록을 그대로 보내므로 투표
 * 도중에 화면을 새로 여는 사람 — 재접속자와 관전 입장자 — 만 현재 득표를
 * 실시간으로 보게 됐다. 나머지는 "몇 명이 냈는가"만 받는데(voteProgress)
 * 한 경로만 판을 다 보여주면 그 경로가 곧 이득이 된다. 개표 화면의 숫자는
 * 집계 당시의 기록(Voting.resultSeats)에서 따로 붙는다.
 */
export function seatViews(room: Room, allyTeam?: Team): SeatView[] {
	return room.seats
		.slice()
		.sort((a, b) => a.index - b.index)
		.map(seat => ({
			num: seat.index,
			name: participantLabel(seat),
			alive: seat.alive,
			ally: allyTeam !== undefined && seat.alive && seat.team === allyTeam,
		}));
}

/** 종료 화면의 전원 직업 공개 */
export function revealViews(room: Room): RevealView[] {
	return room.seats
		.slice()
		.sort((a, b) => a.index - b.index)
		.map(seat => ({
			num: seat.index,
			name: participantLabel(seat),
			role: roleName(seat.role),
			glyph: roleDef(seat.role).glyph,
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
	return removeFrom(room.seats, playerId);
}

export function removeSpectator(room: Room, playerId: string): Seat | undefined {
	return removeFrom(room.spectators, playerId);
}

/** 이 좌석을 강퇴 투표한 사람 수 */
export function kickCount(seat: Seat): number {
	return seat.kickedBy.length;
}

/**
 * 이 인원에서 강퇴에 필요한 표 수.
 *
 * 화면(대기실 위젯의 "강퇴 2/3")과 판정(voteKick)이 같은 답을 봐야 하므로
 * 계산은 여기 한 곳에만 둔다. 두 곳에서 따로 세면 눌러도 안 되는 버튼이나
 * 예고 없이 쫓겨나는 사람이 생긴다.
 */
export function kickVotesNeeded(seatCount: number): number {
	return Math.max(KICK.MIN_VOTES, Math.ceil(seatCount * KICK.VOTE_SHARE));
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
 * armored(군인의 방탄)·usesSpent(횟수 제한 능력의 소모)·extraProbeSpent(스파이의
 * 추가 첩보)는 **일부러 남긴다.**
 * 게임당 정해진 자원이라 밤이 바뀔 때마다 되돌아오면 능력이 무제한이 된다.
 * 소모는 각각 resolveNightCasualties와 NightPipeline에서만 일어나고,
 * 되돌리는 곳은 assignRole(게임 시작) 하나뿐이다.
 */
export function resetRound(room: Room): void {
	room.voteRecord = emptyVoteRecord();
	// 단상과 부결 명단은 하루짜리다. 남기면 어제 부결된 사람이 오늘도
	// 지목 대상에서 빠진다
	room.nominee = 0;
	room.rejected = [];
	room.voteRound = 0;
	// 지난밤의 지목은 남겨두면 다음 밤에 그대로 다시 적용된다
	room.nightIntents = [];
	// 정상 경로에서는 이미 비어 있다. 게임이 중간에 리셋된 경우를 위한 것이다
	room.nightReveals = [];
	for (const seat of room.seats) {
		seat.usedSkill = false;
		// 찍어 둔 둘째 대상은 하룻밤짜리다. 남기면 다음 밤에 아무도 안 눌러도
		// 지난밤의 그 사람이 다시 조사된다. 실제로 썼는지(extraProbeSpent)는
		// 판 전체의 값이라 여기서 건드리지 않는다 — 되돌리면 밤마다 쓸 수 있게 된다
		seat.extraProbeIndex = 0;
		// 지난밤에 고른 문구가 남으면 대상만 새로 찍어도 옛 문구가 다시 날아간다.
		// 밤이 끝날 때가 아니라 시작할 때 지우는 것이라(beginNight → resetRound,
		// 정산은 resolveNight) 배달 전에 지워질 일은 없다
		seat.noteText = "";
		seat.votedFor = 0;
		seat.voteCount = 0;
		seat.judgement = Judgement.NONE;
		seat.healed = false;
		seat.attackedBy = [];
		// 지우지 않으면 한 번 막힌 사람이 남은 판 내내 막힌 채로 있는다
		seat.blocked = false;
		seat.scooped = false;
		/*
		 * 유혹과 협박은 blocked보다 정확히 하루 더 산다. 걸린 밤에는
		 * 능력을(유혹만) 막고, 이어지는 낮에 발언과 투표를 막고, 다음 밤이
		 * 시작되는 이 자리에서 풀린다.
		 *
		 * 그래서 밤 정산이 끝나는 자리에서 지우면 안 된다 — 그러면 낮에
		 * 아무 일도 일어나지 않아 두 능력이 통째로 사라진다. 이 함수가
		 * beginNight에서만 불리는 것이 그 수명의 근거다.
		 */
		seat.seduced = false;
		seat.intimidated = false;
	}
}

/**
 * 단계를 바꾼다. 단계 대입은 전부 이 함수를 지난다.
 *
 * room.phase = ... 를 직접 쓰면 phaseId를 올리는 것을 잊는다. 실제로 대입은
 * 열 곳에 흩어져 있었고, 그중 한 곳이라도 순번을 빠뜨리면 그 단계에서만
 * 지난 화면의 늦은 클릭이 살아 들어온다 — 가장 찾기 어려운 종류의 버그다.
 *
 * 되감기지 않는 것이 핵심이다. 같은 단계로 다시 들어가도(재투표 → VOTE)
 * 순번은 오르므로, 1차 투표 화면에서 늦게 도착한 표가 2차 투표에 섞이지 않는다.
 */
export function enterPhase(room: Room, phase: GamePhase): void {
	room.phase = phase;
	room.phaseId++;
}

/** 게임이 끝나고 대기실로 돌아갈 때 (기존 gameReset + startState(INIT)) */
export function resetRoom(room: Room): void {
	room.phase = GamePhase.LOBBY;
	// 판이 끝났으므로 식별자를 비운다. 늦게 도착하는 지난 판의 이벤트는
	// 전부 gameId 비교에서 걸린다. phaseId는 여기서 0으로 되돌려도 안전하다 —
	// gameId가 이미 달라서 순번만으로 판을 가릴 일이 없다
	room.gameId = "";
	room.phaseId = 0;
	room.seed = 0;
	room.started = false;
	room.phaseTimer = 0;
	room.countdown = 0;
	room.lastCountdownLabel = -1;
	room.tickTockPlayed = false;
	room.turnCount = 0;
	room.total = 0;
	room.winner = null;
	room.voteRecord = emptyVoteRecord();
	room.nominee = 0;
	room.rejected = [];
	room.voteRound = 0;
	room.nightReport = [];
	room.nightIntents = [];
	// 정상 경로에서는 배달이 이미 비웠다. 사고 복구로 밤 도중에 방이 끝나면
	// 배달 전의 답이 남는데, 그건 지난 판의 정보라 다음 판으로 넘길 것이 아니다
	room.nightReveals = [];
	room.seats = [];
	// 관전자를 좌석으로 승격하는 것은 returnToLobby의 일이다. 여기서는 지운다 —
	// 이 함수는 "방을 빈 상태로" 만드는 곳이지 사람을 옮기는 곳이 아니고,
	// 테스트 격리(resetWorld)도 이 함수를 부르므로 사람이 남으면 다음 테스트로 샌다.
	room.spectators = [];
	room.silhouettes = [];
	// 지난 판의 대화는 다음 판에 남기지 않는다. 죽은 사람의 유령 채팅이
	// 다음 판 대기실에 되살아나면 그 자체로 정보 유출이다.
	room.chatLog = [];
	// 돌던 컷도 여기서 끊는다. 위젯은 나가는 사람마다 destroyWidgets가
	// 닫으므로 남는 것은 이 상태 하나다
	room.cut = null;
	// 카메라와 BGM은 사람에게 붙어 있다. 여기서는 방의 기억만 지우고,
	// 실제 복구(배율·카메라·정지)는 사람마다 resetPlayerAppearance가 한다 —
	// 이 함수는 테스트 격리에서도 불리므로 접속한 사람을 전제할 수 없다.
	room.shot = null;
	room.ambience = "";
	room.zoom = 1;
	room.veil = Veil.NONE;
}
