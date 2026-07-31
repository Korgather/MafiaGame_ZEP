# 시즌 0+1 구현 계획 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ZEP 마피아 게임의 밸런스를 바로잡고(시즌 0), 규칙 세트·덱 구성기·밤 정산 파이프라인 위에 신규 직업 넷(사기꾼·점쟁이·시민 쪽지·건달 재설계)을 얹는다(시즌 1).

**Architecture:** 각 슬라이스는 "구조 하나 + 그 구조의 첫 소비자 하나"로 묶인 수직 슬라이스다. 도메인 계층(`src/domain/`)은 ZEP API를 전혀 참조하지 않으므로 Node에서 그대로 테스트하고, 서비스 계층(`src/services/`)이 그 결과를 위젯·채팅으로 옮긴다. 밤 정산은 클릭 시점 즉시 처리에서 `intent 수집 → step 순서 정산` 파이프라인으로 옮겨가며, 그 이후 모든 신규 직업은 step 상수 하나만 고르면 끼워진다.

**Tech Stack:** TypeScript (ES2020 / CommonJS), `zep-script` 0.16.5, webpack 단일 번들, `node --test` (Node 22.18+ 타입 스트리핑), ESLint.

**출처 스펙:** [docs/superpowers/specs/2026-07-30-season0-1-execution-design.md](docs/superpowers/specs/2026-07-30-season0-1-execution-design.md)

## Global Constraints

모든 태스크의 요구사항에 아래가 암묵적으로 포함된다.

**런타임(Jint) 제약 — 어기면 배포 후에야 터진다:**
- `console` / `window` / `document` / `fetch` 없음. HTTP는 `ScriptApp.httpPostJson`만.
- **`src/` 안에서 네이티브 `Map` / `Set` 금지.** 평범한 객체와 배열을 쓴다.
- **ZEP API 인자로 `undefined`를 넘기지 않는다.** 값이 없으면 그 인자를 빼고 호출하는 오버로드를 쓴다.
- **`sort`의 안정성을 신뢰하지 않는다.** 순서가 중요하면 명시적으로 만든다.
- **`src/` 안에서는** `??` / `?.`를 **일부러** 쓰지 않는다 (근거: `src/services/Voting.ts:157-164`의 주석). `src/`에 실제로 한 곳도 없다. 새 `src/` 코드도 쓰지 않는다. **테스트는 예외다** — `tests/domain.test.ts`가 이미 `?.`를 자유롭게 쓰고(`:242`, `:420`, `:462` 등) Jint가 아니라 Node에서 돌기 때문이다. 이 계획의 테스트 코드도 그 관행을 따른다.
- 소스에는 항상 `ScriptApp` / `ScriptMap`을 쓴다. `@zep.us/babel-plugin-zep-script`가 빌드 때 `App.*`로 바꾼다.

**계층 의존 방향(단방향):** `services` → `domain` / `entities` / `infrastructure`, `domain` → `types` / `constants`. `domain`은 ZEP-free다. `entities` → `domain` 임포트는 이미 있는 관행이다 (`src/entities/Room.ts:17`).

**타입 설정:** `strict: true`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noImplicitReturns`, `isolatedModules: true`, `allowImportingTsExtensions: true`. **`noUncheckedIndexedAccess`는 켜져 있지 않다** — 배열·인덱스 시그니처 접근은 `T | undefined`가 아니라 `T`로 좁혀진다. 그래서 "없을 수 있는 값"은 인덱스 시그니처가 아니라 `Partial<Record<...>>`로 표현해야 `!== undefined` 비교가 타입 오류(TS2367)가 되지 않는다.

**검증 게이트:** 모든 태스크는 커밋 직전에 `npm run verify`가 통과해야 한다.

```bash
npm run verify
```

`verify` = `type-check && lint && check:zep && test && check:ui`. **`type-check`·`lint`·`test`는 `.html`과 `tools/`를 보지 않는다** — `src/ui/*.html`과 `tools/widget-scenes.js`의 실수를 잡는 그물은 `check:ui`뿐이다 (Task 9에서 결정적으로 중요하다).

**테스트 관례:** `node:assert/strict`, `node:test`의 `describe`/`it`. 도메인 테스트는 `seat(index, role, overrides)` 팩토리와 `EVERY_COUNT`(4..12) 루프를 따른다. 팩토리는 지금 `tests/domain.test.ts:39-62`에 있고 **Task 4가 `tests/helpers/seat.ts`로 옮긴다** — Task 5 이후의 새 테스트 파일은 거기서 임포트한다. 통합 테스트는 `tests/helpers/Harness.ts`의 `startGame(playerCount, roomNum, roles?)` 등을 쓴다.

**배포 가정 (스펙 §1.4):** 각 슬라이스는 `res/main.js` 하나를 다시 올리는 것으로 배포된다. `Room`·`Seat`는 전부 메모리에 있고 영속화 경로가 없으므로(`Ccu.ts`의 `httpPostJson`이 유일한 외부 통신) **재배포 = 진행 중인 판 전멸**로 가정한다. 배포 창은 방이 빌 때다. 최소 7회 배포하며, **롤백도 배포다**. Task 8의 필드 타입 변경에 마이그레이션은 필요 없다. **첫 배포(Task 1) 때 한 번 관찰할 것: 재배포가 정말 방 상태를 초기화하는지.**

**계측:** 시즌 1은 계측 없이 출하한다(스펙 D10). 붙일 자리에는 코드 주석만 남긴다.

**문안 규칙:** 사용자에게 보이는 모든 문자열은 스펙에 적힌 것을 **글자 그대로** 쓴다. 이모지 포함.

## 스펙 보정 사항 (구현 전 확정)

계획을 소스에 대조하며 발견한, 스펙 본문과 실제 코드가 어긋나는 지점들이다. 아래 판단을 따른다.

1. **첫 밤 무사 가드의 위치**는 `resolveNight`(Night.ts) 안, `resolveNightCasualties` **앞**이다. 스펙은 "임시 위치"라고만 적었으나, `resolveNightCasualties`는 `attackedBy`가 비어 있지 않은 좌석의 `armored`를 **소모한다**(`src/domain/NightResolution.ts:229-234`). 사망 정산에 들어가기 전에 걸러야 군인의 방탄이 첫 밤에 사라지지 않는다.
2. **`mafiaCount`는 표 밖 인원을 마지막 칸으로 클램프한다.** `tests/domain.test.ts:299`가 `MAX_PLAYERS + 2`(=14)까지 `buildRoleDeck`을 부른다.
3. **`STANDARD_RULES.timing`은 현재 `TIMING` 값과 완전히 같아야 한다.** 그래야 1~5번 방 동작이 비트 단위로 동일하다.
4. **침묵전 잠금은 `write: false`로 구현할 수 없다.** 빠른 문구 버튼도 `ChatService.submit`의 같은 경로를 타고, 그 경로는 `access.write`를 본다(`ChatService.ts:456`). `ChannelAccess`에 `freeText: boolean`을 추가한다.
5. **Task 4의 `resolveNightSelect` → `recordNightIntent` 변경은 개명이 아니다.** `tests/domain.test.ts`에 호출이 **17곳**(임포트 포함 18곳) 있고, 그중 여섯 테스트가 이 함수의 **대상 변형**을 단언한다(`target.healed`·`attackedBy`·`silenced`·`scooped`). 변형이 파이프라인으로 옮겨가므로 그 단언들은 `tests/night-pipeline.test.ts`로 이사한다. 스펙 §8.1은 :500 한 줄만 적었다.
6. **7~9인 마피아 구성은 "마피아 + 사기꾼 고정"이 아니라 "마피아 + (공범 또는 사기꾼)"이다.** `Role.MAFIA`는 `mafiaPool`에 남아 있다(기존 "공범도 한 갈래다" 동작, `MAY_REPEAT` 테스트가 지킨다).
7. **Task 3은 `tests/domain.test.ts:147`을 깨뜨린다.** 그 테스트는 모든 인원에서 `deck.includes(Role.MAFIA)`를 주장하는데, Task 3의 검증 기준은 6인 판에서 짐승인간 리드가 나오는 것을 요구한다. 같은 태스크 안에서 테스트를 고친다.
8. **Task 2의 "기존 테스트 무수정 통과"는 단언(assertion)에 대한 것이지 기계적 치환에 대한 것이 아니다.** `buildRoleDeck(count)` → `buildRoleDeck(deck, count)`, `TIMING.X` → `STANDARD_RULES.timing.X` 치환은 불가피하다. 값이 같으므로 통과/실패는 바뀔 수 없다.
9. **`src/services/Outcome.ts:40`의 `TIMING.GAME_OVER`가 스펙 S1 치환표에서 빠져 있다.** Task 2에 포함한다.
10. **`DeckSpec.minPlayers`는 `Partial<Record<Role, number>>`다.** 위 Global Constraints의 `noUncheckedIndexedAccess` 항목 참조.
11. **`Room.ruleSet`의 임포트는 `import type`이다.** `src/types/Game.types.ts`가 `src/domain/RuleSet.ts`를 타입으로만 참조하면 `isolatedModules`가 지우므로 런타임 순환이 생기지 않는다.
12. **모드 안내는 온보딩 카드가 아니라 방 입장 안내 줄로 낸다.** `showGuide(player)`는 `Lobby.ts:240`과 맵 트리거(`MapTrigger.GUIDE_BOARD`, 방이 스코프에 없다) 양쪽에서 불리고 `needsGuide`가 첫 판인 사람만 통과시킨다 — 거기 카드를 넣으면 거의 아무도 못 본다. Task 2에서 `joinRoom`에 한 줄로 넣는다.
13. **이름 충돌 주의.** `PlayerTag.blocked`(`src/types/Game.types.ts:373`, 채팅 차단 목록)와 `src/ui/vote.html:48`의 `.grid.blocked` CSS는 Task 10이 새로 만드는 `Seat.blocked`와 **이름만 같고 관계가 없다**.
14. **`NightStep`은 `NightPipeline.ts`가 아니라 `src/domain/Roles.ts`에 둔다.** 스펙 §S3은 새 파일에 넣으라고 적었지만, `RoleDef.nightStep`이 그 상수를 타입과 **값** 양쪽으로 쓰므로 `Roles → NightPipeline → Roles` 순환이 생긴다. `ROLE_DEFS`는 모듈 평가 시점에 `NightStep.ATTACK`을 읽는 리터럴이라, 번들러가 `Roles.ts`를 먼저 평가하면 전부 `undefined`가 된다. `NightActionKind`와 같은 성격(직업 정의의 어휘)이므로 그 옆이 제자리다. `NightPipeline.ts`는 `Roles.ts`에서 가져다 쓴다 — 의존 방향이 한쪽이다.
15. **`NightSettlement.casualties`의 원소 타입은 `NightCasualty`다.** 스펙 §S3 시그니처 블록은 `Casualty[]`라고 적었으나 그런 타입은 없다(`src/domain/NightResolution.ts:203`).
16. **intent는 좌석당 하나로 유지한다.** 스파이의 재지목은 `consumed: false`라 같은 밤에 여러 번 지목할 수 있다(`NightResolution.ts:143-155`). 그냥 배열에 밀어 넣으면 파이프라인의 "이 좌석의 intent" 조회가 모호해진다. Task 4가 `putIntent`(같은 actor면 교체)를 둔다.

17. **파이프라인은 좌석의 생사를 밤 시작 시점으로 고정해서 본다.** 스펙 §S3의 재사용 루프 스케치는 `seat.alive`를 언제 읽는지 적지 않았다. step마다 다시 읽으면 `DEATH`에서 죽은 사람의 능력이 뒤 step에서 사라진다 — 그 밤에 죽은 기자의 특종(`AFTER`)과 그 밤에 죽은 경찰의 조사(`INSPECT`)가 그렇다. 둘 다 **지금은 나가는 것들이다**(클릭 시점에 적용되므로). Task 4가 `wasAlive` 스냅샷으로 고정한다.

18. **Task 5는 스파이의 "같은 밤 재지목" 보너스를 없앤다.** 지금 `resolveNightSelect`는 스파이가 마피아를 찾아내면 `consumed: false`를 돌려준다(`NightResolution.ts:143-155`). 조사 답이 아침으로 가면 이 보너스가 성립하지 않는다 — `putIntent`가 좌석당 지목 하나를 유지하므로 두 번 눌러도 아침에 오는 답은 마지막 것 하나뿐이고, 게다가 "또 누를 수 있다"는 사실 자체가 답("방금 마피아를 찾았다")을 클릭 즉시 알려준다. 옮기는 목적이 그 누설을 막는 것이므로 보너스를 남길 수 없다. 스펙 §S3은 합류 시점만 다루고 `consumed`를 언급하지 않았다.

19. **점쟁이의 `nightSprite`는 `null`이다.** 스펙 §S4는 `nightSprite: "seer"`라고 적었으나 `RoleDef.nightSprite`의 타입은 `SpriteKey | null`이고(`src\domain\Roles.ts:72`) `SPRITE_DEFS`에 `seer` 항목이 없다(`src\constants\Assets.ts:276`, 현재 키는 `mafia`·`doctor`·`police`·`spy`·`bullet`·`claw` 여섯). 항목만 더해도 `tests\assets.test.ts`가 `res/`에서 실제 PNG를 읽어 헤더와 프레임 산술까지 검사하므로 그림 없이는 통과할 수 없다. 게다가 스펙이 건달에 대해 이미 적어 둔 근거("시민팀 교란자가 밤에 목격되면 정체가 새어나간다")가 점쟁이에게도 그대로 적용된다. 그림이 생기면 한 줄 바꾸면 된다.

20. **쪽지는 지목 하나로 끝나지 않는다.** 대상과 문구 두 가지를 받아야 하므로 밤 위젯의 계약이 하나 늘어난다(서버→위젯 `phrases`, 위젯→서버 `phrase`). 스펙 §S5는 "쪽지 문구 선택 UI"라고만 적었다. 문구는 `NightIntent`를 넓히지 않고 `Seat.noteText`로 나른다 — `putIntent`가 `{actor, target}`을 통째로 교체하므로 거기에 세 번째 필드를 넣으면 대상을 바꿀 때마다 문구가 사라진다.

21. **`maxUses` 도입도 개명이 아니다.** `skillSpent`는 `src`에 5곳(`NightResolution.ts:80,82`·`Room.ts:66,89,244`·`Game.types.ts:150`·`Night.ts:260`), 테스트에 4곳(`domain.test.ts:57,589,594`)이 있다. **좌석 팩토리는 Task 4가 `tests/helpers/seat.ts` 한 곳으로 모으므로 필드 변경은 거기 한 줄이다** — Task 4·6·10이 만드는 새 테스트 파일들과 기존 `domain.test.ts`가 모두 그 헬퍼를 임포트한다.

22. **Task 9의 `SILENCE` 제거 목록에 `NightPipeline.apply`가 빠져 있다.** 스펙 §S6 커밋 1의 삭제 표는 `Roles.ts`만 적었으나, Task 4가 `apply`에 `case NightActionKind.SILENCE: target.silenced = true;` 갈래를 만들어 두었다. `Seat.silenced`가 사라지면 그 갈래도 함께 사라진다.
23. **S6의 커밋 2/3 경계를 옮긴다.** 스펙은 "커밋 2 = `BLOCK` 추가 / 커밋 3 = 건달 재정의 + 덱 복귀"로 나눴으나, 커밋 2만으로는 검증할 수 있는 동작이 하나도 없다 — `BLOCK`을 쓰는 직업이 없으므로 테스트가 존재할 수 없는 커밋이다. 태스크의 정의가 "혼자서 테스트되는 산출물"이므로 경계를 한 칸 옮긴다. **Task 10 = 차단이 실제로 막는가**(`NightActionKind.BLOCK`·`Seat.blocked`·파이프라인 전파 + 건달을 `BLOCK`으로 재정의), **Task 11 = 건달이 게임에 존재하는가**(양쪽 통보 + 덱 복귀 + 배타·최소 인원). 커밋은 여전히 세 개이고 삭제(Task 9)와 추가가 섞이지 않는다는 스펙의 진짜 요구도 그대로다.
24. **`RoleDef.noSelfTarget`이 필요하다.** 스펙 §6 표는 건달의 대상을 "산 사람 1, **자기 제외**"라고 적고 검증 기준에도 넣었지만, 지금 코드에는 자기 지목을 막는 곳이 아예 없다 — `roleAction.html:97`은 죽은 사람만 비활성화하고(`flag(!seat.alive, "disabled")`), 서버도 `!target.alive`만 본다. 의사의 자가 치유는 지금 허용되는 동작이라 전역 금지는 회귀다. 직업별 플래그로 넣고 위젯과 서버 양쪽이 같은 근거로 막는다(Task 10).

## File Structure

**새로 만드는 파일**

| 파일 | 책임 | 태스크 |
|---|---|---|
| `src/domain/RuleSet.ts` | 모드 하나가 바꾸는 값 전부(타이밍·덱·채팅 방식)를 담는 값 타입과 세 리터럴. 직업이 늘 때마다 `STANDARD_RULES.deck`에 줄이 는다 | 2, 3, 6, 7, 11 |
| `src/domain/NightPipeline.ts` | 밤 intent 수집 → step 순서 정산. `NightStep`·`NightIntent`·`NightReveal`·`NightSettlement`·`resolveNightIntents`. 직업이 늘 때마다 `apply`에 갈래가 는다 | 4, 5, 6, 8, 10, 11 |
| `tests/deck.test.ts` | 덱 구성기 (인원표·풀·배타·최소 인원) | 1, 3, 6, 7, 11 |
| `tests/ruleset.test.ts` | 규칙 세트 값과 방별 배정 | 2 |
| `tests/night-pipeline.test.ts` | 클릭 순서 무관·step 배치·reveals 배달 | 4, 5, 9 |
| `tests/roles-season1.test.ts` | 사기꾼·점쟁이·시민 쪽지 | 6, 7, 8 |
| `tests/night-block.test.ts` | `BLOCK` step과 건달 | 10, 11 |
| `tests/helpers/seat.ts` | 도메인 테스트용 좌석 팩토리 한 벌. `Seat`이 바뀌면 여기만 고친다 | 4, 8, 9, 10 |

**고치는 파일 (주된 책임 변화만)**

| 파일 | 무엇이 바뀌나 | 태스크 |
|---|---|---|
| `src/constants/GameConfig.ts` | `MAFIA_RATIO` 삭제, `MAFIA_TEAM_SIZE`·`FIRST_NIGHT_PEACEFUL_UP_TO` 추가 → Task 2에서 `RuleSet.ts`로 이사 | 1, 2 |
| `src/domain/RoleAssignment.ts` | 상수 풀을 인자로 받는 덱 구성기로 (풀 자체는 Task 2에서 `RuleSet.ts`로 나간다) | 1, 2, 3 |
| `src/domain/Roles.ts` | 건달 진영 정정 → 신규 직업 셋 추가 → `SILENCE` 제거 → `BLOCK` 추가와 건달 재정의 | 1, 6, 7, 8, 9, 10 |
| `src/domain/NightResolution.ts` | 첫 밤 무사 판정 추가 → intent 기록기로 축소 → 차례 판정 확장 | 1, 4, 5, 7, 8, 10 |
| `src/domain/chat/ChatPermission.ts` | `freeText` 도입 → `silenced` 제거 | 2, 9 |
| `src/domain/chat/QuickPhrases.ts` | 침묵전 문구·쪽지 문구 | 2, 8 |
| `src/types/Game.types.ts` | `Room.ruleSet` → `Room.nightIntents`/`nightReveals` → `Seat.noteText`·`Seat.usesSpent` → `Seat.blocked` | 2, 4, 5, 8, 9, 10 |
| `src/entities/Room.ts` | 위 필드들의 생성·초기화 | 2, 4, 5, 8, 9, 10 |
| `src/services/Night.ts` | 첫 밤 고지 → 파이프라인 호출 → reveals 배달 → 쪽지 2단 지목 → 자기 지목 차단 | 1, 4, 5, 8, 10 |
| `src/services/GameFlow.ts` · `Outcome.ts` | `TIMING` → `room.ruleSet.timing` | 2 |
| `src/services/Voting.ts` | `TIMING` 이사 → 협박 경로 전부 삭제 | 2, 9 |
| `src/services/ChatService.ts` | 문구 검증 게이트 → `silenced` 제거 | 2, 9 |
| `src/services/Widgets.ts` | 투표 payload에서 `silenced` 삭제 → 밤 payload에 `noSelf` 추가 | 9, 10 |
| `src/services/Lobby.ts` | 방 입장 시 모드 안내 | 2 |
| `src/ui/roleAction.html` | 쪽지 문구 고르기 2단계 → 자기 타일 잠금 | 8, 10 |
| `src/ui/vote.html` · `src/ui/chat.html` · `tools/widget-scenes.js` | `silenced` 흔적 제거, 쪽지·차단 장면 추가 | 8, 9, 10 |

---

## Task 1: 시즌 0 — 밸런스 핫픽스 + 건달 진영 정정

마피아 인원을 비율에서 인원표로 바꾸고(6인 판 2명 → 1명), 건달을 마피아 팀에서 시민 팀으로 되돌리고, 8인 이하 판의 첫 밤을 무사히 넘긴다. 구조 변경이 전혀 없어 가장 먼저 배포할 수 있다.

**Files:**
- Modify: `src/constants/GameConfig.ts:139-151`
- Modify: `src/domain/RoleAssignment.ts:9-15`, `:24-38`, `:76-78`
- Modify: `src/domain/Roles.ts:288-302`
- Modify: `src/domain/NightResolution.ts` (파일 끝에 추가)
- Modify: `src/services/Night.ts:88-118`, `:296-330`
- Modify: `src/services/Outcome.ts:38-42`
- Modify: `tests/domain.test.ts:490-496`, `:532-539`
- Test: `tests/deck.test.ts` (신규)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `MAFIA_TEAM_SIZE: readonly number[]` — `src/constants/GameConfig.ts`. index = 참가 인원, 값 = 마피아 진영 인원. 길이 13 (0..12).
  - `FIRST_NIGHT_PEACEFUL_UP_TO: number` — `src/constants/GameConfig.ts`. 값 8.
  - `mafiaCount(playerCount: number): number` — 시그니처 그대로 유지 (Task 2에서 바뀐다).
  - `isPeacefulNight(nightNumber: number, playerCount: number): boolean` — `src/domain/NightResolution.ts`.

- [ ] **Step 1: 덱 테스트 파일을 만들고 실패시킨다**

`tests/deck.test.ts`를 새로 만든다.

```ts
/**
 * 덱 구성기 테스트.
 *
 * 인원별 구성은 밸런스 그 자체라 값이 바뀌면 곧바로 판이 바뀐다.
 * RoleAssignment는 ZEP API를 참조하지 않으므로 Node에서 그대로 돈다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role, Team } from "../src/types/Game.types.ts";
import { buildRoleDeck, mafiaCount } from "../src/domain/RoleAssignment.ts";
import { ROLE_DEFS } from "../src/domain/Roles.ts";
import { MAFIA_TEAM_SIZE, MAX_PLAYERS, MIN_PLAYERS } from "../src/constants/GameConfig.ts";

const EVERY_COUNT: number[] = [];
for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) EVERY_COUNT.push(count);

describe("마피아 진영 인원표", () => {
	it("인원표가 정원까지 빠짐없이 채워져 있다", () => {
		// index = 참가 인원이므로 0번 칸이 있어야 12번 칸이 12인을 가리킨다
		assert.equal(MAFIA_TEAM_SIZE.length, MAX_PLAYERS + 1);
	});

	it("mafiaCount가 표를 그대로 읽는다", () => {
		for (const count of EVERY_COUNT) {
			assert.equal(mafiaCount(count), MAFIA_TEAM_SIZE[count], `${count}인`);
		}
	});

	it("표 밖의 인원은 마지막 칸으로 잘린다", () => {
		// 테스트가 정원 밖까지 부르는 곳이 있다. 표를 벗어나도 답이 있어야 한다
		assert.equal(mafiaCount(MAX_PLAYERS + 2), MAFIA_TEAM_SIZE[MAX_PLAYERS]);
	});

	it("6인 판의 마피아는 한 명이다", () => {
		// 시즌 0의 핵심 수정. 2명이면 6인 판은 첫 투표 전에 이미 기울어 있다
		assert.equal(mafiaCount(6), 1);
	});

	it("인원이 늘어도 마피아가 줄지 않는다", () => {
		for (let count = MIN_PLAYERS + 1; count <= MAX_PLAYERS; count++) {
			assert.ok(mafiaCount(count) >= mafiaCount(count - 1), `${count}인`);
		}
	});
});

describe("덱 구성", () => {
	it("건달은 어느 인원에서도 나오지 않는다", () => {
		// 시즌 0에서 건달은 시민이 되었고, 마피아 풀에서 빠졌다.
		// 시민 풀에는 아직 없다 — 다시 들어오는 것은 건달 재설계 슬라이스다
		for (const count of EVERY_COUNT) {
			for (let trial = 0; trial < 50; trial++) {
				assert.ok(!buildRoleDeck(count).includes(Role.THUG), `${count}인`);
			}
		}
	});

	it("마피아 진영 인원이 표와 정확히 같다", () => {
		for (const count of EVERY_COUNT) {
			const deck = buildRoleDeck(count);
			const mafia = deck.filter(role => ROLE_DEFS[role].team === Team.MAFIA).length;
			assert.equal(mafia, mafiaCount(count), `${count}인`);
		}
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test
```

Expected: FAIL — `MAFIA_TEAM_SIZE`가 `src/constants/GameConfig.ts`에 없어서 타입/실행 오류. (`npm test`는 타입 스트리핑으로 돌므로 `MAFIA_TEAM_SIZE`가 `undefined`가 되어 `.length` 접근에서 터진다.)

- [ ] **Step 3: `GameConfig.ts`에서 비율을 인원표로 바꾼다**

`src/constants/GameConfig.ts:139-151`의 주석 블록과 `MAFIA_RATIO` 상수를 통째로 아래로 교체한다.

```ts
/**
 * 참가 인원별 마피아 진영 인원. index가 곧 참가 인원이다.
 *
 * 기존에는 MAFIA_RATIO = 0.27 하나로 반올림해서 구했다. 비율은 정원이
 * 바뀌어도 상수가 늘지 않는다는 장점이 있었지만, 대신 "6인 판이 왜 2명인가"
 * 라는 질문에 답할 수 없었다 — 답이 반올림 안에 있었기 때문이다.
 *
 * 6인 판 2명은 실제로 틀린 값이었다. 시민 4명 중 의사·경찰이 확정이므로
 * 마피아가 둘이면 첫 투표를 시민이 정확히 맞혀도 2:3, 한 번 틀리면 그대로
 * 끝난다. 표로 적으면 이런 판단을 인원마다 따로 내릴 수 있다.
 *
 * 4~6인 1명 / 7~10인 2명 / 11~12인 3명.
 */
export const MAFIA_TEAM_SIZE: readonly number[] =
	[0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3];
//   0  1  2  3  4  5  6  7  8  9 10 11 12

/**
 * 몇 인 판까지 첫 밤에 아무도 죽지 않는가.
 *
 * 작은 판에서 첫 밤 사망은 정보가 아니라 손실이다 — 죽은 사람은 한 마디도
 * 못 해봤고, 남은 사람은 그 사람에 대해 아는 것이 없어 추리가 시작되지
 * 않는다. 9인부터는 죽어도 토론할 사람이 충분히 남는다.
 */
export const FIRST_NIGHT_PEACEFUL_UP_TO = 8;
```

- [ ] **Step 4: `RoleAssignment.ts`가 표를 읽게 한다**

임포트(`src/domain/RoleAssignment.ts:9-15`)에서 `MAFIA_RATIO`를 빼고 `MAFIA_TEAM_SIZE`를 넣는다.

```ts
import {
	CITIZENS_PER_NIGHT_KILL,
	MAFIA_TEAM_SIZE,
	MIN_PLAIN_CITIZENS,
	MIN_SPECIAL_CITIZENS,
	SPECIAL_CITIZEN_RATIO,
} from "../constants/GameConfig.ts";
```

`mafiaCount`(`:76-78`)를 교체한다.

```ts
/**
 * 그 인원 판의 마피아 진영 인원. 표를 그대로 읽는다.
 *
 * 정원 밖(테스트가 정원 + 2까지 부른다)은 마지막 칸으로 자른다. 표를 벗어난
 * 인원에 답이 없는 것보다, 가장 큰 판과 같게 다루는 편이 안전하다.
 */
export function mafiaCount(playerCount: number): number {
	const last = MAFIA_TEAM_SIZE.length - 1;
	return MAFIA_TEAM_SIZE[playerCount > last ? last : playerCount];
}
```

`MAFIA_POOL`(`:24-38`)의 주석과 값을 교체한다. 건달이 빠지고, 인원표가 바뀌면서 짐승인간의 등장 문턱도 달라졌다.

```ts
/**
 * 두 번째 마피아 진영 자리에 뽑히는 후보.
 *
 * 둘 다 마피아 팀이지만 하는 일이 다르다 — 둘째 마피아는 같이 죽일 사람을
 * 고르고, 짐승인간은 혼자 따로 문다. 판마다 달라져야 시민이 "마피아 팀에
 * 누가 있는지"를 다시 추리한다. Role.MAFIA가 풀에 다시 들어 있는 것은
 * 그래서다 — 아무 능력 없는 공범도 한 갈래다.
 *
 * 다만 밤 사망자 예산(CITIZENS_PER_NIGHT_KILL)을 넘는 후보는 그 판에서
 * 걸러진다. 조건은 인원수가 아니라 시민 자리 수(citizenSlots)이므로 마피아
 * 수와 함께 움직인다 — 인원표에서 10인 판이 마피아 2명이 되면서 시민 자리가
 * 8이 되었고, 짐승인간은 그 10인부터 뽑힌다.
 */
const MAFIA_POOL: readonly Role[] = [Role.MAFIA, Role.BEAST];
```

- [ ] **Step 5: 덱 테스트가 통과하는지 본다**

```bash
npm test
```

Expected: `tests/deck.test.ts`의 7개 테스트 전부 PASS. `tests/domain.test.ts`도 이 시점에는 전부 PASS여야 한다 (`mafiaCount`가 여전히 단조증가·`count/2` 미만이고, `MAFIA_LEAD`가 여전히 `Role.MAFIA`다).

- [ ] **Step 6: 건달이 시민이라는 실패 테스트를 쓴다**

`tests/deck.test.ts`의 `describe("덱 구성", ...)` 아래에 새 블록을 덧붙인다.

```ts
describe("건달의 진영", () => {
	it("건달은 시민 팀이다", () => {
		// 건달은 원래 시민 편이다. 마피아 팀으로 들어가 있던 것이 버그였고,
		// 그 탓에 경찰이 잡으면 "마피아입니다"가 나왔다
		assert.equal(ROLE_DEFS[Role.THUG].team, Team.CITIZEN);
	});

	it("건달은 마피아로 위장하지 않는다", () => {
		assert.equal(ROLE_DEFS[Role.THUG].appearsAsMafia, undefined);
	});
});
```

- [ ] **Step 7: 실패를 확인한다**

```bash
npm test
```

Expected: FAIL — `Expected values to be strictly equal: 'MAFIA' !== 'CITIZEN'`.

- [ ] **Step 8: `Roles.ts`에서 건달을 시민으로 되돌린다**

`src/domain/Roles.ts:288-302`의 `THUG` 항목을 교체한다. 능력(`SILENCE`)은 이 슬라이스에서 건드리지 않는다 — 재설계는 Task 11이다.

```ts
	THUG: {
		displayName: "건달",
		team: Team.CITIZEN,
		glyph: "🥊",
		ability: "밤마다 한 명을 협박해 다음 낮 발언과 투표를 막습니다.",
		tip: "시민 편입니다. 확정 시민을 막으면 헛턴이니 밤에 움직이는 사람을 찾으세요.",
		nightAction: NightActionKind.SILENCE,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "협박할 대상을 선택하세요.",
		nightNotice: NO_CHAT,
		immuneToVote: false,
	},
```

- [ ] **Step 9: 건달을 조사하는 기존 테스트 둘을 고친다**

`tests/domain.test.ts:490-496`의 경찰 테스트는 이름과 주석까지 함께 고친다. 건달이 더 이상 마피아로 보이지 않으므로 기대값이 뒤집힌다.

```ts
	it("경찰은 짐승인간도 건달도 마피아로 보지 못한다", () => {
		// 짐승인간은 위장해서 안 잡히고, 건달은 애초에 시민이라 잡을 것이 없다.
		// 경찰이 "마피아입니다"를 듣는 상대는 진짜 마피아 진영뿐이어야 한다
		const police = seat(1, Role.POLICE);
		assert.match(resolveNightSelect(police, seat(2, Role.BEAST)).label, /시민입니다/);
		assert.match(resolveNightSelect(police, seat(3, Role.THUG)).label, /시민입니다/);
	});
```

`tests/domain.test.ts:532-539`의 스파이 테스트도 이름과 주석을 고친다.

```ts
	it("스파이가 건달을 찾아도 합류하지 않는다", () => {
		// 건달은 시민이다. 스파이가 합류할 마피아 진영이 아니다
		const spy = seat(1, Role.SPY);
		const result = resolveNightSelect(spy, seat(2, Role.THUG));
		assert.notEqual(result.joinedMafia, true);
	});
```

- [ ] **Step 10: 통과를 확인한다**

```bash
npm test
```

Expected: 전부 PASS.

- [ ] **Step 11: 첫 밤 무사 판정의 실패 테스트를 쓴다**

`tests/deck.test.ts` 맨 아래에 덧붙인다. 임포트 줄도 함께 늘린다.

```ts
import { isPeacefulNight } from "../src/domain/NightResolution.ts";
import { FIRST_NIGHT_PEACEFUL_UP_TO } from "../src/constants/GameConfig.ts";
```

```ts
describe("첫 밤 무사", () => {
	it("8인 이하 판의 첫 밤에는 아무도 죽지 않는다", () => {
		for (let count = MIN_PLAYERS; count <= FIRST_NIGHT_PEACEFUL_UP_TO; count++) {
			assert.equal(isPeacefulNight(1, count), true, `${count}인`);
		}
	});

	it("9인부터는 첫 밤에도 사람이 죽는다", () => {
		for (let count = FIRST_NIGHT_PEACEFUL_UP_TO + 1; count <= MAX_PLAYERS; count++) {
			assert.equal(isPeacefulNight(1, count), false, `${count}인`);
		}
	});

	it("둘째 밤부터는 인원과 무관하게 죽는다", () => {
		assert.equal(isPeacefulNight(2, MIN_PLAYERS), false);
		assert.equal(isPeacefulNight(3, FIRST_NIGHT_PEACEFUL_UP_TO), false);
	});
});
```

- [ ] **Step 12: 실패를 확인한다**

```bash
npm test
```

Expected: FAIL — `isPeacefulNight` is not a function.

- [ ] **Step 13: `isPeacefulNight`를 구현한다**

`src/domain/NightResolution.ts` 파일 끝에 추가한다. 임포트도 함께 늘린다.

```ts
import { FIRST_NIGHT_PEACEFUL_UP_TO } from "../constants/GameConfig.ts";
```

```ts
/**
 * 이번 밤이 "아무도 죽지 않는 밤"인가.
 *
 * nightNumber는 정산이 끝난 뒤의 밤 번호다(첫 밤이 1). 호출부가 turnCount를
 * 올린 다음에 묻는다.
 *
 * 작은 판에서 첫 밤 사망은 정보가 아니라 손실이다 — 죽은 사람은 한 마디도
 * 못 했으므로 남은 사람이 그 사람에 대해 아는 것이 없고, 추리가 시작되기
 * 전에 인원만 줄어든다.
 */
export function isPeacefulNight(nightNumber: number, playerCount: number): boolean {
	return nightNumber === 1 && playerCount <= FIRST_NIGHT_PEACEFUL_UP_TO;
}
```

- [ ] **Step 14: `resolveNight`에 가드를 넣는다**

`src/services/Night.ts:296-302`. **`resolveNightCasualties` 앞에 서야 한다** — 그 함수는 공격받은 좌석의 `armored`를 소모하므로(`NightResolution.ts:229-234`), 뒤에 두면 군인의 방탄이 첫 밤에 사라진다. 기자의 특종은 계속 나가야 하므로 `publishScoops`는 호출하고 돌아간다.

```ts
export function resolveNight(room: Room): void {
	room.turnCount++;
	// 아침 화면이 읽을 밤 기록. kill()이 사망 한 줄씩 채워 넣는다
	room.nightReport = [];

	// 첫 밤 무사는 사망 정산보다 앞이다. resolveNightCasualties는 공격받은
	// 좌석의 방탄을 소모하므로, 뒤에 두면 군인이 죽지도 않은 채 방탄만 잃는다.
	// attackedBy는 그대로 남지만 다음 밤 시작의 resetRound가 비운다.
	if (isPeacefulNight(room.turnCount, room.total)) {
		report(room, "✨ 이번 밤에 아무도 죽지 않았습니다.");
		publishScoops(room);
		return;
	}

	const casualties = resolveNightCasualties(room.seats);
```

임포트에 `isPeacefulNight`를 더한다 (`resolveNightCasualties`를 가져오는 같은 줄).

- [ ] **Step 15: 밤 위젯에 고지를 붙인다**

`src/services/Night.ts:109` 바로 아래에 넣는다. 고지가 없으면 마피아는 지목이 먹히지 않았다고 오해하고, 시민은 아침에 시체가 없는 이유를 모른다.

```ts
	Chat.say(room, `🌙 ${room.turnCount + 1}번째 밤이 되었습니다.`);
	// 첫 밤 무사를 알리지 않으면 마피아는 자기 지목이 실패했다고 믿고,
	// 시민은 의사가 막은 줄 안다. 양쪽 다 없는 정보를 추리에 넣게 된다.
	// 시민 팀에게도 같은 줄을 보낸다 — 숨길 규칙이 아니다
	if (isPeacefulNight(room.turnCount + 1, room.total)) {
		// 채팅 위젯은 마크다운을 렌더하지 않는다 (chat.html의 bubble()이 html
		// 태그 함수로 이스케이프한다). 강조 표시를 넣으면 별표가 글자 그대로 보인다
		Chat.say(room, "🌙 첫 밤에는 아무도 죽지 않습니다. 팀을 확인하고 대상을 익혀 두세요.");
	}
```

- [ ] **Step 16: 첫 밤 무사 통합 테스트를 쓴다**

`tests/gameflow.test.ts`의 밤 관련 `describe` 안에 덧붙인다.

```ts
	it("6인 판의 첫 밤에는 아무도 죽지 않는다", () => {
		const players = startGame(6, 1, [
			Role.MAFIA, Role.DOCTOR, Role.POLICE, Role.CITIZEN, Role.CITIZEN, Role.CITIZEN,
		]);
		const mafia = seatsWithRole(room(1), Role.MAFIA)[0];
		send(playerOf(mafia), { type: "night-select", target: 4 });
		finishPhase(GamePhase.NIGHT);

		assert.equal(room(1).seats.filter(s => !s.alive).length, 0);
		assert.ok(chatSaw(players[0], "아무도 죽지 않았습니다"));
	});

	it("첫 밤 무사여도 군인의 방탄은 남는다", () => {
		startGame(6, 1, [
			Role.MAFIA, Role.DOCTOR, Role.POLICE, Role.SOLDIER, Role.CITIZEN, Role.CITIZEN,
		]);
		const soldier = seatsWithRole(room(1), Role.SOLDIER)[0];
		const mafia = seatsWithRole(room(1), Role.MAFIA)[0];
		send(playerOf(mafia), { type: "night-select", target: soldier.index });
		finishPhase(GamePhase.NIGHT);

		// 방탄을 소모했다면 군인은 다음 밤에 그냥 죽는다
		assert.equal(soldier.armored, true);
	});
```

`send`의 정확한 payload 형태는 `tests/gameflow.test.ts`의 기존 밤 지목 테스트를 그대로 따른다. 필요한 헬퍼(`seatsWithRole`, `playerOf`, `send`, `finishPhase`, `chatSaw`)는 전부 `tests/helpers/Harness.ts`에 이미 있다.

- [ ] **Step 17: 통과를 확인한다**

```bash
npm test
```

Expected: 전부 PASS.

- [ ] **Step 18: 계측 자리에 주석을 남긴다**

`src/services/Outcome.ts`의 `finish` 안, `room.winner = winner;`(`:42`) 바로 아래에 넣는다. 저장할 곳이 없어 계측을 붙이지 않았다는 사실과, 붙일 때 필요한 것을 남긴다.

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

- [ ] **Step 19: 전체 검증**

```bash
npm run verify
```

Expected: 5단계(type-check, lint, check:zep, test, check:ui) 전부 통과. `MAFIA_RATIO`를 지웠으므로 남은 참조가 있으면 `type-check`에서 잡힌다.

- [ ] **Step 20: 커밋**

```bash
git add src/constants/GameConfig.ts src/domain/RoleAssignment.ts src/domain/Roles.ts src/domain/NightResolution.ts src/services/Night.ts src/services/Outcome.ts tests/deck.test.ts tests/domain.test.ts tests/gameflow.test.ts
git commit -m "fix(balance): replace mafia ratio with per-count table, restore thug to citizens

6인 판의 마피아가 2명이라 첫 투표 전에 이미 기울어 있었다. 인원표로 바꿔
4~6인 1명으로 내린다. 건달은 원래 시민 편인데 마피아 팀에 들어가 있어
경찰 조사가 거짓 양성을 냈다. 8인 이하 판은 첫 밤에 아무도 죽지 않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 21: 배포하고 한 가지를 관찰한다**

이 슬라이스를 배포한 뒤(방이 빈 시각에 `res/main.js` 업로드), **재배포가 정말 진행 중인 방 상태를 초기화하는지 한 번 확인한다.** 이후 여섯 번의 배포 계획이 전부 이 가정 위에 서 있다. 결과를 스펙 §1.4에 한 줄로 적어 둔다.

---

## Task 2: `RuleSet` 도입 + 속도전 · 침묵전

모드 하나를 추가하는 비용을 객체 리터럴 하나로 만들고, 그 자리에서 모드 두 개를 낸다. **이 태스크의 핵심 성공 기준은 회귀 없음이다** — 1~5번 방(표준전)의 관측 동작이 한 톨도 바뀌면 안 된다. 값은 그대로 옮기고, 읽는 경로만 바꾼다.

**Files:**
- Create: `src/domain/RuleSet.ts`
- Modify: `src/constants/GameConfig.ts:39-70` (`TIMING` 이사), `MAFIA_TEAM_SIZE`·`FIRST_NIGHT_PEACEFUL_UP_TO` 이사
- Modify: `src/types/Game.types.ts:198-278` (`Room.ruleSet`)
- Modify: `src/entities/Room.ts:24-46`
- Modify: `src/services/GameFlow.ts:108`, `:138`, `:261`, `:270`
- Modify: `src/services/Night.ts:90`
- Modify: `src/services/Voting.ts:33-34`, `:105`, `:253`
- Modify: `src/services/Outcome.ts:40`
- Modify: `src/domain/RoleAssignment.ts` (시그니처)
- Modify: `src/domain/NightResolution.ts` (`isPeacefulNight` 시그니처)
- Modify: `src/domain/chat/ChatPermission.ts:30-89`, `:116-146`
- Modify: `src/domain/chat/QuickPhrases.ts:32-41`
- Modify: `src/services/ChatService.ts:94-115`, `:124-138`, `:204-227`, `:441-488`
- Modify: `src/services/Lobby.ts:200-241`
- Modify: `tests/domain.test.ts`, `tests/deck.test.ts`, `tests/gameflow.test.ts` (기계적 치환)
- Test: `tests/ruleset.test.ts` (신규)

**Interfaces:**
- Consumes: Task 1의 `MAFIA_TEAM_SIZE`(값이 `STANDARD_RULES.deck.mafiaTeamSize`로 이사), `FIRST_NIGHT_PEACEFUL_UP_TO`(→ `RuleSet.firstNightPeacefulUpTo`), `isPeacefulNight`.
- Produces:
  - `interface Timing` — 9개 숫자 필드: `START_COUNTDOWN`, `ROLE_REVEAL`, `NIGHT`, `DAY_PER_ALIVE`, `DAY_MAX`, `VOTE`, `VOTE_RESULT`, `GAME_OVER`, `TICK_TOCK_AT`.
  - `interface DeckSpec` — `mafiaTeamSize`, `leadPool`, `mafiaPool`, `citizenRequired`, `citizenPool`, `exclusiveGroups`, `minPlayers`.
  - `type ChatMode = "free" | "phrasesOnly"`.
  - `interface RuleSet` — `id`, `displayName`, `summary`, `timing`, `deck`, `firstNightPeacefulUpTo`, `minPlayers`, `maxPlayers`, `chatMode`.
  - `STANDARD_RULES` / `BLITZ_RULES` / `SILENCE_RULES`, `rulesForRoom(num: number): RuleSet` — 전부 `src/domain/RuleSet.ts`.
  - `Room.ruleSet: RuleSet`.
  - `mafiaCount(deck: DeckSpec, playerCount: number): number`
  - `buildRoleDeck(deck: DeckSpec, playerCount: number, rng?: () => number): Role[]`
  - `isPeacefulNight(nightNumber: number, playerCount: number, peacefulUpTo: number): boolean`
  - `ChannelAccess.freeText: boolean` — `true`면 자유 입력, `false`면 준비된 문구만.
  - `ChatContext.chatMode: ChatMode`

- [ ] **Step 1: 규칙 세트 테스트를 쓴다**

`tests/ruleset.test.ts`를 새로 만든다. `STANDARD_RULES.timing`이 이동 전 값과 같은지 확인하는 것이 이 슬라이스의 안전벨트다 — 값을 손으로 적어 두면 나중에 누군가 "정리"하다 바꿔도 걸린다.

```ts
/**
 * 규칙 세트 테스트.
 *
 * 표준전은 이동 전 상수와 값이 같아야 한다. 여기 적힌 숫자는 옮기기 전
 * GameConfig.TIMING에 있던 값 그대로다 — 상수를 참조하면 "같이 틀리는"
 * 테스트가 되므로 일부러 리터럴로 박아 둔다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role } from "../src/types/Game.types.ts";
import {
	BLITZ_RULES,
	rulesForRoom,
	SILENCE_RULES,
	STANDARD_RULES,
} from "../src/domain/RuleSet.ts";
import { MAX_PLAYERS, ROOM_COUNT } from "../src/constants/GameConfig.ts";

describe("표준전", () => {
	it("타이밍이 이동 전 값과 같다", () => {
		assert.deepEqual(STANDARD_RULES.timing, {
			START_COUNTDOWN: 10,
			ROLE_REVEAL: 9,
			NIGHT: 22,
			DAY_PER_ALIVE: 10,
			DAY_MAX: 60,
			VOTE: 17,
			VOTE_RESULT: 7,
			GAME_OVER: 16,
			TICK_TOCK_AT: 9,
		});
	});

	it("인원표가 이동 전 값과 같다", () => {
		assert.deepEqual(
			STANDARD_RULES.deck.mafiaTeamSize,
			[0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3]
		);
	});

	it("첫 밤 무사 문턱이 8이다", () => {
		assert.equal(STANDARD_RULES.firstNightPeacefulUpTo, 8);
	});
});

describe("속도전", () => {
	it("한 판이 표준전의 절반 이하로 끝난다", () => {
		// 6인 기준 한 라운드(밤+낮+투표+개표)의 길이를 비교한다.
		// 낮은 DAY_PER_ALIVE * 생존자와 DAY_MAX 중 작은 쪽이다
		const round = (rules: typeof STANDARD_RULES, alive: number): number => {
			const day = Math.min(rules.timing.DAY_PER_ALIVE * alive, rules.timing.DAY_MAX);
			return rules.timing.NIGHT + day + rules.timing.VOTE + rules.timing.VOTE_RESULT;
		};
		assert.ok(round(BLITZ_RULES, 6) * 2 <= round(STANDARD_RULES, 6));
	});

	it("직업 풀이 다섯 개뿐이다", () => {
		// 마피아·의사·경찰·군인 + 나머지를 채우는 시민
		assert.deepEqual(BLITZ_RULES.deck.leadPool, [Role.MAFIA]);
		assert.deepEqual(BLITZ_RULES.deck.mafiaPool, [Role.MAFIA]);
		assert.deepEqual(BLITZ_RULES.deck.citizenRequired, [Role.DOCTOR, Role.POLICE]);
		assert.deepEqual(BLITZ_RULES.deck.citizenPool, [Role.SOLDIER]);
	});

	it("인원표에 0이 남아 있지 않다", () => {
		// 정원(8) 밖은 도달 경로가 없지만, 0을 두면 그 칸을 읽었을 때 마피아
		// 0명 판이 되어 시작하자마자 시민 승리가 난다. 8인 값을 반복한다
		for (let count = BLITZ_RULES.minPlayers; count <= MAX_PLAYERS; count++) {
			assert.ok(BLITZ_RULES.deck.mafiaTeamSize[count] > 0, `${count}인`);
		}
	});
});

describe("침묵전", () => {
	it("8인 이상 전용이고 첫 밤 무사가 꺼져 있다", () => {
		assert.equal(SILENCE_RULES.minPlayers, 8);
		assert.equal(SILENCE_RULES.maxPlayers, 12);
		// 0은 "조건에 안 걸린다"가 아니라 "끄기로 했다"는 표시다
		assert.equal(SILENCE_RULES.firstNightPeacefulUpTo, 0);
	});

	it("채팅 방식만 표준전과 다르다", () => {
		assert.equal(SILENCE_RULES.chatMode, "phrasesOnly");
		assert.deepEqual(SILENCE_RULES.timing, STANDARD_RULES.timing);
		assert.deepEqual(SILENCE_RULES.deck, STANDARD_RULES.deck);
	});
});

describe("방 배정", () => {
	it("배정표대로 나뉜다", () => {
		const expected = [
			"standard", "standard", "standard", "standard", "standard",
			"blitz", "blitz", "silence",
		];
		for (let num = 1; num <= ROOM_COUNT; num++) {
			assert.equal(rulesForRoom(num).id, expected[num - 1], `${num}번 방`);
		}
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test
```

Expected: FAIL — `src/domain/RuleSet.ts`가 없다.

- [ ] **Step 3: `src/domain/RuleSet.ts`를 만든다**

`GameConfig.ts`에 있던 긴 주석들도 함께 옮긴다 — 값이 왜 그 값인지는 값과 같은 자리에 있어야 한다.

```ts
/**
 * 모드 하나가 바꾸는 것 전부.
 *
 * 기존에는 타이밍이 GameConfig.TIMING에, 덱 구성이 RoleAssignment의 모듈
 * 상수에, 인원 한계가 또 GameConfig에 있었다. 모드를 하나 만들려면 세 파일을
 * 고치면서 "표준전일 때는 원래대로"라는 분기를 세 벌 넣어야 했고, 그 분기가
 * 서로 어긋나면 어긋난 채로 돌아갔다.
 *
 * 값 하나로 묶으면 모드 추가는 리터럴 하나이고, 되돌리기는 배정표 한 줄이다.
 *
 * 함수를 담지 않는다. "인원에 따라 마피아 수를 계산하는 함수"를 넣으면
 * 모드마다 로직이 갈라져 어느 모드가 무엇을 하는지 읽어서는 알 수 없게 된다.
 * 인원별 값은 배열로 적는다 — 표는 눈으로 읽힌다.
 */
import { Role } from "../types/Game.types.ts";

export interface Timing {
	/** 전원 준비 완료 후 게임 시작까지(초) */
	readonly START_COUNTDOWN: number;
	/**
	 * 직업 카드 확인 시간(초).
	 *
	 * 기존 값은 0.1초여서 자기 직업을 읽을 시간이 없었다. 5초로 늘렸지만
	 * 그때 카드는 그림 한 장이었다. 지금은 직업명·능력·요령 세 줄을 읽고
	 * 그것으로 첫 밤을 보내야 하므로, 읽는 데 걸리는 시간에 맞춘다.
	 */
	readonly ROLE_REVEAL: number;
	/** 밤 지속 시간(초) */
	readonly NIGHT: number;
	/** 낮 토론: 생존자 1명당 부여되는 시간(초) */
	readonly DAY_PER_ALIVE: number;
	/** 낮 토론 최대 시간(초) */
	readonly DAY_MAX: number;
	/** 투표 시간(초) */
	readonly VOTE: number;
	/** 투표 결과 공개 시간(초) */
	readonly VOTE_RESULT: number;
	/**
	 * 승패 연출 후 대기실 복귀까지(초).
	 *
	 * 5초는 결과 화면이 이미지 한 장이던 시절의 값이다. 이제 전원의 정체가
	 * 최대 MAX_PLAYERS줄로 공개되는데, "쟤가 마피아였어?"를 확인하는 이 순간이
	 * 다음 판을 시작하게 만드는 지점이다. 12줄을 읽을 시간을 준다.
	 */
	readonly GAME_OVER: number;
	/** 남은 시간이 이 값 아래로 내려가면 째깍 사운드 재생(초) */
	readonly TICK_TOCK_AT: number;
}

export interface DeckSpec {
	/**
	 * 참가 인원별 마피아 진영 인원. index가 곧 참가 인원이다.
	 *
	 * 길이는 항상 MAX_PLAYERS + 1로 맞춘다. 정원이 더 작은 모드도 남는 칸을
	 * 비우지 말고 정원 값을 반복한다 — 0을 넣으면 만에 하나 그 칸을 읽었을 때
	 * 마피아 0명 판이 되어 시작하자마자 시민 승리가 난다.
	 */
	readonly mafiaTeamSize: readonly number[];
	/** 마피아 진영 첫 자리 후보. 비면 Role.MAFIA를 쓴다 */
	readonly leadPool: readonly Role[];
	/** 둘째 자리부터의 후보 */
	readonly mafiaPool: readonly Role[];
	/** 반드시 들어가는 시민 능력자 */
	readonly citizenRequired: readonly Role[];
	/** 남는 시민 자리 일부에 뽑히는 후보 */
	readonly citizenPool: readonly Role[];
	/** 같은 판에 함께 들어갈 수 없는 묶음 */
	readonly exclusiveGroups: readonly (readonly Role[])[];
	/**
	 * 그 직업이 등장하기 시작하는 최소 참가 인원.
	 *
	 * Partial인 이유는 타입 설정이다. 이 프로젝트는
	 * noUncheckedIndexedAccess를 켜지 않아 인덱스 시그니처 접근이
	 * `number`로 좁혀진다 — 그러면 `floor !== undefined` 비교가 타입
	 * 오류가 된다. Partial<Record<>>는 값을 `number | undefined`로 주므로
	 * "적히지 않은 직업"을 코드가 다룰 수 있다.
	 */
	readonly minPlayers: Partial<Record<Role, number>>;
}

/** 낮에 자유롭게 말할 수 있는가, 준비된 문구만 쓸 수 있는가 */
export type ChatMode = "free" | "phrasesOnly";

export interface RuleSet {
	/** 코드가 분기하거나 집계에 쓰는 식별자 */
	readonly id: string;
	/** 화면에 나가는 이름 */
	readonly displayName: string;
	/** 화면에 나가는 한 줄 설명 */
	readonly summary: string;
	readonly timing: Timing;
	readonly deck: DeckSpec;
	/** 몇 인 판까지 첫 밤에 아무도 죽지 않는가. 0이면 끔 */
	readonly firstNightPeacefulUpTo: number;
	readonly minPlayers: number;
	readonly maxPlayers: number;
	readonly chatMode: ChatMode;
}

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

/**
 * 속도전. 초보 유입용 3분 단판.
 *
 * 낮 25초는 DAY_MAX만 25로 두면 인원과 무관하게 항상 25가 되므로
 * DAY_PER_ALIVE를 5로 낮춰 소인원에서 더 짧아지게 했다(4인 20초, 6인 25초).
 *
 * 짐승인간을 넣지 않았다 — 이 모드의 목적은 경찰의 확정 정보를 남겨
 * "조사해서 잡는다"는 기본 흐름을 배우게 하는 것이다.
 */
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

/**
 * 침묵전. 표현 수단을 좁혀 모든 발언을 무겁게 만든다.
 *
 * 문구에 번호를 넣지 않는다 — 12명 × 문구 종류만큼 칩이 늘어난다.
 * 대신 지목 수단은 두 가지다: 낮 투표와 맵 위의 위치. ZEP은 캐릭터가
 * 실제로 맵에 서 있으므로, 의심하는 사람 옆으로 걸어가는 것이 발언이 된다.
 * 이쪽이 이 모드의 핵심이고 개발 비용이 0이다.
 *
 * 마피아 밀담과 유령 채널은 제한하지 않는다. 목적은 낮 토론을 좁히는
 * 것이고, 밀담까지 좁히면 마피아가 협의를 못 해 시민 쪽으로 기운다.
 */
export const SILENCE_RULES: RuleSet = {
	id: "silence",
	displayName: "침묵전",
	summary: "정형 문구만. 말이 아니라 자리로 말한다",
	timing: STANDARD_RULES.timing,
	deck: STANDARD_RULES.deck,
	// 8인 이상 전용이라 애초에 첫 밤 무사 조건에 걸리지 않는다.
	// 0으로 명시해 "조건에 안 걸린다"와 "끄기로 했다"를 구분한다
	firstNightPeacefulUpTo: 0,
	minPlayers: 8,
	maxPlayers: 12,
	chatMode: "phrasesOnly",
};

/**
 * 방 번호로 모드를 고른다. createRoom에서 한 번 부르고, 게임 중 바뀌지 않는다.
 *
 * 되돌리기는 이 함수 한 줄이다. 모드 하나가 문제면 그 방을 STANDARD_RULES로
 * 되돌리고 리터럴은 남겨 둔다.
 */
export function rulesForRoom(num: number): RuleSet {
	if (num === 8) return SILENCE_RULES;
	if (num >= 6) return BLITZ_RULES;
	return STANDARD_RULES;
}

// 모드별 집계 제외 플래그(ranked 같은 것)는 넣지 않았다. 시즌 1의 세 모드는
// 전부 집계 대상이고, 계측 자체가 없다. 집계에서 빼야 할 모드(연습·이벤트)가
// 생기는 시점에 그때 필요한 형태로 넣는 편이 낫다.
```

- [ ] **Step 4: `GameConfig.ts`에서 이사한 값을 지운다**

`src/constants/GameConfig.ts`에서 `TIMING`(`:39-70`), `MAFIA_TEAM_SIZE`, `FIRST_NIGHT_PEACEFUL_UP_TO` 세 블록을 주석과 함께 삭제한다. `ROOM_COUNT`, `MIN_PLAYERS`, `MAX_PLAYERS`, `MAX_SPECTATORS`, `KICK`, `CHAT_RATE`, `ACTION_RATE`, `FAULT_REPORT_RATE`, `POLITICIAN_VOTE_WEIGHT`, `CITIZENS_PER_NIGHT_KILL`, `SPECIAL_CITIZEN_RATIO`, `MIN_PLAIN_CITIZENS`, `MIN_SPECIAL_CITIZENS`, `ADMIN_*`, `CCU_*`는 **남긴다**.

`CITIZENS_PER_NIGHT_KILL` · `SPECIAL_CITIZEN_RATIO` · `MIN_*_CITIZENS`는 논리적으로 `DeckSpec`에 속하지만 이 슬라이스에서는 옮기지 않는다 — 세 모드가 전부 같은 값을 쓰므로 옮기면 리터럴 세 곳에 같은 숫자가 중복된다.

- [ ] **Step 5: `Room`에 룰셋을 붙인다**

`src/types/Game.types.ts`의 임포트에 한 줄 더한다. **`import type`이어야 한다** — `RuleSet.ts`가 이 파일의 `Role`을 값으로 쓰므로, 값 임포트면 순환이 된다. `isolatedModules`가 타입 임포트를 지우므로 런타임에는 관계가 없다.

```ts
import type { RuleSet } from "../domain/RuleSet.ts";
```

`Room` 인터페이스(`:198`)의 `startPoint` 바로 아래에 필드를 추가한다.

```ts
	/**
	 * 이 방이 쓰는 규칙. 방이 만들어질 때 정해지고 바뀌지 않는다.
	 *
	 * 방에 매달아 두는 이유는 전역 상수를 읽던 코드가 전부 room을 이미
	 * 들고 있기 때문이다 — 인자를 새로 넘길 필요 없이 참조만 바꾸면 된다.
	 */
	readonly ruleSet: RuleSet;
```

- [ ] **Step 6: `createRoom`이 룰셋을 고르게 한다**

`src/entities/Room.ts:17` 아래에 임포트를 더하고,

```ts
import { rulesForRoom } from "../domain/RuleSet.ts";
```

`createRoom`(`:24-46`)의 `startPoint` 다음 줄에 넣는다.

```ts
		startPoint: roomOrigin(num),
		ruleSet: rulesForRoom(num),
```

- [ ] **Step 7: 서비스 네 곳의 `TIMING`을 치환한다**

전부 `room`을 이미 들고 있으므로 참조만 바꾼다. **`src/services/Outcome.ts:40`을 빠뜨리지 않는다** — 스펙 치환표에서 누락된 자리다.

| 파일:줄 | 전 | 후 |
|---|---|---|
| `src/services/GameFlow.ts:108` | `TIMING.START_COUNTDOWN` | `room.ruleSet.timing.START_COUNTDOWN` |
| `src/services/GameFlow.ts:138` | `TIMING.TICK_TOCK_AT` | `room.ruleSet.timing.TICK_TOCK_AT` |
| `src/services/GameFlow.ts:261` | `TIMING.ROLE_REVEAL` | `room.ruleSet.timing.ROLE_REVEAL` |
| `src/services/Night.ts:90` | `TIMING.NIGHT` | `room.ruleSet.timing.NIGHT` |
| `src/services/Voting.ts:33` | `TIMING.DAY_PER_ALIVE` | `room.ruleSet.timing.DAY_PER_ALIVE` |
| `src/services/Voting.ts:34` | `TIMING.DAY_MAX` | `room.ruleSet.timing.DAY_MAX` |
| `src/services/Voting.ts:105` | `TIMING.VOTE` | `room.ruleSet.timing.VOTE` |
| `src/services/Voting.ts:253` | `TIMING.VOTE_RESULT` | `room.ruleSet.timing.VOTE_RESULT` |
| `src/services/Outcome.ts:40` | `TIMING.GAME_OVER` | `room.ruleSet.timing.GAME_OVER` |

`dayDuration`(`Voting.ts:32-35`)은 인자가 `room`인지 확인한다 — 아니면 `room`을 받도록 시그니처를 바꾸고 호출부를 따라 고친다. 네 파일 모두에서 `TIMING` 임포트를 지운다 (`noUnusedLocals`가 남은 것을 잡아준다).

`src/services/Cards.ts:51`과 `src/services/Cut.ts:56`은 주석 안의 언급이라 코드가 아니다. 문구가 "TIMING.ROLE_REVEAL"을 가리키면 "룰셋의 ROLE_REVEAL"로 다듬는다.

- [ ] **Step 8: 덱 구성기가 `DeckSpec`을 받게 한다**

`src/domain/RoleAssignment.ts`. 모듈 상수 `MAFIA_LEAD` · `MAFIA_POOL` · `CITIZEN_REQUIRED` · `CITIZEN_POOL`을 지우고(주석은 `RuleSet.ts`의 리터럴 옆으로 옮겼다), `MAFIA_TEAM_SIZE` 임포트도 지운다.

```ts
import type { DeckSpec } from "./RuleSet.ts";
```

```ts
/**
 * 그 인원 판의 마피아 진영 인원. 표를 그대로 읽는다.
 *
 * 정원 밖(테스트가 정원 + 2까지 부른다)은 마지막 칸으로 자른다.
 */
export function mafiaCount(deck: DeckSpec, playerCount: number): number {
	const last = deck.mafiaTeamSize.length - 1;
	return deck.mafiaTeamSize[playerCount > last ? last : playerCount];
}
```

`buildRoleDeck`의 시그니처와 본문 앞머리를 바꾼다. 나머지 본문은 그대로 두고 상수 이름만 `deck.*`로 바꾼다 — **`deck`이라는 지역 변수가 이미 있으므로 인자 이름과 충돌한다.** 지역 변수를 `roles`로 바꾼다.

```ts
export function buildRoleDeck(
	spec: DeckSpec,
	playerCount: number,
	rng: () => number = Math.random
): Role[] {
	const mafia = mafiaCount(spec, playerCount);
	const citizenSlots = playerCount - mafia;
	const roles: Role[] = [spec.leadPool.length > 0 ? spec.leadPool[0] : Role.MAFIA];

	const affordsLoneKiller = nightKillBudget(citizenSlots) > 1;
	const mafiaPool = affordsLoneKiller
		? spec.mafiaPool
		: spec.mafiaPool.filter(role => !killsIndependently(role));
	for (const role of draw(mafiaPool.slice(), mafia - 1, rng)) roles.push(role);
	// ... 이하 기존 본문에서 CITIZEN_REQUIRED → spec.citizenRequired,
	//     CITIZEN_POOL → spec.citizenPool, deck.push → roles.push,
	//     deck.length → roles.length 로 치환. 마지막 줄은 shuffle(roles, rng).
}
```

`leadPool`을 무작위로 고르는 것은 **Task 3의 일이다.** 여기서는 첫 칸을 그대로 쓴다 — 표준전·속도전 모두 `[Role.MAFIA]` 하나뿐이라 동작이 이동 전과 같다.

- [ ] **Step 9: 호출부 둘을 고친다**

`src/services/GameFlow.ts:270`:

```ts
	const deck = buildRoleDeck(room.ruleSet.deck, room.seats.length);
```

`src/domain/NightResolution.ts`의 `isPeacefulNight`은 이제 문턱을 인자로 받는다. `FIRST_NIGHT_PEACEFUL_UP_TO` 임포트를 지운다.

```ts
export function isPeacefulNight(
	nightNumber: number,
	playerCount: number,
	peacefulUpTo: number
): boolean {
	return nightNumber === 1 && playerCount <= peacefulUpTo;
}
```

`src/services/Night.ts`의 두 호출부에 `room.ruleSet.firstNightPeacefulUpTo`를 넘긴다.

```ts
	if (isPeacefulNight(room.turnCount, room.total, room.ruleSet.firstNightPeacefulUpTo)) {
```

```ts
	if (isPeacefulNight(room.turnCount + 1, room.total, room.ruleSet.firstNightPeacefulUpTo)) {
```

- [ ] **Step 10: 테스트 호출부를 기계적으로 치환한다**

**단언은 한 줄도 바꾸지 않는다.** 값이 같으므로 통과/실패가 바뀔 수 없다. 이름과 인자만 바꾼다.

- `tests/domain.test.ts`: `buildRoleDeck(` 9곳(`:115`, `:130`, `:155`, `:168`, `:187`, `:219`, `:299`, `:318` 및 그 주변) → `buildRoleDeck(STANDARD_RULES.deck, `. `mafiaCount(` 5곳(`:131`, `:142`×2, `:143`, `:204`) → `mafiaCount(STANDARD_RULES.deck, `. 임포트 한 줄 추가.
- `tests/deck.test.ts`: 같은 치환. `MAFIA_TEAM_SIZE` → `STANDARD_RULES.deck.mafiaTeamSize`, `FIRST_NIGHT_PEACEFUL_UP_TO` → `STANDARD_RULES.firstNightPeacefulUpTo`, `isPeacefulNight(n, count)` → `isPeacefulNight(n, count, STANDARD_RULES.firstNightPeacefulUpTo)`.
- `tests/gameflow.test.ts`: `TIMING.` 5곳(`:82`, `:270`, `:764`, `:774`, `:783`) → `STANDARD_RULES.timing.`. 이 테스트들은 전부 1번 방을 쓰므로 값이 같다.

```ts
import { STANDARD_RULES } from "../src/domain/RuleSet.ts";
```

- [ ] **Step 11: 여기까지 통과를 확인한다**

```bash
npm run verify
```

Expected: 전부 통과. **이 시점에서 실패하는 단언이 하나라도 있으면 순수 이동이 아니었다는 뜻이다** — 값을 되돌리고 원인을 찾는다. 침묵전 채팅은 아직 손대지 않았다.

- [ ] **Step 12: 침묵전 잠금의 실패 테스트를 쓴다**

`tests/ruleset.test.ts`에 덧붙인다. `ChatContext`를 직접 만들어 표만 확인한다 — 방을 돌릴 필요가 없다.

```ts
import { accessOf, LOOSE_CONTEXT } from "../src/domain/chat/ChatPermission.ts";
import { quickFor } from "../src/domain/chat/QuickPhrases.ts";
import { ChatChannel } from "../src/domain/chat/ChatChannel.ts";
import { GamePhase } from "../src/types/Game.types.ts";
```

```ts
describe("침묵전의 낮", () => {
	const silentDay = {
		...LOOSE_CONTEXT,
		seated: true,
		started: true,
		phase: GamePhase.DAY,
		chatMode: "phrasesOnly" as const,
	};

	it("쓸 수는 있지만 자유 입력은 막힌다", () => {
		const access = accessOf(silentDay, ChatChannel.ROOM);
		// write까지 막으면 빠른 문구 버튼도 같이 죽는다 — 버튼도 같은
		// 전송 경로를 탄다. 막는 것은 자유 입력(freeText)이다
		assert.equal(access.write, true);
		assert.equal(access.freeText, false);
		assert.equal(access.note, "🤐 침묵전에서는 준비된 문구만 쓸 수 있습니다");
	});

	it("준비된 문구가 여덟 개 나온다", () => {
		assert.equal(quickFor(silentDay).length, 8);
		assert.ok(quickFor(silentDay).includes("의심됩니다"));
	});

	it("표준전 낮은 자유 입력이 열려 있다", () => {
		const freeDay = { ...silentDay, chatMode: "free" as const };
		assert.equal(accessOf(freeDay, ChatChannel.ROOM).freeText, true);
	});

	it("마피아 밀담은 침묵전에서도 자유롭다", () => {
		const silentNight = {
			...silentDay,
			phase: GamePhase.NIGHT,
			mafiaChat: true,
		};
		const access = accessOf(silentNight, ChatChannel.MAFIA);
		assert.equal(access.write, true);
		assert.equal(access.freeText, true);
	});
});
```

- [ ] **Step 13: 실패를 확인한다**

```bash
npm test
```

Expected: FAIL — `chatMode`가 `ChatContext`에 없고 `freeText`가 `ChannelAccess`에 없다.

- [ ] **Step 14: `ChatPermission.ts`에 `freeText`와 `chatMode`를 넣는다**

`ChatContext`(`:30-56`)의 `silenced` 아래에 필드를 더한다.

```ts
	/** 이 방의 채팅 방식. 침묵전이면 낮에 준비된 문구만 쓸 수 있다 */
	readonly chatMode: ChatMode;
```

임포트 한 줄:

```ts
import type { ChatMode } from "../RuleSet.ts";
```

`ChannelAccess`(`:58-69`)에 필드를 더한다.

```ts
	/**
	 * 자유롭게 타이핑할 수 있는가.
	 *
	 * write와 나눈 이유는 침묵전이다. "준비된 문구만"은 쓸 수 없는 상태가
	 * 아니라 쓸 수 있는 방식이 좁아진 상태다 — write를 false로 하면 빠른
	 * 문구 버튼까지 죽는다. 버튼도 자유 입력과 똑같은 전송 경로를 탄다.
	 *
	 * write=false면 이 값은 언제나 false다. 쓸 수 없는데 자유롭게 쓸 수는 없다.
	 */
	readonly freeText: boolean;
```

상수와 헬퍼(`:71-77`)를 고치고 하나 더한다.

```ts
const NONE: ChannelAccess = { read: false, write: false, note: "", freeText: false };
const OPEN: ChannelAccess = { read: true, write: true, note: "", freeText: true };

/** 읽을 수는 있지만 쓸 수 없는 상태. 이유를 반드시 적게 한다 */
function locked(note: string): ChannelAccess {
	return { read: true, write: false, note, freeText: false };
}

/** 쓸 수는 있지만 준비된 문구만. 이유는 입력창 자리에 그대로 나간다 */
function phrasesOnly(note: string): ChannelAccess {
	return { read: true, write: true, note, freeText: false };
}
```

`LOOSE_CONTEXT`(`:80-89`)에 기본값을 더한다.

```ts
	silenced: false,
	chatMode: "free",
```

ROOM 분기(`:144-145`)의 **밤 잠금 다음, `return OPEN` 앞**에 넣는다. 순서가 중요하다 — 앞에 두면 침묵전의 밤 잠금과 종료 후 개방이 뒤집힌다.

```ts
			if (ctx.phase === GamePhase.NIGHT) return locked("밤에는 방 채팅이 잠깁니다");
			// 침묵전. 낮 토론만 좁힌다 — 위 GAME_OVER·NIGHT 분기를 지난 뒤라야
			// 종료 후 복기와 밤 잠금이 원래대로 남는다
			if (ctx.chatMode === "phrasesOnly") {
				return phrasesOnly("🤐 침묵전에서는 준비된 문구만 쓸 수 있습니다");
			}
			return OPEN;
```

MAFIA·GHOST 분기는 건드리지 않는다.

- [ ] **Step 15: 침묵전 문구셋을 넣는다**

`src/domain/chat/QuickPhrases.ts:30` 아래에 배열을 더한다.

```ts
/**
 * 침묵전의 낮 문구.
 *
 * 번호를 넣지 않는다 — 12명 × 문구 종류만큼 칩이 늘어난다. 지목은 투표와
 * 맵 위의 위치로 한다.
 */
const QUICK_SILENCE_DAY: string[] = [
	"의심됩니다", "저는 시민입니다", "정보 있어요", "동의합니다",
	"반대합니다", "저를 믿어주세요", "오늘은 넘기죠", "잘 모르겠습니다",
];
```

`quickFor`의 DAY 분기(`:39`) 한 줄만 바꾼다. VOTE 분기는 특별 취급이 필요 없다 — 검증기가 `quickFor(ctx)` 자체를 읽으므로 그 단계의 문구가 곧 허용 목록이 된다.

```ts
	if (ctx.phase === GamePhase.DAY) {
		return ctx.chatMode === "phrasesOnly" ? QUICK_SILENCE_DAY : QUICK_DAY;
	}
```

- [ ] **Step 16: `ChatService`가 새 필드를 채우고 검증하게 한다**

`contextOf`(`:94-115`)의 `silenced` 다음 줄:

```ts
		chatMode: room.ruleSet.chatMode,
```

`spectatorContext`(`:124-138`)의 `silenced: false` 다음 줄. 관전자는 어차피 읽기 전용이지만 필드는 채워야 한다.

```ts
		chatMode: room.ruleSet.chatMode,
```

`channelViews`(`:224`)의 placeholder를 고친다. 준비된 문구만 쓸 수 있을 때도 이유를 보여줘야 한다.

```ts
			placeholder: access.write && access.freeText ? def.placeholder : `${access.note} (/도움말)`,
```

`submit`(`:456`) 뒤에 관문을 하나 더 세운다. 위젯은 조작할 수 있으므로 서버가 마지막 관문이다.

```ts
	if (!accessOf(ctx, channel).write) return;
	// 침묵전. 자유 입력이 막힌 채널에는 준비된 문구만 통과시킨다 —
	// 위젯이 입력창을 감춰도 조작된 클라이언트는 아무 문자열이나 보낸다
	if (!accessOf(ctx, channel).freeText && quickFor(ctx).indexOf(text) < 0) {
		label(sender, "🤐 준비된 문구만 보낼 수 있습니다.");
		return;
	}
```

`quickFor` 임포트를 더한다 (`switchChannel`이 이미 쓰고 있으면 그대로 둔다).

- [ ] **Step 17: 방 입구에 모드를 알린다**

`src/services/Lobby.ts`의 `joinRoom`, 입장 공지(`:225`) 다음 줄에 넣는다.

```ts
		Chat.notice(room, `🚪 ${name} 님이 입장했습니다.`);
		// 어느 규칙의 방인지 들어온 사람에게만 알린다. 온보딩 카드에 넣지 않은
		// 이유는 그 카드가 첫 판인 사람에게만 뜨고(needsGuide) 안내판 트리거에서도
		// 열려 방이 스코프에 없기 때문이다 — 거기 넣으면 거의 아무도 못 본다
		Chat.tell(player, `📋 ${room.ruleSet.displayName} — ${room.ruleSet.summary}`);
```

- [ ] **Step 18: 통합 확인**

```bash
npm run verify
```

Expected: 전부 통과. 실패하면 대개 `ChatContext`를 손으로 만드는 곳에 `chatMode`가 빠진 것이다 — `tests/chat.test.ts:63-75`의 `ctx()` 팩토리에 `chatMode: "free"`를 더한다. `rw(access)` 헬퍼(`:84`)는 `{read, write}`만 읽으므로 `freeText` 추가에 영향받지 않는다.

- [ ] **Step 19: 커밋**

```bash
git add src/domain/RuleSet.ts src/constants/GameConfig.ts src/types/Game.types.ts src/entities/Room.ts src/domain/RoleAssignment.ts src/domain/NightResolution.ts src/domain/chat/ChatPermission.ts src/domain/chat/QuickPhrases.ts src/services/ src/services/Lobby.ts tests/
git commit -m "feat(rules): add RuleSet with blitz and silence modes

타이밍·덱·인원 한계·채팅 방식을 값 하나로 묶는다. 모드 추가는 리터럴
하나, 되돌리기는 배정표 한 줄이다. 1~5번 방은 표준전, 6~7번 속도전,
8번 침묵전. 침묵전 잠금은 write가 아니라 freeText로 건다 — 빠른 문구
버튼이 자유 입력과 같은 전송 경로를 타기 때문이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `leadPool` + 배타 규칙 + `minPlayers`

6~9인 판에 은폐자를 공급할 자리를 만든다. 사기꾼(Task 6)이 들어올 때 배타 규칙이 이미 있어야 하므로 순서상 먼저다. `DeckSpec`은 Task 2에서 필드를 이미 갖고 있으므로 타입 변경이 없다 — `src/domain/RoleAssignment.ts` 하나와 `STANDARD_RULES.deck` 세 줄이 전부다.

**Files:**
- Modify: `src/domain/RoleAssignment.ts` (`buildRoleDeck` 본문 전체 + 헬퍼 셋 추가)
- Modify: `src/domain/RuleSet.ts` (`STANDARD_RULES.deck`의 `leadPool` · `exclusiveGroups` · `minPlayers`)
- Modify: `tests/domain.test.ts:147-159`
- Test: `tests/deck.test.ts` (추가)

**Interfaces:**
- Consumes: Task 2의 `DeckSpec`, `mafiaCount(deck, playerCount)`, `buildRoleDeck(spec, playerCount, rng?)`, `STANDARD_RULES`.
- Produces (전부 `src/domain/RoleAssignment.ts` 내부 — 외부 시그니처 변화 없음):
  - `allowedAt(pool, playerCount, floors): Role[]`
  - `withoutRivals(pool, taken, groups): Role[]`
  - `drawExclusive(pool, count, groups, rng): Role[]`

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/deck.test.ts`에 덧붙인다. 리드 다양성은 비율이 아니라 **도달 가능성**으로 본다 — 비율 밴드는 느리고 시드에 흔들린다.

```ts
import { STANDARD_RULES } from "../src/domain/RuleSet.ts";

const DECK = STANDARD_RULES.deck;

/** 결정적인 rng. 시드를 바꾸면 다른 판이 나온다 */
function rngFrom(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 1103515245 + 12345) % 2147483648;
		return state / 2147483648;
	};
}

describe("마피아 리드 선정", () => {
	it("6인 판은 마피아 리드와 짐승인간 리드가 둘 다 나온다", () => {
		let mafiaLead = 0;
		let beastLead = 0;
		for (let seed = 1; seed <= 200; seed++) {
			const deck = buildRoleDeck(DECK, 6, rngFrom(seed));
			if (deck.includes(Role.BEAST)) beastLead++;
			else mafiaLead++;
		}
		assert.ok(beastLead > 0, "짐승인간 리드가 한 번도 안 나왔다");
		assert.ok(mafiaLead > 0, "마피아 리드가 한 번도 안 나왔다");
	});

	it("7~9인 판에는 짐승인간이 나오지 않는다", () => {
		// 리드가 짐승인간이면 둘째 자리는 예산 때문에 마피아가 되고,
		// 그 마피아는 밀담에 혼자 앉는다. 팀원이 있는데 말을 걸 수 없다
		for (let count = 7; count <= 9; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				assert.ok(
					!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.BEAST),
					`${count}인 seed ${seed}`
				);
			}
		}
	});

	it("4~5인 판에는 짐승인간이 나오지 않는다", () => {
		for (let count = 4; count <= 5; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				assert.ok(!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.BEAST));
			}
		}
	});

	it("10~12인 판의 짐승인간은 최대 한 명이다", () => {
		for (let count = 10; count <= 12; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				const beasts = buildRoleDeck(DECK, count, rngFrom(seed))
					.filter(role => role === Role.BEAST).length;
				assert.ok(beasts <= 1, `${count}인 seed ${seed}: ${beasts}명`);
			}
		}
	});

	it("리드 후보가 전부 걸러져도 마피아가 리드가 된다", () => {
		const emptyLead = { ...DECK, leadPool: [] };
		const deck = buildRoleDeck(emptyLead, 8);
		assert.ok(deck.filter(role => ROLE_DEFS[role].team === Team.MAFIA).length > 0);
	});
});

describe("시민 풀 필터", () => {
	it("영매는 7인 이하 판에 나오지 않는다", () => {
		for (let count = MIN_PLAYERS; count <= 7; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				assert.ok(
					!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.SHAMAN),
					`${count}인 seed ${seed}`
				);
			}
		}
	});

	it("기자는 10인 이하 판에 나오지 않는다", () => {
		for (let count = MIN_PLAYERS; count <= 10; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				assert.ok(
					!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.REPORTER),
					`${count}인 seed ${seed}`
				);
			}
		}
	});

	it("배타 그룹의 두 직업이 한 덱에 함께 나오지 않는다", () => {
		for (const group of DECK.exclusiveGroups) {
			for (const count of EVERY_COUNT) {
				for (let seed = 1; seed <= 50; seed++) {
					const deck = buildRoleDeck(DECK, count, rngFrom(seed));
					const hits = group.filter(role => deck.includes(role)).length;
					assert.ok(hits <= 1, `${group.join("+")} ${count}인 seed ${seed}`);
				}
			}
		}
	});
});

describe("인원별 자리 수", () => {
	// SPECIAL_CITIZEN_RATIO가 정하는 값. 직업을 넣어도 뽑히는 자리가 늘지
	// 않으면 "넣었는데 안 보인다"가 된다
	const EXPECTED: Array<[number, number, number]> = [
		// [인원, 추첨 자리, 평민]
		[6, 2, 1],
		[8, 2, 2],
		[10, 3, 3],
		[12, 4, 3],
	];

	for (const [count, special, plain] of EXPECTED) {
		it(`${count}인 판은 추첨 ${special}자리 · 평민 ${plain}명`, () => {
			const deck = buildRoleDeck(DECK, count);
			const plains = deck.filter(role => role === Role.CITIZEN).length;
			const required = deck.filter(
				role => role === Role.DOCTOR || role === Role.POLICE
			).length;
			const mafia = deck.filter(role => ROLE_DEFS[role].team === Team.MAFIA).length;
			assert.equal(plains, plain);
			assert.equal(required, 2);
			assert.equal(deck.length - plains - required - mafia, special);
		});
	}
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test
```

Expected: FAIL — 6인 판에서 짐승인간 리드가 한 번도 안 나오고(`leadPool`이 `[Role.MAFIA]` 하나), 영매·기자 필터가 없다.

- [ ] **Step 3: 필터 헬퍼 셋을 만든다**

`src/domain/RoleAssignment.ts`의 `draw`(`:101-104`) 아래에 넣는다.

```ts
/** spec.minPlayers를 넘지 못하는 직업을 뺀다 */
function allowedAt(
	pool: readonly Role[],
	playerCount: number,
	floors: Partial<Record<Role, number>>
): Role[] {
	return pool.filter(role => {
		const floor = floors[role];
		return floor === undefined || playerCount >= floor;
	});
}

/**
 * 이미 뽑힌 직업과 같은 배타 그룹에 있는 후보를 뺀다.
 *
 * 그룹은 진영을 가로지를 수 있다. 마피아 자리를 먼저 확정하고 그 결과를
 * 시민 필터의 입력으로 넘기면 방향이 한쪽이라 순환이 생기지 않는다.
 */
function withoutRivals(
	pool: readonly Role[],
	taken: readonly Role[],
	groups: readonly (readonly Role[])[]
): Role[] {
	const banned: Role[] = [];
	for (const group of groups) {
		let hit = false;
		for (const role of group) if (taken.indexOf(role) >= 0) hit = true;
		if (!hit) continue;
		for (const role of group) if (taken.indexOf(role) < 0) banned.push(role);
	}
	return pool.filter(role => banned.indexOf(role) < 0);
}

/**
 * 풀에서 count개를 뽑되, 하나 뽑을 때마다 그 직업의 그룹 동료를 남은 풀에서 뺀다.
 *
 * 배타는 뽑는 순서에 의존한다. 먼저 섞고 앞에서부터 채우면 그룹 안에서
 * 어느 쪽이 남는지가 매 판 균등해진다 — 배열 순서대로 거르면 항상 앞의
 * 직업만 나온다.
 */
function drawExclusive(
	pool: readonly Role[],
	count: number,
	groups: readonly (readonly Role[])[],
	rng: () => number
): Role[] {
	if (count <= 0) return [];
	let remaining = shuffle(pool.slice(), rng);
	const picked: Role[] = [];
	while (picked.length < count && remaining.length > 0) {
		picked.push(remaining[0]);
		remaining = withoutRivals(remaining.slice(1), picked, groups);
	}
	return picked;
}
```

- [ ] **Step 4: `buildRoleDeck`의 마피아 자리를 다시 쓴다**

`src/domain/RoleAssignment.ts`의 `buildRoleDeck` 앞머리(Task 2에서 고친 부분)를 교체한다.

```ts
export function buildRoleDeck(
	spec: DeckSpec,
	playerCount: number,
	rng: () => number = Math.random
): Role[] {
	const teamSize = mafiaCount(spec, playerCount);
	const citizenSlots = playerCount - teamSize;
	const budget = nightKillBudget(citizenSlots);

	/*
	 * 리드 선정.
	 *
	 * 팀이 둘 이상인데 예산이 1이면 리드 후보에서 단독 킬러를 뺀다. 리드가
	 * 혼자 물면 둘째 자리는 예산 때문에 순수 마피아로 고정되고, 그 마피아는
	 * 밀담에 혼자 앉는다 — 팀원이 있는데 말을 걸 수 없는 상태다.
	 *
	 * 조건을 인원이 아니라 예산으로 적은 이유: 정원이나 인원표가 바뀌어도
	 * 따라온다. "7~9인"이라고 적으면 표가 바뀔 때마다 여기를 다시 고쳐야 한다.
	 */
	const leadPool = allowedAt(spec.leadPool, playerCount, spec.minPlayers);
	const leadCandidates = teamSize >= 2 && budget < 2
		? leadPool.filter(role => !killsIndependently(role))
		: leadPool;
	// 후보가 전부 걸러지면 마피아로 대체한다. 마피아 없는 판은 성립하지 않는다
	const lead = leadCandidates.length > 0 ? shuffle(leadCandidates, rng)[0] : Role.MAFIA;
	const roles: Role[] = [lead];

	/*
	 * 나머지 마피아 자리.
	 *
	 * 리드가 이미 밤 사망자 하나를 쓴다 — 밀담이든 단독이든 마찬가지다.
	 * 예산이 남지 않으면 따로 죽이지 않는 직업 중에서만 뽑는다.
	 *
	 * 리드가 이미 단독 킬러면 예산이 남아도 하나 더는 안 된다. 예산 2는
	 * "밀담 하나 + 단독 하나"를 뜻하지 "단독 둘"이 아니다.
	 */
	const budgeted = budget > 1 && !killsIndependently(lead)
		? spec.mafiaPool
		: spec.mafiaPool.filter(role => !killsIndependently(role));
	const mafiaPool = withoutRivals(
		allowedAt(budgeted, playerCount, spec.minPlayers),
		roles,
		spec.exclusiveGroups
	);
	for (const role of drawExclusive(mafiaPool, teamSize - 1, spec.exclusiveGroups, rng)) {
		roles.push(role);
	}
```

`mafiaCount`가 이미 계산한 값을 다시 쓰지 않도록 지역 변수 이름을 `teamSize`로 통일한다.

- [ ] **Step 5: 시민 자리에도 같은 필터를 건다**

같은 함수의 뒷부분. 기존 주석(`:133-147`, `:153-154`, `:157-161`)은 그대로 둔다.

```ts
	const reservedSlots = MIN_PLAIN_CITIZENS + MIN_SPECIAL_CITIZENS;
	const requiredSlots = Math.max(
		Math.min(spec.citizenRequired.length, citizenSlots - reservedSlots),
		0,
	);
	for (const role of draw(spec.citizenRequired, requiredSlots, rng)) roles.push(role);

	// 인원 제한과 배타를 먼저 걸고, 그 결과의 길이를 추첨 수의 상한으로 쓴다.
	// 상한을 걸지 않으면 draw가 요청한 수를 못 채우고 부족분이 아래
	// while에서 평민으로 메워진다 — 덱 길이는 맞으므로 실패가 조용하다
	const citizenPool = withoutRivals(
		allowedAt(spec.citizenPool, playerCount, spec.minPlayers),
		roles,
		spec.exclusiveGroups
	);
	const plainSlots = citizenSlots - requiredSlots;
	const special = Math.min(
		Math.max(Math.round(plainSlots * SPECIAL_CITIZEN_RATIO), MIN_SPECIAL_CITIZENS),
		Math.max(plainSlots - MIN_PLAIN_CITIZENS, 0),
		citizenPool.length,
	);
	for (const role of drawExclusive(citizenPool, special, spec.exclusiveGroups, rng)) {
		roles.push(role);
	}

	while (roles.length < playerCount) roles.push(Role.CITIZEN);
	return shuffle(roles, rng);
}
```

- [ ] **Step 6: `STANDARD_RULES.deck` 세 줄을 채운다**

`src/domain/RuleSet.ts`. `CON_ARTIST`는 아직 없으므로 **배타 그룹은 비워 둔 채로 두고 Task 6에서 채운다** — 없는 `Role` 멤버를 적으면 컴파일이 안 된다.

```ts
		leadPool: [Role.MAFIA, Role.BEAST],
		mafiaPool: [Role.MAFIA, Role.BEAST],
		citizenRequired: [Role.DOCTOR, Role.POLICE],
		citizenPool: [
			Role.POLITICIAN, Role.SHAMAN, Role.SPY,
			Role.SOLDIER, Role.REPORTER, Role.VIGILANTE,
		],
		exclusiveGroups: [],
		// BEAST: 4~5인은 시민이 3~4명뿐이라 은폐자가 도는 시간이 없다
		// SHAMAN: 8인 구성부터 들어간다
		// REPORTER: 조기 특종이 게임을 끝낸다
		minPlayers: { BEAST: 6, SHAMAN: 8, REPORTER: 11 },
```

속도전(`BLITZ_RULES`)과 침묵전은 손대지 않는다. 속도전은 `leadPool`·`mafiaPool` 모두 `[Role.MAFIA]`라 이 슬라이스의 영향이 없고, 침묵전은 `STANDARD_RULES`의 값을 그대로 참조한다.

- [ ] **Step 7: 깨지는 기존 테스트 하나를 고친다**

`tests/domain.test.ts:147-159`. 이 테스트는 모든 인원에서 `deck.includes(Role.MAFIA)`를 주장하는데, 6인 짐승인간 리드 판에는 `Role.MAFIA`가 없다 — **그게 이 슬라이스가 겨냥한 상태다.** 진짜 불변식으로 바꾼다.

```ts
	it("마피아 팀이 비지 않고, 둘 이상이면 밀담이 열린다", () => {
		// 6인 판은 짐승인간 혼자가 리드일 수 있다 — 혼자라 대화 상대가 없고
		// 밀담이 없어도 손실이 0이다. 반대로 팀이 둘 이상인데 밀담이 없으면
		// 팀원이 있는데 말을 걸 수 없는 상태가 된다
		for (const count of EVERY_COUNT) {
			const deck = buildRoleDeck(STANDARD_RULES.deck, count);
			const team = deck.filter(role => ROLE_DEFS[role].team === Team.MAFIA);
			assert.ok(team.length > 0, `${count}인`);
			if (team.length < 2) continue;
			const talkers = team.filter(
				role => ROLE_DEFS[role].nightChat === ChatChannel.MAFIA
			);
			assert.ok(talkers.length > 0, `${count}인`);
		}
	});
```

- [ ] **Step 8: 통과를 확인한다**

```bash
npm run verify
```

Expected: 전부 통과.

- [ ] **Step 9: 커밋**

```bash
git add src/domain/RoleAssignment.ts src/domain/RuleSet.ts tests/deck.test.ts tests/domain.test.ts
git commit -m "feat(deck): add lead pool, exclusive groups and per-role player floors

6인 판의 리드가 마피아나 짐승인간 둘 중 하나가 된다. 팀이 둘 이상인데
예산이 1이면 리드에서 단독 킬러를 빼 밀담에 혼자 앉는 마피아가 생기지
않게 한다. 인원 제한과 배타는 마피아 자리와 시민 자리 양쪽에 걸린다 —
한쪽에만 걸면 영매·기자 제한이 아무 일도 하지 않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**남는 상태 하나 (Task 6에서 풀린다):** 이 시점의 `mafiaPool`은 `[MAFIA, BEAST]` 둘뿐이라 **12인 판(마피아 3)은 리드 외 두 자리가 항상 마피아 + 짐승인간으로 고정된다.** Task 6이 사기꾼을 풀에 넣으면 다시 갈라진다. 그때까지는 12인 판의 마피아 구성이 매 판 같다는 것을 알고 있는다.

---

## Task 4: 밤 파이프라인 도입 — 관측 동작 불변

밤 능력이 **클릭 순간에 대상을 바꾸던 것**을 **밤이 끝날 때 정해진 순서로 적용하는 것**으로 옮긴다. 지금은 의사가 마피아보다 늦게 클릭하면 `healed`가 늦게 서지만 `resolveNightCasualties`가 밤 끝에 한 번만 보므로 결과가 같다 — 우연히 맞고 있다. 차단(Task 10)이 들어오면 그 우연이 깨진다.

**이 태스크의 성공 기준은 회귀 없음이다.** 조사 응답은 **아직 클릭 시점에 낸다** — 그 이동은 Task 5다. 여기서 깨지면 원인이 정산 구조고, Task 5에서 깨지면 원인이 노출 시점이다. 이 구분이 롤백 범위를 정한다.

**Files:**
- Create: `src/domain/NightPipeline.ts`
- Create: `tests/helpers/seat.ts` (좌석 팩토리 공용화)
- Test: `tests/night-pipeline.test.ts` (신규)
- Modify: `src/domain/Roles.ts:33-47`(옆에 `NightStep` 추가), `:49-153`(`RoleDef.nightStep`), `:159-351`(12개 항목 전부)
- Modify: `src/domain/NightResolution.ts:98-181`
- Modify: `src/types/Game.types.ts` (`Room.nightIntents`)
- Modify: `src/entities/Room.ts:24-46`, `:249-260`
- Modify: `src/services/Night.ts:22-28`, `:230-271`, `:296-330`
- Modify: `tests/domain.test.ts:16-22`, `:39-62`(팩토리를 헬퍼로 이전), `:457-540`

**Interfaces:**
- Consumes: Task 2의 `isPeacefulNight(nightNumber, playerCount, peacefulUpTo)`와 `Room.ruleSet`.
- Produces (테스트 쪽):
  - `seat(index: number, role: Role, overrides?: Partial<Seat>): Seat` — `tests/helpers/seat.ts`. Task 6·10의 새 테스트 파일이 이걸 쓴다. `Seat`이 바뀌면 여기만 고친다.
- Produces:
  - `NightStep` — `src/domain/Roles.ts`. 상수 객체 + 동명 타입 (`NightActionKind`과 같은 형태).
  - `RoleDef.nightStep: NightStep` — 필수 필드.
  - `NightIntent { readonly actor: number; readonly target: number }` — `src/domain/NightPipeline.ts`. 둘 다 좌석 `index`.
  - `NightReveal { readonly seat: number; readonly line: string }` — 같은 파일. Task 5까지 만들어지지 않는다.
  - `NightSettlement { readonly casualties: NightCasualty[]; readonly reveals: NightReveal[] }`
  - `resolveNightIntents(seats: Seat[], intents: readonly NightIntent[], opts: { readonly skipAttacks: boolean }): NightSettlement`
  - `putIntent(intents: NightIntent[], actor: number, target: number): void`
  - `recordNightIntent(actor: Seat, target: Seat): NightSelectResult | null` — `src/domain/NightResolution.ts`. `resolveNightSelect`를 대신한다. **대상을 변형하지 않는다.**
  - `Room.nightIntents: NightIntent[]`

- [ ] **Step 1: 좌석 팩토리를 공용 헬퍼로 옮긴다**

이 슬라이스부터 좌석 팩토리를 쓰는 테스트 파일이 넷이 된다(`domain` · `night-pipeline` · Task 6의 `roles-season1` · Task 10의 `night-block`). `Seat`은 이 계획에서만 세 번 바뀌므로(Task 8의 `skillSpent` → `usesSpent`, Task 9의 `silenced` 삭제, Task 10의 `blocked` 추가) 사본이 넷이면 그때마다 네 곳을 함께 고쳐야 한다. 한 군데로 모은다.

`tests/helpers/seat.ts`를 새로 만든다. `tests/helpers/`에는 이미 `Harness.ts`와 `FakeZep.ts`가 있고, `npm test`의 글롭은 `tests/**/*.test.ts`라 이 파일은 테스트로 실행되지 않는다.

```ts
/**
 * 도메인 테스트용 좌석 팩토리.
 *
 * Seat의 모양이 바뀌면 여기 한 곳만 고치면 된다. 파일마다 사본을 두면
 * 필드 하나를 더할 때마다 네 곳이 함께 밀린다.
 */
import { Role } from "../../src/types/Game.types.ts";
import type { Seat } from "../../src/types/Game.types.ts";
import { ROLE_DEFS } from "../../src/domain/Roles.ts";

export function seat(index: number, role: Role, overrides: Partial<Seat> = {}): Seat {
	return {
		playerId: `p${index}`,
		index,
		name: `p${index}`,
		rank: "Lv.1",
		role,
		team: ROLE_DEFS[role].team,
		alive: true,
		ready: false,
		votedFor: 0,
		voteCount: 0,
		healed: false,
		attackedBy: [],
		armored: ROLE_DEFS[role].survivesFirstAttack === true,
		silenced: false,
		scooped: false,
		usedSkill: false,
		skillSpent: false,
		kickedBy: [],
		connected: true,
		...overrides,
	};
}
```

`tests/domain.test.ts`에서 `:39-62`의 함수를 통째로 지우고 임포트로 바꾼다. `:37`의 `isInsideRoom` 임포트 아래에 붙인다.

```ts
import { isInsideRoom, seatPosition } from "../src/constants/RoomLayout.ts";
import { seat } from "./helpers/seat.ts";
```

`Role`·`Seat`·`ROLE_DEFS` 임포트는 그대로 둔다 — 세 개 모두 이 파일의 다른 곳에서 쓰인다(`ROLE_DEFS`는 `teamCount`가, `Seat`은 `Partial<Seat>` 오버라이드가). `type-check`가 `noUnusedLocals`로 잡으므로 잘못 지우면 바로 드러난다.

- [ ] **Step 2: 헬퍼 이전이 무해한지 확인한다**

```bash
npm test
```

Expected: PASS, 이전과 같은 개수. 팩토리를 옮기기만 했으므로 단정은 하나도 바뀌지 않는다. 여기서 빨간불이 나면 임포트 경로(`./helpers/seat.ts`) 문제다.

- [ ] **Step 3: 파이프라인 실패 테스트를 쓴다**

`tests/night-pipeline.test.ts`를 새로 만든다. 좌석 팩토리는 방금 만든 헬퍼에서 가져온다.

```ts
/**
 * 밤 파이프라인 테스트.
 *
 * 이 파일이 지키는 것은 하나다: 밤의 결과가 클릭 순서에 의존하지 않는다.
 * 지금은 의사가 늦게 눌러도 결과가 같지만 그건 resolveNightCasualties가
 * 밤 끝에 한 번만 보기 때문이지 순서를 정했기 때문이 아니다.
 * 차단(BLOCK)이 들어오면 그 우연이 깨진다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role } from "../src/types/Game.types.ts";
import type { Seat } from "../src/types/Game.types.ts";
import { NightStep, ROLE_DEFS } from "../src/domain/Roles.ts";
import { NightOutcome } from "../src/domain/NightResolution.ts";
import type { NightIntent } from "../src/domain/NightPipeline.ts";
import { putIntent, resolveNightIntents } from "../src/domain/NightPipeline.ts";
import { seat } from "./helpers/seat.ts";

/** 밤을 한 번 돌린다. intents는 클릭 순서대로 준다 */
function night(seats: Seat[], clicks: Array<[number, number]>, skipAttacks = false) {
	const intents: NightIntent[] = [];
	for (const [actor, target] of clicks) putIntent(intents, actor, target);
	return resolveNightIntents(seats, intents, { skipAttacks });
}

describe("밤 파이프라인 — 클릭 순서", () => {
	it("의사가 마피아보다 늦게 눌러도 대상이 산다", () => {
		// 이 판정이 이 슬라이스의 존재 이유다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.DOCTOR), seat(3, Role.CITIZEN)];
		const late = night(seats, [[1, 3], [2, 3]]);
		assert.equal(late.casualties.length, 1);
		assert.equal(late.casualties[0].outcome, NightOutcome.SAVED);
	});

	it("클릭 순서를 뒤집어도 결과가 같다", () => {
		const first = [seat(1, Role.MAFIA), seat(2, Role.DOCTOR), seat(3, Role.CITIZEN)];
		const second = [seat(1, Role.MAFIA), seat(2, Role.DOCTOR), seat(3, Role.CITIZEN)];
		const a = night(first, [[1, 3], [2, 3]]);
		const b = night(second, [[2, 3], [1, 3]]);
		assert.equal(a.casualties.length, b.casualties.length);
		assert.equal(a.casualties[0].outcome, b.casualties[0].outcome);
		assert.equal(first[2].alive, second[2].alive);
	});

	it("공격자 번호는 좌석 순서대로 쌓인다", () => {
		// sort를 쓰지 않는다. 좌석 배열 순회가 곧 좌석 번호 순서다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.BEAST), seat(3, Role.CITIZEN)];
		night(seats, [[2, 3], [1, 3]]);
		assert.deepEqual(seats[2].attackedBy, [1, 2]);
	});
});

describe("밤 파이프라인 — step 배치", () => {
	it("치료는 사망 확정보다 먼저 적용된다", () => {
		const seats = [seat(1, Role.DOCTOR), seat(2, Role.CITIZEN)];
		night(seats, [[1, 2]]);
		assert.equal(seats[1].healed, true);
	});

	it("자경단원 자책은 DEATH step에서 일어난다", () => {
		const seats = [seat(1, Role.VIGILANTE), seat(2, Role.CITIZEN)];
		const result = night(seats, [[1, 2]]);
		const outcomes = result.casualties.map(c => c.outcome);
		assert.ok(outcomes.includes(NightOutcome.KILLED));
		assert.ok(outcomes.includes(NightOutcome.BACKFIRED));
	});

	it("협박과 취재는 사망 확정 뒤에 걸린다", () => {
		// AFTER에 두는 이유: 협박은 다음 낮에 작용하므로 이미 죽은 사람을
		// 협박하는 낭비가 없어야 한다
		assert.equal(ROLE_DEFS[Role.THUG].nightStep, NightStep.AFTER);
		assert.equal(ROLE_DEFS[Role.REPORTER].nightStep, NightStep.AFTER);
		const seats = [seat(1, Role.REPORTER), seat(2, Role.MAFIA)];
		night(seats, [[1, 2]]);
		assert.equal(seats[1].scooped, true);
	});

	it("밤 시작 시점에 이미 죽어 있던 좌석의 지목은 버린다", () => {
		const seats = [seat(1, Role.MAFIA, { alive: false }), seat(2, Role.CITIZEN)];
		const result = night(seats, [[1, 2]]);
		assert.deepEqual(seats[1].attackedBy, []);
		assert.equal(result.casualties.length, 0);
	});

	it("그 밤에 죽은 기자의 특종은 그대로 나간다", () => {
		// 취재는 AFTER라 사망 확정보다 뒤다. seat.alive를 그때 다시 읽으면
		// 방금 죽은 기자의 특종이 사라진다 — 지금 동작에서는 나가는 것이다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.REPORTER), seat(3, Role.CITIZEN)];
		night(seats, [[1, 2], [2, 3]]);
		assert.equal(seats[1].alive, false);
		assert.equal(seats[2].scooped, true);
	});
});

describe("밤 파이프라인 — 첫 밤 무사", () => {
	it("skipAttacks면 공격이 기록되지 않고 아무도 죽지 않는다", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN)];
		const result = night(seats, [[1, 2]], true);
		assert.deepEqual(seats[1].attackedBy, []);
		assert.equal(result.casualties.length, 0);
		assert.equal(seats[1].alive, true);
	});

	it("skipAttacks여도 군인의 방탄은 남는다", () => {
		// attackedBy가 비어 있으므로 resolveNightCasualties가 방탄을 볼 일이 없다.
		// S0에서 별도 분기로 막았던 문제가 여기서는 구조적으로 생기지 않는다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.SOLDIER)];
		night(seats, [[1, 2]], true);
		assert.equal(seats[1].armored, true);
	});

	it("skipAttacks여도 취재는 나간다", () => {
		const seats = [seat(1, Role.REPORTER), seat(2, Role.MAFIA)];
		night(seats, [[1, 2]], true);
		assert.equal(seats[1].scooped, true);
	});
});

describe("putIntent", () => {
	it("같은 좌석이 다시 지목하면 교체한다", () => {
		// 스파이는 마피아를 찾으면 능력을 소모하지 않아 같은 밤에 또 지목한다.
		// 밀어 넣기만 하면 "이 좌석의 intent"가 둘이 되어 조회가 모호해진다
		const intents: NightIntent[] = [];
		putIntent(intents, 1, 5);
		putIntent(intents, 2, 6);
		putIntent(intents, 1, 7);
		assert.deepEqual(intents, [{ actor: 1, target: 7 }, { actor: 2, target: 6 }]);
	});
});
```

- [ ] **Step 4: 실패를 확인한다**

```bash
npm test
```

Expected: FAIL — `src/domain/NightPipeline.ts`가 없다.

- [ ] **Step 5: `NightStep`을 `Roles.ts`에 넣는다**

`src/domain/Roles.ts`의 `NightActionKind` 블록(`:33-47`) 바로 아래에 붙인다. **파이프라인 파일이 아니라 여기다** — 보정 사항 14번.

```ts
/**
 * 밤 정산에서 이 직업의 능력이 적용되는 시점.
 *
 * 지금까지 밤 능력은 클릭한 순서대로 대상을 바꿨다. 결과가 맞았던 것은
 * resolveNightCasualties가 밤 끝에 한 번만 보기 때문이지 순서를 정했기
 * 때문이 아니다. 능력을 막는 능력(차단)이 들어오는 순간 그 우연이 깨진다 —
 * 막을 사람이 늦게 누르면 이미 지나간 능력을 막게 된다.
 *
 * 숫자 사이를 비워 둔 것은 나중에 끼우기 위해서다. 원문 기획의 SWAP(10)은
 * 대상을 바꿔치기하는 직업 전용이라 아직 넣지 않았다.
 *
 * 값이 아니라 순서만 뜻한다. STEP_ORDER(NightPipeline.ts)가 이 순서를
 * 배열로 고정한다 — Jint에서 sort 안정성을 믿지 않기로 했으므로 정렬하지 않는다.
 */
export const NightStep = {
	/** 능력 차단 — 건달(S6), 마담(시즌 2) */
	BLOCK: 20,
	/** 보호 — 의사 */
	PROTECT: 30,
	/** 공격 — 마피아·짐승인간·자경단원 */
	ATTACK: 40,
	/** 사망 확정 + 자경단원 자책 */
	DEATH: 50,
	/** 조사 — 경찰·스파이·점쟁이 */
	INSPECT: 60,
	/** 사후 — 기자 특종·건달 협박·시민 쪽지·사기꾼 역알림 */
	AFTER: 70,
} as const;
export type NightStep = (typeof NightStep)[keyof typeof NightStep];
```

- [ ] **Step 6: `RoleDef`에 `nightStep`을 필수로 더한다**

`src/domain/Roles.ts`의 `nightAction` 선언(`:67-68`) 바로 아래.

```ts
	/**
	 * 밤 정산에서 이 직업이 처리되는 시점.
	 *
	 * nightAction이 null인 직업도 값을 적는다. 지목이 없어도 사후 효과가
	 * 붙을 수 있어서다 — 사기꾼은 아무도 지목하지 않지만 AFTER에서
	 * "누가 나를 조사했는가"를 받는다.
	 */
	readonly nightStep: NightStep;
```

- [ ] **Step 7: 12개 항목에 `nightStep`을 적는다**

각 항목의 `nightAction` 줄 바로 아래에 넣는다. 능력이 없는 직업은 전부 `AFTER`다.

| 직업 | `nightAction` | `nightStep` |
| --- | --- | --- |
| `MAFIA` | `ATTACK` | `NightStep.ATTACK` |
| `DOCTOR` | `HEAL` | `NightStep.PROTECT` |
| `POLICE` | `INSPECT_TEAM` | `NightStep.INSPECT` |
| `SPY` | `INSPECT_ROLE` | `NightStep.INSPECT` |
| `SHAMAN` | `null` | `NightStep.AFTER` |
| `POLITICIAN` | `null` | `NightStep.AFTER` |
| `VIGILANTE` | `ATTACK` | `NightStep.ATTACK` |
| `SOLDIER` | `null` | `NightStep.AFTER` |
| `THUG` | `SILENCE` | `NightStep.AFTER` |
| `REPORTER` | `SCOOP` | `NightStep.AFTER` |
| `BEAST` | `ATTACK` | `NightStep.ATTACK` |
| `CITIZEN` | `null` | `NightStep.AFTER` |

예시 (`MAFIA`):

```ts
		nightAction: NightActionKind.ATTACK,
		nightStep: NightStep.ATTACK,
		nightChat: ChatChannel.MAFIA,
```

`Record<Role, RoleDef>` 덕분에 하나라도 빠뜨리면 `type-check`가 잡는다.

- [ ] **Step 8: `NightPipeline.ts`를 만든다**

```ts
/**
 * 밤 정산 파이프라인.
 *
 * 지금까지 밤 능력은 클릭한 순간에 대상의 상태를 바꿨다. 능력이 서로를
 * 건드리지 않는 동안에는 그래도 됐다 — healed도 attackedBy도 밤이 끝날 때
 * resolveNightCasualties가 한 번만 읽었기 때문이다.
 *
 * 능력을 막는 능력이 들어오면 그 전제가 무너진다. "막는다"는 다른 능력이
 * 적용되기 전에 서야 하는데, 클릭 시점 적용에서는 누가 먼저 눌렀는지가
 * 그 순서를 정한다. 즉 밤의 결과가 손 빠르기로 갈린다.
 *
 * 그래서 클릭은 의도(intent)만 남기고, 적용은 밤이 끝날 때 정해진 순서로
 * 한 번에 한다. 이 파일이 그 순서다.
 *
 * 사망 정산(resolveNightCasualties)은 고치지 않고 그대로 부른다. 치유·방탄·
 * 자책의 우선순위는 이미 검증되어 있고, 파이프라인이 바꾸는 것은 "그 함수가
 * 보는 상태를 언제 만드는가"뿐이다.
 */
import type { Seat } from "../types/Game.types.ts";
import { NightActionKind, NightStep, roleDef } from "./Roles.ts";
import type { NightCasualty } from "./NightResolution.ts";
import { resolveNightCasualties } from "./NightResolution.ts";

/** 누가 누구를 지목했는가. 좌석 index 두 개 */
export interface NightIntent {
	readonly actor: number;
	readonly target: number;
}

/**
 * 종류를 담지 않는다. 무슨 능력인지는 actor의 직업에서 읽으면 되고,
 * 중복 저장하면 둘이 어긋날 자리가 생긴다.
 */

/** 아침 직전에 한 좌석에게만 전할 한 줄 */
export interface NightReveal {
	readonly seat: number;
	readonly line: string;
}

export interface NightSettlement {
	readonly casualties: NightCasualty[];
	/** Task 5까지는 항상 빈 배열이다 — 조사 응답은 아직 클릭 시점에 나간다 */
	readonly reveals: NightReveal[];
}

/**
 * step을 정렬하지 않고 배열로 고정한다.
 *
 * README가 Jint에서 sort 안정성을 믿지 않기로 정했다. 배열을 고정 순서로
 * 순회하면 비교 함수도 정렬도 없다. 그리고 beginGame이 shuffle 후
 * assignRole(seat, i + 1, ...)을 하므로 seats[i].index === i + 1이다 —
 * 좌석 배열 순회가 곧 좌석 번호 오름차순이다.
 */
const STEP_ORDER: readonly NightStep[] = [
	NightStep.BLOCK,
	NightStep.PROTECT,
	NightStep.ATTACK,
	NightStep.DEATH,
	NightStep.INSPECT,
	NightStep.AFTER,
];

/**
 * 이 좌석의 지목을 기록한다. 같은 좌석이 다시 지목하면 교체한다.
 *
 * 스파이는 마피아를 찾아내면 능력을 소모하지 않으므로 같은 밤에 또 지목한다.
 * 밀어 넣기만 하면 한 좌석에 intent가 둘이 되고, 파이프라인의 "이 좌석의
 * 지목" 조회가 어느 쪽을 뜻하는지 알 수 없어진다.
 */
export function putIntent(intents: NightIntent[], actor: number, target: number): void {
	for (let i = 0; i < intents.length; i++) {
		if (intents[i].actor === actor) {
			intents[i] = { actor, target };
			return;
		}
	}
	intents.push({ actor, target });
}

function targetOf(
	seats: readonly Seat[],
	intents: readonly NightIntent[],
	actor: number,
): Seat | null {
	for (const intent of intents) {
		if (intent.actor !== actor) continue;
		for (const seat of seats) {
			if (seat.index === intent.target) return seat;
		}
		return null;
	}
	return null;
}

/** 이 능력이 대상에 남기는 흔적. 정산이 나중에 읽는다 */
function apply(actor: Seat, target: Seat): void {
	switch (roleDef(actor.role).nightAction) {
		case NightActionKind.HEAL:
			target.healed = true;
			return;
		case NightActionKind.ATTACK:
			target.attackedBy.push(actor.index);
			return;
		case NightActionKind.SILENCE:
			target.silenced = true;
			return;
		case NightActionKind.SCOOP:
			target.scooped = true;
			return;
		// 조사는 Task 5에서 reveals로 옮긴다. 지금은 클릭 시점에 답이 나가므로
		// 여기서 할 일이 없다
		case NightActionKind.INSPECT_TEAM:
		case NightActionKind.INSPECT_ROLE:
			return;
		default:
			return;
	}
}

/**
 * 밤에 쌓인 지목을 정해진 순서로 적용한다.
 *
 * skipAttacks는 첫 밤 무사다. ATTACK step의 적용과 DEATH step 양쪽을
 * 건너뛴다 — attackedBy가 채워지지 않으므로 방탄도 소모되지 않는다.
 */
export function resolveNightIntents(
	seats: Seat[],
	intents: readonly NightIntent[],
	opts: { readonly skipAttacks: boolean },
): NightSettlement {
	const reveals: NightReveal[] = [];
	let casualties: NightCasualty[] = [];

	/*
	 * 밤이 시작될 때 살아 있던 좌석 번호.
	 *
	 * step마다 seat.alive를 다시 읽으면 DEATH에서 죽은 사람의 능력이 뒤 step에서
	 * 사라진다. 그 밤에 죽은 기자의 특종(AFTER)이 안 나가고, 그 밤에 죽은
	 * 경찰의 조사(INSPECT)가 답을 못 받는다 — 둘 다 지금 나가는 것들이다.
	 * 밤의 능력은 살아서 지목한 사람의 것이고, 그 뒤에 죽었는지는 무관하다.
	 */
	const wasAlive: number[] = [];
	for (const seat of seats) {
		if (seat.alive) wasAlive.push(seat.index);
	}

	for (const step of STEP_ORDER) {
		if (step === NightStep.DEATH) {
			if (!opts.skipAttacks) casualties = resolveNightCasualties(seats);
			continue;
		}
		if (step === NightStep.ATTACK && opts.skipAttacks) continue;

		for (const seat of seats) {
			if (wasAlive.indexOf(seat.index) < 0) continue;
			if (roleDef(seat.role).nightStep !== step) continue;
			const target = targetOf(seats, intents, seat.index);
			if (!target) continue;
			apply(seat, target);
		}
	}

	return { casualties, reveals };
}
```

- [ ] **Step 9: `recordNightIntent`로 축소한다**

`src/domain/NightResolution.ts:98-181`을 통째로 바꾼다. **대상을 변형하는 네 줄이 사라진다** — 그 일은 이제 파이프라인이 한다. 남는 것은 시전자에게 보일 라벨·소리·소모 여부다.

스파이의 진영 이동(`actor.team = Team.MAFIA`)은 **여기 남는다.** 조사 응답이 아직 클릭 시점에 나가고, 합류 안내도 그 응답에 붙어 있다. Task 5가 둘을 함께 옮긴다.

```ts
/**
 * 밤에 대상을 지목했을 때 시전자가 보는 것.
 *
 * 전에는 이 함수가 대상의 healed·attackedBy·silenced·scooped를 직접 세웠다.
 * 즉 능력의 적용 시점이 곧 클릭 시점이었고, 그래서 밤의 결과가 손 빠르기에
 * 달려 있었다. 적용은 NightPipeline이 밤 끝에 정해진 순서로 한다.
 *
 * 여기 남는 것은 "지금 이 사람 화면에 무엇이 뜨는가"뿐이다.
 * 조사 응답만 예외로 아직 여기서 나간다 — 그 이동은 다음 슬라이스다.
 *
 * 능력이 없는 직업이면 null.
 */
export function recordNightIntent(actor: Seat, target: Seat): NightSelectResult | null {
	const def = roleDef(actor.role);
	if (def.nightAction === null) return null;

	switch (def.nightAction) {
		case NightActionKind.HEAL:
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 치료하기로 결정했습니다.`,
				privateSound: Sound.HEAL,
			};

		case NightActionKind.ATTACK: {
			// 이미 지목된 대상이어도 되돌리지 않는다. 되돌리는 문구가
			// 자경단원에게 "여기 마피아가 다녀갔다"를 알려주기 때문이다.
			// 중복 지목은 무해하다 — 정산은 좌석 단위다
			const attack: NightSelectResult = {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 공격 대상으로 정했습니다.`,
			};
			if (def.attackSound) attack.roomSound = def.attackSound;
			return attack;
		}

		case NightActionKind.INSPECT_TEAM:
			return {
				consumed: true,
				confirmed: true,
				label: roleDef(target.role).appearsAsMafia
					? `${target.index}번 참가자는 마피아입니다!`
					: `${target.index}번 참가자는 마피아가 아닙니다.`,
				labelDurationMs: REVEAL_MS,
				privateSound: Sound.INVESTIGATE,
			};

		case NightActionKind.INSPECT_ROLE:
			// 조건이 둘 곱해진 것이다. 넘어가는 직업인가(def)와, 찾아낸 사람이
			// 마피아 채팅에 있는가(target). 뒤쪽이 "마피아 직업인가"가 아닌 이유는
			// 대화 상대가 없는 짐승인간을 찾아낸 것으로 채팅이 열릴 수는
			// 없기 때문이다. 앞쪽이 없으면 직업을 읽는 능력이 곧 배신이 된다.
			if (def.defectsToMafia && inMafiaChat(target)) {
				actor.team = Team.MAFIA;
				return {
					consumed: false,
					confirmed: false,
					label: `🕵️ ${target.index}번 참가자는 마피아입니다.\n마피아 팀에 합류했고 능력을 한 번 더 쓸 수 있습니다.`,
					labelDurationMs: REVEAL_MS,
					privateSound: Sound.INVESTIGATE,
					joinedMafia: true,
				};
			}
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자의 직업은 ${roleName(target.role)}입니다.`,
				labelDurationMs: REVEAL_MS,
				privateSound: Sound.INVESTIGATE,
			};

		case NightActionKind.SILENCE:
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자는 내일 말할 수도 투표할 수도 없습니다.`,
			};

		case NightActionKind.SCOOP:
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 취재했습니다.\n내일 아침 모두가 그의 직업을 알게 됩니다.`,
				labelDurationMs: REVEAL_MS,
			};
	}
}
```

`NightSelectResult`의 doc 주석(`:19-34`)도 한 줄 고친다 — "능력을 소모했는가"는 그대로지만 파일 머리 주석의 "actor/target의 …를 직접 갱신한다"는 이제 거짓이다.

```ts
/**
 * 밤에 대상을 지목했을 때 시전자에게 돌아가는 것.
 * 대상의 상태는 여기서 바꾸지 않는다 — NightPipeline이 밤 끝에 적용한다.
 * (스파이의 진영 이동만 아직 예외다)
 */
```

- [ ] **Step 10: `tests/domain.test.ts`를 맞춘다**

임포트(`:16-22`)에서 `resolveNightSelect`를 `recordNightIntent`로 바꾸고, `describe("NightResolution")`(`:457-540`) 안을 아래와 같이 고친다. **대상 변형을 단언하던 여섯 곳이 사라진다** — 같은 단언이 `tests/night-pipeline.test.ts`에 이미 있다.

| 기존 테스트 | 처리 |
| --- | --- |
| `의사가 치료하면 healed가 선다` (:458) | 이름을 `의사의 지목은 능력을 소모한다`로 바꾸고 `target.healed` 단언을 뺀다 |
| `공격은 공격자의 번호를 대상에 남긴다` (:466) | 이름을 `공격 지목은 능력을 소모한다`로 바꾸고 `attackedBy` 단언을 뺀다 |
| `여러 공격자가 같은 사람을 노려도 각자 기록된다` (:474) | **삭제.** 파이프라인 테스트의 `공격자 번호는 좌석 순서대로 쌓인다`가 대신한다 |
| `마피아만 총성을 낸다` (:483) | 호출 이름만 바꾼다 |
| `경찰은 짐승인간을 잡지 못하고 건달은 잡는다` (:490) | 호출 이름만 바꾼다 |
| `건달이 협박하면 대상의 투표가 막힌다` (:498) | 이름을 `건달의 협박은 능력을 소모한다`로 바꾸고 `silenced` 단언을 뺀다 |
| `기자가 취재하면 대상에 표식이 남는다` (:505) | 이름을 `기자의 취재는 능력을 소모한다`로 바꾸고 `scooped` 단언을 뺀다 |
| 나머지 넷 (:512, :520, :527, :532) | 호출 이름만 바꾼다 |

바뀐 앞 두 개의 최종 형태:

```ts
	it("의사의 지목은 능력을 소모한다", () => {
		// 대상이 실제로 healed가 되는지는 tests/night-pipeline.test.ts가 본다.
		// 이 함수는 이제 시전자 화면만 정한다
		const result = recordNightIntent(seat(1, Role.DOCTOR), seat(2, Role.CITIZEN));
		assert.equal(result?.consumed, true);
		assert.equal(result?.confirmed, true);
	});

	it("공격 지목은 능력을 소모한다", () => {
		const result = recordNightIntent(seat(1, Role.MAFIA), seat(2, Role.CITIZEN));
		assert.equal(result?.consumed, true);
		assert.match(result!.label, /공격 대상/);
	});
```

- [ ] **Step 11: `Room.nightIntents`를 만든다**

`src/types/Game.types.ts`의 `Room` 인터페이스에 넣는다. `nightReport` 바로 아래가 자연스럽다. 임포트는 **`import type`** 이다 — 보정 사항 11번과 같은 이유로 런타임 순환이 생기지 않는다.

```ts
import type { NightIntent } from "../domain/NightPipeline.ts";
```

```ts
	/** 이번 밤에 쌓인 지목. 밤이 끝날 때 NightPipeline이 순서대로 적용한다 */
	nightIntents: NightIntent[];
```

`src/entities/Room.ts`의 `createRoom`(`:24-46`)에 `nightIntents: [],`를 더하고, `resetRound`(`:249-260`)의 `room.voteRecord = emptyVoteRecord();` 옆에 한 줄 더한다.

```ts
export function resetRound(room: Room): void {
	room.voteRecord = emptyVoteRecord();
	// 지난밤의 지목은 남겨두면 다음 밤에 그대로 다시 적용된다
	room.nightIntents = [];
```

- [ ] **Step 12: 클릭 핸들러가 intent를 남기게 한다**

`src/services/Night.ts:255-266`. 결과 처리 순서는 그대로 두고 `putIntent` 한 줄만 끼운다.

```ts
		const result = recordNightIntent(seat, target);
		if (!result) return;

		// 적용은 밤이 끝날 때다. 여기서는 "이 사람이 저 사람을 골랐다"만 남긴다
		putIntent(room.nightIntents, seat.index, target.index);

		if (result.consumed) {
```

임포트(`:22-28`)를 고친다.

```ts
import {
	hasNightTurn,
	isPeacefulNight,
	nightActionBlockedReason,
	NightOutcome,
	recordNightIntent,
} from "../domain/NightResolution.ts";
import { putIntent, resolveNightIntents } from "../domain/NightPipeline.ts";
```

`resolveNightCasualties`는 이제 `Night.ts`가 직접 부르지 않는다 — 파이프라인이 부른다. 임포트에서 뺀다(`noUnusedLocals`가 안 빼면 잡는다).

- [ ] **Step 13: `resolveNight`가 파이프라인을 부르게 한다**

`src/services/Night.ts:296-302`. Task 1이 넣은 조기 반환 가드가 여기서 **사라진다** — 같은 일을 `skipAttacks`가 구조적으로 한다. 아래 `switch` 이하와 `publishScoops(room)`는 그대로 둔다.

```ts
export function resolveNight(room: Room): void {
	room.turnCount++;
	// 아침 화면이 읽을 밤 기록. kill()이 사망 한 줄씩 채워 넣는다
	room.nightReport = [];

	/*
	 * 첫 밤 무사는 이제 분기가 아니라 파이프라인의 인자다.
	 *
	 * S0에서는 resolveNightCasualties 앞에서 되돌아가야 했다 — 그 함수가
	 * 공격받은 좌석의 방탄을 소모하기 때문이다. 지금은 ATTACK step 자체를
	 * 건너뛰므로 attackedBy가 비어 있고, 방탄을 볼 일이 애초에 없다.
	 * 기자의 특종은 AFTER step이라 그대로 나간다.
	 */
	const settlement = resolveNightIntents(room.seats, room.nightIntents, {
		skipAttacks: isPeacefulNight(room.turnCount, room.total, room.ruleSet.firstNightPeacefulUpTo),
	});
	const casualties = settlement.casualties;
	if (casualties.length === 0) report(room, "✨ 이번 밤에 아무도 죽지 않았습니다.");
```

- [ ] **Step 14: 전체 검증**

```bash
npm run verify
```

Expected: 전부 통과. **`tests/gameflow.test.ts`·`tests/isolation.test.ts`·`tests/reconnect.test.ts`가 한 줄도 안 바뀐 채로 통과해야 한다** — 이 슬라이스의 합격 기준이다. 이들이 깨지면 구조 이동에서 관측 동작이 바뀐 것이므로, Task 5로 넘어가지 말고 여기서 잡는다.

- [ ] **Step 15: 커밋**

```bash
git add src/domain/NightPipeline.ts src/domain/Roles.ts src/domain/NightResolution.ts src/types/Game.types.ts src/entities/Room.ts src/services/Night.ts tests/night-pipeline.test.ts tests/domain.test.ts
git commit -m "refactor(night): settle night abilities in a fixed pipeline

클릭 시점에 대상을 바꾸던 것을 밤이 끝날 때 step 순서대로 적용하는 것으로
옮긴다. 지금까지 결과가 맞았던 것은 사망 정산이 밤 끝에 한 번만 읽었기
때문이지 순서를 정했기 때문이 아니었고, 능력을 막는 능력이 들어오면 밤의
결과가 손 빠르기로 갈린다.

사망 정산 함수는 고치지 않고 DEATH step에서 그대로 부른다. 조사 응답도
아직 클릭 시점에 낸다 — 관측 동작은 바뀌지 않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 조사 결과를 아침으로 옮긴다

경찰과 스파이는 지금 **누른 순간** 답을 본다. 그래서 능력을 막는 능력이 들어오면 막힌 경찰이 이미 답을 본 뒤다. 답을 밤 정산에서 만들고 아침 진입 직전에 전한다.

**이 슬라이스는 관측 동작을 바꾼다.** Task 4가 회귀 없음을 확인해 두었으므로, 여기서 무언가 깨지면 원인은 노출 시점 하나다.

**Files:**
- Modify: `src/domain/NightPipeline.ts` (`apply`, `NightSettlement`, `resolveNightIntents`)
- Modify: `src/domain/NightResolution.ts:14-17`, `:19-34`, `recordNightIntent`의 `INSPECT_*` 두 갈래
- Modify: `src/types/Game.types.ts` (`Room.nightReveals`)
- Modify: `src/entities/Room.ts:24-46`, `:249-260`
- Modify: `src/services/Night.ts:230-271`, `:296-330`, `:338-341` 아래
- Modify: `src/services/GameFlow.ts:33`, `:161-163`
- Test: `tests/night-pipeline.test.ts`, `tests/domain.test.ts`

**Interfaces:**
- Consumes: Task 4의 `resolveNightIntents`, `NightReveal`, `Room.nightIntents`.
- Produces:
  - `NightSettlement.defected: number[]` — 이 밤에 마피아로 넘어간 좌석 index. 지금은 스파이 하나뿐이다.
  - `Room.nightReveals: NightReveal[]`
  - `deliverNightReveals(room: Room): void` — `src/services/Night.ts`. 전한 뒤 비운다.
- `NightSelectResult.joinedMafia`는 **사라진다.** 합류를 클릭 시점에 알리지 않는다.

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/night-pipeline.test.ts` 끝에 붙인다. 임포트에 `Team`을 더한다.

```ts
import { Role, Team } from "../src/types/Game.types.ts";
```

```ts
describe("밤 파이프라인 — 조사 결과", () => {
	it("경찰의 답은 reveals로 나온다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.MAFIA)];
		const result = night(seats, [[1, 2]]);
		assert.equal(result.reveals.length, 1);
		assert.equal(result.reveals[0].seat, 1);
		assert.match(result.reveals[0].line, /마피아입니다/);
	});

	it("경찰은 짐승인간을 잡지 못한다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.BEAST)];
		const result = night(seats, [[1, 2]]);
		assert.match(result.reveals[0].line, /마피아가 아닙니다/);
	});

	it("그 밤에 죽은 경찰도 답을 받는다", () => {
		// 조사(INSPECT)는 사망 확정(DEATH)보다 뒤다. 마지막으로 알아낸 것을
		// 삼키면 영매를 통해 나올 정보 하나가 그냥 사라진다
		const seats = [seat(1, Role.MAFIA), seat(2, Role.POLICE), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 2], [2, 1]]);
		assert.equal(seats[1].alive, false);
		assert.equal(result.reveals.length, 1);
		assert.equal(result.reveals[0].seat, 2);
		assert.match(result.reveals[0].line, /마피아입니다/);
	});

	it("조사 대상이 그 밤에 죽어도 답은 같다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.MAFIA), seat(3, Role.VIGILANTE)];
		const result = night(seats, [[1, 2], [3, 2]]);
		assert.equal(seats[1].alive, false);
		assert.match(result.reveals[0].line, /마피아입니다/);
	});

	it("스파이가 마피아를 찾으면 진영이 바뀌고 defected에 남는다", () => {
		const seats = [seat(1, Role.SPY), seat(2, Role.MAFIA)];
		const result = night(seats, [[1, 2]]);
		assert.equal(seats[0].team, Team.MAFIA);
		assert.deepEqual(result.defected, [1]);
		assert.match(result.reveals[0].line, /합류/);
	});

	it("스파이가 짐승인간을 찾아도 합류하지 않는다", () => {
		// 대화 상대가 없는 짐승인간을 찾아낸 것으로 마피아 채팅이 열릴 수는 없다
		const seats = [seat(1, Role.SPY), seat(2, Role.BEAST)];
		const result = night(seats, [[1, 2]]);
		assert.equal(seats[0].team, Team.CITIZEN);
		assert.deepEqual(result.defected, []);
		assert.match(result.reveals[0].line, /짐승인간/);
	});

	it("아무도 조사하지 않은 밤의 reveals는 비어 있다", () => {
		const seats = [seat(1, Role.MAFIA), seat(2, Role.CITIZEN)];
		const result = night(seats, [[1, 2]]);
		assert.deepEqual(result.reveals, []);
		assert.deepEqual(result.defected, []);
	});
});
```

`tests/domain.test.ts`의 `describe("NightResolution")`에도 한 줄 더한다.

```ts
	it("조사 지목은 답을 주지 않는다", () => {
		const result = recordNightIntent(seat(1, Role.POLICE), seat(2, Role.MAFIA));
		assert.equal(result?.consumed, true);
		assert.doesNotMatch(result!.label, /마피아/);
	});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test
```

Expected: FAIL — `result.defected`가 없고, `reveals`는 빈 배열이며, 경찰 라벨에 아직 답이 들어 있다.

- [ ] **Step 3: 파이프라인이 답을 만든다**

`src/domain/NightPipeline.ts`. 임포트를 넓히고 `NightSettlement`에 `defected`를 더한다.

```ts
import type { Seat } from "../types/Game.types.ts";
import { Team } from "../types/Game.types.ts";
import { inMafiaChat, NightActionKind, NightStep, roleDef, roleName } from "./Roles.ts";
```

```ts
export interface NightSettlement {
	readonly casualties: NightCasualty[];
	readonly reveals: NightReveal[];
	/**
	 * 이 밤에 마피아로 넘어간 좌석. 지금은 스파이 하나뿐이다.
	 *
	 * reveals에 섞지 않는 이유는 배달 방식이 달라서다. 조사 답은 본인에게
	 * 귓속말 한 줄이면 끝이지만, 합류는 마피아 채널에 남길 한 줄과 본인
	 * 위젯의 탭 목록 갱신이 따로 필요하다. 그건 domain이 할 수 없는 일이다.
	 */
	readonly defected: number[];
}
```

`apply`가 `reveals`와 `defected`를 받는다.

```ts
function apply(actor: Seat, target: Seat, reveals: NightReveal[], defected: number[]): void {
	const def = roleDef(actor.role);
	switch (def.nightAction) {
		case NightActionKind.HEAL:
			target.healed = true;
			return;
		case NightActionKind.ATTACK:
			target.attackedBy.push(actor.index);
			return;
		case NightActionKind.SILENCE:
			target.silenced = true;
			return;
		case NightActionKind.SCOOP:
			target.scooped = true;
			return;

		case NightActionKind.INSPECT_TEAM:
			// 대상이 방금 DEATH에서 죽었어도 답은 같다. 조사는 시체가 아니라
			// 그 사람이 누구였는가를 묻는 것이다
			reveals.push({
				seat: actor.index,
				line: roleDef(target.role).appearsAsMafia
					? `🔍 ${target.index}번 참가자는 마피아입니다!`
					: `🔍 ${target.index}번 참가자는 마피아가 아닙니다.`,
			});
			return;

		case NightActionKind.INSPECT_ROLE:
			// 조건이 둘 곱해진 것이다. 넘어가는 직업인가(def)와, 찾아낸 사람이
			// 마피아 채팅에 있는가(target). 뒤쪽이 "마피아 직업인가"가 아닌 이유는
			// 대화 상대가 없는 짐승인간을 찾아낸 것으로 채팅이 열릴 수는
			// 없기 때문이다. 앞쪽이 없으면 직업을 읽는 능력이 곧 배신이 된다.
			if (def.defectsToMafia && inMafiaChat(target)) {
				actor.team = Team.MAFIA;
				defected.push(actor.index);
				// 정확한 직업을 적는다. 지금은 대상이 마피아뿐이라 "마피아입니다"와
				// 같지만, 사기꾼(Task 6)이 들어오면 갈린다 — 위장은 팀 조사에만
				// 통해야 하고 직업을 읽는 능력까지 속이면 스파이가 사기꾼을
				// 만났을 때 아무 일도 일어나지 않는다
				reveals.push({
					seat: actor.index,
					line: `🕵️ ${target.index}번 참가자의 직업은 ${roleName(target.role)}입니다.\n마피아 팀에 합류했습니다.`,
				});
				return;
			}
			reveals.push({
				seat: actor.index,
				line: `🔍 ${target.index}번 참가자의 직업은 ${roleName(target.role)}입니다.`,
			});
			return;

		default:
			return;
	}
}
```

`resolveNightIntents`에서 배열을 하나 더 만들어 넘기고 돌려준다.

```ts
	const reveals: NightReveal[] = [];
	const defected: number[] = [];
	let casualties: NightCasualty[] = [];
```
```ts
			apply(seat, target, reveals, defected);
```
```ts
	return { casualties, reveals, defected };
```

- [ ] **Step 4: 클릭에서 답을 걷어낸다**

`src/domain/NightResolution.ts`. `INSPECT_TEAM`과 `INSPECT_ROLE` 두 갈래를 하나로 합친다.

```ts
		case NightActionKind.INSPECT_TEAM:
		case NightActionKind.INSPECT_ROLE:
			// 답은 여기서 내지 않는다. 막는 능력이 들어오면 막힌 경찰이 이미
			// 답을 본 뒤가 되고, 그때 가서 되돌릴 방법이 없다.
			// 스파이도 마찬가지로 한 번만 지목한다 — 예전에는 마피아를 찾아내면
			// consumed: false로 또 누를 수 있었는데, 그 "또 누를 수 있음" 자체가
			// 답을 클릭 즉시 알려주는 신호였다.
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 조사합니다.\n결과는 내일 아침에 알게 됩니다.`,
				privateSound: Sound.INVESTIGATE,
			};
```

`NightSelectResult`에서 `joinedMafia`를 지운다. 임포트도 줄어든다 — `Team`, `inMafiaChat`, `roleName`이 더는 쓰이지 않으므로 `noUnusedLocals`가 잡는다.

```ts
import type { Seat } from "../types/Game.types.ts";
import { Sound } from "../constants/Assets.ts";
import { NightActionKind, roleDef } from "./Roles.ts";
```

- [ ] **Step 5: `Room.nightReveals`를 만든다**

`src/types/Game.types.ts`의 `nightIntents` 바로 아래.

```ts
	/** 아침 진입 직전에 각자에게 전할 밤의 답. 전하고 나면 비운다 */
	nightReveals: NightReveal[];
```

임포트를 넓힌다.

```ts
import type { NightIntent, NightReveal } from "../domain/NightPipeline.ts";
```

`src/entities/Room.ts`의 `createRoom`에 `nightReveals: [],`를 더하고, `resetRound`에도 한 줄 더한다.

```ts
	room.nightIntents = [];
	// 정상 경로에서는 이미 비어 있다. 게임이 중간에 리셋된 경우를 위한 것이다
	room.nightReveals = [];
```

- [ ] **Step 6: `resolveNight`가 답을 담고 합류를 알린다**

`src/services/Night.ts`. Task 4에서 만든 호출 아래에 두 줄이 붙고, 함수 끝에 합류 처리가 붙는다.

```ts
	const settlement = resolveNightIntents(room.seats, room.nightIntents, {
		skipAttacks: isPeacefulNight(room.turnCount, room.total, room.ruleSet.firstNightPeacefulUpTo),
	});
	room.nightReveals = settlement.reveals;
	const casualties = settlement.casualties;
	if (casualties.length === 0) report(room, "✨ 이번 밤에 아무도 죽지 않았습니다.");
```

`publishScoops(room);` 아래.

```ts
	// 스파이의 합류는 채널 안내와 탭 목록 갱신이 필요해서 reveals와 따로 간다.
	// 채널에 남긴 한 줄은 기록에도 남아 나중에 합류한 사람도 볼 수 있다
	for (const index of settlement.defected) {
		const joined = seatAt(room, index);
		if (!joined) continue;
		const player = ScriptApp.getPlayerByID(joined.playerId);
		if (player) announceSpyJoin(room, player);
	}
}
```

클릭 핸들러(`:230-271`)에서 마지막 한 줄을 지운다.

```ts
		if (result.privateSound) sender.playSound(result.privateSound);
		if (result.roomSound) playSound(room, result.roomSound);
	});
```

- [ ] **Step 7: 배달 함수와 호출부**

`src/services/Night.ts`의 `tellSeat`(`:338-341`) 아래에 붙인다.

```ts
/**
 * 밤에 알아낸 것을 각자에게 전한다. 아침 진입 직전에 한 번.
 *
 * 죽은 사람도 받는다. 그 밤에 죽은 경찰이 마지막으로 알아낸 것을 삼키면
 * 영매를 통해 나올 정보 하나가 그냥 사라진다.
 *
 * 접속이 끊긴 사람은 놓친다 — tellSeat이 조용히 버린다. 남는 손실이지만
 * 밤 결과 라벨도 이미 같은 방식이라 동작 변화는 아니다. 복구하려면 좌석별
 * 개인 로그를 저장해야 하고, 그건 관전 인프라와 같은 작업이다.
 */
export function deliverNightReveals(room: Room): void {
	for (const reveal of room.nightReveals) {
		const target = seatAt(room, reveal.seat);
		if (target) tellSeat(target, reveal.line);
	}
	room.nightReveals = [];
}
```

`src/services/GameFlow.ts:33`의 임포트에 더한다.

```ts
import {
	beginNight,
	broadcastNightProgress,
	deliverNightReveals,
	openNightView,
	resolveNight,
} from "./Night.ts";
```

`:161-163`.

```ts
		case GamePhase.NIGHT:
			resolveNight(room);
			// 승패 판정보다 먼저다. 마지막 밤에 확인한 답도 알려주어야 한다 —
			// 게임이 그 밤에 끝난다고 없던 일이 되지 않는다
			deliverNightReveals(room);
			if (!finishIfDecided(room)) beginDay(room);
			break;
```

- [ ] **Step 8: 스파이 테스트를 맞춘다**

`tests/domain.test.ts`에서 스파이 두 테스트가 클릭 결과를 단언하고 있다(`:512`, `:520`, `:532`). 진영 이동과 답이 파이프라인으로 갔으므로 여기 남는 것은 "지목이 소모된다"뿐이다. 세 테스트를 하나로 줄인다.

```ts
	it("스파이의 지목도 한 번만이다", () => {
		// 마피아를 찾아냈을 때의 재지목 보너스는 사라졌다. "또 누를 수 있다"가
		// 곧 "방금 마피아를 찾았다"였기 때문이다.
		// 합류 판정은 tests/night-pipeline.test.ts가 본다
		const spy = seat(1, Role.SPY);
		const result = recordNightIntent(spy, seat(2, Role.MAFIA));
		assert.equal(result?.consumed, true);
		assert.equal(spy.team, Team.CITIZEN);
	});
```

`describe("NightResolution")`에서 `경찰은 짐승인간을 잡지 못하고 건달은 잡는다`(`:490`)도 지운다 — 라벨에 답이 없으므로 단언할 것이 남지 않는다. 같은 판정이 파이프라인 테스트의 `경찰은 짐승인간을 잡지 못한다`에 있다.

- [ ] **Step 9: 전체 검증**

```bash
npm run verify
```

Expected: 전부 통과.

수동 확인 하나. 방을 하나 띄워 경찰로 조사한 뒤, 밤 화면에 답이 아니라 `2번 참가자를 조사합니다.`가 뜨고 **아침으로 넘어가는 순간** `🔍 2번 참가자는 …`이 오는지 본다. 컷 연출이 답을 가리면 이 시점 이동이 체감상 "답을 안 준다"로 읽힌다 — 그때는 컷 길이를 줄이지 말고 배달을 컷 뒤로 옮긴다.

- [ ] **Step 10: 커밋**

```bash
git add src/domain/NightPipeline.ts src/domain/NightResolution.ts src/types/Game.types.ts src/entities/Room.ts src/services/Night.ts src/services/GameFlow.ts tests/night-pipeline.test.ts tests/domain.test.ts
git commit -m "feat(night): reveal investigation results in the morning

경찰과 스파이의 답을 클릭 시점이 아니라 밤 정산에서 만들고 아침 진입
직전에 전한다. 클릭 시점에 답을 내면 능력을 막는 능력이 들어왔을 때
막힌 경찰이 이미 답을 본 뒤가 된다.

그 밤에 죽은 조사자도 답을 받고, 게임이 그 밤에 끝나도 받는다.
스파이의 마피아 합류도 같은 시점으로 옮긴다 — 예전의 재지목 보너스는
그 자체가 답을 클릭 즉시 알려주는 신호였으므로 없앤다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: 사기꾼

**경찰 조사에 시민으로 나오는 마피아 팀.** 밤에 아무것도 하지 않고, 조사당하면 다음 아침에 그 사실을 안다.

순수 추가다. 기존 직업의 판정은 한 줄도 바뀌지 않는다 — 사기꾼은 `appearsAsMafia`를 **켜지 않는 것**이 능력의 전부이고, 그 필드는 이미 있다.

**Files:**
- Modify: `src/types/Game.types.ts:53-72` (`Role.CON_ARTIST`)
- Modify: `src/domain/Roles.ts` (`RoleDef.notifiesOnInspect` + `CON_ARTIST` 정의)
- Modify: `src/domain/NightPipeline.ts` (`inspected` 수집 + `notifyInspected`)
- Modify: `src/domain/RuleSet.ts` (`mafiaPool` · `exclusiveGroups` · `minPlayers`)
- Test: `tests/roles-season1.test.ts` (신규), `tests/deck.test.ts`

**Interfaces:**
- Consumes: Task 5의 `resolveNightIntents`, `NightSettlement.reveals`. Task 3의 `exclusiveGroups` · `minPlayers` 처리.
- Produces:
  - `Role.CON_ARTIST = "CON_ARTIST"`
  - `RoleDef.notifiesOnInspect?: boolean` — 조사당한 사실을 다음 아침에 본인에게 알린다.

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/roles-season1.test.ts`를 새로 만든다.

```ts
/**
 * 시즌 1에서 더해진 직업들.
 *
 * 직업마다 "이 직업이 무엇을 바꾸는가" 한 가지씩만 본다. 밤 정산의 순서와
 * 배달은 tests/night-pipeline.test.ts가 이미 지키고 있으므로 여기서 또
 * 확인하지 않는다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ChatChannel, Role, Team } from "../src/types/Game.types.ts";
import type { Seat } from "../src/types/Game.types.ts";
import { ROLE_DEFS } from "../src/domain/Roles.ts";
import type { NightIntent, NightSettlement } from "../src/domain/NightPipeline.ts";
import { putIntent, resolveNightIntents } from "../src/domain/NightPipeline.ts";
import { seat } from "./helpers/seat.ts";

function night(seats: Seat[], clicks: Array<[number, number]>): NightSettlement {
	const intents: NightIntent[] = [];
	for (const [actor, target] of clicks) putIntent(intents, actor, target);
	return resolveNightIntents(seats, intents, { skipAttacks: false });
}

/** 그 좌석에게 간 줄. 없으면 빈 문자열 */
function reveal(settlement: NightSettlement, index: number): string {
	for (const item of settlement.reveals) {
		if (item.seat === index) return item.line;
	}
	return "";
}

describe("사기꾼", () => {
	it("마피아 팀이고 마피아 채팅에 들어간다", () => {
		assert.equal(ROLE_DEFS[Role.CON_ARTIST].team, Team.MAFIA);
		assert.equal(ROLE_DEFS[Role.CON_ARTIST].nightChat, ChatChannel.MAFIA);
	});

	it("밤에 고를 대상이 없다", () => {
		assert.equal(ROLE_DEFS[Role.CON_ARTIST].nightAction, null);
	});

	it("경찰 조사에 마피아로 나오지 않는다", () => {
		// 이 직업의 전부다. appearsAsMafia를 켜지 않는 것 하나로 성립한다
		const seats = [seat(1, Role.POLICE), seat(2, Role.CON_ARTIST)];
		assert.match(reveal(night(seats, [[1, 2]]), 1), /마피아가 아닙니다/);
	});

	it("스파이에게는 정체가 그대로 보이고 합류가 일어난다", () => {
		// 위장은 팀 조사에만 통한다. 직업을 읽는 능력까지 속이면
		// 스파이가 사기꾼을 만났을 때 아무 일도 일어나지 않는다
		const seats = [seat(1, Role.SPY), seat(2, Role.CON_ARTIST)];
		const result = night(seats, [[1, 2]]);
		assert.match(reveal(result, 1), /사기꾼/);
		assert.deepEqual(result.defected, [1]);
	});

	it("조사당하면 다음 아침에 알게 된다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.CON_ARTIST)];
		assert.match(reveal(night(seats, [[1, 2]]), 2), /조사했습니다/);
	});

	it("누가 조사했는지는 알려주지 않는다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.CON_ARTIST)];
		assert.doesNotMatch(reveal(night(seats, [[1, 2]]), 2), /1번/);
	});

	it("여러 명이 조사해도 알림은 한 줄이다", () => {
		// 줄 수가 곧 살아 있는 조사 직업의 수를 알려준다
		const seats = [seat(1, Role.POLICE), seat(2, Role.SPY), seat(3, Role.CON_ARTIST)];
		const result = night(seats, [[1, 3], [2, 3]]);
		const mine = result.reveals.filter(item => item.seat === 3);
		assert.equal(mine.length, 1);
	});

	it("아무도 조사하지 않으면 알림이 없다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.CON_ARTIST), seat(3, Role.CITIZEN)];
		assert.equal(reveal(night(seats, [[1, 3]]), 2), "");
	});

	it("다른 직업은 조사당해도 알림을 받지 않는다", () => {
		const seats = [seat(1, Role.POLICE), seat(2, Role.CITIZEN)];
		assert.equal(reveal(night(seats, [[1, 2]]), 2), "");
	});
});
```

`tests/deck.test.ts`에는 배치 규칙 셋을 덧붙인다.

```ts
describe("사기꾼 배치", () => {
	it("6인 이하에서는 나오지 않는다", () => {
		for (let count = 4; count <= 6; count++) {
			for (let seed = 1; seed <= 40; seed++) {
				assert.ok(
					!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.CON_ARTIST),
					`${count}인`
				);
			}
		}
	});

	it("짐승인간과 함께 나오지 않는다", () => {
		// 둘 다 경찰 조사를 흐리는 직업이다. 한 판에 겹치면 경찰이 얻는
		// 정보가 사실상 없어진다
		for (let count = 7; count <= 12; count++) {
			for (let seed = 1; seed <= 60; seed++) {
				const deck = buildRoleDeck(DECK, count, rngFrom(seed));
				assert.ok(
					!(deck.includes(Role.BEAST) && deck.includes(Role.CON_ARTIST)),
					`${count}인 seed ${seed}`
				);
			}
		}
	});

	it("7인 이상에서는 사기꾼이 나오는 판이 있다", () => {
		let seen = 0;
		for (let seed = 1; seed <= 200; seed++) {
			if (buildRoleDeck(DECK, 9, rngFrom(seed)).includes(Role.CON_ARTIST)) seen++;
		}
		assert.ok(seen > 0, "9인 판에서 사기꾼이 한 번도 안 나왔다");
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test
```

Expected: FAIL — `Role.CON_ARTIST`가 없어 타입부터 깨진다.

- [ ] **Step 3: `Role`에 항목을 더한다**

`src/types/Game.types.ts:53-72`. `BEAST` 아래, `CITIZEN` 위.

```ts
	/** 짐승인간 */
	BEAST: "BEAST",
	/** 사기꾼 */
	CON_ARTIST: "CON_ARTIST",
	CITIZEN: "CITIZEN",
```

`ROLE_DEFS`가 `Record<Role, RoleDef>`이므로 이 줄 하나로 `type-check`가 "정의가 없다"고 잡는다.

- [ ] **Step 4: `RoleDef`에 알림 플래그를 더한다**

`src/domain/Roles.ts`의 선택 필드 묶음에 넣는다.

```ts
	/**
	 * 조사당한 사실을 다음 아침에 본인에게 알린다.
	 *
	 * 사기꾼의 위장은 "마피아가 아니다"라고 나오는 것까지다. 그 위장이
	 * 통했는지 본인이 모르면 다음 날 무엇을 말해야 할지도 모른다.
	 * 누가 조사했는지는 알려주지 않는다 — 그건 경찰을 지목하는 능력이 된다.
	 */
	readonly notifiesOnInspect?: boolean;
```

- [ ] **Step 5: 사기꾼 정의를 더한다**

`ROLE_DEFS`의 `BEAST` 아래, `CITIZEN` 위.

```ts
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
```

- [ ] **Step 6: 파이프라인이 조사당한 좌석을 모은다**

`src/domain/NightPipeline.ts`. Task 5에서 인자가 넷이 된 `apply`를 장부 객체 하나로 묶는다 — 여기서 다섯 번째가 붙기 때문이다.

```ts
/** 이 밤에 쌓이는 것들. apply가 채우고 resolveNightIntents가 돌려준다 */
interface NightLedger {
	readonly reveals: NightReveal[];
	readonly defected: number[];
	/** 조사당한 좌석. 몇 번 당했는지는 세지 않는다 */
	readonly inspected: number[];
}
```

`apply(actor, target, ledger)`로 바꾸고, 본문의 `reveals.push` → `ledger.reveals.push`, `defected.push` → `ledger.defected.push`로 바꾼다. 그리고 `INSPECT_TEAM`과 `INSPECT_ROLE` 두 갈래 **모두** 맨 앞에 한 줄을 넣는다.

```ts
		case NightActionKind.INSPECT_TEAM:
			markInspected(ledger, target.index);
			...
		case NightActionKind.INSPECT_ROLE:
			markInspected(ledger, target.index);
			...
```

```ts
function markInspected(ledger: NightLedger, index: number): void {
	if (ledger.inspected.indexOf(index) < 0) ledger.inspected.push(index);
}

/**
 * 조사당한 사실을 본인에게 알린다. 사기꾼처럼 지목할 대상이 없는 직업은
 * intent 루프에 걸리지 않으므로 여기서 따로 돈다.
 *
 * 한 좌석당 한 줄이다. 두 번 조사당했다고 두 줄이 가면 그 줄 수가 곧
 * 살아 있는 조사 직업의 수를 알려준다.
 */
function notifyInspected(seats: readonly Seat[], wasAlive: readonly number[], ledger: NightLedger): void {
	for (const seat of seats) {
		if (wasAlive.indexOf(seat.index) < 0) continue;
		if (roleDef(seat.role).notifiesOnInspect !== true) continue;
		if (ledger.inspected.indexOf(seat.index) < 0) continue;
		ledger.reveals.push({
			seat: seat.index,
			line: "🎭 어젯밤 누군가 당신을 조사했습니다.",
		});
	}
}
```

`resolveNightIntents`의 앞머리와 루프.

```ts
	const ledger: NightLedger = { reveals: [], defected: [], inspected: [] };
	let casualties: NightCasualty[] = [];
```
```ts
		if (step === NightStep.ATTACK && opts.skipAttacks) continue;
		// 지목 없이 일어나는 사후 처리. INSPECT가 이미 지나간 뒤다
		if (step === NightStep.AFTER) notifyInspected(seats, wasAlive, ledger);

		for (const seat of seats) {
			if (wasAlive.indexOf(seat.index) < 0) continue;
			if (roleDef(seat.role).nightStep !== step) continue;
			const target = targetOf(seats, intents, seat.index);
			if (!target) continue;
			apply(seat, target, ledger);
		}
	}

	return { casualties, reveals: ledger.reveals, defected: ledger.defected };
```

- [ ] **Step 7: 덱에 넣는다**

`src/domain/RuleSet.ts`의 `STANDARD_RULES.deck`. 세 줄이 바뀐다.

```ts
	mafiaPool: [Role.MAFIA, Role.BEAST, Role.CON_ARTIST],
	// 둘 다 경찰 조사를 흐린다. 한 판에 겹치면 경찰이 얻는 정보가 사실상 없다
	exclusiveGroups: [[Role.BEAST, Role.CON_ARTIST]],
	minPlayers: { BEAST: 6, CON_ARTIST: 7, SHAMAN: 8, REPORTER: 11 },
```

`leadPool`에는 **넣지 않는다.** 사기꾼은 아무도 죽이지 않으므로 혼자 남으면 게임이 끝나지 않는다. Task 3의 `killsIndependently` 판정이 리드 자리를 지키고 있고, 사기꾼을 리드 후보에 넣지 않는 것이 그 판정을 다시 확인할 필요도 없게 만든다.

속도전(`BLITZ_RULES`)은 `mafiaPool: [Role.MAFIA]`이라 영향이 없고, 침묵전은 `STANDARD_RULES`의 값을 그대로 참조하므로 자동으로 따라온다.

- [ ] **Step 8: 전체 검증**

```bash
npm run verify
```

Expected: 전부 통과. Task 3에서 남겨 둔 **12인 판 마피아 구성 고정**도 여기서 풀린다 — `mafiaPool`이 셋이 되고 배타 규칙이 짐승인간·사기꾼을 갈라놓으므로, 마피아 3인 판의 구성이 `마피아+짐승인간+마피아`와 `마피아+사기꾼+마피아` 사이에서 갈린다.

- [ ] **Step 9: 커밋**

```bash
git add src/types/Game.types.ts src/domain/Roles.ts src/domain/NightPipeline.ts src/domain/RuleSet.ts tests/roles-season1.test.ts tests/deck.test.ts
git commit -m "feat(roles): add the con artist

경찰 조사에 시민으로 나오는 마피아 팀. appearsAsMafia를 켜지 않는 것이
능력의 전부라 기존 판정은 한 줄도 바뀌지 않는다.

조사당하면 다음 아침에 그 사실만 알게 된다 — 누가 했는지는 알려주지
않는다. 그건 경찰을 지목하는 능력이 된다.
짐승인간과는 같은 판에 나오지 않는다. 둘 다 경찰 조사를 흐리므로
겹치면 경찰이 얻는 정보가 사실상 없어진다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: 점쟁이 + `firstNightOnly`

첫 투표가 제비뽑기인 상태를 깬다. 첫 밤 무사(Task 1)와 짝이다 — 아무도 죽지 않는 대신
아주 약한 정보 한 조각은 존재하게 한다.

점쟁이가 얻는 것은 **"저 사람이 밤에 지목하는 직업인가"** 하나뿐이다. 진영은 알 수 없고,
답이 "없음"인 직업이 시민팀에 넷(영매·군인·정치인·시민)이나 있어서 확정 정보가 되지 않는다.
그 넷이 이 직업을 성립시키는 유일한 장치다 — 사기꾼만 "없음"이면 점쟁이는 마피아 탐지기가 된다.

**Files:**
- Modify: `src/types/Game.types.ts:53-72` (`Role.SEER`)
- Modify: `src/domain/Roles.ts:33-47`(`INSPECT_ABILITY`), `:82-152`(`firstNightOnly`), `:159-351`(점쟁이 항목)
- Modify: `src/domain/NightResolution.ts:72-89` (`noTurnReason`)
- Modify: `src/domain/NightPipeline.ts` (`apply`의 새 갈래)
- Modify: `src/domain/RuleSet.ts` (`STANDARD_RULES.deck`)
- Test: `tests/roles-season1.test.ts` (Task 6이 만들었다), `tests/deck.test.ts`

**Interfaces:**
- Consumes: Task 4의 `NightStep`·`resolveNightIntents`, Task 5의 `NightReveal`, Task 6의 `NightLedger`·`markInspected`, Task 3의 `minPlayers`.
- Produces:
  - `Role.SEER = "SEER"`
  - `NightActionKind.INSPECT_ABILITY = "INSPECT_ABILITY"`
  - `RoleDef.firstNightOnly?: boolean` — 첫 밤에만 차례가 있다. Task 8의 `maxUses`와 **다른 축**이다(횟수가 아니라 시점).

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/roles-season1.test.ts`의 임포트에 두 줄을 더한다.

```ts
import { hasNightTurn, nightActionBlockedReason } from "../src/domain/NightResolution.ts";
```

파일 끝에 `describe`를 붙인다.

```ts
describe("점쟁이", () => {
	it("첫 밤에는 차례가 있다", () => {
		// turnCount는 밤이 끝날 때 오르므로 첫 밤 동안에는 0이다
		assert.equal(hasNightTurn(seat(1, Role.SEER), 0), true);
	});

	it("둘째 밤부터는 차례가 없다", () => {
		assert.equal(hasNightTurn(seat(1, Role.SEER), 1), false);
		assert.equal(hasNightTurn(seat(1, Role.SEER), 5), false);
	});

	it("차례가 없는 이유를 문장으로 알려준다", () => {
		// 이 문장이 곧 밤 화면의 안내다. null이면 격자가 열리는데 누를 것이 없다
		const reason = nightActionBlockedReason(seat(1, Role.SEER), 1);
		assert.match(reason ?? "", /첫 밤/);
	});

	it("능력을 가진 직업은 '있습니다'로 나온다", () => {
		const seats = [seat(1, Role.SEER), seat(2, Role.DOCTOR)];
		assert.match(reveal(night(seats, [[1, 2]]), 1), /있습니다/);
	});

	it("자경단원은 첫 밤에 못 쓰지만 '있습니다'다", () => {
		// 판정 기준은 보유다. "오늘 쓸 수 있는가"로 바꾸면 첫 밤의 점괘가
		// needsPriorDay 직업 목록을 그대로 흘린다
		const seats = [seat(1, Role.SEER), seat(2, Role.VIGILANTE)];
		assert.match(reveal(night(seats, [[1, 2]]), 1), /있습니다/);
	});

	it("점쟁이 자신도 '있습니다'다", () => {
		const seats = [seat(1, Role.SEER)];
		assert.match(reveal(night(seats, [[1, 1]]), 1), /있습니다/);
	});

	it("사기꾼은 '없습니다'로 나온다", () => {
		const seats = [seat(1, Role.SEER), seat(2, Role.CON_ARTIST)];
		assert.match(reveal(night(seats, [[1, 2]]), 1), /없습니다/);
	});

	it("사기꾼은 점을 당한 것도 알아챈다", () => {
		// 점쟁이만 빼면 사기꾼을 안전하게 걸러내는 경로가 하나 생긴다
		const seats = [seat(1, Role.SEER), seat(2, Role.CON_ARTIST)];
		assert.match(reveal(night(seats, [[1, 2]]), 2), /조사했습니다/);
	});

	it("영매·군인·정치인·시민도 '없습니다'다", () => {
		// 사기꾼과 같은 답을 내는 시민이 넷 있는 것이, 이 직업이 확정 정보가
		// 되지 않게 하는 유일한 장치다
		for (const role of [Role.SHAMAN, Role.SOLDIER, Role.POLITICIAN, Role.CITIZEN]) {
			const seats = [seat(1, Role.SEER), seat(2, role)];
			assert.match(reveal(night(seats, [[1, 2]]), 1), /없습니다/, role);
		}
	});

	it("진영은 한 글자도 새지 않는다", () => {
		const seats = [seat(1, Role.SEER), seat(2, Role.MAFIA)];
		const line = reveal(night(seats, [[1, 2]]), 1);
		assert.doesNotMatch(line, /마피아|시민/);
	});
});
```

`tests/deck.test.ts`에 배치 규칙 둘을 덧붙인다.

```ts
describe("점쟁이 배치", () => {
	it("5인 이하에서는 나오지 않는다", () => {
		// 첫 밤 무사가 없는 인원대다. 점괘를 들고 낮을 맞기 전에 사람이 죽는다
		for (let count = 4; count <= 5; count++) {
			for (let seed = 1; seed <= 40; seed++) {
				assert.ok(
					!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.SEER),
					`${count}인`
				);
			}
		}
	});

	it("6인 이상에서는 점쟁이가 나오는 판이 있다", () => {
		let seen = 0;
		for (let seed = 1; seed <= 200; seed++) {
			if (buildRoleDeck(DECK, 8, rngFrom(seed)).includes(Role.SEER)) seen++;
		}
		assert.ok(seen > 0, "8인 판에서 점쟁이가 한 번도 안 나왔다");
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test
```

Expected: FAIL. `Role.SEER`가 없어 타입 오류가 먼저 난다 — `node --test`는 타입을 보지 않으므로 런타임에서는 `ROLE_DEFS[undefined]`를 읽다 죽는다. 어느 쪽이든 실패다.

- [ ] **Step 3: `Role.SEER`를 더한다**

`src/types/Game.types.ts`. 시민팀 직업들 사이, `CITIZEN` 바로 위에 넣는다.

```ts
	/** 짐승인간 */
	BEAST: "BEAST",
	/** 사기꾼 */
	CON_ARTIST: "CON_ARTIST",
	/** 점쟁이 */
	SEER: "SEER",
	CITIZEN: "CITIZEN",
```

`ROLE_DEFS`가 `Record<Role, RoleDef>`이므로 이 시점에서 `Roles.ts`가 컴파일되지 않는다. 다음 두 스텝이 그것을 메운다.

- [ ] **Step 4: `INSPECT_ABILITY`와 `firstNightOnly`를 더한다**

`src/domain/Roles.ts:33-47`의 `NightActionKind`. `SCOOP` 아래에 붙인다.

```ts
	/** 기자: 대상의 직업을 다음 아침에 전체 공개한다 */
	SCOOP: "SCOOP",
	/** 점쟁이: 대상이 밤에 지목하는 직업인지만 확인 */
	INSPECT_ABILITY: "INSPECT_ABILITY",
```

`RoleDef`의 플래그 구역(`:123` `oncePerGame` 옆)에 한 줄.

```ts
	/**
	 * 첫 밤에만 쓸 수 있는가 (점쟁이).
	 *
	 * needsPriorDay의 정반대다. 저쪽은 "정보 없이 쓰면 주사위가 되는" 능력을
	 * 늦추고, 이쪽은 "정보가 다 모인 뒤에는 의미가 없는" 능력을 첫 밤에 묶는다.
	 * 횟수 제한(Task 8의 maxUses)과도 다른 축이다 — 시점을 정한다.
	 */
	readonly firstNightOnly?: boolean;
```

- [ ] **Step 5: 점쟁이 정의를 더한다**

`src/domain/Roles.ts`의 `ROLE_DEFS`. `CITIZEN` 항목 바로 위에 넣는다.

```ts
	SEER: {
		displayName: "점쟁이",
		team: Team.CITIZEN,
		glyph: "🃏",
		ability: "첫 밤에만, 한 명이 밤에 쓸 능력을 가졌는지 봅니다.",
		tip: "진영은 알 수 없습니다. 언제 말할지가 당신의 유일한 선택입니다.",
		nightAction: NightActionKind.INSPECT_ABILITY,
		nightChat: null,
		// 그림이 없어서가 아니라 새면 안 되어서 null이다. 밤에 목격된 모습이
		// 곧 직업표가 되면 정보직 시민은 첫 밤에 사라진다
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "점을 볼 대상을 선택하세요. 첫 밤에만 가능합니다.",
		nightNotice: NO_CHAT,
		nightStep: NightStep.INSPECT,
		immuneToVote: false,
		firstNightOnly: true,
	},
```

`maxUses`는 필요 없다. 첫 밤 하나뿐이고 그 밤 안에서는 `usedSkill`이 두 번째 지목을 막는다.

- [ ] **Step 6: `noTurnReason`에 시점 분기를 넣는다**

`src/domain/NightResolution.ts:72-89`. `needsPriorDay` 분기 **위**에 넣는다 — 둘 다 시점 조건이고, 점쟁이는 `needsPriorDay`를 켜지 않으므로 순서가 결과를 바꾸지는 않는다. 읽는 순서를 "첫 밤이라 된다 / 첫 밤이라 안 된다"로 붙여 두는 것이다.

```ts
	if (def.firstNightOnly && turnCount > 0) {
		return "첫 밤에만 쓸 수 있는 능력입니다. 이제는 지켜보세요.";
	}
	if (def.needsPriorDay && turnCount === 0) {
		return "첫 밤에는 쓸 수 없습니다. 낮의 이야기를 듣고 내일 밤에 쓰세요.";
	}
```

이 한 줄이 세 곳을 한꺼번에 정한다 — 밤 위젯이 격자를 열지(`openNightView`), 조작된 `select`를 서버가 받을지(`bindNightWidget`), 그리고 `nightProgress`의 분모에 들어갈지. 셋 다 같은 함수를 보므로 갈라질 수 없다.

- [ ] **Step 7: 파이프라인이 점괘를 만든다**

`src/domain/NightPipeline.ts`의 `apply`. `INSPECT_ROLE` 갈래 아래에 붙인다.

```ts
		case NightActionKind.INSPECT_ABILITY:
			// 점도 조사다. 여기만 markInspected를 빼면 사기꾼을 안전하게
			// 걸러내는 경로가 하나 생긴다
			markInspected(ledger, target.index);
			// "가졌는가"이지 "오늘 쓸 수 있는가"가 아니다. 뒤쪽으로 정의하면
			// 첫 밤의 점괘가 needsPriorDay 직업 목록을 그대로 흘린다
			ledger.reveals.push({
				seat: actor.index,
				line:
					roleDef(target.role).nightAction !== null
						? `🃏 ${target.index}번은 밤에 쓸 능력이 있습니다.`
						: `🃏 ${target.index}번은 밤에 쓸 능력이 없습니다.`,
			});
			return;
```

`nightStep`이 `INSPECT`라 배달 시점은 경찰·스파이와 같다. `Room.nightReveals`도 `deliverNightReveals`도 그대로 쓴다 — Task 5가 만든 경로에 갈래 하나가 붙은 것뿐이다.

- [ ] **Step 8: 덱에 넣는다**

`src/domain/RuleSet.ts`의 `STANDARD_RULES.deck`. 두 줄이 바뀐다.

```ts
		citizenPool: [
			Role.POLITICIAN, Role.SHAMAN, Role.SPY,
			Role.SOLDIER, Role.REPORTER, Role.VIGILANTE, Role.SEER,
		],
		// SEER: 6인 미만은 첫 밤 무사가 없는 인원대다(FIRST_NIGHT_PEACEFUL_UP_TO)
		minPlayers: { BEAST: 6, SEER: 6, CON_ARTIST: 7, SHAMAN: 8, REPORTER: 11 },
```

속도전(`BLITZ_RULES`)에는 넣지 않는다 — 다섯 직업 원칙을 유지한다. 침묵전은 `STANDARD_RULES`를 참조하므로 자동으로 따라온다.

배타 그룹에도 넣지 않는다. 경찰과 겹쳐도 서로의 정보를 흐리지 않는다 — 묻는 것이 다르다.

- [ ] **Step 9: 전체 검증**

```bash
npm run verify
```

Expected: 전부 통과.

- [ ] **Step 10: 커밋**

```bash
git add src/types/Game.types.ts src/domain/Roles.ts src/domain/NightResolution.ts src/domain/NightPipeline.ts src/domain/RuleSet.ts tests/roles-season1.test.ts tests/deck.test.ts
git commit -m "feat(roles): add the seer and firstNightOnly

첫 밤에만 한 명이 '밤에 지목하는 직업인가'를 본다. 진영은 알 수 없다.

첫 투표가 제비뽑기인 상태를 깨는 것이 목적이고, 첫 밤 무사와 짝이다 —
아무도 죽지 않는 대신 약한 정보 한 조각은 존재하게 한다.

판정 기준은 능력의 보유다. '오늘 쓸 수 있는가'로 정의하면 첫 밤의
점괘가 needsPriorDay 직업 목록을 그대로 흘린다.
답이 '없음'인 직업이 시민팀에 넷(영매·군인·정치인·시민) 있어서
확정 정보가 되지 않는다. 그 넷이 이 직업을 성립시킨다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: `maxUses` + 시민 익명 쪽지

시민은 밤에 할 일이 없다. 인원의 3분의 1이 매일 밤 22초를 빈 화면으로 보낸다.

정보를 주면 시민이 아니게 되므로, **유통**만 준다. 게임당 한 번, 한 명에게 정해진 문구
하나를 익명으로 보낸다. 아는 것은 늘지 않지만 낮에 할 말이 생긴다.

그리고 그 "게임당 한 번"이 `oncePerGame`(불리언)으로는 표현이 끝나는 자리다.
자경단원·기자·시민 셋이 같은 플래그를 쓰는 순간, 두 번 쓰는 직업이 하나만 나와도
플래그가 하나 더 늘어난다. 횟수로 바꾼다.

**Files:**
- Modify: `src/types/Game.types.ts:150` (`skillSpent` → `usesSpent`), `Seat`에 `noteText`
- Modify: `src/entities/Room.ts:66`, `:89`, `:241-259`
- Modify: `src/domain/Roles.ts:33-47`(`NOTE`), `:123-124`(`maxUses`), `:159-351`(자경단원·기자·시민)
- Modify: `src/domain/NightResolution.ts:19-34`(`needsPhrase`), `:72-89`(`noTurnReason`), `recordNightIntent`
- Modify: `src/domain/NightPipeline.ts` (`apply`의 반환값·`NOTE` 갈래, `intentTarget` 공개)
- Modify: `src/domain/chat/QuickPhrases.ts` (`QUICK_NOTE`)
- Modify: `src/services/Night.ts` (`bindNightWidget`, `nightProgress`)
- Modify: `src/ui/roleAction.html`, `tools/widget-scenes.js`
- Test: `tests/roles-season1.test.ts`, `tests/domain.test.ts`, `tests/night-pipeline.test.ts`, `tests/helpers/seat.ts`(필드 이름 변경)

**Interfaces:**
- Consumes: Task 4의 `putIntent`·`NightLedger`, Task 5의 `NightReveal`·`deliverNightReveals`, Task 7의 `firstNightOnly`.
- Produces:
  - `RoleDef.maxUses?: number` — `oncePerGame`을 **대체한다**(지운다).
  - `Seat.usesSpent: number` — `skillSpent: boolean`을 **대체한다**. 정산 시점에만 오른다.
  - `Seat.noteText: string` — 이번 밤에 고른 쪽지 문구. 빈 문자열이면 아직 안 골랐다.
  - `NightActionKind.NOTE = "NOTE"`
  - `NightSelectResult.needsPhrase?: boolean` — 지목만으로 끝나지 않는 능력.
  - `QUICK_NOTE: string[]` — `src/domain/chat/QuickPhrases.ts`에서 export.
  - `intentTarget(intents: readonly NightIntent[], actor: number): number` — 지목이 없으면 `0`(좌석 번호는 1부터다).
  - 위젯 계약 두 개: 서버→위젯 `{ type: "phrases", num, options }`, 위젯→서버 `{ type: "phrase", index }`.

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/roles-season1.test.ts` 파일 끝에 붙인다. `night()` 헬퍼는 Task 6이 만든 것을 그대로 쓴다.

```ts
describe("시민의 익명 쪽지", () => {
	it("대상에게 문구가 그대로 간다", () => {
		const sender = seat(1, Role.CITIZEN, { noteText: "당신을 믿습니다" });
		const seats = [sender, seat(2, Role.DOCTOR)];
		assert.match(reveal(night(seats, [[1, 2]]), 2), /당신을 믿습니다/);
	});

	it("보낸 사람은 드러나지 않는다", () => {
		// 익명이 아니면 시민이 정보원이 된다. 그 순간 시민이 밤의 표적이 된다
		const sender = seat(1, Role.CITIZEN, { noteText: "당신이 의심됩니다" });
		const seats = [sender, seat(2, Role.DOCTOR)];
		assert.doesNotMatch(reveal(night(seats, [[1, 2]]), 2), /1번/);
	});

	it("문구를 고르기 전에 밤이 끝나면 아무것도 가지 않는다", () => {
		const sender = seat(1, Role.CITIZEN);
		const seats = [sender, seat(2, Role.DOCTOR)];
		assert.equal(reveal(night(seats, [[1, 2]]), 2), "");
	});

	it("문구를 안 골랐으면 사용 횟수도 안 줄어든다", () => {
		const sender = seat(1, Role.CITIZEN);
		night([sender, seat(2, Role.DOCTOR)], [[1, 2]]);
		assert.equal(sender.usesSpent, 0);
	});

	it("보내면 사용 횟수가 오른다", () => {
		const sender = seat(1, Role.CITIZEN, { noteText: "오늘은 조용히 계세요" });
		night([sender, seat(2, Role.DOCTOR)], [[1, 2]]);
		assert.equal(sender.usesSpent, 1);
	});

	it("대상이 그 밤에 죽으면 배달되지 않는다", () => {
		// AFTER step이라 DEATH는 이미 지나갔다. 죽은 사람의 화면에 아침에
		// 쪽지가 뜨면 그건 유령에게 가는 정보다
		const sender = seat(1, Role.CITIZEN, { noteText: "내일 나서 주세요" });
		const seats = [sender, seat(2, Role.MAFIA), seat(3, Role.DOCTOR)];
		const result = night(seats, [[1, 3], [2, 3]]);
		assert.equal(seats[2].alive, false);
		assert.equal(reveal(result, 3), "");
	});

	it("한 번 쓰면 다음 밤에는 차례가 없다", () => {
		assert.equal(hasNightTurn(seat(1, Role.CITIZEN, { usesSpent: 1 }), 2), false);
		assert.match(
			nightActionBlockedReason(seat(1, Role.CITIZEN, { usesSpent: 1 }), 2) ?? "",
			/다 썼습니다/
		);
	});

	it("쓴 그 밤까지는 차례에 남는다", () => {
		// 밤이 끝날 때 오르는 값이라 그 밤 동안에는 usedSkill만 켜져 있다
		const tonight = seat(1, Role.CITIZEN, { usedSkill: true });
		assert.equal(hasNightTurn(tonight, 1), true);
	});
});
```

`tests/domain.test.ts`의 `describe("밤 차례 판정")`에 한 줄짜리 테스트를 더한다.

```ts
	it("횟수 제한은 직업이 아니라 maxUses가 정한다", () => {
		// oncePerGame(불리언)이었을 때는 "두 번 쓰는 직업"을 넣는 순간
		// 플래그가 하나 더 늘어나야 했다
		assert.equal(ROLE_DEFS[Role.VIGILANTE].maxUses, 1);
		assert.equal(ROLE_DEFS[Role.REPORTER].maxUses, 1);
		assert.equal(ROLE_DEFS[Role.CITIZEN].maxUses, 1);
		assert.equal(ROLE_DEFS[Role.DOCTOR].maxUses, undefined);
	});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test
```

Expected: FAIL — `noteText`·`usesSpent`가 `Seat`에 없다.

- [ ] **Step 3: 좌석에 두 필드를 넣는다**

`src/types/Game.types.ts`. `skillSpent`(`:150`) 자리를 바꾼다.

```ts
	/**
	 * 능력을 지금까지 몇 번 썼는가. maxUses와 짝이다.
	 *
	 * 불리언(skillSpent)이었다. 게임당 한 번뿐인 직업이 둘일 때는 그것으로
	 * 충분했지만, 횟수가 다른 직업이 하나만 생겨도 플래그가 늘어난다.
	 *
	 * 오르는 시점은 **정산**이다. 클릭 시점이 아니다 — 막히는 능력(건달)이
	 * 들어오면 막힌 자경단원이 총알을 잃은 채로 남는다.
	 */
	usesSpent: number;
	/**
	 * 이번 밤에 고른 쪽지 문구. 안 골랐으면 빈 문자열.
	 *
	 * NightIntent에 얹지 않는 이유는 putIntent가 {actor, target}을 통째로
	 * 교체하기 때문이다. 거기 세 번째 필드를 넣으면 대상을 바꿀 때마다
	 * 고른 문구가 사라진다.
	 */
	noteText: string;
```

- [ ] **Step 4: `Room.ts` 세 곳을 맞춘다**

`createSeat`(`:66`).

```ts
		usedSkill: false,
		usesSpent: 0,
		noteText: "",
```

`assignRole`(`:89`).

```ts
	seat.usesSpent = 0;
	seat.noteText = "";
	seat.usedSkill = false;
```

`resetRound`(`:241-259`). 주석의 이름을 고치고, 문구는 **매 밤 지운다**.

```ts
/**
 * 밤/투표 한 턴이 시작될 때 초기화되는 값 (기존 tagReset).
 *
 * armored(군인의 방탄)와 usesSpent(횟수 제한 능력의 소모)는 **일부러 남긴다.**
 * 게임당 정해진 자원이라 밤이 바뀔 때마다 되돌아오면 능력이 무제한이 된다.
 * 소모는 각각 resolveNightCasualties와 NightPipeline에서만 일어나고,
 * 되돌리는 곳은 assignRole(게임 시작) 하나뿐이다.
 */
export function resetRound(room: Room): void {
	room.voteRecord = emptyVoteRecord();
	room.nightIntents = [];
	room.nightReveals = [];
	for (const seat of room.seats) {
		seat.usedSkill = false;
		// 지난밤에 고른 문구가 남으면 대상만 새로 찍어도 옛 문구가 다시 날아간다
		seat.noteText = "";
		seat.votedFor = 0;
```

- [ ] **Step 5: `oncePerGame`을 `maxUses`로 바꾼다**

`src/domain/Roles.ts:123-124`. 한 줄을 지우고 한 줄을 넣는다.

```ts
	/**
	 * 게임 전체에서 쓸 수 있는 횟수. 없으면 무제한 (자경단원·기자·시민이 1).
	 *
	 * 불리언 oncePerGame이었다. 세 직업이 같은 플래그를 쓰게 된 시점에서,
	 * 두 번 쓰는 직업이 하나만 나와도 플래그가 하나 더 늘어난다.
	 */
	readonly maxUses?: number;
```

`VIGILANTE`(`:269`)와 `REPORTER`(`:316`)의 `oncePerGame: true,`를 `maxUses: 1,`로 바꾼다.

- [ ] **Step 6: `NOTE`와 시민 정의**

`src/domain/Roles.ts`의 `NightActionKind`에 한 줄.

```ts
	/** 점쟁이: 대상이 밤에 지목하는 직업인지만 확인 */
	INSPECT_ABILITY: "INSPECT_ABILITY",
	/** 시민: 대상에게 정해진 문구 하나를 익명으로 보낸다 */
	NOTE: "NOTE",
```

`ROLE_DEFS.CITIZEN`을 고친다. `nightAction: null`이던 자리다.

```ts
	CITIZEN: {
		displayName: "시민",
		team: Team.CITIZEN,
		glyph: "👤",
		ability: "게임당 한 번, 한 명에게 익명 쪽지를 보냅니다.",
		tip: "아는 것은 없지만 말을 옮길 수는 있습니다. 누구에게 언제 보낼지가 전부입니다.",
		nightAction: NightActionKind.NOTE,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "쪽지를 보낼 대상을 선택하세요. 게임당 한 번입니다.",
		nightNotice: NO_CHAT,
		nightStep: NightStep.AFTER,
		immuneToVote: false,
		maxUses: 1,
	},
```

`displayName`·`glyph`·`immuneToVote`는 지금 값 그대로다 — 실제 파일의 값이 위와 다르면 **그 값을 유지하고** `ability`·`tip`·`nightAction`·`nightPrompt`·`maxUses` 다섯 줄만 바꾼다.

`nightStep`이 `AFTER`인 것이 핵심이다. 쪽지는 아무것도 막지 않고 아무도 죽이지 않으므로 밤의 마지막에 서고, 그래서 "대상이 오늘 죽었는가"를 이미 아는 상태에서 배달을 정할 수 있다.

- [ ] **Step 7: `noTurnReason`에 횟수 분기를 넣는다**

`src/domain/NightResolution.ts`. `oncePerGame` 분기를 통째로 대체한다.

```ts
	// usesSpent만 보면 방금 이번 밤에 쓴 사람도 "차례가 없다"가 되어 분모에서
	// 빠진다. 이번 밤에 쓴 것은 위 usedSkill이 답할 몫이다
	if (def.maxUses !== undefined && seat.usesSpent >= def.maxUses && !seat.usedSkill) {
		return "능력을 쓸 수 있는 횟수를 다 썼습니다. 이번 밤은 지켜보세요.";
	}
```

- [ ] **Step 8: 쪽지 문구셋**

`src/domain/chat/QuickPhrases.ts`. `QUICK_NONE` 아래에 붙이고 **export 한다** — 이 배열은 채팅창이 아니라 밤 위젯이 쓴다.

```ts
/**
 * 시민의 익명 쪽지 문구.
 *
 * 자유 입력이 아닌 이유가 이 직업의 전부다. 자유롭게 쓸 수 있으면
 * "나는 3번을 조사했고 마피아였다"가 되어 시민이 경찰의 확성기가 된다.
 * 고정 문구 여섯 개는 방향만 옮기고 근거는 못 옮긴다.
 *
 * 번호를 넣지 않는 것도 같은 이유다. "3번을 의심하세요"가 되면
 * 쪽지 한 장이 곧 지목이 된다.
 */
export const QUICK_NOTE: string[] = [
	"당신을 믿습니다",
	"당신이 의심됩니다",
	"오늘은 조용히 계세요",
	"내일 나서 주세요",
	"저에게 투표하지 마세요",
	"우리 편이라면 신호를 주세요",
];
```

- [ ] **Step 9: 지목이 문구를 요구하게 한다**

`src/domain/NightResolution.ts`의 `NightSelectResult`. Task 5가 `joinedMafia`를 지운 자리에 넣는다.

```ts
	/** 방 전체에 재생할 사운드 */
	roomSound?: string;
	/**
	 * 지목만으로 끝나지 않는 능력인가 (쪽지).
	 *
	 * 서비스가 NightActionKind를 보고 분기하지 않게 하려고 여기 둔다.
	 * Night.ts의 약속은 "직업이 늘어도 이 파일은 안 고친다"이고,
	 * 그 약속은 직업이 아니라 행동으로 분기해도 깨진다.
	 */
	needsPhrase?: boolean;
```

`recordNightIntent`의 `switch`에 갈래 하나.

```ts
		case NightActionKind.NOTE:
			// 아직 소모하지 않는다. 문구를 고르는 두 번째 클릭이 소모한다 —
			// 여기서 usedSkill을 켜면 문구를 안 고르고 나간 사람도 쓴 것이 된다
			return {
				consumed: false,
				confirmed: false,
				label: `${target.index}번에게 보낼 문구를 고르세요.`,
				needsPhrase: true,
			};
```

- [ ] **Step 10: 파이프라인이 횟수를 세고 쪽지를 배달한다**

`src/domain/NightPipeline.ts`. `apply`가 **"능력을 실제로 썼는가"** 를 돌려주게 한다. 기존 `return;` 은 전부 `return true;`, `default:` 는 `return false;` 다.

```ts
/**
 * 이 능력이 대상에 남기는 흔적. 정산이 나중에 읽는다.
 *
 * 돌려주는 값은 "능력을 실제로 썼는가"다. 사용 횟수를 이 값으로 센다 —
 * 지목했다는 사실만으로 세면 쪽지 문구를 안 고르고 나간 시민이 한 장을
 * 날린다. 막는 능력(건달)이 들어오면 이 값이 그대로 "막히면 안 닳는다"가 된다.
 */
function apply(actor: Seat, target: Seat, ledger: NightLedger): boolean {
	const def = roleDef(actor.role);
	switch (def.nightAction) {
		case NightActionKind.HEAL:
			target.healed = true;
			return true;
```

새 갈래를 `INSPECT_ABILITY` 아래에 붙인다.

```ts
		case NightActionKind.NOTE:
			// 문구를 고르기 전에 밤이 끝났다. 보낼 것이 없으므로 쓴 것도 아니다
			if (!actor.noteText) return false;
			// AFTER step이라 DEATH는 이미 지나갔다. 여기서 보는 target.alive는
			// "오늘 아침에 살아 있는가"다 — 유령에게 가는 쪽지를 막는다
			if (!target.alive) return false;
			ledger.reveals.push({
				seat: target.index,
				line: `✉️ **익명 쪽지:** ${actor.noteText}`,
			});
			return true;

		default:
			return false;
	}
}
```

`resolveNightIntents`의 루프 마지막 줄이 바뀐다.

```ts
			const target = targetOf(seats, intents, seat.index);
			if (!target) continue;
			// 실제로 적용된 것만 센다. 지목만으로 세면 쪽지를 안 보낸 시민이
			// 한 장을 날리고, Task 10에서는 막힌 사람이 능력을 잃는다
			if (apply(seat, target, ledger)) seat.usesSpent++;
```

- [ ] **Step 11: 지목한 번호를 서비스가 읽을 수 있게 한다**

같은 파일. `targetOf` 위에 export 함수 하나.

```ts
/**
 * 이 좌석이 지목한 대상 번호. 지목이 없으면 0이다 — 좌석 번호는 1부터다.
 *
 * 쪽지의 두 번째 클릭(문구 고르기)은 대상을 다시 보내지 않는다. 위젯이
 * 대상을 다시 보내게 하면 조작된 메시지가 문구와 대상을 함께 정할 수 있다.
 */
export function intentTarget(intents: readonly NightIntent[], actor: number): number {
	for (const intent of intents) {
		if (intent.actor === actor) return intent.target;
	}
	return 0;
}
```

- [ ] **Step 12: 밤 위젯 핸들러를 2단으로 만든다**

`src/services/Night.ts`. 임포트가 셋 늘어난다.

```ts
import { inMafiaChat, NightActionKind, roleDef, roleName } from "../domain/Roles.ts";
import { intentTarget, putIntent, resolveNightIntents } from "../domain/NightPipeline.ts";
import { QUICK_NOTE } from "../domain/chat/QuickPhrases.ts";
```

`bindNightWidget`(`:230-271`)의 머리를 바꾼다. 지금은 `select`가 아니면 즉시 반환한다.

```ts
function bindNightWidget(widget: ScriptWidget): void {
	bindMessage(widget, "roleAction", (sender, data) => {
		const kind = messageType(data);
		if (kind !== "select" && kind !== "phrase") return;

		const found = locate(sender.id);
		if (!found) return;
		const room = found.room;
		const seat = found.seat;
		if (room.phase !== GamePhase.NIGHT || !seat.alive) return;

		if (kind === "phrase") {
			chooseNotePhrase(room, seat, sender, widget, asInt(field(data, "index")));
			return;
		}

		// 위젯을 잠그는 판정과 같은 함수다. 조작된 select가 와도 서버가
		// 같은 근거로 거절하므로, 화면에서 격자가 사라진 상태와 서버가
		// 허용하는 상태가 갈라질 수 없다
		const blocked = nightActionBlockedReason(seat, room.turnCount);
		if (blocked) {
			label(sender, blocked);
			return;
		}

		const targetIndex = asInt(field(data, "num"));
		if (targetIndex === null) return;
		const target = seatAt(room, targetIndex);
		if (!target || !target.alive) return;

		const result = recordNightIntent(seat, target);
		if (!result) return;

		// 적용은 밤이 끝날 때다. 여기서는 "이 사람이 저 사람을 골랐다"만 남긴다
		putIntent(room.nightIntents, seat.index, target.index);

		if (result.consumed) {
			seat.usedSkill = true;
			// 소모되지 않는 지목(쪽지의 첫 클릭 등)은 인원수를 움직이지 않으므로 알리지 않는다
			broadcastNightProgress(room);
		}
		label(sender, result.label, result.labelDurationMs);
		if (result.confirmed) widget.sendMessage({ type: "selectResponse", num: targetIndex });
		if (result.needsPhrase) {
			widget.sendMessage({ type: "phrases", num: targetIndex, options: QUICK_NOTE });
		}
		if (result.privateSound) sender.playSound(result.privateSound);
		if (result.roomSound) playSound(room, result.roomSound);
	});
}
```

`const def = roleDef(seat.role);`(원래 `:248`) 줄도 함께 지운다. 마지막 사용처가 `if (def.oncePerGame) seat.skillSpent = true;`였고 그 줄이 이 스텝에서 없어진다. 남겨 두면 `noUnusedLocals`가 잡는다.

두 번째 클릭을 처리하는 함수를 그 아래에 둔다.

```ts
/**
 * 쪽지의 두 번째 클릭. 대상은 서버가 이미 갖고 있고 문구 번호만 받는다.
 *
 * 대상을 위젯에서 다시 받으면 조작된 메시지 하나가 대상과 문구를 함께
 * 정할 수 있게 된다 — 그러면 밤 위젯이 잠긴 뒤에도 대상을 바꿀 수 있다.
 */
function chooseNotePhrase(
	room: Room,
	seat: Seat,
	sender: ScriptPlayer,
	widget: ScriptWidget,
	index: number | null
): void {
	if (index === null || index < 0 || index >= QUICK_NOTE.length) return;
	if (seat.usedSkill) return;
	const target = intentTarget(room.nightIntents, seat.index);
	if (target === 0) return;

	seat.noteText = QUICK_NOTE[index];
	seat.usedSkill = true;

	label(sender, `✉️ ${target}번에게 쪽지를 보냅니다.\n내일 아침에 도착합니다.`);
	widget.sendMessage({ type: "selectResponse", num: target });
}
```

`nightProgress`(`:175-190`)의 분모에서 쪽지를 뺀다. 진행률은 알리지 않는다 —
분모에서 빠진 사람이 분자를 올리면 그 사람 몫이 진행률에서 영영 빠지고,
무엇보다 쪽지를 안 쓴 시민에게 "오늘 밤 차례가 있는 사람이 몇 명인가"를
매 밤 알려 주게 된다. 그 수의 밤 사이 변화는 처형된 사람이 밤 능력을
가졌는지를 가리킨다 — 게임이 감추는 정보다.

```ts
	for (const seat of room.seats) {
		// 접속이 끊긴 사람은 분모에서 뺀다. 남겨 두면 절대 안 차는 막대가 되고,
		// 그러면 "다 끝났다"를 알리려던 것이 "누군가 뭉개고 있다"로 읽힌다
		if (!seat.alive || !seat.connected) continue;
		if (!hasNightTurn(seat, room.turnCount)) continue;
		// 쪽지는 보내도 되고 안 보내도 되는 능력이다. 분모에 넣으면 막대가
		// 끝까지 안 차고, 그러면 아무 일 없는 밤이 "누가 뭉개고 있다"로 읽힌다
		if (roleDef(seat.role).nightAction === NightActionKind.NOTE) continue;
		total++;
		if (seat.usedSkill) acted++;
	}
```

- [ ] **Step 13: 위젯에 문구 고르기를 붙인다**

`src/ui/roleAction.html`. `<style>` 끝(`:56` `.grid.locked` 규칙 아래)에 붙인다.

```css
			/*
			 * 문구 고르기. 격자와 자리를 바꿔서 뜬다.
			 *
			 * 채팅창의 .quick과 같은 일을 하지만 가로 스크롤을 쓰지 않는다 —
			 * 여섯 문장이 한 줄로 늘어서면 뒤쪽 셋은 있는 줄도 모른다.
			 */
			.choices {
				display: flex;
				flex-direction: column;
				gap: var(--s1);
				padding: var(--s2);
				overflow-y: auto;
			}

			.choices button {
				padding: var(--s2) var(--s3);
				font: inherit;
				font-size: var(--t-sm);
				text-align: left;
				color: var(--ink);
				background: var(--surface-2);
				border: 1px solid var(--line);
				border-radius: var(--r2);
				cursor: pointer;
			}

			.choices button:hover {
				background: var(--surface-3);
			}

			.choices button:focus-visible {
				outline: 2px solid var(--accent);
				outline-offset: 1px;
			}
```

`#body` 안, 격자 다음 줄에 컨테이너를 넣는다.

```html
			<div class="body" id="body">
				<div class="grid scroll" id="grid" role="group" aria-label="지목 대상"></div>
				<div class="choices hidden" id="choices" role="group" aria-label="보낼 문구"></div>
			</div>
```

`<script>`의 `qs("#grid").addEventListener` 아래에 클릭 핸들러를 하나 더 단다.

```js
			qs("#choices").addEventListener("click", event => {
				const el = event.target.closest("button");
				if (!el) return;
				Parent.send({ type: "phrase", index: Number(el.dataset.index) });
			});
```

`init` 핸들러 끝(`if (data.timer)` 줄 위)에 두 줄을 더한다. 밤마다 위젯을 새로 열지만, 열린 채로 `init`이 다시 오는 길이 있으므로 여기서 되돌려 놓는다.

```js
					qs("#choices").classList.add("hidden");
					qs("#choices").innerHTML = "";
```

`Parent.on`에 핸들러 둘을 더한다. `progress` 아래가 자연스럽다.

```js
				/*
				 * 지목만으로 끝나지 않는 능력의 두 번째 화면 (시민의 쪽지).
				 *
				 * 문구 목록을 위젯이 갖고 있지 않은 이유는 나머지 전부와 같다 —
				 * 문구는 기획이 가장 자주 손대는 것이고, 여기 두면 문구 한 줄을
				 * 고치는 일이 위젯 빌드를 다시 돌리는 일이 된다.
				 */
				phrases(data) {
					const options = Array.isArray(data.options) ? data.options : [];
					qs("#grid").classList.add("hidden");
					qs("#choices").classList.remove("hidden");
					qs("#choices").innerHTML = html`${options.map(
						(text, i) => html`<button type="button" data-index="${i}">${text}</button>`
					)}`;
					qs("#note").textContent = `${Number(data.num) || 0}번에게 보낼 문구를 고르세요.`;
				},
```

그리고 기존 `selectResponse`의 마지막 두 줄을 고친다 — 문구를 고른 뒤에도 이 메시지가 오는데, 그때는 격자가 아니라 문구 목록을 물려야 한다.

```js
				selectResponse(data) {
					picked = Number(data.num);
					canPick = false;
					for (const el of qsa(".tile")) {
						const isPick = Number(el.dataset.num) === picked;
						el.classList.toggle("picked", isPick);
						if (!isPick) el.disabled = true;
					}
					// 격자 전체를 물린다. 비활성 타일만으로는 "내 차례가 끝났다"가
					// 아니라 "왜 안 눌리지"로 읽힌다
					qs("#grid").classList.add("locked");
					// 문구를 고르고 온 경우다. 목록을 치우고 격자를 되돌려 놓아야
					// 누구를 골랐는지가 화면에 남는다
					qs("#choices").classList.add("hidden");
					qs("#grid").classList.remove("hidden");
					qs("#note").textContent = `✔ ${picked}번을 지목했습니다.`;
				},
```

- [ ] **Step 14: 위젯 장면을 더한다**

`tools/widget-scenes.js`. 자경단원 장면(`:276-293`) 아래에 넣는다.

```js
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
				prompt: "쪽지를 보낼 대상을 고르세요 (게임당 한 번)",
				seats: SEATS,
				timer: 22,
				note: "게임당 한 번, 한 명에게 익명 쪽지를 보낼 수 있습니다.",
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
	},
```

같은 파일 `:309`의 안내 문구도 새 문장으로 맞춘다 — 화면에 뜨는 그대로를 적어 두는 장면이라 낡으면 그림과 실제가 갈린다.

```js
				note: "능력을 쓸 수 있는 횟수를 다 썼습니다. 이번 밤은 지켜보세요.",
```

- [ ] **Step 15: 좌석 팩토리와 기존 테스트를 맞춘다**

`tests/helpers/seat.ts`(Task 4)에서 `skillSpent: false,`를 `usesSpent: 0,` + `noteText: "",`로 바꾼다. **한 곳이면 된다** — `domain`·`night-pipeline`·`roles-season1` 세 테스트 파일이 모두 이 헬퍼를 임포트한다.

`tests/domain.test.ts:586-597`의 1회성 능력 테스트를 고친다.

```ts
	it("1회성 능력자는 쓴 그 밤까지만 차례에 남는다", () => {
		// 자경단원이 쏘면 그 밤에는 usedSkill만 켜진다. usesSpent는 밤이 끝날 때
		// 파이프라인이 올린다 — 둘을 구분하지 않으면 쏜 사람이 그 밤의 분모에서 사라진다
		const tonight = seat(1, Role.VIGILANTE, { usedSkill: true, usesSpent: 1 });
		assert.equal(hasNightTurn(tonight, 1), true);
		assert.equal(nightActionBlockedReason(tonight, 1), "이미 대상을 선택했습니다.");

		// 다음 밤에는 usedSkill이 초기화되고(resetRound) 차례 자체가 없어진다
		const later = seat(1, Role.VIGILANTE, { usesSpent: 1 });
		assert.equal(hasNightTurn(later, 2), false);
		assert.match(nightActionBlockedReason(later, 2)!, /다 썼습니다/);
	});
```

시민이 밤 차례를 갖게 되면서 깨질 수 있는 곳이 하나 더 있다. `tests/domain.test.ts`에서 `hasNightTurn(seat(_, Role.CITIZEN), _)`가 `false`임을 전제하는 단언이 있으면 **한 번 쓴 뒤**(`usesSpent: 1`)로 바꾼다. 없으면 그대로 둔다.

```bash
grep -n "Role.CITIZEN" tests/domain.test.ts tests/gameflow.test.ts
```

- [ ] **Step 16: 전체 검증**

```bash
npm run verify
```

Expected: 전부 통과. `check:ui`가 새 장면을 렌더하고 `.choices` 경로까지 지나간다.

- [ ] **Step 17: 커밋**

```bash
git add src/types/Game.types.ts src/entities/Room.ts src/domain/Roles.ts src/domain/NightResolution.ts src/domain/NightPipeline.ts src/domain/chat/QuickPhrases.ts src/services/Night.ts src/ui/roleAction.html tools/widget-scenes.js tests/roles-season1.test.ts tests/domain.test.ts tests/night-pipeline.test.ts
git commit -m "feat(roles): give citizens an anonymous note, count uses with maxUses

시민이 인원의 3분의 1인데 밤마다 22초를 빈 화면으로 보냈다.
정보를 주면 시민이 아니게 되므로 유통만 준다 — 게임당 한 번, 한 명에게
고정 문구 하나를 익명으로. 자유 입력이 아닌 것이 이 능력의 전부다.

oncePerGame(불리언)을 maxUses(횟수)로 바꾼다. 같은 플래그를 쓰는 직업이
셋이 된 시점에서, 두 번 쓰는 직업이 하나만 나와도 플래그가 하나 더 는다.

소모는 클릭이 아니라 정산에서 센다. 그래야 문구를 안 고르고 나간 시민이
한 장을 날리지 않고, 나중에 막는 능력이 들어와도 막힌 사람이 능력을 잃지 않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: `SILENCE` 계열 제거

**순수 삭제 하나만 하는 태스크다.** 더하는 것이 한 줄도 없다.

건달이 Task 10에서 `BLOCK`으로 바뀌면 `SILENCE`는 생산자가 영구히 없어진다.
발언 봉쇄는 시즌 2~4 어느 직업에도 계획이 없다.

삭제와 추가를 한 커밋에 섞지 않는 이유는 회귀가 났을 때 어느 쪽인지 알기
위해서다. 이 태스크는 **기존 테스트가 무수정 통과**하는 것이 판정 기준이고,
그래서 새 테스트가 없다.

**`check:ui`가 유일한 그물이다.** `silenced`는 위젯 payload를 타고 `.html`까지
내려가 있는데, `type-check`·`lint`·`test`는 `.html`도 `tools/`도 보지 않는다
(`tsconfig.json`의 `exclude`에 `tools`가 있고 `include`는 `.ts`만 받는다).
UI 두 파일과 `widget-scenes.js`를 빠뜨려도 앞의 셋은 전부 초록불이다.

**Files:**
- Modify: `src/types/Game.types.ts:138-139`
- Modify: `src/entities/Room.ts:63`, `:95`, `:257`
- Modify: `src/domain/Roles.ts:43`(`SILENCE`), `:288-302`(건달 임시 정의)
- Modify: `src/domain/NightPipeline.ts` (`apply`의 `SILENCE` 갈래)
- Modify: `src/domain/chat/ChatPermission.ts:54-55`, `:88`, `:129-141`
- Modify: `src/services/ChatService.ts:110-113`, `:120`, `:136`
- Modify: `src/services/Voting.ts:68-84`, `:136`, `:150-152`, `:193`, `:226-234`
- Modify: `src/services/Widgets.ts:258-259`
- Modify: `src/ui/vote.html:46-52`, `:157-173`, `:191-193`
- Modify: `src/ui/chat.html:274`
- Modify: `tools/widget-scenes.js:342`, `:344-353`
- Delete tests: `tests/domain.test.ts` 협박 즉시 반영, `tests/gameflow.test.ts:534-569`, `tests/chat.test.ts:795-854`
- Modify tests: `tests/helpers/seat.ts`와 `tests/chat.test.ts`의 `ctx()` 팩토리, `tests/night-pipeline.test.ts`의 건달 step 단정

**Interfaces:**
- Consumes: Task 8까지의 전부.
- Produces: 없음. 지우기만 한다. `NightActionKind.SILENCE`·`Seat.silenced`·`ChatContext.silenced`·`VotePayload.silenced`가 사라진다.

- [ ] **Step 1: 지우기 전에 참조를 센다**

```bash
grep -rn "silenced\|SILENCE" src main.ts tests tools | wc -l
```

이 숫자가 마지막 단계에서 0이 되어야 한다. 지금 적어 둔다.

- [ ] **Step 2: 좌석에서 지운다**

`src/types/Game.types.ts`. `Seat`의 두 줄(`:138-139`)을 통째로 지운다.

```ts
	/** 건달에게 협박당해 다음 낮 투표가 막혔는가 */
	silenced: boolean;
```

`src/entities/Room.ts` 세 곳.

| 위치 | 지우는 줄 |
| --- | --- |
| `createSeat` `:63` | `silenced: false,` |
| `assignRole` `:95` | `seat.silenced = false;` |
| `resetRound` `:257` | `seat.silenced = false;` |

- [ ] **Step 3: 행동 종류와 건달 정의를 지운다**

`src/domain/Roles.ts`의 `NightActionKind`에서 두 줄.

```ts
	/** 건달: 대상의 다음 낮 투표를 막는다 */
	SILENCE: "SILENCE",
```

건달은 아직 덱에 없지만 `ROLE_DEFS`는 `Role` 전체를 덮는 레코드라 항목이
남아 있어야 한다. **능력만 비운다** — 다음 태스크가 여기를 다시 채운다.

```ts
	THUG: {
		displayName: "건달",
		team: Team.CITIZEN,
		glyph: "🥊",
		// 협박(SILENCE)이 사라진 자리다. Task 10이 BLOCK으로 다시 채운다 —
		// 그때까지 이 항목은 덱에 서지 않으므로 아무도 보지 않는다.
		// 지우지 않는 이유는 경찰·스파이 조사 테스트가 Role.THUG를 쓰기
		// 때문이다. 그 둘이 이번 진영 정정의 회귀 방지선이다
		ability: "밤에 쓸 능력이 아직 없습니다.",
		tip: "",
		nightAction: null,
		nightChat: null,
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: null,
		nightNotice: NO_CHAT,
		nightStep: NightStep.AFTER,
		immuneToVote: false,
	},
```

`appearsAsMafia: true`는 Task 1이 이미 지웠다. 아직 남아 있다면 Task 1이
덜 끝난 것이므로 여기서 고치지 말고 Task 1로 돌아간다.

- [ ] **Step 4: 파이프라인의 갈래를 지운다**

`src/domain/NightPipeline.ts`의 `apply`. Task 4가 옮겨 온 갈래다 — 보정 사항 22번.

```ts
		case NightActionKind.SILENCE:
			target.silenced = true;
			return true;
```

- [ ] **Step 5: 채팅 권한에서 지운다**

`src/domain/chat/ChatPermission.ts` 세 곳.

`ChatContext`(`:54-55`).

```ts
	/** 건달에게 협박당해 오늘 입이 막혔는가 */
	readonly silenced: boolean;
```

`LOOSE_CONTEXT`(`:88`)의 `silenced: false,`.

`accessOf`의 ROOM 분기(`:129-141`) — 주석 블록째 지운다.

```ts
		/*
		 * 건달의 협박.
		 * … (13줄)
		 */
		if (ctx.silenced) return locked("🥊 협박당해 오늘은 말할 수 없습니다");
```

- [ ] **Step 6: 채팅 서비스에서 지운다**

`src/services/ChatService.ts`. `:110-113`의 주석과 필드.

```ts
		// alive와 같은 이유로 started를 함께 본다. 좌석의 silenced는 밤 정산이
		// … 
		silenced: room.started && seat.silenced,
```

`:120`의 주석은 열거가 하나 줄어든다.

```ts
 * 관전자의 좌석 값(role·alive)은 createSeat이 준 기본값 그대로라
```

`:136`의 `silenced: false,`.

- [ ] **Step 7: 투표에서 지운다**

`src/services/Voting.ts`. 통보 함수와 호출(`:68-84`).

```ts
	// 채팅 권한 갱신(밤 탭 잠그기·협박당한 사람 입 막기)은 여기서 하지
	// 않는다. GameFlow.advancePhase가 모든 전이 뒤에 한 번 부른다.
	notifySilenced(room);
}

/**
 * 협박당한 사람에게만 알린다.
 * … (5줄)
 */
function notifySilenced(room: Room): void { … }
```

호출 위쪽의 주석은 **남긴다** — "여기서 하지 않는다"는 사실은 협박과 무관하게
여전히 참이다. 괄호 안만 고친다.

```ts
	// 채팅 권한 갱신(밤 탭 잠그기)은 여기서 하지 않는다.
	// GameFlow.advancePhase가 모든 전이 뒤에 한 번 부른다.
}
```

`openVoteView`(`:136`)의 `silenced: seat.silenced,`.

`canVote`(`:142-152`)는 **함수를 남기고 조건만 줄인다.** 세 곳이 같은 판정을
써야 한다는 이유가 그대로이므로 이름이 있는 편이 낫다.

```ts
/**
 * 이 좌석이 이번 투표에 참여할 수 있는가.
 *
 * 지금은 생사 하나뿐이지만 판정이 세 곳(핸들러를 무는가 / 표를 받는가 /
 * 진행률의 분모에 드는가)에서 필요하고, 셋이 어긋나면 증상이 제각각이다 —
 * 핸들러만 빠뜨리면 위젯을 조작해 표를 넣을 수 있고, 분모만 빠뜨리면
 * 진행률이 영원히 100%에 닿지 않아 아무도 투표를 끝내지 못한 것처럼 보인다.
 * 조건이 하나여도 이름을 남겨 두는 이유다.
 */
function canVote(seat: Seat): boolean {
	return seat.alive;
}
```

`bindVoteWidget`의 실패 문안(`:193`).

```ts
			label(sender, "투표 권한이 없습니다.");
```

`voteProgress`의 주석(`:226-234`) — 첫 문단이 협박 이야기다.

```ts
		// 접속이 끊긴 좌석은 분모에서 뺀다. 남겨두면 그 한 칸이 절대 채워지지
		// 않아 "아직 안 낸 사람이 있다"가 투표 시간 내내 떠 있는다.
		//
		// canVote에 넣지 않는 것은 의도적이다 — 그쪽은 "표를 낼 자격이
		// 있는가"이고 끊긴 사람의 자격은 그대로다(돌아오면 낸다). 여기서 묻는
		// 것은 "지금 이 칸이 채워질 수 있는가"라 질문이 다르다. 한 문장으로
		// 합치면 재접속한 사람의 표를 거절하게 된다.
		if (!canVote(seat) || !seat.connected) continue;
```

- [ ] **Step 8: payload 타입에서 지운다**

`src/services/Widgets.ts:258-259`.

```ts
	/** 건달에게 협박당해 이번 투표가 막혔는가 */
	silenced: boolean;
```

- [ ] **Step 9: 투표 위젯에서 지운다**

`src/ui/vote.html`. CSS 두 규칙(`:46-57`)을 지운다. `.grid.blocked`가
Task 10이 만드는 `Seat.blocked`와 **이름만 같고 관계가 없다** — 지우다 남기면
다음 사람이 둘을 같은 것으로 읽는다.

```css
				/* 협박당해 투표가 막힌 상태. … */
				.grid.blocked { … }

				.note.blocked { … }
```

`init` 핸들러(`:156-175`)를 통째로 바꾼다.

```js
					init(data) {
						// 잠그는 것은 개표(result)뿐이다. 투표 중에 화면을 다시
						// 여는 유일한 경로가 재접속이고, 그때는 계속 찍을 수 있어야 한다
						locked = false;
						myNum = Number(data.myNum) || 0;
						// 재접속으로 화면을 다시 열었을 때 이미 넣은 표를 복원한다
						myPick = Number(data.picked) || null;
						qs("#heading").textContent = "누구를 처형할까요";
						qs("#grid").innerHTML = html`${seats(data).map(seat => tile(seat))}`;
						paintPick();
						qs("#note").textContent =
							myPick === null ? "고르지 않으면 기권입니다." : pickNote();
						startTimer(qs("#timer"), data.timer);
					},
```

`result` 핸들러(`:191-193`)에서 흐림을 벗기던 두 줄을 지운다.

```js
						// 협박당한 사람도 개표는 똑같이 본다. init에서 씌운 흐림을 벗긴다
						qs("#grid").classList.remove("blocked");
						qs("#note").classList.remove("blocked");
```

`locked` 변수 자체는 남는다. `result`가 여전히 세우고 클릭 핸들러(`:144`)가 본다.

`src/ui/chat.html:274`의 주석에서 "협박" 언급을 지운다. 문장이 협박을
예시로 들고 있으면 예시만 빼고, 문장 전체가 협박 이야기면 줄째 뺀다.

- [ ] **Step 10: 위젯 장면에서 지운다**

`tools/widget-scenes.js`. `:342`의 `silenced: false,`를 지우고, `:344-353`의
협박 장면(`silenced: true`)은 **장면째** 지운다.

```js
	{
		label: "투표 — 협박당한 상태",
		file: "vote.html",
		…
		messages: [
			{ type: "init", myNum: 4, seats: SEATS, timer: 17, picked: 0, silenced: true },
		],
	},
```

밤 지목 장면 중 하나(`:315-335`, "밤 지목 — 혼자인 마피아팀(건달)")도 협박이다.
`prompt: "협박할 대상을 고르세요"`이고 `team: "mafia"`인데, 건달은 Task 1에서
시민팀이 됐고 방금 능력까지 없어졌다. **장면을 지우지 말고 짐승인간으로
돌린다** — 이 장면이 덮고 있는 것은 건달이 아니라 `LONE_MAFIA_TEAM` 안내가
붙은 화면이고, 그 안내는 짐승인간이 계속 쓴다.

`label`을 `"밤 지목 — 혼자인 마피아팀(짐승인간)"`으로, `init` 객체를 아래로
바꾼다. 뒤의 `progress` 메시지(`{ type: "progress", acted: 0, total: 0 }`)와
그 위의 주석은 그대로 둔다 — 분모 0을 확인하는 장면이라 직업과 무관하다.

```js
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
```

`role`·`prompt`·`note`는 `ROLE_DEFS[Role.BEAST]`의 `displayName`·`nightPrompt`와
`LONE_MAFIA_TEAM`을 **그대로 옮긴 문자열**이어야 한다. 지금 장면의 `note`는
`"당신은 마피아 팀이지만 동료와 대화할 수 없습니다."`로, 실제 상수(`🌙` 이모지와
"마피아와")와 이미 어긋나 있다. 손대는 김에 맞춘다.

- [ ] **Step 11: 테스트를 지운다**

세 개를 지운다. 협박이라는 능력 자체가 없어지므로 갱신할 단정이 남지 않는다.

| 파일 | 지우는 것 |
| --- | --- |
| `tests/domain.test.ts` | Task 4가 파이프라인 호출로 바꿔 둔 협박 테스트 (`target.silenced === true`) |
| `tests/gameflow.test.ts:534-569` | `it("협박당한 사람은 화면이 잠기고 표도 진행률도 집계되지 않는다")` + 위의 주석 블록 |
| `tests/chat.test.ts:795-854` | `describe`의 `thugGame()` 헬퍼와 그 안의 `it` 셋 전부 |

`tests/gameflow.test.ts`에서 그 다음 테스트("접속이 끊긴 사람은 투표 진행률
분모에서 빠진다", `:571-578`)의 주석 첫 줄이 **지워진 테스트를 가리킨다.**
근거를 자기 발로 세우게 고친다.

```ts
	/**
	 * 접속이 끊긴 사람은 진행률 분모에서도 빠진다.
	 *
	 * 채워질 수 없는 칸을 남겨두면 "아직 안 낸 사람이 있다"가 투표 시간
	 * 내내 떠서, 남은 사람들이 이미 다 냈는데도 서로를 기다린다. 자격(canVote)이
	 * 아니라 지금 낼 수 있는가를 묻는 자리라 조건이 하나 더 붙는다.
	 */
```

`tests/night-pipeline.test.ts`에서 Task 4가 쓴 step 단정도 반쪽이 사라진다.

```ts
	it("취재는 사망 확정 뒤에 걸린다", () => {
		// AFTER에 두는 이유: 특종은 다음 아침에 나가므로 그 밤의 사망이
		// 확정된 뒤여야 "죽은 사람의 직업"이 제대로 실린다
		assert.equal(ROLE_DEFS[Role.REPORTER].nightStep, NightStep.AFTER);
		const seats = [seat(1, Role.REPORTER), seat(2, Role.MAFIA)];
		night(seats, [[1, 2]]);
		assert.equal(seats[1].scooped, true);
	});
```

- [ ] **Step 12: 팩토리 둘에서 지운다**

`silenced: false,` 한 줄씩이다.

| 파일 | 무엇 |
| --- | --- |
| `tests/helpers/seat.ts` | 좌석 팩토리 (Task 4에서 공용화했다. 세 테스트 파일이 여기를 본다) |
| `tests/chat.test.ts:72` | `ctx()` 컨텍스트 팩토리 |

`tests/chat.test.ts`의 `:167`·`:173`·`:183`은 `ctx({ silenced: true })`를 쓰는
권한 테스트 셋이다. Step 11에서 `describe` 하나를 지웠는데 이 셋은 **다른
describe에 있다** — 여기서 지운다.

```ts
	it("협박당하면 방 채팅이 잠긴다", …);
	it("협박당해도 마피아 밀담은 열려 있다", …);
	// :183 — accessOf(ctx({ silenced: true }), ChatChannel.ROOM).note 단정
```

두 번째 것("협박당해도 마피아 밀담은 열려 있다")이 지키던 규칙 — 잠금은
ROOM 하나만 좁힌다 — 은 Task 2의 침묵전(`freeText`)이 같은 자리에서 이미
검증하고 있다. 없어지는 단정이 아니다.

- [ ] **Step 13: 0을 확인한다**

```bash
grep -rn "silenced\|SILENCE\|협박" src main.ts tests tools
```

Expected: 결과 없음. `docs/`는 대상이 아니다 — 스펙과 계획은 협박을 지운
기록으로 계속 언급한다.

- [ ] **Step 14: 전체 검증**

```bash
npm run verify
```

Expected: 전부 통과. **`check:ui`를 특히 본다** — 이 태스크에서 UI를 빠뜨렸는지
알려줄 유일한 단계다.

- [ ] **Step 15: 커밋**

```bash
git add -A
git commit -m "refactor(roles): remove the SILENCE ability and every trace of it

건달이 BLOCK으로 바뀌면 SILENCE는 생산자가 영구히 없어진다. 발언 봉쇄는
시즌 2~4 어느 직업에도 계획이 없다.

지우기만 하는 커밋이다. 다음 커밋이 BLOCK을 더한다 — 섞으면 회귀가 났을 때
지운 것 때문인지 더한 것 때문인지 구분할 수 없다.

silenced는 위젯 payload를 타고 vote.html과 widget-scenes.js까지 내려가 있었다.
type-check도 lint도 test도 .html과 tools를 보지 않으므로 거기서 빠뜨리면
셋 다 초록불이 뜬다. check:ui가 유일한 그물이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: S6-2 — 차단(`BLOCK`)과 건달 재정의

**목표:** 밤의 여섯 step 중 가장 앞(step 20)에 "다른 사람의 밤 능력을
무효화한다"를 넣고, 그 자리에 건달을 세운다. 이 태스크가 끝나면 건달은
**동작하지만 아직 덱에 서지 않는다** — 아무에게도 배정되지 않으므로 실전
경기는 그대로다. 배포는 Task 11이 한다.

**왜 여기서 자르는가(보정 23):** 스펙은 "커밋 2 = `BLOCK` 추가 / 커밋 3 =
건달 재정의"로 나눴지만, 쓰는 직업이 없는 `BLOCK`은 테스트가 존재할 수 없는
커밋이다. 경계를 한 칸 옮겨 **차단이 실제로 막는가**(Task 10)와 **건달이
게임에 존재하는가**(Task 11)로 가른다. 커밋은 여전히 셋이고, 지우기(Task 9)와
더하기가 섞이지 않는다는 스펙의 요구도 그대로다.

**Files:**
- Create: `tests/night-block.test.ts`
- Modify: `src/domain/Roles.ts:42-43`(`NightActionKind`), `RoleDef`, THUG 정의
- Modify: `src/types/Game.types.ts` (`Seat.blocked`)
- Modify: `src/entities/Room.ts:48-70`(`createSeat`) · `:81-97`(`assignRole`) · `:249-260`(`resetRound`)
- Modify: `tests/helpers/seat.ts` (`blocked: false`)
- Modify: `src/domain/NightPipeline.ts` (`apply`의 `BLOCK` 갈래, 루프 가드)
- Modify: `src/domain/NightResolution.ts` (`recordNightIntent` 머리 + `BLOCK` 갈래)
- Modify: `src/services/Widgets.ts:318-327` (`NightActionPayload.noSelf`)
- Modify: `src/services/Night.ts:151-163` (payload에 `noSelf`)
- Modify: `src/ui/roleAction.html:81-128`
- Modify: `tools/widget-scenes.js`
- Test: `tests/night-block.test.ts`

**Interfaces:**
- Consumes: Task 4의 `NightStep.BLOCK`(값 `20`, `STEP_ORDER`의 첫 항목)·`putIntent`·`resolveNightIntents`, Task 6의 `NightLedger`, Task 8의 `apply(actor, target, ledger): boolean`과 `Seat.usesSpent`.
- Produces:
  - `NightActionKind.BLOCK` — `src/domain/Roles.ts`
  - `RoleDef.noSelfTarget?: boolean` — `src/domain/Roles.ts`
  - `Seat.blocked: boolean` — `src/types/Game.types.ts`
  - `NightActionPayload.noSelf: boolean` — `src/services/Widgets.ts`
  - Task 11이 `apply`의 `BLOCK` 갈래에 `ledger.blocks.push(...)` 한 줄을 덧댄다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/night-block.test.ts`를 새로 만든다.

```ts
/*
 * 차단(BLOCK)과 건달.
 *
 * 이 파일이 지키는 것은 한 문장이다 — "막힌 능력은 일어나지 않는다".
 * 능력마다 흔적이 남는 자리가 다르다(healed·attackedBy·reveals·usesSpent).
 * 그래서 하나로 대표하지 않고 직업별로 한 번씩 확인한다. 대표 하나만
 * 두면 새 step이 생겼을 때 가드를 빠뜨린 것을 아무도 못 잡는다.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Role, Team } from "../src/types/Game.types.ts";
import type { Seat } from "../src/types/Game.types.ts";
import { ROLE_DEFS } from "../src/domain/Roles.ts";
import { NightOutcome, recordNightIntent } from "../src/domain/NightResolution.ts";
import type { NightIntent, NightReveal } from "../src/domain/NightPipeline.ts";
import { putIntent, resolveNightIntents } from "../src/domain/NightPipeline.ts";
import { seat } from "./helpers/seat.ts";

/** 밤을 한 번 돌린다. clicks는 누른 순서대로 준다 */
function night(seats: Seat[], clicks: Array<[number, number]>, skipAttacks = false) {
	const intents: NightIntent[] = [];
	for (const [actor, target] of clicks) putIntent(intents, actor, target);
	return resolveNightIntents(seats, intents, { skipAttacks });
}

/** 이 좌석에게 아침에 가는 줄이 몇 개인가 */
function linesFor(reveals: readonly NightReveal[], index: number): number {
	let count = 0;
	for (const reveal of reveals) {
		if (reveal.seat === index) count++;
	}
	return count;
}

describe("차단 — 막힌 능력은 일어나지 않는다", () => {
	it("막힌 마피아는 아무도 죽이지 못한다", () => {
		const seats = [seat(1, Role.THUG), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 2], [2, 3]]);
		assert.equal(result.casualties.length, 0);
		assert.equal(seats[2].alive, true);
		// 공격 자체가 없었다. "공격했지만 살았다"와는 다른 상태다
		assert.deepEqual(seats[2].attackedBy, []);
	});

	it("막힌 의사는 살리지 못한다", () => {
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.DOCTOR),
			seat(3, Role.MAFIA),
			seat(4, Role.CITIZEN),
		];
		const result = night(seats, [[1, 2], [2, 4], [3, 4]]);
		assert.equal(result.casualties.length, 1);
		assert.equal(result.casualties[0].outcome, NightOutcome.KILLED);
		assert.equal(seats[3].healed, false);
	});

	it("막힌 경찰은 답도 못 받고 흔적도 남기지 않는다", () => {
		// 조사가 일어나지 않았으므로 사기꾼에게 가는 "조사당했습니다"도 없다.
		// 한쪽만 막고 다른 쪽이 새면 그 한 줄이 곧 "경찰이 살아 있다"는 정보다
		const seats = [seat(1, Role.THUG), seat(2, Role.POLICE), seat(3, Role.CON_ARTIST)];
		const result = night(seats, [[1, 2], [2, 3]]);
		assert.equal(linesFor(result.reveals, 2), 0);
		assert.equal(linesFor(result.reveals, 3), 0);
	});

	it("막힌 스파이는 마피아팀에 합류하지 않는다", () => {
		// 합류는 되돌릴 수 없는 사건이다. 막혔는데 합류까지 됐다면
		// 그 밤의 결과가 아니라 게임 전체가 어긋난다
		const seats = [seat(1, Role.THUG), seat(2, Role.SPY), seat(3, Role.MAFIA)];
		const result = night(seats, [[1, 2], [2, 3]]);
		assert.equal(result.defected.length, 0);
		assert.equal(seats[1].team, Team.CITIZEN);
		assert.equal(linesFor(result.reveals, 2), 0);
	});

	it("막힌 자경단원은 총알을 잃지 않는다", () => {
		const seats = [seat(1, Role.THUG), seat(2, Role.VIGILANTE), seat(3, Role.CITIZEN)];
		night(seats, [[1, 2], [2, 3]]);
		assert.equal(seats[2].alive, true);
		// 이 단언이 Task 8의 "apply가 참을 돌려줄 때만 센다"를 지킨다
		assert.equal(seats[1].usesSpent, 0);
	});

	it("막힌 기자의 특종은 나가지 않는다", () => {
		const seats = [seat(1, Role.THUG), seat(2, Role.REPORTER), seat(3, Role.CITIZEN)];
		night(seats, [[1, 2], [2, 3]]);
		assert.equal(seats[2].scooped, false);
		assert.equal(seats[1].usesSpent, 0);
	});

	it("막힌 시민의 쪽지는 배달되지 않는다", () => {
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.CITIZEN, { noteText: "당신을 믿습니다" }),
			seat(3, Role.CITIZEN),
		];
		const result = night(seats, [[1, 2], [2, 3]]);
		assert.equal(linesFor(result.reveals, 3), 0);
		assert.equal(seats[1].usesSpent, 0);
	});
});

describe("차단 — 닿지 않는 것", () => {
	it("군인의 방탄은 차단으로 벗겨지지 않는다", () => {
		// armored는 밤에 쓰는 능력이 아니라 배정 때 켜진 상태다. 군인은
		// intent 루프에 아예 서지 않으므로 차단이 갈 곳이 없다.
		// (실전 덱에서는 Task 11의 배타 규칙 때문에 군인과 건달이 함께
		//  서지 않는다. 그래도 규칙과 코드는 따로 지킨다)
		const seats = [seat(1, Role.THUG), seat(2, Role.SOLDIER), seat(3, Role.MAFIA)];
		night(seats, [[1, 2], [3, 2]]);
		assert.equal(seats[1].alive, true);
		assert.equal(seats[1].armored, false);
	});

	it("정치인은 차단당해도 좌석 상태가 멀쩡하다", () => {
		// 스펙 엣지케이스 #20. voteWeight는 RoleDef의 값이라 좌석 상태가 아니고,
		// Voting.ts의 voteWeight()도 서비스 내부 private이라 도메인에서 부를 수
		// 없다. 즉 차단이 닿을 표면이 없다 — 여기서 단언할 수 있는 것은
		// "차단은 걸렸고, 정치인 쪽에서 사라진 것이 없다"까지다.
		// 언젠가 voteWeight를 Seat으로 옮기면 이 테스트가 그 결정을 마주한다
		const seats = [seat(1, Role.THUG), seat(2, Role.POLITICIAN)];
		night(seats, [[1, 2]]);
		assert.equal(seats[1].blocked, true);
		assert.equal(seats[1].alive, true);
	});

	it("차단끼리는 서로를 막지 않는다", () => {
		// step 20 안에는 순서가 없다. 건달 A가 건달 B에게 막혀도 A의 차단은
		// 성립한다 — 아니면 누가 먼저 눌렀는지가 다시 밤을 가른다
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.THUG),
			seat(3, Role.MAFIA),
			seat(4, Role.CITIZEN),
		];
		const result = night(seats, [[1, 3], [2, 1], [3, 4]]);
		assert.equal(seats[0].blocked, true);
		assert.equal(seats[2].blocked, true);
		assert.equal(result.casualties.length, 0);
	});

	it("첫 밤에도 차단은 작동한다", () => {
		// skipAttacks가 건너뛰는 것은 step 40·50뿐이다. step 20은 그대로 돈다
		const seats = [seat(1, Role.THUG), seat(2, Role.POLICE), seat(3, Role.MAFIA)];
		const result = night(seats, [[1, 2], [2, 3]], true);
		assert.equal(seats[1].blocked, true);
		assert.equal(linesFor(result.reveals, 2), 0);
	});
});

describe("건달 — 자기 자신은 고를 수 없다", () => {
	it("건달이 자기를 지목하면 기록되지 않는다", () => {
		const thug = seat(1, Role.THUG);
		assert.equal(recordNightIntent(thug, thug), null);
	});

	it("의사의 자가 치유는 그대로 된다", () => {
		// 전역 금지가 아니라 직업별 플래그인 이유가 이 한 줄이다
		const doctor = seat(1, Role.DOCTOR);
		assert.notEqual(recordNightIntent(doctor, doctor), null);
	});

	it("다시 쓴 건달도 시민팀이다", () => {
		// Task 1이 고친 진영을 정의를 통째로 다시 쓰면서 되돌리기 쉽다.
		// Task 1의 테스트와 겹치지만, 겹치는 값이 아니라 겹치는 위험을 본다
		assert.equal(ROLE_DEFS[Role.THUG].team, Team.CITIZEN);
		assert.equal(ROLE_DEFS[Role.THUG].appearsAsMafia, undefined);
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test -- --test-name-pattern="차단|건달"
```

Expected: FAIL. 지금 건달은 Task 9가 남긴 껍데기라 `nightAction`이 `null`이고,
`apply`는 `default: return false`로 빠진다. 즉 아무도 막히지 않는다.

- "막힌 마피아는 아무도 죽이지 못한다" → `casualties.length` 가 `1`
- "건달이 자기를 지목하면 기록되지 않는다" → `recordNightIntent`가 `null`을
  돌려주긴 하지만 **이유가 다르다**(`nightAction === null`). 이 하나는
  지금도 초록이다. Step 9에서 건달에 능력이 붙는 순간 빨강이 되고,
  Step 8의 가드가 다시 초록으로 만든다. 순서상 정상이다.

`Seat`에 `blocked`가 아직 없으므로 `tsc`는 이 파일을 거부한다. `node --test`는
타입을 벗겨내고 실행하므로 테스트는 돈다 — 타입 쪽 빨강은 `npm run type-check`가
Step 14에서 확인한다.

- [ ] **Step 3: `NightActionKind.BLOCK`을 만든다**

`src/domain/Roles.ts`. Task 9가 `SILENCE`를 지운 자리(`INSPECT_ROLE`과 `SCOOP`
사이)에 넣는다.

```ts
	/**
	 * 건달: 대상의 이번 밤 능력을 통째로 무효화한다.
	 *
	 * 협박(SILENCE)이 있던 자리다. 그쪽은 다음 낮의 투표권을 뺏었는데,
	 * 뺏긴 사람이 할 수 있는 일이 사라지는 것이라 재미가 마이너스였다.
	 * 이쪽은 뺏는 대상이 "밤에 무엇을 하려던 계획"이라 낮의 발언은 그대로 남는다.
	 */
	BLOCK: "BLOCK",
```

- [ ] **Step 4: `RoleDef.noSelfTarget`을 만든다**

같은 파일의 `RoleDef`. `immuneToVote` 옆에 둔다 — 둘 다 "이 직업만 다른
규칙" 계열이다.

```ts
	/**
	 * 자기 자신은 대상으로 고를 수 없다.
	 *
	 * 전역 규칙으로 두지 않는 이유는 의사의 자가 치유가 지금 허용되는
	 * 동작이기 때문이다. 전부 금지하면 그것이 회귀가 된다.
	 *
	 * 건달에게 필요한 이유: 자기를 막는 것은 허탕이 확정된 선택지다.
	 * 그런 칸이 하나 있으면 "아군을 방해할 수 있다"는 이 직업의 유일한
	 * 위험이 통째로 사라지고, 건달은 아무 대가 없이 밤을 넘기는 직업이 된다.
	 *
	 * 위젯과 서버가 같은 값을 근거로 막는다(NightActionPayload.noSelf).
	 */
	readonly noSelfTarget?: boolean;
```

- [ ] **Step 5: `Seat.blocked`를 만든다**

`src/types/Game.types.ts`. Task 9가 `silenced`를 지운 자리에 들어간다.

```ts
	/**
	 * 이번 밤에 능력이 막혔는가. 건달이 켠다.
	 *
	 * healed·scooped와 같은 하룻밤짜리 값이라 같은 곳에서 초기화된다.
	 * 낮에는 아무도 읽지 않는다 — 막혔다는 사실은 아침 통보(Task 11)로
	 * 한 번 전해지고 끝이다. 상태로 남아 낮을 바꾸는 값이 아니다.
	 */
	blocked: boolean;
```

- [ ] **Step 6: 좌석 초기화 세 곳에 넣는다**

`src/entities/Room.ts`. Task 9가 `silenced: false` / `seat.silenced = false;`를
지운 자리 그대로다.

```ts
// createSeat(:48-70) — armored 아래
		blocked: false,
```
```ts
// assignRole(:81-97) — attackedBy 아래
	seat.blocked = false;
```
```ts
// resetRound(:249-260) — attackedBy 아래
		seat.blocked = false;
```

`resetRound`의 한 줄은 단위 테스트로 덮지 않는다. `Room`을 손으로 만들려면
`emptyVoteRecord`(비공개)와 `Room`의 20여 필드가 필요하고, 그 비용으로 사는
것이 대입 한 줄의 확인이다. 대신 **자리가 곧 근거다** — 방금 Task 9가 이
루프에서 `seat.silenced = false;`를 지웠고, 같은 수명(하룻밤)을 가진 값
셋(`healed`·`attackedBy`·`scooped`)이 바로 위아래에 있다. 리뷰어는 셋과 같은
블록에 있는지만 보면 된다.

`tests/helpers/seat.ts`에도 한 줄 넣는다. Task 9가 `silenced: false,`를 지운
자리다. 이 줄이 없으면 `Seat`이 필수 필드를 잃어 `type-check`가 네 테스트
파일을 전부 거부한다.

```ts
		armored: ROLE_DEFS[role].survivesFirstAttack === true,
		blocked: false,
		scooped: false,
```

- [ ] **Step 7: 파이프라인이 차단을 전파한다**

`src/domain/NightPipeline.ts`. `apply`에 갈래 하나. `HEAL` 위에 둔다 — step
순서와 같은 순서로 읽히게.

```ts
		case NightActionKind.BLOCK:
			target.blocked = true;
			return true;
```

그리고 `resolveNightIntents`의 좌석 루프에 가드 한 줄.

```ts
		for (const seat of seats) {
			if (wasAlive.indexOf(seat.index) < 0) continue;
			if (roleDef(seat.role).nightStep !== step) continue;
			// step 20 자신은 이 검사를 하지 않는다. 그래야 건달끼리 서로
			// 지목해도 둘 다 성립한다 — 차단이 차단을 막으면 누가 먼저
			// 눌렀는지가 다시 밤을 가르고, 그게 이 파이프라인이 없앤 것이다
			if (step !== NightStep.BLOCK && seat.blocked) continue;
			const target = targetOf(seats, intents, seat.index);
			if (!target) continue;
			if (apply(seat, target, ledger)) seat.usesSpent++;
		}
```

`continue`가 `targetOf`보다 **앞**이라는 것이 중요하다. 뒤로 가면 막힌 사람도
`usesSpent`를 셀 위험이 생기고, 그러면 "막히면 안 닳는다"가 깨진다.

`notifyInspected`(step 70에서 도는 별도 루프)는 건드리지 않는다. 그쪽이 보는
것은 "조사당했는가"이고, 조사가 막혔으면 `ledger.inspected`에 애초에 아무것도
안 들어간다.

- [ ] **Step 8: 지목 기록이 자기 자신을 거른다**

`src/domain/NightResolution.ts`의 `recordNightIntent`. 머리에 두 줄.

```ts
export function recordNightIntent(actor: Seat, target: Seat): NightSelectResult | null {
	const def = roleDef(actor.role);
	if (def.nightAction === null) return null;
	// 위젯이 이미 잠근 칸이다. 여기서 다시 거르는 이유는 조작된 select가
	// 올 수 있기 때문이고, 잠그는 근거(noSelfTarget)가 양쪽에서 같기 때문에
	// 화면과 서버가 갈라질 수 없다
	if (def.noSelfTarget === true && actor.index === target.index) return null;
```

그리고 `switch`에 갈래 하나. `INSPECT_TEAM` 위에 둔다.

```ts
		case NightActionKind.BLOCK:
			return {
				consumed: true,
				confirmed: true,
				label: `${target.index}번 참가자를 방해하기로 했습니다.`,
			};
```

문구가 "막았습니다"가 아니라 "방해하기로 했습니다"인 이유: 이 시점에는 아직
아무 일도 일어나지 않았다. 정산은 밤이 끝나야 돈다. 성공했는지는 아침에
알려준다(Task 11).

- [ ] **Step 9: 건달을 다시 쓴다**

`src/domain/Roles.ts`의 `THUG`. Task 9가 남긴 껍데기를 통째로 바꾼다.

```ts
	THUG: {
		displayName: "건달",
		team: Team.CITIZEN,
		glyph: "🥊",
		ability: "밤마다 한 명을 골라 그 사람의 밤 능력을 막습니다.",
		tip: "확정 시민을 막으면 헛턴입니다. 밤에 움직일 것 같은 사람을 고르세요.",
		nightAction: NightActionKind.BLOCK,
		nightChat: null,
		// 밤 스프라이트가 없다. 이동 연출이 붙는 것은 공격뿐이고,
		// 방해는 대상에게 아무 흔적도 남기지 않아야 한다
		nightSprite: null,
		nightAttackSprite: null,
		nightPrompt: "방해할 대상을 선택하세요.",
		nightNotice: NO_CHAT,
		nightStep: NightStep.BLOCK,
		noSelfTarget: true,
		immuneToVote: false,
	},
```

`appearsAsMafia`가 없다는 것이 Task 1의 진영 정정이다. `maxUses`가 없으므로
매일 밤 쓴다. `notifiesOnInspect`도 없다 — 막힌 사람은 아침에 따로 통보를
받으므로(Task 11) 조사 통보까지 붙이면 같은 사실이 두 경로로 간다.

- [ ] **Step 10: 테스트를 통과시킨다**

```bash
npm test -- --test-name-pattern="차단|건달"
```

Expected: PASS. 14개 전부.

- [ ] **Step 11: 위젯 payload에 `noSelf`를 싣는다**

`src/services/Widgets.ts:318-327`의 `NightActionPayload`에 한 줄.

```ts
	/** 내 칸을 잠근다. 자기를 고를 수 없는 직업에만 참이다 */
	noSelf: boolean;
```

`src/services/Night.ts:151-163`의 payload 생성.

```ts
	const widget = openRoleAction(player, {
		type: "init",
		myNum: seat.index,
		...identityOf(seat),
		prompt: def.nightPrompt || "",
		seats: seatViews(room, inMafiaChat(seat) ? seat.team : undefined),
		timer: room.phaseTimer,
		note: def.nightNotice,
		noSelf: def.noSelfTarget === true,
	});
```

`def.noSelfTarget`을 그대로 넘기지 않는다. 선택 필드라 `undefined`가 될 수
있고, ZEP API에 `undefined`를 실어 보내면 안 된다.

- [ ] **Step 12: 위젯이 내 칸을 잠근다**

`src/ui/roleAction.html`. 상태 하나(`:81-83`).

```js
			let myNum = 0;
			let picked = null;
			let canPick = false;
			let noSelf = false;
```

`tile`의 `disabled` 조건(`:97`).

```js
					${flag(!seat.alive || (mine && noSelf), "disabled")}
```

`init`에서 격자를 그리기 **전에** 값을 세운다(`:112-113` 사이).

```js
					myNum = Number(data.myNum) || 0;
					noSelf = !!data.noSelf;
					picked = null;
```

캡션은 그대로 "나"다. 잠긴 칸은 죽은 칸과 같은 흐린 표시가 되고, 그 위에
"나"가 적혀 있으면 왜 못 누르는지가 설명 없이 읽힌다.

- [ ] **Step 13: 장면을 추가한다**

`tools/widget-scenes.js`. 밤 지목 장면들 뒤에 하나 붙인다.

```js
	{
		label: "밤 지목 — 자기 칸이 잠긴다(건달)",
		file: "roleAction.html",
		size: [360, 440],
		messages: [
			{
				type: "init",
				myNum: 4,
				role: "건달",
				team: "citizen",
				alive: true,
				prompt: "방해할 대상을 선택하세요.",
				seats: SEATS,
				timer: 22,
				// 4번(나)이 살아 있는데도 잠겨 있어야 한다. 3번은 사망이라
				// 원래 잠긴다 — 두 칸이 같은 모양인지 여기서 눈으로 본다
				noSelf: true,
				note: "🌙 밤에는 채팅을 할 수 없습니다.",
			},
		],
	},
```

- [ ] **Step 14: 전체 검증**

```bash
npm run verify
```

Expected: 전부 통과.

- [ ] **Step 15: 커밋**

```bash
git add -A
git commit -m "feat(night): add the BLOCK step and rebuild the thug on it

건달이 시민팀 방해자로 돌아왔다. 협박(다음 낮의 투표권을 뺏는다)은 뺏긴
사람이 할 수 있는 일을 없애는 능력이라 재미가 마이너스였다. 차단은 뺏는
대상이 '밤에 하려던 계획'이라 낮의 발언은 그대로 남는다.

step 20에 넣는다. 나머지 step은 전부 actor.blocked를 먼저 보고, step 20
자신만 보지 않는다 — 차단이 차단을 막으면 누가 먼저 눌렀는지가 다시 밤을
가르게 되고, 그것이 파이프라인으로 없앤 바로 그 문제다.

막힌 능력은 사용 횟수를 소모하지 않는다. Task 8이 apply의 반환값으로
횟수를 세게 바꿔둔 덕에 가드 한 줄로 따라온다.

자기 지목은 RoleDef.noSelfTarget으로 막는다. 전역 금지가 아닌 이유는
의사의 자가 치유가 지금 허용되는 동작이기 때문이다. 위젯과 서버가 같은
값을 근거로 막으므로 화면과 서버가 갈라질 수 없다.

덱에는 아직 넣지 않았다. 배포는 다음 커밋이 한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: S6-3 — 차단 통보와 건달의 덱 복귀

**목표:** 막은 쪽과 막힌 쪽 양쪽에 아침 한 줄씩을 보내고, 건달을 시민 풀에
되돌린다. 이 태스크가 끝나면 시즌 0과 시즌 1이 전부 배포된 상태다.

**왜 통보가 필요한가(스펙 §S6):** 가해자를 맞추는 것은 피해자를 맞추는 것보다
어렵다. 의사는 마피아가 노릴 사람을 추측할 근거가 있지만, 건달은 마피아가
누군지 알아야 하는데 그건 게임의 목적 그 자체다. 통보가 없으면 건달의 주
과제가 "확정 시민을 막아 낭비하지 않기"라는 소극적인 것으로 변한다.
통보로 얻는 정보는 **"이 사람이 어젯밤 밤 능력을 실제로 썼는가"** 다 —
경찰의 "마피아인가"보다 훨씬 약하고, 점쟁이의 "능력을 가졌는가"보다 한 칸
강하다(보유가 아니라 사용이다).

**Files:**
- Modify: `src/domain/NightPipeline.ts` (`NightLedger.blocks`, `notifyBlocked`, `apply`의 `BLOCK` 갈래, `AFTER` 호출부)
- Modify: `src/domain/RuleSet.ts` (`STANDARD_RULES.deck`)
- Modify: `tests/night-block.test.ts` (통보 `describe` 추가 + `lineFor` 헬퍼)
- Modify: `tests/deck.test.ts` (`"건달은 어느 인원에서도 나오지 않는다"` 교체 + 배타·최소 인원)

**Interfaces:**
- Consumes: Task 10의 `NightActionKind.BLOCK`·`Seat.blocked`·`apply`의 `BLOCK` 갈래, Task 8의 `intentTarget(intents, actor)`, Task 6의 `NightLedger`와 `NightStep.AFTER` 호출부, Task 3의 `exclusiveGroups`·`minPlayers`, Task 3의 `DECK`·`rngFrom` (테스트 헬퍼).
- Produces: 없음. 시즌 1의 마지막 태스크다.

- [ ] **Step 1: 실패하는 통보 테스트를 쓴다**

`tests/night-block.test.ts`의 `linesFor` 아래에 헬퍼 하나를 더 둔다.

```ts
/** 이 좌석에게 가는 첫 줄. 없으면 빈 문자열 */
function lineFor(reveals: readonly NightReveal[], index: number): string {
	for (const reveal of reveals) {
		if (reveal.seat === index) return reveal.line;
	}
	return "";
}
```

그리고 파일 끝에 `describe` 하나를 덧붙인다.

```ts
describe("차단 통보", () => {
	it("막은 건달은 상대가 움직였다는 것을 안다", () => {
		const seats = [seat(1, Role.THUG), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 2], [2, 3]]);
		assert.equal(linesFor(result.reveals, 1), 1);
		assert.match(lineFor(result.reveals, 1), /2번은 어젯밤 능력을 썼고/);
	});

	it("움직이지 않은 사람을 막으면 그렇게 알려준다", () => {
		// 능력이 없는 사람과 있는데 안 쓴 사람을 합친 문안이다. 구분되면
		// 점쟁이의 정보와 완전히 겹친다
		const seats = [seat(1, Role.THUG), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 2]]);
		assert.match(lineFor(result.reveals, 1), /2번은 어젯밤 아무것도 하지 않았습니다/);
	});

	it("막힌 사람은 막혔다는 것만 안다", () => {
		const seats = [seat(1, Role.THUG), seat(2, Role.MAFIA), seat(3, Role.CITIZEN)];
		const result = night(seats, [[1, 2], [2, 3]]);
		const line = lineFor(result.reveals, 2);
		assert.match(line, /누군가 당신을 방해해/);
		// 건달의 번호가 들어가면 다음 낮에 건달이 처형된다
		assert.equal(line.indexOf("1번"), -1);
	});

	it("사기꾼을 막으면 사기꾼에게는 아무것도 가지 않는다", () => {
		// "능력이 없는데 방해받았다"는 곧 건달의 존재 확정이다.
		// 손해가 없었으므로 알릴 것도 없다
		const seats = [seat(1, Role.THUG), seat(2, Role.CON_ARTIST), seat(3, Role.MAFIA)];
		const result = night(seats, [[1, 2]]);
		assert.equal(linesFor(result.reveals, 2), 0);
		assert.match(lineFor(result.reveals, 1), /아무것도 하지 않았습니다/);
	});

	it("밤에 죽은 사람에게는 통보가 가지 않는다", () => {
		// 유령에게 가는 줄이다. 건달 쪽 통보는 그대로 간다 — 막은 것은 사실이다
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.POLICE),
			seat(3, Role.MAFIA),
			seat(4, Role.CITIZEN),
		];
		const result = night(seats, [[1, 2], [2, 4], [3, 2]]);
		assert.equal(seats[1].alive, false);
		assert.equal(linesFor(result.reveals, 2), 0);
		assert.equal(linesFor(result.reveals, 1), 1);
	});

	it("막은 건달이 그 밤에 죽어도 통보는 간다", () => {
		// 건달의 죽음은 BLOCK(20)보다 뒤인 DEATH(50)에서 확정된다. 이미 성립한
		// 차단을 되돌리지 않고, 통보도 삼키지 않는다 — 유령 채널로 흘려보내야
		// 남은 시민이 "어젯밤 3번이 움직였다"를 쓸 수 있다
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.MAFIA),
			seat(3, Role.POLICE),
			seat(4, Role.CITIZEN),
		];
		const result = night(seats, [[1, 3], [2, 1], [3, 4]]);
		assert.equal(seats[0].alive, false);
		assert.match(lineFor(result.reveals, 1), /3번은 어젯밤 능력을 썼고/);
		// 막힌 경찰은 조사 답 대신 방해 통보 한 줄만 받는다
		assert.equal(linesFor(result.reveals, 3), 1);
		assert.match(lineFor(result.reveals, 3), /방해/);
	});

	it("건달이 둘이면 각자 자기 대상만 안다", () => {
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.THUG),
			seat(3, Role.MAFIA),
			seat(4, Role.POLICE),
			seat(5, Role.CITIZEN),
		];
		const result = night(seats, [[1, 3], [2, 4], [3, 5], [4, 5]]);
		assert.match(lineFor(result.reveals, 1), /3번/);
		assert.match(lineFor(result.reveals, 2), /4번/);
		assert.equal(linesFor(result.reveals, 1), 1);
		assert.equal(linesFor(result.reveals, 2), 1);
	});

	it("둘이 같은 사람을 막아도 당사자에게는 한 줄만 간다", () => {
		// 줄 수가 곧 건달의 수가 되면 안 된다
		const seats = [
			seat(1, Role.THUG),
			seat(2, Role.THUG),
			seat(3, Role.MAFIA),
			seat(4, Role.CITIZEN),
		];
		const result = night(seats, [[1, 3], [2, 3], [3, 4]]);
		assert.equal(linesFor(result.reveals, 3), 1);
		// 반대로 건달 둘은 각자 받는다. 하나만 받으면 나머지 하나는
		// 자기 능력이 작동했는지조차 모른다
		assert.equal(linesFor(result.reveals, 1), 1);
		assert.equal(linesFor(result.reveals, 2), 1);
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test -- --test-name-pattern="차단 통보"
```

Expected: FAIL, 8개 전부. `reveals`가 비어 있어 `linesFor`가 0을 돌려주고
`lineFor`가 빈 문자열을 돌려준다.

- [ ] **Step 3: 장부가 차단을 기억한다**

`src/domain/NightPipeline.ts`. `NightLedger`에 항목 하나.

```ts
	/** 누가 누구를 막았는가. 아침 통보가 읽는다 */
	readonly blocks: NightIntent[];
```

초기화도 한 자리 늘어난다.

```ts
	const ledger: NightLedger = { reveals: [], defected: [], inspected: [], blocks: [] };
```

Task 10이 만든 `BLOCK` 갈래에 한 줄.

```ts
		case NightActionKind.BLOCK:
			target.blocked = true;
			ledger.blocks.push({ actor: actor.index, target: target.index });
			return true;
```

`seat.blocked`가 이미 있는데 장부를 따로 두는 이유는 **누가 막았는지**가
좌석 상태에 없기 때문이다. 그리고 건달 둘이 같은 사람을 막으면 항목이 둘
쌓여야 한다 — 불리언 하나로는 둘 다에게 통보할 수 없다.

- [ ] **Step 4: 통보 함수를 쓴다**

같은 파일, `notifyInspected` 아래.

```ts
/**
 * 차단을 양쪽에 알린다.
 *
 * 막은 쪽은 blocks를 그대로 돈다 — 같은 사람을 둘이 막았으면 둘 다 알아야
 * 하고, 항목이 곧 한 명의 건달이다.
 *
 * 막힌 쪽은 좌석 순서로 돈다. blocks를 돌면 같은 사람에게 같은 줄이 두 번
 * 가고, 그 줄 수가 곧 살아 있는 건달의 수를 알려준다.
 */
function notifyBlocked(
	seats: readonly Seat[],
	intents: readonly NightIntent[],
	ledger: NightLedger,
): void {
	for (const block of ledger.blocks) {
		const acted = intentTarget(intents, block.target) !== 0;
		ledger.reveals.push({
			seat: block.actor,
			line: acted
				? `🥊 ${block.target}번은 어젯밤 능력을 썼고, 당신이 막았습니다.`
				: `🥊 ${block.target}번은 어젯밤 아무것도 하지 않았습니다.`,
		});
	}

	for (const seat of seats) {
		if (!seat.blocked) continue;
		// 막을 것이 없었으면 알리지 않는다. 능력 없는 사람이 "방해받았다"를
		// 받으면 그 한 줄이 곧 건달의 존재 확정이다
		if (intentTarget(intents, seat.index) === 0) continue;
		// 오늘 아침 죽어 있는 사람에게는 보내지 않는다
		if (!seat.alive) continue;
		ledger.reveals.push({
			seat: seat.index,
			// 누가 막았는지는 없다. 알면 다음 낮에 건달을 찾아 처형한다
			line: "🥊 어젯밤 누군가 당신을 방해해 능력이 무효가 되었습니다.",
		});
	}
}
```

`intentTarget`은 Task 8이 이 파일에 export한 함수다. 같은 파일 안이므로
임포트는 필요 없다.

- [ ] **Step 5: 마지막 step에서 부른다**

`resolveNightIntents`의 루프 앞머리. Task 6이 넣은 한 줄이 두 줄이 된다.

```ts
		if (step === NightStep.ATTACK && opts.skipAttacks) continue;
		// 지목 없이 일어나는 사후 처리. INSPECT가 이미 지나간 뒤다
		if (step === NightStep.AFTER) {
			notifyInspected(seats, wasAlive, ledger);
			notifyBlocked(seats, intents, ledger);
		}
```

`skipAttacks`(첫 밤 무사)여도 이 줄은 돈다. 첫 밤에 막힌 사람은 첫 밤에
통보를 받는다 — 스펙 §S6이 그렇게 정했고, 8인 판에서는 건달의 최소 인원(8)과
첫 밤 무사(8인 이하)가 겹치므로 실제로 자주 일어나는 경우다.

- [ ] **Step 6: 통보 테스트를 통과시킨다**

```bash
npm test -- --test-name-pattern="차단"
```

Expected: PASS. Task 10의 14개와 이번 8개, 합쳐 22개.

- [ ] **Step 7: 실패하는 덱 테스트를 쓴다**

`tests/deck.test.ts`. Task 1이 쓴 `it("건달은 어느 인원에서도 나오지 않는다")`를
**통째로 교체한다.** 그 테스트의 주석이 이미 "다시 들어오는 것은 건달 재설계
슬라이스다"라고 적어 두었다 — 지금이 그 슬라이스다.

```ts
	it("건달은 8인 미만 덱에 나오지 않는다", () => {
		// 킬러가 1명인 구간에서 건달이 그 1명을 맞추면 밤이 통째로 사라진다.
		// 6인에서는 자기를 뺀 5명 중 하나라 20%이고, 의사까지 합치면
		// 밤의 3분의 1 이상이 없어진다. 8인의 26%가 상한선이다
		for (let count = MIN_PLAYERS; count < 8; count++) {
			for (let seed = 1; seed <= 100; seed++) {
				assert.ok(
					!buildRoleDeck(DECK, count, rngFrom(seed)).includes(Role.THUG),
					`${count}인 seed ${seed}`
				);
			}
		}
	});

	it("건달은 8인 이상에서 실제로 나온다", () => {
		let seen = 0;
		for (let seed = 1; seed <= 200; seed++) {
			if (buildRoleDeck(DECK, 8, rngFrom(seed)).includes(Role.THUG)) seen++;
		}
		assert.ok(seen > 0, "200판을 돌려도 건달이 한 번도 안 나왔다");
	});

	it("건달과 군인은 같은 덱에 함께 서지 않는다", () => {
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 100; seed++) {
				const deck = buildRoleDeck(DECK, count, rngFrom(seed));
				assert.ok(
					!(deck.includes(Role.THUG) && deck.includes(Role.SOLDIER)),
					`${count}인 seed ${seed}`
				);
			}
		}
	});

	it("밤 킬을 무효화할 수 있는 직업은 최대 둘이다", () => {
		// 의사는 citizenRequired라 6인 이상에서 항상 나온다. 그 위에
		// 군인 또는 건달 하나만 허용된다는 것이 배타 규칙의 목적이다
		const blockers = [Role.DOCTOR, Role.SOLDIER, Role.THUG];
		for (const count of EVERY_COUNT) {
			for (let seed = 1; seed <= 100; seed++) {
				const deck = buildRoleDeck(DECK, count, rngFrom(seed));
				const kinds = blockers.filter(role => deck.includes(role)).length;
				assert.ok(kinds <= 2, `${count}인 seed ${seed}: ${kinds}종`);
			}
		}
	});
```

`MIN_PLAYERS`·`EVERY_COUNT`·`DECK`·`rngFrom`은 이미 이 파일에 있다
(Task 1·Task 3).

- [ ] **Step 8: 실패를 확인한다**

```bash
npm test -- --test-name-pattern="건달|밤 킬"
```

Expected: `"건달은 8인 이상에서 실제로 나온다"`만 FAIL("200판을 돌려도 건달이
한 번도 안 나왔다"). 나머지 셋은 건달이 아예 없으므로 지금도 초록이다 —
Step 9가 건달을 넣는 순간 진짜로 무언가를 지키기 시작한다.

- [ ] **Step 9: 덱에 넣는다**

`src/domain/RuleSet.ts`의 `STANDARD_RULES.deck`. 세 줄이 바뀐다.

```ts
	citizenPool: [
		Role.POLITICIAN,
		Role.SHAMAN,
		Role.SPY,
		Role.SOLDIER,
		Role.REPORTER,
		Role.VIGILANTE,
		Role.SEER,
		Role.THUG,
	],
	exclusiveGroups: [
		// 둘 다 경찰 조사를 흐린다. 겹치면 경찰이 얻는 정보가 사실상 없다
		[Role.BEAST, Role.CON_ARTIST],
		// 보호 계열을 최대 2종으로 묶는다. 의사는 항상 나오므로
		// 그 위에 하나만 허용하는 것이 이 한 줄이다
		[Role.SOLDIER, Role.THUG],
	],
	minPlayers: { BEAST: 6, SEER: 6, CON_ARTIST: 7, SHAMAN: 8, REPORTER: 11, THUG: 8 },
```

`leadPool`에는 넣지 않는다 — 건달은 시민팀이고, 리드는 마피아 진영의 자리다.

속도전(`BLITZ_RULES`)은 시민 풀이 따로라 영향이 없고, 침묵전은
`STANDARD_RULES`의 덱을 그대로 참조하므로 자동으로 따라온다.

- [ ] **Step 10: 덱 테스트를 통과시킨다**

```bash
npm test -- --test-name-pattern="건달|밤 킬"
```

Expected: PASS, 넷 전부.

- [ ] **Step 11: 전체 검증**

```bash
npm run verify
```

Expected: 전부 통과. 이 시점이 시즌 0과 시즌 1이 모두 들어간 상태다.

- [ ] **Step 12: 커밋**

```bash
git add -A
git commit -m "feat(roles): tell both sides about a block and put the thug back in the deck

막은 쪽은 '이 사람이 어젯밤 움직였는가'를 얻는다. 경찰의 '마피아인가'보다
훨씬 약하고 점쟁이의 '능력을 가졌는가'보다 한 칸 강한 정보다 — 보유가
아니라 실제 사용이기 때문이다. 통보가 없으면 건달은 가해자를 맞혀야 하는
직업이 되는데, 그건 게임의 목적 그 자체라 실전에서는 운에 맡기게 된다.

막힌 쪽은 막혔다는 사실만 받는다. 건달의 번호가 들어가면 다음 낮에 바로
처형된다. 밤에 아무것도 하지 않은 사람에게는 보내지 않는다 — 손해가 없었고,
능력 없는 사람이 통보를 받으면 그 한 줄이 곧 건달의 존재 확정이다.

[SOLDIER, THUG] 배타가 '보호 계열 최대 2종' 규칙의 구현이다. 의사는 6인
이상에서 항상 나오므로, 그 위에 하나만 허용하면 밤 킬을 무효화할 수 있는
직업이 둘로 묶인다. 새 구조 없이 S2의 배타 규칙을 그대로 쓴다.

THUG의 최소 인원이 8인 근거는 밤이 사라질 확률이다. 6인에서 건달이 유일한
킬러를 맞출 확률이 20%, 의사까지 합치면 36%다. 8인에서는 26%로 의사 단독
14%에서 12%p 늘어난 것이고, 그 대가로 건달은 아군을 방해할 위험을 진다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
