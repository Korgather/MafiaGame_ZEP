/*
 * 위젯 미리보기 페이지 생성: res/*.html -> preview/widgets.html
 *
 * 왜 필요한가
 * -----------
 * 지금까지 위젯 화면을 눈으로 보는 유일한 방법은 ZEP에 올리고 4명을 모아
 * 한 판을 시작해서 그 단계까지 진행하는 것이었다. 개표 화면 하나를 고치려면
 * 매번 밤·낮·투표를 거쳐야 했다. 그래서 아무도 화면을 손보지 않았고,
 * voteResult.html의 격자가 6명 전용으로 굳은 채 MAX_PLAYERS만 8로 올라갔다.
 *
 * 이 파일은 서버가 실제로 보내는 것과 같은 모양의 payload를 각 위젯에
 * 넣어 한 페이지에 늘어놓는다. 브라우저로 열면 끝이다.
 *
 * 표본은 일부러 까다롭게 잡았다 — 아주 긴 이름, 죽은 사람, 6명(격자가
 * 굳어 있던 인원수), 득표 0인 사람. 레이아웃이 깨지는 조건을 미리 본다.
 *
 * 산출물은 preview/ 아래에 떨어지며 배포에 포함되지 않는다.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RES = path.join(ROOT, "res");
const OUT = path.join(ROOT, "preview");

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
		label: "밤 지목 + 마피아 채팅",
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
				chatEnable: true,
				note: "🌙 밤에는 마피아팀끼리 채팅을 공유할 수 있습니다.",
			},
			{ type: "chatNotify", num: 5, name: "최지훈", message: "4번 어때? 아까부터 조용한데" },
			{ type: "chatNotify", num: 0, name: "안내", message: "곧 밤이 끝납니다" },
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
				chatEnable: false,
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
				chatEnable: false,
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
				// 마피아 팀이지만 채팅 상대가 없으면 입력창을 열지 않는다
				chatEnable: false,
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
];

/** srcdoc 속성에 넣으려면 따옴표만 막으면 된다 */
function attr(html) {
	return html.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function build() {
	const cache = {};
	const cards = SCENES.map((scene, i) => {
		if (!cache[scene.file]) cache[scene.file] = fs.readFileSync(path.join(RES, scene.file), "utf8");
		// 위젯은 자기 크기를 모른 채 부모가 정한 폭에 맞춘다. ZEP과 같은 조건이다.
		return `<figure>
	<figcaption><b>${scene.label}</b><span>${scene.file} · ${scene.size[0]}×${scene.size[1]}</span></figcaption>
	<iframe id="f${i}" width="${scene.size[0]}" height="${scene.size[1]}" srcdoc="${attr(cache[scene.file])}"></iframe>
</figure>`;
	}).join("\n");

	const script = SCENES.map((scene, i) => {
		const messages = scene.messages.map(m => JSON.stringify({ ...m, isMobile: false }));
		return `send(${i}, [${messages.join(",")}]);`;
	}).join("\n");

	const page = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>마피아 위젯 미리보기</title>
<style>
	body { margin: 0; padding: 24px; background: #17171c; color: #c8c8d0;
		font-family: "Pretendard", system-ui, sans-serif; }
	h1 { font-size: 18px; margin: 0 0 4px; color: #fff; }
	p.lead { margin: 0 0 24px; font-size: 13px; color: #8a8a96; }
	.wrap { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
	figure { margin: 0; }
	figcaption { display: flex; flex-direction: column; gap: 2px; padding-bottom: 8px; font-size: 12px; }
	figcaption b { color: #fff; font-weight: 600; }
	figcaption span { color: #6e6e7a; font-size: 11px; }
	iframe { border: 1px solid #2e2e38; border-radius: 10px; background: #000; display: block; }
</style>
</head>
<body>
<h1>마피아 위젯 미리보기</h1>
<p class="lead">서버가 실제로 보내는 것과 같은 payload를 넣은 상태입니다. 눌러도 서버가 없어 응답은 오지 않습니다.</p>
<div class="wrap">
${cards}
</div>
<script>
	function send(index, messages) {
		var frame = document.getElementById("f" + index);
		frame.addEventListener("load", function () {
			messages.forEach(function (message) { frame.contentWindow.postMessage(message, "*"); });
		});
	}
${script}
</script>
</body>
</html>
`;

	fs.mkdirSync(OUT, { recursive: true });
	const file = path.join(OUT, "widgets.html");
	fs.writeFileSync(file, page);
	console.log(`미리보기 생성: ${path.relative(ROOT, file)} (장면 ${SCENES.length}개)`);
}

build();
