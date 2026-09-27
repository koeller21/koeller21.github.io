# Workout regression checks

Install the development dependency with `pnpm install --frozen-lockfile --ignore-scripts`, then run `pnpm test` (or `node --test tests/workout*.test.js`). Node 20 or newer is required for the test environment.

The site itself has no package dependencies or build step. The current app lives at `pages/workout.html`, with its stylesheet, model, and UI scripts under the canonical `workout` filenames. It replaces the original logger; the homepage and installed-app entry point both open it.

The model tests cover the shipping Full Body A/B/C program, optional-day rotation, weekly set counts, per-set weights, double progression, plateau reminders, partial history, stable session IDs, validation, session completion, ordering, and archiving. General regression checks use a stable custom program in `workout-fixtures.js`; dedicated tests exercise the actual shipping defaults. UI tests run the actual page scripts in jsdom with an isolated localStorage. They exercise forms, navigation, imports, storage errors, stale edits, Undo, empty states, and dialog navigation.

Finish workout completes in one tap after at least one set is logged, marking every unlogged set as skipped. There is no manual Skip remaining sets action or finish confirmation. Regression coverage verifies partial-set accounting, preserved logged weights, Undo, and entering or restoring skipped sets after reopening.

The current data format is v4, stored under `wapp-v4`. There is no migration: the old `wapp` key is left untouched and is not loaded. Imports reject older backup formats. Current backups preserve whether a routine is an optional day.

jsdom does not render layouts or implement native dialog focus trapping, mobile keyboards, or touch input. Before a mobile release, manually check the page at 320/390 px and desktop widths, both themes, reduced motion, keyboard-only navigation, and iOS/Android input and scrolling. No production data is used by the automated tests.

## Audit result — 2026-09-27

### Full interaction and failure audit

The current workout app received the full interaction audit after replacing the original logger at `pages/workout.html`; all four HTML pages also passed loading/layout smoke checks at 390 and 1280 px, and all 16 local links/assets resolved. No production storage or personal browser profile was used.

Confirmed fixes:

| Failure | Verification and fix |
| --- | --- |
| Closed mobile navigation painted behind the page during a downward gap | Confirmed from its computed visibility and a controlled 120 px displacement of the page, matching the reported symptom. Closed navigation is now visually hidden; the exposed background matches the page. Open navigation and desktop visibility still work. |
| Reload stayed blocked after another tab saved while a set draft existed | Reproduced in jsdom and two actual Chrome tabs. Explicit Reload now clears the abandoned drafts and reloads; automatic reload continues to protect them. |
| Routine changes discarded typed set values | Reproduced in jsdom and Chrome. Drafts are retained separately per routine and exercise, including exercises shared between routines. |
| A delayed backup read replaced a newly opened, unsaved editor | Reproduced with a deferred file read in jsdom and Chrome. Import now respects the existing Keep editing / Discard guard. |
| Undo silently replaced an unsaved editor | Reproduced in jsdom and Chrome. Undo now uses the same edit guard. |
| Repairing corrupt storage from another tab left the error screen visible | Reproduced in jsdom and Chrome. Successful reload now restores the app and permits logging. |
| Prototype-property exercise IDs passed import validation but broke logging | Reproduced by importing `toString`, then attempting to log. Such IDs are rejected before replacing saved data. |
| Archiving a completed exercise marked it Skipped | Reproduced in the model and browser. Only missing sets are skipped; completed exercises stay Done. |
| V2 failed to reload offline | Reproduced in fresh mobile/desktop Chrome profiles. V2 now registers the shared worker, which precaches the canonical app and its install assets. Offline reload and retained logs passed after initial online setup. Worker tests also verify exact-version cache preference, request preservation, and keeping unrelated caches. |
| Homepage opened the old logger | Confirmed in markup and browser navigation. Its Workout logger link now opens the current app at `pages/workout.html`. The installed-app manifest uses the same entry point; duplicate V2 filenames and legacy logger assets have been removed. |

Final checks:

- 91 automated tests pass, including 10,000 deterministic model operations, 66 schema-value mutations, invalid numeric inputs, HTML-like names, storage failures, and offline-worker behavior.
- Twelve browser combinations pass: 320 × 568, 390 × 844, 844 × 390, 960 × 540, 1280 × 900 and 1920 × 1080, each in Light and Midnight. The narrowest runs use reduced motion.
- Browser journeys cover logging and correction, Undo, finishing/reopening, routine drafts, skipped sets, settings, guarded edits, keyboard focus, real cross-tab conflicts, delayed imports, backup download/replacement, malformed backups, offline reload and return online.
- Four seeded browser runs complete 600 randomized input/button actions without page errors or invalid persisted state.
- A 1,000-workout history passes pagination and editor resizing. Progress rendering plus synchronous layout took 42 ms in the canonical-page verification at 4× Chrome CPU throttling (43 ms in the preceding audit). These local samples exclude subsequent painting and are not real-device timing guarantees.
- Closed-drawer gap, workout, and dialog screenshots were inspected. No horizontal overflow was found after transitions settled.

Run `node tests/workout-browser-audit.cjs` for the browser audit. It requires an optional local Playwright installation and Chromium browser; neither is a production dependency. `PLAYWRIGHT_MODULE` can point to an existing Playwright module, `CHROME_BIN` to an existing Chromium executable, and `AUDIT_OUTPUT` to an existing screenshot directory. The script starts an ephemeral local server, uses isolated profiles, and closes both afterward.

The sidebar gap check simulates displaced page content; desktop Chrome cannot establish physical iOS Safari rubber-banding, native mobile keyboard behavior, or OS download UI. Those remain real-device verification limits.

### Earlier design and training checks

91 regression checks pass. Coverage includes a complete custom-routine journey, import/export, archive/restore, failure/recovery, keyboard focus, draft preservation, stale writes, compact-card navigation, correction without jumping to another exercise, and cross-tab theme changes. The settings redesign adds coverage for desktop category navigation, mobile Back and focus restoration, resizing without replacing editor inputs, and protecting unfinished edits on navigation, Close, and Escape.

The local page was verified in isolated headless Chrome at 320, 390, 768, 844, 960, 1280, 1920 and 3437 px. The dialog pass included 320 × 568, 844 × 390 and 960 × 540 short viewports in both themes. Category navigation, theme selection, backup download, import review/replacement and Undo, saved and discarded edits, history pagination, and content scrolling passed without page errors or horizontal overflow. Headers and Close remain accessible while content scrolls. Switching between desktop and mobile preserves the same editor inputs and their values. Screenshots were inspected in both themes, including empty and populated exercise history.

Native dialog Tab/Escape behavior, reduced motion, long names, and computed contrast were also checked. The redesigned dialog's destructive-action text against the unsaved-edit banner measures 5.42:1 in light mode and 4.96:1 in Midnight; input outlines against their fill measure 3.64:1 and 5.66:1 respectively. These targeted checks are not a full accessibility certification.

The UI cleanup pass rechecked logging, correction, Undo, completion and reopening at 320, 390, 768 and 1280 px in both themes. Checkmark controls have 48 × 48 px mobile targets and retain descriptive accessible names. The 260 ms confirmation animation runs after saving, respects reduced motion, and does not delay moving to the next set. The redundant progress strip is removed; counts remain in the subtitle. Expanded progression details, invalid-input feedback, preserved sibling drafts and the notification/drawer overlap fix passed in Chrome, with no page errors or horizontal overflow. The built-in browser runner has a Windows sandbox startup issue; the bundled Playwright runtime and isolated Chrome profiles provided browser verification. No personal browser profile or production workout data was accessed.

The initial training-defaults pass checked 320, 390 and 1280 px in both themes in isolated Chrome. It verified the eight-exercise main days and four-exercise optional day, logging different weights per set, completing A and advancing to B, optional-day editing, v4 export/import, rejection of old backups without changing saved data, preservation of the old storage key, increases only after both sets reach the upper rep limit, and recovery reminders without automatic load reductions. All six combinations passed without page errors or horizontal overflow. Screenshots of the program and training guide were inspected.

The subsequent exercise-selection pass replaced hack squats with leg extensions and Romanian deadlifts with leg curls, and removed calf raises from the default exercise library and routines. A/B/C retain six weekly quad sets and six hamstring sets; their workout totals are now 16/14/14, with eight sets on the optional day. All 77 regression checks pass. Isolated Chrome at 390 px (dark) and 1280 px (light) verified every routine, both leg exercises at 10–15 reps, the revised counts, and the absence of removed exercises. There were no page errors or horizontal overflow after navigation animations settled.

The Midnight theme pass checked 320, 390 and 1440 px in isolated Chrome. The requested Machine Rowing, Dumbbell Lateral Raise and Machine Crunch names render correctly. Logging, switching between Light and Midnight, browser tint, and retained workout data passed without page errors or settled-layout overflow. Workout and settings screenshots were inspected. Twelve targeted palette contrast checks passed: sampled text pairs range from 4.96:1 to 12.40:1, with main-page input borders at 3.69:1 and dialog input borders at 5.66:1. All 77 regression checks pass.

An earlier UI pass measured switching to Exercises & routines at a median 12.7 ms across ten synchronous interaction-plus-layout measurements with Chrome CPU throttling set to 4×, using the previous defaults. This was not remeasured for the larger Full Body program. These measurements exclude network latency and subsequent painting; they are not real-device interaction or frame-rate guarantees.

The four production HTML/CSS/JS assets total 79,196 bytes uncompressed and 23,377 bytes with local gzip compression (favicon excluded). The shared offline worker adds 1,294 bytes uncompressed / 601 bytes gzip. There are no runtime package dependencies, external fonts, icon downloads, or a build step.

Physical iOS/Android keyboard behavior and device-specific scrolling still require real-device checks; desktop mobile emulation does not establish those behaviors.
