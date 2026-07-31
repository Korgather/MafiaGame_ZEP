# 마피아 게임 (ZEP)

ZEP 맵 하나에서 8개 방이 동시에 돌아가는 마피아 게임. TypeScript로 작성하고 webpack으로 단일 번들을 만든다.

## 개발

```bash
npm install
```

| 명령                | 하는 일                                            |
| ------------------- | -------------------------------------------------- |
| `npm run verify`    | 아래 다섯 검사를 순서대로 (type-check → lint → check:zep → test → check:ui) |
| `npm run type-check`| 타입 검사 (`tsc --noEmit`)                          |
| `npm run lint`      | ESLint                                              |
| `npm run check:zep` | ZEP API에 `undefined` 인자가 가는지 검사            |
| `npm test`          | 도메인 로직 단위 테스트 (`node --test`, 빌드 불필요)|
| `npm run build:ui`  | `src/ui/*.html` + `theme.css` → `res/*.html` 생성    |
| `npm run check:ui`  | 위젯을 다시 만들고 장면 정의와 어긋나는지 검사      |
| `npm run build`     | `verify` 후 `main.ts` → `res/main.js` 번들 생성      |
| `npm run archive`   | 빌드 후 zip 패키징                                  |
| `npm run deploy`    | 패키징 후 ZEP에 배포                                |

### 빌드가 왜 webpack인가

`zep-script build`는 babel 단일 파일 컴파일이라 모듈 분리가 되지 않는다. 대신 webpack이
`main.ts`를 번들해 `res/main.js`를 만든다. `zep-script archive`는 `res/` 안의 내용을 zip 루트에
넣으므로 `res/main.js`가 곧 ZEP 런타임의 엔트리포인트가 된다.

`@zep.us/babel-plugin-zep-script`가 번들 과정에서 `ScriptApp.*` → `App.*`,
`ScriptMap.*` → `Map.*`로 치환하고 `import "zep-script"`를 제거한다. 소스에서는 항상
`ScriptApp` / `ScriptMap`을 쓴다.

### 런타임 제약 (Jint)

ZEP 스크립트는 Jint 위에서 돈다. `@babel/preset-env`를 쓰지 않으므로 소스 문법이 그대로 나간다.

- `console`, `window`, `document`, `fetch` 없음 — HTTP는 `ScriptApp.httpPostJson`
- 전역 `Map`은 babel이 `ScriptMap`으로 치환한다. 네이티브 `Map`/`Set` 금지, 일반 객체와 배열을 쓴다
- ES2021+ 문법 자제
- **ZEP API에 `undefined`를 인자로 넘기지 않는다**

마지막 항목이 특히 함정이다. `ScriptApp`/`ScriptPlayer`/`ScriptMap`은 C# 메서드이고,
Jint는 인자 **개수와 타입**으로 오버로드를 고른다. `.d.ts`의 `frameRate?: number`는
"생략 가능"이라는 뜻이지 "undefined를 받는다"는 뜻이 아니다. 자리를 채우려고 `undefined`를
넣으면 맞는 오버로드가 없어 스크립트가 죽는다.

```ts
loadSpritesheet(file, w, h, frames, undefined); // ✗ No public methods with the specified arguments
loadSpritesheet(file, w, h, frames);            // ✓ 인자를 아예 뺀다
```

`tsc`는 이걸 잡지 못하므로 호출을 분기하거나, 뒤쪽 선택 인자를 쓰지 않는 API를 고른다.
(`showCustomLabel`의 표시 시간은 7번째 인자라 앞의 `width`/`opacity`를 건널 수 없다.
그래서 라벨은 시간이 5번째인 `showCenterLabel`만 쓴다 — `services/Broadcast.ts`)

`npm run check:zep`이 이걸 강제한다. TypeScript 컴파일러 API로 각 호출의 시그니처를
해석해서, 선언이 `zep-script` 안에 있는 호출의 인자 중 타입에 `undefined`가 섞인 것을
전부 찾는다. 리터럴이든 `number | undefined` 타입의 변수든 똑같이 잡히고,
`npm run build`가 번들을 만들기 전에 먼저 돌린다.

나머지 규칙은 ESLint의 `no-restricted-globals` / `no-restricted-syntax`가 맡는다.

## 구조

```
main.ts                  엔트리 (src/index를 부른다)
src/
  index.ts               ZEP 이벤트 배선만. 게임 규칙 없음
  types/                 타입, 위젯 메시지 파서
  constants/             설정값, 좌표, 에셋 이름
  domain/                순수 함수. ZEP API를 부르지 않는다 → 테스트 대상
  entities/              방 상태 모델과 레지스트리
  infrastructure/        player.storage / player.tag / 스프라이트 캐시 래퍼
  services/              ZEP API를 실제로 부르는 계층
  ui/                    위젯 HTML 원본과 theme.css (여기를 고친다)
tests/                   domain 단위 테스트
tools/                   빌드·검사 스크립트 (Node에서만 돈다)
res/                     이미지, 사운드 (+ 산출물 main.js와 위젯 HTML)
```

`res/*.html`은 손으로 고치지 않는다. `src/ui/*.html`에 `theme.css`를 끼워 넣어
`npm run build:ui`가 만들어 내는 산출물이고, 커밋에는 원본과 산출물이 같이 들어간다.

의존 방향은 한 방향이다. `services` → `domain`/`entities`/`infrastructure`,
`domain` → `types`/`constants`만. 순환 참조가 없다.

핵심은 **`domain`이 ZEP과 무관하다**는 점이다. 승패 판정, 투표 집계, 밤 능력 처리,
직업 배분, 레벨 계산이 전부 순수 함수라서 `npm test`가 ZEP 없이 이들을 검증한다.

### 상태 머신

`services/GameFlow.ts`의 `advancePhase` switch 하나가 게임 규칙의 전부다.

```
LOBBY → ROLE_REVEAL → NIGHT → DAY → VOTE → VOTE_RESULT → NIGHT ...
                                                       ↘ GAME_OVER → LOBBY
```

승패 판정은 사망이 발생할 수 있었던 단계 직후(NIGHT 정산 후, VOTE_RESULT 종료 후)에만 한다.

## 맵 계약 (ZEP 에디터에서 손으로 해야 하는 것)

코드가 지킬 수 없고 맵을 만드는 사람이 지켜야 하는 약속이 하나 있다.
**방마다 프라이빗 영역을 하나씩 칠하고, 그 영역 id를 방 번호(1~8)와 똑같이 둔다.**
영역은 최소한 그 방의 좌석 12칸(`constants/RoomLayout.ts`의 `seatPosition`)을 덮어야 한다.

왜 필요한가: 낮 토론은 ZEP 기본 채팅의 `PRIVATE_AREA`로 나간다. 그래야 캐릭터
머리 위 말풍선이 뜨면서도 같은 방 사람에게만 보인다. 영역이 없으면 그 자리는
"영역 밖"(id 0)이 되고, 영역 밖은 서로가 서로의 청중이라 8개 방의 토론이 한데 섞인다.
그래서 영역이 없는 방은 말풍선을 아예 내보내지 않는다 — 새는 것보다 안 뜨는 편이 낫다.

빠뜨리면 이렇게 된다:

| 실수 | 증상 | 누가 잡는가 |
| --- | --- | --- |
| 방을 안 칠했다 | 그 방만 낮 토론 말풍선이 안 뜬다 (채팅 위젯에는 정상적으로 남는다) | 맵이 뜰 때 `Stage.auditRoomAreas`가 스태프 채팅으로 방 번호를 알린다 |
| 영역 id를 다른 번호로 칠했다 | 그 방 토론이 옆 방 사람에게 보인다 | **아무도 못 잡는다.** 영역 id를 읽는 API가 없어서 눈으로 확인하는 수밖에 없다 |
| 영역이 좌석 일부만 덮는다 | 판정상 방을 안 칠한 것과 같다 | 위와 같이 `auditRoomAreas`가 잡는다 |

곁다리로 알아둘 것: 프라이빗 영역은 음성·화상 통화도 같이 나눈다. 즉 이 영역을
칠하는 순간 방마다 음성이 분리되는데, 이건 이 게임에서 원하는 동작이라 그대로 둔다.
로비는 칠하지 않는다 — 대기실 잡담은 전원에게 들려야 한다.

## 직업 추가하기

1. `types/Game.types.ts`의 `Role`에 항목 추가
2. `domain/Roles.ts`의 `ROLE_DEFS`에 정의 추가 — `Record<Role, RoleDef>`라서 빠뜨리면 컴파일이 실패한다
3. `domain/RoleAssignment.ts`의 인원수별 배분표에 넣기

직업 카드는 `res/card.html` 하나가 전부를 그린다. 직업마다 위젯을 만들지 않는다.

밤 능력이 기존 8종(`BLOCK` / `HEAL` / `ATTACK` / `INSPECT_TEAM` / `INSPECT_ROLE` /
`INSPECT_ABILITY` / `SCOOP` / `NOTE`)에 없으면 `NightActionKind`에 추가하고
`domain/NightPipeline.ts`의 `apply()`에 가지를 단다 — `default` 가지가 없어서
빠뜨리면 컴파일이 막힌다. 새 능력이 기존 순서 사이에 끼어야 하면 `NightStep`도
같이 손본다.

---

# 기획 메모

## 밤부터 시작하게 만들자

## 모드별 직업군

> 초안이다. 정원이 12로 늘면서 실제 배분표는 `domain/RoleAssignment.ts`로 옮겨 갔다.

- 4인 : 마피아1, 경찰1, 의사1, 특수직업(시민)1
- 5인 : 마피아1 경찰1, 의사1, 특수직업(시민)1
- 6인 : 마피아1, 특수직업(마피아)1, 경찰1, 의사1, 특수직업(시민)2
- 7인 : 마피아1, 특수직업(마피아)1, 경찰1, 의사1, 특수직업(시민)3
- 8인 : 마피아2, 특수직업(마피아)1, 경찰1, 의사1, 특수직업(시민)3

## 추가해야 할 직업

- 특수직업(시민)

  - 자경단원 (밤에 플레이어 한 명을 조사하여 마피아일 경우 처형시킴), 1회용
  - 군인 (마피아의 처형을 한 번 무시한다), 마피아팀에게 직업을 조사당할 경우 그 직업의 정체를 알 수 있다.
  - 정치인(투표로 처형당하지 않는다), 투표권이 두 표로 인정된다.
  - 건달 (밤에 지목된 플레이어는 다음 날 투표를 할 수 없다, 지목된 플레이어가 마피아일 경우 "처형" 능력을 사용할 수 없다.)
  - 기자 (한 명을 선택하여 취재해 다음 날 그사람의 직업을 모두에게 공개한다.) 1회용, 두번째 밤부터 사용 가능
  - 영매 (밤에 유령과 대화할 수 있다)

- 특수직업(마피아)
  - 스파이, 밤마다 플레이어 한 명을 골라 그 사람의 직업을 알아낼 수 있다. 마피아일 경우 접선
  - 짐승인간, 자신이 마피아에게 처형 당하는 경우 또는 자신이 선택한 사람이 마피아에게 처형당할 경우 마피아와 접선, 접선 이후 죽일 수 있음

> 여기 적힌 여덟 직업은 전부 구현됐고, 메모에 없던 사기꾼·점쟁이가 더 붙어 지금은 14종이다.
> 세부 규칙은 밸런스를 거치며 원문과 달라졌다 — 예를 들어 건달은 "다음 날 투표 금지"가 아니라
> 밤 능력을 막는 쪽으로 바뀌었다. 시행 중인 규칙은 `domain/Roles.ts`가 기준이다.

## 고민되는 부분

- 접선?을 어떻게 구현할까
  - pc의 경우는 문제 없지만 모바일이 문제다. 하지말까?

> 해결책 메모
> 채팅 입력창을 덮는 채팅 입력 UI를 만들자
> 이게 된다면, player.sendMessage를 이용하자 마피아 채팅은 빨간색
