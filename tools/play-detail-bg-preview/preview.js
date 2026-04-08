/* eslint-env browser */

const rootStyle = document.documentElement.style
const dropZone = document.querySelector('[data-role="drop-zone"]')
const dropZoneLabel = document.querySelector('[data-role="drop-zone-label"]')
const fileInput = document.querySelector('[data-role="file-input"]')
const presetList = document.querySelector('[data-role="preset-list"]')
const controlList = document.querySelector('[data-role="control-list"]')
const resetButton = document.querySelector('[data-role="reset-button"]')

const createSvgDataUri = ({ title, startColor, endColor, accentColor }) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${startColor}" />
          <stop offset="100%" stop-color="${endColor}" />
        </linearGradient>
      </defs>
      <rect width="640" height="640" fill="url(#bg)" />
      <circle cx="456" cy="184" r="124" fill="${accentColor}" opacity="0.48" />
      <circle cx="176" cy="488" r="154" fill="#ffffff" opacity="0.2" />
      <text x="56" y="570" fill="#ffffff" opacity="0.86" font-size="62" font-family="Segoe UI, sans-serif">${title}</text>
    </svg>
  `.trim()

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

const defaultValues = {
  blurRadius: 28,
  scaleX: 1.1,
  scaleY: 1.08,
  baseOverlayOpacity: 0.14,
  edgeOverlayWidth: 4,
  edgeOverlayWidthInner: 6,
  edgeOverlayColor: '#919191',
}

const presets = [
  {
    id: 'current-app',
    label: 'Current app',
    description: 'playDetailEmby baseline',
    image: createSvgDataUri({
      title: 'Current app',
      startColor: '#f3e4cf',
      endColor: '#8fa7c7',
      accentColor: '#98a89b',
    }),
    values: { ...defaultValues },
  },
  {
    id: 'lighter-center',
    label: 'Lighter center',
    description: 'less gray pressure',
    image: createSvgDataUri({
      title: 'Lighter center',
      startColor: '#f8f2df',
      endColor: '#b2c0d7',
      accentColor: '#d59f7e',
    }),
    values: {
      ...defaultValues,
      blurRadius: 46,
      baseOverlayOpacity: 0.14,
      edgeOverlayColor: '#7d7d7d',
    },
  },
  {
    id: 'deep-gray-ring',
    label: 'Deep gray ring',
    description: 'more edge separation',
    image: createSvgDataUri({
      title: 'Deep gray ring',
      startColor: '#d5dbe4',
      endColor: '#506178',
      accentColor: '#312f41',
    }),
    values: {
      ...defaultValues,
      blurRadius: 52,
      scaleX: 1.2,
      scaleY: 1.1,
      baseOverlayOpacity: 0.22,
      edgeOverlayColor: '#6a6a6a',
      edgeOverlayWidth: 5,
      edgeOverlayWidthInner: 7,
    },
  },
]

const controls = [
  {
    key: 'blurRadius',
    label: 'blurRadius',
    type: 'range',
    min: 10,
    max: 80,
    step: 1,
    format: value => `${value}px`,
  },
  {
    key: 'scaleX',
    label: 'scaleX',
    type: 'range',
    min: 1,
    max: 1.35,
    step: 0.01,
    format: value => value.toFixed(2),
  },
  {
    key: 'scaleY',
    label: 'scaleY',
    type: 'range',
    min: 1,
    max: 1.35,
    step: 0.01,
    format: value => value.toFixed(2),
  },
  {
    key: 'baseOverlayOpacity',
    label: 'baseOverlayOpacity',
    type: 'range',
    min: 0,
    max: 0.45,
    step: 0.01,
    format: value => value.toFixed(2),
  },
  {
    key: 'edgeOverlayWidth',
    label: 'edgeOverlayWidth',
    type: 'range',
    min: 0,
    max: 12,
    step: 0.5,
    format: value => `${value.toFixed(1)}%`,
  },
  {
    key: 'edgeOverlayWidthInner',
    label: 'edgeOverlayWidth inner',
    type: 'range',
    min: 0,
    max: 12,
    step: 0.5,
    format: value => `${value.toFixed(1)}%`,
  },
  {
    key: 'edgeOverlayColor',
    label: 'edgeOverlayColor',
    type: 'color',
    format: value => value.toUpperCase(),
  },
]

const state = {
  values: { ...defaultValues },
  activePresetId: presets[0].id,
  currentImage: presets[0].image,
}

const controlInputs = new Map()
const presetButtons = new Map()

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

const buildRgba = (hex, alpha) => {
  const { red, green, blue } = hexToRgb(hex)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

const applyValues = () => {
  rootStyle.setProperty('--preview-image', state.currentImage)
  rootStyle.setProperty('--preview-blur-radius', `${state.values.blurRadius}px`)
  rootStyle.setProperty('--preview-scale-x', state.values.scaleX.toFixed(2))
  rootStyle.setProperty('--preview-scale-y', state.values.scaleY.toFixed(2))
  rootStyle.setProperty('--preview-base-overlay-opacity', state.values.baseOverlayOpacity.toFixed(2))
  rootStyle.setProperty('--preview-edge-overlay-width-1', `${(state.values.edgeOverlayWidth / 2).toFixed(1)}%`)
  rootStyle.setProperty('--preview-edge-overlay-width-2', `${(state.values.edgeOverlayWidth / 2).toFixed(1)}%`)
  rootStyle.setProperty('--preview-edge-overlay-width-3', `${(state.values.edgeOverlayWidth / 2).toFixed(1)}%`)
  rootStyle.setProperty('--preview-edge-overlay-width-4', `${(state.values.edgeOverlayWidth / 2).toFixed(1)}%`)
  rootStyle.setProperty('--preview-edge-overlay-width-5', `${(state.values.edgeOverlayWidthInner / 2).toFixed(1)}%`)
  rootStyle.setProperty('--preview-edge-overlay-width-6', `${(state.values.edgeOverlayWidthInner / 2).toFixed(1)}%`)
  rootStyle.setProperty('--preview-edge-overlay-color-1', buildRgba(state.values.edgeOverlayColor, 0.34))
  rootStyle.setProperty('--preview-edge-overlay-color-2', buildRgba(state.values.edgeOverlayColor, 0.26))
  rootStyle.setProperty('--preview-edge-overlay-color-3', buildRgba(state.values.edgeOverlayColor, 0.20))
  rootStyle.setProperty('--preview-edge-overlay-color-4', buildRgba(state.values.edgeOverlayColor, 0.15))
  rootStyle.setProperty('--preview-edge-overlay-color-5', buildRgba(state.values.edgeOverlayColor, 0.12))
  rootStyle.setProperty('--preview-edge-overlay-color-6', buildRgba(state.values.edgeOverlayColor, 0.08))
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
    button.querySelector('.preset-chip').style.setProperty('--preset-chip-image', preset.image)
    button.addEventListener('click', () => {
      state.activePresetId = preset.id
      state.values = { ...preset.values }
      state.currentImage = preset.image
      dropZoneLabel.textContent = `Using preset: ${preset.label}`
      applyValues()
      syncControls()
      syncPresetSelection()
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
      applyValues()
      syncControls()
      syncPresetSelection()
    })

    controlInputs.set(control.key, input)
    controlList.appendChild(wrapper)
  }
}

const loadFile = file => {
  if (!file) return

  const reader = new FileReader()
  reader.addEventListener('load', event => {
    if (!event.target?.result) return
    state.currentImage = `url("${event.target.result}")`
    state.activePresetId = ''
    dropZoneLabel.textContent = `Using local image: ${file.name}`
    applyValues()
    syncPresetSelection()
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
  resetButton.addEventListener('click', () => {
    const basePreset = presets[0]
    state.activePresetId = basePreset.id
    state.values = { ...basePreset.values }
    state.currentImage = basePreset.image
    dropZoneLabel.textContent = 'Drop a real cover image here or choose a file'
    applyValues()
    syncControls()
    syncPresetSelection()
  })
}

const bindLiveReload = () => {
  if (!window.EventSource) return

  const source = new EventSource('/__events')
  source.addEventListener('message', event => {
    if (event.data === 'reload') window.location.reload()
  })
}

renderPresets()
renderControls()
bindDropZone()
bindActions()
applyValues()
syncControls()
syncPresetSelection()
bindLiveReload()
