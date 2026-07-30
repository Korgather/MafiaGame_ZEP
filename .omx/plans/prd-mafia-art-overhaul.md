# PRD: MafiaGame_ZEP Production Art Overhaul

## Objective

Replace emoji/gradient-only presentation and placeholder-like visual gaps with a complete, code-derived production art system. Every required cutscene, role, UI surface, game action, and background must resolve to an intentional local raster asset generated with Image Gen and presented in one cohesive dark-casual 2D style.

## Art direction: Noir Dollhouse

- Visual metaphor: a compact crime diorama lit by one suspicious lamp.
- Palette: soot black `#120f0e`, dark walnut `#2a2320`, tarnished brass `#d8a94a`, blood vermilion `#d8443f`, civic blue `#5aa9d8`, ghost fog `#a9bed0`.
- Lighting: warm upper-left lamp rim, cold blue undershadow, 70-80% dark mass.
- Icon rule: one dominant silhouette plus one prop, readable at 48px, no text, no watermark.
- Cutscene rule: 16:9 poster composition, low-detail center-safe text zone, dark scrim applied by HTML.
- Background rule: lower contrast behind interactive UI; detail is concentrated around edges.
- UI texture rule: generated textures sit at 8-18% opacity behind live HTML text and controls.

## Authoritative code-derived scope

### Roles (12)

`MAFIA`, `DOCTOR`, `POLICE`, `SPY`, `SHAMAN`, `POLITICIAN`, `VIGILANTE`, `SOLDIER`, `THUG`, `REPORTER`, `BEAST`, `CITIZEN`.

Each role receives a 512x512 master icon and a stable local filename:

- `art_role_mafia.png`
- `art_role_doctor.png`
- `art_role_police.png`
- `art_role_spy.png`
- `art_role_shaman.png`
- `art_role_politician.png`
- `art_role_vigilante.png`
- `art_role_soldier.png`
- `art_role_thug.png`
- `art_role_reporter.png`
- `art_role_beast.png`
- `art_role_citizen.png`

### Cutscenes and ability activation art (15)

- Game lifecycle: `game-start`, `role-reveal`, `night-start`, `night-result`, `day-start`, `discussion-start`, `vote-start`, `execution`, `citizen-win`, `mafia-win`.
- Ability families: `attack`, `heal`, `investigate`, `silence`, `scoop`.

All cutscene/ability art uses 16:9 masters with no embedded text. The cut widget receives a typed scene key and overlays live Korean copy.

### UI assets (13)

- Panel texture, popup frame, card front, card back.
- Primary, secondary, danger button plates.
- Vote frame, chat frame, ability frame.
- Notification banner, victory frame, loading emblem, tutorial frame.

Responsive layout remains HTML/CSS. Generated raster assets provide texture, framing, and illustration without baking dynamic copy into images.

### Game icons (13)

`vote`, `skip`, `confirm`, `cancel`, `time`, `player`, `dead`, `alive`, `mute`, `settings`, `sound`, `exit`, `restart`.

Every icon is a text-free 256x256 PNG with a simple silhouette and safe padding. Matching controls use the icons; unavailable gameplay controls still ship through the typed asset manifest for future-safe packaging.

### Backgrounds and illustrations (8)

- `lobby`
- `village-day`
- `village-night`
- `vote-hall`
- `prison`
- `graveyard`
- `title`
- `result`

The existing `mafiaMap.png` is retained as the in-world map because it already matches the Noir Dollhouse direction. Widget backgrounds are generated separately and applied at low contrast.

## Product behavior

1. Role reveal cards and the role book render role icons instead of emoji glyphs.
2. Phase, vote, role-action, lobby, chat, cutscene, and game-over widgets use local production art layers.
3. Cut payloads include a typed scene key. Lifecycle calls select the correct scene.
4. Ability selection displays the art family matching the role's `NightActionKind`.
5. Buttons and status indicators render local game icons with text retained for accessibility.
6. All image references are local; the build continues to reject external hosts.
7. `blank.png` is replaced by a purpose-named invisible runtime resource so no placeholder-like filename remains in active code.

## Implementation boundaries

- Add a single typed visual asset manifest under `src/constants`.
- Add role icon and ability-art metadata to `ROLE_DEFS`; remove role emoji as the primary visual path.
- Extend widget payload types instead of letting HTML guess filenames from display text.
- Keep generated HTML self-contained except for relative local image files in `res/`.
- Keep all production art filenames flat under `res/` until ZEP nested-resource packaging is proven.
- Do not add dependencies.
- Preserve game rules and timing semantics; visual sequencing may extend existing cut time but must not consume interaction time.

## User stories and acceptance criteria

### US-001: Typed production asset inventory

As a maintainer, I want every required asset declared in one typed manifest so missing coverage fails in tests.

- Every role, cut scene, UI asset, game icon, and background has one stable filename.
- All declared files exist in `res/` and are valid PNGs.
- No active reference contains `placeholder`, `temp`, `dummy`, `sample`, or `blank`.

### US-002: Role identity art

As a player, I want my role and the role book to use consistent role artwork so roles are recognizable without emoji rendering differences.

- All 12 `Role` values map to an icon.
- Role reveal, guide/book cards, and compact role presentations receive the correct icon path.
- Icons remain readable at 48px and 96px.

### US-003: Lifecycle cutscenes

As a player, I want each major transition to have its own illustrated scene so the game state change is immediately understandable.

- Game start, role reveal, night start, night result, day start, discussion, vote, execution, both wins are represented.
- Cutscene text remains live HTML and readable on mobile/PC.
- Phase timers include the complete queued cut duration.

### US-004: Ability activation art

As an active-role player, I want the action screen to visually communicate my ability family.

- ATTACK, HEAL, INSPECT_TEAM/INSPECT_ROLE, SILENCE, and SCOOP map to matching art.
- Passive roles never receive a misleading active-ability illustration.

### US-005: Production UI surfaces

As a player, I want all widgets to feel like one game rather than unrelated HTML panels.

- Panel, popup, button, vote, chat, ability, notification, victory, loading, and tutorial art is applied.
- Text contrast meets at least 4.5:1 against the final composited surface.
- Controls retain visible focus, pressed, selected, disabled, and danger states.

### US-006: Game action icons

As a player, I want small controls to remain identifiable on mobile.

- All 13 requested icons exist and are packaged.
- Existing matching controls use their icon plus a text/aria label.
- Icons do not become the sole carrier of meaning.

### US-007: Environment backgrounds

As a player, I want each game context to have a coherent location illustration without sacrificing UI readability.

- All eight requested environments exist.
- Lobby/title, day/night phase, vote, execution, graveyard, and result surfaces use the correct background.
- Background contrast is reduced behind live UI.

### US-008: Zero-placeholder completion

As a release owner, I want automated proof that production packaging has no missing or placeholder imagery.

- Asset tests derive coverage from code constants and `Role`.
- Generated widget HTML references only existing local images.
- Targeted tests, `npm run verify`, and `npm run build` pass after final cleanup.
- Architect review approves the integrated result.

## Stop condition

All stories pass with fresh test/build evidence, rendered widget inspection confirms coherent presentation at desktop and mobile sizes, no active placeholder/missing image reference remains, architect review approves, the mandatory changed-file deslop pass is complete, and regressions remain green.
