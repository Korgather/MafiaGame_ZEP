/**
 * 채팅창에 "/"로 치는 명령어. 표 하나와, 그 표가 부르는 손들.
 *
 * ChatService에서 떼어낸 이유:
 *   명령어는 채팅을 "타고" 들어올 뿐 채팅의 일부가 아니다. 귓속말·차단·신고를
 *   한 라운드에 붙였더니 ChatService가 501줄에서 792줄이 됐는데, 늘어난 291줄
 *   가운데 채팅 코어(기록·권한·배달)에 속한 것은 30줄 남짓이었다. 나머지는
 *   전부 "사용자가 친 문자열을 해석해 누군가를 지목하고 무언가를 한다"였다.
 *   앞으로 명령어는 계속 는다(/투표 /직업 /관전 /킥 …). 코어와 같은 파일에
 *   두면 코어를 고치는 사람이 명령어를 읽어야 하고 그 반대도 마찬가지다.
 *
 * 층 관계는 한 방향이다: ChatCommands는 ChatService를 import하지 않는다.
 * 그럴 수 없다 — ChatService의 submit()이 여기 runCommand를 부르므로 서로
 * import하면 순환이 된다. 그래서 채팅에 부탁할 일은 ChatVoice로 받는다.
 * 덕분에 이 파일은 위젯도 채널 표도 모른 채 혼자 테스트할 수 있다.
 */
import type { ScriptPlayer } from "zep-script";
import { ADMIN_EXP_GRANT, ADMIN_ROLE_LEVEL } from "../constants/GameConfig.ts";
import type { MessageRow } from "../domain/chat/ChatMessage.ts";
import { seatAt } from "../entities/Room.ts";
import { locate } from "../entities/RoomRegistry.ts";
import { tagOf } from "../infrastructure/PlayerTag.ts";
import { showBook } from "./Cards.ts";
import { awardExp } from "./Rewards.ts";

/**
 * 명령어가 채팅에 부탁할 수 있는 전부.
 *
 * 셋뿐인 것이 이 경계의 값이다. 명령어는 남의 발언을 지우거나 남에게
 * 방송할 수 없고, 채널 권한 표를 직접 뒤집을 수도 없다 — 할 수 있는 일이
 * 타입에 적혀 있다.
 */
export interface ChatVoice {
	/** 이 사람에게만 보이는 안내. rows를 주면 text가 그 표의 제목이 된다 */
	tell(player: ScriptPlayer, text: string, rows?: MessageRow[]): void;
	/** 한 사람에게만 닿는 발언을 만든다 */
	whisper(from: ScriptPlayer, to: ScriptPlayer, body: string): void;
	/** 지금 귓속말을 보낼 수 있는 상황인가 */
	canWhisper(player: ScriptPlayer): boolean;
}

interface ChatCommand {
	/** 운영자만 쓸 수 있는가 */
	readonly admin: boolean;
	/** 인자 안내. 인자를 받지 않으면 "" */
	readonly args: string;
	readonly help: string;
	/** rest는 명령 이름 뒤에 남은 문자열. 인자가 없으면 "" */
	run(voice: ChatVoice, player: ScriptPlayer, rest: string): void;
}

/**
 * 명령어 표.
 *
 * 기존의 `/경험치`는 ScriptApp.onSay 핸들러 안의 if 한 줄이었다. 그 핸들러는
 * 원본에서 `.add`(소문자)로 등록돼 한 번도 불리지 않았고 — ZEP API는 `.Add`다 —
 * 아무도 눈치채지 못했다. 명령이 하나뿐이고 등록도 확인도 한 곳에서만
 * 일어났기 때문이다. 표로 만들면 명령을 늘려도 배선은 그대로다.
 *
 * 키가 전부 "/"로 시작하므로 사용자 입력이 Object.prototype의 멤버("constructor"
 * 등)에 닿을 수 없다. 그것이 여기서 인덱스 조회를 그대로 써도 되는 이유다.
 */
const COMMANDS: { [name: string]: ChatCommand } = {
	"/도움말": {
		admin: false,
		args: "",
		help: "쓸 수 있는 명령어를 봅니다",
		run: (voice, player) => voice.tell(player, "📖 채팅 명령어", helpRows(player)),
	},
	/*
	 * 도감을 채팅으로도 여는 이유는, 게임이 시작되면 대기실 위젯(📖 버튼이
	 * 달린 곳)이 닫히기 때문이다. 밤에 "군인이 뭐였더라"를 확인할 길이 그때
	 * 사라진다. 채팅창은 모든 단계에서 떠 있는 유일한 화면이라 여기가 그
	 * 자리다 — 단계 화면에 버튼을 더하면 지목할 사람 위에 버튼이 겹친다.
	 */
	"/도감": {
		admin: false,
		args: "",
		help: "직업 14종의 설명을 봅니다",
		run: (voice, player) => showBook(player),
	},
	"/귓속말": {
		admin: false,
		args: "<상대> <할 말>",
		help: "한 사람에게만 보냅니다 (게임 밖에서만)",
		run: whisper,
	},
	"/차단": {
		admin: false,
		args: "<상대>",
		help: "그 사람의 발언을 내 화면에서 가립니다",
		run: block,
	},
	"/차단해제": {
		admin: false,
		args: "<상대>",
		help: "차단을 풉니다",
		run: unblock,
	},
	"/차단목록": {
		admin: false,
		args: "",
		help: "내가 차단한 사람을 봅니다",
		run: blockList,
	},
	"/신고": {
		admin: false,
		args: "<상대> [사유]",
		help: "접속한 운영자에게 알립니다",
		run: report,
	},
	"/경험치": {
		admin: true,
		args: "",
		help: "경험치를 지급합니다 (운영자)",
		run: (voice, player) => awardExp(player, ADMIN_EXP_GRANT),
	},
};

/** 명령어 이름과 설명을 두 열로. 이름 길이가 제각각이라 한 줄로 이으면 눈이 못 훑는다 */
function helpRows(player: ScriptPlayer): MessageRow[] {
	const rows: MessageRow[] = [];
	for (const name in COMMANDS) {
		if (!Object.prototype.hasOwnProperty.call(COMMANDS, name)) continue;
		const command = COMMANDS[name];
		if (command.admin && player.role < ADMIN_ROLE_LEVEL) continue;
		rows.push({ label: `${name}${command.args ? ` ${command.args}` : ""}`, value: command.help });
	}
	return rows;
}

/**
 * "/이름 나머지"를 가른다.
 *
 * 첫 칸에서만 자른다. 뒤쪽은 통째로 넘겨 각 명령이 스스로 해석한다 —
 * 귓속말의 본문에는 띄어쓰기가 있어야 하므로 여기서 전부 쪼개면 안 된다.
 *
 * 잘라낸 이름도 여전히 "/"로 시작한다(호출부가 그것만 넘긴다).
 * COMMANDS를 인덱스로 그냥 조회해도 되는 이유가 이 성질이라 깨지 않는다.
 */
export function runCommand(voice: ChatVoice, player: ScriptPlayer, text: string): void {
	const space = text.indexOf(" ");
	const name = space < 0 ? text : text.slice(0, space);
	const rest = space < 0 ? "" : text.slice(space + 1).replace(/^\s+|\s+$/g, "");

	const command = COMMANDS[name];
	if (!command) {
		voice.tell(player, `❓ 모르는 명령어입니다: ${name}\n/도움말 을 쳐보세요.`);
		return;
	}
	if (command.admin && player.role < ADMIN_ROLE_LEVEL) {
		voice.tell(player, "🔒 운영자만 쓸 수 있는 명령어입니다.");
		return;
	}
	command.run(voice, player, rest);
}

// ────────────────────────────────────────────────────── 상대 지목

/**
 * 명령어가 가리키는 상대를 찾는다. 못 찾으면 이유를 알려주고 null.
 *
 * 찾기와 안내를 한 함수에 둔 이유는 부르는 곳이 셋(귓속말·차단·신고)인데
 * 실패 사유가 완전히 같기 때문이다. 나눠두면 세 곳이 같은 안내문을 각자
 * 적게 되고, 그중 하나만 고쳐진 채로 남는다.
 *
 * 참가 번호와 닉네임을 모두 받는다. 게임 중에는 번호가 사람을 부르는
 * 이름이고("3번 수상해요"), 대기실에서는 번호가 아직 없다.
 */
function resolveTarget(voice: ChatVoice, sender: ScriptPlayer, token: string): ScriptPlayer | null {
	if (token === "") {
		voice.tell(sender, "누구인지 적어주세요. 참가 번호나 닉네임을 씁니다.");
		return null;
	}

	const bySeat = seatTarget(sender, token);
	if (bySeat) {
		return bySeat.playerId === sender.id ? refuseSelf(voice, sender) : byId(voice, sender, bySeat);
	}

	const matches: ScriptPlayer[] = [];
	for (const player of ScriptApp.players) {
		if (player.name === token) matches.push(player);
	}
	if (matches.length === 0) {
		voice.tell(sender, `"${token}"을(를) 찾지 못했습니다.`);
		return null;
	}
	if (matches.length > 1) {
		voice.tell(sender, `"${token}"이(가) ${matches.length}명입니다. 참가 번호로 지목하세요.`);
		return null;
	}
	if (matches[0].id === sender.id) return refuseSelf(voice, sender);
	return matches[0];
}

/** 같은 방의 참가 번호. 번호는 게임이 시작돼야 붙으므로 대기실에서는 늘 null */
function seatTarget(sender: ScriptPlayer, token: string): { playerId: string } | null {
	const num = Number(token);
	if (!(num > 0) || Math.floor(num) !== num) return null;
	const found = locate(sender.id);
	if (!found) return null;
	const seat = seatAt(found.room, num);
	return seat ? { playerId: seat.playerId } : null;
}

function byId(
	voice: ChatVoice,
	sender: ScriptPlayer,
	seat: { playerId: string }
): ScriptPlayer | null {
	const player = ScriptApp.getPlayerByID(seat.playerId);
	if (!player) {
		voice.tell(sender, "그 사람은 지금 접속해 있지 않습니다.");
		return null;
	}
	return player;
}

function refuseSelf(voice: ChatVoice, sender: ScriptPlayer): null {
	voice.tell(sender, "자기 자신은 지목할 수 없습니다.");
	return null;
}

// ────────────────────────────────────────────────────── 귓속말

/**
 * 한 사람에게만 보낸다. 여기서는 "누구에게"만 정하고, 줄을 만드는 일은
 * 채팅(ChatVoice.whisper)의 몫이다.
 *
 * 게임 밖에서만 열리는 이유:
 *   귓속말이 판 안에서 통하면 마피아가 낮에 몰래 합을 맞추고, 죽은 사람이
 *   산 사람에게 범인을 찍어줄 수 있다. 채널 표(ChatPermission)가 막아 둔 것을
 *   명령어 하나로 우회하는 셈이다.
 *
 * 물어보는 시점이 상대를 찾기 "전"인 것도 일부러다. 뒤로 가면 게임 중에
 * 귓속말을 시도한 사람이 "찾지 못했습니다"를 먼저 보게 되어, 막힌 이유가
 * 상대 탓처럼 읽힌다.
 */
function whisper(voice: ChatVoice, sender: ScriptPlayer, rest: string): void {
	if (!voice.canWhisper(sender)) {
		voice.tell(sender, "게임 중에는 귓속말을 보낼 수 없습니다.");
		return;
	}
	const space = rest.indexOf(" ");
	if (space < 0) {
		voice.tell(sender, "/귓속말 <상대> <할 말> 처럼 씁니다.");
		return;
	}
	const target = resolveTarget(voice, sender, rest.slice(0, space));
	if (!target) return;
	const body = rest.slice(space + 1).replace(/^\s+|\s+$/g, "");
	if (body === "") {
		voice.tell(sender, "보낼 말을 적어주세요.");
		return;
	}
	voice.whisper(sender, target, body);
}

// ────────────────────────────────────────────────────── 차단

function block(voice: ChatVoice, sender: ScriptPlayer, rest: string): void {
	const target = resolveTarget(voice, sender, rest);
	if (!target) return;
	const tag = tagOf(sender);
	tag.blocked[target.id] = target.name;
	voice.tell(sender, `🚫 ${target.name} 님의 발언을 가립니다. (/차단해제 로 풉니다)`);
}

function unblock(voice: ChatVoice, sender: ScriptPlayer, rest: string): void {
	const tag = tagOf(sender);
	// 이름으로 먼저 찾는다. 나간 사람은 resolveTarget이 못 찾으므로,
	// 이 순서가 아니면 접속을 끊은 사람의 차단은 영영 풀 수 없다.
	for (const id in tag.blocked) {
		if (!Object.prototype.hasOwnProperty.call(tag.blocked, id)) continue;
		if (tag.blocked[id] !== rest) continue;
		delete tag.blocked[id];
		voice.tell(sender, `✅ ${rest} 님의 차단을 풀었습니다.`);
		return;
	}
	const target = resolveTarget(voice, sender, rest);
	if (!target) return;
	if (!Object.prototype.hasOwnProperty.call(tag.blocked, target.id)) {
		voice.tell(sender, `${target.name} 님은 차단한 적이 없습니다.`);
		return;
	}
	delete tag.blocked[target.id];
	voice.tell(sender, `✅ ${target.name} 님의 차단을 풀었습니다.`);
}

function blockList(voice: ChatVoice, sender: ScriptPlayer): void {
	const tag = tagOf(sender);
	const names: string[] = [];
	for (const id in tag.blocked) {
		if (Object.prototype.hasOwnProperty.call(tag.blocked, id)) names.push(tag.blocked[id]);
	}
	if (names.length === 0) {
		voice.tell(sender, "차단한 사람이 없습니다.");
		return;
	}
	voice.tell(sender, `🚫 차단 목록 (${names.length}명)\n${names.join(", ")}`);
}

// ────────────────────────────────────────────────────── 신고

/**
 * 접속한 운영자에게 알린다.
 *
 * ponytail: 이 프로젝트에는 앱 전역 저장소를 쓰는 곳이 아직 없다
 * (ScriptApp.getStorage/setStorage 미사용). 그래서 신고는 지금 접속한
 * 운영자에게 닿지 않으면 사라진다. 그 한계를 신고한 사람에게 그대로
 * 알려준다 — 전달되지 않은 신고를 접수된 것처럼 말하는 쪽이 더 나쁘다.
 * 기록이 필요해지면 ScriptApp.setStorage에 큐를 얹는 것이 다음 단계다.
 */
function report(voice: ChatVoice, sender: ScriptPlayer, rest: string): void {
	const space = rest.indexOf(" ");
	const token = space < 0 ? rest : rest.slice(0, space);
	const reason = space < 0 ? "" : rest.slice(space + 1).replace(/^\s+|\s+$/g, "");

	const target = resolveTarget(voice, sender, token);
	if (!target) return;

	const tag = tagOf(sender);
	if (Object.prototype.hasOwnProperty.call(tag.reported, target.id)) {
		voice.tell(sender, "이미 신고한 사람입니다.");
		return;
	}
	tag.reported[target.id] = true;

	const where = locate(target.id);
	const rows: MessageRow[] = [
		{ label: "신고한 사람", value: sender.name },
		{ label: "위치", value: where ? `${where.room.num}번 방` : "대기실 밖" },
		{ label: "사유", value: reason || "(적지 않음)" },
	];

	let delivered = 0;
	for (const player of ScriptApp.players) {
		if (player.role < ADMIN_ROLE_LEVEL) continue;
		voice.tell(player, `🚨 신고 — ${target.name}`, rows);
		delivered++;
	}
	voice.tell(
		sender,
		delivered > 0
			? `🚨 ${target.name} 님을 신고했습니다. 운영자 ${delivered}명에게 전달됐습니다.`
			: `🚨 ${target.name} 님을 신고했습니다. 다만 지금 접속한 운영자가 없어 전달되지 않았습니다.`
	);
}
