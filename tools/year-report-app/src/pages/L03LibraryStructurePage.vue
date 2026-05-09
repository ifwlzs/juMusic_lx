<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Library structure</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">从语种到曲风，把你的歌曲库结构拆成几个最容易看懂的切面。</p>
      </div>

      <section class="ranking-panel">
        <header class="panel-header">
          <h3>语种分布</h3>
          <span>{{ languageDistribution.length }} 种语种</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="item in languageDistribution"
            :key="item.language_name"
            class="ranking-item"
          >
            <strong>{{ item.language_name || '未知语种' }}</strong>
            <span>{{ item.track_count ?? 0 }} 首</span>
          </li>
        </ol>
      </section>

      <section class="ranking-panel ranking-panel--accent">
        <header class="panel-header">
          <h3>加权曲风 Top5</h3>
          <span>{{ weightedGenreDistribution.length }} 项</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="item in weightedGenreDistribution.slice(0, 5)"
            :key="item.genre_name"
            class="ranking-item"
          >
            <div class="artist-ranking-item-copy">
              <strong>{{ item.genre_name_zh || item.genre_name || '未知曲风' }}</strong>
              <small>主曲风播放 {{ item.primary_play_total ?? 0 }}</small>
            </div>
            <span>{{ item.weighted_track_count ?? item.weighted_play_total ?? 0 }}</span>
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

const languageDistribution = computed(() => props.page?.payload?.language_distribution || [])
const weightedGenreDistribution = computed(() => props.page?.payload?.weighted_genre_distribution || [])
</script>
