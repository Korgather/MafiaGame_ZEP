# 시즌 0+1 통합 실행 설계

> 입력 문서: [docs/design/mafia42-reverse-planning.md](../../design/mafia42-reverse-planning.md)
> 작성일: 2026-07-30
> 상태: 설계 확정, 구현 계획 미작성

역기획 문서의 §4(구조 진단)·§5(구성)·§6(직업)·§7(모드)·§8(로드맵)을
**출하 가능한 7개 슬라이스**로 옮긴 문서다. 각 슬라이스는 독립 배포 단위이고,
자기 검증 기준과 롤백 조건을 갖는다.

원문 문서가 "무엇을 왜 만들 것인가"를 다뤘으므로 이 문서는 그것을 반복하지 않는다.
여기 있는 것은 **정확히 무엇을 바꾸는가, 어떤 순서로, 무엇이 통과하면 끝인가**다.

인용 표기: `§1`처럼 숫자만 있으면 **이 문서의 절**, `§6-1`처럼 하이픈이 붙으면
**입력 문서의 항목**이다.

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
| S6 | `BLOCK` 종류 · `Seat.blocked` | 건달 재설계 후 덱 복귀 | ○ |

원문 §8.3의 시즌 0(구조 5개)과 시즌 1(직업 3 + 모드 2 + 밸런스)을 하나로 합쳤다.
**모든 슬라이스가 유저에게 보이는 변화를 낸다** — 원문이 "콘텐츠 0개"로 계획한
시즌 0 구간이 사라진다.

S6은 원문에 없는 슬라이스다. 원문 §8.4 7순위는 건달을 "보류"로만 두고 대체
직업(마담)을 시즌 2로 미뤘는데, 그러면 **건달이 한 시즌 내내 덱에서 사라진
상태로 남는다.** S0에서 덱에서 빼는 것은 정정이고, 빼고 끝내는 것은 콘텐츠
손실이다. 파이프라인(S3)이 `BLOCK` step을 이미 깔아 두므로 같은 시즌에
되돌려 놓는다.

### 1.2 만들지 않는 것 (명시적 제외)

| 항목 | 원문 위치 | 왜 뺐는가 |
| --- | --- | --- |
| `targetKind` / `targetCount` | §8.3 시즌 0 | 시즌 1 직업 셋 모두 "살아있는 1명" 또는 `nightAction: null`로 표현된다. 소비자는 도굴꾼·성직자·마술사이고 전부 시즌 2~3이다. 소비자 없는 타입 확장은 시즌 2 첫 슬라이스에서 도굴꾼과 함께 넣는다 |
| `soloWinners` / `evaluateWinner` 변경 | §8.3 시즌 3 | 원문 판단 그대로. [WinCondition.ts](../../../src/domain/WinCondition.ts)는 이 시즌에 한 글자도 바뀌지 않는다 |
| 스파이 모드 전용 격리 | §8.1 | §8.1은 격리를 제안하지만 §8.4의 패치 우선순위 1~9에 스파이가 없다. 밸런스 근거 없이 기존 직업을 덱에서 빼는 것은 콘텐츠 축소다. 숨은배신자 모드(시즌 3)와 함께 옮긴다 |
| 정치인·자경단원 최소 인원 10 | §8.1 표 | 같은 이유. §8.4에 근거가 없고, 6~9인 시민 풀을 과하게 좁힌다. 시즌 2에서 판단 |
| 승률·판 길이 텔레메트리 전송 | — | 보낼 곳이 없다. 지표 없이 출하하고 체감 피드백으로 판정한다 — **결정 D10**, 대가는 §9.2에 적었다 |
| 마담, 경호원, 도굴꾼, 탐정 | §8.3 시즌 2 | 파이프라인의 투자 회수는 다음 시즌 |

### 1.3 분할 전략

**밸런스 핫픽스 선행 → 이후 수직 슬라이스.**

S0은 구조를 전혀 건드리지 않고 §8.4의 1·2순위 패치를 낸다. 지금 6인 방은
정보가 없는 첫 투표 한 번으로 게임이 끝나는 상태이고(§5.2), 이건 유저가 이미
겪고 있는 문제다. 구조 작업 뒤로 미룰 이유가 없다.

S1~S6은 **구조와 그 구조의 첫 소비자를 같은 슬라이스에 둔다.** 소비자 없이
구조만 내보내면 추상화가 빗나가도 알 수 없다 — 파이프라인의 `INSPECT` step이
사기꾼의 역알림을 실제로 표현할 수 있는지는 사기꾼을 만들어봐야 안다.

이 원칙 때문에 원문 부록 A의 순서를 한 군데 바꿨다: **점쟁이가 파이프라인
뒤로 간다.** 부록 A는 `maxUses` → `targetKind` → `leadPool` → 파이프라인
순서를 권했고 원문 §6.13은 점쟁이를 "구조 변경 없이 지금 만들 수 있는 3개"로
분류했다. 그대로 하면 점쟁이의 조사 응답을 클릭 즉시로 한 번 만들고
파이프라인에서 정산 시점으로 다시 옮기게 된다. 파이프라인 뒤로 미루면 재작업이 0이다.

### 1.4 배포 단위와 운영

각 슬라이스는 `res/main.js` 하나를 다시 올리는 것으로 배포된다. 여기서
**확인하지 않은 것을 확인한 것처럼 적지 않는다** — ZEP 스페이스에 스크립트를
재배포할 때 진행 중인 방이 어떻게 되는지는 이 저장소에서 알 수 없다.
`Room`·`Seat`는 전부 메모리 상태이고 영속화 경로가 없으므로
([Ccu.ts](../../../src/services/Ccu.ts)의 접속자 수 전송이 유일한 외부 통신이다)
**재배포 = 진행 중인 판 전멸**로 가정하고 계획한다.

이 가정이 맞다면 따라오는 것:

- 배포 창은 방이 비어 있을 때다. 슬라이스가 7개이므로 배포도 최소 7회다
- **롤백도 배포다.** "데이터 한 줄 되돌리기"가 싼 것은 코드 수정 비용이지
  운영 비용이 아니다 — 되돌리는 순간 그때 진행 중인 판도 같이 죽는다.
  각 슬라이스의 롤백 조건은 이 비용을 포함해서 읽어야 한다
- 그 대신 S5의 `Seat.skillSpent` → `skillUsed` 같은 필드 타입 변경에
  마이그레이션이 필요 없다. 배포 시점에 살아 있는 좌석이 없다

**첫 배포 전에 확인할 것 하나.** 재배포가 정말로 방 상태를 초기화하는지,
아니면 진행 중인 판이 옛 코드로 계속 도는지. 후자라면 S3(밤 정산 구조 변경)와
S5(필드 타입 변경)는 배포 도중 판이 깨질 수 있어 슬라이스 순서보다 배포 창이
먼저 정해져야 한다. 이 확인은 S0 배포 때 한 번 관찰하면 끝난다 — S0은 구조를
바꾸지 않으므로 관찰이 빗나가도 손해가 없다.

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

자유 입력은 정형 문구가 실제로 쓰이는지 관전으로 확인한 뒤 재검토한다.

### D7. 모드 진입은 방 고정 배정

방 1~5 표준전 / 6~7 속도전 / 8 침묵전. `ruleSet`이 방 생성 시 결정되고
게임 중 절대 변하지 않으므로 페이즈 전환 중 룰이 바뀔 경로가 없다.
방장 선택 UI는 시즌 2 밴픽전과 묶는다.

### D8. 4~5인은 "연습 판"으로 격리

`MIN_PLAYERS = 4`인데 4인(마피아1/시민3)은 계산상 2라운드에 끝나 밸런스가
성립하지 않는다. `MIN_PLAYERS`를 6으로 올리면 소규모 방이 시작조차 못 하므로,
4~5인은 **첫 밤 무사 적용 + 승률 목표 미적용**으로 명시 격리한다. 구성표가
6인부터 시작하므로 4~5인은 같은 게임이 아니라고 문서에 못 박는다.

### D9. 건달은 시민팀이 맞고, 능력째로 재설계 대상이다

현재 [Roles.ts:288](../../../src/domain/Roles.ts:288)은 `team: Team.MAFIA`,
`appearsAsMafia: true`, `nightNotice: LONE_MAFIA_TEAM`이다. **진영이 잘못 들어가 있다.**

진영만 고치면 더 나빠진다. 시민팀 건달이 `SILENCE`를 들고 있으면 **아군의
입을 막는** 능력이 되고, 이건 §8.4 원칙 3("재미를 깎는 능력은 수치로 못 고친다")이
말하는 최악의 형태다. 마피아팀 건달이 시민을 막는 것은 적의 방해라 납득되지만,
시민팀 건달이 시민을 막는 것은 아군에게 턴을 빼앗기는 경험이다.

**결정 — 정정과 재설계를 같은 시즌에 끝낸다:**
- **S0**: 진영·`appearsAsMafia`·문구를 정정하고 **덱 풀에서 제외**한다
  (§8.4 7순위가 이미 "보류"로 계획한 상태)
- **S6**: 능력을 `BLOCK`(밤 능력 차단)으로 교체해 덱에 복귀시킨다.
  마담의 시민팀 대칭이 되고, §8.1이 "유일한 구멍"으로 인정한
  **시민 교란자** 칸을 채우며, §4.5 링 2가 양방향으로 닫힌다

원문은 재설계를 시즌 2로 미뤘다. 그러면 건달이 시즌 내내 사라진 상태로 남는다.
파이프라인(S3)이 `BLOCK` step을 깔고 나면 재설계 비용은 직업 정의 하나 +
step 처리 하나이므로, 같은 시즌에 되돌려 놓는 편이 싸다.

`SILENCE` 종류와 `Seat.silenced`의 거취도 이 결정으로 확정된다.
**S6에서 지운다.** 건달이 `BLOCK`으로 복귀하면 `SILENCE`는 생산자가 영구히
없어지고, 발언 봉쇄 능력은 시즌 2~4 어느 직업에도 계획이 없다
(원문 §8.1이 건달 대체로 지목한 마담도 능력 차단이다).

### D10. 지표 계측 없이 출하한다

승률·판 길이를 보낼 수집처가 없다. 세 안(전송 / 관리자 조회 / 지표 없음)
중 **지표 없음**을 택한다. `httpPostJson` 경로를 만들어도 받는 쪽이 없으면
데이터가 그냥 버려지고, 관리자 조회는 표본이 세션에 갇혀 승률 판정에 못 쓴다.

**대가를 명시해 둔다.** S0의 밸런스 변경 전후를 숫자로 비교할 기회가 영구히
사라진다. 6인 판이 실제로 나아졌는지는 제보와 관전으로만 알 수 있다.
§9.1의 목표 수치는 **설계 의도로 남기고 합격 판정 기준에서는 뺀다.**

**코드에 흔적은 주석으로만 남긴다.** 처음에는 `countsForMetrics`를 함수로
남겨 두려 했지만, 세 모드가 모두 `ranked: true`라 `ranked` 필드는 이번 시즌에
구분하는 것이 없고 부르는 곳도 없다. 생산자도 소비자도 없는 필드는 §3-7이
지적한 "자리만 있는 것" 그대로다. `RuleSet`에서 `ranked`와 `countsForMetrics`를
**빼고**, 집계 규칙은 판정이 필요해질 자리에 주석으로 적는다. 위치는 §9.2.

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
| 7 | §8.4-7 | 건달을 "보류"로만 두고 대체(마담)를 시즌 2로 미뤘다. 정정만 하고 재설계를 미루면 한 시즌 내내 직업 하나가 비어 있다 | S6에서 `BLOCK`으로 재설계해 같은 시즌에 복귀 |

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
}
```

`Partial<Record<Role, number>>`는 런타임에 평범한 객체 리터럴이다.
`Map`을 쓰지 않는다 — babel이 전역 `Map`을 `ScriptMap`으로 바꾸므로 금지된다.

**`ranked` 필드는 넣지 않는다.** 지표 집계 대상을 구분하려고 뒀던 것인데,
계측을 하지 않기로 했고(D10) 세 모드가 모두 집계 대상이어서 구분할 것이 없다.
집계 규칙은 §9.2의 주석으로만 남는다.

### 4.2 `Room` / `Seat` 변경

| 슬라이스 | 필드 | 변경 |
| :-: | --- | --- |
| S1 | `Room.ruleSet: RuleSet` | 신규. 방 생성 시 결정, 게임 중 불변 |
| S3 | `Room.nightIntents: NightIntent[]` | 신규. `resetRound`에서 비운다 |
| S3 | `Room.nightReveals: NightReveal[]` | 신규. 아침 배포 후 비운다 |
| S5 | `Seat.skillSpent: boolean` → `Seat.skillUsed: number` | 누적 사용 횟수. 0에서 시작 |
| S6 | `Seat.blocked: boolean` | 신규. `resetRound`에서 초기화 |
| S6 | `Seat.silenced: boolean` | **삭제** (D9) |

`blocked`는 `silenced`와 달리 **당일 밤 안에서만** 의미가 있다. 협박은 다음 낮에
작용해서 `resetRound`를 넘겨 살아야 했지만, 차단은 그 밤의 정산에만 쓰인다.
따라서 `armored`·`skillUsed`처럼 남기는 필드가 아니라 매 라운드 초기화 대상이다.

`skillUsed`를 "남은 횟수"가 아니라 "쓴 횟수"로 정의한 이유: 남은 횟수로 하면
무제한 능력에 `-1` 같은 센티넬이 필요해진다. 쓴 횟수면 `maxUses === undefined`가
곧 무제한이다.

### 4.3 `RoleDef` 추가 필드

| 슬라이스 | 필드 | 의미 |
| :-: | --- | --- |
| S3 | `nightStep: number` | 정산 순서. `NightStep`의 값 |
| S4 | `firstNightOnly?: boolean` | 첫 밤에만 쓸 수 있는가 (점쟁이). `needsPriorDay`의 거울 |
| S5 | `maxUses?: number` | 게임당 사용 상한. 없으면 무제한. `oncePerGame: true`는 `maxUses: 1`로 대체되어 **삭제된다** |

`NightActionKind`도 슬라이스마다 늘어난다: S4 `INSPECT_ABILITY`(점쟁이),
S5 `NOTE`(시민), S6 `BLOCK`(건달) 추가 / S6 `SILENCE` **삭제**.

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

> 🌙 첫 밤에는 아무도 죽지 않습니다. 팀을 확인하고 대상을 익혀 두세요.

시민팀에게도 같은 줄을 보인다 — 마피아만 알면 첫 아침에 마피아가 놀라지 않는
것으로 정체가 새어나간다.

#### 첫 낮에 남는 정보

첫 밤 무사는 **첫 낮의 정보를 늘리지 않는다. 줄인다.** 지금은 첫 아침에
"누가 죽었는가"가 나오고 그것이 약하게나마 토론의 출발점이 된다 — 마피아가
그 사람을 위협으로 봤다는 뜻이거나, 아무 의미 없는 무작위 선택이거나.
첫 밤 무사를 켜면 그 한 줄도 없어져 첫 낮은 정보가 정확히 0인 토론이 된다.

감수하는 이유는 이 변경이 고치는 것이 **정보가 아니라 시간**이기 때문이다.
6인에서 첫 밤 사망 + 첫 투표로 4명이 되어 2라운드에 끝나던 판이 3~4라운드로
늘어난다. 정보는 그 늘어난 라운드에서 생산된다.

따라서 §9.2의 관측 항목 3번("토론이 근거를 갖고 이뤄졌는지")은 **둘째 낮부터가
대상이다.** 첫 낮이 겉도는 것은 버그가 아니라 설계다. 점쟁이(S4)가 첫 낮에
정보 한 조각을 넣지만 6인 판의 40%에만 등장하므로(§S2의 특수 시민 자리 표),
나머지 60%의 첫 투표는 여전히 무작위다. 그것까지 없애려면 첫 밤 무사를 끄거나
점쟁이를 `citizenRequired`로 올려야 하고, 둘 다 이번 시즌에 하지 않는다.

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

덱에서 빼므로 실전 파급은 없다. 그러나 **기존 테스트 5곳이 건달을 명시적으로
세워 돌린다** — 아래 테스트 절에 갱신 목록을 적었다.

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
- 갱신 테스트: 건달의 `team`이 `CITIZEN`이고 경찰 조사가 "마피아가 아닙니다"
  (기존 `domain.test.ts:490`을 뒤집는 것이므로 새로 만들지 않는다)
- 신규 테스트: `buildRoleDeck`이 인원 4~12에서 `THUG`를 한 번도 내지 않는다
- 회귀: "첫 밤만으로 게임이 끝나는 덱은 나오지 않는다" 기존 테스트 통과

#### 롤백 조건

6인 판이 여전히 2라운드 안에 끝나는 것이 관전에서 보이면 첫 밤 무사 상한을
재검토한다.
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
		mafiaTeamSize: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 2],
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
};
```

§7-2의 "밤 12 / 낮 25 / 투표 10 / 개표 4"를 그대로 옮겼다. 낮 25초는
`DAY_MAX`만 25로 두면 인원과 무관하게 항상 25가 되므로 `DAY_PER_ALIVE`를 5로
낮춰 소인원에서 더 짧아지게 했다(4인 20초, 6인 30→25초).

직업 풀은 §7-2대로 마피아·의사·경찰·군인·시민 다섯 개다. **짐승인간을 넣지
않았다** — 초보 유입 모드에서 경찰의 확정 정보를 남기는 것이 목적이다.

`maxPlayers: 8`이므로 9인 이후는 도달할 경로가 없다. 그래도 배열 길이는 13으로
맞춰 인덱스 접근이 항상 정의되게 하고, **남는 칸은 0이 아니라 8인 값을 반복한다.**
0을 넣으면 만에 하나 그 인덱스를 읽었을 때 마피아가 0명인 판이 되어 시작하자마자
`evaluateWinner`가 시민 승리를 낸다 — 도달 불가를 가정하고 넣은 값이 가장 나쁜
실패 모드를 만드는 형태다. 같은 값을 반복하면 최악의 경우에도 8인 판과 같은
구성이 된다.

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
축으로 달성한다. 번호 지목 문구는 위치 지목이 실제로 통하는지 본 뒤
시즌 2에서 재검토한다.

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

#### 롤백 조건

모드 하나가 문제면 방 배정표에서 그 방을 `STANDARD_RULES`로 되돌린다. `RuleSet`
리터럴은 지우지 않는다 — 배정표 한 줄이 되돌리기의 전부여야 이 구조가 값을 한다.

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

#### 시민 자리 선정 순서

`minPlayers`와 `exclusiveGroups`는 **마피아 자리에만 적용되는 규칙이 아니다.**
이 슬라이스가 넣는 세 항목 중 `SHAMAN: 8`·`REPORTER: 11`이 시민 직업이고,
S4의 `SEER: 6`, S6의 `THUG: 8`과 `[SOLDIER, THUG]`도 전부 시민 자리에서
판정된다. 마피아 쪽에만 필터를 걸면 이 슬라이스가 내세운 인원 제한 두 개 중
**어느 것도 작동하지 않는다.**

시민 자리는 [RoleAssignment.ts:148-171](../../../src/domain/RoleAssignment.ts:148)에서
세 층으로 채워진다: `citizenRequired`(의사·경찰) → `citizenPool` 추첨 →
남는 자리에 평민. 필터가 들어갈 곳은 가운데 층 하나다.

```
1. 인원 필터    — spec.minPlayers를 넘지 못하는 직업을 citizenPool에서 뺀다
2. 배타 필터    — 마피아 자리에서 이미 뽑힌 직업의 그룹 동료를 뺀다
3. 추첨 수 산정 — special의 상한이 citizenPool.length가 아니라
                  **걸러진 풀의 길이**가 된다
4. 순차 추첨    — 하나 뽑을 때마다 그 직업의 그룹 동료를 남은 풀에서 제거
```

2번이 마피아 자리보다 **뒤에** 오는 이유: 배타 그룹이 진영을 가로지를 수 있다.
`[BEAST, CON_ARTIST]`는 마피아 안에서 닫히지만 시즌 2의 마담과 건달은 그렇지
않다. 마피아를 먼저 확정하고 그 결과를 시민 필터의 입력으로 넘기면 방향이
한쪽이라 순환이 생기지 않는다.

**3번을 빠뜨리면 실패가 조용하다.** `special`이 걸러진 풀보다 크면 `draw`가
요청한 수를 못 채우고, 부족분이 `while (deck.length < playerCount)`에서 평민으로
메워진다. 덱 길이는 맞으므로 기존 테스트가 전부 통과하고 **특수직만 조용히
줄어든다.** 이번 시즌의 값에서 이 경로가 실제로 열리지는 않는다(아래 표의
추첨 자리 < 후보 수). 그래도 상한을 걸어 두는 이유는 다음에 `minPlayers`를
한 줄 더 넣는 사람이 이 계산을 다시 하지 않기 때문이다.

#### 인원별 특수 시민 자리 수

`SPECIAL_CITIZEN_RATIO = 0.5`가 정하는 값이다. 이번 시즌에 직업을 넷 추가하면서
**한 판에 실제로 몇 개가 뽑히는가**를 적어 두지 않으면 "넣었는데 안 보인다"가 된다.
아래는 S6까지 적용된 최종 상태다.

| 인원 | 마피아 | 의사·경찰 | 추첨 자리 | 평민 | 추첨 후보 수 |
| :-: | :-: | :-: | :-: | :-: | :-: |
| 6 | 1 | 2 | 2 | 1 | 5 |
| 8 | 2 | 2 | 2 | 2 | 7 |
| 10 | 2 | 2 | 3 | 3 | 7 |
| 12 | 3 | 2 | 4 | 3 | 8 |

후보 수는 `minPlayers`만 적용한 값이다(6인은 영매·기자·건달이, 8~10인은 기자가
빠진다). `[SOLDIER, THUG]`는 첫 추첨 뒤에 작동하므로 표에 반영하지 않는다.

**그래서 점쟁이는 6인 판의 40%에만 나온다** — 후보 5개에서 2개를 뽑으므로
`1 - C(4,2)/C(5,2)`다. S4가 겨냥한 "첫 투표 랜덤 처형 메타"는 나머지 60%에서
그대로 남는다. 이건 S4의 실패가 아니라 추첨 게임의 성질이고, 등장률을 올리려면
`minPlayers`가 아니라 `SPECIAL_CITIZEN_RATIO`나 `citizenRequired`를 만져야 한다.
시즌 1은 건드리지 않는다.

#### 검증 기준

- 신규 테스트: 6인 판을 고정 시드로 200회 돌려 짐승인간 리드와 마피아 리드가
  **둘 다 한 번 이상** 나온다 (비율이 아니라 도달 가능성을 본다 — 비율 밴드는
  느리고 시드에 흔들린다)
- 신규 테스트: 7~9인 판에서 짐승인간이 한 번도 등장하지 않는다
- 신규 테스트: 10~12인 판에서 짐승인간이 최대 1명
- 신규 테스트: 4~5인 판에서 짐승인간이 등장하지 않는다
- 신규 테스트: `exclusiveGroups`에 같이 든 직업 두 개가 한 덱에 함께 나오지 않는다
- 신규 테스트: 기자가 10인 이하 덱에, 영매가 7인 이하 덱에 나오지 않는다
  (**시민 풀 필터가 실제로 걸리는지가 이 줄의 요점이다**)
- 신규 테스트: 인원별 특수 시민 자리 수가 위 표와 일치
- 신규 테스트: `leadPool`이 인원 필터로 전부 비어도 `Role.MAFIA`가 리드가 된다
- 회귀: 모든 인원에서 덱 길이 = 참가 인원, 마피아 팀 인원 = 표

#### 롤백 조건

배타 규칙이나 최소 인원이 시민 풀을 과하게 좁히면 해당 항목만 지운다. 둘 다
데이터라 한 줄씩 되돌아간다. `leadPool`은 짐승인간을 빼면 S0 상태와 같아진다.

---

### S3 — 밤 파이프라인 + 사기꾼

가장 큰 슬라이스다. 앞의 세 슬라이스가 먼저 나가 있으므로 이 변경은 순수하게
정산 로직만 담는다.

**커밋 세 개로 나눈다.** S6과 같은 이유이고, 이쪽이 더 절실하다 — 이 슬라이스는
"구조 도입"과 "관측 동작 변경"과 "콘텐츠 추가"가 겹쳐 있고 회귀 위험이 이번
시즌에서 가장 크다.

1. **파이프라인 도입 — 관측 동작 불변.** `NightPipeline.ts`를 만들고 기존 밤
   능력 전부를 intent 기록 → 정산으로 옮긴다. 조사 응답은 **아직 클릭 시점에
   낸다.** 합격 기준은 기존 밤 테스트 전부 무수정 통과다
2. **조사 응답을 `reveals`로 이동 — 관측 동작 변경.** D1이 여기서 실현되고,
   §8.1의 응답 시점 테스트가 이 커밋에서 갱신된다
3. **사기꾼 추가 — 순수 추가.** 역알림은 2번이 만든 `reveals` 위에 얹힌다

1번이 통과하면 파이프라인 자체는 안전하다는 것이 증명된다. 2번에서 깨지면
원인이 정산 구조가 아니라 노출 시점이라는 뜻이다. 이 구분이 없으면 S3에서
문제가 났을 때 되돌릴 범위를 정할 수 없고, §1.4대로 롤백도 배포이므로
"일단 전부 되돌린다"가 비싸다.

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
	BLOCK:   20,  // 능력 차단 — S6 건달, 시즌 2 마담
	PROTECT: 30,  // 보호 — 의사
	ATTACK:  40,  // 공격 — 마피아·짐승인간·자경단원
	DEATH:   50,  // 사망 확정 + 자경단원 자책
	INSPECT: 60,  // 조사 — 경찰·스파이·점쟁이
	AFTER:   70,  // 사후 — 기자 특종·건달 협박(S6에서 삭제)·시민 쪽지·사기꾼 역알림
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

밤 결과 지연이 체감 문제로 보이면(밤→아침 전환에서 방을 나가는 사람이 눈에
띄거나 "내 조사 결과가 안 왔다"는 제보가 나오면) 컷 길이를
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
- 신규 테스트: 자경단원 조사 결과가 "있음" (`needsPriorDay`라 첫 밤에 못 쓰지만
  **보유**가 판정 기준이다)
- 신규 테스트: 사기꾼 조사 결과가 "없음"이고 사기꾼에게 역알림이 간다
- 신규 테스트: 영매·군인·정치인도 "없음"이다 — 사기꾼과 같은 답을 내는 시민이
  존재하는 것이 이 직업이 확정 정보가 되지 않게 하는 유일한 장치다
- 신규 테스트: 점쟁이가 4~5인 덱에 나오지 않는다

#### 롤백 조건

점쟁이의 정보가 쓸모없다고 판단되면 `citizenPool`에서 빼면 끝난다.
`firstNightOnly`는 구조라 남겨 둔다 — 시즌 2의 성직자가 같은 자리를 쓴다.

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

잔존 참조를 잡는 테스트는 쓰지 않는다. `RoleDef`에서 필드를 지우면 남은 사용처가
전부 `type-check`에서 컴파일 오류가 된다 — 같은 것을 두 곳에서 지키게 만들 뿐이다.

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

#### 롤백 조건

쪽지가 남용되거나 아무도 쓰지 않으면 시민의 `nightAction`을 `null`로 되돌린다.
`maxUses`는 남긴다 — 자경단원·기자가 이미 쓰고 있으므로 시민과 무관하게
필요한 구조다.

---

### S6 — `BLOCK` + 건달 복귀

**목적.** S0에서 덱에서 뺀 건달을 능력을 바꿔 되돌린다. §8.1이 "유일한 구멍"으로
인정한 **시민 교란자** 칸이 채워지고, §4.5 링 2가 양방향으로 닫힌다.

이 슬라이스는 **커밋 세 개**로 나눈다. 삭제와 추가를 한 커밋에 섞으면
회귀가 났을 때 어느 쪽인지 알 수 없다.

1. `SILENCE` 계열 제거
2. `BLOCK` 종류와 파이프라인 step 처리 추가
3. 건달 재정의 + 덱 복귀

#### 커밋 1 — `SILENCE` 제거

건달이 `BLOCK`으로 바뀌면 `SILENCE`는 생산자가 영구히 없어진다. 발언 봉쇄는
시즌 2~4 어느 직업에도 계획이 없다 — 원문 §8.1이 건달 대체로 지목한 마담도
능력 차단이다.

**삭제 범위가 넓다.** `silenced`는 위젯 payload를 타고 UI까지 내려간다.

| 파일 | 지우는 것 |
| --- | --- |
| `src/domain/Roles.ts` | `NightActionKind.SILENCE` |
| `src/types/Game.types.ts` | `Seat.silenced` (138~139) |
| `src/entities/Room.ts` | `createSeat`·`assignRole`·`resetRound`의 초기화 3곳 |
| `src/domain/chat/ChatPermission.ts` | `ChatContext.silenced`, 기본값, 협박 잠금 분기 (54~55, 88, 130~141) |
| `src/services/ChatService.ts` | payload의 `silenced` 2곳 + 주석 (110~113, 120, 136) |
| `src/services/Voting.ts` | 협박 통보 함수, `canVote`의 조건, 실패 문안, 분모 제외 (74~82, 136, 151, 193, 226) |
| `src/services/Widgets.ts` | 투표 payload의 `silenced` (258~259) |
| `src/ui/vote.html` | `.grid.blocked` 흐림 처리와 잠금 문안 (46, 157~170, 191) |
| `src/ui/chat.html` | 주석의 "협박" 언급 (274) |
| `tools/widget-scenes.js` | `silenced: true` 장면 하나와 `silenced: false` 표기 (342, 351) |

`vote.html`의 CSS 클래스 이름이 이미 `blocked`다(협박당한 격자를 흐리게 하는
용도). 새로 만드는 `Seat.blocked`와 **이름만 같고 관계가 없다.** 이 클래스는
협박 UI와 함께 삭제되므로 충돌하지 않지만, 지우다 남기면 다음 사람이 둘을
같은 것으로 읽는다.

`Voting.ts`의 협박 통보는 **방 전체가 아니라 당사자에게만 `Chat.tell`로** 가는
별도 경로였다. `BLOCK`의 통보는 그 경로를 쓰지 않고 `reveals`(D1)를 탄다 —
밤 결과는 한 곳에서만 나간다는 원칙이 여기서 회수된다.

`check:ui`는 `res/*.html`을 실제로 실행해 예외와 `scene.expect` 개수를 본다.
따라서 위젯에서 필드를 지우고 장면을 안 고치면(또는 반대로) 거기서 걸린다.
다만 타입 검사는 `.html`을 보지 않으므로 **삭제 목록에서 UI 두 줄과
`widget-scenes.js`를 빠뜨리면 `type-check`·`lint`·`test`는 전부 통과한다.**
이 슬라이스에서 `check:ui`가 유일한 그물이다.

#### 커밋 2 — `BLOCK` 추가

```ts
// NightActionKind에 추가
BLOCK: "BLOCK",
```

`Seat.blocked: boolean`을 추가하고 `resetRound`에서 초기화한다. `silenced`와 달리
**그 밤 정산 안에서만** 쓰이므로 라운드를 넘겨 살 필요가 없다.

파이프라인의 `BLOCK` step(20)이 대상의 `blocked`를 세우고, 이후 모든 step이
`actor.blocked`를 보고 건너뛴다.

```
for (const step of STEP_ORDER) {
  for (const seat of seats) {
    // step 20을 제외한 모든 step: actor가 blocked면 intent를 버린다
    // 버려진 intent는 skillUsed를 증가시키지 않는다 (D2)
  }
}
```

**규칙 세 줄:**

- **같은 step 안의 차단은 서로에게 영향을 주지 않는다.** step 20은 동시 처리다.
  시즌 2에 마담이 와서 건달과 서로를 지목해도 둘 다 성립한다 — 순서 의존이 없다
- **차단은 상태가 아니라 intent를 막는다.** 군인의 `armored`와 정치인의
  `voteWeight`는 밤 intent가 아니므로 차단되지 않는다
- **차단된 능력은 사용 횟수를 소모하지 않는다** (D2). 자경단원·기자·시민이
  차단당하면 다음 밤에 다시 쓸 수 있다

차단 가능/불가 전수:

| 대상 | 차단하면 |
| --- | --- |
| 마피아·짐승인간 | 그 밤 공격이 사라진다 |
| 의사 | 치유가 사라진다 |
| 경찰·스파이·점쟁이 | 조사 결과가 오지 않는다. 스파이는 합류도 막힌다 |
| 자경단원·기자 | 능력이 사라지고 **횟수는 남는다** |
| 시민 | 쪽지가 안 간다. 횟수는 남는다 |
| 사기꾼·영매·군인·정치인 | 아무 일도 없다 (밤 intent가 없다) |

#### 커밋 3 — 건달 재정의

```ts
THUG: {
	displayName: "건달",
	team: Team.CITIZEN,
	glyph: "🥊",
	ability: "밤마다 한 명의 밤 능력을 막고, 막을 것이 있었는지 알게 됩니다.",
	tip: "확정 시민을 막으면 헛턴입니다. 밤에 움직이는 사람을 찾으세요.",
	nightAction: NightActionKind.BLOCK,
	nightChat: null,
	nightSprite: null,
	nightAttackSprite: null,
	nightPrompt: "방해할 대상을 선택하세요.",
	nightNotice: NO_CHAT,
	nightStep: NightStep.BLOCK,
	immuneToVote: false,
},
```

`nightSprite: null`을 유지한다. 시민팀 교란자가 밤에 목격되면 정체가 새어나간다.

#### 왜 차단만이 아니라 정보까지 주는가

차단만 있으면 이 직업의 기대값이 마이너스다.

| 건달의 선택 | 결과 |
| --- | --- |
| 마피아를 막았다 | 그 밤 킬 무효 — 이득 |
| 시민 능력자를 막았다 | 아군 능력 1회 손실 — 손해 |
| 능력 없는 사람을 막았다 | 아무 일도 없음 — 허탕 |

문제는 **가해자를 맞추는 것이 피해자를 맞추는 것보다 어렵다**는 점이다.
의사는 마피아가 노릴 사람(커밍아웃한 경찰 등)을 추측할 근거가 있다.
건달은 마피아가 누군지 알아야 하는데, 그건 게임의 목적 그 자체다 — 알면
이미 투표로 처형한다. 즉 차단만 있는 건달은 실전에서 운에 맡기는 직업이 되고,
주 과제가 "확정 시민을 막아 낭비하지 않기"라는 소극적인 것으로 변한다.

**그래서 차단 성공 여부를 건달에게 알려준다.** 얻는 정보는 "이 사람이 어젯밤
밤 능력을 썼는가"다. 경찰의 "마피아인가"보다 훨씬 약하고, 점쟁이의
"능력을 가졌는가"보다 한 칸 강하다 — 보유가 아니라 **실제 사용**이다.

매 밤 능력을 쓰는 직업은 마피아·짐승인간·의사·경찰이다. 시민의 쪽지는 판당
1회뿐이라 대부분의 밤에는 안 쓴다. 그래서 "어젯밤 움직였다"는 여전히 강한 신호다.

**점쟁이와 짝이 된다.** 점쟁이가 낮에 "3번은 능력 있음"을 공유하면 건달이
3번을 막을 근거가 생긴다. 그런데 능력자는 시민팀에도 많으므로 그 정보를
따르는 것 자체가 도박이다 — 시즌 1 시민팀 안에서 정보가 실제로 유통되는
첫 사례다.

#### 통보 문안

건달에게 (`reveals`):

> 🥊 3번은 어젯밤 능력을 썼고, 당신이 막았습니다.

> 🥊 3번은 어젯밤 아무것도 하지 않았습니다.

**두 번째 문안이 두 경우를 합친다** — 능력이 없거나, 있는데 안 썼거나.
건달은 둘을 구분하지 못한다. 구분되면 점쟁이의 정보와 완전히 겹친다.

차단당한 사람에게 (`reveals`):

> 🥊 어젯밤 누군가 당신을 방해해 능력이 무효가 되었습니다.

**막을 것이 있었을 때만 보낸다.** 밤 intent가 없던 사람은 아무것도 받지 않는다.
사기꾼을 막았을 때 사기꾼이 통보를 받으면 "능력이 없는데 방해받았다"로
건달의 존재를 확정하게 되므로, 조용히 넘어가는 편이 맞다.

누가 막았는지는 알려주지 않는다. 알면 다음 낮에 건달을 찾아 처형할 수 있다.

#### 마피아를 막았을 때의 아침

사망자가 0이 된다. **의사가 살린 경우와 구분되지 않는다** — 아침 리포트는
같은 문장을 낸다. 이 모호함은 의도한 것이다. 마피아 입장에서 "의사에게
막혔나, 건달에게 막혔나"가 갈리고, §4.5의 링이 실제로 작동하는 지점이다.

8인 판에서는 첫 밤 무사와 함께 일어난다(건달의 최소 인원이 8이고 첫 밤 무사가
8인 이하다). 그래도 모호함은 생기지 않는다 — 그 밤에는 아무도 죽지 않는다는
것을 밤 위젯이 미리 알리기 때문이다(D4).

#### 덱 배치

```ts
citizenPool: [
	Role.POLITICIAN, Role.SHAMAN, Role.SPY, Role.SOLDIER,
	Role.REPORTER, Role.VIGILANTE, Role.SEER, Role.THUG,
],
exclusiveGroups: [
	[Role.BEAST, Role.CON_ARTIST],
	[Role.SOLDIER, Role.THUG],
],
minPlayers: { BEAST: 6, SEER: 6, CON_ARTIST: 7, SHAMAN: 8, REPORTER: 11, THUG: 8 },
```

**`[SOLDIER, THUG]` 배타가 §8.4 4순위("보호 계열 최대 2종")의 구현이다.**
의사는 `citizenRequired`라 6인 이상에서 항상 나온다. 그 위에 군인 또는 건달
하나만 허용하면 밤 킬을 무효화할 수 있는 직업이 최대 2종으로 묶인다.
새 구조가 필요하지 않다 — S2의 배타 규칙을 그대로 쓴다.

**`THUG: 8`의 근거.** 킬러가 1명인 구간에서 건달이 그 1명을 맞추면 밤이
통째로 사라진다. 맞출 확률은 자기를 제외한 인원의 역수다.

| 인원 | 킬러 | 건달이 킬러를 맞출 확률 | 의사까지 합쳐 밤이 무효가 될 확률 |
| :-: | :-: | :-: | :-: |
| 6 | 1 | 1/5 = 20% | 약 36% |
| 8 | 1 | 1/7 ≈ 14% | 약 26% |
| 10 | 1~2 | 1/9 ≈ 11% | 약 21% |

6인의 36%는 과하다. 마피아가 1명이라 밤 무효가 곧 진행 정지이고, 시민이
아무것도 안 해도 3분의 1 이상의 밤이 사라진다. 8인의 26%는 의사 단독
14%에서 12%p 늘어난 것이고, 그 대가로 건달은 아군을 방해할 위험을 진다.
받아들일 수 있다.

#### 검증 기준

- 커밋 1 후 `npm run verify` 클린. `silenced` 참조가 코드베이스에 남아 있지 않다
- 커밋 1 후 협박 관련 기존 테스트가 **삭제**되어 있다 (8.1 참조)
- 신규 테스트: 차단된 마피아의 공격이 사라지고 사망자가 0
- 신규 테스트: 차단된 경찰의 조사 결과가 `reveals`에 없다
- 신규 테스트: 차단된 스파이가 마피아팀에 합류하지 않는다
- 신규 테스트: 차단된 자경단원·기자·시민의 `skillUsed`가 증가하지 않는다
- 신규 테스트: 차단된 정치인의 `voteWeight`가 그대로 남는다 (군인의 `armored`도
  같은 규칙이지만 배타라 실전 덱에는 함께 서지 않는다)
- 신규 테스트: 사기꾼을 차단하면 사기꾼에게 통보가 가지 않는다
- 신규 테스트: 능력이 있는데 지목하지 않은 사람을 차단하면 통보가 없고,
  건달은 "아무것도 하지 않았습니다"를 받는다
- 신규 테스트: 건달이 자기 자신을 지목할 수 없다
- 신규 테스트: 건달과 군인이 같은 덱에 나오지 않는다
- 신규 테스트: 건달이 7인 이하 덱에 나오지 않는다
- 신규 테스트: 차단 통보에 건달의 좌석 번호가 들어 있지 않다

#### 롤백 조건

건달이 든 판에서 시민팀이 눈에 띄게 유리해 보이면 `THUG`의 `minPlayers`를
10으로 올린다. 객체의 값 하나다.
그래도 과하면 정보 통보를 떼고 차단만 남긴다 — 이 경우 직업이 재미없어지므로
덱에서 다시 빼는 것이 낫다.

---

## 6. 밤 정산 전체 명세

S6까지 적용된 최종 상태다.

| step | 종류 | 직업 | 대상 | 효과 |
| :-: | --- | --- | --- | --- |
| 20 | `BLOCK` | 건달 | 산 사람 1, 자기 제외 | `target.blocked = true` |
| 30 | `HEAL` | 의사 | 산 사람 1 | `target.healed = true` |
| 40 | `ATTACK` | 마피아, 짐승인간, 자경단원 | 산 사람 1 | `target.attackedBy.push(actor)` |
| 50 | — | — | — | `resolveNightCasualties(seats)` |
| 60 | `INSPECT_TEAM` | 경찰 | 산 사람 1 | 진영 답 → `reveals` |
| 60 | `INSPECT_ROLE` | 스파이 | 산 사람 1 | 직업 답 → `reveals`, 마피아팀이면 합류 |
| 60 | `INSPECT_ABILITY` | 점쟁이 | 산 사람 1 | 능력 유무 답 → `reveals` |
| 70 | `SCOOP` | 기자 | 산 사람 1 | `target.scooped = true` |
| 70 | `NOTE` | 시민 | 산 사람 1 | 문구 → 대상의 `reveals` |
| 70 | — | 건달 | — | 차단 성공 여부 → `reveals` (양쪽) |
| 70 | — | 사기꾼 | — | 조사당했으면 역알림 → `reveals` |

**같은 step 안의 순서는 좌석 번호 오름차순이다.** 의사 둘이 같은 사람을
치유하거나 마피아 둘이 다른 사람을 공격하는 경우 모두 결과가 결정적이다.

**step 20을 제외한 모든 step은 `actor.blocked`를 먼저 본다.** 차단된 intent는
버려지고 `skillUsed`를 증가시키지 않는다. step 20 자신은 이 검사를 하지 않으므로
차단끼리는 서로에게 영향을 주지 않는다.

첫 밤 무사(`skipAttacks`)에서 건너뛰는 것: step 40, step 50.
나머지 step은 모두 정상 작동한다 — 건달의 차단도, 그 통보도 첫 밤에 작동한다.

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
| 13 | 4~5인 판 | 첫 밤 무사 적용, 승률 목표 미적용 | D8 |
| 14 | 속도전에 9명이 들어옴 | 경로 없음 (`maxPlayers: 8`) | 배열 길이는 13으로 맞춰 인덱스 접근을 항상 정의한다 |
| 15 | 침묵전 마피아 밀담 | 제한 없음 | 밀담까지 좁히면 시민 쪽으로 기운다 |
| 16 | 재접속 중 밤 정산 | `showPhaseView`가 아침 상태를 그린다 | `reveals`는 접속 중인 좌석에만 배포. 미접속자는 놓친다 |
| 17 | 건달이 능력 없는 사람을 차단 | 대상에게 통보 없음, 건달은 "아무것도 하지 않았습니다" | 통보하면 사기꾼이 건달의 존재를 확정한다 |
| 18 | 건달이 능력자를 차단했으나 그 사람이 지목을 안 했다 | 17번과 동일 | 건달은 "능력 없음"과 "안 씀"을 구분하지 못한다 |
| 19 | 차단당한 자경단원·기자·시민 | 능력 무효, `skillUsed` 유지 | D2. 차단 = 정산 스킵 = 차감 없음 |
| 20 | 건달이 정치인을 차단 | `voteWeight` 그대로 | 차단은 intent를 막고 상태는 못 막는다. 군인의 `armored`도 같은 규칙이지만 군인은 건달과 배타라 같은 덱에 없다 |
| 21 | 첫 밤 무사 + 건달이 마피아를 차단 | 양쪽 통보 모두 정상 | 마피아의 intent는 첫 밤에도 접수된다(D4). 사망자가 0인 이유가 두 개가 되지만 아침 문장은 하나다 |
| 22 | 건달이 그 밤에 사망 | 차단은 유효, 통보도 배포 | 3번과 같은 근거. `BLOCK`(20)이 `DEATH`(50)보다 앞이다 |
| 23 | 차단 대상이 그 밤에 사망 | 차단은 유효, 대상 통보는 배포 안 함 | 6번과 같다. 죽은 사람에게 배달되지 않는다 |
| 24 | 차단끼리 서로를 지목 (시즌 2) | 둘 다 성립 | step 20은 동시 처리. 순서 의존을 만들지 않는다 |

16번은 남는 손실이다. 현재도 밤 결과 라벨은 접속 중인 플레이어에게만
전달되므로 동작 변화는 아니다. 놓친 조사 결과를 복구하는 것은 개인 로그 저장을
요구하고, 그건 시즌 4 관전 작업과 같은 인프라다.

---

## 8. 테스트 계획

### 8.1 기존 테스트 갱신 목록

건달 정정과 파이프라인 전환이 기존 단정을 바꾼다.

| 파일 | 위치 | 현재 단정 | 갱신 |
| --- | --- | --- | :-: |
| `tests/domain.test.ts` | 493 | 경찰이 건달을 조사 → "마피아입니다" | S0 수정 → 유지 |
| `tests/domain.test.ts` | 536 | 스파이가 건달을 조사 → 합류 | S0 수정 → 유지 |
| `tests/domain.test.ts` | 500 | `resolveNightSelect(건달, …)`가 `silenced`를 즉시 세운다 | S3 수정 → **S6 삭제** |
| `tests/gameflow.test.ts` | 542 | 5인 건달 덱으로 협박 흐름 | S0·S3 수정 → **S6 삭제** |
| `tests/chat.test.ts` | 795 | 6인 건달 덱으로 발언 봉쇄 | S0·S3 수정 → **S6 삭제** |

앞의 두 개는 S6 이후에도 유효하다. 건달이 시민팀으로 덱에 돌아오므로 "경찰이
건달을 조사하면 시민"과 "스파이가 건달을 봐도 합류하지 않는다"는 계속 지켜야 할
단정이다. 오히려 이번 버그의 회귀 방지선이므로 지우면 안 된다.

**두 테스트의 이름과 주석도 함께 고친다.** 지금은 `"경찰은 짐승인간을 잡지
못하고 건달은 잡는다"`이고, 주석이 "판정 기준은 진영도 직업도 아니라
`appearsAsMafia`다"라고 적고 있다. 건달이 그 규칙의 양성 사례였으므로 이름이
반대가 된다. 규칙 자체는 짐승인간(마피아팀인데 `appearsAsMafia: false`)이
그대로 보여준다. 스파이 쪽 주석도 "건달은 마피아 팀이지만 채팅에 없다"로
시작하므로 근거가 바뀐다 — 단정은 같고 이유가 달라지는 경우다.

뒤의 세 개는 S6에서 **삭제한다.** 협박이라는 능력 자체가 없어지므로 갱신할
단정이 남지 않는다.

`resolveNightSelect`를 직접 부르는 테스트는 S3에서 **파이프라인 호출로 바꾼다.**
"클릭이 상태를 바꾼다"는 단정 자체가 없어지는 것이므로 단순 수정이 아니라
의도의 이전이다.

**S3에서 고치고 S6에서 지우는 낭비를 인정한다.** 협박은 S0에서 이미 덱에서
빠졌으므로 S3~S5 동안 아무도 볼 수 없는 능력이고, 그것을 새 파이프라인에
옮기는 코드(`AFTER` step의 `SILENCE` 분기 여섯 줄)와 테스트 세 개는 S6에서
버려진다. 그럼에도 삭제를 S3로 당기지 않는 이유는 삭제 범위가 채팅·투표 UI까지
9개 파일에 걸치기 때문이다. S3는 이번 시즌에서 회귀 위험이 가장 큰 슬라이스이고,
그 슬라이스에 "관측 동작은 그대로"라는 판정 기준을 유지하려면 UI를 건드리는
넓은 삭제를 같이 넣지 않는 편이 낫다. S6 커밋 1은 순수 삭제 하나만으로
검증할 수 있다.

### 8.2 신규 테스트 파일

| 파일 | 슬라이스 | 다루는 것 |
| --- | :-: | --- |
| `tests/deck.test.ts` | S0, S2, S6 | 인원별 마피아 수, 리드 풀, 배타 규칙, 최소 인원, 킬 예산 |
| `tests/ruleset.test.ts` | S1 | 이동 전후 값 일치, 방 배정, 모드별 페이즈 길이, 침묵전 채팅 |
| `tests/night-pipeline.test.ts` | S3 | step 순서, 클릭 순서 무관성, `reveals` 배포, 첫 밤 무사 |
| `tests/roles-season1.test.ts` | S3, S4, S5 | 사기꾼·점쟁이·시민 쪽지의 규칙과 경계 사례 |
| `tests/night-block.test.ts` | S6 | 차단 성립 범위, 횟수 보존, 통보 조건, 같은 step 무영향 |

`deck.test.ts`는 S6에서 `[SOLDIER, THUG]` 배타와 `THUG: 8`을 더한다. 새 파일이
아니라 기존 표에 줄이 늘어나는 형태다 — 배타 규칙 자체는 S2에서 이미 검증되고
있으므로 S6는 데이터만 추가한다.

기존 8개 파일(`assets`, `chat`, `domain`, `gameflow`, `isolation`, `layout`,
`reconnect`, `spectate`) 구조를 유지한다.

각 슬라이스의 검증 기준에 적힌 것은 **그 슬라이스에서 새로 통과해야 하는 단정**이지
테스트 파일 하나가 아니다. 두 종류는 일부러 넣지 않았다 — `type-check`가 이미 잡는
것(삭제한 필드의 잔존 참조 같은 것)과, 구현을 정의로 재진술하는 전수 대조다.
전자는 같은 규칙을 두 곳에서 지키게 만들고, 후자는 깨질 때 어느 쪽이 틀렸는지
알려주지 않는다.

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
| S3 | 커밋 1 후 기존 밤 테스트가 **전부** 무수정 통과 — 관측 동작 불변이 그 커밋의 정의다. 커밋 2에서 8.1의 응답 시점 테스트만 갱신. 커밋 3은 순수 추가 |
| S4 | 전체 무수정 통과 (순수 추가) |
| S5 | `oncePerGame` 관련 테스트만 갱신, 나머지 무수정 통과 |
| S6 | 커밋 1(삭제) 후 `silenced` 참조 0, `check:ui` 포함 클린. 커밋 2·3은 순수 추가이므로 커밋 1 이후 테스트가 무수정 통과 |

S6의 회귀 기준을 커밋 단위로 쪼갠 이유는 삭제와 추가가 한 커밋에 섞이면
"지운 것 때문에 깨졌는지 더한 것 때문에 깨졌는지"를 구분할 수 없기 때문이다.
`check:ui`를 명시한 것은 `silenced`가 `ui/vote.html`과 `tools/widget-scenes.js`까지
내려가 있어서 타입 검사가 보지 않는 자리이기 때문이다. "`silenced` 참조 0"은
`src/`뿐 아니라 `tools/`까지 포함한다.

---

## 9. 검증 기준

### 9.1 설계 의도 (합격 기준이 아니다)

아래 숫자는 이 시즌의 밸런스를 정할 때 **겨냥한 값**이다. 계측을 하지 않으므로
(D10) 출하 후 이 표로 합격·불합격을 판정할 수는 없다. 표를 남기는 이유는 다음에
숫자를 만질 사람이 "무엇을 노리고 이 값이 됐는지"를 알아야 하기 때문이다.

| 항목 | 겨냥한 값 | 어긋난다고 느껴지면 만지는 곳 |
| --- | --- | --- |
| 6~8인 시민 승률 | 50±5% | `mafiaTeamSize`, `firstNightPeacefulUpTo` |
| 9~12인 시민 승률 | 50±5% | `exclusiveGroups`, `minPlayers` |
| 평균 라운드 수 | 3~5 | 소인원 구성표 |
| 평균 판 길이 | 5~10분 (속도전 3~4분) | `timing` |
| 사기꾼 등장 판의 경찰 정확도 | 뚜렷하게 하락 | 사기꾼 `minPlayers`, 배타 규칙 |
| 쪽지 사용률 | 시민 중 40% 이상 | `QUICK_NOTE` 문구셋 |
| 속도전 재시작률 | 표준전보다 높음 | 속도전 `timing` |

4~5인 판은 이 표의 대상이 아니다(D8). 구성표가 6인부터 시작하므로 4~5인은
같은 게임이 아니다.

### 9.2 계측 없이 판단하는 방법

계측 경로를 만들지 않기로 했다(D10). 대신 무엇을 보고 판단할지를 정해 둔다.
"체감으로 본다"만 적어 두면 아무도 아무것도 보지 않는다.

**관측할 수 있는 것 — 이미 코드에 있다.**
`finish()`가 판이 끝날 때 전체 채팅에 `🏁 N번 방 — 마피아 승리` 한 줄을 흘린다
([Outcome.ts:49](../../../src/services/Outcome.ts)). 방 안에 없어도 로비에서
보인다. 승패와 방 번호는 **사람이 앉아 있는 동안은 수기로 셀 수 있다.** 판
길이와 라운드 수는 이 줄에 없다.

**S0 직후에 할 일.** 6인·10인 판을 각각 최소 5판 관전하고 다음 세 가지만 적는다.

1. 승패 (전체 채팅의 `🏁` 줄)
2. 첫 밤 이후 몇 번째 밤에 첫 사망자가 나왔는지
3. **둘째 낮부터** 토론이 근거를 갖고 이뤄졌는지, 아니면 정보 없이 겉돌았는지

3번이 핵심이다. §8.4가 말하는 "정보 생산 속도 대 소모 속도"는 승률보다
토론의 질에 먼저 나타난다. 승률 5%p 차이는 표본 100판이 있어야 보이지만
"아무도 할 말이 없어서 아무나 찍었다"는 5판이면 보인다.

**첫 낮은 대상이 아니다.** 첫 밤 무사를 켜면 첫 낮의 정보가 0이 되는 것은
설계이지 결함이 아니다(S0의 「첫 낮에 남는 정보」). 첫 낮까지 세면 이 관측이
"첫 밤 무사를 되돌려라"라는 잘못된 결론으로 간다.

**포기하는 것.** S0의 변경 전후를 숫자로 비교할 기회는 영구히 사라진다. 6인
마피아 2→1이 실제로 시민 승률을 얼마나 올렸는지는 앞으로도 알 수 없다.
나중에 계측이 붙어도 "바뀌기 전"의 기준선은 없다.

#### 코드에 남기는 주석

두 곳이다. 수집처가 생겼을 때 이 두 주석이 출발점이 된다.

**1. [Outcome.ts](../../../src/services/Outcome.ts)의 `finish()`** — 판 결과가
확정되는 유일한 지점. 요약을 내보낼 자리가 여기다.

```ts
// 판 요약을 외부로 내보내는 자리다. 시즌 1은 계측 없이 출하했다 —
// 받는 쪽이 없는데 보내면 데이터가 버려지고, 대신 보낸다는 사실만 남아
// "계측이 있다"고 오해된다.
//
// 붙일 때 필요한 것:
//  - 경로: Ccu.ts의 httpPostJson과 같은 엔드포인트를 쓸 수 있다. 그쪽은
//    collection: "CCU"로 쓰고 있으므로 collection만 바꾸면 된다. 다만 그
//    DB가 다른 collection을 받는지, 받은 것을 읽을 방법이 있는지는
//    확인되지 않았다.
//  - 내용: winner, room.seats.length, room.turnCount, 모드 id
//  - 집계 대상: 참가 6인 이상만. 4~5인은 구성표가 다른 연습 판이다.
//    (연습 판 격리는 docs/superpowers/specs/2026-07-30-season0-1-execution-design.md D8)
```

**2. [RuleSet.ts](../../../src/domain/RuleSet.ts)의 파일 주석 끝** — 모드가
늘어날 때 집계 대상 판단이 필요해지는 자리.

```ts
// 모드별 집계 제외 플래그(ranked 같은 것)는 넣지 않았다. 시즌 1의 세 모드는
// 전부 집계 대상이고, 계측 자체가 없다. 집계에서 빼야 할 모드(연습·이벤트)가
// 생기는 시점에 그때 필요한 형태로 넣는 편이 낫다.
```

주석 두 개가 코드에 남는 전부다. 함수도 필드도 만들지 않는다.

---

## 10. 시즌 2로 넘기는 것

이 시즌에서 자리는 마련되지만 채우지 않는 것들이다.

| 항목 | 이 시즌에 준비된 것 | 시즌 2에 할 일 |
| --- | --- | --- |
| 마담 | `BLOCK` step, `Seat.blocked`, `exclusiveGroups` | 마피아팀 교란자 추가. 7~9인 2번째 슬롯 랜덤 회복. 건달과의 배타 여부 판단 |
| 경호원 | `PROTECT` step, 보호 계열 배타 선례(`[SOLDIER, THUG]`) | 배타 그룹에 경호원을 넣어 상한 2종을 유지 |
| 도굴꾼·성직자 | — | `targetKind` / `targetCount` (§1.2에서 제외한 것) |
| 탐정 | `INSPECT` step | 방문 기록을 남기려면 intent 로그를 밤 종료 후에도 보관해야 한다 |
| 마피아팀 쪽지 | `NOTE` 종류 | 마담에게 쪽지를 겸하게 할지 판단 |
| 침묵전 번호 지목 | 문구셋 구조 | 위치 지목만으로 부족했는지 보고 판단 |
| 정치인·자경단원 최소 인원 | — | 판이 도는 모습을 보고 판단 (승률 데이터는 없다) |
| 스파이 모드 격리 | — | 숨은배신자 모드(시즌 3)와 함께 |
| 판 요약 전송 | `finish()`의 주석(§9.2) | 수집처가 정해지면 붙인다. 시즌 1의 기준선은 남지 않는다 |

건달 재설계는 이 시즌에 들어왔다(S6). `SILENCE`와 `Seat.silenced`도 그때
삭제되므로 시즌 2로 넘기지 않는다.

보호 계열 상한(§8.4 4순위)은 S6의 `[SOLDIER, THUG]`로 **이미 지켜지고 있다.**
의사가 `citizenRequired`라 항상 나오므로, 군인·건달 둘 중 하나만 나오면
보호·방해 계열은 최대 2종이다. 경호원을 넣을 때 이 배타 그룹에 함께 넣으면
구조를 새로 만들 필요가 없다.

`Room.soloWinners`와 `evaluateWinner` 변경은 시즌 3이다. 이 시즌에
[WinCondition.ts](../../../src/domain/WinCondition.ts)는 변경되지 않는다.
