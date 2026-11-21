<script setup lang="ts">
import { computed, ref } from 'vue';
import { addDays } from '@/domain/dates';
import { calendarLayout } from '@/domain/period';
import { useLedgerStore } from '@/stores/ledger';
import DayCell from './DayCell.vue';

const ledger = useLedgerStore();
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const gridEl = ref<HTMLElement | null>(null);

// WebKit은 클릭해도 버튼에 포커스를 주지 않으므로, 방향키가 동작하도록 격자로 포커스를 옮긴다.
function onCellClick(date: string) {
  ledger.select(date);
  gridEl.value?.focus({ preventScroll: true });
}

// 각 행은 7칸. 기간 밖은 null(빈칸).
const rows = computed(() => {
  const { leadingBlanks, rows: n } = calendarLayout(ledger.period);
  const flat = [...Array(leadingBlanks).fill(null), ...ledger.dayCells];
  while (flat.length < n * 7) flat.push(null);
  return Array.from({ length: n }, (_, r) => flat.slice(r * 7, r * 7 + 7));
});

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

function onKeydown(ev: KeyboardEvent) {
  const step = STEP[ev.key];
  if (step === undefined || ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;
  ev.preventDefault();
  const { start, end } = ledger.period;
  const inside = (d: string) => d >= start && d <= end;
  const cur = ledger.selectedDate;
  const from = cur !== null && inside(cur) ? cur : inside(ledger.today) ? ledger.today : start;
  const next = addDays(from, step);
  if (inside(next)) ledger.select(next);
}
</script>

<template>
  <div class="calendar">
    <div class="weekdays" aria-hidden="true">
      <span
        v-for="(w, i) in WEEKDAYS"
        :key="w"
        class="weekday"
        :class="{ sun: i === 0, sat: i === 6 }"
      >{{ w }}</span>
    </div>
    <div ref="gridEl" class="grid" tabindex="0" role="group" aria-label="달력" @keydown="onKeydown">
      <div v-for="(row, r) in rows" :key="r" class="week-row">
        <template v-for="(cell, i) in row" :key="cell ? cell.date : `b${r}-${i}`">
          <DayCell
            v-if="cell"
            :cell="cell"
            :categories="ledger.categories"
            :is-today="cell.date === ledger.today"
            :is-selected="cell.date === ledger.selectedDate"
            @click="onCellClick(cell.date)"
          />
          <div v-else class="blank" aria-hidden="true" />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calendar {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 0 var(--space-4) var(--space-4);
}
.weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-2);
  padding-bottom: var(--space-2);
}
.weekday {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  color: var(--text-muted);
}
.weekday.sun {
  color: var(--sunday);
}
.weekday.sat {
  color: var(--saturday);
}
.grid {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  border-radius: var(--radius-card);
}
.week-row {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-2);
  min-height: 0;
}
.blank {
  min-height: 0;
}
</style>
