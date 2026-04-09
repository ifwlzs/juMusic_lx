# Play Detail Linear Vignette Design

**Date:** 2026-04-09

## Goal

Replace the current stepped play-detail edge darkening with a much smoother linear falloff that visually tracks `1.html` more closely.

## Problem

The current runtime still uses a small set of rectangular vignette bands. Even after the background blur fix, those stepped edge overlays still read as segmented / mosaic-like on device.

## Decision

Keep the current mobile-safe multi-blur background layers, but replace `vignetteBands` with dense linear vignette slices.

- Keep `colorMask` and auto gray-biased mask extraction.
- Keep user-facing `vignetteColor` and `vignetteSize` settings.
- Replace coarse bands with many thin slices whose opacity decays linearly from the edge to the center.
- Render top/right/bottom/left stacks separately instead of using the old band `flatMap` helper.

## Constraints

- No new native dependency.
- Stay inside existing React Native primitives.
- Must visually approximate `1.html` better than the current stepped implementation.

## Verification

- Update play-detail tests to forbid the old band stack.
- Run `node --test tests/play-detail`.
- Run ESLint on changed files.
