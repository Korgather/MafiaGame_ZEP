/**
 * 맵 위의 연출: 자리 배치, 숨기기, 실루엣, 스프라이트 교체, 머리 위 이름표.
 *
 * 기존에는 allHidden / clearHidden / createSilhouette / startState 안의
 * 배치 코드가 각각 room.players를 순회하며 좌표를 다시 계산했다.
 * 좌표 계산식(`startPoint[0] + coordinates[index].x`)은 5곳에 복사돼 있었고,
 * 그중 한 곳만 Number.isInteger 검사를 하고 있었다.
 *
 * 그리고 실루엣 정리는 Map.clearAllObjects()로 했다. 이 API는 스크립트가 만든
 * 오브젝트를 맵 전체에서 지운다. 방이 8개 동시에 돌아가므로 1번 방이 아침을
 * 맞으면 밤인 나머지 7개 방의 실루엣까지 사라졌다.
 * 방마다 자기가 놓은 좌표만 되돌리도록 바꾼다.
 */
import type { ScriptDynamicResource, ScriptPlayer } from "zep-script";
import type { Room, Seat } from "../types/Game.types.ts";
import { GamePhase } from "../types/Game.types.ts";
import { isInsideRoom, LOBBY_SPAWN_AREA, seatPosition } from "../constants/RoomLayout.ts";
import { MAX_PLAYERS, ROOM_COUNT } from "../constants/GameConfig.ts";
import { sprite } from "../infrastructure/Sprites.ts";
import type { SpriteKey } from "../constants/Assets.ts";
import { Tile } from "../constants/Assets.ts";
import { notifyStaff } from "../infrastructure/Fault.ts";
import { forEachPlayer } from "./Broadcast.ts";
import { rankOf } from "./Rewards.ts";

/** 기본 캐릭터 스프라이트로 되돌린다 */
const DEFAULT_SPRITE = null as unknown as ScriptDynamicResource;

/**
 * 이 사람이 지금 자기 방의 프라이빗 영역 안에 서 있는가.
 *
 * 방 채팅을 ZEP 기본 채팅으로 내보내기 전에 물어야 하는 것(ChatChannel의
 * zepAudienceFor). 두 가지를 함께 봐야 답이 되는데 어느 쪽도 혼자서는
 * 충분하지 않다:
 *
 *   상자만 보면 — 맵에 칠해진 영역이 상자보다 좁을 때(문간·복도) 그 틈에 선
 *   사람을 "영역 안"으로 오판한다. 그 사람은 실제로는 0번 영역에 있고,
 *   0번은 프라이빗 영역 밖의 전원이다. 방 채팅이 맵 전체로 샌다.
 *
 *   타일만 보면 — 어느 방의 영역인지 모른다. 방 밖으로 걸어 나가 옆 방
 *   영역에 들어선 사람의 낮 토론이 그 방으로 간다.
 *
 * 영역 id를 직접 읽으면 둘 다 필요 없지만, ScriptPlayer에도 ScriptMap에도
 * 그런 API가 없다(getTile은 효과 종류만 돌려준다). 프라이빗 영역 진입 이벤트로
 * id를 받아 들고 있는 방법도 막혀 있다 — 그 이벤트는 사람이 걸어서 타일을
 * 밟을 때만 오고, spawnAt으로 옮긴 좌석에는 오지 않는다. 게임이 시작하면
 * 전원이 spawnAt으로 앉으므로 하필 가장 중요한 경로에서 값이 비어 있게 된다.
 */
export function inOwnRoomArea(room: Room, player: ScriptPlayer): boolean {
	if (!isInsideRoom(room.num, player.tileX, player.tileY)) return false;
	return ScriptMap.getTile(Tile.EFFECT_LAYER, player.tileX, player.tileY) === Tile.PRIVATE_AREA;
}

/**
 * 좌석까지 프라이빗 영역이 덮여 있는지 맵을 훑어보고, 빠진 방을 스태프에게 알린다.
 * 빠진 방 번호들을 돌려준다(없으면 빈 배열).
 *
 * 왜 필요한가: 방마다 프라이빗 영역을 하나씩 두는 것은 코드가 지킬 수 없는
 * 계약이다(RoomLayout 참고). 손으로 칠하는 값이고, 빠뜨리면 그 방만 낮 토론
 * 말풍선이 사라진다 — 예외도 로그도 없이. 아무도 모르는 채로 판이 계속 돌고,
 * 나중에 "저 방만 말풍선이 안 뜬다"는 신고를 받고서야 알게 된다.
 * 사람이 지켜야 하는 계약일수록 기계가 확인해줘야 한다.
 *
 * 왜 좌석만 보는가: 판이 도는 동안 산 사람은 좌석에 고정돼 있다
 * (seatPlayer가 moveSpeed를 0으로 만든다). 즉 낮 토론이 나가는 타일은 정확히
 * 좌석 12칸뿐이라, 좌석이 덮였는지가 곧 "말풍선이 뜨는가"의 답이다.
 * 방 전체가 칠해졌는지까지는 묻지 않는다 — 그건 이 판정에 필요 없다.
 *
 * 무엇을 못 잡는가: 영역 id가 방 번호와 맞는지는 여전히 알 수 없다(읽는 API가
 * 없다). 틀린 id로 칠한 방은 옆 방으로 새고, 그건 눈으로 확인하는 수밖에 없다.
 * 여기서 잡는 것은 "아예 안 칠한 방"이고, 실수의 대부분이 그쪽이다.
 */
export function auditRoomAreas(): number[] {
	const missing: number[] = [];
	for (let roomNum = 1; roomNum <= ROOM_COUNT; roomNum++) {
		for (let index = 1; index <= MAX_PLAYERS; index++) {
			const seat = seatPosition(roomNum, index);
			if (!seat) continue;
			if (ScriptMap.getTile(Tile.EFFECT_LAYER, seat.x, seat.y) === Tile.PRIVATE_AREA) continue;
			missing.push(roomNum);
			break;
		}
	}
	if (missing.length > 0) {
		notifyStaff(
			`🎨 프라이빗 영역이 좌석을 덮지 않은 방: ${missing.join(", ")}번 — ` +
				`이 방들은 낮 토론 말풍선이 뜨지 않습니다 (영역 id = 방 번호)`
		);
	}
	return missing;
}

/** 접속 직후 대기실 구역 안의 임의 위치로 보낸다 */
export function spawnInLobby(player: ScriptPlayer): void {
	const area = LOBBY_SPAWN_AREA;
	player.spawnAt(
		area.x + Math.floor(Math.random() * area.width),
		area.y + Math.floor(Math.random() * area.height)
	);
}

/** 좌석 번호에 해당하는 자리로 옮기고 이동을 막는다 */
export function seatPlayer(room: Room, player: ScriptPlayer, seat: Seat): void {
	const position = seatPosition(room.num, seat.index);
	if (!position) return;
	player.spawnAt(position.x, position.y);
	player.moveSpeed = 0;
	player.sendUpdated();
}

/** 밤: 전원을 자리에 앉히고 화면에서 숨긴다 */
export function beginNightStage(room: Room): void {
	forEachPlayer(room, (player, seat) => {
		seatPlayer(room, player, seat);
		player.hidden = true;
		player.sendUpdated();
	});
	placeSilhouettes(room);
}

/** 낮: 실루엣을 걷고 전원을 다시 보이게 한다 */
export function beginDayStage(room: Room): void {
	clearSilhouettes(room);
	forEachPlayer(room, (player, seat) => {
		seatPlayer(room, player, seat);
		applyNameplate(player, seat);
		player.sprite = seat.alive ? DEFAULT_SPRITE : sprite("ghost");
		player.hidden = false;
		player.sendUpdated();
	});
}

/** 밤 동안 자리마다 세워두는 실루엣 */
function placeSilhouettes(room: Room): void {
	for (const seat of room.seats) {
		const position = seatPosition(room.num, seat.index);
		if (!position) continue;
		// 머리 위 한 칸에 실루엣, 발 밑에 투명 마스크(기본 캐릭터 가림 방지)
		ScriptMap.putObject(position.x, position.y - 1, sprite("silhouette"));
		ScriptMap.putObject(position.x, position.y, sprite("nightMask"));
		room.silhouettes.push([position.x, position.y - 1], [position.x, position.y]);
	}
}

/** 이 방이 놓은 오브젝트만 지운다 */
export function clearSilhouettes(room: Room): void {
	for (const [x, y] of room.silhouettes) {
		ScriptMap.putObject(x, y, null);
	}
	room.silhouettes = [];
}

/** 밤 동안 직업별 스프라이트로 바꾼다 */
export function applyNightSprite(player: ScriptPlayer, key: SpriteKey | null): void {
	player.sprite = key ? sprite(key) : DEFAULT_SPRITE;
	player.sendUpdated();
}

/**
 * 머리 위 이름표를 다시 그린다. 두 줄이다:
 *
 *     Lv.5        ← 뱃지: 판 밖에서는 등급, 판 안에서는 참가 번호(죽으면 유령)
 *     홍길동       ← 닉네임
 *
 * seat가 null이면 판 밖이다 — 접속 직후, 대기실, 게임이 끝나 돌아온 뒤.
 *
 * 왜 닉네임이 여기 들어가는가: ScriptApp.showName = false 이후 ZEP은 닉네임을
 * 그려주지 않는다. 머리 위에 남는 유일한 글자가 title이므로, 닉네임도 그
 * 안에 있어야 서로를 알아볼 수 있다.
 *
 * 왜 한 함수인가: 전에는 title을 네 곳(Rewards·GameFlow·Stage·Death)이 각자
 * 조립했고, 어느 곳도 다른 곳이 무엇을 넣는지 몰랐다. 그래서 "N 번 참가자"를
 * 쓴 곳은 레벨을 지웠고, 대기실 복귀는 title을 아예 복구하지 않아 한 번
 * 죽은 사람은 로비에서도 "유령"을 달고 서 있었다. 조립하는 곳이 하나면
 * 두 줄 규칙을 어길 수 있는 곳도 하나다.
 *
 * sendUpdated는 부르지 않는다. 부르는 곳이 모두 외형을 여러 개 바꾸는
 * 중이라 자기 끝에서 한 번에 보낸다.
 */
export function applyNameplate(player: ScriptPlayer, seat: Seat | null): void {
	let badge: string;
	if (!seat) badge = rankOf(player);
	else badge = seat.alive ? `${seat.index} 번 참가자` : "유령";
	player.title = `${badge}\n${player.name}`;
	// 로그인 유저(role 0)와 구분되도록 색을 달리한다
	player.titleColor = player.role === 0 ? 0x00ff00 : 0xffffff;
}

/**
 * 재접속한 사람의 외형을 현재 단계에 맞춘다.
 *
 * 이름표·스프라이트·숨김은 지금까지 단계 전이(beginNightStage/beginDayStage)나
 * 사망 시점에만 정해졌다. 그 사이에 들어온 사람은 산 사람 모습으로 남거나,
 * 모두가 숨은 밤에 혼자 맵 위에 서서 실루엣 연출을 깨뜨렸다.
 */
export function restoreAppearance(room: Room, player: ScriptPlayer, seat: Seat): void {
	applyNameplate(player, seat);
	player.sprite = seat.alive ? DEFAULT_SPRITE : sprite("ghost");
	player.hidden = room.phase === GamePhase.NIGHT;
	player.sendUpdated();
}

/** 게임이 끝나 대기실로 돌아갈 때의 원상복구 */
export function resetPlayerAppearance(player: ScriptPlayer): void {
	applyNameplate(player, null);
	player.sprite = DEFAULT_SPRITE;
	player.attackSprite = DEFAULT_SPRITE;
	player.moveSpeed = 80;
	player.hidden = false;
	player.sendUpdated();
}
