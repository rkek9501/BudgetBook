<script setup lang="ts">
import { computed } from 'vue';
import { formatDayTitle } from '@/domain/dates';
import { MESSAGES } from '@/domain/messages';
import type { DateStr } from '@/domain/types';
import { useLedgerStore } from '@/stores/ledger';
import ExpenseForm from './ExpenseForm.vue';
import ExpenseRow from './ExpenseRow.vue';

const props = defineProps<{ date: DateStr }>();
const ledger = useLedgerStore();

const expenses = computed(() => ledger.data.expenses.filter((e) => e.date === props.date));
const noExpense = computed(() => ledger.data.noExpenseDays.includes(props.date));
const blocked = computed(() => expenses.value.length > 0);

function onToggle(e: Event) {
  const el = e.target as HTMLInputElement;
  const on = el.checked;
  // 저장이 끝나기 전에 스위치가 먼저 움직이지 않도록 실제 상태로 되돌린다.
  el.checked = noExpense.value;
  void ledger.setNoExpense(props.date, on);
}
</script>

<template>
  <div class="day-tab">
    <header class="head">
      <h2 class="title">{{ formatDayTitle(date) }}</h2>
      <label class="toggle" :class="{ disabled: blocked || ledger.saving }">
        <input
          type="checkbox"
          class="switch-input"
          role="switch"
          :checked="noExpense"
          :disabled="blocked || ledger.saving"
          @change="onToggle"
        />
        <span class="switch" aria-hidden="true" />
        <span>무지출</span>
      </label>
    </header>
    <p v-if="blocked" class="hint">{{ MESSAGES.noExpenseBlocked }}</p>

    <div class="body">
      <p v-if="noExpense && !blocked" class="status">지출 없이 보낸 날이에요.</p>
      <ul v-else-if="expenses.length > 0" class="list">
        <ExpenseRow v-for="e in expenses" :key="e.id" :expense="e" />
      </ul>
    </div>
    <ExpenseForm :date="date" />
  </div>
</template>

<style scoped>
.day-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3);
}
.title {
  margin: 0;
  font-size: 16px;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}
.toggle.disabled {
  cursor: not-allowed;
  color: var(--text-muted);
}
.switch-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.switch {
  position: relative;
  width: 34px;
  height: 20px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: background 0.15s;
}
.switch::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 16px;
  height: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 50%;
  transition: transform 0.15s;
}
.switch-input:checked + .switch {
  background: var(--accent);
  border-color: var(--accent);
}
.switch-input:checked + .switch::after {
  transform: translateX(14px);
}
.switch-input:focus-visible + .switch {
  outline: 2px solid var(--selected-ring);
  outline-offset: 2px;
}
.switch-input:disabled + .switch {
  opacity: 0.5;
}
.hint {
  margin: 0;
  padding: 0 var(--space-3) var(--space-2);
  color: var(--text-muted);
  font-size: 12px;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid var(--border);
}
.list {
  margin: 0;
  padding: 0;
}
.status {
  margin: 0;
  padding: var(--space-4) var(--space-3);
  color: var(--text-muted);
  text-align: center;
}
</style>
