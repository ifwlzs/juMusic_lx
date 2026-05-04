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

// 保留四个代表页的字面渲染标记，供测试与后续模板检索直接复用。
const PAGE_KIND_MARKERS = {
  heroStart: 'data-page-kind="hero-start"',
  seasonCard: 'data-page-kind="season-card"',
  albumRanking: 'data-page-kind="album-ranking"',
  summaryGrid: 'data-page-kind="summary-grid"',
  yearOverview: 'data-page-kind="year-overview"',
  exploreWidth: 'data-page-kind="explore-width"',
  languageSpotlight: 'data-page-kind="language-spotlight"',
  tasteBalance: 'data-page-kind="taste-balance"',
}

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

// 转义文本内容，避免后续真实 JSON 接入时把特殊字符直接打进 HTML。
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// 只允许安全的十六进制颜色透传给内联样式，异常输入统一回退。
function normalizeAccentColor(value, fallback = '#34D399') {
  return /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value || '') ? value : fallback
}

// 统一输出自定义页的公共头部与容器，避免四种 rich page 重复拼接外框结构。
function renderRichPageShell(page, index, total, options) {
  const activeClass = index === state.activeIndex ? ' is-active' : ''
  const pageClassName = ['page', `page--${page.template.toLowerCase()}`, options.pageClassName, activeClass].filter(Boolean).join(' ')
  return `
    <section class="${pageClassName}" data-page-id="${page.page_id}" data-page-index="${index}" data-page-kind="${options.pageKind}">
      <header class="page__top">
        <span class="page__eyebrow">${escapeHtml(page.year)} · ${escapeHtml(page.page_id)}</span>
        <span class="page__count">${index + 1} / ${total}</span>
      </header>
      <div class="page__body page__body--rich">
        ${options.bodyHtml}
      </div>
    </section>
  `
}

// 渲染 P01 开场页：强调累计天数与首次打开时间，让用户一上来就被“陪伴感”击中。
function renderP01(page, index, total) {
  const facts = (page.supporting_facts || []).slice(0, 3)
  const factsHtml = facts.map(fact => `<li class="hero-start__fact">${escapeHtml(fact)}</li>`).join('')
  return renderRichPageShell(page, index, total, {
    pageKind: 'hero-start',
    pageClassName: 'page--hero-start',
    bodyHtml: `
      <div class="hero-start">
        <div class="hero-start__halo" aria-hidden="true"></div>
        <div class="hero-start__content">
          <p class="hero-start__kicker">首次相遇</p>
          <h1 class="page__title hero-start__title">${escapeHtml(page.title || '首次使用')}</h1>
          <p class="page__summary hero-start__summary">${escapeHtml(page.summary_text || '')}</p>
          <div class="hero-start__value">${escapeHtml(page.hero_value || '0 天')}</div>
          <p class="hero-start__label">${escapeHtml(page.hero_label || '已经陪你听歌这么久')}</p>
          <div class="hero-start__meta">
            <span class="hero-start__meta-label">第一次点开</span>
            <strong class="hero-start__meta-value">${escapeHtml(page.first_played_at || '--')}</strong>
          </div>
          <ul class="hero-start__facts">${factsHtml}</ul>
        </div>
      </div>
    `,
  })
}

// 渲染 P02 总览页：用一个主数字带四张总量卡，形成前半段连续进入后的第一张统计总览页。
function renderP02(page, index, total) {
  const stats = (page.overview_stats || []).slice(0, 4)
  const heroStat = stats[0] || { label: '播放次数', value: '--' }
  const secondaryStats = stats.slice(1)
  const cardsHtml = secondaryStats.map(stat => `
    <article class="year-overview__stat year-overview__stat--${escapeHtml(stat.emphasis || 'secondary')}">
      <span class="year-overview__stat-label">${escapeHtml(stat.label)}</span>
      <strong class="year-overview__stat-value">${escapeHtml(stat.value)}</strong>
    </article>
  `).join('')
  return renderRichPageShell(page, index, total, {
    pageKind: 'year-overview',
    pageClassName: 'page--year-overview',
    bodyHtml: `
      <div class="year-overview">
        <div class="year-overview__intro">
          <p class="year-overview__kicker">年度总览</p>
          <h1 class="page__title year-overview__title">${escapeHtml(page.title || '年度总览')}</h1>
          <p class="page__summary year-overview__summary">${escapeHtml(page.summary_text || '')}</p>
        </div>
        <div class="year-overview__hero">
          <span class="year-overview__hero-label">${escapeHtml(heroStat.label)}</span>
          <strong class="year-overview__hero-value">${escapeHtml(heroStat.value)}</strong>
          <div class="year-overview__hero-fact">
            <span class="year-overview__hero-fact-label">${escapeHtml(page.hero_fact?.label || '最常听歌时段')}</span>
            <strong class="year-overview__hero-fact-value">${escapeHtml(page.hero_fact?.value || '--')}</strong>
          </div>
        </div>
        <div class="year-overview__stats">${cardsHtml}</div>
      </div>
    `,
  })
}

// 渲染 P03 探索页：把探索指标和一列探索轨迹放在同页，既有统计也有故事感。
function renderP03(page, index, total) {
  const metrics = (page.breadth_metrics || []).slice(0, 3)
  const metricHtml = metrics.map(metric => `
    <article class="explore-width__metric">
      <span class="explore-width__metric-label">${escapeHtml(metric.label)}</span>
      <strong class="explore-width__metric-value">${escapeHtml(metric.value)}</strong>
    </article>
  `).join('')
  const storyHtml = (page.explore_story || []).slice(0, 4).map(item => `
    <li class="explore-width__story-item">${escapeHtml(item)}</li>
  `).join('')
  return renderRichPageShell(page, index, total, {
    pageKind: 'explore-width',
    pageClassName: 'page--explore-width',
    bodyHtml: `
      <div class="explore-width">
        <div class="explore-width__intro">
          <p class="explore-width__kicker">探索广度</p>
          <h1 class="page__title explore-width__title">${escapeHtml(page.title || '年度探索广度')}</h1>
          <p class="page__summary explore-width__summary">${escapeHtml(page.summary_text || '')}</p>
        </div>
        <div class="explore-width__layout">
          <div class="explore-width__metrics">${metricHtml}</div>
          <div class="explore-width__story">
            <span class="explore-width__story-label">探索轨迹</span>
            <ul class="explore-width__story-list">${storyHtml}</ul>
          </div>
        </div>
      </div>
    `,
  })
}

// 渲染 P04 外语歌曲页：突出不同语言的占比卡与代表歌曲，避免退回普通榜单感。
function renderP04(page, index, total) {
  const cards = (page.language_cards || []).slice(0, 3)
  const cardsHtml = cards.map(card => `
    <article class="language-spotlight__card">
      <div class="language-spotlight__card-top">
        <span class="language-spotlight__language">${escapeHtml(card.language)}</span>
        <strong class="language-spotlight__share">${escapeHtml(card.share_text)}</strong>
      </div>
      <strong class="language-spotlight__track">${escapeHtml(card.track_title)}</strong>
      <span class="language-spotlight__artist">${escapeHtml(card.artist_display)}</span>
      <span class="language-spotlight__plays">${escapeHtml(card.play_total)} 次播放</span>
    </article>
  `).join('')
  return renderRichPageShell(page, index, total, {
    pageKind: 'language-spotlight',
    pageClassName: 'page--language-spotlight',
    bodyHtml: `
      <div class="language-spotlight">
        <div class="language-spotlight__intro">
          <p class="language-spotlight__kicker">多语言聆听</p>
          <h1 class="page__title language-spotlight__title">${escapeHtml(page.title || '外语歌曲')}</h1>
          <p class="page__summary language-spotlight__summary">${escapeHtml(page.summary_text || '')}</p>
        </div>
        <div class="language-spotlight__cards">${cardsHtml}</div>
      </div>
    `,
  })
}

// 渲染 P05 对照页：使用左右分栏表达探索与重复所爱的拉扯，避免做成传统饼图。
function renderP05(page, index, total) {
  const explore = page.balance_compare?.explore || { label: '主动探索', value: '--', support_text: '' }
  const repeat = page.balance_compare?.repeat || { label: '重复所爱', value: '--', support_text: '' }
  return renderRichPageShell(page, index, total, {
    pageKind: 'taste-balance',
    pageClassName: 'page--taste-balance',
    bodyHtml: `
      <div class="taste-balance">
        <div class="taste-balance__intro">
          <p class="taste-balance__kicker">听歌偏好</p>
          <h1 class="page__title taste-balance__title">${escapeHtml(page.title || '主动探索 vs 重复所爱')}</h1>
          <p class="page__summary taste-balance__summary">${escapeHtml(page.summary_text || '')}</p>
        </div>
        <div class="taste-balance__split">
          <article class="taste-balance__panel taste-balance__panel--explore">
            <span class="taste-balance__panel-label">${escapeHtml(explore.label)}</span>
            <strong class="taste-balance__panel-value">${escapeHtml(explore.value)}</strong>
            <p class="taste-balance__panel-support">${escapeHtml(explore.support_text)}</p>
          </article>
          <article class="taste-balance__panel taste-balance__panel--repeat">
            <span class="taste-balance__panel-label">${escapeHtml(repeat.label)}</span>
            <strong class="taste-balance__panel-value">${escapeHtml(repeat.value)}</strong>
            <p class="taste-balance__panel-support">${escapeHtml(repeat.support_text)}</p>
          </article>
        </div>
        <p class="taste-balance__caption">${escapeHtml(page.balance_caption || '')}</p>
      </div>
    `,
  })
}

// 渲染 P12 春季页：使用更亮的绿色封面卡，建立四季模板的统一基线。
function renderP12(page, index, total) {
  const accentColor = normalizeAccentColor(page.accent_hex, '#34D399')
  return renderRichPageShell(page, index, total, {
    pageKind: 'season-card',
    pageClassName: 'page--season-card',
    bodyHtml: `
      <div class="season-card" style="--season-accent: ${accentColor};">
        <div class="season-card__hero">
          <div class="season-card__copy">
            <p class="season-card__kicker">四季循环 · ${escapeHtml(page.season_name || 'SPRING')}</p>
            <h1 class="page__title season-card__title">${escapeHtml(page.title || '春季最爱')}</h1>
            <p class="page__summary season-card__summary">${escapeHtml(page.summary_text || '')}</p>
          </div>
          <div class="season-card__cover" aria-hidden="true">
            <div class="season-card__disc"></div>
            <div class="season-card__glow"></div>
          </div>
        </div>
        <div class="season-card__track">
          <span class="season-card__track-label">春天最常回到的歌</span>
          <strong class="season-card__track-title">${escapeHtml(page.track_title || '--')}</strong>
          <span class="season-card__artist">${escapeHtml(page.artist_display || '--')}</span>
        </div>
        <div class="season-card__stats">
          <article class="season-card__stat">
            <span class="season-card__stat-label">播放次数</span>
            <strong class="season-card__stat-value">${escapeHtml(page.play_total || 0)}</strong>
          </article>
          <article class="season-card__stat">
            <span class="season-card__stat-label">活跃天数</span>
            <strong class="season-card__stat-value">${escapeHtml(page.active_days || 0)}</strong>
          </article>
        </div>
      </div>
    `,
  })
}

// 渲染 P24 专辑榜：冠军卡单独放大，其余名次保持稳定节奏，方便后续扩榜单模板。
function renderP24(page, index, total) {
  const ranking = Array.isArray(page.album_ranking) ? page.album_ranking : []
  const [champion, ...others] = ranking
  const championPayload = champion || { rank: 1, album_display: '--', artist_display: '--', play_total: 0 }
  const othersHtml = others.slice(0, 4).map(item => `
    <li class="album-ranking__item">
      <span class="album-ranking__item-rank">#${escapeHtml(item.rank)}</span>
      <div class="album-ranking__item-copy">
        <strong class="album-ranking__item-title">${escapeHtml(item.album_display)}</strong>
        <span class="album-ranking__item-artist">${escapeHtml(item.artist_display)}</span>
      </div>
      <span class="album-ranking__item-count">${escapeHtml(item.play_total)} 次</span>
    </li>
  `).join('')
  return renderRichPageShell(page, index, total, {
    pageKind: 'album-ranking',
    pageClassName: 'page--album-ranking',
    bodyHtml: `
      <div class="album-ranking">
        <div class="album-ranking__intro">
          <p class="album-ranking__kicker">年度专辑榜</p>
          <h1 class="page__title album-ranking__title">${escapeHtml(page.title || '年度最爱专辑榜')}</h1>
          <p class="page__summary album-ranking__summary">${escapeHtml(page.summary_text || '')}</p>
        </div>
        <article class="album-ranking__champion">
          <span class="album-ranking__champion-rank">#${escapeHtml(championPayload.rank)}</span>
          <div class="album-ranking__champion-copy">
            <span class="album-ranking__champion-label">冠军专辑</span>
            <strong class="album-ranking__champion-title">${escapeHtml(championPayload.album_display)}</strong>
            <span class="album-ranking__champion-artist">${escapeHtml(championPayload.artist_display)}</span>
          </div>
          <span class="album-ranking__champion-count">${escapeHtml(championPayload.play_total)} 次播放</span>
        </article>
        <ol class="album-ranking__list">${othersHtml}</ol>
      </div>
    `,
  })
}

// 渲染 P32 四格总结：固定四张卡并支持移动端自动折叠为单列，方便收尾页形成停顿感。
function renderP32(page, index, total) {
  const cards = Array.isArray(page.summary_cards) ? page.summary_cards : []
  const cardsHtml = cards.slice(0, 4).map(card => `
    <article class="summary-grid__card" data-card-id="${escapeHtml(card.card_id || '')}">
      <span class="summary-grid__headline">${escapeHtml(card.headline || '--')}</span>
      <strong class="summary-grid__value">${escapeHtml(card.value || '--')}</strong>
      <p class="summary-grid__support">${escapeHtml(card.support_text || '')}</p>
    </article>
  `).join('')
  return renderRichPageShell(page, index, total, {
    pageKind: 'summary-grid',
    pageClassName: 'page--summary-grid',
    bodyHtml: `
      <div class="summary-grid">
        <div class="summary-grid__intro">
          <p class="summary-grid__kicker">年度四格</p>
          <h1 class="page__title summary-grid__title">${escapeHtml(page.title || '音乐四格总结')}</h1>
          <p class="page__summary summary-grid__summary">${escapeHtml(page.summary_text || '')}</p>
        </div>
        <div class="page__summary-grid summary-grid__cards">${cardsHtml}</div>
      </div>
    `,
  })
}

// 按模板输出单页内容；对已落地的代表页走定制渲染，其余页继续使用通用占位骨架。
function renderPage(page, index, total) {
  if (page.page_id === 'P01') return renderP01(page, index, total)
  if (page.page_id === 'P02') return renderP02(page, index, total)
  if (page.page_id === 'P03') return renderP03(page, index, total)
  if (page.page_id === 'P04') return renderP04(page, index, total)
  if (page.page_id === 'P05') return renderP05(page, index, total)
  if (page.page_id === 'P12') return renderP12(page, index, total)
  if (page.page_id === 'P24') return renderP24(page, index, total)
  if (page.page_id === 'P32') return renderP32(page, index, total)

  const activeClass = index === state.activeIndex ? ' is-active' : ''
  return `
    <section class="page page--${page.template.toLowerCase()}${activeClass}" data-page-id="${page.page_id}" data-page-index="${index}">
      <header class="page__top">
        <span class="page__eyebrow">${escapeHtml(page.year)} · ${escapeHtml(page.page_id)}</span>
        <span class="page__count">${index + 1} / ${total}</span>
      </header>
      <div class="page__body">
        <h1 class="page__title">${escapeHtml(page.title)}</h1>
        <p class="page__summary">${escapeHtml(page.summary_text || '')}</p>
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
