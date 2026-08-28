import { useEffect, useRef, useState } from 'react'
import {
  ambientDarkFallbackPalette,
  resolveAmbientDarkPalette,
  type AmbientDarkPalette,
} from './backgroundConfig'
import {
  extractDominantColorsFromImage,
  extractDominantHueFromImage,
} from '@/utils/nativeModules/utils'

export const useAmbientDarkPalette = (imageUri?: string | null): AmbientDarkPalette => {
  const [palette, setPalette] = useState<AmbientDarkPalette>(ambientDarkFallbackPalette)
  const requestVersionRef = useRef(0)

  useEffect(() => {
    const requestVersion = ++requestVersionRef.current
    if (!imageUri) {
      setPalette(ambientDarkFallbackPalette)
      return
    }

    // 切换封面时先回到中性暗色，避免上一首歌曲的异步调色板短暂残留。
    setPalette(ambientDarkFallbackPalette)
    void (async() => {
      try {
        const colors = await extractDominantColorsFromImage(imageUri)
        if (requestVersion != requestVersionRef.current) return
        if (colors.length) {
          setPalette(resolveAmbientDarkPalette(colors))
          return
        }

        // 原生多色提取不可用或没有有效像素时，继续复用现有主色相接口派生三色。
        const hue = await extractDominantHueFromImage(imageUri)
        if (requestVersion != requestVersionRef.current) return
        setPalette(resolveAmbientDarkPalette([], hue))
      } catch {
        if (requestVersion == requestVersionRef.current) setPalette(ambientDarkFallbackPalette)
      }
    })()
  }, [imageUri])

  return palette
}
