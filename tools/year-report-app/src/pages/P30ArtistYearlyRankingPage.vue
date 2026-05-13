<template>
  <ReportPageShell :page="page">
    <div class="yearly-artist-ranking-page stats-layout stats-layout--compact">
      <div class="hero-copy hero-copy--compact">
        <p class="hero-tag">Artist yearly ranking</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">每一年只留一位冠军歌手，顺着近十年的主线往回看。</p>
      </div>

      <section class="ranking-panel ranking-panel--compact ranking-panel--accent ranking-panel--stretch">
        <header class="panel-header">
          <h3>近十年年度冠军</h3>
          <span>{{ yearlyArtistRanking.length }} 年</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="(item, index) in yearlyArtistRanking"
            :key="`${item.year}-${item.artist_display}`"
            class="yearly-ranking-item ranking-item"
          >
            <div class="artist-ranking-item-main">
              <span class="artist-ranking-list-rank">{{ item.year }}</span>
              <div class="artist-ranking-item-copy">
                <strong>#{{ item.rank || index + 1 }} {{ item.artist_display || '未知歌手' }}</strong>
                <small class="artist-ranking-item-copy--wrap">代表作 {{ item.top_track_title || '未知歌曲' }}</small>
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

// 历年歌手榜已改成扁平的年度冠军列表，页面层只负责顺序渲染。
const yearlyArtistRanking = computed(() => props.page?.payload?.yearly_artist_ranking || [])
</script>
