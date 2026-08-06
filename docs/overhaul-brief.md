# Resistor Divider — overhaul brief (autonomous session)

You're overhauling the Resistor Divider tool (repo: go2dev/resistor-finder). Two versions coexist:

- Legacy: a static client-side app at the repo root on `main` — vendored libs, no build step, served by any static server (`python3 -m http.server 8000`). This is what's live at resistordivider.com.
- New: a SvelteKit app under `app/` on branch `cursor/sveltekit-greenfield-foundation-8189`, served under base path `/app`, consuming `@go2dev/wt-theme` from npm. This is the version being taken to production. Start from this branch.

The new version isn't at parity yet and has a few open decisions. This session runs on a fresh machine with only the repo, so treat the repo as the single source of truth and keep everything you produce inside it. Read `docs/unified-diagram-roadmap.md`, `docs/wt-theme-integration-todo.md`, `AGENTS.md`, and `app/README.md` first — they carry decisions already made.

## First deliverable — a reconciled plan, before any heavy building

Produce `docs/overhaul-plan.md` that:
- lists every legacy feature and its parity status in the new app, as a checklist;
- proposes a build/gating order for the planning-note features below, with dependencies called out (e.g. which features need the diagram engine or the restyle first);
- states your recommendation on the diagram engine (workstream 2);
- flags the cross-workstream interdependencies (theme decisions vs diagram styling, deploy base-path vs eventual domain cutover).

Commit it and treat it as the checkpoint I review first.

## Then execute autonomously the settled, low-risk work

- Parity fixes, including the divider bug below, each verified by a test.
- The practical-tool restyle (workstream 3), done locally in `app/`.
- Deploy preparation (workstream 5): choose and document the adapter (static vs node) and base path, write the Dockerfile/Nixpacks and Dokploy service config, and a deploy runbook. Deploy is git-push auto-deploy through Dokploy, but Dokploy isn't publicly reachable yet — that access is being wired up in a later session, so get everything push-ready and stop where a push to the tracked branch would trigger the deploy. Don't invent or assume credentials.

Pause for my sign-off before: committing to and building the new diagram engine; extracting any theme changes out of `app/` into the shared wt-theme package; or building any large new feature from the gating list.

## Known correctness bug (fix as part of parity)

A 1k top / 5k1 bottom divider from 3V3 in should return the simple two-resistor solution (~2.76V out), but currently every returned answer uses three or more resistors. The candidate-pruning / "throwing away" logic is most likely discarding the two-part answer. Reproduce it with a failing test, fix the general logic (don't special-case these values), then make the test pass.

## Workstream detail

1. **Parity audit** — legacy surfaces: voltage divider (`index.html`), target resistance (`target-resistance.html`), balanced attenuator, interactive divider. New routes exist for all four under `app/src/routes`. Walk each legacy feature and confirm the new app matches behaviour and outputs, not just that the control is present. Record gaps in the plan checklist.

2. **Diagram engine** — the roadmap keeps `schematic.js` as the engine for now and unifies later. I want genuinely interactive schematics (hover states and similar) and have considered building a D3 drawing engine from scratch. Before committing either way, investigate whether an existing reusable web schematic renderer — ideally a D3/SVG KiCad-style one — can be adapted instead. Deliver a short written recommendation plus a minimal working proof-of-concept of the favoured approach rendering one divider. Keep `schematic.js` working throughout. Be ambitious here: if a strong reusable renderer exists, adapting it could beat a scratch build by a wide margin — give that option a real chance before defaulting to build-your-own.

3. **Restyle** — the current wt-theme shell reads like a marketing hero; this is a practical engineering tool and should feel dense, efficient, and tool-grade. Do this work locally in `app/` for now (utilities/overrides), because we haven't decided what belongs in the shared theme yet — but structure it so a later extraction into `@go2dev/wt-theme` (canonically maintained in `go2dev/whatever-together`) is clean. Note in the plan which pieces you'd promote to the shared theme and why.

4. **Feature gating** — the planning notes below are candidate features. Work out a sensible build order with dependencies and put it in the plan. Don't build them beyond what parity needs.

5. **Deploy** — as described above.

## Planning notes (from the project's Notion, reproduced so this session is self-contained)

- Spec-an-existing-divider mode: given a divider, find other configs with the same/close ratio; and a define-by-ratio mode that finds combinations from the input set.
- A mode where you set the resistor values and vary the input voltage.
- Total-resistance filter: its range is too coarse to filter low values accurately, and in lowest-resistance sort mode the auto-range should adapt. Options considered: split into a lookup-zone control plus a filter control, or a zoomable/vernier scale. There is a full spec for a "D3 zoomable range slider" (noUiSlider + d3-zoom, separating three domains — full, zoomed view, selected filter — with wheel/pinch zoom and drag-pan over a histogram, noUiSlider scaled to the view domain, numeric inputs, Fit/zoom buttons, keyboard and accessibility support). If you can reach Notion, fetch the child page "D3 zoomable range slider" for the detailed spec; otherwise implement from this summary.
- A histogram showing where results fall within the range.
- Upad attenuator mode.
- JLC basics: check whether the predetermined set carries precision percentages (or use worst-case); when using JLC basics, give order codes for the most precise version of a value; in any mode, if a value exists in JLC basics, prefer it. This is fundamentally a BOM-optimisation tool — frame features around that.
- Export results to PDF; encode parameters in the URL for sharing/deep-linking; a current-divider mode (from `todo.md`).
- Once on wt: rewrite git history to conventional commits, then adopt release-please or commitizen for changelog and releases.

## Constraints and autonomy

- Keep the legacy root app working the whole time; parity is proven against it.
- Local, reversible actions (edit, build, test, local commits) are yours to make freely. Confirm with me before anything outward-facing or hard to reverse: pushing to shared branches, triggering a real deploy, or touching the shared wt-theme package.
- Use conventional commits (we're adopting them anyway) and commit after each completed component — runs here can be cut off without warning, so checkpoint continuously rather than only when context runs low.
- Tests verify correctness, they don't define the solution: implement the general fix, don't hard-code to test inputs, and if you find a test asserting wrong behaviour, flag it rather than coding around it.

## Working across long runs

- Keep `progress.txt` (freeform state) and keep the `docs/overhaul-plan.md` parity checklist current, so a fresh context can resume. On restart: read `progress.txt`, the plan, and the git log; run both test suites and load both apps before writing new code.
- Make sure a fresh window can start the servers, tests, and build cleanly from what's documented in `AGENTS.md` and `app/README.md`; add a script if anything is missing.

## Verification (satisfy before calling any part done)

- Legacy tests green: `node tests/run-tests.js`. New app tests/build green under `app/`.
- The divider bug has a failing test first, then passes.
- The parity checklist has every legacy feature either ticked or explicitly deferred with a reason.
- The new app builds and runs; the diagram proof-of-concept renders a real divider; the restyled UI loads correctly in both light and dark.
- Run a verification pass — a workflow or a verifier subagent in a fresh context — over the plan: for each workstream, report what was implemented and where it diverges from this brief.

Before you finish, verify your work against the acceptance list above and record the outcome in `progress.txt`.
