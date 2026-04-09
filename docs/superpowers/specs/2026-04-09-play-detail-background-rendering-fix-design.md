# Play Detail Background Rendering Fix Design

**Date:** 2026-04-09

## Goal

Make the real play-detail background in the app visually track the approved `1.html` / preview tool look much more closely, with priority on removing the current Android mosaic/blockiness and the hard-edge vignette artifacts.

## Problem Summary

The current production implementation migrated settings and auto-mask color extraction, but not the actual rendering stack the user approved.

### Current mismatches

1. The preview reference uses browser CSS:
   - forced stretch (`background-size: 100% 100%`)
   - heavy blur + brightness + contrast filter
   - full-frame color mask
   - smooth inset vignette (`box-shadow: inset 0 0 250px ...`)
2. The app currently uses React Native image blur directly with the raw configured `blurRadius` and then paints four hard edge bands.
3. On Android, the very large native `blurRadius` produces coarse blocky output on stretched cover art, which is perceived as mosaic.

## Design Decision

Use the preview tool as the source-of-truth for parameters, but adapt the app runtime to a mobile-safe rendering model:

1. **Preview tool**
   - Update repo preview files to the user-approved `1.html`-style stack.
   - Keep controls and auto gray-biased mask color extraction.
2. **App runtime**
   - Keep the same public settings schema.
   - Replace the single high native blur layer with **multiple lower native blur layers** derived from the configured blur intensity.
   - Replace the hard edge bands with **many thin linear edge layers** whose opacity falls off smoothly, approximating the inset vignette from `1.html`.
   - Keep full-frame color mask and brightness overlay.
3. **Config semantics**
   - `blurRadius` remains the user-facing intensity value.
   - Runtime resolves this into mobile-safe native blur layers instead of passing the raw value straight into one React Native image.

## Non-Goals

- Do not add new user settings.
- Do not expose foreground highlight color controls.
- Do not build a brand-new native graphics pipeline.

## Files Expected

- Modify `tools/play-detail-bg-preview/index.html`
- Modify `tools/play-detail-bg-preview/styles.css`
- Modify `tools/play-detail-bg-preview/preview.js`
- Modify `tools/play-detail-bg-preview/README.md`
- Modify `tests/play-detail/background-preview-tool.test.js`
- Modify `tests/play-detail/background-preset.test.js`
- Modify `src/screens/PlayDetail/backgroundConfig.ts`
- Modify `src/screens/PlayDetail/BackgroundLayer.tsx`

## Verification

1. Node tests for `tests/play-detail`
2. ESLint on changed app + test files
3. If feasible, Android package build in a short-path worktree
