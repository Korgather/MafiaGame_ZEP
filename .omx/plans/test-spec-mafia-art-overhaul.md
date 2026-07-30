# Test Specification: Mafia Art Overhaul

## Claims to prove

1. The asset manifest covers every explicit user-requested family and all 12 code-defined roles.
2. Every declared raster file exists, is a PNG, has non-zero dimensions, and respects its family dimension policy.
3. Transparent icons/frames have an alpha-capable PNG color type and transparent corners after chroma-key removal.
4. Every widget image reference resolves to an existing local file.
5. No active filename/reference contains placeholder markers.
6. Every lifecycle event and active ability resolves to the intended art key.
7. Widget generation, scene execution, type-checking, lint, ZEP checks, tests, and packaging remain green.

## Regression tests to add before integration

### `tests/assets.test.ts`

- Import the visual asset manifest and `Role`.
- Assert `Object.keys(ROLE_ICONS)` exactly covers `Object.values(Role)`.
- Flatten the complete manifest and assert filenames are unique.
- Assert all files exist below `res/`, have PNG signatures, and dimensions satisfy:
  - role icons: square, at least 512x512;
  - game icons/UI icon assets: square, at least 256x256;
  - cut/background art: aspect ratio between 1.7 and 1.8, at least 1024px wide;
  - flexible UI textures/frames: non-zero and manifest-declared expected class.
- Parse PNG IHDR color type; require alpha-capable types for role/game icons and transparent frames.
- Reject active references matching `placeholder|temp|dummy|sample|blank` case-insensitively.
- Assert cut scene keys include all lifecycle/ability keys in the PRD.
- Assert UI and game-icon keys exactly include the requested inventories.

### `tests/domain.test.ts`

- Replace role-glyph completeness with role-icon completeness.
- Assert each `ROLE_DEFS` entry's icon equals `ROLE_ICONS[role]`.
- Assert active `NightActionKind` values map to a non-empty ability art asset; passive roles map to null.

### `tests/gameflow.test.ts`, `tests/reconnect.test.ts`

- Assert game start queues `game-start` then `role-reveal` art.
- Assert night transition queues optional `execution` followed by `night-start`.
- Assert morning transition queues `night-result`, `day-start`, and `discussion-start`.
- Assert vote transition uses `vote-start`.
- Assert game over selects `citizen-win` or `mafia-win`.
- Assert reconnect during a cut receives the current scene key and remaining sequence continues.

### `tools/check-widgets.js`

- After each generated HTML file is loaded, extract local `src`, `href`, `poster`, and CSS `url(...)` references.
- Ignore data URLs and anchors; reject external URLs as today.
- Resolve relative paths against `res/` and fail if a local asset is missing.
- Fail on unresolved build placeholders.

### `tools/widget-scenes.js`

- Add representative desktop/mobile scenes for each new cut type.
- Add role reveal, passive/active ability, vote, chat, game-over, lobby/title scenes that exercise image paths.
- Expectations confirm image elements receive non-empty local paths and no runtime exceptions occur.

## Visual validation

- Run `npm run preview:ui` and inspect generated desktop/mobile preview surfaces.
- Verify role icons at 48px and 96px.
- Verify cut title/lines remain readable over every scene.
- Verify vote targets, chat messages, phase counts, buttons, and timers are not visually obstructed.
- Verify no green/magenta chroma fringe remains on transparent assets.
- Persist screenshot/verdict evidence to `.omx/state/mafia-art-overhaul/ralph-progress.json`.

## Command sequence

1. `node --test --import ./tests/helpers/FakeZep.ts tests/assets.test.ts`
2. `node --test --import ./tests/helpers/FakeZep.ts tests/domain.test.ts tests/gameflow.test.ts tests/reconnect.test.ts`
3. `npm run check:ui`
4. `npm run verify`
5. `npm run build`
6. Mandatory changed-file deslop pass.
7. Repeat steps 1-5 after deslop.

## Completion evidence matrix

| Requirement | Authoritative evidence |
| --- | --- |
| All roles | `Role` vs `ROLE_ICONS` exact-set test plus rendered role-card scenes |
| All cutscenes | typed `CUT_ART` exact-key test plus flow tests and cut preview scenes |
| All UI assets | typed `UI_ART` exact-key test plus widget HTML references and previews |
| All game icons | typed `GAME_ICONS` exact-key test plus packaged-file validation |
| All backgrounds | typed `BACKGROUND_ART` exact-key test plus per-widget previews |
| No placeholders | active-reference scan, missing-local-reference widget check, manual preview audit |
| Mobile/PC clarity | desktop/mobile preview screenshots and visual verdict |
| Build integrity | fresh `npm run verify` and `npm run build` output |
