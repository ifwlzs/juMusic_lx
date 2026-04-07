function normalizeFallbackTitle(fileName = '') {
  return String(fileName || '').replace(/\.[^.]+$/, '')
}

function isReadyMetadata(metadata = {}) {
  return Boolean(metadata?.title && metadata?.artist && Number(metadata?.durationSec) > 0)
}

function classifyHydrationResult({ attempts = 0, metadata = {}, fallbackTitle = '' } = {}) {
  if (isReadyMetadata(metadata)) {
    return {
      state: 'ready',
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album || '',
      durationSec: Number(metadata.durationSec),
    }
  }

  if (attempts >= 3) {
    return {
      state: 'degraded',
      title: normalizeFallbackTitle(fallbackTitle),
      artist: '',
      album: '',
      durationSec: 0,
    }
  }

  return { state: 'hydrating' }
}

module.exports = {
  classifyHydrationResult,
  isReadyMetadata,
  normalizeFallbackTitle,
}
