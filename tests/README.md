# Workout v2 regression checks

Install the development dependency with `pnpm install --frozen-lockfile --ignore-scripts`, then run `pnpm test` (or `node --test tests/workout2*.test.js`). Node 20 or newer is required for the test environment.

The site itself has no package dependencies or build step. Workout v2 uses its own HTML, CSS, model, and UI scripts; the original logger is separate.

The model tests cover per-set weights, progression, partial history, stable session IDs, validation, session completion, ordering, archiving, and conversion of existing v2 workout data. UI tests run the actual page scripts in jsdom with an isolated localStorage. They exercise forms, navigation, imports, storage errors, stale edits, Undo, empty states, and dialog navigation.

jsdom does not render layouts or implement native dialog focus trapping, mobile keyboards, or touch input. Before a mobile release, manually check the page at 320/390 px and desktop widths, both themes, reduced motion, keyboard-only navigation, and iOS/Android input and scrolling. No production data is used by the automated tests.

## Audit result — 2026-09-27

66 regression checks pass. Coverage includes a complete custom-routine journey, import/export, archive/restore, failure/recovery, keyboard focus, draft preservation, stale writes, compact-card navigation, correction without jumping to another exercise, and cross-tab theme changes. The settings redesign adds coverage for desktop category navigation, mobile Back and focus restoration, resizing without replacing editor inputs, and protecting unfinished edits on navigation, Close, and Escape.

The local page was verified in isolated headless Chrome at 320, 390, 768, 844, 960, 1280, 1920 and 3437 px. The dialog pass included 320 × 568, 844 × 390 and 960 × 540 short viewports in both themes. Category navigation, theme selection, backup download, import review/replacement and Undo, saved and discarded edits, history pagination, and content scrolling passed without page errors or horizontal overflow. Headers and Close remain accessible while content scrolls. Switching between desktop and mobile preserves the same editor inputs and their values. Screenshots were inspected in both themes, including empty and populated exercise history.

Native dialog Tab/Escape behavior, reduced motion, long names, and computed contrast were also checked. The redesigned dialog's destructive-action text against the unsaved-edit banner measures 5.42:1 in light mode and 4.88:1 in dark mode; input outlines against their fill measure 3.64:1 and 4.36:1 respectively. These targeted checks are not a full accessibility certification.

The earlier workout pass verified logging, correction and finishing at 320, 390, 768 and 1280 px. The built-in browser runner has a Windows sandbox startup issue; the bundled Playwright runtime and isolated Chrome profiles provided browser verification. No personal browser profile or production workout data was accessed.

Switching to Exercises & routines took a median 12.7 ms across ten synchronous interaction-plus-layout measurements with Chrome CPU throttling set to 4×, using default workout data. These measurements exclude network latency and subsequent painting; they are not real-device interaction or frame-rate guarantees.

The four production HTML/CSS/JS assets total 78,552 bytes uncompressed and 23,359 bytes with local gzip compression (favicon excluded). There are no runtime package dependencies, external fonts, icon downloads, or a build step.

Physical iOS/Android keyboard behavior and device-specific scrolling still require real-device checks; desktop mobile emulation does not establish those behaviors.
