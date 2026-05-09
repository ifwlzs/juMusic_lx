import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export function usePageNavigator(viewportRef) {
  // 当前激活页用于顶部页码、进度条与键盘翻页定位。
  const activePageId = ref('')
  const pageElementMap = new Map()
  let pageObserver = null

  const pageIds = computed(() => Array.from(pageElementMap.keys()))

  function registerPageElement(pageId, element) {
    // 模板更新时 Vue 会先传 null 再传新节点，这里要同时处理挂载与卸载。
    if (!element) {
      const previousElement = pageElementMap.get(pageId)
      if (previousElement && pageObserver) {
        pageObserver.unobserve(previousElement)
      }
      pageElementMap.delete(pageId)
      return
    }
    pageElementMap.set(pageId, element)
    if (pageObserver) {
      pageObserver.observe(element)
    }
    if (!activePageId.value) {
      activePageId.value = pageId
    }
  }

  function scrollToPage(pageId) {
    const targetElement = pageElementMap.get(pageId)
    if (!targetElement) {
      return
    }
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    targetElement.scrollIntoView({
      block: 'start',
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
  }

  function scrollByOffset(offset) {
    const currentIndex = pageIds.value.findIndex((pageId) => pageId === activePageId.value)
    if (currentIndex < 0) {
      return
    }
    const nextPageId = pageIds.value[currentIndex + offset]
    if (nextPageId) {
      scrollToPage(nextPageId)
    }
  }

  function handleViewportKeydown(event) {
    // 桌面端保留键盘翻页能力；移动端仍旧以自然上下滑为主。
    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault()
      scrollByOffset(1)
    }
    if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault()
      scrollByOffset(-1)
    }
  }

  onMounted(() => {
    // 单测环境里可能没有 IntersectionObserver，此时退化为仅保留首屏页状态，不阻塞渲染。
    if (typeof IntersectionObserver !== 'undefined') {
      pageObserver = new IntersectionObserver(
        (entries) => {
          const visibleEntry = entries
            .filter((entry) => entry.isIntersecting)
            .sort((leftEntry, rightEntry) => rightEntry.intersectionRatio - leftEntry.intersectionRatio)[0]
          if (visibleEntry?.target?.dataset?.pageId) {
            activePageId.value = visibleEntry.target.dataset.pageId
          }
        },
        {
          root: viewportRef.value,
          threshold: [0.55, 0.75],
        },
      )
      pageElementMap.forEach((element) => {
        pageObserver.observe(element)
      })
    }
    viewportRef.value?.addEventListener('keydown', handleViewportKeydown)
  })

  onBeforeUnmount(() => {
    viewportRef.value?.removeEventListener('keydown', handleViewportKeydown)
    pageObserver?.disconnect()
    pageObserver = null
  })

  return {
    activePageId,
    registerPageElement,
    scrollByOffset,
    scrollToPage,
  }
}
