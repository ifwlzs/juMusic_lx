<template>
  <ReportPageShell :page="page">
    <div class="hero-layout hero-layout--centered">
      <div class="hero-copy hero-copy--editorial">
        <span class="hero-tag hero-tag-pill">Keywords</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">这些词是这一年最容易反复冒出来的情绪切片。</p>
      </div>

      <div class="keyword-cloud-card">
        <span
          v-for="item in page.payload.keywords || []"
          :key="item.keyword"
          class="keyword-chip"
          :style="{ '--keyword-scale': buildScale(item.count) }"
        >
          {{ item.keyword }}
        </span>
      </div>
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

function buildScale(count) {
  const normalized = Math.min(1.6, 0.9 + Number(count || 0) / 20)
  return normalized.toFixed(2)
}
</script>
