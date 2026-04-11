# Weekly summary checklist (CP3407) — mapped to this project

This file is a quick “requirements ↔ evidence” checklist based on the extracted `CP3407_Weekly_Summary.docx` content (Week 1–9).

> NOTE: This repo folder is currently **not** a git repository on this machine. Many items below (Issues/branch/commit history/CI) require creating a GitHub repo.

## Week 1 — project kick-off

- **Team (3–5 people)**: not tracked in code.  
  - Evidence to add: list members + roles in `README.md`.
- **Project theme / user + system definition**: partially implied (campus navigation).
  - Evidence to add: 2–4 sentences in `README.md`:
    - target users (students/staff/visitors)
    - core problem solved (find rooms, check timetable, navigate via map)

## Week 2 — user stories

Weekly summary requires:
- **10+ user stories**
- Each with **priority** (0/20/30) and **estimation (days)**
- Assigned into **3 iterations**

Status in codebase now:
- Implementation exists (map UI, search, login, backend API, DB) but **no user-story document** is stored.

Recommended addition (high impact):
- Create `docs/user_stories.md` with 10–15 stories in format:
  - “As a ___, I want ___ so that ___”
  - plus `priority` and `estimation`
  - plus `iteration` (1/2/3)

## Week 3 — planning & milestone

Weekly summary wants:
- iteration planning
- Milestone 1.0 defined
- time calculation + velocity

Recommended:
- `docs/iteration_plan.md`:
  - iteration goals (baseline vs stretch)
  - “what is deferred”
  - velocity assumption + actual velocity table (updated each iteration)

## Week 4 — tasks & start dev

Weekly summary wants:
- user stories → tasks (0.5–? days each)
- task board (To do / Doing / Done)
- class diagram (UML)

Recommended:
- GitHub Projects board (best), or add:
  - `docs/tasks_iteration1.md` etc.
- Add `docs/class_diagram.md` (or `docs/class_diagram.png`) documenting:
  - backend: routes → controllers → models
  - DB entities: `classrooms`, `courses`, `users`

## Week 5 — git & version control

Weekly summary wants:
- correct GitHub workflow (commit/pull/merge)
- branches
- commit messages that show progress

Status:
- Not a git repo here.

Recommended:
- initialize git + push to GitHub
- adopt branch-per-feature and PRs

## Week 6 — testing & CI

Weekly summary wants:
- at least **3 user stories**
- each with **≥ 1 test** (mentions correct input / wrong input / boundary)
- CI

Status:
- No automated tests or CI workflow yet.

Recommended (minimal but acceptable for coursework):
- backend tests for:
  - `/api/auth/login` (correct/wrong password/invalid email)
  - `/api/auth/register` (new/duplicate/invalid password)
  - `/api/search` (empty query / normal query)
- add GitHub Actions workflow running `npm test` (after adding a test runner)

## Week 7 — TDD

Weekly summary wants:
- demonstrate test → code → refactor on at least one feature

Recommended:
- Pick one small feature (e.g. auth validation) and implement via TDD with 3–5 tests.

## Week 8 — implementation focus

Weekly summary wants:
- **frontend + backend + DB**
- **SVG map interaction**
- API design with routes/controller/model structure

Status:
- Implemented:
  - Express + SQLite: `project/server/`
  - frontend fetch: `client/js/api_enhanced.js`
  - SVG interaction: `client/index.html` (inline SVG) + `client/js/index_main.js`
  - map editor saves JSON via API: `/api/block-map`

## Week 9 — bug tracking & iteration review

Weekly summary wants:
- bug tracking in GitHub Issues
- system testing
- iteration review

Recommended:
- add at least 5 real issues with:
  - steps to reproduce
  - expected vs actual
  - labels + priority

## SVG / asset compatibility checks (macOS)

What to keep consistent when moving to macOS:
- **Case-sensitive paths**: `images/campus.png` must match folder/file case exactly.
- **SVG `<image>` compatibility**: keep both `href` and `xlink:href` attributes (already done).
- **Executable bits on scripts**: after copying to macOS, run:
  - `chmod +x run_all.sh stop_all.sh project/server/start_backend.sh project/server/stop_backend.sh`

