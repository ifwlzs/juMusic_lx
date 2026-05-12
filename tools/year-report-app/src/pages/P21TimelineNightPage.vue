<template>
  <ReportPageShell :page="page">
    <div class="timeline-layout" :class="{ 'timeline-layout--centered': page.payload.layout_mode === 'single-year' }">
      <div class="hero-copy" :class="{ 'hero-copy--editorial': page.payload.layout_mode === 'single-year' }">
        <span v-if="page.payload.layout_mode === 'single-year'" class="hero-tag hero-tag-pill">Night history</span>
        <p v-else class="hero-tag">Night history</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">
          {{ page.payload.layout_mode === 'single-year' ? '当前只有一年数据，先用主角卡展示。' : '把每一年最晚的那次听歌排成一条时间线。' }}
        </p>
      </div>

      <div v-if="page.payload.layout_mode === 'single-year'" class="story-card story-card--focus">
        <strong>{{ page.payload.latest_night_history?.[0]?.latest_time || '--:--' }}</strong>
        <p>{{ page.payload.latest_night_history?.[0]?.track_title || '暂无记录' }}</p>
        <p class="timeline-single-year-caption">{{ page.payload.latest_night_history?.[0]?.artist_display || '未知歌手' }}</p>
      </div>

      <ol v-else class="timeline-list">
        <li v-for="item in page.payload.latest_night_history" :key="item.year" class="timeline-item">
          <span class="timeline-year">{{ item.year }}</span>
          <div class="timeline-body">
            <strong>{{ item.latest_time }}</strong>
            <p>{{ item.track_title }} · {{ item.artist_display }}</p>
          </div>
        </li>
      </ol>
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
