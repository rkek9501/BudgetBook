<script setup lang="ts">
import { formatWon } from '@/domain/money';
import type { SummaryRow } from '@/domain/summary';

defineProps<{ row: SummaryRow; expanded: boolean; draft: string }>();
defineEmits<{
  (e: 'toggle'): void;
  (e: 'update:draft', value: string): void;
  (e: 'commit'): void;
}>();
</script>

<template>
  <li class="category-total">
    <button
      type="button"
      class="category-row"
      :aria-expanded="expanded"
      @click="$emit('toggle')"
    >
      <span class="dot" :style="{ background: row.category.color }" aria-hidden="true" />
      <span class="name">{{ row.category.name }}</span>
      <span class="amount">{{ formatWon(row.total) }}원</span>
    </button>
    <textarea
      v-if="expanded"
      class="memo"
      rows="3"
      placeholder="이번 달 메모"
      :aria-label="`${row.category.name} 메모`"
      :value="draft"
      @input="$emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
      @blur="$emit('commit')"
    />
  </li>
</template>

<style scoped>
.category-total {
  list-style: none;
}
.category-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: 0;
  color: var(--text);
  text-align: left;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--border);
  flex: none;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amount {
  font-variant-numeric: tabular-nums;
}
.memo {
  display: block;
  box-sizing: border-box;
  width: calc(100% - var(--space-3) * 2);
  margin: 0 var(--space-3) var(--space-2);
  padding: var(--space-2);
  resize: vertical;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
  color: var(--text);
  font: inherit;
}
</style>
