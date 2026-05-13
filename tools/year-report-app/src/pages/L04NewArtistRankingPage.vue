<template>
  <ReportPageShell :page="page">
    <div class="artist-ranking-page artist-ranking-page--compact hero-layout hero-layout--compact">
      <div class="hero-copy hero-copy--editorial hero-copy--compact">
        <span class="hero-tag hero-tag-pill">New artist ranking</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">今年扩坑最多的 10 位歌手</p>
      </div>

      <section v-if="topTenRanking.length" class="artist-ranking-list-card artist-ranking-list-card--compact ranking-panel ranking-panel--compact ranking-panel--stretch">
        <header class="panel-header">
          <h3>Top 1 - Top 10</h3>
          <span>{{ topTenRanking.length }} 位歌手</span>
        </header>
        <ol class="ranking-list artist-ranking-list">
          <li
            v-for="(item, index) in topTenRanking"
            :key="`new-${item.artist_display || index}`"
            :class="['artist-ranking-list-item', 'ranking-item', { 'artist-ranking-list-item--top': index === 0 }]"
          >
            <div class="artist-ranking-item-main">
              <span class="artist-ranking-list-rank">#{{ item.rank || index + 1 }}</span>
              <div class="artist-ranking-item-copy">
                <strong>{{ item.artist_display || '未知歌手' }}</strong>
                <small>
                  新增专辑 {{ item.new_album_total ?? 0 }} 张
                  <template v-if="item.highlight_tag"> · {{ item.highlight_tag }}</template>
                </small>
              </div>
            </div>
            <span>{{ formatMetric(item) }}</span>
          </li>
        </ol>
      </section>
      <section v-else class="artist-ranking-list-card story-card story-card--focus">
        <strong>榜单暂未生成</strong>
        <p>等年度新增歌手统计补齐后，这里会出现你的年度新增 Top10 榜单。</p>
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

// 统一从 page.payload.ranking 读取数据，并在页面层保证最多只展示 10 条。
const topTenRanking = computed(() => {
  const ranking = Array.isArray(props.page?.payload?.ranking) ? props.page.payload.ranking : []
  return ranking.slice(0, 10)
})

function formatMetric(item) {
  // 兼容当前样例与后续真实数据：优先使用显式文案，再回退到新增字段。
  if (item?.metric_label && item?.new_track_total != null) {
    return `${item.new_track_total} ${item.metric_label}`
  }

  if (item?.new_track_total != null) {
    return `${item.new_track_total} 首新增`
  }

  if (item?.metric_label && item?.metric_value != null) {
    return `${item.metric_value} ${item.metric_label}`
  }

  return '暂无统计'
}
</script>
