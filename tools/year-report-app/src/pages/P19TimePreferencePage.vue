<template>
  <ReportPageShell :page="page">
    <div class="hero-layout hero-layout--compact time-preference-layout time-preference-layout--single-screen">
      <div class="hero-copy hero-copy--compact">
        <p class="hero-tag">Time preference</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-highlight">{{ page.payload.top_bucket?.bucket_label || '暂无时段' }}</p>
        <p class="hero-subtitle">
          今年最常听在 {{ page.payload.top_bucket?.hour_range_label || '—' }}，
          高峰落在 {{ page.payload.peak_hour?.label || '—' }}，
          代表歌是 {{ page.payload.representative_track?.track_title || '暂无代表歌曲' }}。
        </p>
      </div>

      <div class="time-preference-hero-card time-preference-hero-card--compact">
        <div class="hero-fact-row">
          <span class="hero-fact-chip">Top 时段 {{ page.payload.top_bucket?.bucket_label || '—' }}</span>
          <span class="hero-fact-chip">峰值小时 {{ page.payload.peak_hour?.label || '—' }}</span>
        </div>
      </div>

      <div class="time-bucket-card-grid time-bucket-card-grid--compact time-bucket-card-grid--dense time-bucket-card-grid--microcopy">
        <article
          v-for="item in timeBucketCards"
          :key="item.bucket_key"
          class="time-bucket-card"
        >
          <div class="time-bucket-detail-copy">
            <strong>{{ item.bucket_label }}</strong>
            <span class="time-bucket-range--compact">{{ item.hour_range_label }}</span>
          </div>
          <p class="time-bucket-card-value">{{ item.play_total }}</p>
          <span class="month-bar-track">
            <span class="month-bar-fill" :style="{ width: `${buildWidth(item.play_total)}%` }"></span>
          </span>
        </article>
      </div>

      <div class="time-hour-ranking time-hour-ranking--compact">
        <div class="panel-header">
          <h3>高峰小时</h3>
          <span>Top 3</span>
        </div>
        <div class="time-hour-pill-list">
          <span
            v-for="item in page.payload.top_hour_ranking || []"
            :key="item.label"
            class="time-hour-pill"
          >
            <strong>{{ item.label }}</strong>
            <span>{{ item.play_total }} 次</span>
          </span>
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

const timeBucketCards = computed(() => props.page.payload.time_bucket_distribution || [])

function buildWidth(playTotal) {
  const values = (props.page.payload.time_bucket_distribution || []).map((item) => Number(item.play_total || 0))
  const maxValue = Math.max(...values, 1)
  const normalizedPlayTotal = Number(playTotal || 0)
  // 0 播放时段也要保留卡片，但进度条本身不再伪装成有长度。
  if (normalizedPlayTotal <= 0) {
    return 0
  }
  return Math.max(12, Math.round((normalizedPlayTotal / maxValue) * 100))
}
</script>
