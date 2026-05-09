<template>
  <ReportPageShell :page="page">
    <div class="hero-layout">
      <div class="hero-copy">
        <p class="hero-tag">Cover colors</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">把你这一年最常看到的封面颜色，收成一块块更直观的色彩版图。</p>
      </div>

      <div class="hero-fact-row">
        <span class="hero-fact-chip">已统计 {{ page.payload.cover_color_summary?.counted_track_total || 0 }} 首</span>
        <span class="hero-fact-chip">缺失 {{ page.payload.cover_color_summary?.excluded_track_total || 0 }} 首</span>
      </div>

      <div class="cover-color-treemap cover-color-treemap--compact">
        <div
          ref="chartRef"
          class="cover-color-treemap-chart cover-color-treemap-chart--bounded"
          data-testid="p11-treemap-chart"
          aria-label="年度封面主色矩形树图"
        ></div>

        <div class="cover-color-legend">
          <article
            v-for="item in topColorItems"
            :key="item.color_hex"
            class="cover-color-legend-item"
          >
            <span
              class="cover-color-legend-swatch"
              :style="{ backgroundColor: item.color_hex || '#d9deef' }"
            ></span>
            <div class="cover-color-legend-copy">
              <div class="cover-color-legend-heading">
                <strong>{{ item.tone_label || '色块' }}</strong>
                <span>{{ buildShareLabel(item) }}</span>
              </div>
              <p
                class="cover-color-legend-track cover-color-legend-track--truncate"
                :title="buildRepresentativeLabel(item)"
              >
                {{ buildRepresentativeLabel(item) }}
              </p>
            </div>
          </article>
        </div>
      </div>
    </div>
  </ReportPageShell>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import ReportPageShell from '@/components/ReportPageShell.vue'

const props = defineProps({
  page: {
    type: Object,
    required: true,
  },
})

const chartRef = ref(null)
let chartInstance = null

const topColorItems = computed(() => {
  const items = props.page.payload.cover_color_summary?.top_colors || []
  // 控制在 5 个主色内，既能保留信息，也能避免真实长文案把整页压爆。
  return items.slice(0, 5)
})

const treemapTotal = computed(() => {
  const explicitTotal = Number(props.page.payload.cover_color_summary?.treemap_total || 0)
  if (explicitTotal > 0) {
    return explicitTotal
  }
  return topColorItems.value.reduce((sum, item) => sum + Number(item?.track_count || 0), 0)
})

function ensureChartInstance() {
  if (!chartRef.value) {
    return null
  }
  if (!chartInstance) {
    // 使用真正 treemap 布局，避免之前 flex 模拟时的边界溢出与挤压问题。
    chartInstance = echarts.init(chartRef.value)
  }
  return chartInstance
}

function renderChart() {
  const instance = ensureChartInstance()
  if (!instance) {
    return
  }
  const data = topColorItems.value.map((item) => ({
    value: Math.max(Number(item?.track_count || 0), 1),
    name: item.tone_label || item.color_hex || '色块',
    itemStyle: {
      color: item.color_hex || '#d9deef',
      borderColor: 'rgba(255, 255, 255, 0.84)',
      borderWidth: 3,
      gapWidth: 3,
    },
  }))

  instance.setOption({
    animation: false,
    tooltip: {
      show: false,
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: {
          show: false,
        },
        sort: 'desc',
        label: {
          show: false,
        },
        upperLabel: {
          show: false,
        },
        itemStyle: {
          borderColor: 'rgba(255, 255, 255, 0.84)',
          borderWidth: 3,
          gapWidth: 3,
          borderRadius: 18,
        },
        colorMappingBy: 'index',
        data,
      },
    ],
  })
}

function buildShareLabel(item) {
  const shareRatio = Number(item?.share_ratio || 0)
  if (shareRatio > 0) {
    return `${(shareRatio * 100).toFixed(1)}%`
  }
  const total = Math.max(treemapTotal.value, 1)
  return `${((Number(item?.track_count || 0) / total) * 100).toFixed(1)}%`
}

function buildRepresentativeLabel(item) {
  if (item?.is_other_bucket) {
    return '未进入主展示色块的其余颜色'
  }
  const trackTitle = item?.representative_track_title || '代表封面'
  const artistDisplay = item?.representative_artist_display
  return artistDisplay ? `${trackTitle} · ${artistDisplay}` : trackTitle
}

function handleResize() {
  chartInstance?.resize()
}

onMounted(async () => {
  await nextTick()
  renderChart()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize)
  }
})

watch(topColorItems, async () => {
  await nextTick()
  renderChart()
}, { deep: true })

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize)
  }
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>
