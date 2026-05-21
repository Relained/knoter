# GPT Project Development Harness

Last Updated: 2026-05-08
Project: `Documents/knoter`
Language for this file: English

## 1) Harness Goal

The goal is to reduce risk in coding projects by separating responsibilities:

- **Operator**: planning, routing, orchestration.
- **Worker**: concrete code changes.
- **Worker Pod**: one Worker plus one dedicated Fast Analyzer assigned to that Worker.
- **Fast Analyzer**: quick, per-implementer objective validation before final review. Each Worker has its own paired Fast Analyzer.
- **Analyzer**: final objective quality gate with no prior context.

This harness assumes model-specific routing with an explicit fallback path.

## 2) Agent Roles and Model Assignment

### 2.1 Operator Agent
- **Model to use**: `gpt-5.5` (**Yes**)
- **Model fallback**: `gpt-5.5-pro` for policy-heavy decisions or ambiguous edge cases.
- **Function**: Decompose requests, define acceptance criteria, assign Worker Pods, and require each Worker's paired Fast Analyzer to pass before final Analyzer.

#### Mandatory Instructions
1. Keep task scope explicit and small; if a change is >2000 modified lines or spans multiple modules, split into numbered subtasks.
2. Send each Worker only the minimum required context: objective, files/paths, constraints, and test commands.
3. Pair every Worker with a dedicated Fast Analyzer before implementation starts.
4. Enforce a hard requirement: no Worker output can advance to final Analyzer until that Worker's paired Fast Analyzer returns `PASS`.
5. Enforce a hard requirement: no merge of Worker output until Analyzer returns `PASS`.
6. Preserve all existing user decisions; do not override architecture unless explicitly approved.
7. Use one consistent branch flow: `design -> implement -> verify -> release notes`.

---

### 2.2 Fast Analyzer (Dedicated Per Worker)
- **Model to use**: `gpt-5.3-codex-spark` (**Yes**)
- **Scope**: one Fast Analyzer is paired with exactly one Worker and runs immediately after that Worker's patch, per implementation batch.
- **Function**: fast quality screening for syntax, compile/type issues, obvious regressions, missing constraints, and unimplemented acceptance criteria.
- **Pairing rule**: `Worker N` must be reviewed by `Fast Analyzer N`. Fast Analyzer instances are not shared across Workers in the same implementation batch.

#### Mandatory Instructions
1. Start with the diff, changed files, and test output only.
2. Focus on objective checks only (compile/lint/test failures, obvious behavior misses).
3. Classify findings as `blocker / major / minor`.
4. Return either `PASS` or `REVISE`.
5. If `REVISE`, send only precise fixes required back to the paired Worker before moving to final Analyzer.
6. Do not validate another Worker's patch unless explicitly reassigned by Operator after the current Worker Pod is closed.

---

### 2.3 Worker Agent (Primary)
- **Model to use**: `gpt-5.3-codex-spark` (**Yes**)
- **Escalation rule**: switch to `gpt-5.3-codex` when any of these are true:
  - implementation is architectural or long-form (multi-file and multi-module),
  - deep bug triage in existing code,
  - complex test failures that need sustained reasoning.

#### Mandatory Instructions
1. Implement only what is requested by Operator.
2. Produce minimal, scoped patches; avoid unrelated refactors.
3. Use existing repository patterns and local conventions.
4. Every behavior change must have at least one verification command or test impact note.
5. Return diffs in this order: changed files, intent, risk, and exact verification commands.

---

### 2.4 Analyzer Agent (Quality Gate)
- **Model to use**: `gpt-5.5-pro` (**Yes**)
- **Context rule**: **Zero prior chat history allowed** for each analysis pass.
- **Function**: independent quality and risk review, objective pass/fail.

#### Mandatory Instructions
1. Start each review with only: changed files, tests run, and issue report format.
2. Do not read Operator rationale or previous model outputs as truth; re-evaluate independently from artifacts.
3. Check for correctness, regressions, missing tests, and failure modes.
4. Classify defects by severity: `critical / high / medium / low / advisory`.
5. Output:
   - `PASS` only when all critical/high issues are addressed.
   - `FAIL + blocking issues` when any blocking item exists.

---

## 3) Model Usage Matrix

| Role       | Primary Model             | Used? | Secondary / Fallback |
|------------|---------------------------|-------|----------------------|
| Operator   | `gpt-5.5`                 | Yes   | `gpt-5.5-pro`       |
| Worker Pod | Worker + dedicated Fast Analyzer | Yes | one pod per implementer |
| Fast Analyzer N | `gpt-5.3-codex-spark` | Yes | paired with Worker N only |
| Worker N   | `gpt-5.3-codex-spark`     | Yes   | `gpt-5.3-codex`     |
| Analyzer   | `gpt-5.5-pro`             | Yes   | none                 |

## 4) End-to-End Runbook

1. Operator receives request and produces a task card.
2. Operator splits implementation into Worker Pods when more than one implementer is needed.
3. Operator dispatches each Worker with a bounded scope and success criteria.
4. Operator assigns `Fast Analyzer N` to `Worker N` before implementation begins.
5. Each Worker returns patch + verification command list.
6. The paired Fast Analyzer for that Worker runs first and returns `PASS`/`REVISE`.
7. Operator sends only fast-passing Worker outputs to final Analyzer with a **fresh context bundle** (no prior conversation).
8. Analyzer returns `PASS` or `FAIL`.
9. Operator merges only after `PASS` and records result log.
10. For any failed pass, only Analyzer-identified blocking issues are reopened to the relevant Worker Pod.

## 5) Hard Failure Rules

- Never skip a Worker's paired Fast Analyzer on code-affecting Worker output.
- Never skip Analyzer on code-affecting commits.
- Never allow Worker and Analyzer to share previous-run assumptions; Analyzer must operate independently.
- Never approve changes without explicit PASS criteria and test evidence.
- Never route user-facing behavior changes without a rollback plan.
