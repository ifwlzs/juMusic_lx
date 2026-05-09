<template>
  <ReportPageShell :page="page">
    <div class="hero-layout hero-layout--centered">
      <div class="hero-copy hero-copy--editorial">
        <span class="hero-tag hero-tag-pill">Song of the year</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-highlight">{{ page.payload.song_of_year?.track_title || '暂无年度歌曲' }}</p>
        <p class="hero-subtitle hero-subtitle-pill">
          {{ page.payload.song_of_year?.artist_display || '等待补齐歌手信息' }}
        </p>
      </div>

      <section class="score-hero-card">
        <div class="score-hero-copy">
          <p class="score-hero-kicker">综合评分</p>
          <strong class="score-hero-value">{{ formatScore(page.payload.song_of_year?.score) }}</strong>
          <p class="score-hero-desc">综合考虑播放次数、活跃天数和收听时长，避免只被短期刷歌劫持。</p>
        </div>
      </section>

      <div class="score-meta-band">
        <div class="score-factor-list">
          <span class="score-factor-chip">播放 {{ page.payload.song_of_year?.play_count || 0 }}</span>
          <span class="score-factor-chip">活跃 {{ page.payload.song_of_year?.active_days || 0 }} 天</span>
          <span class="score-factor-chip">收听 {{ formatMinutes(page.payload.song_of_year?.listened_sec || 0) }}</span>
        </div>

        <p class="score-support-note">
          高峰出现在 {{ page.payload.song_of_year?.peak_month || '—' }} 月
          <span v-if="page.payload.song_of_year?.album_display"> · 《{{ page.payload.song_of_year?.album_display }}》</span>
        </p>
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

function formatScore(score) {
  // 综合分保留 3 位小数，保证页面里仍能看见评分算法的细腻差别。
  const normalizedScore = Number(score || 0)
  return normalizedScore.toFixed(3)
}

function formatMinutes(listenedSeconds) {
  // 用分钟展示收听时长，避免秒级数字在视觉上过长、过硬。
  const totalMinutes = Math.max(0, Math.round(Number(listenedSeconds || 0) / 60))
  return `${totalMinutes} 分钟`
}
</script>
