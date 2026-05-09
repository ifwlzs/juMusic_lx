<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Year summary</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">把深夜、专辑、扩坑和曲库结构收束成四张短卡，给这一年一个结尾。</p>
      </div>

      <section class="summary-card-grid">
        <article
          v-for="item in summaryCards"
          :key="item.card_id || item.headline"
          class="story-card story-card--focus"
        >
          <p class="metric-label">{{ item.headline || '年度总结' }}</p>
          <strong>{{ item.value || '待补充' }}</strong>
          <p>{{ item.support_text || item.description || '这一格会在后续聚合补齐后展示更多上下文。' }}</p>
        </article>
      </section>
    </div>
  </ReportPageShell>
</template>

<script setup>
import { computed } from 'vue'
import ReportPageShell from '@/components/ReportPageShell.vue'

const props = defineProps({
  page: {
    type: Object,
    required: true,
  },
})

const summaryCards = computed(() => props.page?.payload?.summary_cards || [])
</script>
