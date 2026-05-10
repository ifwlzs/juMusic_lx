<template>
  <ReportPageShell :page="page">
    <div class="artist-hero-journey-page hero-layout hero-layout--centered">
      <div class="hero-copy hero-copy--editorial">
        <span class="hero-tag hero-tag-pill">Artist ranking</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-highlight">{{ topArtist?.artist_display || '暂无年度歌手' }}</p>
        <p class="hero-subtitle">这位歌手是你今年最稳定的陪伴对象，后面的榜单则是整年歌手排序缩影。</p>
      </div>

      <div class="hero-fact-row" v-if="topArtist">
        <span class="hero-fact-chip">播放 {{ topArtist.play_total || 0 }}</span>
        <span class="hero-fact-chip">歌曲 {{ topArtist.track_total || 0 }} 首</span>
        <span class="hero-fact-chip">代表作 {{ topArtist.top_track_title || '—' }}</span>
      </div>

      <section class="ranking-panel">
        <header class="panel-header">
          <h3>紧随其后</h3>
          <span>{{ trailingArtists.length }} 位歌手</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="item in trailingArtists"
            :key="`${item.rank || 0}-${item.artist_display}`"
            class="ranking-item"
          >
            <div class="artist-ranking-item-copy">
              <strong>{{ item.artist_display || '未知歌手' }}</strong>
              <small>代表作 {{ item.top_track_title || '未知歌曲' }}</small>
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

// 冠军歌手单独作为主角展示，其余名次压成精简榜单，避免和 P29 重复。
const artistRanking = computed(() => props.page?.payload?.artist_ranking || [])
const topArtist = computed(() => artistRanking.value[0] || null)
const trailingArtists = computed(() => artistRanking.value.slice(1, 3))
</script>
