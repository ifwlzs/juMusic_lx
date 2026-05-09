<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Genre timeline</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">每个月只抓一个最醒目的曲风，拼成一条节奏明显的变化线。</p>
      </div>

      <ol class="timeline-list">
        <li v-for="item in page.payload.monthly_genre_timeline || []" :key="item.month" class="timeline-item">
          <span class="timeline-year">{{ item.month }}月</span>
          <div class="timeline-body">
            <strong>{{ resolveGenreLabel(item) }}</strong>
            <p>加权 {{ item.top_weighted_track_count ?? item.top_weighted_play_total ?? 0 }} 首</p>
          </div>
        </li>
      </ol>
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

function resolveGenreLabel(item) {
  if (item?.top_genre_zh) {
    return item.top_genre_zh
  }
  if (item?.top_genre) {
    return item.top_genre
  }
  return '未知曲风'
}
</script>
