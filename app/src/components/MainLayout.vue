<script setup lang="ts">
import CalendarGrid from './CalendarGrid.vue';
import Toolbar from './Toolbar.vue';

defineEmits<{ (e: 'open-settings'): void }>();
</script>

<template>
  <div class="main-layout">
    <section class="calendar-col">
      <Toolbar @open-settings="$emit('open-settings')" />
      <CalendarGrid />
    </section>
    <aside class="right-panel" />
  </div>
</template>

<style scoped>
.main-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.calendar-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.right-panel {
  min-height: 0;
  overflow-y: auto;
  background: var(--surface);
  border-left: 1px solid var(--border);
}
</style>
