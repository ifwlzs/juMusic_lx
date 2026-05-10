<template>
  <ReportPageShell :page="page">
    <div class="artist-journey-page stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Artist journey</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">
          从第一次点开，到今年的高峰日，这一页把你和年度歌手之间的轨迹串起来。
        </p>
      </div>

      <section class="story-card story-card--focus">
        <strong>{{ page.payload.artist_journey?.artist_display || '暂无年度歌手' }}</strong>
        <p>已经陪你走过 {{ page.payload.artist_journey?.days_since_first_play || 0 }} 天</p>
      </section>

      <section class="dual-grid">
        <article class="story-card">
          <p class="metric-label">第一次相遇</p>
          <strong>{{ page.payload.artist_journey?.first_played_at || '暂无记录' }}</strong>
          <p>
            {{ page.payload.artist_journey?.first_track?.track_title || '未知歌曲' }}
            <template v-if="page.payload.artist_journey?.first_track?.album_display">
              · 《{{ page.payload.artist_journey.first_track.album_display }}》
            </template>
          </p>
        </article>

        <article class="story-card">
          <p class="metric-label">年度高峰日</p>
          <strong>{{ page.payload.artist_journey?.peak_day?.date || '暂无记录' }}</strong>
          <p>
            {{ page.payload.artist_journey?.peak_day?.track_title || '未知歌曲' }}
            · {{ page.payload.artist_journey?.peak_day?.play_total || 0 }} 次
          </p>
        </article>
      </section>
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
