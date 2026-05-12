<template>
  <ReportPageShell :page="page">
    <div class="stats-layout stats-layout--dense">
      <div class="hero-copy">
        <p class="hero-tag">Library growth</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">这一年新增了多少歌、多少歌手、多少专辑，都在这里一口气看完。</p>
      </div>

      <section class="metric-grid metric-grid--three metric-grid--compact-cards">
        <article class="metric-card metric-card--glass">
          <p class="metric-label">新增歌曲</p>
          <strong class="metric-value">{{ growthMetrics.new_track_total ?? 0 }}</strong>
        </article>
        <article class="metric-card metric-card--glass">
          <p class="metric-label">新增歌手</p>
          <strong class="metric-value">{{ growthMetrics.new_artist_total ?? 0 }}</strong>
        </article>
        <article class="metric-card metric-card--glass">
          <p class="metric-label">新增专辑</p>
          <strong class="metric-value">{{ growthMetrics.new_album_total ?? 0 }}</strong>
        </article>
      </section>

      <section class="ranking-panel">
        <header class="panel-header">
          <h3>月度新增趋势</h3>
          <span>{{ monthlyGrowth.length }} 个月</span>
        </header>
        <div class="library-mini-table">
          <div class="library-mini-table__header">
            <span>月份</span>
            <span>新增歌曲</span>
          </div>
          <div
            v-for="item in monthlyGrowth"
            :key="item.month"
            class="library-mini-table__row"
          >
            <div class="library-mini-table__copy">
              <strong>{{ item.month }} 月</strong>
              <small>歌手 {{ item.new_artist_total ?? 0 }} · 专辑 {{ item.new_album_total ?? 0 }}</small>
            </div>
            <span>{{ item.new_track_total ?? 0 }} 首</span>
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

const growthMetrics = computed(() => props.page?.payload?.growth_metrics || {})
const monthlyGrowth = computed(() => props.page?.payload?.monthly_growth || [])
</script>
