<template>
  <ReportPageShell :page="page">
    <div class="artist-ranking-page artist-ranking-page--compact hero-layout hero-layout--compact">
      <div class="hero-copy hero-copy--editorial hero-copy--compact">
        <span class="hero-tag hero-tag-pill">Artist ranking detail</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">把这一年最常回到的歌手榜单明细完整展开。</p>
      </div>

      <section class="artist-ranking-list-card artist-ranking-list-card--compact ranking-panel ranking-panel--accent ranking-panel--compact ranking-panel--stretch">
        <header class="panel-header">
          <h3>Top artist ranking</h3>
          <span>{{ artistRanking.length }} 位歌手</span>
        </header>
        <ol class="ranking-list artist-ranking-list">
          <li
            v-for="(item, index) in artistRanking"
            :key="`${item.rank || index + 1}-${item.artist_display}`"
            class="artist-ranking-list-item ranking-item"
          >
            <div class="artist-ranking-item-main">
              <span class="artist-ranking-list-rank">#{{ item.rank || index + 1 }}</span>
              <div class="artist-ranking-item-copy">
                <strong>{{ item.artist_display || '未知歌手' }}</strong>
                <small class="artist-ranking-item-copy--wrap">代表作 {{ item.top_track_title || '未知歌曲' }} · 歌曲 {{ item.track_total || 0 }} 首</small>
              </div>
            </div>
            <span>{{ item.play_total || 0 }} 次</span>
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

// P29 是完整榜单页，因此不再截断冠军，直接把 contract 里的顺序原样渲染。
const artistRanking = computed(() => props.page?.payload?.artist_ranking || [])
</script>
