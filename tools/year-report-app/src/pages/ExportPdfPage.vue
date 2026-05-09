<template>
  <ReportPageShell :page="page">
    <div class="hero-layout hero-layout--centered export-page-layout">
      <div class="hero-copy hero-copy--editorial">
        <span class="hero-tag hero-tag-pill">Export PDF</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">把这一年的音乐回放保存成完整 PDF，适合留档和分享。</p>
      </div>

      <section class="story-card story-card--focus export-page-card">
        <strong class="export-page-title">共 {{ page.payload.export_page_total }} 页</strong>
        <p class="export-page-desc">只导出正式报告页，不包含当前这一页。</p>
        <button
          class="export-page-button"
          type="button"
          :disabled="exportState.isExporting"
          data-testid="export-pdf-button"
          @click="onExportPdf"
        >
          {{ exportState.isExporting ? '正在导出 PDF…' : '导出 PDF' }}
        </button>
        <p v-if="exportState.progressText" class="export-page-progress">{{ exportState.progressText }}</p>
        <p v-if="exportState.errorMessage" class="export-page-error">{{ exportState.errorMessage }}</p>
      </section>
    </div>
  </ReportPageShell>
</template>

<script setup>
import ReportPageShell from '@/components/ReportPageShell.vue'

defineProps({
  page: {
    type: Object,
    required: true,
  },
  exportState: {
    type: Object,
    default: () => ({
      isExporting: false,
      progressText: '',
      errorMessage: '',
    }),
  },
  onExportPdf: {
    type: Function,
    default: () => {},
  },
})
</script>
