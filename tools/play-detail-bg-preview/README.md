# Play Detail Background Preview

This tool is a browser-only sandbox for the play-detail blurred background. It does not try to render the full player UI.

## Run

```bash
npm run preview:play-detail-bg
```

Then open `http://127.0.0.1:4866`.

## What it does

- Loads a few built-in cover presets so the page works before you drag in a real image.
- Supports drag/drop and file picking for real album art.
- Lets you tune blur, stretch, base overlay opacity, and the gray edge ring.
- Reloads the browser automatically when `index.html`, `styles.css`, `preview.js`, or this README change.

## Parameter mapping back to React Native

These controls map to [`src/components/PageContent.tsx`](../../src/components/PageContent.tsx):

| Preview control | React Native target |
| --- | --- |
| `blurRadius` | `backgroundConfigs.playDetailEmby.blurRadius` |
| `scaleX` | `backgroundConfigs.playDetailEmby.imageStyle.transform[0].scaleX` |
| `scaleY` | `backgroundConfigs.playDetailEmby.imageStyle.transform[1].scaleY` |
| `baseOverlayOpacity` | alpha channel inside `backgroundConfigs.playDetailEmby.overlayStyle.backgroundColor` |
| `edgeOverlayColor` | base gray used to derive `playDetailEmbyEdgeOverlayLayers[*].backgroundColor` |
| `edgeOverlayWidth` | outer padding values that mirror `playDetailEmbyEdgeOverlayLayers[*].paddingHorizontal` and `paddingVertical` |

`edgeOverlayWidth inner` is a convenience control for the deepest ring, because the current React Native layout uses a wider innermost layer than the two outer layers.

## Working loop

1. Start the preview server.
2. Drag in a real cover image or choose a built-in preset.
3. Edit `styles.css` or `preview.js` until the background feels right.
4. Copy the final values back into [`src/components/PageContent.tsx`](../../src/components/PageContent.tsx).
