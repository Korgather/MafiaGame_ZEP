/*
 * 위젯 장면 표본: 서버가 실제로 보내는 것과 같은 모양의 payload.
 *
 * 두 도구가 같은 표본을 쓴다.
 *   - tools/preview-widgets.js : 눈으로 본다 (레이아웃·색·간격)
 *   - tools/check-widgets.js   : 기계가 본다 (콘솔 에러 0인가)
 *
 * 나눠 둔 이유는 하나다. 표본이 두 벌이면 갈라진다 — 한쪽에만 새 장면을
 * 넣으면 미리보기에는 보이는 화면이 검사에서는 한 번도 안 열린다.
 * 여기에 장면을 추가하면 두 도구가 동시에 그 장면을 본다.
 *
 * 표본은 일부러 까다롭게 잡았다 — 아주 긴 이름, 죽은 사람, 6명(격자가
 * 굳어 있던 인원수), 득표 0인 사람. 레이아웃이 깨지는 조건을 미리 본다.
 */

/** 이름이 길거나 죽었거나 — 레이아웃이 깨지기 쉬운 표본 */
const SEATS = [
	{ num: 1, name: "김철수", alive: true },
	{ num: 2, name: "이영희", alive: true, ally: true },
	{ num: 3, name: "박민수", alive: false },
	{ num: 4, name: "정수연", alive: true },
	{ num: 5, name: "최지훈매우긴이름입니다", alive: true },
	{ num: 6, name: "한가영", alive: true },
];

const REVEAL = [
	{ num: 1, name: "김철수", role: "시민", team: "citizen", alive: false },
	{ num: 2, name: "이영희", role: "마피아", team: "mafia", alive: true },
	{ num: 3, name: "박민수", role: "의사", team: "citizen", alive: false },
	{ num: 4, name: "정수연", role: "경찰", team: "citizen", alive: true },
	{ num: 5, name: "최지훈매우긴이름입니다", role: "스파이", team: "mafia", alive: true },
	{ num: 6, name: "한가영", role: "영매", team: "citizen", alive: false },
];

/** Assets.ts의 WidgetSize.CHAT / CHAT_BAR와 같은 값 */
const CHAT_SIZE = [330, 320];
const CHAT_BAR_SIZE = [190, 44];

/** ChatChannel.ts의 CHANNEL_DEFS와 같은 값 */
const CHANNEL_DEFS = {
	GLOBAL: { label: "전체", glyph: "🌐", placeholder: "전체에게 보내기" },
	ROOM: { label: "방", glyph: "💬", placeholder: "같은 방 사람들에게" },
	MAFIA: { label: "마피아", glyph: "🔪", placeholder: "마피아 팀에게만" },
	GHOST: { label: "유령", glyph: "👻", placeholder: "죽은 사람들에게" },
};

/** channelViews()가 만드는 탭 하나 */
function tab(id, over) {
	const def = CHANNEL_DEFS[id];
	return Object.assign(
		{ id, label: def.label, glyph: def.glyph, write: false, unread: 0, placeholder: def.placeholder },
		over
	);
}

/**
 * buildMessage()가 만드는 한 줄.
 *
 * 시각을 epoch로 박아 둔다 — Date.now()를 쓰면 실행할 때마다 미리보기가
 * 달라져서 "화면이 바뀌었나"와 "시계가 흘렀나"를 구분할 수 없다.
 */
const CHAT_T0 = Date.UTC(2026, 0, 1, 12, 34, 0);

function line(seq, over) {
	return Object.assign(
		{
			seq,
			channel: "ROOM",
			kind: "USER",
			senderId: "",
			num: 0,
			name: "",
			role: "",
			team: "",
			text: "",
			at: CHAT_T0 + seq * 9000,
			to: "",
		},
		over
	);
}

/**
 * 한 장면 = 위젯 파일 + 서버가 보내는 메시지들.
 *
 * `messages`는 실제 순서 그대로다. 첫 번째가 위젯을 여는 payload이고,
 * 뒤따르는 것들은 열려 있는 위젯에 나중에 오는 것들(진행률·채팅)이다.
 */
const SCENES = [
	{
		label: "밤 — 능력 없는 직업",
		file: "phase.html",
		size: [340, 300],
		messages: [
			{
				type: "init",
				phase: "night",
				turn: 2,
				total: 6,
				aliveCount: 5,
				timer: 22,
				role: "정치인",
				team: "citizen",
				alive: true,
				note: "밤입니다. 능력이 있는 직업은 대상을 지목하세요.",
				deaths: [],
			},
		],
	},
	{
		label: "아침 — 유령이 보는 화면 + 밤 결과",
		file: "phase.html",
		size: [340, 300],
		messages: [
			{
				type: "init",
				phase: "day",
				turn: 2,
				total: 6,
				aliveCount: 4,
				timer: 40,
				role: "경찰",
				team: "citizen",
				alive: false,
				note: "당신은 죽었습니다. 관전 중입니다.",
				deaths: ["☠️ 박민수 님이 죽었습니다.", "💖 의사가 누군가를 살려냈습니다."],
			},
		],
	},
	{
		label: "직업 카드 — 마피아",
		file: "roleCard.html",
		size: [340, 380],
		messages: [
			{
				type: "init",
				role: "마피아",
				team: "mafia",
				glyph: "🔪",
				ability: "밤마다 한 명을 지목해 제거할 수 있습니다.",
				tip: "낮에는 시민인 척하며 의심을 다른 사람에게 돌리세요.",
				timer: 9,
			},
		],
	},
	{
		label: "밤 지목 — 마피아",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 2,
				role: "마피아",
				team: "mafia",
				alive: true,
				prompt: "제거할 대상을 고르세요",
				seats: SEATS,
				timer: 22,
				note: "🌙 동료와의 대화는 채팅창의 🔪 탭에서 합니다.",
			},
		],
	},
	{
		label: "밤 지목 — 채팅 없는 직업(의사)",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 4,
				role: "의사",
				team: "citizen",
				alive: true,
				prompt: "살릴 대상을 고르세요",
				seats: SEATS,
				timer: 22,
				note: "밤마다 한 명을 지목해 마피아의 공격에서 살릴 수 있습니다.",
			},
		],
	},
	{
		label: "밤 지목 — 1회성 능력(자경단원)",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 1,
				role: "자경단원",
				team: "citizen",
				alive: true,
				prompt: "처단할 대상을 고르세요 (게임당 한 번)",
				seats: SEATS,
				timer: 22,
				note: "게임당 한 번, 한 명을 죽일 수 있습니다. 시민을 죽이면 자책하여 함께 죽습니다.",
			},
		],
	},
	{
		label: "밤 — 능력을 이미 쓴 직업",
		file: "phase.html",
		size: [340, 300],
		messages: [
			{
				type: "init",
				phase: "night",
				turn: 3,
				total: 6,
				aliveCount: 4,
				timer: 22,
				role: "자경단원",
				team: "citizen",
				alive: true,
				note: "능력은 게임당 한 번뿐이고 이미 사용했습니다. 이번 밤은 지켜보세요.",
				deaths: [],
			},
		],
	},
	{
		label: "밤 지목 — 혼자인 마피아팀(건달)",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 6,
				role: "건달",
				team: "mafia",
				alive: true,
				prompt: "협박할 대상을 고르세요",
				seats: SEATS,
				timer: 22,
				// 마피아 팀이지만 밀담 상대가 없다 — 채팅에 🔪 탭이 생기지 않는다
				note: "당신은 마피아 팀이지만 동료와 대화할 수 없습니다.",
			},
		],
	},
	{
		label: "투표 — 3/5 진행 중",
		file: "vote.html",
		size: [340, 380],
		messages: [
			{ type: "init", myNum: 4, seats: SEATS, timer: 17, picked: 0, silenced: false },
			{ type: "progress", voted: 3, alive: 5 },
		],
	},
	{
		label: "투표 — 협박당해 잠긴 화면",
		file: "vote.html",
		size: [340, 380],
		messages: [
			{ type: "init", myNum: 4, seats: SEATS, timer: 17, picked: 0, silenced: true },
			{ type: "progress", voted: 2, alive: 4 },
		],
	},
	{
		label: "개표 — 처형 발생",
		file: "vote.html",
		size: [340, 380],
		messages: [
			{
				type: "result",
				myNum: 4,
				seats: SEATS.map((seat, i) => ({ ...seat, votes: [1, 3, 0, 0, 1, 0][i] })),
				executed: 2,
				message: "☠️ 이영희 님이 처형되었습니다.",
				timer: 7,
			},
		],
	},
	{
		label: "결과 — 진 쪽이 보는 화면",
		file: "gameOver.html",
		size: [340, 460],
		messages: [
			{
				type: "init",
				winner: "mafia",
				team: "citizen",
				reason: "마피아 수가 시민 수와 같아졌습니다.",
				timer: 14,
				players: REVEAL,
			},
		],
	},
	{
		label: "대기실 — 방 고르기",
		file: "lobby.html",
		size: [360, 440],
		messages: [
			{ type: "setID", id: "p1", minPlayers: 4, maxPlayers: 8, kickVotes: 3 },
			{
				type: "updatePlayerCount",
				data: {
					1: { count: 3, started: false },
					2: { count: 0, started: false },
					3: { count: 8, started: true },
					4: { count: 1, started: false },
				},
			},
		],
	},
	{
		label: "대기실 — 방 안에서 준비",
		file: "lobby.html",
		size: [360, 440],
		messages: [
			{ type: "setID", id: "p1", minPlayers: 4, maxPlayers: 8, kickVotes: 3 },
			{
				type: "init",
				data: [
					{ id: "p1", name: "김철수", level: "Lv.12", runCount: 2, ready: true, kickCount: 0 },
					{ id: "p2", name: "이영희", level: "Lv.3", runCount: 0, ready: false, kickCount: 1 },
					{ id: "p3", name: "박민수", level: "Lv.30", runCount: 9, ready: true, kickCount: 0 },
				],
			},
		],
	},
	{
		label: "채팅 — 밤, 마피아 탭 (방 탭에 미확인 3)",
		file: "chat.html",
		size: CHAT_SIZE,
		messages: [
			{
				type: "init",
				channels: [
					tab("MAFIA", { write: true }),
					tab("ROOM", { write: false, unread: 3 }),
					tab("GLOBAL", { write: false }),
				],
				active: "MAFIA",
				quick: ["1번 어때?", "나 아니야", "조용히 가자"],
				open: true,
				myId: "p2",
				lines: [
					line(1, { channel: "ROOM", kind: "SYSTEM", text: "🌙 2번째 밤이 되었습니다." }),
					line(2, {
						channel: "MAFIA",
						senderId: "p5",
						num: 5,
						name: "최지훈매우긴이름입니다",
						role: "스파이",
						team: "mafia",
						text: "4번 어때? 아까부터 조용한데",
					}),
					line(3, {
						channel: "MAFIA",
						senderId: "p2",
						num: 2,
						name: "이영희",
						role: "마피아",
						team: "mafia",
						text: "의사가 붙어 있을 거 같은데 6번 가자",
					}),
					line(4, {
						channel: "MAFIA",
						kind: "SYSTEM",
						to: "p2",
						text: "지목이 접수되었습니다. 남은 시간 동안 바꿀 수 있습니다.",
					}),
				],
			},
			// 열려 있는 위젯에 나중에 오는 것들. drawBadges()가 지나는 길이다
			{
				type: "line",
				line: line(5, { channel: "ROOM", kind: "EVENT", text: "☠️ 박민수 님이 죽었습니다." }),
				channels: [
					tab("MAFIA", { write: true }),
					tab("ROOM", { write: false, unread: 4 }),
					tab("GLOBAL", { write: false }),
				],
			},
			{
				type: "channels",
				channels: [tab("ROOM", { write: true }), tab("GLOBAL", { write: false })],
				active: "ROOM",
				quick: ["1번 수상해", "나 아니야"],
			},
		],
	},
	{
		label: "채팅 — 낮, 죽은 사람이 보는 화면",
		file: "chat.html",
		size: CHAT_SIZE,
		messages: [
			{
				type: "init",
				channels: [
					tab("GHOST", { write: true }),
					tab("ROOM", { write: false, unread: 12 }),
					tab("GLOBAL", { write: false }),
				],
				active: "GHOST",
				quick: ["아까 그 사람 수상해", "아쉽다", "잘 봐 둬"],
				open: true,
				myId: "p3",
				lines: [
					line(1, { channel: "GHOST", kind: "SYSTEM", text: "👻 박민수 님이 유령이 되었습니다." }),
					line(2, {
						channel: "GHOST",
						senderId: "p6",
						num: 6,
						name: "한가영",
						role: "영매",
						team: "citizen",
						text: "누가 죽였는지 봤어?",
					}),
					line(3, {
						channel: "GHOST",
						senderId: "p3",
						num: 3,
						name: "박민수",
						role: "의사",
						team: "citizen",
						text: "5번이 계속 말 돌리는 거 이상했음",
					}),
				],
			},
		],
	},
	{
		label: "채팅 — 접은 바 (미확인 있음)",
		file: "chat.html",
		size: CHAT_BAR_SIZE,
		messages: [
			{
				type: "init",
				channels: [tab("ROOM", { write: true, unread: 7 }), tab("GLOBAL", { write: false })],
				active: "ROOM",
				quick: [],
				open: false,
				myId: "p1",
				lines: [],
			},
		],
	},
];

module.exports = { SCENES };
