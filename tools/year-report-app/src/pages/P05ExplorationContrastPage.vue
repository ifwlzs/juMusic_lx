<template>
  <ReportPageShell :page="page">
    <div class="dual-ranking-layout">
      <div class="hero-copy">
        <p class="hero-tag">Explore vs revisit</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">一边是主动去找的新鲜感，一边是反复回访的熟悉感。</p>
      </div>

      <div class="dual-grid">
        <section class="ranking-panel ranking-panel--accent">
          <div class="panel-header">
            <h3>主动探索</h3>
            <span>{{ formatPercent(page.payload.exploration_metrics?.explore_ratio) }}</span>
          </div>
          <div class="story-card">
            <strong>{{ page.payload.exploration_metrics?.explore_play_total || 0 }}</strong>
            <p>次主动打开</p>
          </div>
          <p class="artist-ranking-hero-note">
            {{ page.payload.spotlight_tracks?.search_top_track?.track_title || '暂无代表歌曲' }}
            ·
            {{ page.payload.spotlight_tracks?.search_top_track?.artist_display || '—' }}
          </p>
        </section>

        <section class="ranking-panel">
          <div class="panel-header">
            <h3>重复所爱</h3>
            <span>{{ formatPercent(page.payload.exploration_metrics?.repeat_track_ratio) }}</span>
          </div>
          <div class="story-card">
            <strong>{{ page.payload.exploration_metrics?.repeat_play_total || 0 }}</strong>
            <p>次旧歌回访</p>
          </div>
          <p class="artist-ranking-hero-note">
            {{ page.payload.spotlight_tracks?.revisit_top_track?.track_title || '暂无代表歌曲' }}
            ·
            {{ page.payload.spotlight_tracks?.revisit_top_track?.artist_display || '—' }}
          </p>
        </section>
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

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`
}
</script>
