<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Weekly rhythm</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">{{ page.payload.mood_summary }}</p>
      </div>

      <div class="weekday-list">
        <article
          v-for="item in page.payload.weekday_distribution || []"
          :key="item.weekday"
          class="weekday-card"
        >
          <div>
            <p class="metric-label">{{ item.weekday_label }}</p>
            <strong class="metric-value">{{ item.play_total }}</strong>
          </div>
          <div
            v-if="item.bpm_value"
            class="weekday-card__meta"
          >
            <p class="metric-caption">BPM {{ item.bpm_value }}</p>
          </div>
          <div
            v-else
            class="weekday-card__meta weekday-card__meta--fallback"
          >
            <p class="metric-caption">播放 {{ item.play_total || 0 }} 次</p>
            <p class="metric-caption">累计 {{ formatMinutes(item.listened_sec) }}</p>
          </div>
        </article>
      </div>
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
})

function formatMinutes(listenedSec) {
  const totalMinutes = Math.max(1, Math.round(Number(listenedSec || 0) / 60))
  return `${totalMinutes} 分钟`
}
</script>
