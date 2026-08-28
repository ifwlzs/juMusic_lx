import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ambientDarkFallbackPalette,
  resolveAmbientDarkPalette,
  type AmbientDarkPalette,
  type AmbientDarkPaletteOptions,
} from './backgroundConfig'
import {
  extractDominantColorsFromImage,
  extractDominantHueFromImage,
} from '@/utils/nativeModules/utils'

export const useAmbientDarkPalette = (imageUri?: string | null, options: AmbientDarkPaletteOptions = {}): AmbientDarkPalette => {
  const { brightness, saturation, hueSpread } = options
  const [sourceColors, setSourceColors] = useState<string[] | null>(null)
  const [sourceHue, setSourceHue] = useState<number | null>(null)
  const [sourceImageUri, setSourceImageUri] = useState<string | null>(null)
  const requestVersionRef = useRef(0)

  useEffect(() => {
    const requestVersion = ++requestVersionRef.current
    setSourceImageUri(imageUri ?? null)
    setSourceColors(null)
    setSourceHue(null)
    if (!imageUri) {
      return
    }

    // 封面只提取一次原始颜色，后续滑块变化直接在内存中派生，保证预览即时响应。
    void (async() => {
      try {
        const colors = await extractDominantColorsFromImage(imageUri)
        if (requestVersion != requestVersionRef.current) return
        if (colors.length) {
          setSourceColors(colors)
          return
        }

        // 原生多色提取不可用或没有有效像素时，继续复用现有主色相接口派生三色。
        const hue = await extractDominantHueFromImage(imageUri)
        if (requestVersion != requestVersionRef.current) return
        setSourceColors([])
        setSourceHue(typeof hue == 'number' && Number.isFinite(hue) ? hue : null)
      } catch {
        if (requestVersion == requestVersionRef.current) {
          setSourceColors([])
          setSourceHue(null)
        }
      }
    })()
  }, [imageUri])

  return useMemo(() => {
    if (sourceImageUri != (imageUri ?? null) || sourceColors == null) return ambientDarkFallbackPalette
    if (sourceColors.length) return resolveAmbientDarkPalette(sourceColors, null, { brightness, saturation, hueSpread })
    return resolveAmbientDarkPalette([], sourceHue, { brightness, saturation, hueSpread })
  }, [brightness, hueSpread, imageUri, saturation, sourceColors, sourceHue, sourceImageUri])
}
