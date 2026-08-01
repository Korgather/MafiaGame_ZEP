/**
 * 한 판을 통째로 돌리는 시뮬레이터.
 *
 * FakeZep이 전역을 심고, 이 파일이 src/index.ts를 불러 ZEP 이벤트 핸들러를
 * 실제와 똑같이 등록시킨다. 그 뒤로는 테스트가 접속·위젯 메시지·시간 경과만
 * 흉내내면 게임이 프로덕션과 같은 경로로 진행된다.
 *
 * 즉 이 하네스가 검증하는 것은 도메인 함수가 아니라 **배선**이다.
 * FSM 전이표, 투표 위젯 → 집계 → 처형, 밤 지목 → 정산 → 사망 순서처럼
 * 순수 함수 테스트로는 닿을 수 없던 부분이 여기서 처음 커버된다.
 */
// node:assert는 부작용이 없는 내장 모듈이라 아래 평가 순서와 무관하다.
import { strict as assert } from "node:assert";
// FakeZep이 먼저 평가돼야 한다. ESM은 import 선언 순서대로 깊이 우선
// 평가하므로 이 한 줄이 아래 src import보다 반드시 먼저 끝난다.
// (Sprites.ts가 모듈 로드 시점에 ScriptApp.loadSpritesheet를 부른다)
import { FakePlayer, FakeWidget, seedRandom, world } from "./FakeZep.ts";
import "../../src/index.ts";
import { Tile } from "../../src/constants/Assets.ts";
import { MAX_PLAYERS } from "../../src/constants/GameConfig.ts";
import { seatPosition } from "../../src/constants/RoomLayout.ts";
import { assignRole, resetRoom } from "../../src/entities/Room.ts";
import { allRooms, getRoom, locate } from "../../src/entities/RoomRegistry.ts";
import type { ChatChannel } from "../../src/domain/chat/ChatChannel.ts";
import type { ChatMessage } from "../../src/domain/chat/ChatMessage.ts";
import { resetGlobalLog } from "../../src/services/ChatService.ts";
import type { ProfilePayload } from "../../src/services/Widgets.ts";
import type { PlayerTag, Room, Seat } from "../../src/types/Game.types.ts";
import type { CardView, ChatChannelView } from "../../src/types/Widget.types.ts";
import { GamePhase, Judgement, Role } from "../../src/types/Game.types.ts";

let nextPlayerId = 1;

export interface ConnectOptions {
	isMobile?: boolean;
	/** 태블릿. ZEP에서 태블릿은 모바일의 한 종류라 isMobile도 함께 켜진다 */
	isTablet?: boolean;
	isGuest?: boolean;
	/** ScriptPlayer.role. 3000 이상이면 운영자 */
	role?: number;
	/** player.storage 초기값(JSON 문자열) */
	storage?: string;
}

/**
 * 테스트 사이의 격리.
 *
 * 방 8개는 RoomRegistry의 모듈 수준 싱글턴이라 같은 파일 안의 테스트끼리
 * 상태를 공유한다. 매 테스트 시작에 이걸 부른다.
 */
export function resetWorld(seed = 1): void {
	// 난수를 되감아 같은 테스트가 항상 같은 판을 받게 한다.
	// (직업 배분이 Math.random에 의존하므로 이게 없으면 좌석 배치가 매번 달라진다)
	seedRandom(seed);
	for (const room of allRooms()) resetRoom(room as Room);
	// 전체 채팅 기록은 방이 아니라 월드에 붙어 있다. 방을 비우는 것만으로는
	// 지워지지 않아서, 앞 테스트의 로비 잡담이 다음 테스트 화면에 남는다.
	resetGlobalLog();
	world.players.length = 0;
	world.httpPosts.length = 0;
	world.staffSays.length = 0;
	for (const key of Object.keys(world.mapObjects)) delete world.mapObjects[key];
	// 칠한 프라이빗 영역도 테스트마다 지운다. 남으면 영역을 칠하지 않은
	// 테스트가 앞 테스트의 영역을 물려받아, 말풍선이 새는 경로를 통과한다.
	for (const key of Object.keys(world.tiles)) delete world.tiles[key];
	// Lobby의 강퇴 쿨다운은 모듈 내부 변수라 밖에서 지울 수 없다.
	// 시계를 크게 앞당겨 이전 테스트가 건 쿨다운을 모두 만료시킨다.
	world.nowMs += 24 * 60 * 60 * 1000;
	nextPlayerId = 1;
}

/** 월드에 접속한다. ZEP의 onJoinPlayer가 실제로 발생한다 */
export function connect(name: string, options: ConnectOptions = {}): FakePlayer {
	const player = new FakePlayer(`p${nextPlayerId++}`, name);
	if (options.isMobile) player.isMobile = true;
	// 태블릿인데 모바일이 아닌 기기는 없다. 테스트가 그런 기기를 만들지 못하게 한다
	if (options.isTablet) {
		player.isMobile = true;
		player.isTablet = true;
	}
	if (options.isGuest) player.isGuest = true;
	if (options.role !== undefined) player.role = options.role;
	if (options.storage !== undefined) player.storage = options.storage;

	world.players.push(player);
	world.hooks.join.emit(player);
	return player;
}

/**
 * 월드에서 나간다.
 *
 * 원본 코드가 `App.playerCount == 0`으로 마지막 이탈을 판정했으므로
 * ZEP은 onLeavePlayer를 부르기 전에 이미 목록에서 빼는 것으로 본다.
 * 반대 순서(아직 목록에 남아 있는 상태로 콜백)를 시험하려면
 * leaveWhileStillListed를 쓴다.
 */
export function disconnect(player: FakePlayer): void {
	const at = world.players.indexOf(player);
	if (at >= 0) world.players.splice(at, 1);
	world.hooks.leave.emit(player);
	killClient(player);
}

/**
 * 접속이 끊기면 클라이언트가 사라지므로 그 위에 떠 있던 위젯도 사라진다.
 *
 * tag에는 죽은 위젯의 참조가 그대로 남는다 — 실제 ZEP도 그렇다.
 * 그 참조로 메시지를 보내려 하면 FakeWidget이 즉시 던지므로,
 * "끊긴 사람에게 보내고 있다"는 사실이 테스트에서 드러난다.
 */
function killClient(player: FakePlayer): void {
	for (const widget of player.widgets) widget.destroy();
}

/**
 * ZEP이 목록에서 빼기 전에 onLeavePlayer를 부르는 경우.
 *
 * 어느 쪽인지는 문서에 없다. 두 순서 모두에서 같은 결과가 나와야
 * 플랫폼 동작에 의존하지 않는 코드다.
 */
export function leaveWhileStillListed(player: FakePlayer): void {
	world.hooks.leave.emit(player);
	const at = world.players.indexOf(player);
	if (at >= 0) world.players.splice(at, 1);
	killClient(player);
}

/** 재접속. 같은 id로 돌아온다 */
export function reconnect(player: FakePlayer): void {
	world.players.push(player);
	world.hooks.join.emit(player);
}

/** dt초만큼 시간이 흐른다. ZEP의 onUpdate가 실제로 발생한다 */
export function tick(seconds: number): void {
	world.nowMs += seconds * 1000;
	world.hooks.update.emit(seconds);
}

/**
 * 맵 오브젝트에 부딪힌다. param1은 맵 에디터에 적어 넣는 값이다.
 *
 * 좌표와 타일 ID는 어느 칸인지만 알려줄 뿐 게임 코드가 쓰지 않으므로
 * 0으로 채운다. 여기서 검증하려는 것은 "어떤 오브젝트인가"뿐이다.
 */
export function touchObject(player: FakePlayer, param1: string): void {
	world.hooks.objectTouched.emit(player, 0, 0, 0, { param1 });
}

/** 맵 위의 다른 캐릭터를 클릭한다 */
export function clickUnit(clicker: FakePlayer, target: FakePlayer): void {
	world.hooks.unitClicked.emit(clicker, target);
}

export function room(roomNum: number): Room {
	const found = getRoom(roomNum);
	if (!found) throw new Error(`${roomNum}번 방이 없습니다.`);
	return found;
}

export function seatOf(player: FakePlayer): Seat {
	const found = locate(player.id);
	if (!found) throw new Error(`${player.name}은(는) 어느 방에도 없습니다.`);
	return found.seat;
}

/** 좌석이 있으면 좌석, 없으면 undefined */
export function findSeatOf(player: FakePlayer): Seat | undefined {
	const found = locate(player.id);
	return found ? found.seat : undefined;
}

/** 이 방에서 해당 직업을 맡은 생존 좌석들 */
export function seatsWithRole(target: Room, role: Role): Seat[] {
	return target.seats.filter(seat => seat.role === role && seat.alive);
}

/** 좌석 주인의 FakePlayer */
export function playerOf(seat: Seat): FakePlayer {
	for (const player of world.players) {
		if (player.id === seat.playerId) return player;
	}
	throw new Error(`${seat.name}(좌석 ${seat.index})의 플레이어가 접속해 있지 않습니다.`);
}

function tagOf(player: FakePlayer): PlayerTag {
	const tag = player.tag as PlayerTag | null;
	if (!tag) throw new Error(`${player.name}에게 tag가 없습니다.`);
	return tag;
}

/** 현재 열려 있는 메인 위젯(대기실·아침·밤·투표·능력) */
export function mainWidget(player: FakePlayer): FakeWidget {
	const widget = tagOf(player).widget;
	if (!widget) throw new Error(`${player.name}에게 열린 메인 위젯이 없습니다.`);
	return widget as unknown as FakeWidget;
}

/** 메인 위젯이 열려 있으면 그것, 아니면 undefined */
export function findMainWidget(player: FakePlayer): FakeWidget | undefined {
	const widget = tagOf(player).widget;
	return widget ? (widget as unknown as FakeWidget) : undefined;
}

/** 통합 채팅 위젯. 접속과 동시에 열리므로 항상 있다 */
export function chatWidget(player: FakePlayer): FakeWidget {
	const widget = tagOf(player).chatWidget;
	if (!widget) throw new Error(`${player.name}에게 열린 채팅 위젯이 없습니다.`);
	return widget as unknown as FakeWidget;
}

/**
 * 이 사람의 채팅 위젯에 실제로 도착한 줄들.
 *
 * 서버가 무엇을 보냈는지가 아니라 이 사람이 무엇을 봤는지를 본다.
 * 채널 권한 테스트가 노려야 하는 지점이 정확히 이것이다 —
 * "마피아 밀담이 시민 화면에 도착하지 않는다"는 여기서만 확인된다.
 */
export function chatLines(player: FakePlayer, channel?: ChatChannel): ChatMessage[] {
	const lines: ChatMessage[] = [];
	for (const message of chatWidget(player).messages) {
		const payload = message as { type?: string; line?: ChatMessage; lines?: ChatMessage[] };
		if (payload.type === "line" && payload.line) lines.push(payload.line);
		// init은 그때까지의 기록을 통째로 싣는다. 재접속 뒤 화면을 볼 때 필요하다.
		if (payload.type === "init" && payload.lines) {
			for (const line of payload.lines) lines.push(line);
		}
	}
	return channel === undefined ? lines : lines.filter(line => line.channel === channel);
}

/**
 * 채팅에 이런 내용의 줄이 왔는가.
 *
 * 표(rows)도 함께 훑는다. text만 보던 동안에는 전원의 직업 공개나 신고
 * 내용처럼 표로 내려간 것이 테스트에는 통째로 안 보였다 — 화면에는 멀쩡히
 * 떠 있는데 "안 왔다"고 판정하는 helper는 없느니만 못하다.
 *
 * 한 행은 화면에서 "이름 값"으로 붙어 보이므로 여기서도 그렇게 잇는다.
 */
export function chatSaw(player: FakePlayer, fragment: string): boolean {
	return chatLines(player).some(
		line =>
			line.text.indexOf(fragment) >= 0 ||
			line.rows.some(row => `${row.label} ${row.value || ""}`.indexOf(fragment) >= 0)
	);
}

/**
 * 서버가 "ZEP 기본 채팅으로도 내보내라"고 지시한 말들.
 *
 * 말풍선을 실제로 띄우는 것은 클라이언트(native-chat.js)라 여기서는 볼 수 없다.
 * 볼 수 있고 또 봐야 하는 것은 지시가 나갔는지다 — 마피아 밀담에 이 지시가
 * 붙으면 밤에 밀담이 방 전체에 뜬다.
 *
 * area를 함께 돌려주는 이유: 나갔는지만 보면 절반만 지킨 것이다. 청중이
 * PRIVATE_AREA여야 할 말이 PUBLIC_AREA로 나가면 방 채팅이 맵 전체에 뜨는데,
 * 텍스트만 비교하는 검사는 그 사고를 통과시킨다.
 */
export interface SpokenLine {
	readonly text: string;
	/** ZepAudience. 위젯이 그대로 chatAreaType으로 쓴다 */
	readonly area: string;
}

export function spokenAloud(player: FakePlayer): SpokenLine[] {
	const said: SpokenLine[] = [];
	for (const message of chatWidget(player).messages) {
		const payload = message as { type?: string; text?: string; area?: string };
		if (payload.type !== "say" || payload.text === undefined) continue;
		// area가 없으면 위젯은 아무것도 쏘지 않는다(native-chat.js). 검사가
		// 빠뜨린 필드를 대신 채워주면 그 사실이 가려진다.
		said.push({ text: payload.text, area: payload.area === undefined ? "" : payload.area });
	}
	return said;
}

/**
 * 이 방의 프라이빗 영역을 칠한다. ZEP 에디터에서 손으로 하는 일의 대역이다.
 *
 * 실제 맵 데이터는 이 저장소에 없다(.zepmap은 ZEP 에디터에만 있다). 그래서
 * 좌석과 그 주변만 칠한다 — 코드가 아는 "방 안"이 좌석 배치이므로
 * isInsideRoom과 같은 상자를 쓰는 것이 맞다.
 *
 * 영역 id는 칠하지 않는다. ScriptMap.getTile은 효과 종류만 돌려주고 id는
 * 아예 읽을 수 없다 — 그래서 프로덕션도 id를 보지 않고 상자와 타일 두 가지로
 * 판정한다(Stage.inOwnRoomArea). 가짜가 id를 들고 있으면 검사가 프로덕션이
 * 쓰지 않는 정보에 기대게 된다.
 */
export function paintPrivateArea(roomNum: number): void {
	for (let index = 1; index <= MAX_PLAYERS; index++) {
		const seat = seatPosition(roomNum, index);
		if (!seat) continue;
		paintTile(seat.x, seat.y);
	}
}

/** 한 칸만 프라이빗 영역으로 칠한다 (방 밖·옆 방 경로를 만들 때) */
function paintTile(tileX: number, tileY: number): void {
	world.tiles[`${Tile.EFFECT_LAYER},${tileX},${tileY}`] = Tile.PRIVATE_AREA;
}

/** 한 칸만 도로 비운다 (칠하다 만 방을 만들 때) */
export function clearTile(tileX: number, tileY: number): void {
	delete world.tiles[`${Tile.EFFECT_LAYER},${tileX},${tileY}`];
}

/** 사람을 특정 타일 위로 옮긴다. 걸어간 것이 아니라 좌표만 바꾼다 */
export function standAt(player: FakePlayer, tileX: number, tileY: number): void {
	player.tileX = tileX;
	player.tileY = tileY;
}

/** 겹쳐 뜬 카드 (직업 공개·첫 안내·직업 도감이 같은 자리를 쓴다) */
export function cardWidget(player: FakePlayer): FakeWidget {
	const widget = tagOf(player).cardWidget;
	if (!widget) throw new Error(`${player.name}에게 열린 카드가 없습니다.`);
	return widget as unknown as FakeWidget;
}

/** 지금 카드가 떠 있는가 (없어야 정상인 경우를 검사할 때) */
export function hasCard(player: FakePlayer): boolean {
	return !!tagOf(player).cardWidget;
}

/**
 * 카드에 실려 온 내용. 마지막 init 하나만 본다.
 *
 * 카드 슬롯은 열 때마다 새 위젯이므로 init은 늘 하나지만, 도감으로 건너가는
 * 길처럼 같은 위젯 참조가 이어지는 경우가 있어 마지막 것을 쓴다.
 */
export function cardShown(player: FakePlayer): { heading: string; cards: CardView[] } {
	const messages = cardWidget(player).messages;
	for (let i = messages.length - 1; i >= 0; i--) {
		const payload = messages[i] as { type?: string; heading?: string; cards?: CardView[] };
		if (payload.type === "init") {
			return { heading: payload.heading || "", cards: payload.cards || [] };
		}
	}
	throw new Error(`${player.name}의 카드가 내용을 받은 적이 없습니다.`);
}

/** 프로필 창. 없으면 던진다 (hasProfile로 먼저 확인한다) */
export function profileWidget(player: FakePlayer): FakeWidget {
	const widget = tagOf(player).profileWidget;
	if (!widget) throw new Error(`${player.name}에게 열린 프로필이 없습니다.`);
	return widget as unknown as FakeWidget;
}

/** 프로필 창이 열려 있는가 */
export function hasProfile(player: FakePlayer): boolean {
	return !!tagOf(player).profileWidget;
}

/** 프로필 창에 실려 온 내용 */
export function profileShown(player: FakePlayer): ProfilePayload {
	const messages = profileWidget(player).messages;
	for (let i = messages.length - 1; i >= 0; i--) {
		const payload = messages[i] as { type?: string };
		if (payload.type === "init") return payload as ProfilePayload;
	}
	throw new Error(`${player.name}의 프로필이 내용을 받은 적이 없습니다.`);
}

/**
 * 서버가 마지막으로 입력창에 채워 달라고 한 글. 부탁이 없었으면 "".
 *
 * 두 경로를 함께 본다 — 펴져 있는 창에는 prefill 메시지가 가고, 접혀 있던
 * 창은 다시 열리면서 init에 실려 온다(ChatService.prefill). 한쪽만 보면
 * 접힌 사람에게서만 조용히 실패하는 검사가 된다.
 */
export function chatPrefill(player: FakePlayer): string {
	const messages = chatWidget(player).messages;
	for (let i = messages.length - 1; i >= 0; i--) {
		const payload = messages[i] as { type?: string; text?: string; prefill?: string };
		if (payload.type === "prefill") return payload.text || "";
		if (payload.type === "init") return payload.prefill || "";
	}
	return "";
}

/** 화면을 덮고 있는 전환 컷 */
export function cutWidget(player: FakePlayer): FakeWidget {
	const widget = tagOf(player).cutWidget;
	if (!widget) throw new Error(`${player.name}에게 열린 컷이 없습니다.`);
	return widget as unknown as FakeWidget;
}

/** 지금 컷이 돌고 있는가 (걷혔는지 확인할 때) */
export function hasCut(player: FakePlayer): boolean {
	return !!tagOf(player).cutWidget;
}

/** 메인 위젯이 서버로 메시지를 보낸다 */
export function send(player: FakePlayer, data: object): void {
	mainWidget(player).emit(player, data);
}

/** 채팅 위젯이 서버로 메시지를 보낸다 */
export function sendChat(player: FakePlayer, data: object): void {
	chatWidget(player).emit(player, data);
}

/** 카드 위젯이 서버로 메시지를 보낸다 (닫기·도감으로 가기) */
export function sendCard(player: FakePlayer, data: object): void {
	cardWidget(player).emit(player, data);
}

/** 프로필 위젯이 서버로 메시지를 보낸다 (닫기·귓속말) */
export function sendProfile(player: FakePlayer, data: object): void {
	profileWidget(player).emit(player, data);
}

/** 지금 보고 있는 탭에 한 줄 친다 */
export function chat(player: FakePlayer, text: string, channel?: ChatChannel): void {
	const target = channel === undefined ? activeChannel(player) : channel;
	sendChat(player, { type: "send", channel: target, text });
}

/** 채팅 탭을 옮긴다 */
export function switchChannel(player: FakePlayer, channel: ChatChannel): void {
	sendChat(player, { type: "channel", channel });
}

/** 서버가 지금 활성 탭이라고 알려준 채널 */
export function activeChannel(player: FakePlayer): ChatChannel {
	const messages = chatWidget(player).messages;
	for (let i = messages.length - 1; i >= 0; i--) {
		const payload = messages[i] as { active?: ChatChannel };
		if (payload.active !== undefined) return payload.active;
	}
	throw new Error(`${player.name}의 채팅 위젯이 활성 채널을 받은 적이 없습니다.`);
}

/** 서버가 마지막으로 보낸 채널 목록(미확인 수 포함) */
export function chatChannels(player: FakePlayer): ChatChannelView[] {
	const messages = chatWidget(player).messages;
	for (let i = messages.length - 1; i >= 0; i--) {
		const payload = messages[i] as { channels?: ChatChannelView[] };
		if (payload.channels !== undefined) return payload.channels;
	}
	throw new Error(`${player.name}의 채팅 위젯이 채널 목록을 받은 적이 없습니다.`);
}

/** 대기실에서 방에 참가한다 */
export function joinRoom(player: FakePlayer, roomNum: number): void {
	send(player, { type: "join", roomNum });
}

export function setReady(player: FakePlayer, ready = true): void {
	send(player, { type: ready ? "ready" : "cancle-ready" });
}

/**
 * 투표 위젯이 보내는 메시지. 대상을 빼면 기권(표 회수)이다.
 *
 * 테스트 10곳이 각자 `{ vote: n }`을 직접 적고 있었다. 서버가 필드 이름을
 * 바꾸자 10곳이 한꺼번에 깨졌는데, 정작 "위젯이 무엇을 보내기로 했는가"는
 * 어디에도 적혀 있지 않았다. 위젯 프로토콜을 아는 곳을 하나로 못 박는다.
 */
export function vote(player: FakePlayer, targetIndex: number | null = null): void {
	send(player, { type: "vote", target: targetIndex });
}

/** 찬반 위젯이 보내는 메시지. AGREE·OPPOSE 외의 값은 서버가 취소로 받는다 */
export function judge(player: FakePlayer, pick: Judgement): void {
	send(player, { type: "judge", pick });
}

/**
 * 투표가 끝난 판을 재판 끝까지 밀어 결론을 낸다.
 *
 * 예전에는 개표 단계가 곧 처형이라 finishPhase 한 번이면 끝났다. 지금은
 * VOTE → VOTE_RESULT → DEFENSE → JUDGEMENT → 결론 네 걸음이고, 중간에
 * 산 사람 전원이 O나 X를 눌러야 한다. 이 절차를 테스트마다 다시 쓰면
 * 한 걸음만 빠져도 "처형되지 않았다"로만 터져서 원인이 안 보인다.
 *
 * pick이 AGREE면 만장일치 찬성이라 반드시 처형되고, OPPOSE면 부결되어
 * 낮으로 돌아가거나(재지목 가능) 밤으로 넘어간다. 접속이 끊긴 사람은
 * 누를 수 없지만 기권으로 흘러가 어느 쪽에도 세어지지 않으므로
 * (Trial.judgementPassed) 한 명이라도 눌렀다면 결과는 그 사람들끼리 갈린다.
 *
 * 협박당한 좌석에도 judge를 보낸다. 서버가 거절하는 것이 정상이고, 그
 * 거절까지가 이 헬퍼로 만들려는 상황의 일부다 — 협박은 여기서 걸러내면
 * 안 되고 판정(반대로 센다)이 받아야 한다.
 */
export function passTrial(target: Room, pick: Judgement = Judgement.AGREE): void {
	assert.equal(target.phase, GamePhase.VOTE, "투표 단계에서 불러야 합니다");
	finishPhase(target); // VOTE → VOTE_RESULT
	assert.notEqual(target.nominee, 0, "단상에 오른 사람이 없어 재판이 열리지 않습니다");
	finishPhase(target); // VOTE_RESULT → DEFENSE
	finishPhase(target); // DEFENSE → JUDGEMENT
	assert.equal(target.phase, GamePhase.JUDGEMENT, "찬반투표에 도착하지 못했습니다");

	for (const seat of target.seats) {
		if (!seat.alive || !seat.connected || seat.index === target.nominee) continue;
		judge(playerOf(seat), pick);
	}

	finishPhase(target); // JUDGEMENT → 처형 또는 부결
}

/**
 * 현재 단계가 끝날 만큼만 시간을 흘린다.
 *
 * phaseTimer를 정확히 소진시키므로 전이가 딱 한 번 일어난다.
 * 진행 중이 아니면(대기실) 아무것도 하지 않는다.
 */
export function finishPhase(target: Room): void {
	if (!target.started) throw new Error(`${target.num}번 방은 게임 중이 아닙니다.`);
	tick(target.phaseTimer + 0.001);
}

/** 전원 준비된 대기실의 카운트다운을 소진시켜 게임을 시작한다 */
function finishCountdown(target: Room): void {
	tick(target.countdown + 0.001);
}

/**
 * 첫 밤에 서 있는 판을 둘째 밤이 시작되는 시점까지 넘긴다.
 *
 * 8인 이하 판의 첫 밤에는 아무도 죽지 않으므로(룰셋의 firstNightPeacefulUpTo)
 * 사망이 걸린 테스트는 전부 이 네 걸음(밤 → 낮 → 투표 → 개표 → 밤)을 앞에
 * 붙여야 한다. 다섯 곳이 각자 finishPhase를 세고 있었고, 한 걸음만 어긋나도
 * 뒤따르는 select가 밤이 아닌 단계로 날아가 조용히 버려진다 — 그 뒤의 단언은
 * 죽지 않은 사람을 상대로 돌아 원인과 한참 떨어진 자리에서 깨진다.
 * 그래서 도착 단계를 여기서 확인하고 돌려준다.
 */
export function passPeacefulFirstNight(target: Room): void {
	assert.equal(target.phase, GamePhase.NIGHT, "밤이 아닌 단계에서 불렀습니다");
	assert.equal(target.turnCount, 0, "첫 밤이 아닙니다");
	finishPhase(target); // 첫 밤(무사) → DAY
	finishPhase(target); // → VOTE
	finishPhase(target); // → VOTE_RESULT (아무도 투표하지 않아 처형 없음)
	finishPhase(target); // → NIGHT (둘째 밤)
	assert.equal(target.phase, GamePhase.NIGHT, "둘째 밤에 도착하지 못했습니다");
}

/**
 * n명을 접속시켜 한 방에 넣고 전원 준비시킨 뒤 게임을 시작한다.
 * 반환 시점의 단계는 ROLE_REVEAL이다.
 *
 * roles를 주면 앞 좌석부터 그 직업으로 덮어쓴다. 특정 직업이 필요한
 * 테스트가 무작위 덱에서 그 직업을 찾아 헤매지 않게 한다(castRoles 참고).
 */
export function startGame(playerCount: number, roomNum = 1, roles?: readonly Role[]): FakePlayer[] {
	if (playerCount > MAX_PLAYERS) {
		throw new Error(`한 방의 최대 인원은 ${MAX_PLAYERS}명입니다.`);
	}
	const players: FakePlayer[] = [];
	for (let i = 0; i < playerCount; i++) {
		const player = connect(`플레이어${i + 1}`);
		joinRoom(player, roomNum);
		players.push(player);
	}
	for (const player of players) setReady(player);
	finishCountdown(room(roomNum));
	if (roles) castRoles(room(roomNum), roles);
	return players;
}

/**
 * 예외 규칙이 없는 직업만으로 채운 판. 배선 테스트의 기준선이다.
 *
 * 배선 테스트가 검증하는 문장은 "지목한 사람이 아침에 죽는다", "표는 한 번만
 * 들어간다" 같은 것인데, 무작위 덱은 바로 그 문장의 예외인 좌석을 앉힌다.
 * 군인은 첫 공격을 버티고, 정치인은 표가 2에 처형 면역이다. 그래서 밸런스
 * 상수를 한 번 만질 때마다 밸런스와 무관한 테스트가 깨졌다 — 능력자 비율의
 * 반올림을 고치자 4명 판에 군인이 들어올 수 있게 되면서 세 개가 그렇게 깨졌다.
 *
 * 예외인 직업을 걸러내는 필터(plainSeats)로 막아둔 자리도 있었지만, 그 필터는
 * 예외를 가진 직업이 늘 때마다 한 줄씩 길어지고 빠뜨리면 조용히 통과한다.
 * 여기서는 반대로 "쓸 직업만" 적는다. 직업이 하나 더 생겨도 이 배열은 그대로다.
 *
 * 무작위 덱으로 도는 경로도 검증이 필요하지만 그건 "직업이 배분된다" 테스트
 * 하나가 맡는다. 나머지는 덱을 입력으로 고정한다.
 */
function plainDeck(playerCount: number): Role[] {
	const deck: Role[] = [Role.MAFIA, Role.DOCTOR, Role.POLICE];
	while (deck.length < playerCount) deck.push(Role.CITIZEN);
	return deck.slice(0, playerCount);
}

/** plainDeck으로 시작하는 startGame */
export function startPlainGame(playerCount: number, roomNum = 1): FakePlayer[] {
	return startGame(playerCount, roomNum, plainDeck(playerCount));
}

/**
 * 좌석 앞쪽부터 직업을 원하는 대로 덮어쓴다.
 *
 * 직업 배분은 풀에서 무작위로 뽑으므로 어떤 직업이 판에 들어올지는
 * 인원수와 밸런스 상수(SPECIAL_CITIZEN_RATIO 등)에 달려 있다. 배선을
 * 검증하는 테스트가 그 추첨 결과에 기대면, 밸런스를 한 번 만질 때마다
 * 밸런스와 무관한 테스트가 같이 깨진다 — 실제로 4명 판에서 정치인이
 * 빠지자 밤 화면·투표 가중치 테스트 두 개가 그렇게 깨졌다.
 *
 * 검증하려는 직업은 테스트가 직접 앉힌다. ROLE_REVEAL 단계에서만
 * 의미가 있다(밤·투표 화면은 그 뒤에 열리므로 바뀐 직업을 본다).
 *
 * roles[k]는 **k+1번 좌석**이 받는다. room.seats의 배열 순서가 아니다 —
 * 그 순서는 참가 처리 순서라 좌석 번호와 어긋날 수 있고, 실제로 어긋났다.
 * 배열 순서로 앉히면 "1번 좌석이 마피아"라고 적은 테스트가 판마다 다른
 * 좌석을 검사하게 되고, 우연히 맞는 판에서는 통과해버려 그 사실이
 * 드러나지도 않는다.
 */
export function castRoles(target: Room, roles: readonly Role[]): void {
	if (roles.length > target.seats.length) {
		throw new Error(`좌석이 ${target.seats.length}개인데 직업을 ${roles.length}개 주었습니다.`);
	}
	const byIndex = target.seats.slice().sort((a, b) => a.index - b.index);
	for (let i = 0; i < roles.length; i++) {
		assignRole(byIndex[i], byIndex[i].index, roles[i]);
	}
}

export { world, FakePlayer, FakeWidget };
