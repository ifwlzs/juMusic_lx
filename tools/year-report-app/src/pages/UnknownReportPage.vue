<template>
  <ReportPageShell :page="page">
    <div class="hero-layout hero-layout--centered">
      <div class="hero-copy hero-copy--editorial">
        <span class="hero-tag hero-tag-pill">Unknown page</span>
        <h2 class="hero-title">未注册页面</h2>
        <p class="hero-subtitle">
          当前 contract 中出现了尚未接入前端注册表的页号：{{ page.page_id }}。
        </p>
      </div>

      <section class="story-card story-card--focus">
        <strong>{{ page.title || '请检查页面映射' }}</strong>
        <p>请同步更新 Python contract、页面注册表与对应组件，避免联调阶段被静默回退掩盖。</p>
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
</script>
