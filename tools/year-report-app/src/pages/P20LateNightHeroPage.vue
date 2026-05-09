<template>
  <ReportPageShell :page="page">
    <div class="hero-layout hero-layout--centered">
      <div class="hero-copy hero-copy--editorial">
        <span class="hero-tag hero-tag-pill">Late night</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-highlight">{{ page.payload.latest_night_record?.latest_time || '--:--' }}</p>
        <p class="hero-subtitle hero-subtitle-pill">
          {{ page.payload.latest_night_record?.track_title || '暂无深夜记录' }}
        </p>
      </div>

      <div class="hero-fact-row">
        <span class="hero-fact-chip">深夜 {{ page.payload.late_night_total || 0 }} 次</span>
        <span class="hero-fact-chip">涉及 {{ page.payload.late_night_track_total || 0 }} 首歌</span>
      </div>

      <div v-if="page.payload.representative_tracks?.length" class="score-meta-band">
        <div class="score-factor-list">
          <span
            v-for="item in page.payload.representative_tracks.slice(0, 3)"
            :key="item.track_title"
            class="score-factor-chip"
          >
            {{ item.track_title }} · {{ item.late_night_play_total }} 次
          </span>
        </div>
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
