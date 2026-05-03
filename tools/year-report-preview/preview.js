// 统一维护全部页面顺序，确保预览工具和年报设计稿的翻页顺序一致。
const PAGE_SEQUENCE = [
  'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10',
  'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20',
  'P21', 'P22', 'P23', 'P24', 'P25', 'P26', 'P27', 'P28', 'P29', 'P30',
  'P31', 'P32', 'L01', 'L02', 'L03', 'L04',
]

// 为每个页面绑定模板与情绪色，后续渲染时只消费这里的统一定义。
const PAGE_REGISTRY = [
  { pageId: 'P01', template: 'T1', accent: 'primary' },
  { pageId: 'P02', template: 'T3', accent: 'primary' },
  { pageId: 'P03', template: 'T3', accent: 'primary' },
  { pageId: 'P04', template: 'T3', accent: 'primary' },
  { pageId: 'P05', template: 'T3', accent: 'primary' },
  { pageId: 'P06', template: 'T1', accent: 'primary' },
  { pageId: 'P07', template: 'T1', accent: 'primary' },
  { pageId: 'P08', template: 'T2', accent: 'primary' },
  { pageId: 'P09', template: 'T3', accent: 'primary' },
  { pageId: 'P10', template: 'T1', accent: 'primary' },
  { pageId: 'P11', template: 'T1', accent: 'primary' },
  { pageId: 'P12', template: 'T1', accent: 'spring' },
  { pageId: 'P13', template: 'T1', accent: 'summer' },
  { pageId: 'P14', template: 'T1', accent: 'autumn' },
  { pageId: 'P15', template: 'T1', accent: 'winter' },
  { pageId: 'P16', template: 'T1', accent: 'primary' },
  { pageId: 'P17', template: 'T3', accent: 'primary' },
  { pageId: 'P18', template: 'T3', accent: 'primary' },
  { pageId: 'P19', template: 'T1', accent: 'primary' },
  { pageId: 'P20', template: 'T1', accent: 'primary' },
  { pageId: 'P21', template: 'T1', accent: 'primary' },
  { pageId: 'P22', template: 'T2', accent: 'primary' },
  { pageId: 'P23', template: 'T1', accent: 'primary' },
  { pageId: 'P24', template: 'T2', accent: 'primary' },
  { pageId: 'P25', template: 'T1', accent: 'primary' },
  { pageId: 'P26', template: 'T2', accent: 'primary' },
  { pageId: 'P27', template: 'T1', accent: 'primary' },
  { pageId: 'P28', template: 'T1', accent: 'primary' },
  { pageId: 'P29', template: 'T2', accent: 'primary' },
  { pageId: 'P30', template: 'T3', accent: 'primary' },
  { pageId: 'P31', template: 'T3', accent: 'primary' },
  { pageId: 'P32', template: 'T4', accent: 'primary' },
  { pageId: 'L01', template: 'T3', accent: 'accent' },
  { pageId: 'L02', template: 'T3', accent: 'accent' },
  { pageId: 'L03', template: 'T3', accent: 'accent' },
  { pageId: 'L04', template: 'T2', accent: 'accent' },
]

// 统一缓存关键 DOM，避免重复查询影响后续翻页响应。
const app = document.querySelector('[data-role="report-app"]')
const stage = document.querySelector('[data-role="report-stage"]')
const progress = document.querySelector('[data-role="progress"]')
const prevHit = document.querySelector('[data-role="prev-hit"]')
const nextHit = document.querySelector('[data-role="next-hit"]')

// 统一读取 reduced-motion 偏好，后续切页和滚动逻辑都依赖这项兜底。
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const prefersReducedMotion = () => reducedMotionQuery.matches

// 移动端切页使用半跟手阈值；达到阈值才吸附切页，不够则回弹。
const DRAG_THRESHOLD = 72

// 运行时状态负责保存报告数据、当前页和交互中的临时变量。
const state = {
  report: null,
  pages: [],
  activeIndex: 0,
  wheelLocked: false,
  touchStartY: 0,
  dragOffset: 0,
}

// 根据 page_id 取页面模板定义，没有配置时默认退回 T3 统计页。
function getPageDefinition(pageId) {
  return PAGE_REGISTRY.find(item => item.pageId === pageId) || { pageId, template: 'T3', accent: 'primary' }
}

// 将真实报告页和 fallback 占位页合并，保证所有页面都能先展示 UI 效果。
function normalizePages(report) {
  const pageMap = new Map((report.pages || []).map(page => [page.page_id, page]))
  return PAGE_SEQUENCE.map(pageId => {
    const definition = getPageDefinition(pageId)
    const payload = pageMap.get(pageId) || {
      page_id: pageId,
      title: pageId,
      year: report.year,
      summary_text: '该页真实数据暂未接入，当前展示 UI 占位效果。',
    }
    return {
      ...payload,
      template: definition.template,
      accent: definition.accent,
    }
  })
}

// 按模板输出单页的最小骨架，后续任务会继续细化到四套模板内部结构。
function renderPage(page, index, total) {
  const activeClass = index === state.activeIndex ? ' is-active' : ''
  return `
    <section class="page page--${page.template.toLowerCase()}${activeClass}" data-page-id="${page.page_id}" data-page-index="${index}">
      <header class="page__top">
        <span class="page__eyebrow">${page.year} · ${page.page_id}</span>
        <span class="page__count">${index + 1} / ${total}</span>
      </header>
      <div class="page__body">
        <h1 class="page__title">${page.title}</h1>
        <p class="page__summary">${page.summary_text || ''}</p>
      </div>
    </section>
  `
}

// 渲染整份报告后，将当前页滚动到视口顶部，保证桌面与移动体验一致。
function render() {
  if (!stage || !progress) return
  stage.innerHTML = state.pages.map((page, index) => renderPage(page, index, state.pages.length)).join('')
  progress.textContent = `${state.report?.year || ''} 年度报告预览 · ${state.activeIndex + 1} / ${state.pages.length}`
  syncActivePage(true)
}

// 将当前活动页同步到 DOM 状态与滚动位置，避免高亮和真实位置脱节。
function syncActivePage(instant = false) {
  if (!stage) return
  const pageElements = [...stage.querySelectorAll('.page')]
  pageElements.forEach((element, index) => {
    element.classList.toggle('is-active', index === state.activeIndex)
  })
  const activeElement = pageElements[state.activeIndex]
  if (!activeElement) return
  activeElement.scrollIntoView({ behavior: instant || prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
}

// 所有前后翻页都通过这个入口裁剪索引，避免越界与重复刷新。
function setActiveIndex(nextIndex) {
  const boundedIndex = Math.max(0, Math.min(nextIndex, state.pages.length - 1))
  if (boundedIndex === state.activeIndex) {
    syncActivePage(true)
    return
  }
  state.activeIndex = boundedIndex
  syncActivePage(false)
  if (progress) progress.textContent = `${state.report?.year || ''} 年度报告预览 · ${state.activeIndex + 1} / ${state.pages.length}`
}

// 翻到下一页。
function goNext() {
  setActiveIndex(state.activeIndex + 1)
}

// 翻到上一页。
function goPrev() {
  setActiveIndex(state.activeIndex - 1)
}

// 桌面端滚轮映射切页，并做短时间节流，避免一滚跳过多页。
function bindWheelPaging() {
  if (!stage) return
  stage.addEventListener('wheel', event => {
    event.preventDefault()
    if (state.wheelLocked) return
    state.wheelLocked = true
    if (event.deltaY > 0) goNext()
    else if (event.deltaY < 0) goPrev()
    window.setTimeout(() => {
      state.wheelLocked = false
    }, 280)
  }, { passive: false })
}

// 桌面端热区点击与键盘切页统一注册在这里。
function bindDesktopPaging() {
  if (prevHit) prevHit.addEventListener('click', () => { goPrev() })
  if (nextHit) nextHit.addEventListener('click', () => { goNext() })
  window.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') goNext()
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') goPrev()
  })
}

// 移动端使用半跟手方案：拖动时跟手偏移，抬手后按阈值吸附或回弹。
function bindTouchPaging() {
  if (!stage) return
  stage.addEventListener('touchstart', event => {
    state.touchStartY = event.touches[0].clientY
    state.dragOffset = 0
  }, { passive: true })

  stage.addEventListener('touchmove', event => {
    state.dragOffset = event.touches[0].clientY - state.touchStartY
    stage.style.setProperty('--drag-offset', `${Math.round(state.dragOffset * 0.35)}px`)
  }, { passive: true })

  stage.addEventListener('touchend', () => {
    stage.style.setProperty('--drag-offset', '0px')
    if (state.dragOffset <= -DRAG_THRESHOLD) goNext()
    else if (state.dragOffset >= DRAG_THRESHOLD) goPrev()
    state.dragOffset = 0
  })
}

// 优先读取 live-report；没有真实导出结果时，再回退到 mock 数据。
async function loadReport() {
  try {
    const response = await fetch('./data/live-report.json', { cache: 'no-store' })
    if (response.ok) return response.json()
  } catch {
    // 真实数据缺失时静默回退到 mock，不打断预览工具启动。
  }
  const response = await fetch('./data/mock-report.json', { cache: 'no-store' })
  return response.json()
}

// 工具启动后先加载数据，再渲染页面并挂上所有翻页交互。
async function init() {
  if (!app) return
  state.report = await loadReport()
  state.pages = normalizePages(state.report)
  render()
  bindWheelPaging()
  bindDesktopPaging()
  bindTouchPaging()
}

void init()
