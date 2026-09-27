# Workout v2 regression checks

Install the development dependency with `pnpm install --frozen-lockfile --ignore-scripts`, then run `pnpm test` (or `node --test tests/workout2*.test.js`). Node 20 or newer is required for the test environment.

The site itself has no package dependencies or build step. Workout v2 uses its own HTML, CSS, model, and UI scripts; the original logger is separate.

The model tests cover per-set weights, progression, partial history, stable session IDs, validation, session completion, ordering, archiving, and conversion of existing v2 workout data. UI tests run the actual page scripts in jsdom with an isolated localStorage. They exercise forms, navigation, imports, storage errors, stale edits, Undo, empty states, and dialog navigation.

jsdom does not render layouts or implement native dialog focus trapping, mobile keyboards, or touch input. Before a mobile release, manually check the page at 320/390 px and desktop widths, both themes, reduced motion, keyboard-only navigation, and iOS/Android input and scrolling. No production data is used by the automated tests.

## Audit result — 2026-09-27

60 regression checks pass. Coverage includes a complete custom-routine journey, import/export, archive/restore, failure/recovery, keyboard focus, draft preservation, stale writes, compact-card navigation, correction without jumping to another exercise, and cross-tab theme changes.

The local page was also verified in isolated headless Chrome at 320, 390, 768 and 1280 px. Logging, correction and finishing passed at each width with no page errors or horizontal overflow. Screenshots were inspected in light and dark themes. Additional checks covered native dialog Tab/Escape behavior, reduced motion, long exercise names, labeled controls and 44 px button heights. The built-in browser runner still has a Windows sandbox startup issue; the bundled Playwright runtime and an isolated Chrome profile provided the browser verification. No personal browser profile or production workout data was accessed.

A 3,000-session fixture with Chrome CPU throttling set to 4× produced these median synchronous interaction-plus-layout times across five runs: progress view 25.8 ms, history 60 ms, settings 14.4 ms, and logging a set 125 ms. History initially renders 30 rows. These measurements exclude network latency and subsequent painting; they are not real-device interaction or frame-rate guarantees.

The four production HTML/CSS/JS assets total 66,581 bytes uncompressed and 20,564 bytes with local gzip compression (favicon excluded). There are no runtime package dependencies, external fonts, icon downloads, or a build step.

Physical iOS/Android keyboard behavior and device-specific scrolling still require real-device checks; desktop mobile emulation does not establish those behaviors.
