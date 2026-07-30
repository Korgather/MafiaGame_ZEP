# 시즌 0+1 통합 실행 설계

> 입력 문서: [docs/design/mafia42-reverse-planning.md](../../design/mafia42-reverse-planning.md)
> 작성일: 2026-07-30
> 상태: 설계 확정, 구현 계획 미작성

역기획 문서의 §4(구조 진단)·§5(구성)·§6(직업)·§7(모드)·§8(로드맵)을
**출하 가능한 6개 슬라이스**로 옮긴 문서다. 각 슬라이스는 독립 배포 단위이고,
자기 검증 기준과 롤백 조건을 갖는다.

원문 문서가 "무엇을 왜 만들 것인가"를 다뤘으므로 이 문서는 그것을 반복하지 않는다.
여기 있는 것은 **정확히 무엇을 바꾸는가, 어떤 순서로, 무엇이 통과하면 끝인가**다.

---

## 1. 범위

### 1.1 만드는 것

| 슬라이스 | 구조 | 콘텐츠 | 유저 가시 |
| :-: | --- | --- | :-: |
| S0 | — | 인원별 마피아 수 재정의, 첫 밤 무사, 건달 진영 정정 | ○ |
| S1 | `RuleSet` | 속도전, 침묵전 | ○ |
| S2 | `leadPool` · 배타 규칙 · `minPlayers` | 6인 은폐자 공급, 영매·기자 인원 제한 | ○ |
| S3 | 밤 파이프라인 | 사기꾼 | ○ |
| S4 | `firstNightOnly` | 점쟁이 | ○ |
| S5 | `maxUses` | 시민 개편(정형 쪽지) | ○ |

원문 §8.3의 시즌 0(구조 5개)과 시즌 1(직업 3 + 모드 2 + 밸런스)을 하나로 합쳤다.
**모든 슬라이스가 유저에게 보이는 변화를 낸다** — 원문이 "콘텐츠 0개"로 계획한
시즌 0 구간이 사라진다.

### 1.2 만들지 않는 것 (명시적 제외)

| 항목 | 원문 위치 | 왜 뺐는가 |
| --- | --- | --- |
| `targetKind` / `targetCount` | §8.3 시즌 0 | 시즌 1 직업 셋 모두 "살아있는 1명" 또는 `nightAction: null`로 표현된다. 소비자는 도굴꾼·성직자·마술사이고 전부 시즌 2~3이다. 소비자 없는 타입 확장은 시즌 2 첫 슬라이스에서 도굴꾼과 함께 넣는다 |
| `soloWinners` / `evaluateWinner` 변경 | §8.3 시즌 3 | 원문 판단 그대로. [WinCondition.ts](../../../src/domain/WinCondition.ts)는 이 시즌에 한 글자도 바뀌지 않는다 |
| 스파이 모드 전용 격리 | §8.1 | §8.1은 격리를 제안하지만 §8.4의 패치 우선순위 1~9에 스파이가 없다. 밸런스 근거 없이 기존 직업을 덱에서 빼는 것은 콘텐츠 축소다. 숨은배신자 모드(시즌 3)와 함께 옮긴다 |
| 정치인·자경단원 최소 인원 10 | §8.1 표 | 같은 이유. §8.4에 근거가 없고, 6~9인 시민 풀을 과하게 좁힌다. 직업별 승률 관측 후 시즌 2에서 판단 |
| 승률·판 길이 텔레메트리 전송 | — | S0의 검증이 데이터에 의존하는데 현재 계측 경로가 CCU 보고뿐이다. **§9에 미결 항목으로 분리**했다 |
| 마담, 경호원, 도굴꾼, 탐정 | §8.3 시즌 2 | 파이프라인의 투자 회수는 다음 시즌 |

### 1.3 분할 전략

**밸런스 핫픽스 선행 → 이후 수직 슬라이스.**

S0은 구조를 전혀 건드리지 않고 §8.4의 1·2순위 패치를 낸다. 지금 6인 방은
정보가 없는 첫 투표 한 번으로 게임이 끝나는 상태이고(§5.2), 이건 유저가 이미
겪고 있는 문제다. 구조 작업 뒤로 미룰 이유가 없다.

S1~S5는 **구조와 그 구조의 첫 소비자를 같은 슬라이스에 둔다.** 소비자 없이
구조만 내보내면 추상화가 빗나가도 알 수 없다 — 파이프라인의 `INSPECT` step이
사기꾼의 역알림을 실제로 표현할 수 있는지는 사기꾼을 만들어봐야 안다.

이 원칙 때문에 원문 부록 A의 순서를 한 군데 바꿨다: **점쟁이가 파이프라인
뒤로 간다.** 부록 A는 `maxUses` → `targetKind` → `leadPool` → 파이프라인
순서를 권했고 원문 §6.13은 점쟁이를 "구조 변경 없이 지금 만들 수 있는 3개"로
분류했다. 그대로 하면 점쟁이의 조사 응답을 클릭 즉시로 한 번 만들고
파이프라인에서 정산 시점으로 다시 옮기게 된다. 파이프라인 뒤로 미루면 재작업이 0이다.

---

## 2. 선행 결정

구현 중에 뒤집으면 여러 슬라이스를 다시 써야 하는 결정들이다.

### D1. 밤 결과 노출을 전면 전환한다

조사 결과를 클릭 즉시가 아니라 **아침 화면 직전 개인 라벨**로 옮긴다.
조사 계열만 즉시로 남기는 부분 전환은 두 가지 이유로 버렸다.

1. 시즌 2 마담(능력 차단)이 조사도 차단해야 하므로 그때 다시 뒤집게 된다
2. 사기꾼의 "어젯밤 누군가 당신을 조사했다"가 경찰의 조사 결과와 **같은 시점**에
   와야 대칭이 맞는다. 한쪽만 즉시면 사기꾼이 조사 시각을 역추적할 수 있다

체감 지연은 밤 종료와 아침 사이의 컷 한 장 분량이다. 정보가 늦게 오는 것이
아니라 **같은 화면에서 한꺼번에** 오는 형태로 바뀐다.

### D2. `maxUses` 차감은 정산 시점

- `usedSkill`(이번 밤 지목했다 = 위젯 잠금): **클릭 시점** 유지
- 누적 사용 횟수: **정산 시점**에만 증가

이렇게 두면 시즌 2에서 마담이 능력을 차단할 때 "횟수를 돌려줄까"를 따로
정의할 필요가 없다 — 차단 = 정산 스킵 = 차감 없음이 자동으로 성립한다.

**규칙으로 명시:** 능력이 차단되면 사용 횟수가 소모되지 않는다.
(시즌 1에는 차단자가 없어 관측되지 않지만, 파이프라인 코드에는 이 규칙이 들어간다.)

### D3. `RuleSet`에 함수를 담지 않는다

원문 §4.3은 `mafiaCount: (players: number) => number`를 제안했다.
**인원별 배열로 바꾼다.**

- Jint에서 데이터 구조에 클로저를 담지 않는다
- `RuleSet`이 순수 리터럴로 남아 비교·직렬화·테스트가 쉽다
- §5.2~§5.4의 구성표를 1:1로 옮긴 형태라 표와 코드가 어긋날 자리가 없다

### D4. 첫 밤 무사 = `ATTACK` intent 전량 폐기

마피아는 정상적으로 지목하고(마피아 채팅으로 팀 확인 유지), 정산에서 `ATTACK`
step을 건너뛴다. 경찰·의사·점쟁이는 정상 작동한다.

**밤 위젯에 고지를 넣는다.** 안 넣으면 §5.5가 첫 밤 무사의 대안을 버린 이유,
즉 "왜 아무도 안 죽었지?"라고 설명이 필요해지는 상황이 그대로 재발한다.

### D5. 짐승인간 리드는 6인 전용, 8인부터 2번째 슬롯 복귀

건달 보류(§8.4 7순위) + 사기꾼↔짐승인간 배타(§8.4 5순위)를 동시에 적용하면
도출되는 결과다. 킬러 예산 상한: **6~7인 1 / 8~10인 2 / 11~12인 3.**

**정직하게 기록할 것:** 이 조합에서 7인 마피아팀은 (마피아 + 사기꾼) 하나로
고정되어, §5.3이 말한 "2번째 슬롯이 랜덤이라 시민의 최적 전략이 달라진다"는
재미가 **7인 구간에만 없다.** 마담이 오는 시즌 2에 회복된다.

### D6. 시민 익명 쪽지는 자유 입력이 아니라 정형 문구 선택

자유 텍스트는 밤 위젯에 새 입력 UI + 신고 대상 확장 + 별도 레이트리밋을
모두 요구한다. [QuickPhrases.ts](../../../src/domain/chat/QuickPhrases.ts)를 재사용하면
남용 리스크가 0이 되고 같은 시즌의 침묵전과 자산을 공유한다.

자유 입력은 쪽지 사용률 지표를 본 뒤 재검토한다.

### D7. 모드 진입은 방 고정 배정

방 1~5 표준전 / 6~7 속도전 / 8 침묵전. `ruleSet`이 방 생성 시 결정되고
게임 중 절대 변하지 않으므로 페이즈 전환 중 룰이 바뀔 경로가 없다.
방장 선택 UI는 시즌 2 밴픽전과 묶는다.

### D8. 4~5인은 "연습 판"으로 격리

`MIN_PLAYERS = 4`인데 4인(마피아1/시민3)은 계산상 2라운드에 끝나 밸런스가
성립하지 않는다. `MIN_PLAYERS`를 6으로 올리면 소규모 방이 시작조차 못 하므로,
4~5인은 **첫 밤 무사 적용 + 승률 목표 미적용 + 지표 집계 제외**로 명시 격리한다.

### D9. 건달은 시민팀이 맞고, 능력째로 재설계 대상이다

현재 [Roles.ts:288](../../../src/domain/Roles.ts:288)은 `team: Team.MAFIA`,
`appearsAsMafia: true`, `nightNotice: LONE_MAFIA_TEAM`이다. **진영이 잘못 들어가 있다.**

진영만 고치면 더 나빠진다. 시민팀 건달이 `SILENCE`를 들고 있으면 **아군의
입을 막는** 능력이 되고, 이건 §8.4 원칙 3("재미를 깎는 능력은 수치로 못 고친다")이
말하는 최악의 형태다. 마피아팀 건달이 시민을 막는 것은 적의 방해라 납득되지만,
시민팀 건달이 시민을 막는 것은 아군에게 턴을 빼앗기는 경험이다.

**결정:**
- S0에서 진영·`appearsAsMafia`·문구를 정정하고 **덱 풀에서 제외**한다
  (§8.4 7순위가 이미 "보류"로 계획한 상태)
- 시즌 2에서 능력을 `BLOCK`(밤 능력 차단)으로 재설계해 복귀시킨다.
  마담의 시민팀 대칭이 되고, §8.1이 "유일한 구멍"으로 인정한
  **시민 교란자** 칸을 채우며, §4.5 링 2가 양방향으로 닫힌다.
  `BLOCK` step은 파이프라인(S3)이 이미 깔아둔다

`SILENCE` 종류와 `Seat.silenced`는 **지우지 않고 남긴다.** 시즌 2 재설계가
확정되기 전에 제거하면 되살릴 비용이 더 크고, 남겨도 생산자가 없어 동작에
영향이 없다. 시즌 2 첫 슬라이스에서 거취를 확정한다.

---

## 3. 원문 문서 정정 사항

스펙을 쓰면서 확인된 원문 오류·공백이다. 원문 문서에도 반영해야 한다.

| # | 위치 | 문제 | 해소 |
| :-: | --- | --- | --- |
| 1 | §5.2 vs §8.4-1 | §5.2 표는 `7인 = 마피아팀 2명`, §8.4 1순위는 `6~7인 = 1명`. 모순 | §5.2의 2번째 슬롯은 사기꾼(밤 킬 없음)이므로 §8.4는 **팀 인원이 아니라 킬러 예산**을 말한 것이다. `mafiaTeamSize`와 `killerBudget`을 분리해 둘 다 성립시킨다 |
| 2 | §8.4-1 | "6~9인 = 2명"이 현재값이라고 적었지만, `round(10 × 0.27) = 3`이라 **10인도 §5.3 표(2명)와 다르다** | 변경 대상은 6인(2→1)과 10인(3→2) **두 구간**이다 |
| 3 | §5 전체 | `MIN_PLAYERS = 4`인데 구성표가 6인부터 시작. 4~5인 방이 실제로 열린다 | D8 (연습 판 격리) |
| 4 | §6-1 [구조] | "파이프라인 — INSPECT step에서 위장 상태를 읽어야 함"이라 적었지만, **위장 자체는 파이프라인 없이 된다.** `appearsAsMafia: false`는 짐승인간이 이미 쓰는 플래그다 | 파이프라인이 필요한 것은 위장이 아니라 **역알림**("어젯밤 조사당했다")이다. 결론(사기꾼은 파이프라인과 함께)은 같지만 근거가 다르다 |
| 5 | §4.3 | `RuleSet.firstNightPeaceful: boolean` | 첫 밤 무사는 §5.5대로 **6~8인에만** 적용된다. boolean으로는 인원 조건을 표현할 수 없다 → `firstNightPeacefulUpTo: number` |
| 6 | Roles.ts | 건달 진영 오류 | D9 |

---

## 4. 자료구조 최종형

### 4.1 `RuleSet` (S1 신규)

```ts
// src/domain/RuleSet.ts
export interface PhaseTiming {
	readonly START_COUNTDOWN: number;
	readonly ROLE_REVEAL: number;
	readonly NIGHT: number;
	readonly DAY_PER_ALIVE: number;
	readonly DAY_MAX: number;
	readonly VOTE: number;
	readonly VOTE_RESULT: number;
	readonly GAME_OVER: number;
	readonly TICK_TOCK_AT: number;
}

export interface DeckSpec {
	/** index = 참가 인원. index 0..MIN_PLAYERS-1은 0 */
	readonly mafiaTeamSize: readonly number[];
	/** 마피아 진영 첫 자리 후보 */
	readonly leadPool: readonly Role[];
	/** 마피아 진영 2번째 이후 자리 후보 */
	readonly mafiaPool: readonly Role[];
	/** 시민 자리에 우선 들어가는 직업 */
	readonly citizenRequired: readonly Role[];
	/** 남는 시민 자리 일부에 뽑히는 능력자 */
	readonly citizenPool: readonly Role[];
	/** 같은 그룹에서 최대 1개만 덱에 들어간다 */
	readonly exclusiveGroups: readonly (readonly Role[])[];
	/** 이 직업은 참가 인원이 값 이상일 때만 등장한다. 없으면 제한 없음 */
	readonly minPlayers: Partial<Record<Role, number>>;
}

export interface RuleSet {
	readonly id: string;
	readonly displayName: string;
	/** 로비 카드에 뜨는 한 줄 */
	readonly summary: string;
	readonly timing: PhaseTiming;
	readonly deck: DeckSpec;
	/** 이 인원 이하에서 첫 밤에 아무도 죽지 않는다. 0이면 미적용 */
	readonly firstNightPeacefulUpTo: number;
	readonly minPlayers: number;
	readonly maxPlayers: number;
	/** 낮 채팅 수단 */
	readonly chatMode: "free" | "phrasesOnly";
	/** 지표 집계 대상 모드인가 */
	readonly ranked: boolean;
}
```

`Partial<Record<Role, number>>`는 런타임에 평범한 객체 리터럴이다.
`Map`을 쓰지 않는다 — babel이 전역 `Map`을 `ScriptMap`으로 바꾸므로 금지된다.

지표 집계 여부는 모드와 인원 둘 다 본다:

```ts
export function countsForMetrics(rules: RuleSet, playerCount: number): boolean {
	return rules.ranked && playerCount >= 6;
}
```

### 4.2 `Room` / `Seat` 변경

| 슬라이스 | 필드 | 변경 |
| :-: | --- | --- |
| S1 | `Room.ruleSet: RuleSet` | 신규. 방 생성 시 결정, 게임 중 불변 |
| S3 | `Room.nightIntents: NightIntent[]` | 신규. `resetRound`에서 비운다 |
| S3 | `Room.nightReveals: NightReveal[]` | 신규. 아침 배포 후 비운다 |
| S5 | `Seat.skillSpent: boolean` → `Seat.skillUsed: number` | 누적 사용 횟수. 0에서 시작 |

`skillUsed`를 "남은 횟수"가 아니라 "쓴 횟수"로 정의한 이유: 남은 횟수로 하면
무제한 능력에 `-1` 같은 센티넬이 필요해진다. 쓴 횟수면 `maxUses === undefined`가
곧 무제한이다.

### 4.3 `RoleDef` 추가 필드

| 슬라이스 | 필드 | 의미 |
| :-: | --- | --- |
| S3 | `nightStep: number` | 정산 순서. `NightStep`의 값 |
| S4 | `firstNightOnly?: boolean` | 첫 밤에만 쓸 수 있는가 (점쟁이). `needsPriorDay`의 거울 |
| S5 | `maxUses?: number` | 게임당 사용 상한. 없으면 무제한. `oncePerGame: true`는 `maxUses: 1`로 대체되어 **삭제된다** |

---

## 5. 슬라이스 상세

### S0 — 밸런스 핫픽스 + 건달 진영 정정

**목적.** 구조를 건드리지 않고 §8.4의 1·2·7순위를 출하한다.

#### 변경

| 파일 | 변경 |
| --- | --- |
| `src/constants/GameConfig.ts` | `MAFIA_TEAM_SIZE: readonly number[]` 추가. `MAFIA_RATIO` 삭제 |
| `src/domain/RoleAssignment.ts` | `mafiaCount`가 비율 대신 표를 읽는다. `MAFIA_POOL`에서 `THUG` 제거 |
| `src/domain/Roles.ts` | 건달: `team` → `CITIZEN`, `appearsAsMafia` 제거, `nightNotice` → `NO_CHAT`, `tip` 재작성 |
| `src/domain/NightResolution.ts` | `resolveNightCasualties` 앞에 첫 밤 무사 분기 (임시 위치, S3에서 파이프라인으로 이동) |
| `src/services/Night.ts` | 밤 위젯에 첫 밤 무사 고지 |

#### 인원별 마피아 팀 인원

```ts
// index = 참가 인원
export const MAFIA_TEAM_SIZE: readonly number[] =
	[0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3];
//   0  1  2  3  4  5  6  7  8  9 10 11 12
```

| 인원 | 현재 `round(p×0.27)` | 신규 | 변화 |
| :-: | :-: | :-: | :-: |
| 4 | 1 | 1 | — |
| 5 | 1 | 1 | — |
| 6 | **2** | **1** | ▼ |
| 7 | 2 | 2 | — |
| 8 | 2 | 2 | — |
| 9 | 2 | 2 | — |
| 10 | **3** | **2** | ▼ |
| 11 | 3 | 3 | — |
| 12 | 3 | 3 | — |

**10인 변경의 부수 효과 — 의도한 것이다.** 마피아가 3→2가 되면 시민 자리가
7→8로 늘고, `nightKillBudget(8) = 2 > 1`이 되어 `affordsLoneKiller`가 켜진다.
즉 **짐승인간이 11인이 아니라 10인부터 등장한다.** §5.3 표가 10인 구성에
짐승인간을 포함하고 있으므로 원문 의도와 일치한다.

이 결과로 §4.4c의 "6~10인에 은폐자가 0"은 6~9인 문제로 줄어들고, 남은 6~9인은
S2(`leadPool`)와 S3(사기꾼)이 각각 처리한다.

#### 첫 밤 무사

S0에는 `RuleSet`이 없으므로 상수로 둔다.

```ts
export const FIRST_NIGHT_PEACEFUL_UP_TO = 8;
```

`turnCount === 0 && playerCount <= 8`이면 사망 정산에서 `attackedBy`를 무시한다.
S1에서 `ruleSet.firstNightPeacefulUpTo`로 이동한다.

**적용 범위 확정:**

| 대상 | 첫 밤에 |
| --- | --- |
| 마피아·짐승인간의 `ATTACK` | 지목은 되고 **사망은 없음** |
| 자경단원의 `ATTACK` | `needsPriorDay`라 애초에 지목 불가 — 변화 없음 |
| 의사의 `HEAL` | 정상. 살릴 대상이 없어도 상태는 남는다 |
| 경찰의 `INSPECT_TEAM` | 정상 |
| 스파이 | `needsPriorDay`라 지목 불가 — 변화 없음 |
| 군인의 `armored` | **소모되지 않는다.** 공격이 사망으로 이어지지 않으므로 방탄을 쓸 일이 없다 |

마지막 항목은 함정이다. 현재 `resolveNightCasualties`는 `armored`를 보면
`SHIELDED`를 반환하며 **방탄을 소모한다**. 첫 밤 무사에서 이 경로를 타면 군인이
첫 밤에 방탄을 잃는다. 사망 정산에 들어가기 전에 걸러야 한다.

#### 고지 문안

밤 위젯 상단, 첫 밤에만:

> 🌙 **첫 밤에는 아무도 죽지 않습니다.** 팀을 확인하고 대상을 익혀 두세요.

시민팀에게도 같은 줄을 보인다 — 마피아만 알면 첫 아침에 마피아가 놀라지 않는
것으로 정체가 새어나간다.

#### 건달 정정 후 정의

```ts
THUG: {
	displayName: "건달",
	team: Team.CITIZEN,
	glyph: "🥊",
	ability: "밤마다 한 명을 협박해 다음 낮 발언과 투표를 막습니다.",
	tip: "협박은 되돌릴 수 없습니다. 확신이 있을 때만 쓰세요.",
	nightAction: NightActionKind.SILENCE,
	nightChat: null,
	// ... 스프라이트 계열 변화 없음
	nightNotice: NO_CHAT,
	immuneToVote: false,
	// appearsAsMafia 제거
},
```

**덱에서는 제외한다** (D9). `MAFIA_POOL`에서 빠지고 `CITIZEN_POOL`에도 넣지 않는다.
`Record<Role, RoleDef>`가 항목 누락을 컴파일 오류로 잡으므로 정의는 남아 있어야 하고,
남아 있어도 뽑히지 않는다.

#### 건달 정정의 파급

| 지점 | 현재 | 정정 후 |
| --- | --- | --- |
| `countAlive` | 건달이 마피아팀으로 계산 | 시민팀. **건달이 뽑힌 판은 지금까지 마피아가 유리했다** |
| 경찰의 조사 | "마피아입니다" | "마피아가 아닙니다" |
| 스파이의 `INSPECT_ROLE` | 건달을 찾으면 마피아팀이므로 합류 | 시민팀이므로 **합류하지 않는다** |
| 밤 안내 문구 | "마피아 팀이지만 대화할 수 없습니다" | "밤에는 채팅을 할 수 없습니다" |

덱에서 빼므로 실전 파급은 없다. 그러나 **기존 테스트 4곳이 건달 덱을 명시적으로
구성해 돌린다** — 아래 테스트 절에 갱신 목록을 적었다.

#### 덱 구성 검증 (S0 적용 직후)

`MAFIA_POOL = [MAFIA, BEAST]`가 되므로 2번째 마피아 자리를 다시 계산한다.

| 인원 | 마피아 | 시민 자리 | 킬 예산 | `affordsLoneKiller` | 2번째 자리 후보 |
| :-: | :-: | :-: | :-: | :-: | --- |
| 4~6 | 1 | 3~5 | 1 | ✕ | (없음) |
| 7 | 2 | 5 | 1 | ✕ | `[MAFIA]` |
| 8 | 2 | 6 | 1 | ✕ | `[MAFIA]` |
| 9 | 2 | 7 | 1 | ✕ | `[MAFIA]` |
| 10 | 2 | 8 | 2 | ○ | `[MAFIA, BEAST]` |
| 11~12 | 3 | 8~9 | 2 | ○ | `[MAFIA, BEAST]` → 둘 다 |

**7~9인 마피아팀이 (마피아 + 마피아) 하나로 고정된다.** 건달이 빠졌고 사기꾼이
아직 없기 때문이다. S3(사기꾼)에서 회복된다. S0~S2 사이 이 구간의 구성 다양성이
일시적으로 떨어지는 것을 감수한다 — 대가로 얻는 것은 6·10인의 근본 밸런스 수정이다.

#### 검증 기준

- `npm run verify` 클린
- 신규 테스트: 인원 4~12 각각에 대해 마피아 팀 인원이 표와 일치
- 신규 테스트: 6~8인 첫 밤에 사망자 0, 9인 이상 첫 밤에 사망자 발생
- 신규 테스트: 첫 밤 무사 판에서 군인의 `armored`가 남아 있다
- 신규 테스트: 건달의 `team`이 `CITIZEN`이고 경찰 조사가 "마피아가 아닙니다"
- 신규 테스트: `buildRoleDeck`이 인원 4~12에서 `THUG`를 한 번도 내지 않는다
- 회귀: "첫 밤만으로 게임이 끝나는 덱은 나오지 않는다" 기존 테스트 통과

#### 롤백 조건

6인 판의 평균 라운드 수가 3 미만으로 관측되면 첫 밤 무사 상한을 재검토한다.
`MAFIA_TEAM_SIZE` 표는 배열 한 줄이라 되돌리기가 즉시다.

---

### S1 — `RuleSet` + 속도전 · 침묵전

**목적.** 모드 하나를 추가하는 비용을 객체 리터럴 하나로 만들고, 그 자리에서
모드 두 개를 낸다.

#### 변경

| 파일 | 변경 |
| --- | --- |
| `src/domain/RuleSet.ts` | **신규.** 인터페이스 + `STANDARD_RULES` · `BLITZ_RULES` · `SILENCE_RULES` |
| `src/constants/GameConfig.ts` | `TIMING` · `MAFIA_TEAM_SIZE` · `FIRST_NIGHT_PEACEFUL_UP_TO` → `STANDARD_RULES`로 **이동** |
| `src/types/Game.types.ts` | `Room.ruleSet: RuleSet` |
| `src/entities/Room.ts` | `createRoom(num)`이 방 번호로 룰셋을 고른다 |
| `src/services/GameFlow.ts` | `TIMING.X` → `room.ruleSet.timing.X` 기계적 치환 |
| `src/services/Night.ts` | 같은 치환 |
| `src/services/Voting.ts` | 같은 치환 |
| `src/domain/RoleAssignment.ts` | `buildRoleDeck(deck: DeckSpec, playerCount, rng)` |
| `src/domain/chat/ChatPermission.ts` | `chatMode === "phrasesOnly"`면 낮 자유 입력 차단 |
| `src/domain/chat/QuickPhrases.ts` | 침묵전 문구셋 |
| `src/services/Lobby.ts` | 온보딩 카드에 모드 이름·요약 표시 |

`GameConfig.ts`에 남는 것: `ROOM_COUNT`, `MIN_PLAYERS`, `MAX_PLAYERS`,
`MAX_SPECTATORS`, `KICK`, `CHAT_RATE`, `ACTION_RATE`, `FAULT_REPORT_RATE`,
`POLITICIAN_VOTE_WEIGHT`, `CITIZENS_PER_NIGHT_KILL`, `SPECIAL_CITIZEN_RATIO`,
`MIN_PLAIN_CITIZENS`, `MIN_SPECIAL_CITIZENS`, `ADMIN_*`, `CCU_*`.
이 중 `CITIZENS_PER_NIGHT_KILL`·`SPECIAL_CITIZEN_RATIO`·`MIN_*_CITIZENS`는
논리적으로 `DeckSpec`에 속하지만 **이 슬라이스에서는 옮기지 않는다** — 모드 3개
모두 같은 값을 쓰므로 옮기면 리터럴 세 곳에 같은 숫자가 중복된다. 모드별로
달라질 필요가 생기는 시점(밴픽전·전원특수직)에 옮긴다.

#### `STANDARD_RULES`

```ts
export const STANDARD_RULES: RuleSet = {
	id: "standard",
	displayName: "표준전",
	summary: "기본 규칙. 6~12명, 5~10분",
	timing: {
		START_COUNTDOWN: 10, ROLE_REVEAL: 9, NIGHT: 22,
		DAY_PER_ALIVE: 10, DAY_MAX: 60, VOTE: 17, VOTE_RESULT: 7,
		GAME_OVER: 16, TICK_TOCK_AT: 9,
	},
	deck: {
		mafiaTeamSize: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3],
		leadPool: [Role.MAFIA],
		mafiaPool: [Role.MAFIA, Role.BEAST],
		citizenRequired: [Role.DOCTOR, Role.POLICE],
		citizenPool: [
			Role.POLITICIAN, Role.SHAMAN, Role.SPY,
			Role.SOLDIER, Role.REPORTER, Role.VIGILANTE,
		],
		exclusiveGroups: [],
		minPlayers: {},
	},
	firstNightPeacefulUpTo: 8,
	minPlayers: 4,
	maxPlayers: 12,
	chatMode: "free",
	ranked: true,
};
```

`exclusiveGroups`와 `minPlayers`는 **필드만 선언하고 비워 둔다.** 값을 읽는
로직이 S2에서 오기 때문이다. S1에서 값을 채우면 아무도 읽지 않는 데이터가
한 슬라이스 동안 놓여 있게 되고, 그 상태로 배포되면 "제한이 걸린 줄 알았는데
안 걸렸다"가 된다. 빈 값이면 동작이 명확하다 — 제한 없음이다.

#### `BLITZ_RULES` (속도전)

```ts
export const BLITZ_RULES: RuleSet = {
	id: "blitz",
	displayName: "속도전",
	summary: "3분 단판. 직업 다섯 개, 생각할 시간 없음",
	timing: {
		START_COUNTDOWN: 7, ROLE_REVEAL: 6, NIGHT: 12,
		DAY_PER_ALIVE: 5, DAY_MAX: 25, VOTE: 10, VOTE_RESULT: 4,
		GAME_OVER: 10, TICK_TOCK_AT: 5,
	},
	deck: {
		mafiaTeamSize: [0, 0, 0, 0, 1, 1, 1, 2, 2, 0, 0, 0, 0],
		leadPool: [Role.MAFIA],
		mafiaPool: [Role.MAFIA],
		citizenRequired: [Role.DOCTOR, Role.POLICE],
		citizenPool: [Role.SOLDIER],
		exclusiveGroups: [],
		minPlayers: {},
	},
	firstNightPeacefulUpTo: 8,
	minPlayers: 4,
	maxPlayers: 8,
	chatMode: "free",
	ranked: true,
};
```

§7-2의 "밤 12 / 낮 25 / 투표 10 / 개표 4"를 그대로 옮겼다. 낮 25초는
`DAY_MAX`만 25로 두면 인원과 무관하게 항상 25가 되므로 `DAY_PER_ALIVE`를 5로
낮춰 소인원에서 더 짧아지게 했다(4인 20초, 6인 30→25초).

직업 풀은 §7-2대로 마피아·의사·경찰·군인·시민 다섯 개다. **짐승인간을 넣지
않았다** — 초보 유입 모드에서 경찰의 확정 정보를 남기는 것이 목적이다.

`maxPlayers: 8`이므로 9인 이후 표는 0으로 두었다. 방 정원을 넘는 인원이
들어올 경로는 없지만 배열 길이를 13으로 맞춰 인덱스 접근이 항상 정의되게 한다.

#### `SILENCE_RULES` (침묵전)

```ts
export const SILENCE_RULES: RuleSet = {
	id: "silence",
	displayName: "침묵전",
	summary: "정형 문구만. 말이 아니라 자리로 말한다",
	timing: { /* STANDARD_RULES.timing과 동일 */ },
	deck: { /* STANDARD_RULES.deck과 동일 */ },
	firstNightPeacefulUpTo: 0,
	minPlayers: 8,
	maxPlayers: 12,
	chatMode: "phrasesOnly",
	ranked: true,
};
```

`firstNightPeacefulUpTo: 0` — 8인 이상 전용이므로 §5.5의 적용 조건에 애초에
들어가지 않는다. 0으로 명시해 "조건에 안 걸린다"와 "끄기로 했다"를 구분한다.

#### 침묵전의 지목 수단

§7-12는 "직업 이름·번호를 쓸 수 없다"고만 정했고, 그러면 **의심 대상을 지목할
방법이 사라진다.** 번호별 문구를 만들면 칩이 12개 × 문구 종류만큼 늘어난다.

**결정: 문구에 번호를 넣지 않는다.** 대신 지목 수단은 두 가지다.

1. **낮 투표** — 원래 있던 수단이고, 침묵전에서 무게가 커진다
2. **맵 위의 위치** — ZEP은 캐릭터가 실제로 맵에 서 있다. 의심하는 사람 옆으로
   걸어가는 것이 발언이 된다

2번이 이 모드의 핵심이고 ZEP에서만 가능한 것이다. 개발 비용이 0이면서
§7-12가 말한 "표현 수단이 제한되면 모든 발언이 무거워진다"를 텍스트가 아닌
축으로 달성한다. 번호 지목 문구는 지표를 본 뒤 시즌 2에서 재검토한다.

#### 침묵전 문구셋

```ts
const QUICK_SILENCE_DAY: string[] = [
	"의심됩니다", "저는 시민입니다", "정보 있어요", "동의합니다",
	"반대합니다", "저를 믿어주세요", "오늘은 넘기죠", "잘 모르겠습니다",
];
```

`quickFor(ctx)`가 `ctx.chatMode`를 읽어야 하므로 `ChatContext`에 필드가 하나
늘어난다. `ChatPermission`이 낮 자유 입력을 잠그고, 잠금 문안은:

> 🤐 침묵전에서는 준비된 문구만 쓸 수 있습니다

마피아 채팅(밤)과 유령 채팅은 **제한하지 않는다.** §7-12의 목적은 낮 토론의
표현 수단을 좁히는 것이고, 마피아 밀담까지 좁히면 마피아가 협의를 못 해
밸런스가 시민 쪽으로 기운다.

#### 방 배정

```ts
function rulesForRoom(num: number): RuleSet {
	if (num === 8) return SILENCE_RULES;
	if (num >= 6) return BLITZ_RULES;
	return STANDARD_RULES;
}
```

`createRoom`에서 한 번 호출하고 `room.ruleSet`에 넣는다. 게임 중 변경 경로 없음.
로비 온보딩 카드와 방 입구 안내에 `displayName` · `summary`를 노출한다.

#### 검증 기준

- **회귀 없음이 이 슬라이스의 핵심 기준이다.** 방 1~5(표준전)에 대한 기존
  테스트가 한 줄도 수정 없이 통과해야 한다. 수정이 필요하면 그것은 순수 이동이
  아니었다는 뜻이다
- 신규 테스트: `STANDARD_RULES.timing`의 모든 값이 이동 전 `TIMING`과 일치
- 신규 테스트: 속도전 6인 판의 페이즈 길이 합이 표준전의 절반 이하
- 신규 테스트: 침묵전 낮에 자유 입력이 잠기고, 밤 마피아 채팅은 열려 있다
- 신규 테스트: 방 8개 각각의 `ruleSet.id`가 배정표와 일치
- 신규 테스트: 속도전 덱에 의사·경찰·군인·시민·마피아 외 직업이 없다

---

### S2 — `leadPool` + 배타 규칙 + `minPlayers`

**목적.** 6~9인에 은폐자를 공급할 자리를 만든다. 사기꾼(S3)이 들어올 때
배타 규칙이 이미 있어야 하므로 순서상 먼저다.

#### 변경

`src/domain/RoleAssignment.ts` 하나. `DeckSpec`은 S1에서 이미 필드를 갖고 있으므로
타입 변경이 없다.

```ts
export function buildRoleDeck(
	spec: DeckSpec,
	playerCount: number,
	rng: () => number = Math.random,
): Role[]
```

#### 마피아 자리 선정 순서

```
1. 인원 필터        — spec.minPlayers를 넘지 못하는 직업을 leadPool·mafiaPool에서 뺀다
2. 리드 선정        — 걸러진 leadPool에서 1개. 비면 Role.MAFIA로 대체
3. 킬 예산 계산     — 리드가 예산을 하나 쓴다. 남지 않으면 단독 킬러를 뺀다
4. 배타 필터        — 이미 뽑힌 직업과 같은 exclusiveGroup에 있는 후보를 뺀다
5. 나머지 자리 채움 — 걸러진 mafiaPool에서 (mafiaTeamSize - 1)개
```

4단계가 신규다. 3단계와 5단계 사이에 들어가야 한다 — 예산 필터를 통과한
후보 중에서 배타를 걸어야, 예산 때문에 어차피 빠질 직업이 배타 판정을
소모하지 않는다.

배타는 **뽑는 순서에 의존하므로** 그룹 안에서 무엇을 먼저 뽑을지가 결과에
영향을 준다. 후보를 섞은 뒤 앞에서부터 채우면서, 채울 때마다 그 후보의 그룹
동료를 남은 풀에서 제거하는 방식으로 구현한다. 이러면 그룹 안에서 어느 쪽이
남는지가 매 판 균등하다.

`STANDARD_RULES.deck` 갱신:

```ts
leadPool: [Role.MAFIA, Role.BEAST],
exclusiveGroups: [[Role.BEAST, Role.CON_ARTIST]],  // CON_ARTIST는 S3에서 추가
minPlayers: { BEAST: 6, SHAMAN: 8, REPORTER: 11 },
```

`minPlayers` 세 항목의 근거:
- `BEAST: 6` — 4~5인은 시민이 3~4명뿐이라 은폐자가 도는 시간이 없다
- `SHAMAN: 8` — §5.2 표가 영매를 8인 구성부터 넣는다
- `REPORTER: 11` — §8.4 6순위. 조기 특종이 게임을 끝낸다

정치인·자경단원·군인은 §8.4에 근거가 없어 제한하지 않는다(§1.2 참조).

#### 킬 예산 재정의

현재 `nightKillBudget(citizenSlots)`은 시민 자리만 본다. 리드가 짐승인간이면
"리드가 이미 하나를 썼다"는 계산이 그대로 성립하므로 **`nightKillBudget` 자체는
바뀌지 않는다.** 바뀌는 것은 리드가 `MAFIA`로 고정되지 않는다는 점뿐이다.

| 인원 | 리드 후보 | 결과 |
| :-: | --- | --- |
| 4~5 | `[MAFIA]` (짐승인간 `minPlayers: 6`에 막힘) | 마피아 1 |
| 6 | `[MAFIA, BEAST]` | 마피아 1 **또는 짐승인간 1** ← 여기가 목표 |
| 7~9 | `[MAFIA, BEAST]` | 리드가 짐승인간이면 2번째는 예산 0이라 `MAFIA` |
| 10~12 | `[MAFIA, BEAST]` | 예산 2. 배타 규칙이 짐승인간 중복을 막는다 |

6인에서 짐승인간이 리드가 되면 **마피아 채팅이 없다**(`nightChat: null`).
혼자이므로 대화 상대도 없어 손실이 0이다 — §5.2가 지적한 "소인원에서만
쓸 수 있는 깔끔한 해법"이 여기서 성립한다.

7~9인에서 짐승인간이 리드가 되면 2번째 마피아는 예산 때문에 `MAFIA`가 되고,
**둘 사이에 채팅이 없다** — 짐승인간은 `nightChat: null`, 순수 마피아는
`ChatChannel.MAFIA`다. 마피아 채팅에 혼자 있는 마피아가 생긴다.

이것이 버그가 아님을 확인해 두어야 한다. `inMafiaChat`은 좌석별로 판정하므로
동작은 정합하고, "마피아 팀인데 대화 상대가 없다"는 상황은 짐승인간이 이미
가진 성질이다. 다만 **경험이 좋지 않다** — 순수 마피아 입장에서 팀원이 있는데
말을 걸 수 없다.

**결정: 7~9인은 리드를 `MAFIA`로 고정한다.** `minPlayers`로 표현할 수 없으므로
(6인은 허용, 7~9인은 금지, 10인 이상은 2번째 자리로 허용) 리드 선정에 조건을
하나 둔다: **팀 인원이 2 이상이고 킬 예산이 1이면 리드 후보에서 단독 킬러를 뺀다.**
이 조건은 인원 숫자를 적지 않고 예산으로 표현되므로 정원이 바뀌어도 따라온다.

#### 검증 기준

- 신규 테스트: 6인 판을 1000회 돌려 짐승인간 리드가 40~60% 등장
- 신규 테스트: 7~9인 판에서 짐승인간이 한 번도 등장하지 않는다
- 신규 테스트: 10~12인 판에서 짐승인간이 최대 1명
- 신규 테스트: 4~5인 판에서 짐승인간이 등장하지 않는다
- 신규 테스트: `exclusiveGroups`에 같이 든 직업 두 개가 한 덱에 함께 나오지 않는다
- 신규 테스트: 기자가 10인 이하 덱에, 영매가 7인 이하 덱에 나오지 않는다
- 신규 테스트: `minPlayers`가 비어 있으면(S1 상태) 모든 직업이 제한 없이 나온다
- 신규 테스트: `leadPool`이 인원 필터로 전부 비어도 `Role.MAFIA`가 리드가 된다
- 회귀: 모든 인원에서 덱 길이 = 참가 인원, 마피아 팀 인원 = 표

---

### S3 — 밤 파이프라인 + 사기꾼

가장 큰 슬라이스다. 앞의 세 슬라이스가 먼저 나가 있으므로 이 변경은 순수하게
정산 로직만 담는다.

#### 변경

| 파일 | 변경 |
| --- | --- |
| `src/domain/NightPipeline.ts` | **신규.** `NightStep`, `NightIntent`, `resolveNightIntents` |
| `src/domain/NightResolution.ts` | `resolveNightSelect` → `recordNightIntent`로 축소. `resolveNightCasualties`는 **그대로 재사용** |
| `src/domain/Roles.ts` | 모든 직업에 `nightStep`. 사기꾼 정의 추가 |
| `src/types/Game.types.ts` | `Role.CON_ARTIST`, `Room.nightIntents`, `Room.nightReveals` |
| `src/entities/Room.ts` | `resetRound`가 `nightIntents`를 비운다 |
| `src/services/Night.ts` | 클릭 → intent 기록, 밤 종료 시 파이프라인 호출 |
| `src/services/GameFlow.ts` | 아침 진입 직전 `nightReveals` 배포 |
| `src/domain/RuleSet.ts` | `mafiaPool`·`exclusiveGroups`·`minPlayers`에 사기꾼 |

#### 정산 순서

```ts
export const NightStep = {
	BLOCK:   20,  // 능력 차단 — 시즌 2 마담·건달
	PROTECT: 30,  // 보호 — 의사
	ATTACK:  40,  // 공격 — 마피아·짐승인간·자경단원
	DEATH:   50,  // 사망 확정 + 자경단원 자책
	INSPECT: 60,  // 조사 — 경찰·스파이·점쟁이
	AFTER:   70,  // 사후 — 기자 특종·건달 협박·시민 쪽지·사기꾼 역알림
} as const;
```

원문 §4.2의 `SWAP: 10`은 넣지 않는다 — 마술사(시즌 3) 전용이고, 숫자 사이가
비어 있어 나중에 끼울 수 있다. `SILENCE`를 `AFTER`에 둔 이유: 협박은 다음 낮에
작용하므로 사망 확정 뒤에 걸어야 이미 죽은 사람을 협박하는 낭비가 없다.

#### `sort`를 쓰지 않는다

README가 Jint에서 `sort` 안정성을 믿지 않기로 정했다. 정렬 대신 **step 배열을
고정 순서로 순회하고, 각 step 안에서 좌석 배열을 순서대로 순회**한다.

```ts
const STEP_ORDER: readonly number[] = [
	NightStep.BLOCK, NightStep.PROTECT, NightStep.ATTACK,
	NightStep.DEATH, NightStep.INSPECT, NightStep.AFTER,
];
```

`beginGame`이 `shuffle(room.seats)` 후 `assignRole(seat, i + 1, ...)`을 하므로
`seats[i].index === i + 1`이 보장된다. 즉 좌석 배열 순회가 곧 좌석 번호 순서다.
비교 함수도, 정렬도 없다.

#### 시그니처

```ts
export interface NightIntent {
	readonly actor: number;   // 좌석 index
	readonly target: number;  // 좌석 index
}

export interface NightReveal {
	readonly seat: number;
	readonly line: string;
}

export interface NightSettlement {
	readonly casualties: Casualty[];
	readonly reveals: NightReveal[];
}

export function resolveNightIntents(
	seats: Seat[],
	intents: readonly NightIntent[],
	opts: { readonly skipAttacks: boolean },
): NightSettlement
```

`NightIntent`에 `kind`를 담지 않는다. 종류는 `actor`의 직업에서 읽으면 되고,
중복 저장하면 둘이 어긋날 자리가 생긴다.

`opts`를 객체로 받는 이유는 호출부에서 `undefined`가 흘러들 자리를 없애기
위함이다 — ZEP API에 `undefined`를 넘기지 않는다는 규칙이 이 파일에는 직접
적용되지 않지만, 같은 습관을 유지한다.

#### 사망 정산은 재사용한다

`resolveNightCasualties(seats)`를 **고치지 않고 `DEATH` step에서 그대로 호출한다.**
치유·방탄·자책의 우선순위가 이미 검증되어 있고, 파이프라인이 하는 일은
"그 함수가 보는 상태를 언제 만드는가"를 바꾸는 것뿐이다. 이것이 이 슬라이스의
회귀 위험을 가장 크게 줄이는 결정이다.

```ts
for (const step of STEP_ORDER) {
	if (step === NightStep.DEATH) {
		if (!opts.skipAttacks) casualties = resolveNightCasualties(seats);
		continue;
	}
	for (const seat of seats) { /* 이 좌석의 intent가 이 step이면 적용 */ }
}
```

첫 밤 무사는 `ATTACK` step의 적용과 `DEATH` step 양쪽을 건너뛴다.
`attackedBy`가 채워지지 않으므로 `armored`도 소모되지 않는다 —
S0에서 별도 분기로 막았던 문제가 여기서는 구조적으로 발생하지 않는다.

#### 조사 응답의 이동

`INSPECT_TEAM` · `INSPECT_ROLE`이 클릭 시점에 문자열을 반환하던 것을
`reveals`에 넣는다. 클릭 시점에는 접수 확인만 보인다.

| 시점 | 지금 | 이후 |
| --- | --- | --- |
| 클릭 | "3번은 마피아입니다!" | "3번을 조사합니다." |
| 아침 직전 | — | "🔍 3번은 마피아입니다." |

**죽은 사람에게도 배포한다.** 조사하고 그 밤에 죽은 경찰의 정보는 유령 채널을
통해 영매에게 전달될 수 있어야 한다. `INSPECT`가 `DEATH` 뒤에 오므로 이 순서가
자연스럽게 성립한다.

**게임이 그 밤에 끝나도 배포한다.** `advancePhase`의 `NIGHT` 분기가
`finishIfDecided || beginDay`인데, 두 경로 **모두** 배포를 거쳐야 한다.
배포를 `beginDay`에만 두면 마지막 밤의 조사 결과가 사라진다.

조사 대상이 그 밤에 죽었어도 답은 동일하다 — 사망 여부를 답에 섞지 않는다.
섞으면 "조사했더니 죽어 있었다"가 사망자 명단보다 먼저 새는 경로가 된다.

#### 스파이 합류 시점

`defectsToMafia`는 `INSPECT` step에서 판정된다. `DEATH`보다 뒤이므로 그 밤에
죽은 스파이도 조사 답을 받고 진영이 바뀐다. `countAlive`가 죽은 좌석을 세지
않으므로 승패에는 영향이 없고, 이는 클릭 즉시 처리하던 현재와 동일한 결과다.

살아 있는 스파이가 합류하면 승패 마진이 2 변하고, 이 변화가 그 밤의
`evaluateWinner`에 반영된다 — 현재와 같다.

#### 사기꾼

```ts
CON_ARTIST: {
	displayName: "사기꾼",
	team: Team.MAFIA,
	glyph: "🎭",
	ability: "경찰 조사에 시민으로 나옵니다. 조사당하면 다음 아침에 알게 됩니다.",
	tip: "당당하게 조사를 요구하세요. 당신은 절대 마피아로 나오지 않습니다.",
	nightAction: null,
	nightChat: ChatChannel.MAFIA,
	nightSprite: null,
	nightAttackSprite: null,
	nightPrompt: null,
	nightNotice: MAFIA_CHAT,
	nightStep: NightStep.AFTER,
	immuneToVote: false,
	// appearsAsMafia를 켜지 않는다 — 그것이 이 직업의 전부다
},
```

`nightAction: null` + `nightChat: MAFIA`는 새로운 조합이 아니다. 영매가
`nightAction: null` + `nightChat: GHOST`로 같은 형태를 이미 쓴다.
`inMafiaChat`은 `team === MAFIA && nightChat === MAFIA`이므로 사기꾼은
마피아 채팅에 들어가고, `hasNightTurn`은 `nightAction`이 없어 false다.

**위장은 파이프라인이 필요하지 않다.** `appearsAsMafia`를 켜지 않는 것만으로
경찰 조사가 "마피아가 아닙니다"를 낸다 — 짐승인간이 쓰는 것과 같은 메커니즘이다.
파이프라인이 필요한 것은 **역알림**이다.

#### 역알림 규칙

| 조사자 | 사기꾼이 받는 답 | 사기꾼의 알림 |
| --- | --- | --- |
| 경찰 (`INSPECT_TEAM`) | "마피아가 아닙니다" | ○ |
| 스파이 (`INSPECT_ROLE`) | "사기꾼입니다" — **위장이 통하지 않는다** | ○ |
| 점쟁이 (`INSPECT_ABILITY`, S4) | "능력 없음" | ○ |

스파이의 정확한 직업 조사에는 위장이 통하지 않는다. 통하게 하면 스파이가
마피아팀을 찾을 수 없어 `defectsToMafia`가 막히고, 위장이 "조사 계열 전체 무효"로
과해진다. 위장의 범위는 **진영 조사 한정**이다.

알림 문안 (여러 명이 조사해도 한 줄):

> 🎭 어젯밤 누군가 당신을 조사했습니다.

누가 조사했는지는 알려주지 않는다 — §6-1대로, 알면 경찰을 찾아 죽일 수 있어
과하다.

#### 덱 배치

```ts
mafiaPool: [Role.MAFIA, Role.BEAST, Role.CON_ARTIST],
exclusiveGroups: [[Role.BEAST, Role.CON_ARTIST]],
minPlayers: { BEAST: 6, CON_ARTIST: 7, SHAMAN: 8, REPORTER: 11 },
```

사기꾼은 `nightAction: null`이라 `killsIndependently`가 false이므로 킬 예산
필터를 통과한다. 즉 **7인부터 예산과 무관하게 들어간다** — §6-1이 노린 지점이다.

리드 후보에는 넣지 않는다. 사기꾼이 리드면 그 판에 밤 킬이 아예 없어
마피아가 이길 수단이 사라진다.

S3 적용 후 마피아팀 구성:

| 인원 | 팀 | 구성 |
| :-: | :-: | --- |
| 4~5 | 1 | 마피아 |
| 6 | 1 | 마피아 또는 짐승인간 |
| 7~9 | 2 | 마피아 + 사기꾼 |
| 10 | 2 | 마피아 + (짐승인간 또는 사기꾼) |
| 11~12 | 3 | 마피아 + 마피아 + (짐승인간 또는 사기꾼) |

7~9인이 고정인 것은 D5에 적은 그대로다 — 2번째 자리 후보가 예산 필터를
통과하는 것이 사기꾼뿐이기 때문이다. 마담(시즌 2)이 같은 성질(킬 없음)이라
그때 랜덤이 회복된다.

#### 검증 기준

- **회귀 기준이 이 슬라이스의 본체다.** 기존 밤 관련 테스트가 통과해야 한다.
  단, 조사 결과 확인 시점이 바뀌므로 **응답 시점을 검사하는 테스트는 갱신 대상**이다
  (아래 테스트 절)
- 신규 테스트: 의사가 마피아보다 늦게 클릭해도 대상이 살아난다. 클릭 순서를
  뒤집어도 결과가 같다 — **이 판정이 이 슬라이스의 존재 이유다**
- 신규 테스트: 자경단원 자책이 `DEATH` step에서 일어난다
- 신규 테스트: 조사 결과가 `reveals`에 담기고 클릭 응답에는 답이 없다
- 신규 테스트: 그 밤에 죽은 경찰도 `reveals`를 받는다
- 신규 테스트: 마지막 밤(게임 종료)에도 `reveals`가 배포된다
- 신규 테스트: 첫 밤 무사에서 `ATTACK`·`DEATH`가 건너뛰어지고 `armored`가 남는다
- 신규 테스트: 경찰이 사기꾼을 조사하면 "마피아가 아닙니다", 사기꾼에게 역알림
- 신규 테스트: 스파이가 사기꾼을 조사하면 정확한 직업이 나오고 마피아에 합류
- 신규 테스트: 사기꾼이 마피아 채팅에 들어가고 밤 차례는 없다
- 신규 테스트: 같은 밤에 두 명이 사기꾼을 조사해도 역알림은 한 줄

#### 롤백 조건

밤 결과 지연이 체감 문제로 관측되면(밤→아침 전환에서 이탈 증가) 컷 길이를
늘려 라벨이 읽히는 시간을 확보한다. 정산 구조 자체를 되돌리지는 않는다 —
되돌리면 시즌 2 전체가 막힌다.

---

### S4 — `firstNightOnly` + 점쟁이

**목적.** §3.6의 "첫 투표 랜덤 처형 메타"를 깬다. 첫 밤 무사(S0)와 짝이다 —
아무도 죽지 않는 대신 약한 정보 한 조각은 존재하게 한다.

#### 변경

| 파일 | 변경 |
| --- | --- |
| `src/domain/Roles.ts` | `NightActionKind.INSPECT_ABILITY`, `firstNightOnly?`, 점쟁이 정의 |
| `src/domain/NightResolution.ts` | `noTurnReason`에 `firstNightOnly` 분기 |
| `src/domain/NightPipeline.ts` | `INSPECT` step에 `INSPECT_ABILITY` 처리 |
| `src/types/Game.types.ts` | `Role.SEER` |
| `src/domain/RuleSet.ts` | `citizenPool`·`minPlayers`에 점쟁이 |

#### 점쟁이

```ts
SEER: {
	displayName: "점쟁이",
	team: Team.CITIZEN,
	glyph: "🃏",
	ability: "첫 밤에만, 한 명이 밤에 쓸 능력을 가졌는지 봅니다.",
	tip: "진영은 알 수 없습니다. 언제 말할지가 당신의 유일한 선택입니다.",
	nightAction: NightActionKind.INSPECT_ABILITY,
	nightChat: null,
	nightSprite: "seer",
	nightAttackSprite: null,
	nightPrompt: "점을 볼 대상을 선택하세요. 첫 밤에만 가능합니다.",
	nightNotice: NO_CHAT,
	nightStep: NightStep.INSPECT,
	immuneToVote: false,
	firstNightOnly: true,
},
```

`maxUses`가 필요하지 않다. 첫 밤 하나뿐이고 그 밤 안에서는 `usedSkill`이
두 번째 지목을 막는다. `firstNightOnly` 한 줄로 충분하다 —
이 판단이 S5에서 `maxUses`를 시민 쪽지와 함께 넣는 근거다.

#### "능력이 있다"의 정의

```
roleDef(target.role).nightAction !== null
```

**"밤에 대상을 지목하는 능력"**이다. "오늘 쓸 수 있는가"가 아니다.

| 답 | 직업 |
| --- | --- |
| 있음 | 마피아, 짐승인간, 의사, 경찰, 자경단원, 기자, 스파이, 점쟁이 |
| 없음 | 사기꾼, 영매, 군인, 정치인, 시민 |

경계 사례를 규칙으로 못 박아 둔다.

- **자경단원은 "있음"이다.** `needsPriorDay`라 첫 밤에 쓸 수 없지만 능력은 있다.
  정의가 "보유"이므로 일관된다
- **사기꾼은 "없음"이다.** 마피아팀 중 유일하다. 그러나 시민·군인·정치인·영매가
  같은 답을 내므로 확정 정보가 아니다 — §6-8이 의도한 "정교하게 약한 정보"가
  여기서 성립한다
- **점쟁이 자신도 "있음"이다.** 자기 지목이 가능한지는 기존 밤 위젯 규칙을 따른다

응답은 `reveals`로 아침에 배포된다:

> 🃏 3번은 밤에 쓸 능력이 **있습니다**.

#### 덱 배치

```ts
citizenPool: [
	Role.POLITICIAN, Role.SHAMAN, Role.SPY,
	Role.SOLDIER, Role.REPORTER, Role.VIGILANTE, Role.SEER,
],
minPlayers: { BEAST: 6, SEER: 6, CON_ARTIST: 7, SHAMAN: 8, REPORTER: 11 },
```

속도전 덱에는 넣지 않는다 — §7-2의 다섯 직업 원칙을 유지한다.

#### 검증 기준

- 신규 테스트: 점쟁이가 첫 밤에 지목할 수 있고, 둘째 밤부터 차례가 없다
- 신규 테스트: 차례가 없는 점쟁이가 `nightProgress`의 분모에서 빠진다
- 신규 테스트: 응답이 `nightAction !== null`과 정확히 일치 (12+3직업 전수)
- 신규 테스트: 자경단원 조사 결과가 "있음"
- 신규 테스트: 사기꾼 조사 결과가 "없음"이고 사기꾼에게 역알림이 간다
- 신규 테스트: 점쟁이가 4~5인 덱에 나오지 않는다

---

### S5 — `maxUses` + 시민 개편

**목적.** 무능력 시민에게 정보를 주지 않으면서 행동거리를 준다.
시민은 여전히 아는 게 없지만 **유통**은 할 수 있다.

#### 변경

| 파일 | 변경 |
| --- | --- |
| `src/domain/Roles.ts` | `maxUses?`, `oncePerGame` **삭제**, `NightActionKind.NOTE`, 시민 정의 |
| `src/types/Game.types.ts` | `Seat.skillSpent: boolean` → `Seat.skillUsed: number` |
| `src/entities/Room.ts` | `createSeat`·`assignRole`에서 `skillUsed = 0` |
| `src/domain/NightResolution.ts` | `noTurnReason`이 `maxUses`를 본다 |
| `src/domain/NightPipeline.ts` | `AFTER` step에 `NOTE`. 정산 시 `skillUsed++` |
| `src/services/Night.ts` | 쪽지 문구 선택 UI |
| `src/domain/chat/QuickPhrases.ts` | 쪽지 문구셋 |

#### `oncePerGame` → `maxUses`

```ts
// 이전
oncePerGame: true,
// 이후
maxUses: 1,
```

자경단원·기자 두 곳이다. `oncePerGame`은 남기지 않고 지운다 — 두 표현이
공존하면 새 직업에서 어느 쪽을 쓸지가 매번 판단거리가 된다.

`noTurnReason`의 판정:

```ts
if (def.maxUses !== undefined && seat.skillUsed >= def.maxUses && !seat.usedSkill) {
	return "이 능력은 이미 사용했습니다.";
}
```

`!seat.usedSkill` 조건은 기존 코드에 있던 것을 그대로 옮긴다 —
이번 밤에 방금 쓴 사람이 `nightProgress`의 분모에서 빠지지 않게 하는 장치다.

`skillUsed++`는 **정산 시점에만** 일어난다(D2). 클릭 시점에는 `usedSkill = true`만
세운다.

#### 익명 쪽지

```ts
CITIZEN: {
	displayName: "시민",
	team: Team.CITIZEN,
	glyph: "🧑",
	ability: "게임에 한 번, 밤에 한 명에게 익명 쪽지를 보냅니다.",
	tip: "당신의 무기는 투표와 쪽지입니다. 누구를 믿을지 고르세요.",
	nightAction: NightActionKind.NOTE,
	nightChat: null,
	nightSprite: null,
	nightAttackSprite: null,
	nightPrompt: "쪽지를 보낼 대상을 선택하세요. 이 판에 한 번뿐입니다.",
	nightNotice: NO_CHAT,
	nightStep: NightStep.AFTER,
	immuneToVote: false,
	maxUses: 1,
},
```

**자유 입력이 아니다**(D6). 대상을 고른 뒤 정형 문구 하나를 고른다.

```ts
const QUICK_NOTE: string[] = [
	"당신을 믿습니다",
	"당신이 의심됩니다",
	"오늘은 조용히 계세요",
	"내일 나서 주세요",
	"저에게 투표하지 마세요",
	"우리 편이라면 신호를 주세요",
];
```

문구 여섯 개는 §6-12가 노린 딜레마를 유지하도록 골랐다. 정보를 담지 않으면서
**행동을 요구**한다 — 받은 사람은 이게 시민의 진심인지 마피아의 함정인지 모른다.

수신은 아침 직전 개인 라벨이다:

> ✉️ **익명 쪽지:** 내일 나서 주세요.

발신자를 표시하지 않는다. 마피아도 시민을 사칭할 수 없다 — 마피아는
`nightAction: ATTACK`이라 쪽지를 못 보낸다. 즉 **쪽지는 항상 진짜 시민이
보낸 것**이고, 그럼에도 그 시민이 무엇을 아는지는 알 수 없다.

이것이 §6-12의 원안("마피아도 쪽지를 쓸 수 있으므로 믿을 수 없다")과 다른
점이다. 원안대로 하려면 마피아팀 직업에도 쪽지 능력을 줘야 하는데, 그러면
마피아가 밤마다 킬과 쪽지를 둘 다 하게 되어 밤 행동이 하나가 아니게 된다.

**결정: 시즌 1은 시민 전용으로 낸다.** 진짜 시민만 보낼 수 있다는 사실이
공개 규칙이므로, 쪽지는 "확정 시민 1명의 익명 요청"이 된다. 이것도 충분히
딜레마다 — 누가 보냈는지 모르니 커밍아웃을 대신할 수 없고, 요청을 따르면
그 시민이 원하는 대로 판이 움직인다. 마피아팀 쪽지는 시즌 2에서 마담과 함께
재검토한다(마담은 킬이 없어 쪽지를 겸할 여유가 있다).

#### 검증 기준

- 신규 테스트: `oncePerGame` 참조가 코드베이스에 남아 있지 않다
- 신규 테스트: 자경단원·기자가 게임당 한 번만 쓴다 (기존 동작 회귀)
- 신규 테스트: `skillUsed`가 정산 시점에 증가하고 클릭 시점에는 그대로다
- 신규 테스트: 시민이 판당 한 번 쪽지를 보내고, 두 번째 밤에 차례가 없다
- 신규 테스트: 쪽지가 대상에게만 배포되고 발신자 정보가 없다
- 신규 테스트: 죽은 시민이 쪽지를 보낼 수 없다
- 신규 테스트: 쪽지 대상이 그 밤에 죽으면 쪽지가 배포되지 않는다
- 신규 테스트: 시민이 `nightProgress`의 분모에서 빠지고, 다른 직업의 분모는 그대로다
- 신규 테스트: 시민 전원이 쪽지를 안 보내도 밤이 정상적으로 타이머로 끝난다

`nightProgress` 항목을 확인해 두었다. 시민이 밤 행동을 갖게 되면 진행 막대의
분모가 커진다(`hasNightTurn`이 true가 되므로). **밤이 조기 종료되지는 않는다** —
`room.phaseTimer`는 `beginNight`에서 한 번 세팅되고 tick으로만 줄어들며,
"전원 완료"로 페이즈를 넘기는 경로가 없다. 즉 쪽지를 안 보내고 넘겨도
아무 문제가 없고, 막대가 안 차는 것이 유일한 변화다.

막대가 끝까지 안 차는 것은 손실이다. 쪽지는 **안 보내는 것이 정상 플레이**이므로,
막대가 항상 미완으로 보이면 다른 사람을 기다리는 것으로 오해된다.
**시민의 쪽지는 분모에서 뺀다** — `nightProgress`가 `NightActionKind.NOTE`를
제외한다. 능력 소모가 판당 1회인 선택형 행동이라 "전원이 끝냈는가"의 대상이 아니다.

---

## 6. 밤 정산 전체 명세

S5까지 적용된 최종 상태다.

| step | 종류 | 직업 | 대상 | 효과 |
| :-: | --- | --- | --- | --- |
| 20 | `BLOCK` | (시즌 2) | — | — |
| 30 | `HEAL` | 의사 | 산 사람 1 | `target.healed = true` |
| 40 | `ATTACK` | 마피아, 짐승인간, 자경단원 | 산 사람 1 | `target.attackedBy.push(actor)` |
| 50 | — | — | — | `resolveNightCasualties(seats)` |
| 60 | `INSPECT_TEAM` | 경찰 | 산 사람 1 | 진영 답 → `reveals` |
| 60 | `INSPECT_ROLE` | 스파이 | 산 사람 1 | 직업 답 → `reveals`, 마피아팀이면 합류 |
| 60 | `INSPECT_ABILITY` | 점쟁이 | 산 사람 1 | 능력 유무 답 → `reveals` |
| 70 | `SILENCE` | (건달, 덱 제외) | 산 사람 1 | `target.silenced = true` |
| 70 | `SCOOP` | 기자 | 산 사람 1 | `target.scooped = true` |
| 70 | `NOTE` | 시민 | 산 사람 1 | 문구 → 대상의 `reveals` |
| 70 | — | 사기꾼 | — | 조사당했으면 역알림 → `reveals` |

**같은 step 안의 순서는 좌석 번호 오름차순이다.** 의사 둘이 같은 사람을
치유하거나 마피아 둘이 다른 사람을 공격하는 경우 모두 결과가 결정적이다.

첫 밤 무사(`skipAttacks`)에서 건너뛰는 것: step 40, step 50.
나머지 step은 모두 정상 작동한다.

---

## 7. 엣지케이스 매트릭스

구현 중 판단이 갈릴 수 있는 조합을 미리 확정한다.

| # | 상황 | 결과 | 근거 |
| :-: | --- | --- | --- |
| 1 | 첫 밤 무사 + 군인이 공격받음 | `armored` 유지 | 사망 정산에 들어가지 않으므로 소모될 이유가 없다 |
| 2 | 첫 밤 무사 + 자경단원 | 애초에 지목 불가 | `needsPriorDay` |
| 3 | 조사자가 그 밤에 사망 | `reveals` 배포됨 | 유령 채널로 정보가 흐를 수 있어야 한다 |
| 4 | 조사 대상이 그 밤에 사망 | 답은 동일, 사망 언급 없음 | 사망자 명단보다 먼저 새면 안 된다 |
| 5 | 게임이 그 밤에 종료 | `reveals` 배포됨 | `finishIfDecided` 경로도 배포를 거친다 |
| 6 | 쪽지 대상이 그 밤에 사망 | 배포 안 함, `skillUsed`는 증가 | 죽은 사람에게 배달되지 않는다. 판당 1회를 잘못 쓴 것도 판단의 결과다 |
| 7 | 스파이가 사기꾼을 조사 | 정확한 직업 노출 + 합류 | 위장의 범위는 진영 조사 한정 |
| 8 | 사기꾼을 두 명이 조사 | 역알림 한 줄 | 조사자 수가 새면 경찰 수가 노출된다 |
| 9 | 점쟁이가 사기꾼을 조사 | "없음" + 역알림 | 정의가 `nightAction !== null` |
| 10 | 6인 리드가 짐승인간 | 마피아 채팅 없음 | 혼자라 상대가 없다 |
| 11 | `leadPool`이 인원 필터로 전부 비었다 | `Role.MAFIA`로 대체 | 마피아 없는 판은 성립하지 않는다 |
| 12 | 배타 그룹 두 직업이 모두 후보 | 하나만 뽑고 동료를 풀에서 제거 | 그룹 내 균등 |
| 13 | 4~5인 판 | 첫 밤 무사 적용, 지표 집계 제외 | D8 |
| 14 | 속도전에 9명이 들어옴 | 경로 없음 (`maxPlayers: 8`) | 배열 길이는 13으로 맞춰 인덱스 접근을 항상 정의한다 |
| 15 | 침묵전 마피아 밀담 | 제한 없음 | 밀담까지 좁히면 시민 쪽으로 기운다 |
| 16 | 재접속 중 밤 정산 | `showPhaseView`가 아침 상태를 그린다 | `reveals`는 접속 중인 좌석에만 배포. 미접속자는 놓친다 |

16번은 남는 손실이다. 현재도 밤 결과 라벨은 접속 중인 플레이어에게만
전달되므로 동작 변화는 아니다. 놓친 조사 결과를 복구하는 것은 개인 로그 저장을
요구하고, 그건 시즌 4 관전 작업과 같은 인프라다.

---

## 8. 테스트 계획

### 8.1 기존 테스트 갱신 목록

건달 정정과 파이프라인 전환이 기존 단정을 바꾼다.

| 파일 | 위치 | 현재 단정 | 갱신 |
| --- | --- | --- | :-: |
| `tests/domain.test.ts` | 493 | 경찰이 건달을 조사 → "마피아입니다" | S0 |
| `tests/domain.test.ts` | 536 | 스파이가 건달을 조사 → 합류 | S0 |
| `tests/domain.test.ts` | 500 | `resolveNightSelect(건달, …)`가 `silenced`를 즉시 세운다 | S3 |
| `tests/gameflow.test.ts` | 542 | 5인 건달 덱으로 협박 흐름 | S0 (진영), S3 (시점) |
| `tests/chat.test.ts` | 795 | 6인 건달 덱으로 발언 봉쇄 | S0 (진영), S3 (시점) |

건달 덱을 명시적으로 구성하는 테스트는 **남긴다.** 덱 빌더가 건달을 내지
않더라도 능력 자체는 살아 있고, 시즌 2 재설계 때 되돌아올 코드다. 테스트가
없으면 그때 처음부터 다시 만들게 된다.

`resolveNightSelect`를 직접 부르는 테스트는 S3에서 **파이프라인 호출로 바꾼다.**
"클릭이 상태를 바꾼다"는 단정 자체가 없어지는 것이므로 단순 수정이 아니라
의도의 이전이다.

### 8.2 신규 테스트 파일

| 파일 | 슬라이스 | 다루는 것 |
| --- | :-: | --- |
| `tests/deck.test.ts` | S0, S2 | 인원별 마피아 수, 리드 풀, 배타 규칙, 최소 인원, 킬 예산 |
| `tests/ruleset.test.ts` | S1 | 이동 전후 값 일치, 방 배정, 모드별 페이즈 길이, 침묵전 채팅 |
| `tests/night-pipeline.test.ts` | S3 | step 순서, 클릭 순서 무관성, `reveals` 배포, 첫 밤 무사 |
| `tests/roles-season1.test.ts` | S3, S4, S5 | 사기꾼·점쟁이·시민 쪽지의 규칙과 경계 사례 |

기존 8개 파일(`assets`, `chat`, `domain`, `gameflow`, `isolation`, `layout`,
`reconnect`, `spectate`) 구조를 유지한다.

### 8.3 슬라이스별 통과 조건

모든 슬라이스에서 `npm run verify`(= `type-check && lint && check:zep && test && check:ui`)가
클린이어야 한다. `check:zep`이 Jint 제약(`Map`/`Set` 금지, `undefined` 인자 금지)을
잡으므로 별도 수동 점검이 필요 없다.

추가로 슬라이스별 회귀 기준:

| 슬라이스 | 회귀 기준 |
| :-: | --- |
| S0 | 덱·밸런스 테스트 외 **모든** 기존 테스트가 무수정 통과 |
| S1 | 표준전(방 1~5)에 대한 **모든** 기존 테스트가 무수정 통과. 수정이 필요하면 순수 이동이 아니었다 |
| S2 | 밤·채팅·재접속 테스트 무수정 통과 (덱만 바뀐다) |
| S3 | 8.1의 5개 외 모든 기존 테스트 무수정 통과 |
| S4 | 전체 무수정 통과 (순수 추가) |
| S5 | `oncePerGame` 관련 테스트만 갱신, 나머지 무수정 통과 |

---

## 9. 계측과 검증 기준

### 9.1 목표 지표

§8.4의 관측 지표 중 이 시즌에 판정 가능한 것만 옮겼다.

| 지표 | 목표 | 벗어나면 |
| --- | --- | --- |
| 6~8인 시민 승률 | 50±5% | `mafiaTeamSize` 또는 `firstNightPeacefulUpTo` 조정 |
| 9~12인 시민 승률 | 50±5% | 배타 규칙 또는 `minPlayers` 조정 |
| 평균 라운드 수 | 3~5 | 1~2라운드가 20%를 넘으면 소인원 재조정 |
| 평균 판 길이 | 5~10분 (속도전 3~4분) | `timing` 조정 |
| 사기꾼 등장 판의 경찰 정확도 | 유의미하게 하락 | 하락이 없으면 사기꾼이 일을 안 하고 있다 |
| 쪽지 사용률 | 시민 중 40% 이상 | 미만이면 문구가 쓸 만하지 않다 |
| 속도전 재시작률 | 표준전보다 높음 | 아니면 §7-2의 "한 판만 더" 전제가 틀렸다 |

4~5인 판과 `ranked: false` 모드는 집계에서 제외한다(D8, `countsForMetrics`).

### 9.2 미결 항목 — 계측 경로

**현재 저장소에 승률·라운드 수를 내보내는 경로가 없다.**
`ScriptApp.httpPostJson`으로 CCU를 보고하는 코드가 있으므로 같은 경로를 쓸 수는
있지만, 무엇을 어디로 보낼지가 정해져 있지 않다.

§9.1의 목표는 **데이터가 있어야 판정 가능하다.** 즉 S0의 검증이 실제로는
계측 없이 끝나지 않는다.

이 문서는 계측 설계를 포함하지 않는다. 다음 중 하나를 별도로 정해야 한다.

1. 게임 종료 시 요약 1건을 `httpPostJson`으로 보낸다 (수집처 미정)
2. 관리자 명령으로 방별 누적 통계를 조회한다 (외부 의존 0, 표본이 세션에 갇힘)
3. 시즌 1을 지표 없이 출하하고 체감 피드백으로 판단한다 (가장 빠르고 가장 부정확)

**권고: 1번을, S0과 같은 시점에 별도 슬라이스로.** S0의 밸런스 변경이
기준선 측정의 대상이므로, 계측이 S0보다 먼저 또는 같이 나가지 않으면
"바뀌기 전"의 데이터가 영구히 없다.

이 판단은 수집처(어떤 서버로 보낼지)가 정해져야 진행할 수 있으므로
설계 범위를 벗어난다.

---

## 10. 시즌 2로 넘기는 것

이 시즌에서 자리는 마련되지만 채우지 않는 것들이다.

| 항목 | 이 시즌에 준비된 것 | 시즌 2에 할 일 |
| --- | --- | --- |
| 건달 재설계 | `BLOCK` step, 시민팀 진영, `SILENCE` 코드 보존 | 능력을 `BLOCK`으로 교체, 덱 복귀. `SILENCE`·`Seat.silenced` 거취 확정 |
| 마담 | `BLOCK` step, `exclusiveGroups` | 마피아팀 교란자 추가. 7~9인 2번째 슬롯 랜덤 회복 |
| 경호원 | `PROTECT` step | 보호 계열 상한 2종(§8.4 4순위) 함께 |
| 도굴꾼·성직자 | — | `targetKind` / `targetCount` (§1.2에서 제외한 것) |
| 탐정 | `INSPECT` step | 방문 기록을 남기려면 intent 로그를 밤 종료 후에도 보관해야 한다 |
| 마피아팀 쪽지 | `NOTE` 종류 | 마담에게 쪽지를 겸하게 할지 판단 |
| 침묵전 번호 지목 | 문구셋 구조 | 사용률 지표를 보고 판단 |
| 정치인·자경단원 최소 인원 | — | 직업별 승률 관측 후 |
| 스파이 모드 격리 | — | 숨은배신자 모드(시즌 3)와 함께 |

`Room.soloWinners`와 `evaluateWinner` 변경은 시즌 3이다. 이 시즌에
[WinCondition.ts](../../../src/domain/WinCondition.ts)는 변경되지 않는다.
