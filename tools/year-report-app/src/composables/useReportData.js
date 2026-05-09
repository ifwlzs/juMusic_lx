import { computed, ref, watch } from 'vue'

// 空 contract 作为统一兜底，避免加载失败时模板直接访问未定义字段。
const EMPTY_CONTRACT = {
  meta: {
    year: 0,
    design_width: 390,
    design_height: 844,
    page_order: [],
    page_total: 0,
    theme_name: 'netease-young-editorial',
  },
  pages: [],
}

// 导出页属于前端功能页，不写进 Python contract；这里统一在最后追加。
const EXPORT_PAGE_ID = 'SYS_EXPORT'

export function useReportData(initialContract) {
  // 通过 ref 承载当前年报 contract，便于测试直接注入，也便于未来接入异步刷新。
  const reportContract = ref(normalizeContract(initialContract))

  // 当父组件传入的新 contract 变化时，统一走 normalize，保证渲染端拿到稳定结构。
  watch(
    () => initialContract,
    (nextContract) => {
      reportContract.value = normalizeContract(nextContract)
    },
  )

  // 页面顺序以 meta.page_order 为准；若未配置顺序，则退化为原始 pages 顺序。
  const orderedPages = computed(() => {
    const order = reportContract.value.meta.page_order || []
    if (!order.length) {
      return [...reportContract.value.pages, buildExportPage(reportContract.value.pages, reportContract.value.meta.year)]
    }
    const pageIndexMap = new Map(order.map((pageId, index) => [pageId, index]))
    const sortedPages = [...reportContract.value.pages].sort((leftPage, rightPage) => {
      const leftIndex = pageIndexMap.get(leftPage.page_id) ?? Number.MAX_SAFE_INTEGER
      const rightIndex = pageIndexMap.get(rightPage.page_id) ?? Number.MAX_SAFE_INTEGER
      return leftIndex - rightIndex
    })
    return [...sortedPages, buildExportPage(sortedPages, reportContract.value.meta.year)]
  })

  // 导出时只取正式报告页，明确排除最后的功能页。
  const exportablePages = computed(() => orderedPages.value.filter((page) => page.page_id !== EXPORT_PAGE_ID))
  const pageTotal = computed(() => orderedPages.value.length)

  return {
    reportContract,
    orderedPages,
    exportablePages,
    pageTotal,
  }
}

export async function loadReportContract(url) {
  // 浏览器预览默认走静态 JSON，后续可直接替换为 Python 导出的正式 contract 文件。
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`加载年报数据失败：${response.status}`)
    }
    const payload = await response.json()
    return normalizeContract(payload)
  } catch (error) {
    console.error(error)
    return normalizeContract(null)
  }
}

export async function loadPreferredReportContract(candidateUrls = []) {
  // 真实 contract 放在最前面尝试；只有失败时才回退到 sample，避免正式数据被演示数据覆盖。
  for (const url of candidateUrls) {
    if (typeof url !== 'string' || !url.trim()) continue
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`加载年报数据失败：${response.status}`)
      }
      const payload = await response.json()
      return normalizeContract(payload)
    } catch (error) {
      console.warn(`[year-report] contract fallback from ${url}`, error)
    }
  }
  return normalizeContract(null)
}

export function normalizeContract(rawContract) {
  if (!rawContract || typeof rawContract !== 'object') {
    return structuredClone(EMPTY_CONTRACT)
  }
  return {
    meta: {
      ...EMPTY_CONTRACT.meta,
      ...(rawContract.meta || {}),
    },
    pages: Array.isArray(rawContract.pages) ? rawContract.pages : [],
  }
}

function buildExportPage(orderedPages, year) {
  return {
    page_id: EXPORT_PAGE_ID,
    template: 'export-pdf',
    section: '导出收藏',
    title: '保存这一年的音乐回放',
    year: Number(year) || 0,
    summary_text: '导出页不计入最终 PDF，仅作为下载入口。',
    payload: {
      export_year: Number(year) || 0,
      export_page_total: orderedPages.length,
    },
  }
}
