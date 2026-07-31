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

/*
 * 카드 화면만 표본을 지어내지 않고 도메인에서 그대로 가져온다.
 *
 * 나머지 장면의 표본(SEATS 등)은 "깨지기 쉬운 입력"을 일부러 만든 것이라
 * 지어낸 값이 맞다. 그런데 카드의 내용은 지어낼 수 있는 값이 아니다 —
 * 직업 12종의 설명은 ROLE_DEFS 하나에만 있어야 하고(Guide.ts가 그 규칙이다),
 * 여기에 옮겨 적으면 직업을 하나 고칠 때 고칠 곳이 둘이 된다. 그러면 미리보기가
 * 실제와 다른 글을 보여주면서도 아무 검사에 걸리지 않는다.
 *
 * node 24는 require()로 .ts를 그대로 읽는다(타입 제거). 별도 빌드 단계가
 * 필요 없어서 도구가 소스의 진실을 바로 본다.
 */
const { GUIDE_CARDS, roleBook } = require("../src/domain/Guide.ts");

/*
 * 정원과 강퇴 표수도 같은 이유로 가져온다. 여기에 8을 적어 두면 정원을
 * 12로 올린 다음에도 미리보기는 8명짜리 대기실만 보여준다 — 늘어난 인원에서
 * 레이아웃이 깨지는지 볼 수 없는데 검사는 통과한다.
 */
const { MAX_PLAYERS } = require("../src/constants/GameConfig.ts");
const { kickVotesNeeded } = require("../src/entities/Room.ts");
/* 정원은 이제 방마다 다르다. 미리보기도 그 차이를 그대로 보여줘야 한다 */
const { BLITZ_RULES, STANDARD_RULES } = require("../src/domain/RuleSet.ts");

/** 도감 12장. 첫 장(마피아)은 직업 공개 장면이 함께 쓴다 */
const BOOK = roleBook();

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

/**
 * 정원을 꽉 채운 대기실 좌석 목록.
 *
 * 정원이 12로 늘어난 뒤로는 이쪽이 대기실에서 가장 깨지기 쉬운 입력이다 —
 * 12줄이 위젯 높이를 넘어 본문이 스크롤되어야 하고, 강퇴 분모도 3이 아니라
 * 이 인원에서 계산된 값이 찍혀야 한다.
 */
const FULL_SEATS = [];
for (let num = 1; num <= MAX_PLAYERS; num++) {
	FULL_SEATS.push({
		id: `p${num}`,
		name: num === 5 ? "최지훈매우긴이름입니다" : `참가자${num}`,
		rank: `Lv.${num}`,
		runCount: num,
		ready: num % 3 !== 0,
		// 한 명은 강퇴 한 표 직전까지 몰려 있다
		kickCount: num === 7 ? kickVotesNeeded(MAX_PLAYERS) - 1 : 0,
	});
}

/** Assets.ts의 WidgetSize.CHAT / CHAT_BAR와 같은 값 */
const CHAT_SIZE = [330, 320];
const CHAT_BAR_SIZE = [190, 44];

/*
 * 컷은 fill 위젯이라 실제 화면에서는 100% × 100%가 된다(Widgets.ts의 layoutOf).
 * 여기 값은 검사기가 상자를 하나 만들기 위한 것으로, WidgetSize.CUT과 맞춰만 둔다.
 */
const CUT_SIZE = [480, 320];

/** Assets.ts의 WidgetSize.PROFILE과 같은 값 */
const PROFILE_SIZE = [300, 340];

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
			// 서버는 항상 배열을 채워 보낸다(buildMessage). 장면도 같아야
			// "표가 없을 때"와 "필드 자체가 없을 때"를 헷갈리지 않는다.
			rows: [],
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
				spectating: false,
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
				// 칩 문구는 서버(identityOf)가 고른다. 죽으면 직업이 아니라 "유령"이
				// 찍히므로 장면도 서버가 실제로 보내는 값을 그대로 쓴다
				role: "유령",
				team: "citizen",
				alive: false,
				note: "당신은 죽었습니다. 관전 중입니다.",
				deaths: ["☠️ 박민수 님이 죽었습니다.", "💖 의사가 누군가를 살려냈습니다."],
				spectating: false,
			},
		],
	},
	{
		label: "관전 — 게임 중 난입한 사람",
		file: "phase.html",
		size: [340, 300],
		messages: [
			{
				type: "init",
				phase: "day",
				turn: 1,
				total: 6,
				aliveCount: 5,
				timer: 40,
				role: "관전",
				team: "citizen",
				alive: false,
				note: "관전 중입니다. 이번 판이 끝나면 자리에 앉습니다.",
				deaths: ["☠️ 박민수 님이 죽었습니다."],
				// 이 한 값이 "관전 종료" 버튼을 띄운다. 관전자에게는 대기실
				// 위젯이 없어 이 버튼이 유일한 퇴장 경로다
				spectating: true,
			},
		],
	},
	{
		label: "카드 — 직업 공개",
		file: "card.html",
		size: [320, 400],
		messages: [{ type: "init", cards: [BOOK[0]], nav: "none", timer: 9, bookLink: false }],
	},
	{
		label: "카드 — 첫 안내 (3장)",
		file: "card.html",
		size: [320, 400],
		messages: [
			{ type: "init", cards: GUIDE_CARDS.slice(), nav: "steps", timer: 0, bookLink: true },
		],
	},
	{
		label: "카드 — 직업 도감 (12종)",
		file: "card.html",
		size: [360, 480],
		messages: [{ type: "init", cards: BOOK, nav: "grid", timer: 0, bookLink: false }],
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
			{ type: "progress", acted: 0, total: 3 },
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
			// 지목을 확정한 뒤까지 걸어본다. 여기까지 오지 않으면 격자를 물리는
			// 길(grid.locked)과 확정 표시가 한 번도 실행되지 않는다
			{ type: "progress", acted: 1, total: 3 },
			{ type: "selectResponse", num: 5 },
			{ type: "progress", acted: 2, total: 3 },
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
		label: "밤 지목 — 쪽지 문구 고르기(시민)",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 3,
				role: "시민",
				team: "citizen",
				alive: true,
				prompt: "쪽지를 보낼 대상을 선택하세요. 게임당 한 번입니다.",
				seats: SEATS,
				timer: 22,
				note: "🌙 밤에는 채팅을 할 수 없습니다.",
			},
			// 두 번째 화면까지 걸어본다. 여기까지 오지 않으면 문구 목록을 그리는
			// 길과 그것을 다시 치우는 길이 한 번도 실행되지 않는다
			{
				type: "phrases",
				num: 5,
				options: [
					"당신을 믿습니다",
					"당신이 의심됩니다",
					"오늘은 조용히 계세요",
					"내일 나서 주세요",
					"저에게 투표하지 마세요",
					"우리 편이라면 신호를 주세요",
				],
			},
			{ type: "selectResponse", num: 5 },
		],
		// 예외가 없다는 것만으로는 문구 목록이 그려졌는지 알 수 없다. 마지막
		// 문구의 버튼을 세면 여섯 개가 다 그려졌는지가 확인된다.
		//
		// 확정 표시(.picked)로는 셀 수 없다. check-widgets.js의 선택자는
		// 파싱된 노드의 class 속성을 읽는데 classList.add는 엘리먼트 스텁의
		// Set만 고치고 그 속성을 되쓰지 않는다 — 실행 중에 붙은 class는
		// querySelectorAll에 잡히지 않는다(.picked로 1을 기대하면 0이 나온다)
		expect: { 'button[data-index="5"]': 1 },
	},
	{
		// 위와 같은 장면인데 끝에 init이 한 번 더 온다. 밤마다 위젯을 새로
		// 열지만 열린 채로 init이 다시 오는 길이 있고(재접속·화면 복구),
		// 그때 지난밤의 문구 목록을 치우는 것이 init의 두 줄이다.
		//
		// 그 두 줄은 게임 화면에 흔적을 남기지 않아서 지워도 아무 장면이
		// 빨개지지 않는다 — 위 장면은 phrases에서 끝나므로 청소를 한 번도
		// 밟지 않는다. 지우면 지난밤 문구가 격자 대신 뜬 채로 밤이 시작된다
		label: "밤 지목 — 지난밤 문구 목록은 다시 열 때 치운다",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 3,
				role: "시민",
				team: "citizen",
				alive: true,
				prompt: "쪽지를 보낼 대상을 선택하세요. 게임당 한 번입니다.",
				seats: SEATS,
				timer: 22,
				note: "🌙 밤에는 채팅을 할 수 없습니다.",
			},
			{
				type: "phrases",
				num: 5,
				options: [
					"당신을 믿습니다",
					"당신이 의심됩니다",
					"오늘은 조용히 계세요",
					"내일 나서 주세요",
					"저에게 투표하지 마세요",
					"우리 편이라면 신호를 주세요",
				],
			},
			// 둘째 밤
			{
				type: "init",
				myNum: 3,
				role: "시민",
				team: "citizen",
				alive: true,
				prompt: "쪽지를 보낼 대상을 선택하세요. 게임당 한 번입니다.",
				seats: SEATS,
				timer: 22,
				note: "🌙 밤에는 채팅을 할 수 없습니다.",
			},
		],
		// 위 장면이 1을 기대하는 그 버튼이 여기서는 0이어야 한다. 두 장면이
		// 짝이라서, 청소를 지우면 이쪽이 6을 세고 빨개진다
		expect: { 'button[data-index="5"]': 0 },
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
				note: "능력을 쓸 수 있는 횟수를 다 썼습니다. 이번 밤은 지켜보세요.",
				deaths: [],
				spectating: false,
			},
		],
	},
	{
		label: "밤 지목 — 혼자인 마피아팀(짐승인간)",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 6,
				role: "짐승인간",
				team: "mafia",
				alive: true,
				prompt: "물어 죽일 대상을 선택하세요.",
				seats: SEATS,
				timer: 22,
				// 마피아 팀이지만 밀담 상대가 없다 — 채팅에 🔪 탭이 생기지 않는다
				note: "🌙 당신은 마피아 팀이지만 마피아와 대화할 수 없습니다.",
			},
			// 분모가 0인 순간. 인원이 갈리면 실제로 나올 수 있는 값이고,
			// 나누기 전에 걸러내지 않으면 막대 폭이 NaN%가 된다
			{ type: "progress", acted: 0, total: 0 },
		],
	},
	{
		label: "투표 — 3/5 진행 중",
		file: "vote.html",
		size: [340, 380],
		messages: [
			{ type: "init", myNum: 4, seats: SEATS, timer: 17, picked: 0 },
			{ type: "progress", voted: 3, alive: 5 },
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
			// setID에는 정원도 강퇴 표수도 없다. 정원은 어느 방에 앉았는지가,
			// 강퇴 표수는 지금 인원이 정하는데 이 메시지는 방을 고르기 전에
			// 한 번만 나간다. 둘 다 좌석 목록(init)에 실린다
			{ type: "setID", id: "p1" },
			{
				type: "updatePlayerCount",
				data: {
					1: { count: 3, started: false, watching: 0, max: STANDARD_RULES.maxPlayers },
					2: { count: 0, started: false, watching: 0, max: STANDARD_RULES.maxPlayers },
					// 진행 중인 방. 이제 disabled가 아니라 관전 버튼이다
					3: { count: 8, started: true, watching: 2, max: STANDARD_RULES.maxPlayers },
					// 정원까지 찬 방. 이쪽만 눌리지 않는다
					4: { count: MAX_PLAYERS, started: false, watching: 0, max: STANDARD_RULES.maxPlayers },
					// 정원이 더 작은 모드. 같은 8명인데 3번 방은 아직 자리가
					// 있고 이 방은 가득 찼다 — 전역값 하나로 그리던 동안에는
					// 여기가 "8/12"로 보였고, 눌러 보면 튕겼다
					6: {
						count: BLITZ_RULES.maxPlayers,
						started: false,
						watching: 0,
						max: BLITZ_RULES.maxPlayers,
					},
				},
			},
		],
	},
	{
		label: "대기실 — 방 안에서 준비",
		file: "lobby.html",
		size: [360, 440],
		messages: [
			{ type: "setID", id: "p1" },
			{
				type: "init",
				kickVotes: kickVotesNeeded(3),
				minPlayers: STANDARD_RULES.minPlayers,
				maxPlayers: STANDARD_RULES.maxPlayers,
				data: [
					{ id: "p1", name: "김철수", rank: "Lv.12", runCount: 2, ready: true, kickCount: 0 },
					// 운영자·비로그인 유저는 레벨 대신 칭호가 그대로 들어온다.
					// 위젯이 "Lv."를 덧붙이지 않는지 이 두 줄이 지킨다.
					{ id: "p2", name: "이영희", rank: "운영자", runCount: 0, ready: false, kickCount: 1 },
					{ id: "p3", name: "박민수", rank: "비로그인 유저", runCount: 9, ready: true, kickCount: 0 },
				],
			},
		],
	},
	{
		label: `대기실 — 정원 ${MAX_PLAYERS}명`,
		file: "lobby.html",
		size: [360, 440],
		messages: [
			{ type: "setID", id: "p1" },
			{
				type: "init",
				kickVotes: kickVotesNeeded(MAX_PLAYERS),
				minPlayers: STANDARD_RULES.minPlayers,
				maxPlayers: STANDARD_RULES.maxPlayers,
				data: FULL_SEATS,
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
				focus: "",
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
				focus: "",
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
	/*
	 * 나 한 사람 앞으로 온 줄(ChatMessage.to)이 지나는 장면.
	 *
	 * 세 갈래가 전부 여기로 온다 — 받은 귓속말(USER), 내가 보낸 귓속말의 사본,
	 * 그리고 개인 안내(SYSTEM). 마지막 둘은 kind가 SYSTEM이라, to를 보지 않으면
	 * 흘려보내도 되는 잡담과 같은 글씨로 나간다. 실제로 그랬고 "귓속말이 안
	 * 보인다"는 말이 나왔다.
	 *
	 * 섞어 둔 두 줄(평범한 말 한 줄, 모두에게 가는 안내 한 줄)이 대조군이다.
	 * to가 없는 줄까지 개인 줄로 칠해지면 .pm 개수가 늘어 걸린다.
	 */
	{
		label: "채팅 — 귓속말과 개인 안내",
		file: "chat.html",
		size: CHAT_SIZE,
		// 눈으로만 보이던 차이를 검사기가 세는 자리 (check-widgets.js의 scene.expect)
		expect: { ".msg": 5, ".pm": 3 },
		messages: [
			{
				type: "init",
				channels: [tab("GLOBAL", { write: true })],
				active: "GLOBAL",
				quick: [],
				open: true,
				focus: "",
				myId: "p1",
				lines: [
					line(1, {
						channel: "GLOBAL",
						senderId: "p3",
						num: 3,
						name: "박민수",
						text: "같이 하실 분 계신가요",
					}),
					line(2, {
						channel: "GLOBAL",
						senderId: "p3",
						num: 3,
						name: "박민수",
						to: "p1",
						text: "💌 혹시 한 자리 남았어요?",
					}),
					line(3, {
						channel: "GLOBAL",
						kind: "SYSTEM",
						to: "p1",
						text: "💌 박민수 님에게: 네 3번 방으로 오세요",
					}),
					line(4, {
						channel: "GLOBAL",
						kind: "SYSTEM",
						to: "p1",
						text: "🚫 조금 빠릅니다. 잠시 후 다시 보내세요.",
					}),
					line(5, { channel: "GLOBAL", kind: "NOTICE", text: "🎭 3번 방에서 게임이 시작되었습니다." }),
				],
			},
		],
	},
	/*
	 * 판이 끝난 직후. 표가 딸린 줄(ChatMessage.rows)이 지나는 유일한 장면이다.
	 *
	 * 바로 위에 같은 시각의 처형 안내를 함께 둔 것은 의도다 — 표에 시각을
	 * 붙이지 않기로 한 판단이 눈으로 확인되는 자리가 여기다.
	 */
	{
		label: "채팅 — 종료, 전원의 직업 공개",
		file: "chat.html",
		size: CHAT_SIZE,
		messages: [
			{
				type: "init",
				channels: [tab("ROOM", { write: true }), tab("GLOBAL", { write: false })],
				active: "ROOM",
				quick: ["잘했다", "한 판 더"],
				open: true,
				focus: "",
				myId: "p1",
				lines: [
					line(1, {
						kind: "EVENT",
						text: "☠️ 한가영 님이 처형당했습니다. 그는 마피아 팀이 아니었습니다.",
					}),
					line(2, {
						kind: "EVENT",
						text: "🔎 전원의 직업",
						rows: [
							{ label: "1. 송은율", value: "영매", tone: "citizen", dim: true },
							{ label: "2. 홍묘권", value: "마피아", tone: "mafia" },
							{ label: "3. 이재원", value: "경찰", tone: "citizen" },
							{ label: "4. 아주아주기이이인닉네임", value: "시민", tone: "citizen" },
							{ label: "5. 한가영 ☠️", value: "의사", tone: "citizen", dim: true },
						],
					}),
					line(3, {
						kind: "SYSTEM",
						text: "📖 채팅 명령어",
						rows: [
							{ label: "/도움말", value: "쓸 수 있는 명령어를 봅니다" },
							{ label: "/귓속말 <상대> <내용>", value: "한 사람에게만 말합니다" },
						],
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
				focus: "",
				myId: "p1",
				lines: [],
			},
		],
	},
	/*
	 * 게임 화면에서 /를 눌러 펼쳐진 직후. 접힌 위젯이 서버에 focus를 알리고
	 * 사라진 다음, 새로 뜬 위젯이 그 의도를 받아 입력창을 잡는 경로다.
	 * 눈으로는 보통 채팅창과 같아 보이지만 지나는 코드가 다르다.
	 */
	{
		label: "채팅 — 게임 화면에서 / 로 펼친 직후",
		file: "chat.html",
		size: CHAT_SIZE,
		messages: [
			{
				type: "init",
				channels: [tab("ROOM", { write: true }), tab("GLOBAL", { write: false })],
				active: "ROOM",
				quick: ["준비 완료", "잠깐만요"],
				open: true,
				focus: "command",
				myId: "p1",
				lines: [line(1, { channel: "ROOM", kind: "NOTICE", text: "/도움말 로 명령어를 봅니다." })],
			},
		],
	},
	/*
	 * 서버가 "이 줄은 ZEP 기본 채팅으로도 내보내라"고 답한 경우.
	 *
	 * 검사기는 부모 창에 ZEP 클라이언트의 webpack 내부를 흉내내 심어 둔다.
	 * 그래서 이 장면은 bridge.js가 실제로 연결을 찾아내 패킷을 쏘는 데까지
	 * 가고, 검사기가 그 패킷의 모양을 본다(check-widgets.js의 fakeZepClient).
	 *
	 * area는 서버가 정한 청중이다(ChatChannel의 zepAudienceFor). 위젯이
	 * 이 값을 그대로 chatAreaType으로 옮기지 않으면 방 토론이 맵 전체에 뜨고,
	 * 그 사고는 화면에 아무 흔적도 남기지 않는다 — 옆 방 사람 눈에만 보인다.
	 * 두 청중을 한 장면에서 함께 내보내 값이 섞이지 않는지도 본다.
	 */
	{
		label: "채팅 — 말풍선 지시",
		file: "chat.html",
		size: CHAT_SIZE,
		messages: [
			{
				type: "init",
				channels: [tab("ROOM", { write: true })],
				active: "ROOM",
				quick: [],
				open: true,
				focus: "",
				myId: "p1",
				lines: [],
			},
			{ type: "say", text: "3번이 수상해요", area: "PRIVATE_AREA" },
			{ type: "say", text: "같이 하실 분", area: "PUBLIC_AREA" },
			/*
			 * 청중을 빠뜨린 지시. 검사기는 이 줄에 대해 "아무것도 나가지 않아야
			 * 한다"를 기대한다(check-widgets.js).
			 *
			 * 위젯이 기본값으로 메꾸면 잊어버린 호출 하나가 조용히 맵 전체로
			 * 나간다. 청중을 정하는 판단은 서버에만 있어야 하므로, 값이 없을 때
			 * 위젯이 할 수 있는 유일하게 안전한 일은 침묵이다.
			 */
			{ type: "say", text: "청중이 없는 지시" },
		],
	},
	/*
	 * 전환 컷 네 장면.
	 *
	 * ms는 Cut.ts의 lengthOf(LEAD 1.2 + STEP 0.8 × 줄 수 + TAIL 0.8, 상한 6초)가
	 * 내는 값을 그대로 적는다. 위젯은 이 하나에서 모든 지연을 비율로 계산하므로
	 * 줄이 0개일 때(나눗셈)와 상한에 걸릴 때(줄이 잘리지 않는가) 둘 다 지나야 한다.
	 */
	{
		label: "컷 — 게임 시작 (제목만)",
		file: "cut.html",
		size: CUT_SIZE,
		messages: [{ type: "init", title: "🎭 게임 시작", lines: [], tone: "neutral", ms: 2000 }],
	},
	{
		label: "컷 — 밤 (앞선 처형 결과를 얹어서)",
		file: "cut.html",
		size: CUT_SIZE,
		messages: [
			{
				type: "init",
				title: "🌙 2번째 밤",
				lines: ["🗳️ 5번 최지훈매우긴이름입니다 님이 처형되었습니다."],
				tone: "night",
				ms: 2800,
			},
		],
	},
	{
		label: "컷 — 아침 (상한 6초에 걸리는 밤 사이 사건)",
		file: "cut.html",
		size: CUT_SIZE,
		messages: [
			{
				type: "init",
				title: "🌞 2번째 아침",
				lines: [
					"💀 3번 참가자3 님이 사망했습니다.",
					"💊 7번 참가자7 님이 치료되었습니다.",
					"🛡️ 2번 참가자2 님이 공격을 버텼습니다.",
					"🔫 4번 참가자4 님이 반격에 쓰러졌습니다.",
					"📰 특종: 1번 참가자1 님은 마피아입니다.",
					"🤐 6번 참가자6 님이 오늘 발언할 수 없습니다.",
				],
				tone: "day",
				ms: 6000,
			},
		],
	},
	{
		label: "컷 — 마피아 승리",
		file: "cut.html",
		size: CUT_SIZE,
		messages: [
			{
				type: "init",
				title: "🔪 마피아 승리",
				lines: ["마피아 수가 시민 수와 같아졌습니다."],
				tone: "mafia",
				ms: 2800,
			},
		],
	},

	/*
	 * 프로필 — 사람을 클릭했을 때.
	 *
	 * 세 장면이 서로 다른 길을 지난다.
	 *   1. 그림이 온 경우      → <img>를 건다
	 *   2. 게스트              → 전적 대신 안내 한 줄 (숫자가 영원히 0이다)
	 *   3. 자기 자신을 클릭     → 머리말이 "내 프로필"로 갈린다
	 * 전적 줄 수를 세는 이유는 서버가 보낸 목록을 위젯이 그대로 찍는지 보는
	 * 것이고(라벨·값 계약), 게스트에서 4줄이 나오면 0승 0패를 늘어놓은 것이다.
	 */
	{
		label: "프로필 — 남의 것 (전적 있음, 아주 긴 닉네임)",
		file: "profile.html",
		size: PROFILE_SIZE,
		messages: [
			{
				type: "init",
				name: "최지훈매우긴이름입니다",
				rank: "Lv.7",
				/*
				 * 서버가 조립해서 내려보내는 값(Profile.ts의 AVATAR_BASE).
				 * 없는 파일이라 미리보기에서는 onerror로 글리프로 되돌아간다 —
				 * 그 길도 실제로 일어나는 길이라 함께 본다.
				 */
				avatar: "https://cdn-static.zep.us/static/assets/baked-avartar-images/none.png",
				where: "3번 방 · 참가 중",
				stats: [
					{ label: "마피아", value: "3승 1패" },
					{ label: "시민", value: "12승 9패" },
					{ label: "참가", value: "25판" },
					{ label: "중도 이탈", value: "4판" },
				],
				self: false,
			},
		],
		expect: { ".stat": 4 },
	},
	{
		label: "프로필 — 게스트 (기록이 남지 않는 사람)",
		file: "profile.html",
		size: PROFILE_SIZE,
		messages: [
			{
				type: "init",
				name: "손님1234",
				rank: "비로그인 유저",
				// 비공개 API라 값이 없을 수 있다. 그때는 글리프로 그린다
				avatar: "",
				where: "대기실",
				stats: [{ label: "전적", value: "로그인하면 기록이 남습니다" }],
				self: false,
			},
		],
		expect: { ".stat": 1 },
	},
	{
		label: "프로필 — 자기 자신 (관전 중)",
		file: "profile.html",
		size: PROFILE_SIZE,
		messages: [
			{
				type: "init",
				name: "김철수",
				rank: "운영자",
				avatar: "",
				where: "5번 방 · 관전",
				stats: [
					{ label: "마피아", value: "0승 0패" },
					{ label: "시민", value: "1승 0패" },
					{ label: "참가", value: "1판" },
					{ label: "중도 이탈", value: "0판" },
				],
				self: true,
			},
		],
		expect: { ".stat": 4 },
	},
];

module.exports = { SCENES };
