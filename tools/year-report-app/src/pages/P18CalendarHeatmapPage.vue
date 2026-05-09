<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Calendar heatmap</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">按月份横向铺开、按周几纵向落点，把全年听歌活跃度直接摊成 GitHub 式热力图。</p>
      </div>

      <div class="hero-fact-row">
        <span class="hero-fact-chip">活跃 {{ page.payload.active_day_total || 0 }} 天</span>
        <span class="hero-fact-chip">最长连续 {{ page.payload.longest_streak_day_total || 0 }} 天</span>
      </div>

      <div class="calendar-heatmap">
        <div class="calendar-heatmap-header">
          <span
            v-for="item in page.payload.month_labels || []"
            :key="`${item.label}-${item.week_index}`"
            class="calendar-month-label"
            :style="{ gridColumn: `${Number(item.week_index || 0) + 1}` }"
          >
            {{ item.label }}
          </span>
        </div>

        <div class="calendar-heatmap-body">
          <div class="calendar-weekday-axis">
            <span
              v-for="label in page.payload.weekday_labels || []"
              :key="label"
              class="calendar-weekday-label"
            >
              {{ label }}
            </span>
          </div>

          <div
            class="calendar-heatmap-grid"
            :style="{ gridTemplateColumns: `repeat(${Math.max((page.payload.heatmap_columns || []).length, 1)}, minmax(0, 1fr))` }"
          >
            <div
              v-for="column in page.payload.heatmap_columns || []"
              :key="column.week_index"
              class="calendar-heatmap-column"
            >
              <span
                v-for="item in column.cells || []"
                :key="item.date"
                class="calendar-heatmap-cell"
                :class="`calendar-heatmap-cell--${item.intensity || 0}`"
                :title="`${item.date} · ${item.play_total}`"
              ></span>
            </div>
          </div>
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
