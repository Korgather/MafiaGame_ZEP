# 마피아 게임 (ZEP)

ZEP 맵 하나에서 8개 방이 동시에 돌아가는 마피아 게임. TypeScript로 작성하고 webpack으로 단일 번들을 만든다.

## 개발

```bash
npm install
```

| 명령                | 하는 일                                            |
| ------------------- | -------------------------------------------------- |
| `npm run build`     | `main.ts` → `res/main.js` 번들 생성 (`check:zep` 포함)|
| `npm run type-check`| 타입 검사 (`tsc --noEmit`)                          |
| `npm run check:zep` | ZEP API에 `undefined` 인자가 가는지 검사            |
| `npm test`          | 도메인 로직 단위 테스트 (`node --test`, 빌드 불필요)|
| `npm run lint`      | ESLint                                              |
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
tests/                   domain 단위 테스트
res/                     위젯 HTML, 이미지, 사운드 (+ 빌드 산출물 main.js)
```

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

## 직업 추가하기

1. `types/Game.types.ts`의 `Role`에 항목 추가
2. `domain/Roles.ts`의 `ROLE_DEFS`에 정의 추가 — `Record<Role, RoleDef>`라서 빠뜨리면 컴파일이 실패한다
3. `domain/RoleAssignment.ts`의 인원수별 배분표에 넣기
4. `res/`에 직업 카드 위젯 HTML 추가

밤 능력이 기존 4종(`HEAL` / `KILL` / `INSPECT_TEAM` / `INSPECT_ROLE`)에 없으면
`NightActionKind`에 추가하고 `domain/NightResolution.ts`에서 처리한다.

---

# 기획 메모

## 밤부터 시작하게 만들자

## 모드별 직업군

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

> 정치인·영매·스파이는 구현 완료. 나머지는 미구현.

## 고민되는 부분

- 접선?을 어떻게 구현할까
  - pc의 경우는 문제 없지만 모바일이 문제다. 하지말까?

> 해결책 메모
> 채팅 입력창을 덮는 채팅 입력 UI를 만들자
> 이게 된다면, player.sendMessage를 이용하자 마피아 채팅은 빨간색
