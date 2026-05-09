<template>
  <section
    class="report-page"
    :class="[`page-theme--${page.page_id.toLowerCase()}`]"
    :data-page-id="page.page_id"
    :data-testid="'report-page'"
    :style="themeStyle"
  >
    <div class="page-shell">
      <header class="page-header">
        <p class="page-kicker">{{ page.section }}</p>
        <span class="page-id">{{ page.page_id }}</span>
      </header>

      <div class="page-content">
        <slot></slot>
      </div>

      <footer class="page-footer">
        <div class="page-summary-card">
          <p class="page-summary">{{ page.summary_text }}</p>
        </div>
      </footer>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { getPageThemeStyle } from '@/lib/reportTheme.js'

const props = defineProps({
  page: {
    type: Object,
    required: true,
  },
})

// 页面主题变量交给 CSS 使用，让每个章节都能保持独立色彩记忆点。
const themeStyle = computed(() => getPageThemeStyle(props.page.page_id))
</script>
