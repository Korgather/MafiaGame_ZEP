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
// FakeZep이 먼저 평가돼야 한다. ESM은 import 선언 순서대로 깊이 우선
// 평가하므로 이 한 줄이 아래 src import보다 반드시 먼저 끝난다.
// (Sprites.ts가 모듈 로드 시점에 ScriptApp.loadSpritesheet를 부른다)
import { FakePlayer, FakeWidget, seedRandom, world } from "./FakeZep.ts";
import "../../src/index.ts";
import { MAX_PLAYERS } from "../../src/constants/GameConfig.ts";
import { assignRole, resetRoom } from "../../src/entities/Room.ts";
import { allRooms, getRoom, locate } from "../../src/entities/RoomRegistry.ts";
import type { ChatChannel } from "../../src/domain/chat/ChatChannel.ts";
import type { ChatMessage } from "../../src/domain/chat/ChatMessage.ts";
import { resetGlobalLog } from "../../src/services/ChatService.ts";
import type { ChatChannelView, PlayerTag, Room, Seat } from "../../src/types/Game.types.ts";
import { Role } from "../../src/types/Game.types.ts";

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
	for (const key of Object.keys(world.mapObjects)) delete world.mapObjects[key];
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

/** 운영자 명령 등 채팅 입력 */
export function say(player: FakePlayer, text: string): void {
	world.hooks.say.emit(player, text);
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

/** 채팅에 이런 내용의 줄이 왔는가 */
export function chatSaw(player: FakePlayer, fragment: string): boolean {
	return chatLines(player).some(line => line.text.indexOf(fragment) >= 0);
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
export function finishCountdown(target: Room): void {
	tick(target.countdown + 0.001);
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
 * 여기서는 반대로 "쓸 직업만" 적는다. 13번째 직업이 생겨도 이 배열은 그대로다.
 *
 * 무작위 덱으로 도는 경로도 검증이 필요하지만 그건 "직업이 배분된다" 테스트
 * 하나가 맡는다. 나머지는 덱을 입력으로 고정한다.
 */
export function plainDeck(playerCount: number): Role[] {
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
 */
export function castRoles(target: Room, roles: readonly Role[]): void {
	if (roles.length > target.seats.length) {
		throw new Error(`좌석이 ${target.seats.length}개인데 직업을 ${roles.length}개 주었습니다.`);
	}
	for (let i = 0; i < roles.length; i++) {
		assignRole(target.seats[i], target.seats[i].index, roles[i]);
	}
}

export { world, FakePlayer, FakeWidget };
