<template>
  <ReportPageShell :page="page">
    <div class="stats-layout stats-layout--dense">
      <div class="hero-copy">
        <p class="hero-tag">Library structure</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">从语种到曲风，把你的歌曲库结构拆成几个最容易看懂的切面。</p>
      </div>

      <div class="library-panel-grid library-panel-grid--halves">
        <section class="ranking-panel">
          <header class="panel-header">
            <h3>语种分布</h3>
            <span>{{ languageDistribution.length }} 种语种</span>
          </header>
          <div class="library-mini-table library-mini-table--tight">
            <div class="library-mini-table__header">
              <span>语种</span>
              <span>歌曲数</span>
            </div>
            <div
              v-for="item in topLanguageDistribution"
              :key="item.language_name"
              class="library-mini-table__row"
            >
              <div class="library-mini-table__copy">
                <strong>{{ item.language_name || '未知语种' }}</strong>
                <small>占曲库 {{ formatLanguageShare(item.track_count) }}</small>
              </div>
              <span>{{ item.track_count ?? 0 }} 首</span>
            </div>
          </div>
        </section>

        <section class="ranking-panel ranking-panel--accent">
          <header class="panel-header">
            <h3>加权曲风 Top</h3>
            <span>{{ weightedGenreDistribution.length }} 项</span>
          </header>
          <div class="library-mini-table library-mini-table--tight">
            <div class="library-mini-table__header">
              <span>曲风</span>
              <span>加权值</span>
            </div>
            <div
              v-for="item in topWeightedGenreDistribution"
              :key="item.genre_name"
              class="library-mini-table__row"
            >
              <div class="library-mini-table__copy">
                <strong>{{ resolveGenreLabel(item) }}</strong>
                <small>曲库主线</small>
              </div>
              <span>{{ formatWeightedValue(item.weighted_track_count ?? item.weighted_play_total) }}</span>
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

const languageDistribution = computed(() => props.page?.payload?.language_distribution || [])
const weightedGenreDistribution = computed(() => props.page?.payload?.weighted_genre_distribution || [])
const topLanguageDistribution = computed(() => languageDistribution.value.slice(0, 4))
const topWeightedGenreDistribution = computed(() => weightedGenreDistribution.value.slice(0, 4))
const languageTrackTotal = computed(() => languageDistribution.value.reduce((total, item) => total + Number(item?.track_count || 0), 0))

function formatWeightedValue(value) {
  return Number(value || 0).toFixed(1)
}

function formatLanguageShare(trackCount) {
  const total = Math.max(languageTrackTotal.value, 1)
  return `${((Number(trackCount || 0) / total) * 100).toFixed(1)}%`
}

function resolveGenreLabel(item) {
  // 前端再兜底一次，避免旧 contract 未更新时把英文内部路径直接暴露给用户。
  const explicitLabel = item?.genre_name_zh
  if (explicitLabel && !String(explicitLabel).includes('---')) {
    return explicitLabel
  }
  const rawName = String(item?.genre_name || '').trim()
  if (!rawName) {
    return '未知曲风'
  }
  const genreFallbackMap = {
    'Electronic---Synth-pop': '电子 / 合成器流行',
    'Electronic---House': '电子 / 浩室',
    'Electronic---Electro': '电子 / Electro',
    'Electronic---Tropical House': '电子 / Tropical House',
    'Electronic---Electro House': '电子 / Electro House',
    'Electronic---Downtempo': '电子 / Downtempo',
    'Electronic---Ambient': '电子 / Ambient',
  }
  if (genreFallbackMap[rawName]) {
    return genreFallbackMap[rawName]
  }
  if (rawName.includes('---')) {
    const fallback = rawName.split('---').pop() || rawName
    return fallback.replace(/-/g, ' / ')
  }
  return rawName
}
</script>
