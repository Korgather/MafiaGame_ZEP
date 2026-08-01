/**
 * 밤 단계.
 *
 * 기존 nightPlayerEvent는 직업 이름으로 분기하는 약 300줄짜리 switch였다.
 * 분기 7개가 각각 위젯을 열고, init 페이로드를 조립하고, onMessage 핸들러를
 * 등록하고, "index가 일치하는 대상을 찾는" 루프를 따로 갖고 있었다.
 * 같은 코드가 4벌 있었으니 4벌 다 조금씩 달랐다 —
 * 경찰 분기에는 break가 없어 대상을 찾은 뒤에도 루프를 계속 돌았고,
 * 마피아 분기만 return으로 빠져나갔다.
 *
 * 지금 이 파일에는 위젯 조립과 대상 탐색이 각각 한 벌만 있다.
 * "무슨 일이 일어나는가"는 domain/NightResolution.ts의 순수 함수가 정한다.
 * 직업을 추가할 때 이 파일은 건드리지 않는다.
 */
import type { ScriptPlayer, ScriptWidget } from "zep-script";
import type { Room, Seat } from "../types/Game.types.ts";
import { GamePhase } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import { inMafiaChat, NightActionKind, roleDef, roleName } from "../domain/Roles.ts";
import { ChatChannel } from "../domain/chat/ChatChannel.ts";
import { QUICK_NOTE } from "../domain/chat/QuickPhrases.ts";
import {
	hasExtraProbe,
	hasNightTurn,
	isPeacefulNight,
	nightActionBlockedReason,
	NightOutcome,
	recordNightIntent,
} from "../domain/NightResolution.ts";
import { intentTarget, putIntent, resolveNightIntents } from "../domain/NightPipeline.ts";
import {
	aliveSeats,
	deadSeats,
	enterPhase,
	participantLabel,
	resetRound,
	seatAt,
	seatViews,
} from "../entities/Room.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { asInt, field, messageType } from "../types/Widget.types.ts";
import { forEachPlayer, label, playSound, playSoundTo } from "./Broadcast.ts";
import * as Chat from "./ChatService.ts";
import { playCut } from "./Cut.ts";
import { DeathCause, kill, revive } from "./Death.ts";
import { applyNightSprite, beginNightStage } from "./Stage.ts";
import type { PhasePayload } from "./Widgets.ts";
import {
	bindMessage,
	closeCard,
	identityOf,
	isStaleEvent,
	openPhase,
	openRoleAction,
	updateMain,
} from "./Widgets.ts";
import { sprite } from "../infrastructure/Sprites.ts";

/** 밤 능력 안내 라벨 표시 시간(ms). 지목할 시간을 충분히 준다 */
const NIGHT_PROMPT_MS = 6000;

/**
 * 지목할 것이 없는 사람들이 보는 밤 화면.
 *
 * 원본 문구는 "마피아, 경찰, 의사는 밤에 움직일 수 있습니다"로 직업을 나열했다.
 * 그 뒤 영매·스파이·정치인이 추가되면서 문구만 낡았는데 아무도 몰랐다.
 * 직업 목록을 문구에서 빼면 직업을 추가해도 여기가 낡지 않는다.
 */
function nightPhaseView(room: Room, seat: Seat): PhasePayload {
	return {
		type: "init",
		phase: "night",
		turn: room.turnCount + 1,
		total: room.total,
		aliveCount: aliveSeats(room).length,
		timer: room.phaseTimer,
		...identityOf(seat),
		note: nightNote(room, seat),
		deaths: [],
		spectating: false,
		// 시간 조절은 낮에만 한다. 밤은 능력을 쓰는 시간이고 길이가 고정이다
		timeVote: false,
	};
}

/**
 * 지목 격자 없이 밤 화면만 보는 사람에게 그 이유를 알려준다.
 *
 * 안내가 하나뿐이었을 때는 능력을 다 쓴 자경단원도 "능력이 있는 직업은
 * 대상을 지목하세요"를 받았다. 지목할 격자는 없는데 지목하라고 하니
 * 화면이 깨진 것처럼 보인다. 격자를 숨기는 판정과 같은 함수를 쓰므로
 * "격자가 없다"와 "이유를 설명한다"가 어긋날 수 없다.
 */
function nightNote(room: Room, seat: Seat): string {
	if (!seat.alive) return "당신은 죽었습니다. 관전 중입니다.";
	const blocked = nightActionBlockedReason(seat, room.turnCount, deadSeats(room).length);
	if (blocked) return blocked;
	return "밤입니다. 대상을 지목하세요.";
}

export function beginNight(room: Room): void {
	enterPhase(room, GamePhase.NIGHT);
	room.phaseTimer = room.ruleSet.timing.NIGHT;
	room.tickTockPlayed = false;
	/*
	 * 개표 결과를 resetRound가 지우기 전에 읽어 둔다.
	 *
	 * 처형에 컷을 따로 주지 않고 다음 밤 컷의 첫 줄로 얹는 이유: 투표 결과
	 * 화면(VOTE_RESULT)이 이미 7초 동안 같은 사실을 보여주고 있다. 그 위에
	 * 컷을 하나 더 끼우면 같은 소식을 두 번 보고 기다리는 시간만 늘어난다.
	 * 반대로 밤 컷의 첫 줄이 되면 "그래서 밤이 됐다"는 인과가 한 화면에 남는다.
	 *
	 * 첫 밤에는 비어 있다(아직 투표가 없었다) — 그때는 제목만 도는 컷이 된다.
	 */
	const verdict = room.voteRecord.message;
	resetRound(room);

	beginNightStage(room);
	playSound(room, Sound.NIGHT);
	// 밤에는 방 채팅이 잠기지만 읽기는 열려 있다. 이 한 줄이 없으면 채팅
	// 기록만 봤을 때 아침과 아침 사이가 비어 무슨 일이 있었는지 알 수 없다
	Chat.say(room, `🌙 ${room.turnCount + 1}번째 밤이 되었습니다.`);
	// 첫 밤 무사를 알리지 않으면 마피아는 자기 지목이 실패했다고 믿고,
	// 시민은 의사가 막은 줄 안다. 양쪽 다 없는 정보를 추리에 넣게 된다.
	// 시민 팀에게도 같은 줄을 보낸다 — 숨길 규칙이 아니다
	if (isPeacefulNight(room.turnCount + 1, room.total, room.ruleSet.firstNightPeacefulUpTo)) {
		Chat.say(room, "🌙 첫 밤에는 아무도 죽지 않습니다. 팀을 확인하고 대상을 익혀 두세요.");
	}

	// 컷이 phaseTimer를 늘린다. 아래 openNightView가 그 값을 화면에 싣는다
	playCut(room, "night", `🌙 ${room.turnCount + 1}번째 밤`, verdict ? [verdict] : []);

	forEachPlayer(room, (player, seat) => {
		closeCard(player);
		openNightView(room, player, seat);
	});
}

/** 한 사람의 밤 화면을 연다. 직업별 차이는 전부 ROLE_DEFS에서 읽는다 */
export function openNightView(room: Room, player: ScriptPlayer, seat: Seat): void {
	if (!seat.alive) {
		// 죽은 사람은 통합 채팅의 유령 채널로 대화한다. 밤 화면만 열어준다
		openPhase(player, room, nightPhaseView(room, seat));
		return;
	}

	const def = roleDef(seat.role);
	applyNightSprite(player, def.nightSprite);
	player.attackSprite = def.nightAttackSprite ? sprite(def.nightAttackSprite) : player.attackSprite;
	player.sendUpdated();

	Chat.tell(player, nightNotice(room, seat));

	// 지목할 것이 남아 있지 않은 이유는 여러 가지고(능력이 없다, 다 썼다,
	// 첫 밤이다, 이미 골랐다, 무덤이 비었다) 전부 한 함수가 안다. 이걸 보지
	// 않으면 자경단원이 매일 밤 눌러도 아무 일 없는 격자를 받는다.
	const canAct = nightActionBlockedReason(seat, room.turnCount, deadSeats(room).length) === null;

	// 지목할 것이 없으면 밤 안내 화면만 본다.
	//
	// 전에는 여기에 분기가 셋 있었다. 영매용, 채팅 없는 직업용, 그리고 격자가
	// 빈 채로 열리는 마피아팀용. 셋이 갈렸던 이유는 밤 채팅이 이 위젯에
	// 얹혀 있었기 때문이다. 채팅이 자기 위젯으로 나가면서 남은 질문은
	// "지목할 것이 있는가" 하나뿐이 됐다.
	if (!canAct) {
		openPhase(player, room, nightPhaseView(room, seat));
		return;
	}

	if (def.nightPrompt) label(player, def.nightPrompt, NIGHT_PROMPT_MS);

	const widget = openRoleAction(player, room, {
		type: "init",
		myNum: seat.index,
		...identityOf(seat),
		prompt: def.nightPrompt || "",
		seats: seatViews(room, inMafiaChat(seat) ? seat.team : undefined),
		// 선택 필드를 그대로 넘기면 undefined가 ZEP까지 간다
		noSelf: def.noSelfTarget === true,
		targetsDead: def.targetsDead === true,
		timer: room.phaseTimer,
		note: def.nightNotice,
	});
	bindNightWidget(widget);
	updateMain(player, nightProgress(room));
}

/**
 * 밤 진행률 — 차례가 있는 사람 중 몇 명이 지목을 마쳤는가.
 *
 * 낮의 voteProgress와 같은 모양이고, 밤에 더 필요하다. 낮에는 채팅이 돌아서
 * 아직 안 움직인 사람이 티가 나지만 밤에는 아무 신호가 없어서, 전원이 이미
 * 끝냈어도 남은 22초를 다 같이 앉아서 흘려보냈다.
 *
 * 인원수만 센다. 누가 무엇을 골랐는지는 절대 나가지 않는다.
 */
function nightProgress(room: Room): { type: "progress"; acted: number; total: number } {
	let acted = 0;
	let total = 0;
	const dead = deadSeats(room).length;
	for (const seat of room.seats) {
		// 접속이 끊긴 사람은 분모에서 뺀다. 남겨 두면 절대 안 차는 막대가 되고,
		// 그러면 "다 끝났다"를 알리려던 것이 "누군가 뭉개고 있다"로 읽힌다
		if (!seat.alive || !seat.connected) continue;
		// 무덤이 비어 있으면 영매·성직자도 여기서 빠진다. 격자를 못 받은 사람이
		// 분모에 남으면 막대가 영영 안 차고, 그 자체가 "이 방에 영매가 있다"다
		if (!hasNightTurn(seat, room.turnCount, dead)) continue;
		// 쪽지는 보내도 되고 안 보내도 되는 능력이다. 분모에 넣으면 막대가
		// 끝까지 안 차고, 그러면 아무 일 없는 밤이 "누가 뭉개고 있다"로 읽힌다
		if (roleDef(seat.role).nightAction === NightActionKind.NOTE) continue;
		total++;
		if (seat.usedSkill) acted++;
	}
	return { type: "progress", acted, total };
}

/**
 * 지목이 하나 확정될 때마다 방 전원에게. 차례가 없는 사람의 화면(phase)은
 * 이 메시지를 그리지 않고 흘려보낸다 — 투표 진행률도 같은 길을 쓴다.
 *
 * 접속이 끊기거나 돌아왔을 때도 분모가 바뀌므로 GameFlow.refreshProgress가
 * 이 함수를 부른다. 그래서 export다.
 */
export function broadcastNightProgress(room: Room): void {
	const payload = nightProgress(room);
	forEachPlayer(room, player => updateMain(player, payload));
}

function nightNotice(room: Room, seat: Seat): string {
	if (inMafiaChat(seat) && mafiaChatSize(room) > 1) {
		return "🌙 마피아 탭에서 팀원과 대화할 수 있습니다.";
	}
	return roleDef(seat.role).nightNotice;
}

/**
 * 살아 있는 마피아 채팅 참가자 수. 2명 이상일 때만 "대화할 수 있다"고 알린다.
 *
 * 기존 이름은 mafiaTeamSize였고 실제로 진영 인원을 셌다. 짐승인간은
 * 마피아 팀이지만 채팅에 없으므로, 이름대로 진영을 세면 혼자인 마피아에게
 * 대화 상대가 있다고 알리고 아무도 답하지 않게 된다.
 */
function mafiaChatSize(room: Room): number {
	let count = 0;
	for (const seat of room.seats) {
		if (seat.alive && inMafiaChat(seat)) count++;
	}
	return count;
}

/**
 * 밤 위젯의 메시지 처리. 위젯 하나당 한 번만 등록된다.
 *
 * 기존 핸들러는 위젯이 보낸 값을 검증하지 않았고, 밤이 아닌 시점에 온
 * select도 그대로 처리했다. 위젯은 클라이언트에서 도는 코드라
 * 조작된 메시지가 올 수 있다.
 *
 * 받는 종류가 둘이 됐다. select는 대상 지목이고, phrase는 쪽지의 두 번째
 * 클릭이다. 밤·생존·좌석 확인은 둘이 똑같이 거쳐야 하므로 위에 모아 둔다.
 */
function bindNightWidget(widget: ScriptWidget): void {
	bindMessage(widget, "roleAction", (sender, data) => {
		const kind = messageType(data);
		if (kind !== "select" && kind !== "phrase") return;

		const found = locate(sender.id);
		if (!found) return;
		const room = found.room;
		const seat = found.seat;
		// 지난 판·지난 단계의 화면에서 늦게 도착한 입력은 버린다. 아래 phase
		// 검사는 같은 이름의 단계가 다시 왔을 때 통과시키므로 이 한 줄이 더 필요하다
		if (isStaleEvent(room, sender)) return;
		if (room.phase !== GamePhase.NIGHT || !seat.alive) return;

		if (kind === "phrase") {
			chooseNotePhrase(room, seat, sender, widget, asInt(field(data, "index")));
			return;
		}

		// 위젯을 잠그는 판정과 같은 함수다. 조작된 select가 와도 서버가
		// 같은 근거로 거절하므로, 화면에서 격자가 사라진 상태와 서버가
		// 허용하는 상태가 갈라질 수 없다.
		const blocked = nightActionBlockedReason(seat, room.turnCount, deadSeats(room).length);
		if (blocked) {
			label(sender, blocked);
			return;
		}

		const targetIndex = asInt(field(data, "num"));
		if (targetIndex === null) return;
		const target = seatAt(room, targetIndex);
		// 산 사람인지 죽은 사람인지는 여기서 묻지 않는다. 영매와 성직자는
		// 무덤을 고르는 직업이고, 그 판정은 능력마다 다르다(RoleDef.targetsDead).
		// 여기서 alive를 요구하면 두 직업의 지목이 도메인에 닿기도 전에 사라진다 —
		// recordNightIntent가 이미 능력에 맞는 대상인지 보고 null로 거절한다
		if (!target) return;

		const result = recordNightIntent(seat, target);
		if (!result) return;

		// 적용은 밤이 끝날 때다. 여기서는 "이 사람이 저 사람을 골랐다"만 남긴다
		//
		// 접선한 스파이의 둘째 지목만 다른 자리에 적는다. nightIntents는 한
		// 좌석에 하나만 담는 목록이라, 둘째를 같이 넣으면 조회가 첫 지목만
		// 답하고 둘째는 조용히 사라진다(NightPipeline.targetOf)
		if (seat.usedSkill) {
			if (target.index === intentTarget(room.nightIntents, seat.index)) {
				label(sender, "이미 이번 밤에 조사한 대상입니다.\n다른 사람을 선택하세요.");
				return;
			}
			seat.extraProbeIndex = target.index;
		} else {
			putIntent(room.nightIntents, seat.index, target.index);
			if (result.consumed) {
				seat.usedSkill = true;
				// 진행률의 분자는 usedSkill을 센다. 소모되지 않은 지목(쪽지의 첫
				// 클릭)은 그 숫자를 움직이지 않으므로 방에 알릴 것도 없다.
				// 둘째 지목도 마찬가지다 — 저 사람은 이미 분자에 들어가 있다
				broadcastNightProgress(room);
			}
		}
		label(sender, result.label, result.labelDurationMs);
		if (result.confirmed) {
			// again이 참이면 위젯이 격자를 잠그지 않고 한 칸을 더 받는다.
			// 잠근 뒤에 여는 메시지를 따로 보내지 않는 이유는, 그 사이에 위젯이
			// 한 번이라도 "끝났다"로 그려지면 스파이 화면이 깜빡이기 때문이다
			widget.sendMessage({
				type: "selectResponse",
				num: targetIndex,
				again: hasExtraProbe(seat) && seat.extraProbeIndex === 0,
			});
		}
		if (result.needsPhrase) {
			widget.sendMessage({ type: "phrases", num: targetIndex, options: QUICK_NOTE });
		}
		if (result.privateSound) playSoundTo(sender, result.privateSound);
		if (result.roomSound) playSound(room, result.roomSound);
	});
}

/**
 * 쪽지의 두 번째 클릭. 대상은 서버가 이미 갖고 있고 문구 번호만 받는다.
 *
 * 대상을 위젯에서 다시 받으면 조작된 메시지 하나가 대상과 문구를 함께
 * 정할 수 있게 된다 — 그러면 밤 위젯이 잠긴 뒤에도 대상을 바꿀 수 있다.
 *
 * 직업이 쪽지인지는 여기서 보지 않는다. 아래 세 관문(usedSkill·지목 유무·
 * 번호 범위)이 다른 직업을 전부 막지만, 그 안전은 "recordNightIntent가
 * consumed: false를 돌려주는 능력이 쪽지뿐"이라는 불변식 위에 서 있다.
 * 둘째가 생기면 그 직업의 첫 클릭 뒤에 온 phrase가 noteText를 채워서,
 * 밤 능력이 조용히 쪽지로 바뀐다. 불변식은 tests/domain.test.ts의
 * 「소모하지 않는 지목은 쪽지 하나뿐이다」가 지킨다.
 *
 * 진행률은 알리지 않는다. 쪽지는 nightProgress의 분모에서 빠져 있어서
 * 이 좌석의 usedSkill이 켜져도 acted와 total 어느 쪽도 움직이지 않는다 —
 * 부르면 방금 보낸 것과 똑같은 숫자를 방 전원에게 한 번 더 보내는 일이 된다.
 * 이 이유는 nightProgress가 NOTE를 continue로 빼는 한 줄에 통째로 매달려
 * 있다. 그 줄이 사라지면 쪽지가 분모에 들어가고, 그 순간 여기의 침묵이
 * 진짜 버그가 된다 — 문구를 고른 사람 몫이 진행률에서 영영 빠진다.
 */
function chooseNotePhrase(
	room: Room,
	seat: Seat,
	sender: ScriptPlayer,
	widget: ScriptWidget,
	index: number | null
): void {
	if (index === null || index < 0 || index >= QUICK_NOTE.length) return;
	// 첫 클릭은 usedSkill을 켜지 않는다(consumed: false). 켜져 있다면 이미
	// 문구를 골랐다는 뜻이고, 두 번째 문구로 덮어쓸 수 있으면 한 번뿐인 능력이 아니다
	if (seat.usedSkill) return;
	const target = intentTarget(room.nightIntents, seat.index);
	if (target === 0) return;

	seat.noteText = QUICK_NOTE[index];
	seat.usedSkill = true;

	label(sender, `✉️ ${target}번에게 쪽지를 보냅니다.\n내일 아침에 도착합니다.`);
	// 소리는 첫 클릭이 아니라 여기다. 쪽지만 지목을 두 번 받는데(대상 → 문구)
	// 능력이 실제로 소모되는 것은 두 번째다. 첫 클릭에 소리를 붙이면 문구를
	// 안 고르고 나간 사람도 보낸 소리를 듣는다
	playSoundTo(sender, Sound.NOTE);
	widget.sendMessage({ type: "selectResponse", num: target });
}

/**
 * 마피아를 찾아낸 사람이 채팅에 합류했을 때.
 *
 * 전에는 팀원 각각에게 개인 안내를 보내고 스파이 위젯에는 chatEnable을
 * 따로 쏘았다 — 같은 사실을 두 경로로 알리는 구조라 한쪽만 고치기 쉬웠다.
 * 지금은 마피아 채널에 한 줄 남기고 본인의 탭 목록만 새로 고친다.
 * 채널에 쓴 한 줄은 기록에도 남아서 나중에 합류한 사람도 볼 수 있다.
 *
 * 문구가 "스파이"로 고정이었던 것은 접선하는 직업이 하나였을 때의 잔재다.
 * 지금은 스파이와 짐승인간 둘 다 이 길로 들어오므로 직업 이름을 읽는다 —
 * 여기 들어온 시점에 이미 같은 팀이라 감출 것이 없다.
 */
function announceContact(room: Room, seat: Seat, player: ScriptPlayer): void {
	Chat.channelSay(
		room,
		ChatChannel.MAFIA,
		`🕵️ ${participantLabel(seat)}(${roleName(seat.role)})님이 마피아 채팅에 합류했습니다.`
	);
	Chat.refresh(player);
}

/**
 * 밤이 끝났을 때의 정산. 낮으로 넘어가기 직전에 호출한다.
 *
 * 기존에는 이 처리가 startState(STATE_PLAYING_DAY) 안에 인라인되어 있었고
 * 사망 안내 문구를 dead()가 "처형당했습니다"로 덮어썼다.
 */
export function resolveNight(room: Room): void {
	room.turnCount++;
	// 아침 화면이 읽을 밤 기록. kill()이 사망 한 줄씩 채워 넣는다
	room.nightReport = [];

	/*
	 * 첫 밤 무사는 이제 분기가 아니라 파이프라인의 인자다.
	 *
	 * S0에서는 resolveNightCasualties 앞에서 되돌아가야 했다 — 그 함수가
	 * 공격받은 좌석의 방탄을 소모하기 때문이다. 지금은 ATTACK step 자체를
	 * 건너뛰므로 attackedBy가 비어 있고, 방탄을 볼 일이 애초에 없다.
	 * 기자의 특종은 AFTER step이라 그대로 나간다.
	 */
	const settlement = resolveNightIntents(room.seats, room.nightIntents, {
		skipAttacks: isPeacefulNight(room.turnCount, room.total, room.ruleSet.firstNightPeacefulUpTo),
	});
	room.nightReveals = settlement.reveals;
	const casualties = settlement.casualties;
	if (casualties.length === 0) report(room, "✨ 이번 밤에 아무도 죽지 않았습니다.");

	for (const casualty of casualties) {
		switch (casualty.outcome) {
			case NightOutcome.SAVED:
				report(room, "💖 의사가 누군가를 살려냈습니다.");
				break;
			case NightOutcome.SHIELDED:
				// 방에는 누구인지 알리지 않는다 — 알리면 군인이 첫 밤에 공개된다.
				// 대신 본인에게는 반드시 말해준다. 방탄은 판당 한 번뿐이라
				// 이 안내가 없으면 군인은 아직 남아 있다고 믿은 채 다음 밤에 죽고,
				// 자기 능력이 언제 소모됐는지 끝까지 알 수 없다.
				report(room, "🛡️ 누군가가 공격을 받았지만 버텨냈습니다.");
				tellSeat(casualty.seat, "🛡️ 밤새 공격을 받았지만 버텨냈습니다. 방탄은 이제 남아 있지 않습니다.");
				break;
			case NightOutcome.SPARED:
					// 방에 나가는 줄은 짝의 사망(LOVER_SHIELD)이 낸다 — 거기서 두
					// 이름이 함께 불리므로 여기서 한 줄 더 내면 같은 사건이 두 번
					// 실린다. 이 결말은 살아남았다는 사실을 본인에게 알릴 뿐이다
					tellSeat(casualty.seat, "💔 밤새 공격을 받았지만 연인이 대신 죽었습니다.");
					break;
				case NightOutcome.BACKFIRED:
				// 자책의 이유는 방에 알리지 않는다 — 알리면 자경단원의 정체가
				// 시체와 함께 공개된다. 사인은 따로 있지만 announce가 평범한
				// 제거와 같은 문구를 내보내고, 본인에게만 왜 죽었는지 말해준다.
				kill(room, casualty.seat, DeathCause.BACKFIRE);
				tellSeat(casualty.seat, "🔫 당신이 쏜 사람은 같은 편이었습니다. 책임을 지고 스스로 목숨을 끊었습니다.");
				break;
			case NightOutcome.KILLED:
				kill(room, casualty.seat, DeathCause.NIGHT_KILL);
				break;
			case NightOutcome.BOMBED:
				// 폭탄의 주인은 여기 없다. 그 사람은 이미 KILLED로 이 목록에
				// 들어와 있고(폭탄은 죽는 순간 터진다), 결말을 하나 더 붙이면
				// 같은 좌석이 두 번 죽은 기록이 된다
				kill(room, casualty.seat, DeathCause.SUICIDE_BOMB);
				break;
			case NightOutcome.HEARTBREAK:
				kill(room, casualty.seat, DeathCause.SACRIFICE);
				break;
			case NightOutcome.SACRIFICED:
					// 짝(SPARED)은 이 목록에 이미 살아남은 채로 들어와 있다.
					// 여기서 죽는 것은 대신 나선 쪽뿐이다
					kill(room, casualty.seat, DeathCause.LOVER_SHIELD);
					break;
				case NightOutcome.REVIVED:
				// 유일하게 죽이지 않는 결말이다. 사망 목록에 실려 오는 이유는
				// 파이프라인이 "이 밤에 좌석에 일어난 일"을 한 줄기로 내보내기
				// 때문이고, 그 편이 순서(9단계 소생이 7단계 연쇄 뒤)를 지킨다
				revive(room, casualty.seat);
				break;
			default: {
				// 결말이 늘면 여기서 컴파일이 멈춘다. switch가 조용히 무시하면
				// 그 결말은 "아무 일도 일어나지 않는 밤"이 되고, 테스트는 도메인
				// 층에서만 초록이라 서비스가 빠뜨린 것을 아무도 못 본다
				const unhandled: never = casualty.outcome;
				return unhandled;
			}
		}
	}

	publishScoops(room);

	// 접선은 채널 안내와 탭 목록 갱신이 필요해서 reveals와 따로 간다.
	// 채널에 남긴 한 줄은 기록에도 남아 나중에 합류한 사람도 볼 수 있다
	for (const index of settlement.defected) {
		const joined = seatAt(room, index);
		if (!joined) continue;
		const player = ScriptApp.getPlayerByID(joined.playerId);
		if (player) announceContact(room, joined, player);
	}
}

/** 아침 화면과 채팅 기록에 같은 한 줄을 남긴다 */
function report(room: Room, line: string): void {
	room.nightReport.push(line);
	Chat.announce(room, line);
}

function tellSeat(seat: Seat, message: string): void {
	const player = ScriptApp.getPlayerByID(seat.playerId);
	if (player) Chat.tell(player, message);
}

/**
 * 밤에 알아낸 것을 각자에게 전한다. 아침 진입 직전에 한 번.
 *
 * 죽은 사람도 받는다. 그 밤에 죽은 경찰이 마지막으로 알아낸 것을 삼키면
 * 영매를 통해 나올 정보 하나가 그냥 사라진다.
 *
 * 접속이 끊긴 사람은 놓친다 — tellSeat이 조용히 버린다. 남는 손실이지만
 * 밤 결과 라벨도 이미 같은 방식이라 동작 변화는 아니다. 복구하려면 좌석별
 * 개인 로그를 저장해야 하고, 그건 관전 인프라와 같은 작업이다.
 */
export function deliverNightReveals(room: Room): void {
	for (const reveal of room.nightReveals) {
		const target = seatAt(room, reveal.seat);
		if (!target) continue;
		tellSeat(target, reveal.line);
		if (!reveal.sound) continue;
		const player = ScriptApp.getPlayerByID(target.playerId);
		if (player) playSoundTo(player, reveal.sound);
	}
	room.nightReveals = [];
}

/**
 * 기자가 취재한 직업을 전체 공개한다. 사망 소식 뒤에 붙는다.
 *
 * 죽은 사람도 공개 대상이다 — 그 밤에 죽었다면 오히려 "누구를 죽였는가"가
 * 드러나 더 중요한 정보가 된다.
 */
function publishScoops(room: Room): void {
	for (const seat of room.seats) {
		if (!seat.scooped) continue;
		report(room, `📰 특종: ${participantLabel(seat)}의 직업은 ${roleName(seat.role)}입니다.`);
	}
}
