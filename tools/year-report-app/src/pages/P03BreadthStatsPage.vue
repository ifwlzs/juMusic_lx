<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Breadth</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">这一页不强调单个冠军，而是看你这一年到底把听歌地图拓到了多远。</p>
      </div>

      <div class="metric-grid metric-grid--two">
        <article class="metric-card metric-card--glass">
          <p class="metric-label">听过歌手</p>
          <strong class="metric-value">{{ page.payload.breadth_metrics?.artist_total || 0 }}</strong>
          <p class="metric-caption">位</p>
        </article>
        <article class="metric-card metric-card--glass">
          <p class="metric-label">新歌手</p>
          <strong class="metric-value">{{ page.payload.breadth_metrics?.new_artist_total || 0 }}</strong>
          <p class="metric-caption">位新面孔</p>
        </article>
        <article class="metric-card metric-card--glass">
          <p class="metric-label">年度曲风</p>
          <strong class="metric-value">{{ page.payload.breadth_metrics?.genre_total || 0 }}</strong>
          <p class="metric-caption">种</p>
        </article>
        <article class="metric-card metric-card--glass">
          <p class="metric-label">新曲风</p>
          <strong class="metric-value">{{ page.payload.breadth_metrics?.new_genre_total || 0 }}</strong>
          <p class="metric-caption">种新的偏好</p>
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
</script>
