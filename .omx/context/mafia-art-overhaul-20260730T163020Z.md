# Ralph Context Snapshot: Mafia Art Overhaul

## Task statement

Generate every required graphical resource with the Image Gen skill and apply it to the MafiaGame_ZEP project. Cover cutscenes, every in-game role icon, UI assets, game icons, and backgrounds/illustrations. Remove all placeholder imagery while maintaining one consistent high-quality 2D dark-casual art direction for mobile and PC.

## Desired outcome

- Every visual state used by the game resolves to a deliberate production asset.
- Cutscenes cover game start, day, night, discussion, voting, execution, night result, both victory outcomes, role reveal, and special ability activation.
- Every role defined by the code has a matching icon in one shared style.
- UI surfaces and game-action symbols use the same palette, lighting, edge language, and readability rules.
- Lobby/day/night/voting/prison/graveyard/title/result backgrounds are integrated without obscuring UI.
- No blank, placeholder, temporary, or missing image references remain.
- Tests, lint, typecheck, asset validation, widget build, and project build pass with fresh evidence.

## Known facts and evidence

- The project is a TypeScript ZEP game with HTML widget sources under `src/ui`, generated widget files under `res`, and service/domain logic under `src`.
- Existing raster resources include role/action sprites, `mafiaMap.png`, `ghost.png`, `silhouette2.png`, and `blank.png`.
- Existing automated tests include `tests/assets.test.ts`, game-flow tests, layout tests, reconnect tests, and widget checking/build tooling.
- The current branch is `docs/season0-1-execution-design`; the worktree was clean when inspected.
- Built-in Image Gen is the required default generation path. Project-bound outputs must be copied into the workspace and referenced by the game.
- Transparent icon-like assets should use a flat chroma-key generation source followed by local alpha removal and validation.

## Constraints

- Use Image Gen for all needed raster illustrations and raster icons; do not ship placeholders.
- Keep one cohesive dark-casual 2D style across all generated asset families.
- Small icons must remain legible; backgrounds must preserve UI readability.
- Preserve existing game behavior while replacing/extending presentation.
- Prefer existing project patterns and small, reviewable integration changes; add no dependencies.
- Ralph completion requires fresh verification, architect sign-off, changed-file deslop, regression re-verification, and state cleanup.

## Unknowns and open questions to resolve from the repository

- Exact canonical role roster, role IDs, and whether any roles are currently hidden or season-gated.
- Exact phase/cutscene event vocabulary and the widget routes that display each state.
- How ZEP resource paths and HTML widget bundling handle additional raster assets.
- Which current resources are intentional legacy sprites versus placeholders that must be replaced.
- Required canvas sizes/aspect ratios imposed by current widgets and ZEP surfaces.
- Whether some UI chrome is better kept code-native while still using generated textures/frames as requested.

## Likely codebase touchpoints

- `src/domain/Roles.ts`, `src/types/Game.types.ts`, and role-assignment/night-resolution logic.
- `src/constants/Assets.ts`, `src/infrastructure/Sprites.ts`, and resource validation tests.
- `src/services/Cut.ts`, `GameFlow.ts`, `Stage.ts`, `Outcome.ts`, `Cards.ts`, `Voting.ts`, and `Widgets.ts`.
- `src/ui/*.html`, `src/ui/theme.css`, shared widget scripts, and generated `res/*.html`.
- `tools/build-widgets.js`, `tools/check-widgets.js`, and asset-focused tests.
- New production assets under a structured `res` subdirectory if the runtime supports nested paths, otherwise stable flat filenames under `res`.

## Initial stop condition

The task is complete only when the full code-derived asset inventory is generated, integrated, visible through the relevant widget flows, validated against missing/placeholder references, and all applicable automated checks pass after final cleanup and architect review.
