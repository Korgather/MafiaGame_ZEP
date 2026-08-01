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
import { MapTrigger } from "./constants/Assets.ts";
import { attachedRoom, locate } from "./entities/RoomRegistry.ts";
import { guard } from "./infrastructure/Fault.ts";
import { destroyWidgets } from "./infrastructure/PlayerTag.ts";
import { label } from "./services/Broadcast.ts";
import { showBook } from "./services/Cards.ts";
import * as Ccu from "./services/Ccu.ts";
import * as Chat from "./services/ChatService.ts";
import * as GameFlow from "./services/GameFlow.ts";
import { enterLobby, handleDisconnect } from "./services/Lobby.ts";
import { showProfile } from "./services/Profile.ts";
import {
	auditRoomAreas,
	resetPlayerAppearance,
	restoreAppearance,
	seatPlayer,
	spawnInLobby,
} from "./services/Stage.ts";

/*
 * 모든 핸들러가 guard를 지난다. 이 파일이 예외가 ZEP 런타임으로 새어 나가는
 * 마지막 경계이기 때문이다 — 여기서 놓치면 그 프레임(또는 그 접속)이 통째로
 * 사라지고, 남는 것은 아무도 보지 않는 ZEP 서버 로그 한 줄뿐이다.
 *
 * 핸들러마다 따로 감싸는 이유는 복구 단위가 다르기 때문이다. 접속 처리가
 * 실패한 것은 그 사람 한 명의 문제이고, tick이 실패한 것은 방 하나의
 * 문제다(GameFlow.tick이 방 단위로 다시 격리한다). 한 번에 묶어 감싸면
 * 어느 쪽이 무너졌는지 알림에서 구분되지 않는다.
 */
ScriptApp.onStart.Add(() => guard("시작", () => {
	ScriptApp.enableFreeView = false;
	/*
	 * showName은 그대로 둔다. 게임 중에는 player.name 자체를 참가 번호로
	 * 바꾸고 title을 비우며, 대기실로 돌아갈 때 원래 닉네임을 복구한다.
	 *
	 * showProfileOnUnitClick: 기본 프로필 창은 ZEP 계정 정보를 보여준다.
	 *   이 게임에서 남을 클릭하는 사람이 궁금한 것은 그게 아니라 "몇 판 했고
	 *   중도 이탈이 얼마나 되는 사람인가"다. 대신 Profile.ts의 창을 띄운다.
	 */
	// ScriptApp.showName = false;
	ScriptApp.showProfileOnUnitClick = false;
	ScriptApp.sendUpdated();
	// 맵과 코드 사이의 계약은 컴파일러가 못 잡는다. 맵이 떠 있는 첫 순간에
	// 한 번 훑어 스태프에게 알린다 (Stage.auditRoomAreas)
	auditRoomAreas();
}));

ScriptApp.onJoinPlayer.Add(player => guard("접속", () => {
	Ccu.schedule();

	// 이름표를 판 밖 모습(등급 + 닉네임)으로 세운다
	resetPlayerAppearance(player);
	player.attackType = 2;
	player.attackParam1 = 2;
	player.attackParam2 = 3;

	// 배율은 위 resetPlayerAppearance가 넣는다(Screen.baseRatio). 여기서 또
	// 넣으면 폰의 기본값이 두 곳에 적히고, 한쪽만 고치는 날 밤마다 화면이
	// 튄다 — 연출이 곱하는 기준이 바로 그 값이기 때문이다
	if (player.isMobile) ScriptApp.putMobilePunch();
	player.sendUpdated();

	// 채팅은 로비든 게임 중이든 항상 있다. 아래 두 갈래보다 먼저 여는 이유는
	// 재접속 경로에서 showPhaseView가 채팅으로 안내를 보낼 수 있기 때문이다.
	// 포커스는 건드리지 않는다. 막 들어온 사람은 화면을 보려는 것이지
	// 글을 쓰려는 것이 아니고, 입력창을 잡으면 이동 키부터 먹지 않는다.
	Chat.openFor(player, "", "");

	// 게임 도중 끊겼다 돌아온 경우. 기존에는 좌석이 사라져 관전조차 못 했다.
	const found = locate(player.id);
	if (found) {
		found.seat.connected = true;
		seatPlayer(found.room, player, found.seat);
		restoreAppearance(found.room, player, found.seat);
		GameFlow.showPhaseView(found.room, player, found.seat);
		// 돌아온 사람이 분모에 다시 들어갔다. 남은 사람들 화면의 숫자도 같이
		// 늘려주지 않으면 그들은 "다 냈는데 왜 안 넘어가지"를 겪는다.
		GameFlow.refreshProgress(found.room);
		label(player, "진행 중이던 게임에 다시 참가했습니다.");
		return;
	}

	spawnInLobby(player);
	enterLobby(player);
}));

ScriptApp.onLeavePlayer.Add(player => guard("이탈", () => {
	// 어느 방이었는지는 먼저 잡아둔다. 대기실에서 나간 경우 handleDisconnect가
	// 좌석을 지워버려 뒤에서는 찾을 수 없다.
	const found = locate(player.id);
	handleDisconnect(player);
	// 한 명이 빠지면 진행률의 분모가 남은 전원에게서 함께 줄어든다.
	if (found) GameFlow.refreshProgress(found.room);
	// 마지막 한 명이 나갔으면 0명을 즉시 보고한다. 디바운스를 기다릴
	// 이벤트가 더 이상 발생하지 않기 때문이다.
	if (ScriptApp.playerCount <= 1) Ccu.reportNow();
	else Ccu.schedule();
}));

ScriptApp.onDestroy.Add(() => guard("종료", () => {
	for (const player of ScriptApp.players) {
		const found = locate(player.id);
		if (found?.room.started) player.name = found.seat.name;
		destroyWidgets(player);
		resetPlayerAppearance(player);
	}
	Chat.resetGlobalLog();
}));

// ScriptApp.onSay는 더 이상 쓰지 않는다. ZEP 기본 채팅창에 무엇을 치든
// 이 게임은 반응하지 않는다 — 운영자 명령을 포함한 모든 입력은 채팅 위젯의
// COMMANDS 표를 지난다. 기본 채팅창 자체를 숨기는 API는 0.16.5에 없다.

// 둘을 따로 감싼다. CCU 보고(네트워크)가 실패해도 게임은 계속 흘러야 하고,
// 게임이 멈춰도 접속자 수 보고는 계속돼야 한다 — 서로의 실패에 볼모가 될
// 이유가 없는 두 일이 같은 콜백에 있을 뿐이다.
ScriptApp.onUpdate.Add(dt => {
	guard("CCU 보고", () => Ccu.tick(dt));
	guard("진행", () => GameFlow.tick(dt));
});

// 대기실 안내판. 규칙을 잊었거나 첫 안내를 넘긴 사람이 다시 읽는 통로다.
// x·y·tileID는 어느 판인지가 아니라 어느 칸인지라 여기서는 쓸 일이 없다.
ScriptApp.onObjectTouched.Add((player, _x, _y, _tileID, obj) => guard("오브젝트 접촉", () => {
	if (obj.param1 === MapTrigger.GUIDE_BOARD) showBook(player);
}));

// 대기실에서 사람을 클릭하면 이 게임의 프로필 창이 열린다(ZEP 기본 창은 onStart에서 껐다).
// target이 비어 오는 경우를 막는 이유는 이 값이 ZEP 런타임에서 오는 것이고,
// 여기서 터지면 클릭한 사람의 프레임이 통째로 사라지기 때문이다.
ScriptApp.onUnitClicked.Add((clicker, target) => guard("프로필", () => {
	if (!clicker || !target) return;
	if (attachedRoom(clicker.id)?.started || attachedRoom(target.id)?.started) return;
	showProfile(clicker, target);
}));
