<script setup lang="ts">
// 무지출 도장. 색은 CSS 토큰(--accent)을 따른다.
</script>

<template>
  <svg class="stamp" viewBox="0 0 64 64" role="img" aria-label="무지출" focusable="false">
    <g transform="rotate(-12 32 32)" fill="none" stroke="currentColor">
      <circle cx="32" cy="32" r="28" stroke-width="3" />
      <circle cx="32" cy="32" r="23" stroke-width="1" />
    </g>
    <text
      x="32"
      y="38"
      text-anchor="middle"
      font-size="17"
      font-weight="700"
      fill="currentColor"
      transform="rotate(-12 32 32)"
    >
      무지출
    </text>
  </svg>
</template>

<style scoped>
.stamp {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 52px;
  max-height: 52px;
  color: var(--accent);
  opacity: 0.55;
}
</style>
