# PRD — Cross-Team RAID & Dependency Tracker

**Status:** Draft · **Owner:** [you] · **Last updated:** [date]

## Problem

On any program with more than one team, the things that blow up timelines are rarely visible in a single team's board. They live in the seams: Team A's work quietly depends on something Team B hasn't committed to, Team B is itself blocked upstream, and nobody sees the slip coming until it's a fire. Existing tools track work *within* a team well and dependencies *across* teams poorly — dependencies end up as flat lists or buried Jira links with no way to see the chain or model what happens when one link slips.

## Target user

A technical program / project manager (or an eng lead acting as one) coordinating a program across 3–8 teams, who needs a live, shared picture of cross-team dependencies and program risk — not another per-team task board.

## Goals

- Make cross-team **dependencies** first-class: who needs what from whom, by when, and whether it's on track.
- Surface **emergent risk** — a dependency that looks fine on its own but is endangered by an upstream slip.
- Give every team one **live, shared** view of program health that updates as status changes.
- Track the full **RAID** picture (Risks, Assumptions, Issues, Dependencies) in one place.
- Produce the **status artifact** a TPM would otherwise assemble by hand each week.

## Non-goals (explicit)

- Not a replacement for Jira / Linear / per-team task management.
- Not a general work-tracker, time-tracker, or sprint-planning tool.
- No multi-tenant SaaS, billing, or org/permission hierarchy in v1.
- No native mobile app.
- Not attempting to auto-import from every PM tool — one import path at most.

## Success criteria

- A visitor to the live demo understands the program's health and its at-risk chains within ~10 seconds, on seeded data.
- Marking one upstream deliverable as slipped visibly cascades risk to every downstream dependent — no manual re-flagging.
- Circular dependencies are detected and surfaced, not silently accepted.
- The app generates a weekly "what went at-risk this week" digest without manual assembly.
- (Portfolio metric) The project ships end-to-end with a written case study, live demo, and public repo before year-end.

## Key user stories

- As a TPM, I add a dependency between two deliverables with a *needed-by* and a *committed* date, and immediately see whether there's slack or a gap.
- As a TPM, I mark a deliverable as slipped and see every downstream item that's now at risk.
- As a team lead, I open the graph and see, at a glance, what my team is blocking and what's blocking my team.
- As a TPM, I open the dashboard Monday morning and see program-level RAG, at-risk counts, and per-team health.
- As a TPM, I receive a weekly digest of everything that changed status.

## Constraints & assumptions

- Solo build, part-time, ~9–10 weeks, targeting year-end.
- Built as a portfolio artifact: the goal is demonstrating engineering + program-management judgment, so depth on the dependency graph beats breadth of features.
- Assumes small program scale (tens of deliverables, not thousands) — informs modeling and lets us keep traversal in application code.
