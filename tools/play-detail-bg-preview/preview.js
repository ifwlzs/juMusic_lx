/* eslint-env browser */

const rootStyle = document.documentElement.style
const dropZone = document.querySelector('[data-role="drop-zone"]')
const dropZoneLabel = document.querySelector('[data-role="drop-zone-label"]')
const fileInput = document.querySelector('[data-role="file-input"]')
const presetList = document.querySelector('[data-role="preset-list"]')
const controlList = document.querySelector('[data-role="control-list"]')
const resetButton = document.querySelector('[data-role="reset-button"]')
const applyAutoMaskButton = document.querySelector('[data-role="apply-auto-mask-button"]')
const autoMaskSwatch = document.querySelector('[data-role="auto-mask-swatch"]')
const autoMaskValue = document.querySelector('[data-role="auto-mask-value"]')
const autoMaskHue = document.querySelector('[data-role="auto-mask-hue"]')

const sampleCanvas = document.createElement('canvas')
sampleCanvas.width = 80
sampleCanvas.height = 80
const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })

const createSvgDataUrl = ({ title, startColor, endColor, accentColor }) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${startColor}" />
          <stop offset="100%" stop-color="${endColor}" />
        </linearGradient>
      </defs>
      <rect width="640" height="640" fill="url(#bg)" />
      <circle cx="462" cy="178" r="138" fill="${accentColor}" opacity="0.46" />
      <circle cx="174" cy="488" r="168" fill="#ffffff" opacity="0.16" />
      <text x="56" y="568" fill="#ffffff" opacity="0.84" font-size="58" font-family="Segoe UI, sans-serif">${title}</text>
    </svg>
  `.trim()

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const defaultValues = {
  stretchScale: 1,
  blurRadius: 200,
  imageBrightness: 1,
  imageContrast: 1.5,
  maskColor: '#914c4c',
  colorMaskOpacity: 0.37,
  maskSaturation: 0.312,
  maskLightness: 0.433,
  vignetteColor: '#898685',
  vignetteSize: 250,
}

const presets = [
  {
    id: 'warm-rose',
    label: 'Warm rose',
    description: 'pink cover reference',
    source: createSvgDataUrl({
      title: 'Warm rose',
      startColor: '#f2c6cf',
      endColor: '#875d64',
      accentColor: '#c6898d',
    }),
    values: { ...defaultValues },
  },
  {
    id: 'cool-night',
    label: 'Cool night',
    description: 'blue night reference',
    source: createSvgDataUrl({
      title: 'Cool night',
      startColor: '#3c4f78',
      endColor: '#0d1426',
      accentColor: '#73a0dd',
    }),
    values: {
      ...defaultValues,
      maskColor: '#4c6e91',
    },
  },
  {
    id: 'dusty-mint',
    label: 'Dusty mint',
    description: 'muted green-gray',
    source: createSvgDataUrl({
      title: 'Dusty mint',
      startColor: '#bfddd3',
      endColor: '#6e706e',
      accentColor: '#8fb7ab',
    }),
    values: {
      ...defaultValues,
      maskColor: '#67806d',
    },
  },
]

const controls = [
  {
    key: 'stretchScale',
    label: 'stretchScale',
    type: 'range',
    min: 1,
    max: 1.2,
    step: 0.01,
    format: value => value.toFixed(2),
  },
  {
    key: 'blurRadius',
    label: 'blurRadius',
    type: 'range',
    min: 40,
    max: 260,
    step: 1,
    format: value => `${value}px`,
  },
  {
    key: 'imageBrightness',
    label: 'imageBrightness',
    type: 'range',
    min: 0.4,
    max: 1.4,
    step: 0.01,
    format: value => value.toFixed(2),
  },
  {
    key: 'imageContrast',
    label: 'imageContrast',
    type: 'range',
    min: 0.8,
    max: 2.2,
    step: 0.01,
    format: value => value.toFixed(2),
  },
  {
    key: 'maskColor',
    label: 'maskColor',
    type: 'color',
    format: value => value.toUpperCase(),
  },
  {
    key: 'colorMaskOpacity',
    label: 'colorMaskOpacity',
    type: 'range',
    min: 0,
    max: 0.8,
    step: 0.01,
    format: value => value.toFixed(2),
  },
  {
    key: 'maskSaturation',
    label: 'maskSaturation',
    type: 'range',
    min: 0,
    max: 0.6,
    step: 0.001,
    format: value => value.toFixed(3),
  },
  {
    key: 'maskLightness',
    label: 'maskLightness',
    type: 'range',
    min: 0.2,
    max: 0.7,
    step: 0.001,
    format: value => value.toFixed(3),
  },
  {
    key: 'vignetteColor',
    label: 'vignetteColor',
    type: 'color',
    format: value => value.toUpperCase(),
  },
  {
    key: 'vignetteSize',
    label: 'vignetteSize',
    type: 'range',
    min: 40,
    max: 360,
    step: 1,
    format: value => `${value}px`,
  },
]

const state = {
  values: { ...defaultValues },
  activePresetId: presets[0].id,
  sourceImage: null,
  sourceImageSrc: presets[0].source,
  autoMaskHue: 0,
  autoMaskColor: defaultValues.maskColor,
}

const controlInputs = new Map()
const presetButtons = new Map()

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const hexToRgb = hex => {
  const value = hex.replace('#', '')
  const normalized = value.length === 3
    ? value.split('').map(character => `${character}${character}`).join('')
    : value

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

const rgbToHex = ({ red, green, blue }) => `#${[red, green, blue]
  .map(channel => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0'))
  .join('')}`

const buildRgba = (hex, alpha) => {
  const { red, green, blue } = hexToRgb(hex)
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(2)})`
}

const rgbToHsl = ({ red, green, blue }) => {
  const redNorm = red / 255
  const greenNorm = green / 255
  const blueNorm = blue / 255
  const max = Math.max(redNorm, greenNorm, blueNorm)
  const min = Math.min(redNorm, greenNorm, blueNorm)
  const delta = max - min
  const lightness = (max + min) / 2

  if (!delta) return { hue: 0, saturation: 0, lightness }

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hueSegment = 0

  switch (max) {
    case redNorm:
      hueSegment = ((greenNorm - blueNorm) / delta) + (greenNorm < blueNorm ? 6 : 0)
      break
    case greenNorm:
      hueSegment = ((blueNorm - redNorm) / delta) + 2
      break
    default:
      hueSegment = ((redNorm - greenNorm) / delta) + 4
      break
  }

  return {
    hue: hueSegment * 60,
    saturation,
    lightness,
  }
}

const hslToRgb = (hue, saturation, lightness) => {
  const hueNorm = ((hue % 360) + 360) % 360 / 360

  if (!saturation) {
    const gray = Math.round(lightness * 255)
    return { red: gray, green: gray, blue: gray }
  }

  const hueToChannel = (p, q, t) => {
    let channel = t
    if (channel < 0) channel += 1
    if (channel > 1) channel -= 1
    if (channel < 1 / 6) return p + (q - p) * 6 * channel
    if (channel < 1 / 2) return q
    if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6
    return p
  }

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q

  return {
    red: Math.round(hueToChannel(p, q, hueNorm + 1 / 3) * 255),
    green: Math.round(hueToChannel(p, q, hueNorm) * 255),
    blue: Math.round(hueToChannel(p, q, hueNorm - 1 / 3) * 255),
  }
}

const snapHue = (hue, step = 15) => Math.round(hue / step) * step

const createGrayBiasedMaskColor = hue => {
  const snappedHue = snapHue(hue, 15)
  return rgbToHex(hslToRgb(snappedHue, state.values.maskSaturation, state.values.maskLightness))
}

const createImageElement = source => new Promise((resolve, reject) => {
  const image = new Image()
  image.addEventListener('load', () => resolve(image), { once: true })
  image.addEventListener('error', reject, { once: true })
  image.src = source
})

const drawCoverImage = image => {
  sampleContext.clearRect(0, 0, sampleCanvas.width, sampleCanvas.height)
  sampleContext.drawImage(image, 0, 0, sampleCanvas.width, sampleCanvas.height)
}

const extractDominantHue = image => {
  drawCoverImage(image)
  const { data } = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height)

  let x = 0
  let y = 0
  let totalWeight = 0

  for (let index = 0; index < data.length; index += 4) {
    const rgb = {
      red: data[index],
      green: data[index + 1],
      blue: data[index + 2],
    }
    const { hue, saturation, lightness } = rgbToHsl(rgb)
    if (saturation < 0.08) continue

    const weight = saturation * (0.35 + (1 - Math.abs(lightness - 0.5) * 2))
    const angle = hue * Math.PI / 180
    x += Math.cos(angle) * weight
    y += Math.sin(angle) * weight
    totalWeight += weight
  }

  if (!totalWeight) return 0

  return snapHue(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360, 15)
}

const updateAutoMaskUI = () => {
  autoMaskSwatch.style.background = state.autoMaskColor
  autoMaskValue.textContent = state.autoMaskColor.toUpperCase()
  autoMaskHue.textContent = `${state.autoMaskHue}° snapped`
}

const recomputeAutoMaskColor = () => {
  state.autoMaskColor = createGrayBiasedMaskColor(state.autoMaskHue)
  updateAutoMaskUI()
}

const applyValues = () => {
  rootStyle.setProperty('--preview-bg-url', `url("${state.sourceImageSrc}")`)
  rootStyle.setProperty('--preview-stretch-scale', state.values.stretchScale.toFixed(2))
  rootStyle.setProperty('--preview-blur-radius', `${state.values.blurRadius}px`)
  rootStyle.setProperty('--preview-image-brightness', state.values.imageBrightness.toFixed(2).replace(/\.00$/, ''))
  rootStyle.setProperty('--preview-image-contrast', state.values.imageContrast.toFixed(2).replace(/0$/, '').replace(/\.0$/, ''))
  rootStyle.setProperty('--preview-color-mask', buildRgba(state.values.maskColor, state.values.colorMaskOpacity))
  rootStyle.setProperty('--preview-vignette-color', buildRgba(state.values.vignetteColor, 1))
  rootStyle.setProperty('--preview-vignette-size', `${state.values.vignetteSize}px`)
}

const syncControls = () => {
  for (const control of controls) {
    const input = controlInputs.get(control.key)
    const valueLabel = input?.closest('.control')?.querySelector('.control__value')
    if (!input || !valueLabel) continue
    input.value = String(state.values[control.key])
    valueLabel.textContent = control.format(state.values[control.key])
  }
}

const syncPresetSelection = () => {
  for (const [presetId, button] of presetButtons.entries()) {
    button.classList.toggle('is-active', presetId === state.activePresetId)
  }
}

const applyAutoMaskColor = ({ preservePreset = false } = {}) => {
  state.values.maskColor = state.autoMaskColor
  if (!preservePreset) state.activePresetId = ''
  syncControls()
  syncPresetSelection()
  applyValues()
}

const loadSourceImage = async(source, label, options = {}) => {
  const image = await createImageElement(source)
  state.sourceImage = image
  state.sourceImageSrc = source
  state.autoMaskHue = extractDominantHue(image)
  recomputeAutoMaskColor()
  state.activePresetId = options.presetId ?? state.activePresetId
  if (options.useAutoMask !== false) state.values.maskColor = state.autoMaskColor
  dropZoneLabel.textContent = label
  syncControls()
  syncPresetSelection()
  applyValues()
}

const renderPresets = () => {
  for (const preset of presets) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'preset-button'
    button.innerHTML = `
      <div class="preset-chip"></div>
      <div class="preset-name">${preset.label}</div>
      <div class="preset-copy">${preset.description}</div>
    `
    button.querySelector('.preset-chip').style.setProperty('--preset-chip-image', `url("${preset.source}")`)
    button.addEventListener('click', async() => {
      state.activePresetId = preset.id
      state.values = { ...preset.values }
      syncControls()
      await loadSourceImage(preset.source, `Using preset: ${preset.label}`, { presetId: preset.id, useAutoMask: true })
    })
    presetButtons.set(preset.id, button)
    presetList.appendChild(button)
  }
}

const renderControls = () => {
  for (const control of controls) {
    const wrapper = document.createElement('div')
    wrapper.className = `control${control.type === 'color' ? ' control--color' : ''}`
    wrapper.innerHTML = `
      <div class="control__row">
        <span class="control__label">${control.label}</span>
        <span class="control__value"></span>
      </div>
      <input type="${control.type}" />
    `

    const input = wrapper.querySelector('input')
    input.min = control.min ?? ''
    input.max = control.max ?? ''
    input.step = control.step ?? ''
    input.addEventListener('input', () => {
      state.values[control.key] = control.type === 'color' ? input.value : Number(input.value)
      state.activePresetId = ''
      if (control.key === 'maskSaturation' || control.key === 'maskLightness') {
        recomputeAutoMaskColor()
      }
      syncControls()
      syncPresetSelection()
      applyValues()
    })

    controlInputs.set(control.key, input)
    controlList.appendChild(wrapper)
  }
}

const loadFile = file => {
  if (!file) return

  const reader = new FileReader()
  reader.addEventListener('load', async event => {
    if (!event.target?.result) return
    state.activePresetId = ''
    await loadSourceImage(event.target.result, `Using local image: ${file.name}`, { presetId: '', useAutoMask: true })
  })
  reader.readAsDataURL(file)
}

const bindDropZone = () => {
  const setDragging = isDragging => dropZone.classList.toggle('is-dragging', isDragging)

  dropZone.addEventListener('dragover', event => {
    event.preventDefault()
    setDragging(true)
  })

  dropZone.addEventListener('dragenter', event => {
    event.preventDefault()
    setDragging(true)
  })

  dropZone.addEventListener('dragleave', event => {
    if (event.target === dropZone) setDragging(false)
  })

  dropZone.addEventListener('drop', event => {
    event.preventDefault()
    setDragging(false)
    const [file] = event.dataTransfer?.files ?? []
    loadFile(file)
  })

  fileInput.addEventListener('change', event => {
    const [file] = event.target.files ?? []
    loadFile(file)
  })
}

const bindActions = () => {
  resetButton.addEventListener('click', async() => {
    const basePreset = presets[0]
    state.values = { ...defaultValues }
    state.activePresetId = basePreset.id
    syncControls()
    await loadSourceImage(basePreset.source, `Using preset: ${basePreset.label}`, { presetId: basePreset.id, useAutoMask: true })
  })

  applyAutoMaskButton.addEventListener('click', () => {
    applyAutoMaskColor()
  })
}

const bindLiveReload = () => {
  if (!window.EventSource) return

  const source = new EventSource('/__events')
  source.addEventListener('message', event => {
    if (event.data === 'reload') window.location.reload()
  })
}

const bootstrap = async() => {
  await loadSourceImage(presets[0].source, `Using preset: ${presets[0].label}`, { presetId: presets[0].id, useAutoMask: true })
  bindLiveReload()
}

renderPresets()
renderControls()
bindDropZone()
bindActions()
applyValues()
bootstrap().catch(error => {
  window.setTimeout(() => {
    throw error
  })
})
