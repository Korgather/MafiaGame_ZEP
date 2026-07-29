/**
 * ZEP 이벤트 → 서비스 연결. 이 파일에는 게임 규칙이 없다.
 *
 * 기존 main.js는 이벤트 콜백 안에 규칙을 직접 적었다. 예를 들어
 * onJoinPlayer는 스토리지 초기화, tag 생성, 모바일 분기, 위젯 생성,
 * 위젯 메시지 핸들러 등록, 외형 초기화를 한 콜백에서 다 했고
 * onUpdate는 CCU 보고와 상태 머신을 함께 돌렸다.
 * 그래서 "게임 규칙"과 "플랫폼 연결"의 경계가 없어 어느 쪽을 고쳐도
 * 다른 쪽을 함께 읽어야 했다.
 *
 * 이 파일이 얇게 유지되는 한, 게임 로직은 ZEP 없이도 읽고 테스트할 수 있다.
 */
import { ADMIN_EXP_GRANT, ADMIN_ROLE_LEVEL } from "./constants/GameConfig.ts";
import { locate } from "./entities/RoomRegistry.ts";
import { destroyWidgets, tagOf } from "./infrastructure/PlayerTag.ts";
import { label } from "./services/Broadcast.ts";
import * as Ccu from "./services/Ccu.ts";
import * as GameFlow from "./services/GameFlow.ts";
import { enterLobby, handleDisconnect } from "./services/Lobby.ts";
import { awardExp, refreshTitle } from "./services/Rewards.ts";
import { displayName, resetPlayerAppearance, seatPlayer, spawnInLobby } from "./services/Stage.ts";

ScriptApp.onStart.Add(() => {
	ScriptApp.enableFreeView = false;
	ScriptApp.sendUpdated();
});

ScriptApp.onJoinPlayer.Add(player => {
	Ccu.schedule();

	// 게임 중 이름을 바꾸므로 접속 시점의 닉네임을 보관한다
	tagOf(player).originalName = player.name;

	resetPlayerAppearance(player);
	player.attackType = 2;
	player.attackParam1 = 2;
	player.attackParam2 = 3;
	refreshTitle(player);

	if (player.isMobile) {
		player.displayRatio = 0.7;
		ScriptApp.putMobilePunch();
	}
	player.sendUpdated();

	// 게임 도중 끊겼다 돌아온 경우. 기존에는 좌석이 사라져 관전조차 못 했다.
	const found = locate(player.id);
	if (found) {
		found.seat.connected = true;
		found.seat.name = player.name;
		player.name = displayName(player, found.seat);
		seatPlayer(found.room, player, found.seat);
		label(player, "진행 중이던 게임에 다시 참가했습니다.");
		return;
	}

	spawnInLobby(player);
	enterLobby(player);
});

ScriptApp.onLeavePlayer.Add(player => {
	handleDisconnect(player);
	// 마지막 한 명이 나갔으면 0명을 즉시 보고한다. 디바운스를 기다릴
	// 이벤트가 더 이상 발생하지 않기 때문이다.
	if (ScriptApp.playerCount <= 1) Ccu.reportNow();
	else Ccu.schedule();
});

ScriptApp.onDestroy.Add(() => {
	for (const player of ScriptApp.players) {
		destroyWidgets(player);
		resetPlayerAppearance(player);
	}
});

// 기존 코드는 `App.onSay.add(...)`였다. ZEP API의 이름은 `Add`라서
// 이 핸들러는 한 번도 등록되지 않았고 운영자 명령이 통하지 않았다.
ScriptApp.onSay.Add((player, text) => {
	if (player.role < ADMIN_ROLE_LEVEL) return;
	if (text === "/경험치") awardExp(player, ADMIN_EXP_GRANT);
});

ScriptApp.onUpdate.Add(dt => {
	Ccu.tick(dt);
	GameFlow.tick(dt);
});
