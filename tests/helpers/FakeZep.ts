/**
 * ZEP 런타임의 가짜 구현.
 *
 * 이 프로젝트가 닿는 ZEP 전역은 ScriptApp / ScriptMap / Time 세 개뿐이고
 * 실제로 쓰는 멤버는 17개다. 세 전역을 모듈 평가 전에 globalThis에 심어두면
 * src의 코드를 한 줄도 고치지 않고 Node에서 그대로 돌릴 수 있다.
 *
 * 왜 어댑터 모듈이 아니라 전역 주입인가:
 *   @zep.us/babel-plugin-zep-script는 `ScriptApp.` 식별자를 `App.`으로 치환한다.
 *   즉 어댑터를 만들어 감싸도 그 안에서 결국 같은 전역을 참조하게 되므로
 *   배포 산출물에 층만 하나 늘 뿐 테스트 가능성은 조금도 나아지지 않는다.
 *   전역을 바꿔치우는 쪽이 프로덕션 코드에 손을 대지 않는 유일한 방법이다.
 *
 * 이 파일은 반드시 src보다 먼저 평가돼야 한다. Sprites.ts가 모듈 로드 시점의
 * 최상위 for문에서 ScriptApp.loadSpritesheet를 부르기 때문이다.
 * package.json의 test 스크립트가 --import로 이 파일을 선주입하고,
 * Harness.ts도 src보다 먼저 이 파일을 import해 이중으로 보장한다.
 *
 * 가짜는 기록만 하지 않고 두 가지를 실제로 강제한다. 둘 다 이 프로젝트에서
 * 실제로 터졌던 버그이고, 둘 다 tsc가 잡지 못하는 부류다.
 *   1. ZEP API에 명시적 undefined를 넘기면 던진다 (아래 checkCall 주석 참고)
 *   2. destroy된 위젯에 sendMessage하면 던진다
 */

/** ZEP 이벤트 훅(`.Add(handler)`)의 가짜 */
export class Hook<A extends unknown[]> {
	private readonly handlers: Array<(...args: A) => void> = [];

	Add(handler: (...args: A) => void): void {
		this.handlers.push(handler);
	}

	/** 등록된 핸들러를 모두 부른다. 순회 중 추가돼도 안전하도록 복사본을 돈다 */
	emit(...args: A): void {
		for (const handler of this.handlers.slice()) handler(...args);
	}

	get count(): number {
		return this.handlers.length;
	}
}

/**
 * ZEP 런타임(Jint)의 호출 규약을 흉내낸다.
 *
 * Jint는 JS 호출을 "실제로 넘어온 인자의 개수와 타입"으로 C# 오버로드에 붙인다.
 * 그래서 .d.ts의 `frameRate?: number`는 "생략 가능"이라는 뜻이지
 * "undefined를 넣어도 된다"는 뜻이 아니다. 명시적 undefined는 생략이 아니라
 * 숫자 자리에 들어온 잘못된 인자가 되고, 맞는 오버로드가 없어 스크립트가 죽는다:
 *
 *   No public methods with the specified arguments were found
 *
 * 실제로 loadSpritesheet가 이것 때문에 프로덕션에서 로드 자체에 실패했다.
 * tsc는 `fps?: number`에 undefined를 넘기는 것을 정상으로 본다.
 *
 * 생략과 명시적 undefined를 구분하려면 arguments.length가 필요하므로
 * 가짜의 메서드는 선택 인자가 있는 한 전부 rest 인자로 받는다.
 */
function checkCall(name: string, args: readonly unknown[], min: number, max: number): void {
	if (args.length < min || args.length > max) {
		throw new Error(
			`${name}: 인자 ${args.length}개로 호출됐습니다 (허용 ${min}~${max}개). ` +
				`ZEP 런타임은 인자 개수로 C# 오버로드를 고릅니다.`
		);
	}
	for (let i = 0; i < args.length; i++) {
		if (args[i] === undefined) {
			throw new Error(
				`${name}: ${i + 1}번째 인자가 명시적 undefined입니다. ` +
					`ZEP 런타임에서는 이 호출이 "No public methods with the specified arguments were found"로 죽습니다. ` +
					`인자를 넘기지 말고 생략하세요.`
			);
		}
	}
}

/** 위젯이 받은 payload를 그대로 쌓아두는 가짜 ScriptWidget */
export class FakeWidget {
	readonly messages: object[] = [];
	readonly onMessage = new Hook<[FakePlayer, unknown]>();
	destroyed = false;

	readonly fileName: string;
	readonly align: string;
	readonly width: number;
	readonly height: number;

	constructor(fileName: string, align: string, width: number, height: number) {
		this.fileName = fileName;
		this.align = align;
		this.width = width;
		this.height = height;
	}

	sendMessage(...args: unknown[]): void {
		checkCall("widget.sendMessage", args, 1, 1);
		if (this.destroyed) {
			// 원본 코드에 실제로 있던 버그다. destroy() 뒤에 참조를 null로
			// 지우지 않아 이미 파괴된 위젯에 메시지를 보내는 경로가 남아 있었다.
			throw new Error(`이미 destroy된 위젯(${this.fileName})에 sendMessage를 호출했습니다.`);
		}
		this.messages.push(args[0] as object);
	}

	destroy(): void {
		this.destroyed = true;
	}

	/**
	 * 위젯(클라이언트)이 서버로 메시지를 보낸 상황.
	 *
	 * destroy된 뒤에도 허용한다. 위젯은 클라이언트에서 돌고 네트워크에는
	 * 지연이 있으므로, 서버가 단계를 넘기고 위젯을 닫은 뒤에 이미 떠난
	 * 메시지가 도착하는 일은 실제로 일어난다. 조작된 클라이언트라면
	 * 얼마든지 보낼 수도 있다. 서버 핸들러의 단계·생사 검증이
	 * 바로 이 경우를 막으라고 있는 것이므로, 여기서 미리 막으면
	 * 그 검증을 테스트할 수 없다.
	 */
	emit(sender: FakePlayer, data: unknown): void {
		this.onMessage.emit(sender, data);
	}

	/** 마지막으로 받은 payload */
	last(): Record<string, unknown> | undefined {
		return this.messages[this.messages.length - 1] as Record<string, unknown> | undefined;
	}

	/** 받은 payload 중 type이 일치하는 마지막 것 */
	lastOfType(type: string): Record<string, unknown> | undefined {
		for (let i = this.messages.length - 1; i >= 0; i--) {
			const message = this.messages[i] as Record<string, unknown>;
			if (message.type === type) return message;
		}
		return undefined;
	}
}

/** 가짜 ScriptPlayer. 부작용은 전부 배열에 기록해 테스트가 관찰한다 */
export class FakePlayer {
	// ZEP이 주는 필드
	isMobile = false;
	/** ZEP은 태블릿도 isMobile로 본다. isTablet은 그 안에서 다시 갈리는 값이다 */
	isTablet = false;
	isGuest = false;
	role = 0;
	storage: string | null = null;
	tag: unknown = null;

	// 게임이 바꾸는 외형·상태
	title = "";
	titleColor = 0;
	hidden = false;
	moveSpeed = 80;
	sprite: unknown = null;
	attackSprite: unknown = null;
	attackType = 0;
	attackParam1 = 0;
	attackParam2 = 0;
	displayRatio = 1;
	x = 0;
	y = 0;

	// 관찰용 기록
	readonly widgets: FakeWidget[] = [];
	readonly chat: string[] = [];
	readonly labels: string[] = [];
	readonly sounds: string[] = [];
	saveCount = 0;
	updatedCount = 0;

	readonly id: string;
	name: string;

	constructor(id: string, name: string) {
		this.id = id;
		this.name = name;
	}

	showWidget(...args: unknown[]): FakeWidget {
		checkCall("player.showWidget", args, 2, 4);
		const widget = new FakeWidget(
			args[0] as string,
			args[1] as string,
			args[2] as number,
			args[3] as number
		);
		this.widgets.push(widget);
		return widget;
	}

	sendMessage(...args: unknown[]): void {
		checkCall("player.sendMessage", args, 1, 2);
		this.chat.push(args[0] as string);
	}

	showCenterLabel(...args: unknown[]): void {
		checkCall("player.showCenterLabel", args, 1, 5);
		this.labels.push(args[0] as string);
	}

	playSound(...args: unknown[]): void {
		checkCall("player.playSound", args, 1, 3);
		this.sounds.push(args[0] as string);
	}

	spawnAt(...args: unknown[]): void {
		checkCall("player.spawnAt", args, 2, 3);
		this.x = args[0] as number;
		this.y = args[1] as number;
	}

	sendUpdated(): void {
		this.updatedCount++;
	}

	save(): void {
		this.saveCount++;
	}

	/** 아직 destroy되지 않은 위젯들 */
	liveWidgets(): FakeWidget[] {
		return this.widgets.filter(widget => !widget.destroyed);
	}

	/** 이 플레이어가 받은 마지막 라벨 */
	lastLabel(): string | undefined {
		return this.labels[this.labels.length - 1];
	}

	/** 채팅·라벨·사운드 기록을 비운다. 단계별로 나눠 관찰할 때 쓴다 */
	clearLog(): void {
		this.chat.length = 0;
		this.labels.length = 0;
		this.sounds.length = 0;
	}
}

export interface SpriteLoad {
	file: string;
	width: number;
	height: number;
	frames: unknown;
	/** 5번째 인자가 실제로 넘어왔는가 */
	hasFps: boolean;
}

export interface HttpPost {
	url: string;
	body: unknown;
}

/** 가짜 세계의 관찰 가능한 전체 상태 */
export const world = {
	/** 현재 접속 중인 플레이어만 들어 있다. 끊기면 빠진다 */
	players: [] as FakePlayer[],
	/** 맵에 올려둔 오브젝트. 키는 "x,y" */
	mapObjects: {} as { [position: string]: unknown },
	spriteLoads: [] as SpriteLoad[],
	httpPosts: [] as HttpPost[],
	/** Time.getUtcTime()이 돌려주는 값(ms). tick이 진행시킨다 */
	nowMs: 1_700_000_000_000,
	hooks: {
		start: new Hook<[]>(),
		join: new Hook<[FakePlayer]>(),
		leave: new Hook<[FakePlayer]>(),
		destroy: new Hook<[]>(),
		say: new Hook<[FakePlayer, string]>(),
		update: new Hook<[number]>(),
		/** 맵 오브젝트 충돌. (player, x, y, tileID, obj) */
		objectTouched: new Hook<[FakePlayer, number, number, number, { param1: string }]>(),
	},
};

const fakeScriptApp = {
	enableFreeView: true,
	spaceHashID: "test-space",
	mapHashID: "test-map",

	get players(): FakePlayer[] {
		return world.players.slice();
	},

	get playerCount(): number {
		return world.players.length;
	},

	getPlayerByID(...args: unknown[]): FakePlayer | null {
		checkCall("ScriptApp.getPlayerByID", args, 1, 1);
		const id = args[0] as string;
		for (const player of world.players) {
			if (player.id === id) return player;
		}
		// 접속이 끊긴 플레이어. 프로덕션과 같이 null이다
		return null;
	},

	loadSpritesheet(...args: unknown[]): object {
		checkCall("ScriptApp.loadSpritesheet", args, 4, 5);
		const load: SpriteLoad = {
			file: args[0] as string,
			width: args[1] as number,
			height: args[2] as number,
			frames: args[3],
			hasFps: args.length === 5,
		};
		world.spriteLoads.push(load);
		return load;
	},

	httpPostJson(...args: unknown[]): void {
		checkCall("ScriptApp.httpPostJson", args, 4, 4);
		world.httpPosts.push({ url: args[0] as string, body: args[2] });
		(args[3] as (response: string) => void)("{}");
	},

	putMobilePunch(): void {},
	sendUpdated(): void {},

	onStart: world.hooks.start,
	onJoinPlayer: world.hooks.join,
	onLeavePlayer: world.hooks.leave,
	onDestroy: world.hooks.destroy,
	onSay: world.hooks.say,
	onUpdate: world.hooks.update,
	onObjectTouched: world.hooks.objectTouched,
};

const fakeScriptMap = {
	putObject(...args: unknown[]): void {
		checkCall("ScriptMap.putObject", args, 3, 4);
		const key = `${args[0]},${args[1]}`;
		if (args[2] === null) delete world.mapObjects[key];
		else world.mapObjects[key] = args[2];
	},
};

const fakeTime = {
	getTime(): number {
		return world.nowMs;
	},
	getUtcTime(): number {
		return world.nowMs;
	},
};

/**
 * 결정적 난수(mulberry32).
 *
 * 직업 배분은 RoleAssignment.shuffle이 Math.random으로 섞는다. 그대로 두면
 * 매 실행마다 좌석 배치가 달라져 "seats[0]이 정치인이었다"는 이유로 테스트가
 * 간헐적으로 깨진다. 실패를 재현할 수 없는 테스트는 없느니만 못하므로
 * 시계(Time)와 마찬가지로 난수도 하네스가 소유한다.
 *
 * shuffle/buildRoleDeck은 rng를 인자로 받도록 이미 열려 있지만, 그것을
 * 실제로 호출하는 GameFlow.beginGame은 기본값(Math.random)을 쓴다.
 * 테스트를 위해 GameFlow에 rng 배선을 추가하는 대신 전역을 바꾼다 —
 * ScriptApp·Time을 이미 그렇게 다루고 있고, 프로덕션 코드에 손대지 않는다.
 */
let rngState = 0;

export function seedRandom(seed: number): void {
	rngState = seed;
}

function nextRandom(): number {
	rngState = (rngState + 0x6d2b79f5) | 0;
	let t = rngState;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * 전역을 심는다. 여러 번 불러도 안전하다.
 *
 * ScriptApp/ScriptMap/Time은 zep-script가 `declare global { namespace ... }`로
 * 선언하므로 런타임 실체가 없다. 타입 시스템 쪽은 그 선언을 그대로 두고
 * 런타임에만 가짜를 얹기 위해 globalThis에 직접 대입한다.
 */
export function installFakeZep(): void {
	const globals = globalThis as unknown as { [name: string]: unknown };
	if (globals.ScriptApp === fakeScriptApp) return;
	globals.ScriptApp = fakeScriptApp;
	globals.ScriptMap = fakeScriptMap;
	globals.Time = fakeTime;
	Math.random = nextRandom;
}

installFakeZep();
