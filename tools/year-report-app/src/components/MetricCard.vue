<template>
  <article class="metric-card" :class="[`metric-card--${variant}`]">
    <p class="metric-label">{{ label }}</p>
    <strong class="metric-value">{{ value }}</strong>
    <p v-if="caption" class="metric-caption">{{ caption }}</p>
  </article>
</template>

<script setup>
defineProps({
  label: {
    type: String,
    required: true,
  },
  value: {
    type: [String, Number],
    required: true,
  },
  caption: {
    type: String,
    default: '',
  },
  variant: {
    type: String,
    default: 'default',
  },
})
</script>
