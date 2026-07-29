/**
 * 직업 정의 테이블.
 *
 * 기존에는 직업별 동작이 세 곳에 나뉘어 하드코딩되어 있었다.
 *   - showRoleWidget: 한글 이름 → 카드 위젯 파일명 switch
 *   - nightPlayerEvent: 한글 이름 → 약 300줄짜리 switch (스프라이트/문구/능력)
 *   - gameEndCheck / dead / voteResult: 한글 이름 직접 비교
 *
 * 직업을 하나 추가하려면 이 세 곳을 모두 고쳐야 했고, 한 곳을 빠뜨려도
 * 컴파일 에러가 나지 않았다. 실제로 team 값이 "mafia"인데 "마피아"와
 * 비교하는 코드가 남아 경험치 지급 분기가 통째로 죽어 있었다.
 *
 * 이제 직업 하나 = 이 테이블의 항목 하나다. Record<Role, RoleDef> 타입 덕분에
 * Role을 추가하면 여기에 항목을 넣기 전까지 컴파일이 실패한다.
 */
import { Role, Team } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import type { SpriteKey } from "../constants/Assets.ts";
import { POLITICIAN_VOTE_WEIGHT } from "../constants/GameConfig.ts";
import { ChatChannel } from "./chat/ChatChannel.ts";
import type { NightChannel } from "./chat/ChatChannel.ts";

/**
 * 밤에 대상을 지목했을 때 일어나는 일의 종류.
 *
 * 기존에는 마피아 전용 KILL이 있었다. 자경단원(오사하면 자책)과
 * 짐승인간(마피아와 별개로 문다)을 추가하면서 KILL·SHOOT·BITE 셋을
 * 두는 길이 먼저 보였지만, 셋의 정산 로직은 완전히 같다 —
 * "이 좌석을 공격한다"이고 차이는 *누가 때렸는가*에서만 나온다.
 * 그래서 종류는 ATTACK 하나로 두고, 차이는 공격자의 RoleDef가 들고 있는다.
 * 직업이 아니라 행동을 열거하는 쪽이 직업 수와 무관하게 유지된다.
 */
export const NightActionKind = {
	/** 의사: 대상을 공격에서 보호 */
	HEAL: "HEAL",
	/** 마피아·자경단원·짐승인간: 대상을 공격 대상으로 지목 */
	ATTACK: "ATTACK",
	/** 경찰: 대상이 마피아로 보이는지만 확인 */
	INSPECT_TEAM: "INSPECT_TEAM",
	/** 스파이: 대상의 정확한 직업 확인. 마피아면 합류하고 능력을 소모하지 않음 */
	INSPECT_ROLE: "INSPECT_ROLE",
	/** 건달: 대상의 다음 낮 투표를 막는다 */
	SILENCE: "SILENCE",
	/** 기자: 대상의 직업을 다음 아침에 전체 공개한다 */
	SCOOP: "SCOOP",
} as const;
export type NightActionKind = (typeof NightActionKind)[keyof typeof NightActionKind];

export interface RoleDef {
	/** 위젯·라벨에 노출되는 한글 이름. 게임 로직은 이 값을 비교하지 않는다 */
	readonly displayName: string;
	/** 시작 진영. 스파이는 게임 중 마피아로 바뀔 수 있다 */
	readonly team: Team;
	/**
	 * 직업 카드에 쓰는 기호.
	 *
	 * 기존에는 직업마다 카드 이미지가 따로 있었다(넷은 imgur, 셋은 base64로
	 * 462KB). 그림에 담긴 정보는 직업 이름뿐이었는데, imgur가 죽으면 카드가
	 * 빈 화면이 되고 해상도가 다르면 뭉갰다. 직업이 늘 때마다 그림도 늘었다.
	 * 그림을 되살리고 싶으면 여기에 cardImage 한 줄을 추가하면 된다.
	 */
	readonly glyph: string;
	/** 카드에 적는 능력 한 줄. "나는 무엇을 할 수 있는가" */
	readonly ability: string;
	/** 카드에 적는 요령 한 줄. "그래서 어떻게 이기는가" */
	readonly tip: string;
	/** 밤에 지목할 대상이 있으면 그 종류, 없으면 null */
	readonly nightAction: NightActionKind | null;
	/** 밤에 참여하는 비밀 채팅 채널 */
	readonly nightChat: NightChannel | null;
	/** 밤 동안 바뀌는 캐릭터 스프라이트 */
	readonly nightSprite: SpriteKey | null;
	/** 밤 동안 바뀌는 공격 이펙트 스프라이트 */
	readonly nightAttackSprite: SpriteKey | null;
	/** 밤에 화면 중앙에 띄우는 안내. nightAction이 있으면 필수 */
	readonly nightPrompt: string | null;
	/** 밤 시작 시 채팅창에 보내는 안내 */
	readonly nightNotice: string;
	/** 투표로 처형되지 않는가 */
	readonly immuneToVote: boolean;

	// ── 아래는 전부 "끄면 아무 일도 없음"이 안전한 기본값인 능력 플래그다.
	//
	// team이나 nightAction을 빠뜨리면 게임이 성립하지 않으므로 필수로 두지만,
	// 이 플래그들은 빠뜨려도 "평범한 직업"으로 조용히 떨어진다. 12개 항목에
	// false를 마흔 번 적는 대신 켜는 직업에서만 true를 적는다.

	/**
	 * 경찰 조사에 마피아로 나오는가.
	 *
	 * team으로 판정할 수는 없다 — 스파이는 마피아를 찾아내면 team이 MAFIA로
	 * 바뀌지만 여전히 시민 팀 사람이고, 경찰에게 잡히면 억울하다.
	 * 반대로 role === MAFIA 하드코딩은 건달을 놓친다. 판정은 진영도 직업도
	 * 아니고 "어떻게 보이도록 설계된 직업인가"라는 별개의 축이다.
	 */
	readonly appearsAsMafia?: boolean;
	/**
	 * 이 사람이 던지는 표의 무게. 없으면 1표.
	 *
	 * 짝인 immuneToVote는 처음부터 여기 있었는데 표의 무게만 Voting.ts에
	 * `role === POLITICIAN ? 2 : 1`로 남아 있었다. 같은 직업의 같은 능력
	 * 두 줄이 서로 다른 층에 있으면, 표를 두 장 쓰는 직업을 추가할 때
	 * 한쪽만 고치고 끝낼 위험이 상시로 존재한다.
	 */
	readonly voteWeight?: number;
	/** 능력을 게임 전체에서 한 번만 쓸 수 있는가 (자경단원·기자) */
	readonly oncePerGame?: boolean;
	/** 같은 진영을 죽이면 시전자도 함께 죽는가 (자경단원) */
	readonly backfiresOnAlly?: boolean;
	/** 첫 공격을 한 번 버티는가 (군인) */
	readonly survivesFirstAttack?: boolean;
	/**
	 * 공격을 지목한 순간 방 전체에 들리는 소리.
	 *
	 * 총성은 연출이자 정보다 — "오늘 밤 마피아가 움직였다"를 모두가 안다.
	 * 자경단원과 짐승인간까지 같은 소리를 내면 밤마다 총성 횟수로 공격자 수가
	 * 새므로, 소리를 내는 직업을 여기서 고른다. 없으면 조용히 지나간다.
	 */
	readonly attackSound?: string;
}

const NO_CHAT = "🌙 밤에는 채팅을 할 수 없습니다.";
const MAFIA_CHAT = "🌙 밤에는 마피아팀끼리 채팅을 공유할 수 있습니다.";
const LONE_MAFIA_TEAM = "🌙 당신은 마피아 팀이지만 마피아와 대화할 수 없습니다.";

export const ROLE_DEFS: Record<Role, RoleDef> = {
	MAFIA: {
		displayName: "마피아",
		team: Team.MAFIA,
		glyph: "🔪",
		ability: "밤마다 한 명을 처형합니다.",
		tip: "낮에는 시민인 척하세요. 마피아 수가 시민 수와 같아지면 이깁니다.",
		nightAction: NightActionKind.ATTACK,
		nightChat: ChatChannel.MAFIA,
		nightSprite: "mafia",
		nightAttackSprite: "mafiaAttack",
		nightPrompt: "처형할 대상을 선택하세요.",
		nightNotice: MAFIA_CHAT,
		immuneToVote: false,
		appearsAsMafia: true,
		attackSound: Sound.GUN,
	},
	DOCTOR: {
		displayName: "의사",
		team: Team.CITIZEN,
		glyph: "💉",
		ability: "밤마다 한 명을 마피아의 공격에서 지킵니다.",
		tip: "정체를 밝히면 다음 밤에 죽습니다. 조용히 지키세요.",
		nightAction: NightActionKind.HEAL,
		nightChat: null,
		nightSprite: "doctor",
		nightAttackSprite: null,
		nightPrompt: "살리고 싶은 대상을 선택하세요.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
	},
	POLICE: {
		displayName: "경찰",
		team: Team.CITIZEN,
		glyph: "🔍",
		ability: "밤마다 한 명이 마피아인지 조사합니다.",
		tip: "찾아냈다면 낮에 설득하세요. 다만 밝히는 순간 표적이 됩니다.",
		nightAction: NightActionKind.INSPECT_TEAM,
		nightChat: null,
		nightSprite: "police",
		nightAttackSprite: null,
		nightPrompt: "조사하고 싶은 대상을 선택하세요.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
	},
	SPY: {
		displayName: "스파이",
		team: Team.CITIZEN,
		glyph: "🕵️",
		ability: "밤마다 한 명의 정확한 직업을 알아냅니다. 마피아를 찾으면 그 채팅에 합류합니다.",
		tip: "당신은 시민 팀입니다. 마피아 채팅에서 얻은 정보를 시민에게 흘리세요.",
		nightAction: NightActionKind.INSPECT_ROLE,
		nightChat: ChatChannel.MAFIA,
		nightSprite: "spy",
		nightAttackSprite: null,
		nightPrompt: "조사하고 싶은 대상을 선택하세요.",
		// 마피아에 합류한 뒤에는 MAFIA_CHAT으로 바뀐다 (NightService에서 판단)
		nightNotice: NO_CHAT,
		immuneToVote: false,
	},
	SHAMAN: {
		displayName: "영매",
		team: Team.CITIZEN,
		glyph: "🔮",
		ability: "밤마다 죽은 사람들과 대화합니다.",
		tip: "죽은 사람은 자기를 죽인 쪽을 압니다. 그 말을 낮에 전하세요.",
		nightAction: null,
		nightChat: ChatChannel.GHOST,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: null,
		nightNotice: "🌙 죽은 혼령들과 대화할 수 있습니다.",
		immuneToVote: false,
	},
	POLITICIAN: {
		displayName: "정치인",
		team: Team.CITIZEN,
		glyph: "🎖️",
		ability: "투표로 처형되지 않고, 당신의 표는 2표로 계산됩니다.",
		tip: "처형되지 않으니 앞에 나서서 토론을 이끄세요.",
		nightAction: null,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: null,
		nightNotice: NO_CHAT,
		immuneToVote: true,
		voteWeight: POLITICIAN_VOTE_WEIGHT,
	},
	VIGILANTE: {
		displayName: "자경단원",
		team: Team.CITIZEN,
		glyph: "🔫",
		ability: "게임에 딱 한 번, 밤에 한 명을 사살합니다.",
		tip: "확신이 설 때만 쏘세요. 시민을 쏘면 책임을 지고 당신도 죽습니다.",
		nightAction: NightActionKind.ATTACK,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: "mafiaAttack",
		nightPrompt: "사살할 대상을 선택하세요. 이 판에 한 번뿐입니다.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
		oncePerGame: true,
		backfiresOnAlly: true,
	},
	SOLDIER: {
		displayName: "군인",
		team: Team.CITIZEN,
		glyph: "🪖",
		ability: "밤에 받는 첫 공격을 한 번 버팁니다.",
		tip: "한 번은 버팁니다. 살아남았다면 그날 밤 누군가 당신을 노렸다는 뜻입니다.",
		nightAction: null,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: null,
		nightNotice: NO_CHAT,
		immuneToVote: false,
		survivesFirstAttack: true,
	},
	THUG: {
		displayName: "건달",
		team: Team.MAFIA,
		glyph: "🥊",
		ability: "밤마다 한 명을 협박해 다음 낮 투표를 막습니다.",
		tip: "마피아와 대화할 수 없습니다. 경찰에게 잡히니 낮에는 조용히 계세요.",
		nightAction: NightActionKind.SILENCE,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "협박할 대상을 선택하세요.",
		nightNotice: LONE_MAFIA_TEAM,
		immuneToVote: false,
		appearsAsMafia: true,
	},
	REPORTER: {
		displayName: "기자",
		team: Team.CITIZEN,
		glyph: "📰",
		ability: "게임에 딱 한 번, 취재한 사람의 직업을 다음 아침 모두에게 공개합니다.",
		tip: "한 번뿐입니다. 의견이 갈려 아무도 확신하지 못할 때 터뜨리세요.",
		nightAction: NightActionKind.SCOOP,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "취재할 대상을 선택하세요. 이 판에 한 번뿐입니다.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
		oncePerGame: true,
	},
	BEAST: {
		displayName: "짐승인간",
		team: Team.MAFIA,
		glyph: "🐺",
		ability: "밤마다 한 명을 물어 죽입니다. 경찰 조사에는 시민으로 나옵니다.",
		tip: "마피아와 대화할 수 없습니다. 마피아와 같은 사람을 물면 그날 밤은 한 명만 죽습니다.",
		nightAction: NightActionKind.ATTACK,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "물어 죽일 대상을 선택하세요.",
		nightNotice: LONE_MAFIA_TEAM,
		immuneToVote: false,
		// 경찰에게 잡히지 않는 것이 이 직업의 존재 이유다. appearsAsMafia를 켜면
		// 마피아가 셋인 판이 되고, 끄면 "찾을 수 없는 살인마"가 된다.
	},
	CITIZEN: {
		displayName: "시민",
		team: Team.CITIZEN,
		glyph: "🧑",
		ability: "특별한 능력은 없습니다.",
		tip: "당신의 무기는 투표입니다. 낮 토론을 잘 듣고 판단하세요.",
		nightAction: null,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: null,
		nightNotice: NO_CHAT,
		immuneToVote: false,
	},
};

export function roleDef(role: Role): RoleDef {
	return ROLE_DEFS[role];
}

/** 위젯으로 보낼 한글 이름 */
export function roleName(role: Role): string {
	return ROLE_DEFS[role].displayName;
}

/**
 * 이 좌석이 지금 마피아 채팅에 들어가 있는가.
 *
 * 기존에는 `seat.team === Team.MAFIA` 한 줄이 곧 "마피아 채팅 참가자"였다.
 * 진영과 채팅이 같은 집합이던 시절에는 맞았지만 건달·짐승인간은 마피아 팀이면서
 * 대화는 못 하고, 스파이는 합류 전까지 시민 팀이면서 채팅창을 갖고 있다.
 * 두 개념이 갈라진 이상 판정을 한 곳에 못 박지 않으면 중계·인원수·스파이 합류가
 * 서로 다른 답을 내놓게 된다.
 */
export function inMafiaChat(seat: { role: Role; team: Team }): boolean {
	return seat.team === Team.MAFIA && ROLE_DEFS[seat.role].nightChat === ChatChannel.MAFIA;
}

/**
 * 살아 있으면서 유령 채널을 듣는 직업인가 (영매).
 *
 * inMafiaChat과 짝이다. 판정 자체는 한 줄이지만, 이 한 줄이 Chat.relayGhost와
 * Night.openNightView 두 곳에 각각 적혀 있었고 한쪽은 alive 조건이 붙어 있고
 * 다른 쪽은 없었다. 직업이 아니라 능력으로 묻는 함수를 하나 두면 그런
 * 어긋남이 생길 자리가 없다.
 */
export function hearsGhosts(seat: { role: Role }): boolean {
	return ROLE_DEFS[seat.role].nightChat === ChatChannel.GHOST;
}
