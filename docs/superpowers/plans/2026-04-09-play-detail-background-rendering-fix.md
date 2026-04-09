# Play Detail Background Rendering Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app play-detail background visually match the approved preview/`1.html` stack more closely and remove the current mosaic-like degradation.

**Architecture:** The preview tool becomes the checked-in visual reference for the approved stack. The app runtime keeps the same settings but resolves them into a mobile-safe rendering model: multiple low-loss blur layers, full-frame color mask, and many thin edge bands that approximate a smooth inset vignette.

**Tech Stack:** React Native 0.73, React, Node test runner, ESLint, existing custom `ImageBackground` component.

---

### Task 1: Lock the new target behavior in tests

**Files:**
- Modify: `tests/play-detail/background-preview-tool.test.js`
- Modify: `tests/play-detail/background-preset.test.js`

- [ ] Add assertions for the `1.html`-style preview stack and the mobile-safe runtime mapping.
- [ ] Run the targeted tests and confirm they fail on the old implementation.

### Task 2: Update the preview tool to the approved visual stack

**Files:**
- Modify: `tools/play-detail-bg-preview/index.html`
- Modify: `tools/play-detail-bg-preview/styles.css`
- Modify: `tools/play-detail-bg-preview/preview.js`
- Modify: `tools/play-detail-bg-preview/README.md`

- [ ] Port the current approved preview stack: stretched background, strong blur, gray-biased mask controls, and inset-style vignette.
- [ ] Re-run preview-tool tests until green.

### Task 3: Rework the app runtime rendering

**Files:**
- Modify: `src/screens/PlayDetail/backgroundConfig.ts`
- Modify: `src/screens/PlayDetail/BackgroundLayer.tsx`

- [ ] Add runtime helpers that convert the user-facing blur intensity into multiple mobile-safe image layers.
- [ ] Replace hard vignette bands with a denser smooth-falloff edge layer generator.
- [ ] Keep auto-mask, brightness overlay, and setting compatibility intact.
- [ ] Re-run play-detail tests until green.

### Task 4: Verification

**Files:**
- Modify if needed: changed files only

- [ ] Run `node --test tests/play-detail`
- [ ] Run ESLint on changed files
- [ ] If path/environment allows, run Android packaging to catch runtime/regression issues
