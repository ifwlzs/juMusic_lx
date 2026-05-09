<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Library coverage</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">把曲库里最关键的元数据完成度与封面颜色识别结果，压成一页先看清楚。</p>
      </div>

      <section class="metric-grid metric-grid--two">
        <article
          v-for="item in coverageCards"
          :key="item.key"
          class="metric-card metric-card--glass"
        >
          <p class="metric-label">{{ item.label }}</p>
          <strong class="metric-value">{{ formatPercent(item.value) }}</strong>
          <p class="metric-caption">{{ item.caption }}</p>
        </article>
      </section>

      <section class="ranking-panel ranking-panel--accent">
        <header class="panel-header">
          <h3>封面颜色</h3>
          <span>已识别 {{ countedTrackTotal }} 首</span>
        </header>
        <div class="hero-fact-row" style="justify-content: flex-start;">
          <span class="hero-fact-chip">已识别 {{ countedTrackTotal }} 首</span>
          <span class="hero-fact-chip">缺失 {{ excludedTrackTotal }} 首</span>
        </div>
        <ol class="ranking-list">
          <li
            v-for="item in topColors"
            :key="`${item.color_hex}-${item.tone_label}`"
            class="ranking-item"
          >
            <div class="artist-ranking-item-copy">
              <strong>{{ item.tone_label || item.color_hex || '未命名色' }}</strong>
              <small>{{ buildColorDescription(item) }}</small>
            </div>
            <span>{{ buildColorShare(item) }}</span>
          </li>
        </ol>
      </section>
    </div>
  </ReportPageShell>
</template>

<script setup>
import { computed } from 'vue'
import ReportPageShell from '@/components/ReportPageShell.vue'

const props = defineProps({
  page: {
    type: Object,
    required: true,
  },
})

const coverage = computed(() => props.page?.payload?.coverage || {})
const colorSummary = computed(() => props.page?.payload?.cover_color_summary || {})

// 指标只保留页面最关心的四项，确保一屏内能稳定读完。
const coverageCards = computed(() => [
  {
    key: 'lyrics_ratio',
    label: '歌词覆盖',
    value: coverage.value.lyrics_ratio,
    caption: '已补歌词歌曲占比',
  },
  {
    key: 'cover_ratio',
    label: '封面覆盖',
    value: coverage.value.cover_ratio,
    caption: '已有封面素材占比',
  },
  {
    key: 'genre_ratio',
    label: '曲风覆盖',
    value: coverage.value.genre_ratio,
    caption: '已识别曲风歌曲占比',
  },
  {
    key: 'album_ratio',
    label: '专辑覆盖',
    value: coverage.value.album_ratio,
    caption: '已补专辑信息占比',
  },
])

const countedTrackTotal = computed(() => Number(colorSummary.value.counted_track_total || 0))
const excludedTrackTotal = computed(() => Number(colorSummary.value.excluded_track_total || 0))
const treemapTotal = computed(() => {
  const explicitTotal = Number(colorSummary.value.treemap_total || 0)
  if (explicitTotal > 0) {
    return explicitTotal
  }
  return countedTrackTotal.value
})
const topColors = computed(() => (Array.isArray(colorSummary.value.top_colors) ? colorSummary.value.top_colors : []).slice(0, 3))

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}

function buildColorShare(item) {
  const shareRatio = Number(item?.share_ratio || 0)
  if (shareRatio > 0) {
    return `${(shareRatio * 100).toFixed(1)}%`
  }
  const total = Math.max(treemapTotal.value, 1)
  return `${((Number(item?.track_count || 0) / total) * 100).toFixed(1)}%`
}

function buildColorDescription(item) {
  if (item?.is_other_bucket) {
    return '未进入主展示色块的其余颜色'
  }
  return `${item?.representative_track_title || '代表封面'} · ${Number(item?.track_count || 0)} 首`
}
</script>
