<template>
  <ReportPageShell :page="page">
    <div class="hero-layout hero-layout--centered">
      <div class="hero-copy hero-copy--editorial">
        <span class="hero-tag hero-tag-pill">Album hero</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-highlight">{{ page.payload.top_album?.album_display || '暂无冠军专辑' }}</p>
        <p class="hero-subtitle hero-subtitle-pill">
          {{ page.payload.top_album?.artist_display || '等待补齐歌手信息' }}
        </p>
      </div>

      <div class="cover-block cover-block--album cover-block--centered cover-block--compact">
        <span class="cover-label">{{ page.payload.top_album?.representative_track_title || '年度陪伴专辑' }}</span>
      </div>

      <div class="album-spotlight-card">
        <span class="album-spotlight-label">代表歌曲</span>
        <strong class="album-spotlight-title">{{ page.payload.top_album?.representative_track_title || '年度陪伴专辑' }}</strong>
        <p class="album-spotlight-desc">这首歌是你回到这张专辑时，最常再次点开的入口。</p>
      </div>

      <div class="hero-fact-row">
        <span class="hero-fact-chip">播放 {{ page.payload.top_album?.play_total || 0 }} 次</span>
        <span class="hero-fact-chip">歌曲 {{ page.payload.top_album?.track_total || 0 }} 首</span>
        <span class="hero-fact-chip">活跃 {{ page.payload.top_album?.active_days || 0 }} 天</span>
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
