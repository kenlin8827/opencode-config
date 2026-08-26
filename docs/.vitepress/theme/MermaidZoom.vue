<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="mermaid-lightbox-overlay"
      @click.self="close"
      @keydown.esc="close"
      tabindex="-1"
      ref="overlayRef"
    >
      <!-- Controls Toolbar -->
      <div class="lightbox-toolbar" @click.stop>
        <button class="tool-btn" @click="zoomIn" title="放大 (Zoom In)">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="11" y1="8" x2="11" y2="14"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
        <button class="tool-btn" @click="zoomOut" title="缩小 (Zoom Out)">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
        <button class="tool-btn" @click="resetTransform" title="重置大小 (100%)">
          <span class="scale-text">{{ Math.round(scale * 100) }}%</span>
        </button>
        <button class="tool-btn close-btn" @click="close" title="关闭 (Esc)">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Hint -->
      <div class="lightbox-hint">
        <span>滚轮缩放 / 拖拽平移 / Esc 退出</span>
      </div>

      <!-- Interactive Canvas -->
      <div
        class="lightbox-content-wrapper"
        @wheel.prevent="onWheel"
        @mousedown="onMouseDown"
        :class="{ dragging: isDragging }"
      >
        <div
          class="lightbox-content"
          :style="{
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            transformOrigin: 'center center'
          }"
          v-html="svgContent"
        ></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

const isOpen = ref(false)
const svgContent = ref('')
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const overlayRef = ref<HTMLElement | null>(null)

let startX = 0
let startY = 0

function openWithSvg(svgEl: SVGElement) {
  const clone = svgEl.cloneNode(true) as SVGElement
  clone.removeAttribute('height')
  clone.removeAttribute('style')
  clone.style.width = '100%'
  clone.style.height = '100%'
  clone.style.maxHeight = '85vh'
  clone.style.maxWidth = '90vw'
  
  svgContent.value = clone.outerHTML
  scale.value = 1.2
  translateX.value = 0
  translateY.value = 0
  isOpen.value = true

  nextTick(() => {
    overlayRef.value?.focus()
    document.body.style.overflow = 'hidden'
  })
}

function close() {
  isOpen.value = false
  svgContent.value = ''
  document.body.style.overflow = ''
}

function zoomIn() {
  scale.value = Math.min(scale.value * 1.25, 6)
}

function zoomOut() {
  scale.value = Math.max(scale.value / 1.25, 0.3)
}

function resetTransform() {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

function onWheel(e: WheelEvent) {
  const factor = e.deltaY < 0 ? 1.15 : 0.85
  scale.value = Math.max(0.3, Math.min(scale.value * factor, 6))
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  isDragging.value = true
  startX = e.clientX - translateX.value
  startY = e.clientY - translateY.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isDragging.value) return
    translateX.value = moveEvent.clientX - startX
    translateY.value = moveEvent.clientY - startY
  }

  const onMouseUp = () => {
    isDragging.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (isOpen.value && e.key === 'Escape') {
    close()
  }
}

function handleClickDelegate(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target) return

  // Check if click target is inside a mermaid or svg container
  const mermaidContainer = target.closest('.mermaid, .vp-mermaid')
  if (mermaidContainer) {
    const svg = mermaidContainer.querySelector('svg')
    if (svg) {
      e.preventDefault()
      e.stopPropagation()
      openWithSvg(svg as unknown as SVGElement)
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickDelegate, true)
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickDelegate, true)
  window.removeEventListener('keydown', handleGlobalKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.mermaid-lightbox-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(10, 15, 29, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  user-select: none;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.lightbox-toolbar {
  position: absolute;
  top: 24px;
  right: 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  padding: 4px 10px;
  z-index: 10000;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.36);
}

.tool-btn {
  background: transparent;
  border: none;
  color: #e2e8f0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #38bdf8;
}

.close-btn:hover {
  color: #f43f5e;
}

.scale-text {
  font-size: 12px;
  font-weight: 600;
  font-family: monospace;
  min-width: 38px;
  text-align: center;
}

.lightbox-hint {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.75);
  color: #94a3b8;
  font-size: 12px;
  padding: 6px 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  pointer-events: none;
  z-index: 10000;
}

.lightbox-content-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  overflow: hidden;
}

.lightbox-content-wrapper.dragging {
  cursor: grabbing;
}

.lightbox-content {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.05s linear;
  max-width: 90vw;
  max-height: 85vh;
}

:deep(svg) {
  filter: drop-shadow(0 12px 36px rgba(0, 0, 0, 0.5));
}
</style>
