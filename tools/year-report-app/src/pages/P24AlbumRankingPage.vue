<template>
  <ReportPageShell :page="page">
    <div class="stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Album ranking</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">把这一年最常循环的专辑完整展开，看看哪些专辑真正陪你反复回放。</p>
      </div>

      <section class="ranking-panel">
        <header class="panel-header">
          <h3>年度最爱专辑榜</h3>
          <span>{{ albumRanking.length }} 张专辑</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="item in albumRanking"
            :key="`${item.rank || 0}-${item.album_display}`"
            class="ranking-item"
          >
            <div class="artist-ranking-item-copy">
              <strong>{{ item.album_display || '未知专辑' }}</strong>
              <small>{{ item.artist_display || '未知歌手' }} · {{ item.track_total ?? 0 }} 首歌</small>
            </div>
            <span>{{ item.play_total ?? 0 }} 次</span>
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

const albumRanking = computed(() => props.page?.payload?.album_ranking || [])
</script>
