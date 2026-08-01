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
 * 화면에 찍히는 글은 지어내지 않고 도메인에서 그대로 가져온다.
 *
 * 좌석 표본(SEATS 등)은 "깨지기 쉬운 입력"을 일부러 만든 것이라 지어낸 값이
 * 맞다. 그런데 글은 지어낼 수 있는 값이 아니다 — 직업의 설명과 지목 안내는
 * ROLE_DEFS 하나에만 있어야 하고(Guide.ts가 그 규칙이다), 여기에 옮겨 적으면
 * 직업을 하나 고칠 때 고칠 곳이 둘이 된다. 그러면 미리보기가 실제와 다른
 * 글을 보여주면서도 아무 검사에 걸리지 않는다.
 *
 * 실제로 그랬다. 마피아·의사·자경단원의 지목 안내가 여기에 옛 문장으로
 * 남아 있었고("제거할 대상을 고르세요" 등), 밤 안내는 코드에서 이미 지워진
 * 문장("능력이 있는 직업은 대상을 지목하세요")을 그대로 보여주고 있었다.
 *
 * node 24는 require()로 .ts를 그대로 읽는다(타입 제거). 별도 빌드 단계가
 * 필요 없어서 도구가 소스의 진실을 바로 본다.
 */
const { GUIDE_CARDS, roleBook } = require("../src/domain/Guide.ts");
const { ROLE_DEFS } = require("../src/domain/Roles.ts");
const { Role } = require("../src/types/Game.types.ts");
const { nightActionBlockedReason } = require("../src/domain/NightResolution.ts");
const { QUICK_NOTE, QUICK_SILENCE_DAY } = require("../src/domain/chat/QuickPhrases.ts");

/*
 * 정원과 강퇴 표수도 같은 이유로 가져온다. 여기에 8을 적어 두면 정원을
 * 12로 올린 다음에도 미리보기는 8명짜리 대기실만 보여준다 — 늘어난 인원에서
 * 레이아웃이 깨지는지 볼 수 없는데 검사는 통과한다.
 */
const { MAX_PLAYERS } = require("../src/constants/GameConfig.ts");
const { kickVotesNeeded } = require("../src/entities/Room.ts");
/* 정원은 이제 방마다 다르다. 미리보기도 그 차이를 그대로 보여줘야 한다 */
const { BLITZ_RULES, STANDARD_RULES } = require("../src/domain/RuleSet.ts");

/** 도감 전부. 첫 장(마피아)은 직업 공개 장면이 함께 쓴다 */
const BOOK = roleBook();

/**
 * 밤 지목 화면이 실제로 받는 값.
 *
 * Night.ts의 openRoleAction이 이 네 값을 전부 ROLE_DEFS에서 그대로 꺼내
 * 보낸다(prompt는 nightPrompt, note는 nightNotice). 여기서도 같은 자리에서
 * 꺼내야 문구를 다듬은 순간 미리보기가 따라 바뀐다.
 */
/**
 * 산 사람의 신분 줄.
 *
 * identityOf(Widgets.ts)가 좌석에서 조립하는 것과 같은 다섯 값이다. 화면 위쪽
 * 한 줄에 늘 붙어 있고, 이제 다섯 위젯이 전부 이것을 받는다(Identity를 상속한
 * 페이로드 넷 + PhasePayload).
 *
 * glyph와 abilityLine을 빠뜨려도 위젯은 그려진다 — 기호 자리가 비고 능력 줄이
 * 빈 칸이 된다. 그래서 미리보기에서만 조용히 빠져 있기 쉬운 값이고, 한 곳에서
 * 꺼내는 것이 그걸 막는 유일한 방법이다.
 */
function idOf(role) {
	const def = ROLE_DEFS[role];
	return {
		role: def.displayName,
		team: def.team,
		alive: true,
		glyph: def.glyph,
		abilityLine: def.summary,
	};
}

function nightAction(role) {
	const def = ROLE_DEFS[role];
	return {
		...idOf(role),
		prompt: def.nightPrompt || "",
		// Night.ts가 실어 보내는 두 값이다. 여기서 빠뜨리면 미리보기의 격자만
		// 서버와 다른 규칙으로 잠긴다 — 실제로 무덤을 고르는 직업의 화면이
		// 미리보기에서는 전부 잠긴 채로 그려지고 있었다
		noSelf: def.noSelfTarget === true,
		targetsDead: def.targetsDead === true,
		note: def.nightNotice,
	};
}

/**
 * 격자 없이 밤 화면만 보는 사람이 받는 안내.
 *
 * Night.ts의 nightNote가 이 함수 하나로 이유를 고른다. 문장을 여기 적어 두면
 * 조건이 바뀐 뒤에도 미리보기는 옛 이유를 계속 보여준다 — 실제로 여기에는
 * 코드에서 이미 사라진 문장이 남아 있었다.
 */
function noTurnNote(role, over) {
	// borrowedRole은 생략할 수 없다. 안내 문구를 고르는 쪽이 effectiveDef로
	// "이번 밤에 실제로 들고 있는 능력"을 묻기 때문에, 빠지면 undefined를
	// 직업 표에 넣고 미리보기 빌드가 그 자리에서 죽는다
	const seat = Object.assign(
		{ role, alive: true, usedSkill: false, usesSpent: 0, borrowedRole: null },
		over
	);
	return { ...idOf(role), note: nightActionBlockedReason(seat, 0) };
}

/** 이름이 길거나 죽었거나 — 레이아웃이 깨지기 쉬운 표본 */
const SEATS = [
	{ num: 1, name: "김철수", alive: true },
	{ num: 2, name: "이영희", alive: true, ally: true },
	{ num: 3, name: "박민수", alive: false },
	{ num: 4, name: "정수연", alive: true },
	{ num: 5, name: "최지훈매우긴이름입니다", alive: true },
	{ num: 6, name: "한가영", alive: true },
];

/**
 * 최대 인원. 진행 화면의 번호 줄이 한 줄에 들어가지 않는 유일한 표본이다.
 *
 * 이름을 손으로 적지 않는 것은 이 표본을 쓰는 화면이 num과 alive만 읽기
 * 때문이다(phase.html의 paintRoster). 죽은 번호를 5·10·11·12에 흩어 두면
 * 취소선이 줄의 가운데와 끝에 함께 나타난다 — 접히는 자리가 어디든 한쪽
 * 층에는 죽은 칸이 있다.
 */
const MANY_SEATS = [];
for (let i = 1; i <= 12; i++) {
	MANY_SEATS.push({ num: i, name: `${i}번 참가자`, alive: i !== 5 && i < 10 });
}

/**
 * 종료 화면의 직업 공개 한 줄(RevealView).
 *
 * 이름과 기호를 ROLE_DEFS에서 꺼낸다 — Room.revealViews가 그렇게 만든다.
 * 손으로 적으면 기호를 바꾼 순간 미리보기만 옛 그림을 계속 보여준다.
 *
 * team은 따로 받는다. 판이 끝난 시점의 진영은 직업표의 값과 다를 수 있다 —
 * 스파이는 접선하면 마피아로 넘어가고, 도굴꾼은 남의 직업을 물려받는다.
 */
function reveal(num, name, role, alive, team) {
	const def = ROLE_DEFS[role];
	return { num, name, role: def.displayName, glyph: def.glyph, team: team || def.team, alive };
}

const REVEAL = [
	reveal(1, "김철수", Role.CITIZEN, false),
	reveal(2, "이영희", Role.MAFIA, true),
	reveal(3, "박민수", Role.DOCTOR, false),
	reveal(4, "정수연", Role.POLICE, true),
	// 접선을 끝낸 스파이. 직업표에는 시민으로 적혀 있지만 판이 끝난 진영은 마피아다
	reveal(5, "최지훈매우긴이름입니다", Role.SPY, true, "mafia"),
	reveal(6, "한가영", Role.SHAMAN, false),
];

/**
 * 서버가 glyph를 아직 보내지 않던 시절의 같은 목록.
 *
 * 위젯은 기호 자리를 비워 두고 이름만 그린다. 필드를 새로 늘릴 때마다
 * "안 보내면 어떻게 되는가"를 한 장면으로 남겨 둔다 — 위젯과 서버는 함께
 * 배포되지 않고, 옛 서버가 새 위젯에 말을 거는 순간이 반드시 있다.
 */
const REVEAL_NO_GLYPH = REVEAL.map(row => ({
	num: row.num,
	name: row.name,
	role: row.role,
	team: row.team,
	alive: row.alive,
}));

/*
 * 죽은 사람과 관전자의 신분 줄.
 *
 * 서버가 조립하는 것과 같은 값이다 — 유령은 identityOf(Widgets.ts)의 죽은
 * 분기, 관전은 spectateView(Lobby.ts)가 손으로 적는 세 값이다. 직업 이름과
 * 기호는 ROLE_DEFS에서 꺼내 오는데 이 둘은 그럴 수 없다. 직업이 아니라서
 * 직업표에 자리가 없고, 서버 쪽 상수는 내보내지 않는다.
 *
 * 능력 줄이 특히 중요하다. 죽으면 서버가 직업을 감추는데(role이 "유령"으로
 * 바뀐다) 능력 줄만 남으면 그 한 줄이 직업을 그대로 불어 버린다.
 */
const GHOST = {
	role: "유령",
	team: "citizen",
	alive: false,
	glyph: "👻",
	abilityLine: "유령끼리 이야기할 수 있습니다",
};
const SPECTATOR = {
	role: "관전",
	team: "citizen",
	alive: false,
	glyph: "👁",
	abilityLine: "볼 수만 있습니다",
};

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

/** Assets.ts의 WidgetSize.JUDGEMENT와 같은 값 */
const JUDGEMENT_SIZE = [380, 320];

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
		{
			id,
			label: def.label,
			glyph: def.glyph,
			write: false,
			unread: 0,
			placeholder: def.placeholder,
		},
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
				seats: SEATS,
				timer: 22,
				...noTurnNote(Role.POLITICIAN),
				alive: true,
				// 이 밤에 누를 것이 없는 산 사람. 낮을 준비하며 기다리는 것이 할 일이다
				lead: "기다리세요",
				deaths: [],
				spectating: false,
				// 밤에는 조절할 토론 시간이 없다
				timeVote: false,
			},
		],
	},
	/*
	 * 낮의 토론 시간 조절.
	 *
	 * 이 장면이 없으면 ±15초 묶음은 어느 화면에서도 그려지지 않는다 —
	 * 다른 낮 장면은 전부 죽었거나 관전이라 서버가 timeVote: false를 준다.
	 *
	 * timer 메시지까지 이어 붙인 이유는 그 갈래가 여기에만 있기 때문이다.
	 * 위젯은 평소 자기 시계를 돌리고, 서버가 남은 시간을 되보내는 경우는
	 * 누군가 ±15초를 눌렀을 때 하나뿐이다.
	 */
	{
		label: "낮 — 토론 시간 조절 (쓰고 나면 사라진다)",
		file: "phase.html",
		size: [340, 300],
		messages: [
			{
				type: "init",
				phase: "day",
				turn: 2,
				total: 6,
				aliveCount: 5,
				seats: SEATS,
				timer: 75,
				...idOf(Role.POLICE),
				lead: "토론하세요",
				note: "토론 시간입니다.",
				deaths: [],
				spectating: false,
				timeVote: true,
			},
			// 옆사람이 15초를 늘렸다. 나는 아직 안 썼으므로 버튼은 남는다
			{ type: "timer", timer: 90, timeVote: true },
			// 이번엔 내가 썼다. 여기서 묶음이 사라진다
			{ type: "timer", timer: 75, timeVote: false },
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
				seats: SEATS,
				timer: 40,
				// 칩 문구는 서버(identityOf)가 고른다. 죽으면 직업이 아니라 "유령"이
				// 찍히므로 장면도 서버가 실제로 보내는 값을 그대로 쓴다
				...GHOST,
				lead: "지켜보세요",
				note: "당신은 죽었습니다. 관전 중입니다.",
				deaths: ["☠️ 박민수 님이 죽었습니다.", "💖 의사가 누군가를 살려냈습니다."],
				spectating: false,
				// 유령은 토론 시간을 조절하지 못한다
				timeVote: false,
			},
		],
		// 판 바깥 표시. alive: false 하나로 붙으므로 관전자도 같은 값을 받는다
		expect: { ".panel.watching": 1 },
	},
	/*
	 * 열두 명.
	 *
	 * 번호 줄이 한 줄에 들어가지 않는 유일한 장면이다. 접힌 층이 머리말이나
	 * 타이머를 밀어내지 않는지 — .stage가 flex: 1 1 auto라 무대에서 가져가야
	 * 한다 — 여기서만 눈으로 볼 수 있다.
	 *
	 * expect가 세는 것은 두 가지다. 칸이 인원수만큼 있는가(12), 그리고 죽은
	 * 칸이 죽은 사람 수만큼인가(4). 뒤쪽이 없으면 취소선 규칙이 지워져도
	 * 미리보기는 멀쩡한 줄을 계속 보여준다.
	 */
	{
		label: "낮 — 열두 명, 번호 줄이 접힌다",
		file: "phase.html",
		size: [340, 300],
		messages: [
			{
				type: "init",
				phase: "day",
				turn: 4,
				total: 12,
				aliveCount: 8,
				seats: MANY_SEATS,
				timer: 96,
				...idOf(Role.CITIZEN),
				lead: "토론하세요",
				note: "투표 전까지 이야기를 나누세요.",
				deaths: ["☠️ 10번 참가자가 죽었습니다."],
				spectating: false,
				timeVote: true,
			},
		],
		expect: { ".roster i": 12, ".roster i.gone": 4, ".panel.watching": 0 },
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
				seats: SEATS,
				timer: 40,
				...SPECTATOR,
				lead: "지켜보세요",
				note: "관전 중입니다. 이번 판이 끝나면 자리에 앉습니다.",
				deaths: ["☠️ 박민수 님이 죽었습니다."],
				// 이 한 값이 "관전 종료" 버튼을 띄운다. 관전자에게는 대기실
				// 위젯이 없어 이 버튼이 유일한 퇴장 경로다
				spectating: true,
				timeVote: false,
			},
		],
		// 관전자는 죽은 것이 아니라 좌석이 없는 사람인데(SPECTATOR는 alive: false를
		// 함께 보낸다) 화면에서 할 수 있는 일은 유령과 같다. 같은 표시를 받는다
		expect: { ".panel.watching": 1 },
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
		label: "카드 — 직업 도감 (21종)",
		file: "card.html",
		size: [360, 480],
		messages: [{ type: "init", cards: BOOK, nav: "grid", timer: 0, bookLink: false }],
	},
	/*
	 * 같은 목록에 안내 카드를 넣어 본다.
	 *
	 * 도감(BOOK)만으로는 목록의 두 갈래를 밟지 못한다. 직업 카드는 요약이 늘
	 * 있고 진영도 늘 있기 때문이다. 안내 카드는 둘 다 없다 — summary가 ""이고
	 * team이 null이다.
	 *
	 * 그래서 이 장면만 보는 것: 한 줄이 요약 대신 본문으로 물러나 말줄임으로
	 * 끊기는지, 진영 구분선이 "그 밖"으로 뜨는지. 둘 중 하나가 깨지면 목록은
	 * 빈 줄이 늘어선 화면이 되는데, 도감 검사는 그대로 초록으로 통과한다.
	 */
	{
		label: "카드 — 목록에서 요약도 진영도 없는 카드",
		file: "card.html",
		size: [360, 480],
		messages: [
			{ type: "init", cards: GUIDE_CARDS.slice(), nav: "grid", timer: 0, bookLink: false },
		],
	},
	/*
	 * 채팅 도움말. 목록 화면을 도감이 아닌 것으로 쓰는 첫 자리다.
	 *
	 * 그래서 이 장면만 보는 것: 서버가 보낸 머리말(heading)이 "직업 도감"을
	 * 밀어내는지, 그리고 진영 구분선이 하나도 생기지 않는지. 도감은 진영이
	 * 늘 있어서 그 길을 밟지 못한다 — 구분선이 새면 명령어 목록 위에
	 * "시민"이라는 머리말이 붙는다.
	 *
	 * 카드 넷만 넣는다. 실제로는 열 장이지만(명령어 일곱 + 키 조작 셋)
	 * 두 부류의 모양이 완전히 같아서, 늘려도 같은 줄을 여섯 번 더 그리는
	 * 것에 그친다. 대신 양쪽 극단을 고른다 — 이름이 가장 짧은 것, 설명이
	 * 가장 긴 것, 그리고 이름이 글자가 아닌 것(↑ ↓).
	 */
	{
		label: "카드 — 채팅 도움말 (도감이 아닌 목록)",
		file: "card.html",
		// 도감(360×480)이 아니라 카드 크기다. 격자를 쓴다는 것과 화면을 크게
		// 덮어도 된다는 것이 같은 말이 아니라는 것이 이 장면이 선 이유이므로,
		// 상자도 실제로 열리는 크기여야 한다
		size: [320, 400],
		messages: [
			{
				type: "init",
				heading: "채팅 도움말",
				nav: "grid",
				timer: 0,
				bookLink: false,
				cards: [
					{
						glyph: "❓",
						title: "/도움말",
						team: null,
						summary: "쓸 수 있는 명령어를 봅니다",
						body: "쓸 수 있는 명령어를 봅니다",
						note: "인자 없이 그냥 칩니다.",
					},
					{
						glyph: "💌",
						title: "/귓속말",
						team: null,
						summary: "한 사람에게만 보냅니다 (게임 밖에서만)",
						body: "한 사람에게만 보냅니다 (게임 밖에서만)",
						note: "쓰는 법 · /귓속말 <이름> <할 말>",
					},
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
				],
			},
		],
		expect: { ".rolerow": 4, ".sect": 0 },
	},
	{
		label: "밤 지목 — 마피아",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 2,
				...nightAction(Role.MAFIA),
				seats: SEATS,
				timer: 22,
			},
			{ type: "progress", acted: 0, total: 3 },
		],
	},
	{
		// 마피아 팀에게만 오는 메시지(allies)를 걸어보는 유일한 장면이다.
		// 공용 SEATS는 동료가 하나뿐이고 그게 나라서(2번), 여기서는 셋으로
		// 만든다 — 동료가 둘 이상이 아니면 "누가 어디를 노리는가"라는 이
		// 화면의 질문 자체가 생기지 않는다
		label: "밤 지목 — 동료가 노리는 칸(마피아 셋)",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 2,
				...nightAction(Role.MAFIA),
				seats: [
					{ num: 1, name: "김철수", alive: true },
					{ num: 2, name: "이영희", alive: true, ally: true },
					{ num: 3, name: "박민수", alive: false },
					{ num: 4, name: "정수연", alive: true },
					{ num: 5, name: "최지훈매우긴이름입니다", alive: true, ally: true },
					{ num: 6, name: "한가영", alive: true, ally: true },
				],
				timer: 22,
			},
			{ type: "progress", acted: 1, total: 3 },
			// 팀이 갈렸다. 이 화면이 있으라고 만든 순간이 정확히 여기다
			{
				type: "allies",
				picks: [
					{ from: 5, to: 1 },
					{ from: 6, to: 4 },
				],
			},
			// 나도 4번으로 붙는다. 격자가 잠기고, 잠긴 뒤에도 1번 칸의 표시가
			// 회색에 묻히지 않아야 한다(.grid.locked .tile.aimed)
			{ type: "selectResponse", num: 4 },
			{ type: "progress", acted: 2, total: 3 },
			// 5번이 옮겨 와 한 칸에 둘이 모인다("🔻5,6"). 1번 칸의 표시는
			// 지워져야 한다 — 지우는 길이 없으면 지나간 지목이 밤새 남는다.
			// 내 지목(2→4)은 picked가 이미 말하므로 위젯이 걸러 낸다
			{
				type: "allies",
				picks: [
					{ from: 5, to: 4 },
					{ from: 6, to: 4 },
					{ from: 2, to: 4 },
				],
			},
			{ type: "progress", acted: 3, total: 3 },
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
				...nightAction(Role.DOCTOR),
				seats: SEATS,
				timer: 22,
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
				...nightAction(Role.VIGILANTE),
				seats: SEATS,
				timer: 22,
			},
		],
	},
	{
		// 산 칸과 죽은 칸의 역할이 뒤집히는 유일한 화면이다. 나머지 장면이
		// 전부 "죽은 칸은 잠긴다"만 보여주므로 이 한 장면이 없으면 뒤집는
		// 길이 한 번도 그려지지 않는다
		label: "밤 지목 — 무덤을 고르는 직업(영매)",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 1,
				...nightAction(Role.SHAMAN),
				// 무덤이 둘이어야 "고를 수 있는 칸이 여럿"인 모양이 나온다.
				// 공용 SEATS는 죽은 사람이 하나뿐이라 여기서만 따로 만든다
				seats: [
					{ num: 1, name: "김철수", alive: true },
					{ num: 2, name: "이영희", alive: false },
					{ num: 3, name: "박민수", alive: false },
					{ num: 4, name: "정수연", alive: true },
					{ num: 5, name: "최지훈매우긴이름입니다", alive: true },
					{ num: 6, name: "한가영", alive: false },
				],
				timer: 22,
			},
			{ type: "progress", acted: 0, total: 3 },
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
				...nightAction(Role.CITIZEN),
				seats: SEATS,
				timer: 22,
			},
			// 두 번째 화면까지 걸어본다. 여기까지 오지 않으면 문구 목록을 그리는
			// 길과 그것을 다시 치우는 길이 한 번도 실행되지 않는다
			{ type: "phrases", num: 5, options: QUICK_NOTE.slice() },
			{ type: "selectResponse", num: 5 },
		],
		// 예외가 없다는 것만으로는 문구 목록이 그려졌는지 알 수 없다. 마지막
		// 문구의 버튼을 세면 여섯 개가 다 그려졌는지가 확인된다. 문구가 늘거나
		// 줄면 기대하는 번호도 같이 움직여야 하므로 길이에서 뽑는다.
		//
		// 확정 표시(.picked)로는 셀 수 없다. check-widgets.js의 선택자는
		// 파싱된 노드의 class 속성을 읽는데 classList.add는 엘리먼트 스텁의
		// Set만 고치고 그 속성을 되쓰지 않는다 — 실행 중에 붙은 class는
		// querySelectorAll에 잡히지 않는다(.picked로 1을 기대하면 0이 나온다)
		expect: { [`button[data-index="${QUICK_NOTE.length - 1}"]`]: 1 },
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
				...nightAction(Role.CITIZEN),
				seats: SEATS,
				timer: 22,
			},
			{ type: "phrases", num: 5, options: QUICK_NOTE.slice() },
			// 둘째 밤
			{
				type: "init",
				myNum: 3,
				...nightAction(Role.CITIZEN),
				seats: SEATS,
				timer: 22,
			},
		],
		// 위 장면이 1을 기대하는 그 버튼이 여기서는 0이어야 한다. 두 장면이
		// 짝이라서, 청소를 지우면 이쪽이 문구 수만큼 세고 빨개진다
		expect: { [`button[data-index="${QUICK_NOTE.length - 1}"]`]: 0 },
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
				seats: SEATS,
				timer: 22,
				// 총알을 다 쓴 자경단원. maxUses를 넘겼다는 사실만 주면
				// 문장은 도메인이 고른다
				...noTurnNote(Role.VIGILANTE, { usesSpent: 1 }),
				alive: true,
				lead: "기다리세요",
				deaths: [],
				spectating: false,
			},
		],
	},
	/*
	 * 새 세 값이 오지 않는 밤.
	 *
	 * 위젯과 서버는 함께 배포되지 않는다. 옛 서버가 새 위젯에 말을 거는 순간이
	 * 반드시 있고, 그때 화면이 비어 보이면 안 된다 — 기호 자리는 비고, 능력 줄은
	 * 빈 칸이 되고, 지시문은 위젯이 단계를 보고 고른 기본값이 대신 뜬다.
	 *
	 * 이 장면이 없으면 세 개의 || 오른쪽은 아무도 본 적 없는 코드가 된다. 그리고
	 * 그 자리가 깨질 때 사라지는 것이 화면에서 가장 큰 글씨다.
	 */
	{
		label: "밤 — 서버가 지시문·기호·능력 줄을 안 보낼 때",
		file: "phase.html",
		size: [340, 300],
		messages: [
			{
				type: "init",
				phase: "night",
				turn: 1,
				total: 6,
				aliveCount: 6,
				timer: 22,
				// 안내 문구는 도메인에서 꺼내고 새 세 값만 일부러 뺀다.
				// idOf/noTurnNote를 그대로 쓰면 세 값이 따라와 이 갈래가 사라진다
				role: ROLE_DEFS[Role.POLITICIAN].displayName,
				team: ROLE_DEFS[Role.POLITICIAN].team,
				alive: true,
				note: noTurnNote(Role.POLITICIAN).note,
				deaths: [],
				spectating: false,
				timeVote: false,
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
				// 마피아 팀이지만 밀담 상대가 없다 — 채팅에 🔪 탭이 생기지 않고,
				// nightNotice가 그 사실을 알리는 유일한 줄이다
				...nightAction(Role.BEAST),
				seats: SEATS,
				timer: 22,
			},
			// 분모가 0인 순간. 인원이 갈리면 실제로 나올 수 있는 값이고,
			// 나누기 전에 걸러내지 않으면 막대 폭이 NaN%가 된다
			{ type: "progress", acted: 0, total: 0 },
		],
	},
	{
		label: "밤 지목 — 자기 칸이 잠긴다(건달)",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 4,
				...nightAction(Role.THUG),
				seats: SEATS,
				// 이 한 줄이 이 장면의 전부다
				noSelf: true,
				timer: 22,
			},
		],
		// SEATS는 여섯 칸이고 3번이 사망이다. 여기에 내 칸(4번)이 더해져 둘.
		// noSelf 가지를 지우면 하나만 남아 이 장면이 빨개진다 — 다른 장면들은
		// 전부 noSelf 없이(=거짓) 돌아서 그 가지를 한 번도 밟지 않는다.
		//
		// class(.me)로는 셀 수 없다. 잠금은 실행 중에 붙는 것이 아니라
		// 처음부터 속성으로 찍히므로 disabled를 센다
		expect: { 'button[disabled=""]': 2 },
	},
	{
		label: "투표 — 3/5 진행 중",
		file: "vote.html",
		size: [340, 380],
		messages: [
			{ type: "init", myNum: 4, seats: SEATS, timer: 17, picked: 0, ...idOf(Role.CITIZEN) },
			// done은 표를 낸 사람의 번호다. 나(4번)는 아직 안 냈으므로 빠져 있다 —
			// 내 칸만 체크가 없는 화면이 곧 "남은 사람은 나다"라는 신호다
			{ type: "progress", voted: 3, alive: 5, done: [1, 2, 5] },
		],
	},
	{
		label: "투표 — 유령이 보는 잠긴 화면",
		file: "vote.html",
		size: [340, 380],
		messages: [
			{ type: "init", myNum: 3, seats: SEATS, timer: 17, picked: 0, ...GHOST },
			{ type: "progress", voted: 2, alive: 5, done: [1, 5] },
		],
		// 유령은 한 자리도 누를 수 없다 — locked가 tile 전체를 disabled로 만든다.
		// '투표 없음' 칸도 함께 잠기므로 사람 수보다 하나 많다. 그 칸을 locked에서
		// 빼면 유령이 스킵 한 표를 넣을 수 있게 되고, 그 순간 여기가 걸린다
		expect: { 'button[disabled=""]': SEATS.length + 1 },
	},
	/*
	 * 재지목된 낮의 투표.
	 *
	 * 앞 라운드에서 2번이 찬반투표로 부결됐다. 같은 낮에 두 번 단상에 세우지
	 * 않으므로 그 칸만 잠기고 배지가 붙는다 — 사망(회색)과 같은 모양이면
	 * "죽은 줄 알았는데 살아 있다"가 되므로 이유를 글자로 남긴다.
	 *
	 * 3번은 원래 사망이라 잠긴 칸이 둘이다. rejected 갈래를 지우면 하나로
	 * 줄어 이 장면이 빨개진다.
	 *
	 * picked를 -1로 준 것도 의도다. 재접속 복원은 Number(data.picked) || null로
	 * 하는데, 스킵의 대상 번호가 0이었다면 그 표는 복원되지 않고 조용히
	 * 사라졌을 것이다. -1이라 살아난다.
	 */
	{
		label: "투표 — 재지목 (부결된 사람은 다시 못 고른다)",
		file: "vote.html",
		size: [340, 380],
		messages: [
			{
				type: "init",
				myNum: 4,
				seats: SEATS,
				timer: 17,
				picked: -1,
				rejected: [2],
				...idOf(Role.DOCTOR),
			},
			// 2번이 든 이유는 부결된 사람도 투표는 한다는 것이다. 그 칸에는
			// 부결 배지와 완료 체크가 함께 뜨므로 둘의 자리가 겹치면 여기서 보인다
			{ type: "progress", voted: 2, alive: 5, done: [2, 4] },
		],
		expect: { 'button[disabled=""]': 2, ".badge": 1 },
	},
	{
		label: "개표 — 단상에 오른 사람",
		file: "vote.html",
		size: [340, 380],
		messages: [
			{
				type: "result",
				myNum: 4,
				seats: SEATS.map((seat, i) => ({ ...seat, votes: [1, 3, 0, 0, 1, 0][i] })),
				// 예전 이름은 executed였다. 이제 이 칸은 처형된 사람이 아니라
				// 최후의 반론으로 넘어가는 사람이다 — 죽는지는 찬반투표가 정한다
				nominee: 2,
				message: "🎤 이영희 님이 단상에 올랐습니다.",
				timer: 7,
				...idOf(Role.POLICE),
			},
		],
	},
	/*
	 * 아무도 단상에 오르지 않은 개표.
	 *
	 * 전원이 '투표 없음'을 골랐거나 동수로 갈린 낮이다. 서버는 그때 nominee를
	 * 0으로 준다(VoteResultPayload). 실제로 나오는 값인데 위 장면은 늘 누군가
	 * 올라와 있어서, 이 화면을 밟는 것은 이 장면뿐이다.
	 *
	 * 두 곳이 걸린다. 처형 흔들림을 걸 타일이 없고(0번 좌석은 없다), 최고 득표가
	 * 0이라 막대 폭이 0/0이 된다. 둘 중 하나에서 방어가 빠지면 개표 화면이
	 * 그 자리에서 멈추거나 막대 폭이 NaN%가 된다.
	 */
	{
		label: "개표 — 아무도 오르지 않았다 (분모 0)",
		file: "vote.html",
		size: [340, 380],
		messages: [
			{
				type: "result",
				myNum: 4,
				seats: SEATS.map(seat => ({ ...seat, votes: 0 })),
				nominee: 0,
				message: "아무도 지목되지 않았습니다.",
				timer: 7,
				...idOf(Role.POLICE),
			},
		],
	},
	/*
	 * 능력 줄이 가장 긴 직업으로 보는 투표.
	 *
	 * 신분 줄은 한 줄이다 — 직업 칩과 능력 줄과 진행률이 그 한 줄을 나눠 쓴다.
	 * 투표 위젯이 그 줄을 가진 화면 중 가장 좁으므로(340px), 여기서 넘치지
	 * 않으면 다른 곳에서도 넘치지 않는다.
	 *
	 * 연인의 요약이 21종 중 가장 길다. 말줄임 처리를 지우면 능력 줄이 진행률
	 * 숫자를 밀어내고, 그 숫자는 "몇 명이 아직 안 찍었는가"라 투표 화면에서
	 * 가장 자주 읽히는 값이다.
	 */
	{
		label: "투표 — 능력 줄이 가장 긴 직업(연인)",
		file: "vote.html",
		size: [340, 380],
		messages: [
			{ type: "init", myNum: 6, seats: SEATS, timer: 17, picked: 2, ...idOf(Role.LOVER) },
			{ type: "progress", voted: 4, alive: 5, done: [1, 2, 5, 6] },
		],
	},
	/*
	 * 최후의 반론과 찬반투표 — 개표와 처형 사이의 두 단계.
	 *
	 * 한 위젯이 네 가지 화면을 그린다. 단계(반론/찬반) × 내가 단상 위인가로
	 * 갈리고, 갈리는 것은 버튼이 눌리는지와 아래 한 줄뿐이다. 그 한 줄이
	 * 이 화면에서 사람이 실제로 읽는 전부라, 네 갈래를 다 열어 본다.
	 */
	{
		label: "반론 — 듣는 쪽 (아직 못 누른다)",
		file: "judgement.html",
		size: JUDGEMENT_SIZE,
		messages: [
			{
				type: "defense",
				myNum: 4,
				nominee: 2,
				nomineeName: "2번 이영희",
				timer: 15,
				...idOf(Role.POLICE),
				lead: "해명을 들으세요",
				picked: "NONE",
				canJudge: false,
			},
			{ type: "judge-progress", voted: 0, voters: 4 },
		],
		/*
		 * 두 버튼이 소스에 disabled로 박혀 있는지 본다.
		 *
		 * 런타임 잠금(el.disabled = !canJudge)은 여기서 못 본다 — 검사기의
		 * DOM은 소스를 한 번 파싱한 것이라 프로퍼티 대입이 속성으로 되비치지
		 * 않는다. 그래서 이 줄이 지키는 것은 "기본값이 잠김인가" 하나다.
		 *
		 * 그게 실제로 중요하다. init 메시지가 늦거나 오지 않으면 화면에는
		 * 마크업 그대로가 남는데, 기본값을 풀어 두면 아무 판단도 없는 상태의
		 * 찬성 버튼이 눌리는 채로 떠 있게 된다.
		 */
		expect: { 'button[disabled=""]': 2 },
	},
	{
		// 이름이 가장 긴 표본을 여기 둔다. 단상 이름은 한 줄짜리 큰 글씨라
		// 폭이 넘치면 잘려야 하는데, 그 처리를 지우면 상자 밖으로 흐른다
		label: "반론 — 단상에 오른 본인",
		file: "judgement.html",
		size: JUDGEMENT_SIZE,
		messages: [
			{
				type: "defense",
				myNum: 5,
				nominee: 5,
				nomineeName: "5번 최지훈매우긴이름입니다",
				timer: 15,
				// 단상에 오른 본인. 신분 줄은 남의 눈에 보이지 않으므로 마피아도
				// 자기 화면에서는 자기 직업을 그대로 본다
				...idOf(Role.MAFIA),
				lead: "해명하세요",
				picked: "NONE",
				canJudge: false,
			},
			{ type: "judge-progress", voted: 0, voters: 4 },
		],
	},
	{
		// 재접속으로 화면을 다시 연 사람. 이미 넣은 찬성이 살아나야 한다
		label: "찬반 — 고를 수 있는 사람 (찬성을 이미 눌렀다)",
		file: "judgement.html",
		size: JUDGEMENT_SIZE,
		messages: [
			{
				type: "judge",
				myNum: 4,
				nominee: 2,
				nomineeName: "2번 이영희",
				timer: 5,
				...idOf(Role.POLICE),
				lead: "처형할까요?",
				picked: "AGREE",
				canJudge: true,
			},
			{ type: "judge-progress", voted: 3, voters: 4 },
		],
		// 잠금이 풀렸는지는 여기서 셀 수 없다(위 장면 주석). 대신 O/X 두 짝이
		// 그대로 있는지를 본다 — 한쪽만 남으면 반대표를 넣을 길이 사라진다
		expect: { ".judge-btn": 2 },
	},
	{
		label: "찬반 — 단상에 오른 본인 (분모가 0)",
		file: "judgement.html",
		size: JUDGEMENT_SIZE,
		messages: [
			{
				type: "judge",
				myNum: 2,
				nominee: 2,
				nomineeName: "2번 이영희",
				timer: 5,
				...idOf(Role.MAFIA),
				lead: "판결을 기다리세요",
				picked: "NONE",
				canJudge: false,
			},
			// 나머지가 전부 끊긴 순간. 실제로 나올 수 있는 값이고, 나누기 전에
			// 걸러내지 않으면 진행률 막대 폭이 NaN%가 된다
			{ type: "judge-progress", voted: 0, voters: 0 },
		],
		expect: { 'button[disabled=""]': 2 },
	},
	/*
	 * 찬반 단계인데 누를 수 없는 사람 — 건달에게 협박당했다.
	 *
	 * 위 네 장면으로 갈리지 않는 다섯째 사람이다. canJudge는 단상 본인과
	 * 똑같이 false인데 할 일은 다르다. 본인은 판결을 기다리고, 이 사람은
	 * 자기 몫이 반대로 세어지는 것을 보고만 있다(judgementPassed).
	 *
	 * 그 차이를 canJudge로는 만들 수 없어서 서버가 문구를 정한다
	 * (Trial.judgementLead). 네 갈래 중 이것이 마지막이고, 나머지 셋은
	 * 위 장면들이 하나씩 들고 있다.
	 */
	{
		label: "찬반 — 협박당해 누를 수 없는 사람",
		file: "judgement.html",
		size: JUDGEMENT_SIZE,
		messages: [
			{
				type: "judge",
				myNum: 4,
				nominee: 2,
				nomineeName: "2번 이영희",
				timer: 5,
				...idOf(Role.CITIZEN),
				lead: "지켜보세요",
				picked: "NONE",
				canJudge: false,
			},
			{ type: "judge-progress", voted: 2, voters: 4 },
		],
		// 살아 있는 사람이므로 회색 처리는 붙지 않아야 한다. 협박은 판에서
		// 빠지는 것이 아니라 표가 반대로 세어지는 것이고, 그는 낮에 여전히
		// 말할 수 있다 — 화면째 색을 빼면 그 사실이 뒤집힌다
		expect: { 'button[disabled=""]': 2, ".panel.watching": 0 },
	},
	/*
	 * 유령이 보는 찬반 화면.
	 *
	 * 위 다섯 갈래는 전부 살아 있는 사람이었다. 유령에게는 O/X가 이 판이
	 * 끝날 때까지 열리지 않는데, 이 화면은 반론 단계에도 잠긴 버튼을 그대로
	 * 보여주기 때문에 "곧 열린다"와 구분되지 않았다. 찬반으로 넘어가도
	 * 버튼이 그대로인 것을 보고 화면이 멈춘 줄 아는 사람이 나왔다.
	 */
	{
		label: "찬반 — 유령이 보는 화면 (영영 안 열린다)",
		file: "judgement.html",
		size: JUDGEMENT_SIZE,
		messages: [
			{
				type: "judge",
				myNum: 3,
				nominee: 2,
				nomineeName: "2번 이영희",
				timer: 5,
				...GHOST,
				lead: "지켜보세요",
				picked: "NONE",
				canJudge: false,
			},
			{ type: "judge-progress", voted: 2, voters: 4 },
		],
		expect: { 'button[disabled=""]': 2, ".panel.watching": 1 },
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
	/*
	 * 같은 화면을 기호 없이 본다.
	 *
	 * 직업 공개 줄에 기호가 붙은 것은 이번 재설계부터다. 서버가 안 보내면
	 * 위젯은 그 자리를 비우고 이름만 그린다 — 21줄이 나란히 설 때 기호는
	 * 훑어 읽기를 돕는 것이고, 없어도 읽을 수는 있어야 한다.
	 *
	 * 이긴 쪽으로 두었다. 승패 머리말의 다른 갈래도 함께 밟힌다.
	 */
	{
		label: "결과 — 기호 없는 공개 줄 (이긴 쪽)",
		file: "gameOver.html",
		size: [340, 460],
		messages: [
			{
				type: "init",
				winner: "mafia",
				team: "mafia",
				reason: "마피아 수가 시민 수와 같아졌습니다.",
				timer: 14,
				players: REVEAL_NO_GLYPH,
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
					{
						id: "p3",
						name: "박민수",
						rank: "비로그인 유저",
						runCount: 9,
						ready: true,
						kickCount: 0,
					},
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
	 * 침묵전의 낮.
	 *
	 * 이 모드에는 장면이 하나도 없었다. 그래서 서른 몇 장면을 다 열어봐도
	 * "자유 입력이 막히고 칩만 남은 채팅창"은 한 번도 그려지지 않았다 —
	 * 다른 모드와 화면이 가장 많이 다른 쪽이 검사에서 가장 조용했다.
	 *
	 * 문구 여덟 개는 QuickPhrases의 묶음 중 가장 길다. 칩 줄이 감당해야 하는
	 * 최악의 입력이 이것이라 여기로 가져온다.
	 */
	{
		label: "채팅 — 침묵전의 낮 (문구만)",
		file: "chat.html",
		size: CHAT_SIZE,
		// 마지막 칩까지 그려졌는지 센다. 보이는지까지는 검사기가 모른다(레이아웃이 없다)
		expect: { [`button[data-index="${QUICK_SILENCE_DAY.length - 1}"]`]: 1 },
		messages: [
			{
				type: "init",
				channels: [tab("ROOM", { write: true }), tab("GLOBAL", { write: false })],
				active: "ROOM",
				quick: QUICK_SILENCE_DAY.slice(),
				open: true,
				focus: "",
				myId: "p1",
				lines: [
					line(1, {
						channel: "ROOM",
						kind: "SYSTEM",
						text: "🤐 침묵전입니다. 정해진 문구로만 말할 수 있습니다.",
					}),
					line(2, {
						channel: "ROOM",
						senderId: "p4",
						num: 4,
						name: "정수연",
						role: "시민",
						team: "citizen",
						text: "의심됩니다",
					}),
					line(3, {
						channel: "ROOM",
						senderId: "p1",
						num: 1,
						name: "김철수",
						role: "경찰",
						team: "citizen",
						text: "정보 있어요",
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
					line(5, {
						channel: "GLOBAL",
						kind: "NOTICE",
						text: "🎭 3번 방에서 게임이 시작되었습니다.",
					}),
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
	 * 네 장면이 서로 다른 길을 지난다.
	 *   1. 그림이 온 경우      → <img>를 건다
	 *   2. 게스트              → 전적 대신 안내 한 줄 (숫자가 영원히 0이다)
	 *   3. 자기 자신을 클릭     → 머리말이 "내 프로필"로 갈린다
	 *   4. 귓속말을 걸 수 있는 상대 → 늘 감춰 둔 버튼이 드러난다
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
	/*
	 * 귓속말 버튼이 드러난 프로필.
	 *
	 * 위 셋은 canWhisper를 싣지 않아 버튼이 감춰지는 쪽만 밟는다. 감추는
	 * 것이 기본값이라 그 셋만으로는 "영영 뜨지 않는 버튼"이 통과한다.
	 *
	 * .hidden을 세는 이유: 이 화면에서 감춰져야 하는 것은 아바타 그림
	 * 하나뿐이다(avatar가 ""이라 글리프로 그린다). 둘이 나오면 귓속말
	 * 버튼이 함께 숨은 것이고, 그것이 이 장면이 잡으려는 것 전부다.
	 */
	{
		label: "프로필 — 귓속말을 걸 수 있는 사람",
		file: "profile.html",
		size: PROFILE_SIZE,
		messages: [
			{
				type: "init",
				name: "김철수",
				rank: "Lv.3",
				avatar: "",
				where: "대기실",
				stats: [
					{ label: "마피아", value: "1승 0패" },
					{ label: "시민", value: "2승 3패" },
					{ label: "참가", value: "6판" },
					{ label: "중도 이탈", value: "0판" },
				],
				self: false,
				canWhisper: true,
			},
		],
		expect: { ".stat": 4, ".hidden": 1 },
	},
];

module.exports = { SCENES };
