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
import {
	POLITICIAN_VOTE_WEIGHT,
	POLITICIAN_WIN_WEIGHT,
	THUG_WIN_WEIGHT,
} from "../constants/GameConfig.ts";
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
	/** 스파이: 대상의 정확한 직업 확인. 마피아면 밤 정산에서 마피아로 넘어간다 */
	INSPECT_ROLE: "INSPECT_ROLE",
	/** 기자: 대상의 직업을 다음 아침에 전체 공개한다 */
	SCOOP: "SCOOP",
	/** 점쟁이: 대상이 밤에 지목하는 직업인지만 확인 */
	INSPECT_ABILITY: "INSPECT_ABILITY",
	/** 시민: 대상에게 정해진 문구 하나를 익명으로 보낸다 */
	NOTE: "NOTE",
	/**
	 * 마담: 대상의 능력을 막고 다음 낮의 발언까지 막는다.
	 *
	 * 밤 능력을 막는 유일한 종류다. 예전에는 "그 밤에만 사는 차단"을 뜻하는
	 * BLOCK이 따로 있었지만, 클래식에서 그 자리를 쓰던 직업(건달)이 낮
	 * 투표를 막는 쪽(INTIMIDATE)으로 옮겨가면서 아무도 쓰지 않게 되어 지웠다.
	 * 다시 필요해지면 그때 나눈다 — 나눌 근거는 수명이다. 밤에서 끝나는
	 * 차단과 다음 낮까지 이어지는 유혹은 "밤이 끝났는데 왜 아직 못 말하는가"를
	 * 행동 종류만으로 구별할 수 있어야 하기 때문이다.
	 */
	SEDUCE: "SEDUCE",
	/** 건달: 대상의 다음 낮 투표(지목·찬반)를 막는다. 밤 능력은 막지 않는다 */
	INTIMIDATE: "INTIMIDATE",
	/** 도둑: 대상의 기본 능력을 훔쳐 다음 밤에 쓴다 */
	STEAL: "STEAL",
	/** 사립탐정: 대상이 그 밤에 누구를 지목했는지 확인 */
	TRACK: "TRACK",
	/** 테러리스트: 함께 죽을 상대를 지목 */
	MARK: "MARK",
	/** 짐승인간: 대상을 노린다. 마피아와 같은 대상이면 접선, 접선 뒤에는 공격 */
	STALK: "STALK",
	/** 영매: 사망자의 직업을 확인하고 성불시킨다 */
	SEANCE: "SEANCE",
	/** 성직자: 사망자를 되살린다 */
	REVIVE: "REVIVE",
} as const;
export type NightActionKind = (typeof NightActionKind)[keyof typeof NightActionKind];

/**
 * 밤 정산에서 이 직업의 능력이 적용되는 시점.
 *
 * 예전에는 밤 능력이 클릭한 순서대로 대상을 바꿨다. 결과가 맞았던 것은
 * resolveNightCasualties가 밤 끝에 한 번만 보기 때문이지 순서를 정했기
 * 때문이 아니다. 능력을 막는 능력(차단)이 들어오면서 그 우연은 깨졌다 —
 * 막을 사람이 늦게 누르면 이미 지나간 능력을 막게 됐다.
 *
 * 숫자 사이를 비워 둔 것은 나중에 끼우기 위해서다. 원문 기획의 SWAP(10)은
 * 여전히 비어 있다 — 도둑을 넣으면서 후보가 되었지만, 훔치기를 SWAP에 두면
 * 유혹·차단보다 먼저 돌아 "막혔는데도 훔쳤다"가 된다. 훔치기는 AFTER다.
 *
 * 값이 아니라 순서만 뜻한다. STEP_ORDER(NightPipeline.ts)가 이 순서를
 * 배열로 고정한다 — Jint에서 sort 안정성을 믿지 않기로 했으므로 정렬하지 않는다.
 */
export const NightStep = {
	/** 능력 차단 — 마담 */
	BLOCK: 20,
	/** 보호 — 의사 */
	PROTECT: 30,
	/** 공격 — 마피아·짐승인간·자경단원 */
	ATTACK: 40,
	/**
	 * 접선 — 짐승인간이 마피아와 같은 대상을 노렸는지 확인한다.
	 *
	 * ATTACK 뒤인 이유는 그 시점에야 마피아의 지목이 모두 등록돼 있어서고,
	 * DEATH 앞인 이유는 접선한 짐승인간이 그 밤의 공격을 아직 등록할 수
	 * 있어야 해서다. 둘 사이가 아니면 같은 step 안의 좌석 순서에 결과가 걸린다.
	 */
	CONTACT: 45,
	/** 사망 확정 + 자경단원 자책 */
	DEATH: 50,
	/** 연쇄 — 테러리스트 자폭·연인 동반 사망 */
	CHAIN: 55,
	/** 소생 — 성직자. 연쇄까지 끝난 뒤라야 "이 밤의 사망자"가 확정돼 있다 */
	REVIVE: 58,
	/** 조사 — 경찰·스파이·점쟁이·영매 */
	INSPECT: 60,
	/** 사후 — 기자 특종·시민 쪽지·사기꾼 역알림·건달 협박·도둑 훔치기·탐정 미행 */
	AFTER: 70,
} as const;
export type NightStep = (typeof NightStep)[keyof typeof NightStep];

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
	/**
	 * 밤 정산에서 이 직업이 처리되는 시점.
	 *
	 * nightAction이 null인 직업도 값을 적는다. 지목이 없어도 사후 효과가
	 * 붙을 수 있어서다 — 사기꾼은 아무도 지목하지 않지만 AFTER에서
	 * "누가 나를 조사했는가"를 받는다.
	 */
	readonly nightStep: NightStep;
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
	// 이 플래그들은 빠뜨려도 "평범한 직업"으로 조용히 떨어진다. 14개 항목에
	// false를 마흔 번 적는 대신 켜는 직업에서만 true를 적는다.

	/**
	 * 경찰 조사에 마피아로 나오는가.
	 *
	 * team으로 판정할 수는 없다 — 스파이는 마피아를 찾아내면 team이 MAFIA로
	 * 바뀌지만, 들키지 않는 것이 그 직업의 능력이라 조사에는 계속 시민으로 나온다.
	 * 짐승인간과 사기꾼도 마피아 팀이면서 조사에는 시민으로 나와야 하고,
	 * 사기꾼은 그것이 직업의 전부다. 오늘 이 플래그를 켠 직업은 마피아
	 * 하나뿐이라 role === MAFIA 하드코딩과 답이 우연히 같지만, 같은 것은
	 * 답이지 기준이 아니다. 판정은 진영도 직업도 아니고 "어떻게 보이도록
	 * 설계된 직업인가"라는 별개의 축이다.
	 */
	readonly appearsAsMafia?: boolean;
	/**
	 * 조사당한 사실을 다음 아침에 본인에게 알린다.
	 *
	 * 사기꾼의 위장은 "마피아가 아니다"라고 나오는 것까지다. 그 위장이
	 * 통했는지 본인이 모르면 다음 날 무엇을 말해야 할지도 모른다.
	 * 누가 조사했는지는 알려주지 않는다 — 그건 경찰을 지목하는 능력이 된다.
	 */
	readonly notifiesOnInspect?: boolean;
	/**
	 * 이 사람이 던지는 표의 무게. 없으면 1표.
	 *
	 * 짝인 immuneToVote는 처음부터 여기 있었는데 표의 무게만 Voting.ts에
	 * `role === POLITICIAN ? 2 : 1`로 남아 있었다. 같은 직업의 같은 능력
	 * 두 줄이 서로 다른 층에 있으면, 표를 두 장 쓰는 직업을 추가할 때
	 * 한쪽만 고치고 끝낼 위험이 상시로 존재한다.
	 */
	readonly voteWeight?: number;
	/**
	 * 마피아 채팅에 있는 사람을 찾아내면 그 편으로 넘어가는가 (스파이).
	 *
	 * 이 한 줄이 스파이라는 직업의 전부다 — 진영이 바뀌고, 그 보상으로 능력도
	 * 소모되지 않는다. 그런데 그 규칙은 여기가 아니라 NightResolution의
	 * INSPECT_ROLE 가지에 조건 없이 박혀 있었다. 즉 "정확한 직업을 알아낸다"는
	 * 행동 자체가 배신을 뜻했다.
	 *
	 * 문제는 행동과 규칙이 1:1이 아니라는 것이다. 직업을 그대로 읽는 능력은
	 * 스파이만의 것이 아니어도 된다(점쟁이·해커·기자의 사전조사 같은 것들).
	 * 그런 직업을 추가하면 그 사람도 마피아를 찾은 순간 조용히 마피아가 된다 —
	 * 컴파일도 테스트도 통과하면서. 배신은 행동의 성질이 아니라 직업의 성질이다.
	 *
	 * 반대로 여기에 Role.SPY를 직접 비교하는 길도 있었지만, 그건 이 파일이
	 * 없애려고 만들어진 바로 그 형태다(직업 이름으로 분기하는 코드).
	 */
	readonly defectsToMafia?: boolean;
	/**
	 * 게임 전체에서 쓸 수 있는 횟수. 없으면 무제한 (자경단원·기자·시민이 1).
	 *
	 * 불리언 oncePerGame이었다. 세 직업이 같은 플래그를 쓰게 된 시점에서,
	 * 두 번 쓰는 직업이 하나만 나와도 플래그가 하나 더 늘어난다.
	 */
	readonly maxUses?: number;
	/**
	 * 첫 밤에만 쓸 수 있는가 (점쟁이).
	 *
	 * needsPriorDay의 정반대다. 저쪽은 "정보 없이 쓰면 주사위가 되는" 능력을
	 * 늦추고, 이쪽은 "정보가 다 모인 뒤에는 의미가 없는" 능력을 첫 밤에 묶는다.
	 * 횟수 제한과도 다른 축이다 — 몇 번인지가 아니라 언제인지를 정한다.
	 */
	readonly firstNightOnly?: boolean;
	/** 같은 진영을 죽이면 시전자도 함께 죽는가 (자경단원) */
	readonly backfiresOnAlly?: boolean;
	/** 첫 공격을 한 번 버티는가 (군인) */
	readonly survivesFirstAttack?: boolean;
	/**
	 * 마피아 팀의 캐내는 능력을 튕겨내고 그 사실을 본인에게 알리는가 (군인).
	 *
	 * 방탄(survivesFirstAttack)과 같은 직업의 능력이지만 자원이 다르다 —
	 * 방탄은 한 번 쓰면 사라지는 데 반해 이쪽은 소모되지 않는다. 두 축을
	 * 한 플래그로 묶으면 조사를 한 번 튕긴 군인이 공격에 그냥 죽는다.
	 *
	 * "캐내는 능력"의 판정은 능력 종류로 한다(INSPECT_ROLE·STEAL). 시전자의
	 * 팀으로 물으면 스파이가 접선 전에는 시민 팀이라 그냥 통과한다 — 그런데
	 * 접선 전 첩보야말로 이 능력이 막아야 할 바로 그것이다.
	 */
	readonly deflectsMafiaProbe?: boolean;
	/**
	 * 낮을 한 번은 보내야 쓸 수 있는가 (자경단원·스파이)
	 *
	 * 첫 밤에는 아무도 아무것도 모른다. 그 상태로 쓰는 능력은 추리가 아니라
	 * 주사위이고, 그 주사위 한 번으로 4~7명 판은 첫 아침이 오기 전에 끝났다.
	 * 자경단원은 시민 둘(대상 + 자책)을 지웠고, 스파이는 진영을 옮겨
	 * 승패 마진을 2 깎았다(마피아 +1, 시민 -1).
	 *
	 * 덱에서 직업을 빼는 대신 능력에 조건을 다는 쪽을 택했다. 원인은
	 * "그 직업이 있다"가 아니라 "정보 없이 쓴다"이기 때문이다. 자리를 빼면
	 * 최소 인원 판에서 뽑힐 직업이 줄어 매 판 같은 구성이 되기도 한다.
	 *
	 * "첫 밤만으로 게임이 끝나는 덱은 나오지 않는다" 테스트가 이 플래그를 읽어
	 * 첫 밤 최악의 상황을 만든다 — 켜져 있으면 그 직업은 첫 밤에 아무것도 못 한다.
	 */
	readonly needsPriorDay?: boolean;
	/**
	 * 자기 자신은 대상으로 고를 수 없는가 (건달·마담·도둑·사립탐정·테러리스트).
	 *
	 * 켜는 기준은 "자기에게 쓰면 반드시 손해이거나 아무 일도 없는가"다.
	 * 마담이 자기를 유혹하면 자기 낮 발언만 잃고, 건달이 자기를 협박하면
	 * 자기 표만 잃는다. 도둑은 자기 능력을 자기에게서 훔쳐 제자리이고,
	 * 사립탐정은 자기가 누구를 미행했는지를 알게 될 뿐이며, 테러리스트는
	 * 한 번뿐인 자폭을 혼자 쓴다. 위젯에서 아예 잠근다.
	 *
	 * 자경단원에게는 일부러 켜지 않았다. 자기를 쏘는 것은 빈 수가 아니라
	 * 실제로 죽는 수다("자기 자신을 지목해도 막지 않는다",
	 * tests/night-pipeline.test.ts). 나쁜 선택을 막는 것은 이 플래그의 일이
	 * 아니다 — 그건 규칙이 아니라 후견이고, 같은 논리를 밀면 의사의 자가
	 * 치료(명백한 정식 수)까지 같은 잣대에 걸린다.
	 *
	 * 알려진 문제(자기를 쏜 자경단원에게 BACKFIRED가 안 붙는다)와도 다른
	 * 축이다. 그건 아침에 붙는 결과 라벨이 틀린 것인데, 지목을 막으면
	 * 상황을 숨길 뿐 라벨을 고치지는 못한다.
	 */
	readonly noSelfTarget?: boolean;
	/**
	 * 공격을 지목한 순간 방 전체에 들리는 소리.
	 *
	 * 총성은 연출이자 정보다 — "오늘 밤 마피아가 움직였다"를 모두가 안다.
	 * 자경단원과 짐승인간까지 같은 소리를 내면 밤마다 총성 횟수로 공격자 수가
	 * 새므로, 소리를 내는 직업을 여기서 고른다. 없으면 조용히 지나간다.
	 */
	readonly attackSound?: string;
	/**
	 * 승리 판정에서 이 좌석이 몇 명으로 세어지는가. 없으면 1명.
	 *
	 * voteWeight와 헷갈리기 쉬우나 완전히 다른 축이다. voteWeight는 낮에
	 * 던지는 표의 무게고, 이쪽은 "마피아 수 ≥ 시민 수"를 셀 때의 무게다.
	 * 정치인은 두 값이 우연히 2로 같지만 건달은 표 1장에 승리 가중치 3이다 —
	 * 한 필드로 합치면 건달이 낮에 세 표를 던지게 된다.
	 */
	readonly winWeight?: number;
	/**
	 * 마피아팀 보조직업인가 (스파이·짐승인간·마담·도둑).
	 *
	 * 마피아 본직과 나누는 축이다. 클래식 구성표가 "마피아 n명 + 보조 1명"으로
	 * 자리를 세므로 배정이 이 값을 읽고, 밤 공격 예산도 본직 수만 따른다.
	 * team === MAFIA로는 갈리지 않는다 — 사기꾼도 마피아 팀이지만 보조 자리가
	 * 아니라 마피아 본직 풀(표준전)에서 나온다.
	 */
	readonly isMafiaSupport?: boolean;
	/**
	 * 접선해야 마피아로 인정받는가 (스파이·짐승인간).
	 *
	 * isMafiaSupport와 겹쳐 보이지만 다른 축이다. 마담과 도둑은 보조이면서도
	 * 처음부터 마피아와 대화하고 승리 인원에 세지지만, 스파이와 짐승인간은
	 * 접선 전까지 밀담을 보지 못하고 승리 인원에도 들지 않는다.
	 * 한 필드로 합치면 마담이 첫 밤에 혼자 앉아 있게 된다.
	 *
	 * 접선하는 *방법*은 여기 없다 — 스파이는 조사(defectsToMafia), 짐승인간은
	 * 같은 대상 지목(STALK)으로, 각자의 능력이 곧 조건이다. 이 플래그는
	 * "seat.contacted를 false로 시작하는가"만 정한다.
	 */
	readonly needsContact?: boolean;
	/**
	 * 마피아의 밤 공격에 죽지 않는가 (짐승인간).
	 *
	 * 같은 편을 잘못 때리는 사고를 막는 규칙이라 방어(의사)와는 별개 축이다.
	 * survivesFirstAttack이 "한 번 버틴다"인 것과 달리 이쪽은 영구적이고,
	 * 자경단원·테러리스트 등 마피아가 아닌 공격에는 걸리지 않는다.
	 */
	readonly immuneToMafiaKill?: boolean;
	/**
	 * 살아 있는 사람이 아니라 사망자를 지목하는가 (영매·성직자).
	 *
	 * 위젯의 대상 목록과 파이프라인의 유효성 검사가 같은 값을 읽어야 한다.
	 * 한쪽에만 두면 "위젯에는 뜨는데 서버가 거절하는" 칸이 생긴다.
	 */
	readonly targetsDead?: boolean;
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
		nightStep: NightStep.ATTACK,
		nightChat: ChatChannel.MAFIA,
		nightSprite: "mafia",
		nightAttackSprite: "bullet",
		nightPrompt: "처형할 대상을 선택하세요.",
		nightNotice: MAFIA_CHAT,
		immuneToVote: false,
		appearsAsMafia: true,
		attackSound: Sound.STRIKE,
	},
	DOCTOR: {
		displayName: "의사",
		team: Team.CITIZEN,
		glyph: "💉",
		ability: "밤마다 한 명을 마피아의 공격에서 지킵니다.",
		tip: "정체를 밝히면 다음 밤에 죽습니다. 조용히 지키세요.",
		nightAction: NightActionKind.HEAL,
		nightStep: NightStep.PROTECT,
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
		nightStep: NightStep.INSPECT,
		nightChat: null,
		nightSprite: "police",
		nightAttackSprite: null,
		nightPrompt: "조사하고 싶은 대상을 선택하세요.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
		// 자기 조사는 언제나 "비마피아"라 정보가 0인데 그 밤 하나를 통째로
		// 버린다. 잃는 것이 없으므로 칸을 잠근다. 의사가 자기 치료를 허용하는
		// 것과 정반대인 이유가 여기다 — 그쪽은 자기를 고르는 것이 한 수다
		noSelfTarget: true,
	},
	SPY: {
		displayName: "스파이",
		team: Team.CITIZEN,
		glyph: "🕵️",
		ability: "둘째 밤부터, 밤마다 한 명의 정확한 직업을 알아냅니다.",
		// 예전 문구는 "당신은 시민 팀입니다. 얻은 정보를 시민에게 흘리세요"였다.
		// 규칙과 정반대였다 — 합류하면 team이 MAFIA로 바뀌므로, 시키는 대로
		// 시민을 도와 시민이 이기면 스파이 본인은 패배로 기록된다.
		tip: "마피아를 찾아내면 그 편이 되어 함께 이깁니다. 찾을 때까지는 시민입니다.",
		nightAction: NightActionKind.INSPECT_ROLE,
		nightStep: NightStep.INSPECT,
		nightChat: ChatChannel.MAFIA,
		nightSprite: "spy",
		nightAttackSprite: null,
		nightPrompt: "조사하고 싶은 대상을 선택하세요.",
		// 마피아에 합류한 뒤에는 MAFIA_CHAT으로 바뀐다 (NightService에서 판단)
		nightNotice: NO_CHAT,
		immuneToVote: false,
		defectsToMafia: true,
		// 자경단원과 같은 이유다. 첫 밤 조사는 추리가 아니라 주사위인데,
		// 그 주사위가 맞으면 진영이 옮겨가 마진이 2 줄고(마피아 +1, 시민 -1)
		// 4~7명 판은 아무도 한 마디 하기 전에 아침에 끝났다.
		needsPriorDay: true,
		isMafiaSupport: true,
		needsContact: true,
	},
	SHAMAN: {
		displayName: "영매",
		team: Team.CITIZEN,
		glyph: "🔮",
		ability: "밤마다 죽은 사람들과 대화하고, 그중 한 명을 성불시켜 직업을 봅니다.",
		tip: "죽은 사람은 자기를 죽인 쪽을 압니다. 그 말을 낮에 전하세요.",
		// 예전에는 지목이 없었다(대화만). 성불을 붙이면서 지목이 생겼는데,
		// 대상이 사망자라 살아 있는 사람 격자를 그대로 쓸 수 없다 — targetsDead가
		// 위젯과 서버 유효성 검사 양쪽에 같은 목록을 쓰게 만든다.
		nightAction: NightActionKind.SEANCE,
		nightStep: NightStep.INSPECT,
		nightChat: ChatChannel.GHOST,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "성불시킬 혼령을 선택하세요.",
		nightNotice: "🌙 죽은 혼령들과 대화할 수 있습니다.",
		immuneToVote: false,
		targetsDead: true,
	},
	POLITICIAN: {
		displayName: "정치인",
		team: Team.CITIZEN,
		glyph: "🎖️",
		ability: "투표로 처형되지 않고, 당신의 표는 2표로 계산됩니다.",
		tip: "처형되지 않으니 앞에 나서서 토론을 이끄세요.",
		nightAction: null,
		nightStep: NightStep.AFTER,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: null,
		nightNotice: NO_CHAT,
		immuneToVote: true,
		voteWeight: POLITICIAN_VOTE_WEIGHT,
		// 표의 무게와 값이 같지만 뜻이 다른 축이다 — 마피아가 이기려면
		// 정치인 한 명을 두 명으로 세고 넘어서야 한다. winWeight 선언 참고.
		winWeight: POLITICIAN_WIN_WEIGHT,
	},
	VIGILANTE: {
		displayName: "자경단원",
		team: Team.CITIZEN,
		glyph: "🔫",
		ability: "둘째 밤부터, 게임에 딱 한 번 한 명을 사살합니다.",
		tip: "낮의 이야기를 듣고 쏘세요. 시민을 쏘면 책임을 지고 당신도 죽습니다.",
		nightAction: NightActionKind.ATTACK,
		nightStep: NightStep.ATTACK,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: "bullet",
		nightPrompt: "사살할 대상을 선택하세요. 이 판에 한 번뿐입니다.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
		maxUses: 1,
		backfiresOnAlly: true,
		needsPriorDay: true,
	},
	SOLDIER: {
		displayName: "군인",
		team: Team.CITIZEN,
		glyph: "🪖",
		ability: "밤에 받는 첫 공격을 한 번 버팁니다. 마피아 팀이 캐내려 하면 튕겨내고 누구였는지 알아냅니다.",
		tip: "한 번은 버팁니다. 살아남았다면 그날 밤 누군가 당신을 노렸다는 뜻입니다.",
		nightAction: null,
		nightStep: NightStep.AFTER,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: null,
		nightNotice: NO_CHAT,
		immuneToVote: false,
		survivesFirstAttack: true,
		deflectsMafiaProbe: true,
	},
	THUG: {
		displayName: "건달",
		team: Team.CITIZEN,
		glyph: "🥊",
		ability: "밤마다 한 명을 협박해 다음 낮의 투표를 막습니다. 마피아 세 명 몫으로 세어집니다.",
		// 예전에는 밤 능력을 막는 직업이었다. 클래식의
		// 건달은 낮을 막는다 — 협박당한 사람은 지목도 찬반도 하지 못하고,
		// 찬반에서는 미응답이 반대표로 세어진다. 밤을 막는 자리는 마담이 잇는다.
		tip: "당신이 살아 있는 한 마피아는 좀처럼 이기지 못합니다. 대신 표적이 됩니다.",
		nightAction: NightActionKind.INTIMIDATE,
		// AFTER인 것이 핵심이다. 협박의 효과는 다음 낮에 나타나므로 밤의
		// 어떤 판정도 이 값을 읽지 않는다. 반대로 협박당한 건달 자신은
		// 파이프라인의 blocked 가드에 걸려 그 밤의 협박을 못 한다.
		nightStep: NightStep.AFTER,
		nightChat: null,
		// 밤에 바뀌는 모습이 없다. 협박은 그 밤의 방에 아무 흔적도 남기지 않는
		// 능력이라, 스프라이트가 바뀌면 그 자체가 "건달이 여기 있다"가 된다.
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "협박할 대상을 선택하세요.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
		// 자기를 협박하면 자기 표만 잃는다 — 이유는 noSelfTarget 선언에 적었다
		noSelfTarget: true,
		// 표는 한 장인데 승리 판정에서는 세 명이다. voteWeight와 나눠 둔 이유가
		// 이 어긋남이다 — 한 필드로 합치면 건달이 낮에 세 표를 던진다.
		winWeight: THUG_WIN_WEIGHT,
	},
	REPORTER: {
		displayName: "기자",
		team: Team.CITIZEN,
		glyph: "📰",
		ability: "게임에 딱 한 번, 취재한 사람의 직업을 다음 아침 모두에게 공개합니다.",
		tip: "한 번뿐입니다. 의견이 갈려 아무도 확신하지 못할 때 터뜨리세요.",
		nightAction: NightActionKind.SCOOP,
		nightStep: NightStep.AFTER,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "취재할 대상을 선택하세요. 이 판에 한 번뿐입니다.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
		maxUses: 1,
	},
	BEAST: {
		displayName: "짐승인간",
		team: Team.MAFIA,
		glyph: "🐺",
		ability: "마피아와 같은 사람을 노리면 접선합니다. 접선한 뒤에는 밤마다 한 명을 물어 죽입니다.",
		// 예전에는 처음부터 혼자 무는 독립 공격자였고, 조언도 "마피아와 겹치지
		// 말라"였다. 클래식에서는 정확히 반대다 — 겹쳐야 합류한다.
		tip: "마피아가 노릴 만한 사람을 함께 노리세요. 접선 전에는 아무도 죽이지 못합니다.",
		nightAction: NightActionKind.STALK,
		// CONTACT(45)에 서는 이유는 NightStep 선언에 적었다. ATTACK 뒤라
		// 마피아의 지목이 다 등록돼 있고, DEATH 앞이라 접선한 밤의 공격을
		// 아직 등록할 수 있다.
		nightStep: NightStep.CONTACT,
		// 접선 전에는 null이다. 접선하면 seat.contacted가 켜지고 밤 채팅이
		// 열린다 — 판단은 좌석 상태를 아는 쪽(Night 서비스)이 한다.
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: "claw",
		nightPrompt: "노릴 대상을 선택하세요.",
		nightNotice: LONE_MAFIA_TEAM,
		immuneToVote: false,
		// 경찰에게 잡히지 않는 것이 이 직업의 존재 이유다. appearsAsMafia를 켜면
		// 마피아가 셋인 판이 되고, 끄면 "찾을 수 없는 살인마"가 된다.
		isMafiaSupport: true,
		needsContact: true,
		// 마피아가 접선 전의 짐승인간을 모르고 때리는 사고를 막는다. 자경단원과
		// 테러리스트에게는 걸리지 않는다 — 마피아의 공격만 빗나간다.
		immuneToMafiaKill: true,
	},
	CON_ARTIST: {
		displayName: "사기꾼",
		team: Team.MAFIA,
		glyph: "🎭",
		ability: "경찰 조사에 시민으로 나옵니다. 조사당하면 다음 아침에 알게 됩니다.",
		tip: "당당하게 조사를 요구하세요. 당신은 절대 마피아로 나오지 않습니다.",
		nightAction: null,
		nightStep: NightStep.AFTER,
		nightChat: ChatChannel.MAFIA,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: null,
		nightNotice: MAFIA_CHAT,
		immuneToVote: false,
		notifiesOnInspect: true,
		// appearsAsMafia를 켜지 않는다 — 그것이 이 직업의 전부다
	},
	SEER: {
		displayName: "점쟁이",
		team: Team.CITIZEN,
		glyph: "🃏",
		// "밤에 쓸 능력"이 아니라 "직업 능력"이다. 시민의 익명 쪽지는 세지 않으므로
		// 전자로 적으면 쪽지를 든 시민에게 '없습니다'가 나갈 때 설명이 거짓말이 된다
		ability: "첫 밤에만, 한 명이 직업 능력을 가졌는지 봅니다.",
		tip: "진영은 알 수 없습니다. 언제 말할지가 당신의 유일한 선택입니다.",
		nightAction: NightActionKind.INSPECT_ABILITY,
		nightStep: NightStep.INSPECT,
		nightChat: null,
		// 그림이 없어서가 아니라 새면 안 되어서 null이다. 밤에 목격된 모습이
		// 곧 직업표가 되면 정보직 시민은 첫 밤에 사라진다
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "점을 볼 대상을 선택하세요. 첫 밤에만 가능합니다.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
		// maxUses 같은 횟수 제한이 필요 없다. 밤이 하나뿐이고 그 밤 안에서는
		// usedSkill이 두 번째 지목을 막는다
		firstNightOnly: true,
	},
	MADAM: {
		displayName: "마담",
		team: Team.MAFIA,
		glyph: "💋",
		ability: "밤마다 한 명을 유혹해 그 밤의 능력과 다음 낮의 발언을 막습니다.",
		tip: "경찰과 의사를 재우는 것이 가장 큽니다. 다음 낮에 조용해진 사람이 곧 정답입니다.",
		nightAction: NightActionKind.SEDUCE,
		// 건달이 비운 자리를 그대로 잇는다. 유혹은 그 밤의 다른 모든 능력보다
		// 먼저 돌아야 "이미 지나간 능력을 막는" 일이 없다.
		nightStep: NightStep.BLOCK,
		// 마담은 접선이 필요 없다. 처음부터 마피아와 대화한다
		nightChat: ChatChannel.MAFIA,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "유혹할 대상을 선택하세요.",
		nightNotice: MAFIA_CHAT,
		immuneToVote: false,
		isMafiaSupport: true,
		noSelfTarget: true,
	},
	THIEF: {
		displayName: "도둑",
		team: Team.MAFIA,
		glyph: "🧤",
		ability: "한 밤 동안 한 명의 능력을 훔치고, 다음 밤에 그 능력을 대신 씁니다.",
		tip: "밤에 움직이지 않는 사람을 훔치면 다음 밤이 통째로 빕니다.",
		nightAction: NightActionKind.STEAL,
		// AFTER인 이유는 NightStep 선언에 적었다. SWAP(10)에 두면 유혹·협박보다
		// 먼저 돌아 "막혔는데도 훔쳤다"가 된다.
		nightStep: NightStep.AFTER,
		nightChat: ChatChannel.MAFIA,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "능력을 훔칠 대상을 선택하세요.",
		nightNotice: MAFIA_CHAT,
		immuneToVote: false,
		isMafiaSupport: true,
		noSelfTarget: true,
	},
	LOVER: {
		displayName: "연인",
		team: Team.CITIZEN,
		glyph: "💞",
		ability: "연인이 누구인지 서로 압니다. 한쪽이 죽으면 다른 쪽도 따라 죽습니다.",
		tip: "서로를 확정 시민으로 쓸 수 있습니다. 다만 밝히는 순간 둘이 한 표적이 됩니다.",
		nightAction: null,
		// 지목이 없어도 CHAIN에 세운다. 짝의 죽음을 따라가는 것이 이 직업의
		// 유일한 판정이고, 그 판정이 도는 자리가 CHAIN이다.
		nightStep: NightStep.CHAIN,
		nightChat: ChatChannel.LOVER,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: null,
		nightNotice: "🌙 밤에는 연인과 대화할 수 있습니다.",
		immuneToVote: false,
	},
	DETECTIVE: {
		displayName: "사립탐정",
		team: Team.CITIZEN,
		glyph: "🔦",
		ability: "밤마다 한 명을 미행해 그 사람이 누구를 지목했는지 봅니다.",
		tip: "직업은 알 수 없습니다. 하지만 밤마다 누군가를 노리는 사람은 시민이 아닙니다.",
		nightAction: NightActionKind.TRACK,
		// 지목을 읽는 능력이므로 그 밤의 지목이 전부 등록된 뒤여야 한다
		nightStep: NightStep.AFTER,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "미행할 대상을 선택하세요.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
		noSelfTarget: true,
	},
	GRAVEDIGGER: {
		displayName: "도굴꾼",
		team: Team.CITIZEN,
		glyph: "⛏️",
		ability: "처음 죽은 시민 편 사망자의 직업을 대신 갖습니다. 판에 한 번뿐입니다.",
		tip: "마피아 팀과 연인의 무덤은 파지 않습니다. 아무도 죽지 않은 밤에는 그대로 기다립니다. 무엇이 되었는지는 아침에 알려줍니다.",
		// 지목이 없다. 그 밤의 사망자가 확정되는 순간 자동으로 일어난다 —
		// 고를 것이 없는 능력에 격자를 띄우면 "고를 수 있다"는 거짓말이 된다.
		nightAction: null,
		// CHAIN 뒤라야 그 밤의 사망자가 확정돼 있고, REVIVE 앞이라야 소생으로
		// 되살아난 사람을 파내지 않는다. 그 사이가 없어 REVIVE에 함께 세우고
		// 파이프라인이 소생을 먼저 적용한다(NightPipeline.ts).
		nightStep: NightStep.REVIVE,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: null,
		nightNotice: NO_CHAT,
		immuneToVote: false,
	},
	TERRORIST: {
		displayName: "테러리스트",
		team: Team.CITIZEN,
		glyph: "💣",
		ability: "게임에 딱 한 번, 지목한 사람과 함께 자폭합니다.",
		tip: "마피아라고 확신할 때만 쓰세요. 시민을 데려가면 두 명이 한꺼번에 줄어듭니다.",
		nightAction: NightActionKind.MARK,
		nightStep: NightStep.CHAIN,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "함께 죽을 대상을 선택하세요. 이 판에 한 번뿐입니다.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
		maxUses: 1,
		noSelfTarget: true,
		// 첫 밤 자폭은 순수한 주사위다. 자경단원·스파이와 같은 이유로 늦춘다
		needsPriorDay: true,
	},
	PRIEST: {
		displayName: "성직자",
		team: Team.CITIZEN,
		glyph: "⛪",
		ability: "게임에 딱 한 번, 죽은 사람 한 명을 되살립니다.",
		tip: "되살릴 사람이 시민이어야 이득입니다. 영매가 성불시킨 혼령은 되살릴 수 없습니다.",
		nightAction: NightActionKind.REVIVE,
		nightStep: NightStep.REVIVE,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "되살릴 대상을 선택하세요. 이 판에 한 번뿐입니다.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
		maxUses: 1,
		targetsDead: true,
	},
	CITIZEN: {
		displayName: "시민",
		team: Team.CITIZEN,
		glyph: "🧑",
		ability: "게임당 한 번, 한 명에게 익명 쪽지를 보냅니다.",
		tip: "아는 것은 없지만 말을 옮길 수는 있습니다. 누구에게 언제 보낼지가 전부입니다.",
		nightAction: NightActionKind.NOTE,
		// AFTER인 것이 핵심이다. 쪽지는 아무것도 막지 않고 아무도 죽이지 않으므로
		// 밤의 마지막에 서고, 그래서 "대상이 오늘 죽었는가"를 이미 아는 상태에서
		// 배달을 정할 수 있다
		nightStep: NightStep.AFTER,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "쪽지를 보낼 대상을 선택하세요. 게임당 한 번입니다.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
		maxUses: 1,
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
 * 진영과 채팅이 같은 집합이던 시절에는 맞았지만 짐승인간은 마피아 팀이면서
 * 대화는 못 하고(혼자 무는 직업이다), 스파이는 직업 정의에 마피아 채팅창을
 * 달고 있으면서 합류 전까지는 시민 팀이다.
 * 두 개념이 갈라진 이상 판정을 한 곳에 못 박지 않으면 중계·인원수·스파이 합류가
 * 서로 다른 답을 내놓게 된다.
 *
 * 세 줄이 각각 다른 새는 구멍을 막는다.
 * 첫 줄(팀)이 없으면 스파이가 접선 전부터 밀담을 읽는다 — 조사할 이유가
 * 사라져 직업 하나가 통째로 무의미해진다. 둘째 줄(정의)이 없으면 합류한
 * 스파이가 팀만 바뀐 채 말을 못 한다. 셋째 줄(접선)이 없으면 짐승인간이
 * 영원히 혼자다 — 정의의 nightChat은 접선 후에도 null로 남기 때문이다.
 * 세 줄을 함께 읽는 자리가 여기 하나뿐이라 여기서 묻는다.
 */
export function inMafiaChat(seat: { role: Role; team: Team; contacted?: boolean }): boolean {
	if (seat.team !== Team.MAFIA) return false;
	const def = ROLE_DEFS[seat.role];
	if (def.nightChat === ChatChannel.MAFIA) return true;
	return def.needsContact === true && seat.contacted === true;
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

/**
 * 이 직업이 "직업 능력"을 갖고 있는가. 점쟁이의 점괘가 묻는 것이 이것이다.
 *
 * 익명 쪽지(NOTE)는 세지 않는다. 쪽지는 평범한 시민이라면 누구나 똑같이
 * 들고 있는 기본 행동이지 그 사람이 무엇인지를 가르는 능력이 아니다.
 * 이 구별이 없으면 점괘가 상수가 된다 — 시민에게 쪽지가 생긴 뒤 하한을 지우고
 * 4~12인을 200시드씩 돌려 보면, 쪽지를 세는 판정에서는 6인 88판 중 59판이
 * '없습니다'가 나올 사람이 아예 없는 판이다(4·5인은 44/44판이 그렇다).
 * 쪽지를 빼면 그 값이 전부 최소 한 명으로 돌아온다.
 *
 * nightAction !== null을 여기저기 흩어 쓰지 않는 이유가 그것이다. 그 식은
 * "오늘 밤 차례가 있는가"(NightResolution.noTurnReason)와 글자가 같고 뜻이
 * 다르다. 묻는 것이 다르면 함수도 달라야 한다.
 */
export function hasJobAbility(role: Role): boolean {
	const kind = ROLE_DEFS[role].nightAction;
	return kind !== null && kind !== NightActionKind.NOTE;
}

/**
 * 이 좌석이 오늘 밤 실제로 쓰는 직업.
 *
 * 도둑이 능력을 훔치면 borrowedRole이 채워진다. role 자체를 덮어쓰지 않는
 * 이유는 그 순간 되돌릴 방법이 사라지기 때문이다 — 훔친 능력은 한 밤만
 * 쓰고 반납되고, 종료 화면은 도둑을 도둑으로 공개해야 하며, 승패도 원래
 * 직업으로 갈린다. 훔친 것은 능력이지 정체가 아니다.
 *
 * 밤 파이프라인은 좌석의 직업을 이 함수로만 읽는다. 직접 seat.role을 읽는
 * 자리가 하나라도 남으면 도둑이 그 능력만 못 쓰는 구멍이 된다.
 */
export function effectiveRole(seat: { role: Role; borrowedRole: Role | null }): Role {
	return seat.borrowedRole !== null ? seat.borrowedRole : seat.role;
}

/** effectiveRole의 정의. 파이프라인이 nightStep·nightAction을 물을 때 쓴다 */
export function effectiveDef(seat: { role: Role; borrowedRole: Role | null }): RoleDef {
	return ROLE_DEFS[effectiveRole(seat)];
}

/**
 * 승리 판정에서 이 좌석이 몇 명으로 세어지는가.
 *
 * 살아 있는지는 묻지 않는다 — 그건 부르는 쪽(WinCondition)이 이미 걸러 둔다.
 * 여기서 묻는 것은 "이 사람 한 명이 몇 명 몫인가" 하나다.
 *
 * borrowedRole을 보지 않는 것이 중요하다. 도둑이 건달의 능력을 훔쳤다고
 * 마피아 진영의 벽이 3 올라가면, 훔치는 행위 자체가 자기 편을 지는 쪽으로
 * 민다. 능력은 빌려도 무게는 원래 직업의 것이다.
 */
export function winWeightOf(seat: { role: Role }): number {
	const weight = ROLE_DEFS[seat.role].winWeight;
	return weight === undefined ? 1 : weight;
}

/**
 * 이 좌석이 지금 마피아 진영 인원으로 세어지는가.
 *
 * 팀만으로는 답이 나오지 않는다. 스파이와 짐승인간은 처음부터 team이
 * MAFIA지만 접선 전에는 마피아가 몇 명인지 세는 자리에 끼지 않는다 —
 * 서로를 모르고, 마피아도 그들을 모르며, 접선하지 못한 채 게임이 끝나면
 * 아무 일도 하지 않은 것이다. 접선을 team 값으로 표현하려던 시도가 깨진
 * 지점은 Seat.contacted 선언에 적혀 있다.
 */
export function countsForMafiaWin(seat: { role: Role; team: Team; contacted: boolean }): boolean {
	return seat.team === Team.MAFIA && seat.contacted;
}

/**
 * 이 직업이 배정될 때 seat.contacted의 초기값.
 *
 * 보조직업이 아닌 좌석에서 언제나 참인 이유는 "접선하지 않았다"가 곧
 * "아직 마피아로 세지 않는다"이기 때문이다. 시민에게 그 상태를 주면
 * 시민 진영 인원에서 빠지는 것이 아니라 아무 뜻도 없는 값이 하나 생긴다.
 */
export function startsContacted(role: Role): boolean {
	return ROLE_DEFS[role].needsContact !== true;
}
