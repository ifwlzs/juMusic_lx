<template>
  <ReportPageShell :page="page">
    <div class="hero-layout hero-layout--centered">
      <div class="hero-copy hero-copy--editorial">
        <span class="hero-tag hero-tag-pill">{{ page.payload.story_card?.note || 'Story' }}</span>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-highlight">{{ page.payload.story_card?.headline || '这页先保留故事氛围。' }}</p>
        <p class="hero-subtitle">{{ page.payload.story_card?.subline || '等待后续接入更完整的城市陪伴轨迹。' }}</p>
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
</script>
