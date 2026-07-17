# AGENTS.md

The project instructions for this repo live in [`CLAUDE.md`](./CLAUDE.md) — read that
file. It is the single source of truth: stack, commands, invariants, conventions, and
scope guardrails. Don't duplicate its content here; this file exists so agents that look
for `AGENTS.md` by convention find their way to it.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
