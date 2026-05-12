<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Library overview</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">先把曲库规模与今年新增量收束成几组数字，再顺手看一眼基础覆盖率。</p>
      </div>

      <section class="metric-grid metric-grid--three">
        <article
          v-for="item in overviewCards"
          :key="item.key"
          class="metric-card metric-card--glass"
        >
          <p class="metric-label">{{ item.label }}</p>
          <strong class="metric-value">{{ item.value }}</strong>
          <p class="metric-caption">{{ item.caption }}</p>
        </article>
      </section>

      <section class="ranking-panel">
        <header class="panel-header">
          <h3>覆盖率摘要</h3>
          <span>{{ coverageRows.length }} 项指标</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="item in coverageRows"
            :key="item.key"
            class="ranking-item"
          >
            <div class="artist-ranking-item-copy">
              <strong>{{ item.label }}</strong>
              <small>{{ item.caption }}</small>
            </div>
            <span>{{ formatPercent(item.value) }}</span>
          </li>
        </ol>
      </section>

      <section class="ranking-panel ranking-panel--accent">
        <header class="panel-header">
          <h3>播放来源摘要</h3>
          <span>{{ systemRows.length }} 个来源</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="item in systemRows"
            :key="`overview-system-${item.bucket_key}`"
            class="ranking-item"
          >
            <div class="artist-ranking-item-copy">
              <strong>{{ item.bucket_label }}</strong>
              <small>{{ item.play_count }} 次播放</small>
            </div>
            <span>{{ formatPercent(item.ratio) }}</span>
          </li>
        </ol>
      </section>

      <section class="ranking-panel">
        <header class="panel-header">
          <h3>客户端 / 设备</h3>
          <span>{{ clientRows.length + deviceRows.length }} 项</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="item in combinedEndpointRows"
            :key="`${item.group}-${item.bucket_key}`"
            class="ranking-item"
          >
            <div class="artist-ranking-item-copy">
              <strong>{{ item.bucket_label }}</strong>
              <small>{{ item.groupLabel }} · {{ item.play_count }} 次</small>
            </div>
            <span>{{ formatPercent(item.ratio) }}</span>
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

const metrics = computed(() => props.page?.payload?.metrics || {})
const coverage = computed(() => props.page?.payload?.coverage || {})
const sourceDistribution = computed(() => props.page?.payload?.source_distribution || {})

// 曲库首页优先展示规模与新增，避免第一页就塞太多覆盖率细项。
const overviewCards = computed(() => [
  {
    key: 'track_total',
    label: '歌曲总量',
    value: Number(metrics.value.track_total || 0),
    caption: '当前曲库歌曲',
  },
  {
    key: 'artist_total',
    label: '歌手总量',
    value: Number(metrics.value.artist_total || 0),
    caption: '累计收录歌手',
  },
  {
    key: 'album_total',
    label: '专辑总量',
    value: Number(metrics.value.album_total || 0),
    caption: '累计收录专辑',
  },
  {
    key: 'new_track_total',
    label: '新增歌曲',
    value: Number(metrics.value.new_track_total || 0),
    caption: '本年新增歌曲',
  },
  {
    key: 'new_artist_total',
    label: '新增歌手',
    value: Number(metrics.value.new_artist_total || 0),
    caption: '本年新增歌手',
  },
  {
    key: 'new_album_total',
    label: '新增专辑',
    value: Number(metrics.value.new_album_total || 0),
    caption: '本年新增专辑',
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

const systemRows = computed(() => (Array.isArray(sourceDistribution.value.system_distribution) ? sourceDistribution.value.system_distribution : []).slice(0, 3))
const clientRows = computed(() => (Array.isArray(sourceDistribution.value.client_distribution) ? sourceDistribution.value.client_distribution : []).slice(0, 2))
const deviceRows = computed(() => (Array.isArray(sourceDistribution.value.device_distribution) ? sourceDistribution.value.device_distribution : []).slice(0, 2))
const combinedEndpointRows = computed(() => ([
  ...clientRows.value.map((item) => ({ ...item, group: 'client', groupLabel: '客户端' })),
  ...deviceRows.value.map((item) => ({ ...item, group: 'device', groupLabel: '设备' })),
]).slice(0, 4))

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}
</script>
