<script setup lang="ts">
import { computed } from 'vue';
import { useLedgerStore } from '@/stores/ledger';
import DayTab from './DayTab.vue';
import SummaryTab from './SummaryTab.vue';

defineEmits<{ (e: 'open-fixed'): void }>();

const ledger = useLedgerStore();

const dayLabel = computed(() => {
  const d = ledger.selectedDate;
  if (d === null) return '날짜';
  const [, mo, day] = d.split('-').map(Number);
  return `${mo}월 ${day}일`;
});
const summaryLabel = computed(() => `${Number(ledger.viewMonth.split('-')[1])}월 요약`);
</script>

<template>
  <aside class="right-panel">
    <div class="tabs" role="tablist">
      <button
        id="tab-day"
        type="button"
        role="tab"
        class="tab"
        aria-controls="panel-day"
        :aria-selected="ledger.activeTab === 'day'"
        @click="ledger.setTab('day')"
      >
        {{ dayLabel }}
      </button>
      <button
        id="tab-summary"
        type="button"
        role="tab"
        class="tab"
        aria-controls="panel-summary"
        :aria-selected="ledger.activeTab === 'summary'"
        @click="ledger.setTab('summary')"
      >
        {{ summaryLabel }}
      </button>
    </div>
    <div
      v-if="ledger.activeTab === 'day'"
      id="panel-day"
      class="panel"
      role="tabpanel"
      aria-labelledby="tab-day"
    >
      <DayTab v-if="ledger.selectedDate !== null" :date="ledger.selectedDate" />
      <p v-else class="empty">달력에서 날짜를 고르세요.</p>
    </div>
    <div v-else id="panel-summary" class="panel" role="tabpanel" aria-labelledby="tab-summary">
      <SummaryTab @open-fixed="$emit('open-fixed')" />
    </div>
  </aside>
</template>

<style scoped>
.right-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface);
  border-left: 1px solid var(--border);
}
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}
.tab {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
}
.tab[aria-selected='true'] {
  color: var(--text);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
.panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.empty {
  margin: 0;
  padding: var(--space-4);
  color: var(--text-muted);
  text-align: center;
}
</style>
