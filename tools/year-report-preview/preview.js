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

// 缓存顶层节点，避免每次重绘都重复查询 DOM。
const app = document.querySelector('[data-role="report-app"]')
const stage = document.querySelector('[data-role="report-stage"]')
const progress = document.querySelector('[data-role="progress"]')

// 预览工具的运行时状态统一保存在这里，便于后续叠加翻页交互。
const state = {
  report: null,
  pages: [],
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
  return `
    <section class="page page--${page.template.toLowerCase()}" data-page-id="${page.page_id}">
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

// 刷新舞台与页序提示，保证数据和视图保持同步。
function render() {
  if (!stage || !progress) return
  stage.innerHTML = state.pages.map((page, index) => renderPage(page, index, state.pages.length)).join('')
  progress.textContent = `${state.report?.year || ''} 年度报告预览 · ${state.pages.length} 页`
}

// 当前阶段先读取 mock 数据，为后续 live-report 接入预留统一入口。
async function loadReport() {
  const response = await fetch('./data/mock-report.json', { cache: 'no-store' })
  return response.json()
}

// 工具启动后先加载数据，再做一次完整渲染。
async function init() {
  if (!app) return
  state.report = await loadReport()
  state.pages = normalizePages(state.report)
  render()
}

void init()
