<template>
  <ReportPageShell :page="page">
    <div class="stats-layout stats-layout--dense">
      <div class="hero-copy">
        <p class="hero-tag">Library overview</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">先把曲库规模与今年新增量收束成几组数字，再顺手看一眼基础覆盖率。</p>
      </div>

      <section class="coverage-compact-grid coverage-compact-grid--overview">
        <article
          v-for="item in overviewCards"
          :key="item.key"
          class="coverage-compact-chip"
        >
          <p class="coverage-compact-chip__label">{{ item.label }}</p>
          <strong class="coverage-compact-chip__value">{{ item.value }}</strong>
          <p class="coverage-compact-chip__caption">{{ item.caption }}</p>
        </article>
      </section>

      <div class="library-panel-grid library-panel-grid--single-column">
        <section class="ranking-panel ranking-panel--stretch library-panel-grid__full">
          <header class="panel-header">
            <h3>覆盖率与播放足迹</h3>
            <span>{{ coverageRows.length + footprintRows.length }} 项</span>
          </header>
          <div class="library-split-panel">
            <div class="library-subpanel">
              <p class="library-subpanel__title">覆盖率摘要</p>
              <div class="coverage-compact-grid coverage-compact-grid--nested">
                <article
                  v-for="item in coverageRows"
                  :key="item.key"
                  class="coverage-compact-chip coverage-compact-chip--nested"
                >
                  <p class="coverage-compact-chip__label">{{ item.label }}</p>
                  <strong class="coverage-compact-chip__value">{{ formatPercent(item.value) }}</strong>
                  <p class="coverage-compact-chip__caption">{{ item.caption }}</p>
                </article>
              </div>
            </div>

            <div class="library-subpanel">
              <p class="library-subpanel__title">播放来源 / 端点</p>
              <div class="library-mini-table library-mini-table--tight">
                <div class="library-mini-table__header">
                  <span>端点</span>
                  <span>占比</span>
                </div>
                <div
                  v-for="item in footprintRows"
                  :key="`${item.group}-${item.bucket_key}`"
                  class="library-mini-table__row"
                >
                  <div class="library-mini-table__copy">
                    <strong>{{ item.bucket_label }}</strong>
                    <small>{{ item.groupLabel }} · {{ item.play_count }} 次</small>
                  </div>
                  <span>{{ formatPercent(item.ratio) }}</span>
                </div>
              </div>
            </div>
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

const metrics = computed(() => props.page?.payload?.metrics || {})
const coverage = computed(() => props.page?.payload?.coverage || {})
const sourceDistribution = computed(() => props.page?.payload?.source_distribution || {})

// 曲库首页优先展示规模与新增，但把强相关指标合并，避免一屏塞满六张卡。
const overviewCards = computed(() => [
  {
    key: 'track_total',
    label: '歌曲总量',
    value: Number(metrics.value.track_total || 0),
    caption: '当前曲库歌曲',
  },
  {
    key: 'artist_album_total',
    label: '歌手 / 专辑',
    value: `${Number(metrics.value.artist_total || 0)} / ${Number(metrics.value.album_total || 0)}`,
    caption: '累计收录歌手 / 专辑',
  },
  {
    key: 'new_track_total',
    label: '新增歌曲',
    value: Number(metrics.value.new_track_total || 0),
    caption: '本年新增歌曲',
  },
  {
    key: 'new_artist_album_total',
    label: '新增歌手 / 专辑',
    value: `${Number(metrics.value.new_artist_total || 0)} / ${Number(metrics.value.new_album_total || 0)}`,
    caption: '本年新增歌手 / 专辑',
  },
])

const coverageRows = computed(() => [
  {
    key: 'cover_ratio',
    label: '封面覆盖',
    value: coverage.value.cover_ratio,
    caption: '已有封面素材的歌曲占比',
  },
  {
    key: 'lyrics_ratio',
    label: '歌词覆盖',
    value: coverage.value.lyrics_ratio,
    caption: '已有歌词的歌曲占比',
  },
  {
    key: 'genre_ratio',
    label: '曲风覆盖',
    value: coverage.value.genre_ratio,
    caption: '已识别曲风的歌曲占比',
  },
  {
    key: 'album_ratio',
    label: '专辑覆盖',
    value: coverage.value.album_ratio,
    caption: '已补专辑信息的歌曲占比',
  },
])

const systemRows = computed(() => (Array.isArray(sourceDistribution.value.system_distribution) ? sourceDistribution.value.system_distribution : []).slice(0, 2))
const clientRows = computed(() => (Array.isArray(sourceDistribution.value.client_distribution) ? sourceDistribution.value.client_distribution : []).slice(0, 2))
const deviceRows = computed(() => (Array.isArray(sourceDistribution.value.device_distribution) ? sourceDistribution.value.device_distribution : []).slice(0, 2))
const footprintRows = computed(() => {
  const systemLabels = new Set(systemRows.value.map((item) => String(item?.bucket_label || '').trim()).filter(Boolean))
  const dedupedClients = clientRows.value.filter((item) => !systemLabels.has(String(item?.bucket_label || '').trim()))
  return [
    ...systemRows.value.map((item) => ({ ...item, group: 'system', groupLabel: '来源' })),
    ...dedupedClients.map((item) => ({ ...item, group: 'client', groupLabel: '客户端' })),
    ...deviceRows.value.map((item) => ({ ...item, group: 'device', groupLabel: '设备' })),
  ].slice(0, 5)
})

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}
</script>
