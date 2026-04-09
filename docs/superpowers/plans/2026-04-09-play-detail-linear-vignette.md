# Play Detail Linear Vignette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stepped play-detail edge darkening with a denser linear-falloff vignette that better matches `1.html`.

**Architecture:** The background blur stack stays as-is. Only the edge darkening path changes: config resolves dense linear vignette slices, and the layer renderer draws separate edge stacks instead of the old band flatMap helper.

**Tech Stack:** React Native 0.73, React, Node test runner, ESLint.

---

### Task 1: Lock expected behavior in tests

**Files:**
- Modify: `tests/play-detail/background-preset.test.js`
- Modify: `tests/play-detail/background-settings.test.js`

- [ ] Write failing assertions for `linearVignetteSlices` and removal of old `vignetteBands.flatMap`.
- [ ] Run the targeted tests and confirm they fail.

### Task 2: Implement linear vignette config + renderer

**Files:**
- Modify: `src/screens/PlayDetail/backgroundConfig.ts`
- Modify: `src/screens/PlayDetail/BackgroundLayer.tsx`

- [ ] Replace `vignetteBands` with dense `linearVignetteSlices`.
- [ ] Render top/right/bottom/left slice stacks with linear opacity decay.
- [ ] Keep existing public settings untouched.

### Task 3: Verify

**Files:**
- Modify if needed: changed files only

- [ ] Run `node --test tests/play-detail`
- [ ] Run ESLint on changed files
