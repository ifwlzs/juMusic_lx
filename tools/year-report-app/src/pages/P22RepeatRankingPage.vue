<template>
  <ReportPageShell :page="page">
    <div class="repeat-ranking-page stats-layout stats-layout--compact">
      <div class="hero-copy hero-copy--compact">
        <p class="hero-tag">Repeat ranking</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">这些歌不是单纯听得多，而是在真正点开它的那些天里，你会一天反复听很多次。</p>
      </div>

      <section class="ranking-panel ranking-panel--accent ranking-panel--compact ranking-panel--stretch">
        <header class="panel-header">
          <h3>循环强度榜</h3>
          <span>{{ repeatRanking.length }} 首歌曲</span>
        </header>
        <ol class="ranking-list">
          <li
            v-for="(item, index) in repeatRanking"
            :key="`${item.rank || 0}-${item.track_title}`"
            class="repeat-ranking-item artist-ranking-list-item ranking-item"
          >
            <div class="artist-ranking-item-main">
              <span class="artist-ranking-list-rank">#{{ item.rank || index + 1 }}</span>
              <div class="artist-ranking-item-copy">
                <strong>{{ item.track_title || '未知歌曲' }}</strong>
                <small class="artist-ranking-item-copy--wrap">
                  {{ item.artist_display || '未知歌手' }}
                  · {{ item.play_count || 0 }} 次 / {{ item.active_days || 0 }} 天
                </small>
              </div>
            </div>
            <span>{{ formatRepeatIndex(item.repeat_index) }}</span>
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

// P22 直接消费 contract 的 repeat_ranking，避免前端再次推导“循环强度”口径。
const repeatRanking = computed(() => props.page?.payload?.repeat_ranking || [])

function formatRepeatIndex(value) {
  // 循环强度统一保留 2 位小数，方便横向比较。
  return Number(value || 0).toFixed(2)
}
</script>
