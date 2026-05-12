<template>
  <ReportPageShell :page="page">
    <div class="song-ranking-page stats-layout stats-layout--compact">
      <div class="hero-copy hero-copy--compact">
        <p class="hero-tag">Song ranking</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">榜单仍按综合表现排序，但右侧数字直接展示这一年真实播放次数。</p>
      </div>

      <section class="ranking-panel ranking-panel--accent ranking-panel--compact">
        <header class="panel-header">
          <h3>年度歌曲榜</h3>
          <span>{{ songRanking.length }} 首歌曲</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="(item, index) in songRanking"
            :key="`${item.rank || 0}-${item.track_title}`"
            class="song-ranking-item artist-ranking-list-item ranking-item"
          >
            <div class="artist-ranking-item-main">
              <span class="artist-ranking-list-rank">#{{ item.rank || index + 1 }}</span>
              <div class="artist-ranking-item-copy">
                <strong>{{ item.track_title || '未知歌曲' }}</strong>
                <small>
                  {{ item.artist_display || '未知歌手' }}
                  <template v-if="item.album_display"> · 《{{ item.album_display }}》</template>
                </small>
              </div>
            </div>
            <span>{{ item.play_count ?? 0 }} 次</span>
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
</script>
