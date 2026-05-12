<template>
  <ReportPageShell :page="page">
    <div class="song-ranking-page stats-layout stats-layout--compact">
      <div class="hero-copy hero-copy--compact">
        <p class="hero-tag">Song ranking</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">把这一年最常回放、也最稳定陪伴你的歌曲完整展开。</p>
      </div>

      <section class="ranking-panel ranking-panel--accent ranking-panel--compact">
        <header class="panel-header">
          <h3>年度歌曲榜</h3>
          <span>{{ songRanking.length }} 首歌曲</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="item in songRanking"
            :key="`${item.rank || 0}-${item.track_title}`"
            class="ranking-item"
          >
            <div class="artist-ranking-item-copy">
              <strong>{{ item.track_title || '未知歌曲' }}</strong>
              <small>
                {{ item.artist_display || '未知歌手' }}
                <template v-if="item.album_display"> · 《{{ item.album_display }}》</template>
              </small>
            </div>
            <span>{{ formatScore(item.score) }}</span>
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

// 年度歌曲榜统一读取 contract 里的 payload.song_ranking，页面层不再自行推导。
const songRanking = computed(() => props.page?.payload?.song_ranking || [])

function formatScore(score) {
  // 分数保留 3 位小数，便于在榜单里和年度歌曲主角页保持一致。
  return Number(score || 0).toFixed(3)
}
</script>
