/**
 * 맵 위의 연출: 자리 배치, 숨기기, 실루엣, 스프라이트 교체.
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
import { LOBBY_SPAWN_AREA, seatPosition } from "../constants/RoomLayout.ts";
import { sprite } from "../infrastructure/Sprites.ts";
import type { SpriteKey } from "../constants/Assets.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";
import { forEachPlayer } from "./Broadcast.ts";

/** 기본 캐릭터 스프라이트로 되돌린다 */
const DEFAULT_SPRITE = null as unknown as ScriptDynamicResource;

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
		player.name = displayName(player, seat);
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
		// 머리 위 한 칸에 실루엣, 발 밑에 빈 오브젝트(캐릭터 가림 방지)
		ScriptMap.putObject(position.x, position.y - 1, sprite("silhouette"));
		ScriptMap.putObject(position.x, position.y, sprite("blank"));
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

/** 게임 중 표시 이름. 죽으면 (유령)이 붙는다 */
export function displayName(player: ScriptPlayer, seat: Seat): string {
	const original = tagOf(player).originalName;
	return seat.alive ? original : `${original}(유령)`;
}

/** 게임이 끝나 대기실로 돌아갈 때의 원상복구 */
export function resetPlayerAppearance(player: ScriptPlayer): void {
	player.name = tagOf(player).originalName;
	player.sprite = DEFAULT_SPRITE;
	player.attackSprite = DEFAULT_SPRITE;
	player.moveSpeed = 80;
	player.hidden = false;
	player.sendUpdated();
}
