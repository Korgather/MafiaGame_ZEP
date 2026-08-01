/**
 * 사람을 클릭했을 때 뜨는 프로필 창.
 *
 * ZEP 기본 프로필 창(showProfileOnUnitClick)을 끄고 이것으로 갈아탄 이유는
 * 보여줄 것이 다르기 때문이다. 기본 창은 ZEP 계정 정보를 말하는데, 마피아
 * 게임에서 남을 클릭하는 사람이 알고 싶은 것은 "이 사람이 몇 판 해봤고
 * 중도 이탈이 얼마나 되는가"다 — 초보인지, 판을 자주 깨고 나가는 사람인지.
 *
 * 무엇을 넣지 않았는가
 * -------------------
 * 직업·진영은 없다. 이 창은 클릭 한 번으로 열리므로 여기에 직업이 실리면
 * 게임이 끝난다. payload에 그 칸 자체를 두지 않았다(Widgets.ProfilePayload).
 *
 * 차단·신고 버튼도 없다. 차단 상태를 만지는 코드는 지금 ChatCommands 안에만
 * 있고, 여기에 두 번째 조작 지점을 만들면 이번에 고친 것과 똑같은 모양
 * ("쓰는 곳이 여러 곳, 규칙을 아는 곳은 없음")이 채팅 쪽에 새로 생긴다.
 * 먼저 ChatCommands에서 차단/신고를 함수로 꺼낸 뒤에 버튼을 붙이는 순서가
 * 맞다. 그때 이 파일에서 바뀌는 것은 payload 두 줄과 handleMessage의 case뿐이다.
 *
 * 귓속말 버튼은 그 순서를 지켜서 붙였다. 이 파일이 하는 일은 "누구에게"를
 * 넘기는 것뿐이고, 보낼 수 있는지(Chat.canWhisper)와 입력창을 어떻게 채우는지
 * (Chat.prefill)는 여전히 채팅 쪽 한 곳이 정한다. 명령어를 문자열로 만들어
 * 넘기는 것이 조금 우스워 보이지만, 그래야 사람이 직접 /귓속말을 친 것과
 * 완전히 같은 길을 지난다 — 이름 찾기, 차단 여부, 게임 중 금지가 모두 한 번만
 * 구현돼 있다.
 */
import type { ScriptPlayer } from "zep-script";
import type { ProfileStat } from "../types/Widget.types.ts";
import { messageType } from "../types/Widget.types.ts";
import { locate, locateSpectator } from "../entities/RoomRegistry.ts";
import * as Storage from "../infrastructure/PlayerStorage.ts";
import * as Chat from "./ChatService.ts";
import { rankOf } from "./Rewards.ts";
import type { ProfilePayload } from "./Widgets.ts";
import { bindMessage, closeProfile, openProfile } from "./Widgets.ts";

/**
 * 구운 아바타 이미지가 있는 곳. player.avatarFileName을 뒤에 붙이면 URL이 된다.
 *
 * 위젯이 아니라 여기서 조립한다. 위젯 HTML에 외부 호스트가 적혀 있으면 빌드가
 * 막기 때문이다(tools/build-widgets.js의 EXTERNAL). 그 검사는 위젯이 스스로
 * 바깥과 통신하기 시작하는 것을 지키는 장치라, 우회하는 대신 서버가 URL을
 * 완성해서 내려보낸다.
 */
const AVATAR_BASE = "https://cdn-static.zep.us/static/assets/baked-avartar-images/";

/**
 * 클릭한 사람의 화면에 대상의 프로필을 띄운다.
 *
 * 연타 제한을 걸지 않았다. 이 창은 클릭한 사람 자기 화면만 바꾸고, openProfile이
 * 열기 전에 닫으므로 몇 번을 눌러도 위젯은 하나다. 대기실 버튼과 여유분
 * (tag.actionRate)을 나눠 쓰면 프로필 몇 번 열어본 사람이 준비 버튼을 못
 * 누르게 되는데, 그것이 막으려는 도배보다 나쁘다(GameConfig의 ACTION_RATE 주석).
 */
export function showProfile(clicker: ScriptPlayer, target: ScriptPlayer): void {
	// 비공개 API라 값이 없을 수 있다. 없으면 위젯이 글리프로 대신 그린다
	const file = target.avatarFileName;
	const payload: ProfilePayload = {
		type: "init",
		name: target.name,
		rank: rankOf(target),
		avatar: file ? AVATAR_BASE + file : "",
		where: whereOf(target),
		stats: statsOf(target),
		self: clicker.id === target.id,
		// 자기 자신에게는 보낼 수 없다(ChatCommands가 거절한다). 눌러 봐야
		// 거절만 돌아오는 버튼은 그리지 않는다
		canWhisper: clicker.id !== target.id && Chat.canWhisper(clicker),
	};
	// 대상을 클로저로 넘긴다. payload에 담아 위젯을 거쳐 돌아오게 하면 남의
	// playerId가 웹뷰를 한 바퀴 도는데, 그럴 이유가 없다 — 창을 연 서버가
	// 이미 알고 있는 값이다
	bindMessage(
		openProfile(clicker, payload),
		"profile",
		(player, data) => handleMessage(player, target, data)
	);
}

function handleMessage(player: ScriptPlayer, target: ScriptPlayer, data: unknown): void {
	switch (messageType(data)) {
		case "close":
			closeProfile(player);
			break;
		case "whisper":
			/*
			 * 보내지 않는다. 입력창에 "/귓속말 이름 "까지만 채운다.
			 *
			 * 창은 닫는다 — 채울 곳이 채팅 입력창이라 프로필이 덮고 있으면
			 * 방금 무슨 일이 일어났는지 보이지 않는다.
			 */
			closeProfile(player);
			Chat.prefill(player, `/귓속말 ${target.name} `);
			break;
	}
}

/**
 * 이 사람이 지금 어디 있는가.
 *
 * 좌석과 관전을 구분해서 말한다. 방 번호만 알려주면 "3번 방"이라는 같은 말이
 * 판에 낀 사람과 구경하는 사람에게 똑같이 붙어서, 정작 궁금한 것(같이 할 수
 * 있는 사람인가)에 답하지 못한다.
 *
 * 생존 여부는 이미 맵 위에 보인다(유령 스프라이트 · 이름표). 여기서 숨겨도
 * 감춰지는 것이 없으므로 함께 적는다.
 */
function whereOf(target: ScriptPlayer): string {
	const seated = locate(target.id);
	if (seated) return `${seated.room.num}번 방 · ${seated.seat.alive ? "참가 중" : "유령"}`;
	const watching = locateSpectator(target.id);
	if (watching) return `${watching.room.num}번 방 · 관전`;
	return "대기실";
}

/**
 * 전적 줄. 이 목록이 프로필 창의 내용 전부다.
 *
 * 전에는 이 네 줄 중 두 줄이 머리 위 칭호에 들어가 있었다. 칭호는 아바타
 * 위에 떠 있는 글자라 길어질수록 맵을 가리고, 옆 사람 것과 겹쳐 읽을 수
 * 없게 된다. 클릭해서 여는 창은 길어져도 아무것도 가리지 않는다.
 *
 * 게스트는 저장 자체가 no-op이라(PlayerStorage.update) 숫자가 영원히 0이다.
 * 0승 0패를 늘어놓으면 "판을 한 번도 안 한 사람"으로 읽히므로 이유를 적는다.
 */
function statsOf(target: ScriptPlayer): ProfileStat[] {
	if (target.isGuest) {
		return [{ label: "전적", value: "로그인하면 기록이 남습니다" }];
	}
	const storage = Storage.read(target);
	return [
		{ label: "마피아", value: `${storage.mafiaWin || 0}승 ${storage.mafiaLose || 0}패` },
		{ label: "시민", value: `${storage.citizenWin || 0}승 ${storage.citizenLose || 0}패` },
		{ label: "참가", value: `${storage.playCount || 0}판` },
		{ label: "중도 이탈", value: `${storage.runCount || 0}판` },
	];
}
