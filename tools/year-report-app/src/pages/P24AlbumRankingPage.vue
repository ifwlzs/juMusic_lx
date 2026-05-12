<template>
  <ReportPageShell :page="page">
    <div class="stats-layout stats-layout--dense">
      <div class="hero-copy hero-copy--compact">
        <p class="hero-tag">Album ranking</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">把这一年最常循环的专辑压成紧凑榜单，看看哪些专辑真正陪你反复回放。</p>
      </div>

      <section class="ranking-panel ranking-panel--compact">
        <header class="panel-header">
          <h3>年度最爱专辑榜</h3>
          <span>{{ albumRanking.length }} 张专辑</span>
        </header>
        <div class="library-mini-table library-mini-table--ranked">
          <div
            v-for="(item, index) in albumRanking"
            :key="`${item.rank || 0}-${item.album_display}`"
            class="library-mini-table__row library-mini-table__row--ranked ranking-item"
          >
            <div class="library-mini-table__copy">
              <div class="library-mini-table__meta">
                <span class="artist-ranking-list-rank library-mini-table__rank">#{{ item.rank || index + 1 }}</span>
                <strong>{{ item.album_display || '未知专辑' }}</strong>
              </div>
              <small class="artist-ranking-item-copy--wrap">{{ item.artist_display || '未知歌手' }} · {{ item.track_total ?? 0 }} 首歌</small>
            </div>
            <span>{{ item.play_total ?? 0 }} 次</span>
          </div>
        </div>
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
