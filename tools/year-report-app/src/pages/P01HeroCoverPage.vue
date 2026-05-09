<template>
  <ReportPageShell :page="page">
    <div class="hero-layout hero-layout--centered">
      <div class="hero-copy hero-copy--editorial">
        <span class="hero-tag hero-tag-pill">First play</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-highlight">
          {{ page.payload.first_track?.track_title || '还没有第一首歌数据' }}
        </p>
        <p class="hero-subtitle hero-subtitle-pill">
          {{ page.payload.first_track?.artist_display || '等待补齐歌手信息' }}
        </p>
      </div>

      <div class="cover-block cover-block--soft cover-block--centered cover-block--compact">
        <span class="cover-label">与你相遇的第一首歌</span>
      </div>

      <div class="hero-meta-band">
        <span class="hero-meta-label">首次记录</span>
        <strong class="hero-meta-value">{{ page.payload.first_track?.played_at || '暂无时间戳' }}</strong>
      </div>

      <div class="hero-fact-row">
        <span class="hero-fact-chip">相伴 {{ page.payload.companionship_days || 0 }} 天</span>
        <span class="hero-fact-chip">第 {{ page.payload.companionship_years || 0 }} 年</span>
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
</script>
