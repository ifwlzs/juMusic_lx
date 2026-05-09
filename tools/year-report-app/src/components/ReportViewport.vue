<template>
  <div
    ref="viewportElement"
    class="report-viewport"
    data-testid="report-viewport"
    :style="viewportStyle"
    tabindex="0"
    role="document"
    :aria-label="`${year} 年度报告分页视口`"
  >
    <slot></slot>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { getViewportDesignTokens } from '@/lib/reportTheme.js'

const props = defineProps({
  year: {
    type: Number,
    required: true,
  },
  pageTotal: {
    type: Number,
    required: true,
  },
  activeIndex: {
    type: Number,
    required: true,
  },
  designWidth: {
    type: Number,
    default: 390,
  },
  designHeight: {
    type: Number,
    default: 844,
  },
})

// 暴露视口 DOM 引用给上层 composable，便于做 IntersectionObserver 和键盘导航绑定。
const viewportElement = ref(null)

// 通过内联 CSS 变量把设计尺寸 token 注入组件，便于桌面端形成固定手机卡片视口。
const viewportStyle = computed(() => {
  const tokens = getViewportDesignTokens({
    design_width: props.designWidth,
    design_height: props.designHeight,
  })
  return tokens.style
})

// 暴露内部滚动容器给父组件，用于滚动监听与键盘翻页控制。
defineExpose({
  viewportElement,
})
</script>
