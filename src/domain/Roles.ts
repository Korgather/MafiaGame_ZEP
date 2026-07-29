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
import type { SpriteKey } from "../constants/Assets.ts";

/** 밤에 대상을 지목했을 때 일어나는 일의 종류 */
export const NightActionKind = {
	/** 의사: 대상을 마피아의 처형에서 보호 */
	HEAL: "HEAL",
	/** 마피아: 대상을 처형 대상으로 지목 */
	KILL: "KILL",
	/** 경찰: 대상이 마피아인지만 확인 */
	INSPECT_TEAM: "INSPECT_TEAM",
	/** 스파이: 대상의 정확한 직업 확인. 마피아면 합류하고 능력을 소모하지 않음 */
	INSPECT_ROLE: "INSPECT_ROLE",
} as const;
export type NightActionKind = (typeof NightActionKind)[keyof typeof NightActionKind];

/** 밤에 열리는 채팅 채널 */
export const ChatChannel = {
	MAFIA: "MAFIA",
	GHOST: "GHOST",
} as const;
export type ChatChannel = (typeof ChatChannel)[keyof typeof ChatChannel];

export interface RoleDef {
	/** 위젯·라벨에 노출되는 한글 이름. 게임 로직은 이 값을 비교하지 않는다 */
	readonly displayName: string;
	/** 시작 진영. 스파이는 게임 중 마피아로 바뀔 수 있다 */
	readonly team: Team;
	/** 직업 공개 카드 위젯 */
	readonly cardWidget: string;
	/** 밤에 지목할 대상이 있으면 그 종류, 없으면 null */
	readonly nightAction: NightActionKind | null;
	/** 밤에 참여하는 채팅 채널 */
	readonly nightChat: ChatChannel | null;
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
}

const NO_CHAT = "🌙 밤에는 채팅을 할 수 없습니다.";
const MAFIA_CHAT = "🌙 밤에는 마피아팀끼리 채팅을 공유할 수 있습니다.";

export const ROLE_DEFS: Record<Role, RoleDef> = {
	MAFIA: {
		displayName: "마피아",
		team: Team.MAFIA,
		cardWidget: "mafia.html",
		nightAction: NightActionKind.KILL,
		nightChat: ChatChannel.MAFIA,
		nightSprite: "mafia",
		nightAttackSprite: "mafiaAttack",
		nightPrompt: "처형할 대상을 선택하세요.",
		nightNotice: MAFIA_CHAT,
		immuneToVote: false,
	},
	DOCTOR: {
		displayName: "의사",
		team: Team.CITIZEN,
		cardWidget: "doctor.html",
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
		cardWidget: "police.html",
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
		cardWidget: "spy.html",
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
		cardWidget: "spiritian.html",
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
		cardWidget: "politician.html",
		nightAction: null,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: null,
		nightNotice: NO_CHAT,
		immuneToVote: true,
	},
	CITIZEN: {
		displayName: "시민",
		team: Team.CITIZEN,
		cardWidget: "citizen.html",
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
