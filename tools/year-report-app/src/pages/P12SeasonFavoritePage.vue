<template>
  <ReportPageShell :page="page">
    <div class="hero-layout hero-layout--centered">
      <div class="hero-copy hero-copy--editorial">
        <span class="hero-tag hero-tag-pill">{{ page.payload.season_label || '季节' }} Favorite</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-highlight">{{ page.payload.favorite_track?.track_title || '暂无季节最爱' }}</p>
        <p class="hero-subtitle hero-subtitle-pill">{{ page.payload.favorite_track?.artist_display || '等待补齐歌手信息' }}</p>
      </div>

      <div class="cover-block cover-block--soft cover-block--centered cover-block--compact">
        <span class="cover-label">这一季最常陪你的那首歌</span>
      </div>

      <div class="hero-fact-row">
        <span class="hero-fact-chip">播放 {{ page.payload.favorite_track?.play_count || 0 }} 次</span>
        <span class="hero-fact-chip">收听 {{ formatMinutes(page.payload.favorite_track?.listened_sec) }}</span>
        <span class="hero-fact-chip">{{ seasonText(page.payload.season_key) }}</span>
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

function formatMinutes(listenedSeconds) {
  return `${Math.max(0, Math.round(Number(listenedSeconds || 0) / 60))} 分钟`
}

function seasonText(seasonKey) {
  return {
    spring: '春天回放',
    summer: '夏日循环',
    autumn: '秋夜偏爱',
    winter: '冬日常驻',
  }[seasonKey] || '季节偏爱'
}
</script>
