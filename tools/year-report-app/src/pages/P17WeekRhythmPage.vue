<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Weekly rhythm</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">{{ page.payload.mood_summary }}</p>
      </div>

      <div class="weekday-list">
        <article
          v-for="item in page.payload.weekday_distribution || []"
          :key="item.weekday"
          class="weekday-card"
        >
          <div>
            <p class="metric-label">{{ item.weekday_label }}</p>
            <strong class="metric-value">{{ item.play_total }}</strong>
          </div>
          <p class="metric-caption">BPM {{ item.bpm_value || '—' }}</p>
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
