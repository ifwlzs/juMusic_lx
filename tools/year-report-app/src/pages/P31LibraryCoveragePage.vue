<template>
  <ReportPageShell :page="page">
    <div class="stats-layout stats-layout--dense">
      <div class="hero-copy">
        <p class="hero-tag">Library coverage</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">把曲库里最关键的元数据完成度与封面颜色识别结果，压成一页先看清楚。</p>
      </div>

      <section class="coverage-compact-grid">
        <article
          v-for="item in coverageCards"
          :key="item.key"
          class="coverage-compact-chip"
        >
          <p class="coverage-compact-chip__label">{{ item.label }}</p>
          <strong class="coverage-compact-chip__value">{{ formatPercent(item.value) }}</strong>
          <p class="coverage-compact-chip__caption">{{ item.caption }}</p>
        </article>
      </section>

      <div class="library-panel-grid library-panel-grid--single-column">
        <section class="ranking-panel library-panel-grid__full">
          <header class="panel-header">
            <h3>播放来源 / 设备</h3>
            <span>{{ systemDistribution.length + deviceDistribution.length }} 项</span>
          </header>
          <div class="library-split-panel">
            <div class="library-subpanel">
              <p class="library-subpanel__title">来源</p>
              <div class="library-mini-table library-mini-table--tight">
                <div class="library-mini-table__header">
                  <span>来源</span>
                  <span>占比</span>
                </div>
                <div
                  v-for="item in systemDistribution"
                  :key="`system-${item.bucket_key}`"
                  class="library-mini-table__row"
                >
                  <div class="library-mini-table__copy">
                    <strong>{{ item.bucket_label }}</strong>
                    <small>{{ item.play_count }} 次播放</small>
                  </div>
                  <span>{{ formatPercent(item.ratio) }}</span>
                </div>
              </div>
            </div>

            <div class="library-subpanel">
              <p class="library-subpanel__title">设备</p>
              <div class="library-mini-table library-mini-table--tight">
                <div class="library-mini-table__header">
                  <span>设备</span>
                  <span>占比</span>
                </div>
                <div
                  v-for="item in deviceDistribution"
                  :key="`device-${item.bucket_key}`"
                  class="library-mini-table__row"
                >
                  <div class="library-mini-table__copy">
                    <strong>{{ item.bucket_label }}</strong>
                    <small>{{ item.play_count }} 次播放</small>
                  </div>
                  <span>{{ formatPercent(item.ratio) }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="ranking-panel ranking-panel--accent library-panel-grid__full">
          <header class="panel-header">
            <h3>封面颜色</h3>
            <span>已识别 {{ countedTrackTotal }} 首</span>
          </header>
          <div class="hero-fact-row hero-fact-row--tight hero-fact-row--left">
            <span class="hero-fact-chip">已识别 {{ countedTrackTotal }} 首</span>
            <span class="hero-fact-chip">缺失 {{ excludedTrackTotal }} 首</span>
          </div>
          <div class="coverage-compact-grid coverage-compact-grid--three">
            <article
              v-for="item in topColors"
              :key="`${item.color_hex}-${item.tone_label}`"
              class="coverage-compact-chip coverage-compact-chip--color"
            >
              <p class="coverage-compact-chip__label">{{ item.tone_label || item.color_hex || '未命名色' }}</p>
              <strong class="coverage-compact-chip__value">{{ buildColorShare(item) }}</strong>
              <p class="coverage-compact-chip__caption">{{ buildColorDescription(item) }}</p>
            </article>
          </div>
        </section>
      </div>
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
const sourceDistribution = computed(() => props.page?.payload?.source_distribution || {})

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
// 这一页只保留最能代表听歌足迹的前两项，避免桥页再被长设备名挤爆。
const systemDistribution = computed(() => (Array.isArray(sourceDistribution.value.system_distribution) ? sourceDistribution.value.system_distribution : []).slice(0, 2))
const deviceDistribution = computed(() => (Array.isArray(sourceDistribution.value.device_distribution) ? sourceDistribution.value.device_distribution : []).slice(0, 2))

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
