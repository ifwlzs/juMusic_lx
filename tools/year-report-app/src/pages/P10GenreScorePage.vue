<template>
  <ReportPageShell :page="page">
    <div class="hero-layout hero-layout--centered hero-layout--compact">
      <div class="hero-copy hero-copy--editorial hero-copy--compact">
        <span class="hero-tag hero-tag-pill">Taste score</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-highlight">{{ page.payload.taste_score || 0 }} 分</p>
        <p class="hero-subtitle">把曲风广度、均衡度和新曲风占比折成一个更直观的分数。</p>
      </div>

      <div class="genre-radar-card genre-radar-card--compact">
        <div
          ref="chartRef"
          class="genre-radar-chart genre-radar-chart--echarts"
          data-testid="p10-radar-chart"
          aria-label="曲风分数雷达图"
        ></div>

        <div class="genre-radar-metric-grid">
          <article
            v-for="item in radarMetrics"
            :key="item.metric_key"
            class="genre-radar-metric-chip"
          >
            <span class="genre-radar-metric-label">{{ item.metric_label }}</span>
            <strong>{{ item.score }}</strong>
            <small>/ {{ item.full_score }}</small>
          </article>
        </div>

        <p class="genre-radar-summary-note">{{ summaryNote }}</p>
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

// 雷达页只消费 4 个固定维度，避免真实数据里额外字段打乱布局。
const radarMetrics = computed(() => {
  const metrics = props.page.payload?.radar_metrics
  return Array.isArray(metrics) ? metrics.slice(0, 4) : []
})

// 文案跟随实际数据自动生成，避免写死后与真实分数错位。
const summaryNote = computed(() => {
  if (!radarMetrics.value.length) {
    return '今年的曲风画像还在生成中。'
  }
  const strongestMetric = radarMetrics.value.reduce((currentMax, item) => {
    const currentRatio = Number(currentMax?.score || 0) / Math.max(Number(currentMax?.full_score || 0), 1)
    const nextRatio = Number(item?.score || 0) / Math.max(Number(item?.full_score || 0), 1)
    return nextRatio > currentRatio ? item : currentMax
  }, radarMetrics.value[0])
  const weakestMetric = radarMetrics.value.reduce((currentMin, item) => {
    const currentRatio = Number(currentMin?.score || 0) / Math.max(Number(currentMin?.full_score || 0), 1)
    const nextRatio = Number(item?.score || 0) / Math.max(Number(item?.full_score || 0), 1)
    return nextRatio < currentRatio ? item : currentMin
  }, radarMetrics.value[0])
  return `${strongestMetric.metric_label}最突出，${weakestMetric.metric_label}还有继续补强空间。`
})

function ensureChartInstance() {
  if (!chartRef.value) {
    return null
  }
  if (!chartInstance) {
    // 直接交给 ECharts 计算雷达网格，保证分值与标准格共用同一套坐标系。
    chartInstance = echarts.init(chartRef.value)
  }
  return chartInstance
}

function renderChart() {
  const instance = ensureChartInstance()
  if (!instance) {
    return
  }
  const indicator = radarMetrics.value.map((item) => ({
    name: item.metric_label,
    max: Math.max(Number(item?.full_score || 0), 1),
  }))
  const values = radarMetrics.value.map((item) => Number(item?.score || 0))

  instance.setOption({
    animation: false,
    tooltip: {
      show: false,
    },
    radar: {
      center: ['50%', '55%'],
      radius: '66%',
      splitNumber: 4,
      axisName: {
        color: '#6b7388',
        fontSize: 11,
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(105, 123, 163, 0.22)',
        },
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(105, 123, 163, 0.16)',
        },
      },
      splitArea: {
        areaStyle: {
          color: [
            'rgba(255, 255, 255, 0.18)',
            'rgba(133, 165, 215, 0.08)',
          ],
        },
      },
      indicator,
    },
    series: [
      {
        type: 'radar',
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: {
          width: 2.5,
          color: '#d94b48',
        },
        itemStyle: {
          color: '#d94b48',
        },
        areaStyle: {
          color: 'rgba(217, 75, 72, 0.22)',
        },
        data: [
          {
            value: values,
          },
        ],
      },
    ],
  })
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

watch(radarMetrics, async () => {
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
