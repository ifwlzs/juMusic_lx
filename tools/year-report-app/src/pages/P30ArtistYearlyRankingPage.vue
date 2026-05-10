<template>
  <ReportPageShell :page="page">
    <div class="yearly-artist-ranking-page stats-layout">
      <div class="hero-copy">
        <p class="hero-tag">Artist yearly ranking</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">按年份回看历年的歌手冠军与前列榜单，看看主线是怎么形成的。</p>
      </div>

      <section
        v-for="group in yearlyArtistRanking"
        :key="group.year"
        class="yearly-ranking-group ranking-panel"
      >
        <header class="panel-header">
          <h3>{{ group.year }} 年</h3>
          <span>{{ (group.ranking || []).length }} 位歌手</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="item in group.ranking || []"
            :key="`${group.year}-${item.rank || 0}-${item.artist_display}`"
            class="ranking-item"
          >
            <div class="artist-ranking-item-copy">
              <strong>#{{ item.rank || 0 }} {{ item.artist_display || '未知歌手' }}</strong>
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

// 历年歌手榜按年份分组输出，页面层只负责顺序渲染，不再额外改写排序。
const yearlyArtistRanking = computed(() => props.page?.payload?.yearly_artist_ranking || [])
</script>
