<template>
  <div class="app-shell">
    <ReportViewport
      ref="reportViewportRef"
      :year="reportContract.meta.year"
      :page-total="pageTotal"
      :active-index="activeIndex"
      :design-width="reportContract.meta.design_width"
      :design-height="reportContract.meta.design_height"
    >
      <main class="report-pages" aria-label="年度报告页面列表">
        <component
          :is="resolvePageComponent(page.page_id)"
          v-for="page in orderedPages"
          :key="page.page_id"
          v-bind="buildPageProps(page)"
          :ref="(element) => handlePageRef(page.page_id, element)"
        />
      </main>
    </ReportViewport>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import ReportViewport from '@/components/ReportViewport.vue'
import { useReportData } from '@/composables/useReportData.js'
import { usePageNavigator } from '@/composables/usePageNavigator.js'
import { resolvePageComponent } from '@/lib/pageRegistry.js'
import { exportReportPagesToPdf } from '@/lib/pdfExport.js'

const props = defineProps({
  reportContract: {
    type: Object,
    required: true,
  },
})

// 数据 composable 负责 contract 归一与页面顺序；App 只做组件编排与分页状态。
const { reportContract, orderedPages, exportablePages, pageTotal } = useReportData(props.reportContract)
const reportViewportRef = ref(null)
const viewportRef = computed(() => reportViewportRef.value?.viewportElement ?? null)
const { activePageId, registerPageElement } = usePageNavigator(viewportRef)
const pageElementMap = new Map()
const exportState = reactive({
  isExporting: false,
  progressText: '',
  errorMessage: '',
})

const activeIndex = computed(() => {
  const currentIndex = orderedPages.value.findIndex((page) => page.page_id === activePageId.value)
  return currentIndex >= 0 ? currentIndex : 0
})

function handlePageRef(pageId, componentInstance) {
  // Vue 给组件 ref 时拿到的是组件实例，这里要转成组件根节点再注册给导航观察器。
  const element = componentInstance?.$el || componentInstance
  if (!element) {
    pageElementMap.delete(pageId)
  } else {
    pageElementMap.set(pageId, element)
  }
  registerPageElement(pageId, element)
}

function buildPageProps(page) {
  // 导出页需要额外挂接按钮状态与点击回调，其余页面保持原状。
  if (page.page_id === 'SYS_EXPORT') {
    return {
      page,
      exportState,
      onExportPdf: handleExportPdf,
    }
  }
  return {
    page,
  }
}

async function handleExportPdf() {
  if (exportState.isExporting) {
    return
  }
  exportState.isExporting = true
  exportState.progressText = ''
  exportState.errorMessage = ''

  try {
    await exportReportPagesToPdf({
      exportPages: exportablePages.value,
      pageElementMap,
      year: reportContract.value.meta.year,
      onProgress: ({ current, total }) => {
        exportState.progressText = `正在导出 ${current} / ${total} 页...`
      },
    })
    exportState.progressText = `导出完成，共 ${exportablePages.value.length} 页。`
  } catch (error) {
    exportState.errorMessage = error instanceof Error ? error.message : '导出失败，请稍后重试。'
  } finally {
    exportState.isExporting = false
  }
}
</script>
