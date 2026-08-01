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
import type { CardView } from "../types/Widget.types.ts";
import { showBook, showHelp } from "./Cards.ts";
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
	/** 도움말 목록에서 이름 앞에 서는 기호. 여덟 줄이 나란히 서면 이름만으로는 훑히지 않는다 */
	readonly glyph: string;
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
		glyph: "❓",
		/*
		 * 채팅 표가 아니라 겹쳐 뜨는 카드로 답한다.
		 *
		 * 표로 답했을 때의 문제는 그것이 로그의 한 줄이라는 데 있었다. 처음
		 * 온 사람이 도움말을 부르는 시점은 대기실이 가장 시끄러울 때라, 읽는
		 * 동안 새 발언이 쌓여 표가 위로 밀려 올라갔다. 도감과 같은 격자를 쓰면
		 * 목록이 제 스크롤을 갖고, 한 줄을 눌러 쓰는 법까지 볼 수 있다.
		 */
		run: (voice, player) => showHelp(player, helpCards(player)),
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
		help: "모든 직업의 설명을 봅니다",
		glyph: "📖",
		run: (voice, player) => showBook(player),
	},
	"/귓속말": {
		admin: false,
		args: "<상대> <할 말>",
		help: "한 사람에게만 보냅니다 (게임 밖에서만)",
		glyph: "💌",
		run: whisper,
	},
	"/차단": {
		admin: false,
		args: "<상대>",
		help: "그 사람의 발언을 내 화면에서 가립니다",
		glyph: "🚫",
		run: block,
	},
	"/차단해제": {
		admin: false,
		args: "<상대>",
		help: "차단을 풉니다",
		glyph: "🔓",
		run: unblock,
	},
	"/차단목록": {
		admin: false,
		args: "",
		help: "내가 차단한 사람을 봅니다",
		glyph: "📋",
		run: blockList,
	},
	"/신고": {
		admin: false,
		args: "<상대> [사유]",
		help: "접속한 운영자에게 알립니다",
		glyph: "🚨",
		run: report,
	},
	"/경험치": {
		admin: true,
		args: "",
		help: "경험치를 지급합니다 (운영자)",
		glyph: "⭐",
		run: (voice, player) => awardExp(player, ADMIN_EXP_GRANT),
	},
};

/**
 * 입력창 안에서만 통하는 조작. 도움말 뒤에 함께 붙는다.
 *
 * 지금까지 어디에도 적혀 있지 않았다. 셋 다 chat.html의 keydown 하나에만
 * 살아서, 우연히 눌러 본 사람만 알았다.
 *
 * 캔버스에서 통하는 것(Enter로 채팅 펴기, "/"로 명령어 시작)은 일부러 뺐다.
 * 그쪽은 ZEP이 키를 위젯에 넘겨주는지에 달려 있고(Parent.canReadKeys), 서버는
 * 그 답을 모른다 — 안 되는 조작을 적어두는 것은 안 적는 것보다 나쁘다.
 * 여기 셋은 입력창에 커서가 있는 동안의 일이라 언제나 통한다.
 */
const KEY_CARDS: CardView[] = [
	{
		glyph: "⌨",
		title: "Tab",
		team: null,
		summary: "탭을 차례로 옮깁니다",
		body: "입력창에서 Tab을 누르면 다음 탭으로 갑니다. Shift+Tab이면 이전 탭입니다.",
		note: "밤에는 탭이 넷까지 늘어납니다.",
	},
	{
		glyph: "⌨",
		title: "↑ ↓",
		team: null,
		summary: "방금 보낸 말을 다시 꺼냅니다",
		body: "입력창에서 ↑를 누르면 최근에 보낸 말이 차례로 올라옵니다. ↓로 되돌아옵니다.",
		note: "오타 하나 때문에 다시 치지 않아도 됩니다.",
	},
	{
		glyph: "⌨",
		title: "Esc",
		team: null,
		summary: "쓰던 글을 지우고, 한 번 더 누르면 나갑니다",
		body: "쓰던 글이 남아 있으면 먼저 비웁니다. 빈 칸에서 한 번 더 누르면 입력창에서 손을 떼고 이동 키가 다시 캐릭터에게 갑니다.",
		note: "두 걸음인 이유는 오타를 지우려다 창을 닫지 않게 하려는 것입니다.",
	},
];

/**
 * 도움말 카드 한 벌. 명령어 여덟 줄 뒤에 조작 세 줄.
 *
 * 카드를 여기서 만들어 Cards에 넘긴다. 반대로 하면(Cards가 COMMANDS를 읽으면)
 * 카드 위젯 쪽이 명령어 표를 알아야 하고, 운영자 명령을 감추는 판정까지
 * 그쪽으로 옮겨간다. 볼 자격을 아는 곳은 명령어 표를 가진 이 파일이다.
 */
function helpCards(player: ScriptPlayer): CardView[] {
	const cards: CardView[] = [];
	for (const name in COMMANDS) {
		if (!Object.prototype.hasOwnProperty.call(COMMANDS, name)) continue;
		const command = COMMANDS[name];
		if (command.admin && player.role < ADMIN_ROLE_LEVEL) continue;
		cards.push({
			glyph: command.glyph,
			// 목록의 이름 칸은 줄바꿈을 하지 않아서, 인자까지 넣으면 설명 칸을
			// 밀어낸다. 쓰는 법은 눌러서 들어간 화면(note)이 맡는다
			title: name,
			team: null,
			summary: command.help,
			body: command.help,
			note: command.args ? `쓰는 법 · ${name} ${command.args}` : "인자 없이 그냥 칩니다.",
		});
	}
	for (const card of KEY_CARDS) cards.push(card);
	return cards;
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

	// 정확히 같은 이름을 먼저 본다. 두 방식을 한 번에 재면 "김"이라는 사람과
	// "김철수"가 함께 있을 때, 정확히 지목당한 "김"이 "모호합니다"에 묻힌다
	const exact = playersNamed(token, true);
	if (exact.length > 0) return oneOf(voice, sender, token, exact, true);

	const partial = playersNamed(token, false);
	if (partial.length === 0) {
		voice.tell(sender, `"${token}"을(를) 찾지 못했습니다.`);
		return null;
	}
	return oneOf(voice, sender, token, partial, false);
}

/**
 * exact=false면 앞부분만 맞아도 센다.
 *
 * 긴 닉네임을 한 글자도 틀리지 않게 옮겨 적게 만들 이유가 없다. 특히 대기실에는
 * 참가 번호가 없어서(seatTarget 주석) 이름이 사람을 부르는 유일한 방법이다.
 *
 * startsWith가 아니라 indexOf인 것은 Jint에 그 메서드가 없기 때문이다.
 */
function playersNamed(token: string, exact: boolean): ScriptPlayer[] {
	const found: ScriptPlayer[] = [];
	for (const player of ScriptApp.players) {
		if (exact ? player.name === token : player.name.indexOf(token) === 0) found.push(player);
	}
	return found;
}

/** 목록에 이름을 몇 명까지 늘어놓을지. 넘치면 채팅 한 줄이 화면을 덮는다 */
const AMBIGUOUS_LIMIT = 5;

/**
 * 걸린 사람이 하나면 그 사람, 여럿이면 후보를 보여주고 null.
 *
 * 기존 안내는 "참가 번호로 지목하세요" 한 줄이었는데, 이 판정이 가장 자주
 * 일어나는 곳(대기실의 귓속말)에는 참가 번호가 아직 없다 — 번호는 게임이
 * 시작돼야 붙는다. 그래서 후보를 그대로 보여준다: 이름이 보이면 어느 쪽을
 * 더 적어야 할지 알 수 있다.
 */
function oneOf(
	voice: ChatVoice,
	sender: ScriptPlayer,
	token: string,
	matches: ScriptPlayer[],
	exact: boolean
): ScriptPlayer | null {
	if (matches.length === 1) {
		return matches[0].id === sender.id ? refuseSelf(voice, sender) : matches[0];
	}
	const names: string[] = [];
	for (let i = 0; i < matches.length && i < AMBIGUOUS_LIMIT; i++) names.push(matches[i].name);
	const more = matches.length > AMBIGUOUS_LIMIT ? ` 외 ${matches.length - AMBIGUOUS_LIMIT}명` : "";
	// 정확히 같은 이름이 여럿이면 이름으로는 영영 가릴 수 없다. 그 사실을
	// 숨기고 "이름을 더 적으세요"라고 하면 될 리 없는 일을 계속 시키게 된다
	const advice = exact
		? "닉네임이 같은 사람이 있어 이름으로는 가릴 수 없습니다. 참가 번호로 지목하세요."
		: "이름을 더 적거나 참가 번호로 지목하세요.";
	voice.tell(
		sender,
		`"${token}"에 걸리는 사람이 ${matches.length}명입니다: ${names.join(", ")}${more}\n${advice}`
	);
	return null;
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
	if (rest.indexOf(" ") < 0) {
		voice.tell(sender, "/귓속말 <상대> <할 말> 처럼 씁니다.");
		return;
	}
	const parts = splitTarget(rest);
	const target = resolveTarget(voice, sender, parts.token);
	if (!target) return;
	if (parts.body === "") {
		voice.tell(sender, "보낼 말을 적어주세요.");
		return;
	}
	voice.whisper(sender, target, parts.body);
}

/**
 * "<상대> <할 말>"을 가른다.
 *
 * 첫 칸에서 자르는 것으로는 모자란다. ZEP 닉네임에는 띄어쓰기가 들어갈 수 있고,
 * 받은 귓속말 줄의 답장 버튼(↩)은 상대 이름을 통째로 채워 넣는다 — 그 이름이
 * 두 낱말이면 첫 칸에서 자른 조각으로는 아무도 찾지 못한다. 버튼이 만든 명령이
 * 실패하는 것은 버튼이 없는 것보다 나쁘다.
 *
 * 접속자 이름 가운데 앞부분이 그대로 들어맞는 것이 있으면 가장 긴 것을 이름으로
 * 본다. 뒤에 공백이 와야 한다는 조건이 함께 있어야, "김"과 "김철수"가 같이
 * 있을 때 "김철수 안녕"의 이름을 "김"으로 잘라 엉뚱한 사람에게 "철수 안녕"을
 * 보내지 않는다.
 */
function splitTarget(rest: string): { token: string; body: string } {
	let name = "";
	for (const player of ScriptApp.players) {
		const candidate = player.name;
		if (candidate.length <= name.length) continue;
		if (rest.indexOf(candidate) !== 0) continue;
		if (rest.charAt(candidate.length) !== " ") continue;
		name = candidate;
	}
	// 이름을 못 알아봤으면 옛 규칙(첫 칸)으로 돌아간다. 부르는 쪽이 공백이
	// 있음을 이미 확인했으므로 여기서 -1이 나오지 않는다
	const cut = name !== "" ? name.length : rest.indexOf(" ");
	return {
		token: rest.slice(0, cut),
		body: rest
			.slice(cut + 1)
			.replace(/^\s+|\s+$/g, ""),
	};
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
