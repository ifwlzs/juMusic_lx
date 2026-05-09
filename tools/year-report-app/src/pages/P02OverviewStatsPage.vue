<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Year in numbers</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">先把这一年的总播放、总时长、活跃天数和新歌占比收成一眼能懂的四个数字。</p>
      </div>

      <div class="metric-grid metric-grid--two">
        <article class="metric-card metric-card--glass">
          <p class="metric-label">年度播放</p>
          <strong class="metric-value">{{ page.payload.overview_metrics?.total_play_count || 0 }}</strong>
          <p class="metric-caption">次播放</p>
        </article>
        <article class="metric-card metric-card--glass">
          <p class="metric-label">收听时长</p>
          <strong class="metric-value">{{ formatHours(page.payload.overview_metrics?.total_listened_hours) }}</strong>
          <p class="metric-caption">小时</p>
        </article>
        <article class="metric-card metric-card--glass">
          <p class="metric-label">活跃天数</p>
          <strong class="metric-value">{{ page.payload.overview_metrics?.active_day_total || 0 }}</strong>
          <p class="metric-caption">天</p>
        </article>
        <article class="metric-card metric-card--glass">
          <p class="metric-label">新歌占比</p>
          <strong class="metric-value">{{ formatPercent(page.payload.overview_metrics?.new_song_ratio) }}</strong>
          <p class="metric-caption">{{ page.payload.overview_metrics?.new_song_total || 0 }} 首新歌</p>
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

function formatHours(value) {
  return Number(value || 0).toFixed(1)
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`
}
</script>
