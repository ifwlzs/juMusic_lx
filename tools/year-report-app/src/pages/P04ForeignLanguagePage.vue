<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Foreign tracks</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">语种覆盖和一首代表歌并排放，让这一页更像“外语歌回望”而不是普通排行榜。</p>
      </div>

      <section class="story-card story-card--focus">
        <strong>{{ page.payload.foreign_language_total || 0 }}</strong>
        <p>今年主要出现了 {{ page.payload.foreign_language_total || 0 }} 种外语语种</p>
      </section>

      <div class="metric-grid metric-grid--two">
        <article
          v-for="item in page.payload.language_ranking || []"
          :key="item.language_name"
          class="metric-card metric-card--glass"
        >
          <p class="metric-label">{{ item.language_name }}</p>
          <strong class="metric-value">{{ item.play_total }}</strong>
          <p class="metric-caption">{{ item.track_total }} 首歌</p>
        </article>
      </div>

      <div v-if="page.payload.spotlight_track" class="hero-meta-band">
        <span class="hero-meta-label">代表歌曲</span>
        <strong class="hero-meta-value">
          {{ page.payload.spotlight_track.track_title }} · {{ page.payload.spotlight_track.artist_display }}
        </strong>
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
