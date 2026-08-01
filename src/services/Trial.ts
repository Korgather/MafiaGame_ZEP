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
import { Bgm, Sound } from "../constants/Assets.ts";
import { enterPhase, participantLabel, seatAt } from "../entities/Room.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { field, messageType } from "../types/Widget.types.ts";
import { centerLabel, forEachPlayer, label, playSound } from "./Broadcast.ts";
import * as Chat from "./ChatService.ts";
import { DeathCause, kill } from "./Death.ts";
import * as Screen from "./Screen.ts";
import { bindMessage, identityOf, isStaleEvent, openJudgement, updateMain } from "./Widgets.ts";

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

	// 재판은 이 판에서 유일하게 한 사람만 말하는 시간이다. 음악을 바꾸고
	// 그 사람에게 카메라를 붙여 "지금 누구를 보는 자리인가"를 화면으로 말한다.
	// 배율이 아니라 카메라가 주인공을 정하므로, 반론 시간(15초)보다 훨씬
	// 짧게 잡아 4.5초 뒤에는 방 전체가 다시 보이게 둔다 — 반론을 듣는 동안
	// 다른 사람 반응도 봐야 추리가 된다
	Screen.setScene(room, Screen.Zoom.TRIAL, Bgm.TRIAL);
	Screen.focusSeat(room, room.nominee, Screen.Hold.DEFENSE, Screen.Zoom.SPOT, Screen.Zoom.TRIAL);

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

	// 반론 클로즈업이 아직 안 끝났을 수 있다(시간 단축으로 DEFENSE가 잘리면
	// 그렇다). setScene이 카메라를 사람에게 돌려놓으므로 찬반은 언제나
	// 방 전체가 보이는 화면에서 시작한다
	Screen.setScene(room, Screen.Zoom.TRIAL, Bgm.TRIAL);
	playSound(room, Sound.VOTE);
	Chat.say(room, `🗳️ ${nomineeLabel(room)}를 처형할지 정하세요. ${tieClause(room)} 처형됩니다.`);

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

/**
 * 이 화면에서 가장 큰 글씨로 찍히는 지시문.
 *
 * 네 사람이 같은 화면을 본다. 단상에 오른 본인, 판결을 누를 수 있는 사람,
 * 협박당해 누를 수 없는 사람, 죽어서 보고만 있는 사람 — 위젯이 받는
 * canJudge 하나로는 뒤의 셋이 구별되지 않는다(전부 false다). 그래서 문구를
 * 서버가 정한다.
 *
 * 협박당한 사람에게 "지켜보세요"를 주는 것은 사실이 그렇기 때문이다.
 * 그의 몫은 반대로 세어지지만(judgementPassed) 그가 할 수 있는 일은 없다.
 * 이유는 위젯이 잠긴 O/X 옆에 적는다.
 */
function judgementLead(room: Room, seat: Seat, judging: boolean): string {
	if (seat.index === room.nominee) return judging ? "판결을 기다리세요" : "해명하세요";
	if (!judging) return "해명을 들으세요";
	return canPressJudge(room, seat) ? "처형할까요?" : "지켜보세요";
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
		...identityOf(seat),
		lead: judgementLead(room, seat, judging),
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
 * 찬반투표 결과. 동수를 어느 쪽으로 보낼지는 모드가 정한다.
 *
 * 예전에는 `agree * 2 > voters`, 즉 "안 누른 사람은 전부 반대"였다. 5초
 * 안에 버튼을 못 찾은 사람과 화면을 보고 있지 않은 사람이 전부 반대편에
 * 서는 셈이라, 인원이 늘수록 처형이 구조적으로 불가능해졌다.
 *
 * 지금은 기권이 어느 쪽도 아니고, 남은 질문 하나("3:3이면?")를 룰셋의
 * judgementTie가 답한다. 클래식은 원작을 따라 `execute`(같으면 죽인다),
 * 나머지 모드는 `spare`(넘어야 죽인다)다. 이 값을 룰셋에 둔 이유는
 * 인원과 시간이 모드마다 다르기 때문이다 — RuleSet.JudgementTie 참고.
 *
 * **전원이 기권한 낮은 어느 모드에서도 처형하지 않는다.** `execute`에서
 * 0 = 0을 그냥 통과시키면 아무도 버튼을 누르지 않은 판이 곧 처형이 되어,
 * "동수는 처형"이라는 규칙이 "무관심은 처형"으로 변한다. 동수 규칙은 표를
 * 던진 사람들 사이의 저울이지 빈 저울을 기울이는 장치가 아니다.
 *
 * **협박당한 사람은 반대로 센다.** 좌석 문서가 정한 규칙이고, 건달의 협박이
 * "한 표를 지운다"가 아니라 "한 표를 뺏어 반대편에 놓는다"여야 능력에 값이
 * 생긴다. 눌러 보지도 못한 사람이라 canJudge가 아니라 여기서 갈린다.
 * 협박은 실제로 놓인 표이므로 위의 "빈 저울" 예외에도 걸리지 않는다.
 *
 * 접속이 끊긴 사람은 기권으로 흘러간다. 예전에는 분모에 남아 반대로 세어졌고
 * 주석도 그렇게 적혀 있었지만, 기권을 중립으로 옮긴 이상 따로 다룰 이유가
 * 없다 — 끊긴 사람에게 찬성과 반대 중 하나를 대신 골라 줄 근거가 없다.
 *
 * 정치인의 2표 가중치는 여기에 적용하지 않는다. 지목에서 두 표를 쓰는 것과
 * 처형 면역이 이미 정치인의 몫이고, 찬반까지 두 표면 혼자 판을 뒤집는다.
 */
interface JudgementTally {
	readonly agree: number;
	readonly oppose: number;
}

function tallyJudgement(room: Room): JudgementTally {
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
	return { agree, oppose };
}

function judgementPassed(room: Room, tally: JudgementTally): boolean {
	if (tally.agree === 0 && tally.oppose === 0) return false;
	if (room.ruleSet.judgementTie === "execute") return tally.agree >= tally.oppose;
	return tally.agree > tally.oppose;
}

/** 찬반 규칙을 한 줄로. 시작 안내가 읽는다 */
function tieClause(room: Room): string {
	return room.ruleSet.judgementTie === "execute" ? "찬성이 반대 이상이어야" : "찬성이 반대보다 많아야";
}

/**
 * 살아남은 이유. 아무도 누르지 않은 낮과 표가 모자란 낮을 구분한다.
 *
 * 두 경우를 한 문장으로 묶으면 클래식에서 거짓말이 된다 — 전원 기권은
 * 0 대 0이라 "찬성이 반대에 미치지 못한" 판이 아닌데도 살아남기 때문이다.
 */
function sparedReason(room: Room, tally: JudgementTally): string {
	if (tally.agree === 0 && tally.oppose === 0) return "아무도 찬반을 내지 않아";
	return room.ruleSet.judgementTie === "execute" ? "찬성이 반대에 미치지 못해" : "찬성이 반대를 넘지 못해";
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
	if (!nominee) {
		room.nominee = 0;
		return false;
	}

	// 집계가 room.nominee를 지우는 것보다 먼저다. canJudge가 그 값으로 단상에
	// 오른 본인을 분모에서 빼는데, 먼저 지우면 본인이 분모로 돌아온다 —
	// 협박당한 채 단상에 오른 사람이 자기 처형에 반대 한 표를 얻는 꼴이다
	const tally = tallyJudgement(room);
	room.nominee = 0;

	if (!judgementPassed(room, tally)) {
		room.rejected.push(nominee.index);
		room.voteRecord.message = `🕊️ ${sparedReason(room, tally)} ${participantLabel(nominee)}는 살아남았습니다.`;
		Chat.announce(room, room.voteRecord.message);
		// 처형은 kill이 EXECUTE를 울리는데 부결에는 짝이 없었다. 소리로만
		// 판을 따라가는 사람에게는 무음이 곧 "아직 개표 중"이었다
		playSound(room, Sound.ACQUIT);
		return false;
	}

	// 처형 사실은 kill이 직접 알린다 — 마피아 팀이었는지까지 밝히므로
	room.voteRecord.message = `☠️ ${participantLabel(nominee)}가 처형되었습니다.`;
	// 처형만은 방 전체가 흔들린다. 카메라를 단상으로 보내지 않는 이유는
	// 이 직후가 곧바로 밤 컷이기 때문이다 — 컷 위젯이 모바일에서 화면을
	// 덮으므로 팬은 아무에게도 안 보이고, 짧은 진동만 컷 아래로 전해진다
	Screen.shake(room, Screen.Tremor.EXECUTION);
	kill(room, nominee, DeathCause.EXECUTION);
	return true;
}
