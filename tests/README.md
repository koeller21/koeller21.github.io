# Workout v2 regression checks

Install the development dependency with `pnpm install --frozen-lockfile --ignore-scripts`, then run `pnpm test` (or `node --test tests/workout2*.test.js`). Node 20 or newer is required for the test environment.

The site itself has no package dependencies or build step. Workout v2 uses its own HTML, CSS, model, and UI scripts; the original logger is separate.

The model tests cover per-set weights, progression, partial history, stable session IDs, validation, session completion, ordering, archiving, and conversion of existing v2 workout data. UI tests run the actual page scripts in jsdom with an isolated localStorage. They exercise forms, navigation, imports, storage errors, stale edits, Undo, empty states, and dialog navigation.

jsdom does not render layouts or implement native dialog focus trapping, mobile keyboards, or touch input. Before a mobile release, manually check the page at 320/390 px and desktop widths, both themes, reduced motion, keyboard-only navigation, and iOS/Android input and scrolling. No production data is used by the automated tests.

## Audit result — 2026-09-27

54 regression checks pass, including a complete custom-routine journey and the import/export, archive/restore, failure/recovery, keyboard-focus, draft-preservation and stale-write paths. The test harness collects uncaught DOM errors; all audited paths completed without them.

An isolated 3,000-session probe (about 481 KB of JSON) measured 27 ms for validation/normalization, 2 ms for building history indexes, 63 ms for the initial jsdom render and 35 ms to open exercise history. Only 30 history rows are rendered initially; earlier entries load in batches. These are local Node/jsdom measurements, not browser frame-rate or mobile performance results.

Live browser verification was attempted against the supplied GitHub Pages URL, but the browser runner could not start because of a Windows sandbox ACL error. Visual layout, native dialog behavior and mobile keyboard behavior therefore remain unverified on actual devices.
