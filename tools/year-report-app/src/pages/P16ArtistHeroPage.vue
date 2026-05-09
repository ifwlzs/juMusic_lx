<template>
  <ReportPageShell :page="page">
    <div class="hero-layout">
      <div class="hero-copy hero-copy--editorial">
        <span class="hero-tag hero-tag-pill">Artist of the year</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-highlight">{{ page.payload.top_artist?.artist_display || '暂无年度歌手' }}</p>
        <p class="hero-subtitle">这位歌手是你今年最稳定的陪伴对象，下面这组月度条也能看出陪伴强弱起伏。</p>
      </div>

      <div class="score-meta-band">
        <div class="score-factor-list">
          <span class="score-factor-chip">播放 {{ page.payload.top_artist?.play_total || 0 }}</span>
          <span class="score-factor-chip">歌曲 {{ page.payload.top_artist?.track_total || 0 }} 首</span>
          <span class="score-factor-chip">代表作 {{ page.payload.top_artist?.top_track_title || '—' }}</span>
        </div>
      </div>

      <div class="month-bar-list month-bar-list--year-grid">
        <div
          v-for="item in visibleMonths"
          :key="item.month"
          class="month-bar-item"
        >
          <span class="month-bar-label">{{ item.month }}月</span>
          <span class="month-bar-track">
            <span class="month-bar-fill" :style="{ width: `${item.width}%` }"></span>
          </span>
          <strong class="month-bar-value">{{ item.play_total }}</strong>
        </div>
      </div>
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

const visibleMonths = computed(() => {
  const months = props.page.payload.top_artist?.monthly_distribution || []
  const maxValue = Math.max(...months.map((item) => Number(item.play_total || 0)), 1)
  return months
    .map((item) => ({
      ...item,
      width: Number(item.play_total || 0) > 0
        ? Math.max(10, Math.round((Number(item.play_total || 0) / maxValue) * 100))
        : 0,
    }))
})
</script>
