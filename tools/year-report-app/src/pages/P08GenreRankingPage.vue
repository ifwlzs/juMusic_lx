<template>
  <ReportPageShell :page="page">
    <div class="artist-ranking-page">
      <div class="hero-copy">
        <p class="hero-tag">Genre ranking</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">冠军曲风放大，其余四种口味用紧凑的榜单接住。</p>
      </div>

      <section v-if="page.payload.genre_ranking?.length" class="artist-ranking-hero story-card story-card--focus">
        <div class="artist-ranking-hero-meta">
          <span class="artist-ranking-rank-pill">Top 1</span>
          <span class="artist-ranking-hero-value">{{ page.payload.genre_ranking[0].weighted_track_count }} 加权首歌</span>
        </div>
        <strong class="artist-ranking-hero-name">{{ resolveGenreLabel(page.payload.genre_ranking[0]) }}</strong>
        <p class="artist-ranking-hero-note">识别到 {{ page.payload.genre_ranking[0].track_count }} 首相关歌曲</p>
      </section>

      <section class="artist-ranking-list-card ranking-panel">
        <ol class="artist-ranking-list">
          <li
            v-for="(item, index) in page.payload.genre_ranking?.slice(1) || []"
            :key="item.genre_name"
            class="ranking-item artist-ranking-list-item"
          >
            <div class="artist-ranking-item-main">
              <span class="artist-ranking-list-rank">#{{ index + 2 }}</span>
              <div class="artist-ranking-item-copy">
                <strong>{{ resolveGenreLabel(item) }}</strong>
                <small>{{ item.track_count }} 首歌 · {{ item.weighted_track_count }} 加权</small>
              </div>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </ReportPageShell>
</template>

<script setup>
import ReportPageShell from '@/components/ReportPageShell.vue'

defineProps({
  page: {
    type: Object,
    required: true,
  },
})

function resolveGenreLabel(item) {
  if (item?.genre_name_zh) {
    return item.genre_name_zh
  }
  if (item?.genre_name) {
    return item.genre_name
  }
  return '未知曲风'
}
</script>
