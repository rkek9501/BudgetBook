<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { textColorFor } from '@/domain/categories';
import { weekday } from '@/domain/dates';
import { formatWon } from '@/domain/money';
import { fitChips, type DayCellData } from '@/domain/summary';
import type { Category } from '@/domain/types';
import NoExpenseStamp from './NoExpenseStamp.vue';

// CSS의 .chip(높이 20px + 아래 간격 2px), .more 높이와 같아야 한다.
const CHIP_PX = 22;
const MORE_PX = 18;

const props = defineProps<{
  cell: DayCellData;
  categories: Category[];
  isToday: boolean;
  isSelected: boolean;
}>();

const chipArea = ref<HTMLElement | null>(null);
// 측정 전이거나 ResizeObserver가 없으면 전부 표시한다.
const availablePx = ref(Number.POSITIVE_INFINITY);
let observer: ResizeObserver | undefined;

onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !chipArea.value) return;
  observer = new ResizeObserver((entries) => {
    const last = entries[entries.length - 1];
    if (last) availablePx.value = last.contentRect.height;
  });
  observer.observe(chipArea.value);
});
onBeforeUnmount(() => observer?.disconnect());

const catOf = computed(() => new Map(props.categories.map((c) => [c.id, c])));
const fit = computed(() => fitChips(props.cell.expenses.length, availablePx.value, CHIP_PX, MORE_PX));
const chips = computed(() =>
  props.cell.expenses.slice(0, fit.value.visible).map((e) => {
    const color = catOf.value.get(e.categoryId)?.color ?? '#CCCCCC';
    return { e, style: { backgroundColor: color, color: textColorFor(color) } };
  }),
);

const dayNum = computed(() => Number(props.cell.date.slice(8)));
const dayClass = computed(() => {
  const w = weekday(props.cell.date);
  return w === 0 ? 'sun' : w === 6 ? 'sat' : '';
});
const label = computed(() => {
  const [, m, d] = props.cell.date.split('-').map(Number);
  const tail =
    props.cell.expenses.length > 0
      ? `지출 ${formatWon(props.cell.total)}원`
      : props.cell.noExpense
        ? '무지출'
        : '지출 없음';
  return `${m}월 ${d}일, ${tail}`;
});
</script>

<template>
  <button
    type="button"
    class="day-cell"
    :class="{ today: isToday, selected: isSelected }"
    :aria-label="label"
    :aria-pressed="isSelected"
    tabindex="-1"
  >
    <span class="day-num" :class="dayClass">{{ dayNum }}</span>
    <span ref="chipArea" class="chips">
      <template v-if="cell.expenses.length > 0">
        <span v-for="c in chips" :key="c.e.id" class="chip" :style="c.style">
          <span class="chip-desc">{{ c.e.description }}</span>
          <span class="chip-amt amount">{{ formatWon(c.e.amount) }}</span>
        </span>
        <span v-if="fit.hidden > 0" class="more">+{{ fit.hidden }}건</span>
      </template>
      <span v-else-if="cell.noExpense" class="stamp-wrap"><NoExpenseStamp /></span>
    </span>
    <span v-if="cell.total > 0" class="total amount">{{ formatWon(cell.total) }}원</span>
  </button>
</template>

<style scoped>
.day-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: var(--space-2) var(--space-2) var(--space-1);
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.day-cell:hover {
  border-color: var(--text-muted);
}
.day-cell.selected {
  border-color: var(--selected-ring);
  box-shadow: 0 0 0 1px var(--selected-ring);
}
.day-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  flex: none;
  min-width: 24px;
  height: 24px;
  margin-bottom: var(--space-1);
  padding: 0 var(--space-1);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  border-radius: 999px;
  color: var(--text);
}
.day-num.sun {
  color: var(--sunday);
}
.day-num.sat {
  color: var(--saturday);
}
.today .day-num {
  box-shadow: inset 0 0 0 2px var(--today-ring);
}
.chips {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.chip {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
  height: 20px;
  margin-bottom: 2px; /* 20 + 2 = CHIP_PX */
  padding: 0 var(--space-2);
  font-size: 12px;
  line-height: 20px;
  border-radius: var(--radius-chip);
}
.chip-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-amt {
  flex: none;
  font-size: 11px;
  opacity: 0.85;
}
.more {
  flex: none;
  height: 18px; /* MORE_PX */
  padding-left: var(--space-1);
  font-size: 11px;
  line-height: 18px;
  color: var(--text-muted);
}
.stamp-wrap {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.total {
  flex: none;
  padding-top: var(--space-1);
  font-size: 12px;
  font-weight: 600;
  text-align: right;
  color: var(--text-muted);
}
</style>
