<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { registerBeforeClose } from '@/composables/useBeforeClose';
import { formatDateLong } from '@/domain/dates';
import { formatWon } from '@/domain/money';
import { MESSAGES } from '@/domain/messages';
import type { MonthStr } from '@/domain/types';
import { useLedgerStore } from '@/stores/ledger';
import CategoryTotalRow from './CategoryTotalRow.vue';

defineEmits<{ (e: 'open-fixed'): void }>();

const DEBOUNCE_MS = 500;
// 쉬지 않고 입력해도 첫 미저장 입력 후 이 시간 안에는 저장한다.
const MAX_WAIT_MS = 1000;
const ledger = useLedgerStore();

const expandedId = ref<number | null>(null);
const draft = ref('');
// 메모를 펼친 시점의 달. 이후 저장은 보는 달이 바뀌어도 이 달로 한다.
let memoMonth: MonthStr = ledger.viewMonth;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
// 저장을 순서대로 이어 붙여 마지막 입력이 항상 마지막에 저장되게 한다.
let chain: Promise<unknown> | null = null;

function clearTimers() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (maxTimer !== null) {
    clearTimeout(maxTimer);
    maxTimer = null;
  }
}

// 대기 중인 저장이 모두 끝나면 이행되는 Promise를 돌려준다(창 닫기 전 기다리는 용도).
function flush(): Promise<unknown> {
  clearTimers();
  if (!dirty || expandedId.value === null) return chain ?? Promise.resolve();
  dirty = false;
  const id = expandedId.value;
  const text = draft.value;
  const month = memoMonth;
  const run = async () => {
    const ok = await ledger.saveNote(id, text, month).catch(() => false);
    // 실패했고 그사이 새 입력이 없으면 다음 저장 시점에 같은 글을 다시 보낸다.
    if (!ok && !dirty && expandedId.value === id && memoMonth === month && draft.value === text) {
      dirty = true;
    }
  };
  const next: Promise<unknown> = chain === null ? run() : chain.then(run);
  chain = next;
  void next.then(() => {
    if (chain === next) chain = null;
  });
  return next;
}

// 빈 메모는 입력 중에 보내지 않는다(메모만 있던 행이 사라지기 때문). 접기·포커스 이탈 때 저장한다.
function flushIfNotBlank() {
  if (draft.value.trim() !== '') void flush();
  else clearTimers();
}

function toggle(id: number, note: string) {
  void flush();
  if (expandedId.value === id) {
    expandedId.value = null;
    return;
  }
  expandedId.value = id;
  memoMonth = ledger.viewMonth;
  draft.value = note;
}

function onDraft(value: string) {
  draft.value = value;
  dirty = true;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(flushIfNotBlank, DEBOUNCE_MS);
  if (maxTimer === null) maxTimer = setTimeout(flushIfNotBlank, MAX_WAIT_MS);
}

const rowIds = computed(() => ledger.summary.rows.map((r) => r.category.id));
watch(rowIds, (ids) => {
  if (expandedId.value !== null && !ids.includes(expandedId.value)) {
    // 달 이동으로 행이 바뀐 경우 입력 중인 메모를 먼저 저장한다(저장은 펼칠 때의 달 기준).
    void flush();
    dirty = false;
    expandedId.value = null;
    draft.value = '';
  }
});

watch(
  () => ledger.viewMonth,
  () => {
    void flush();
    expandedId.value = null;
  },
);
const unregister = registerBeforeClose(flush);
onBeforeUnmount(() => {
  unregister();
  void flush();
});
</script>

<template>
  <div class="summary-tab">
    <p class="period">{{ formatDateLong(ledger.period.start) }} ~ {{ formatDateLong(ledger.period.end) }}</p>

    <ul v-if="ledger.summary.rows.length > 0" class="rows">
      <CategoryTotalRow
        v-for="r in ledger.summary.rows"
        :key="r.category.id"
        :row="r"
        :expanded="expandedId === r.category.id"
        :draft="draft"
        @toggle="toggle(r.category.id, r.note)"
        @update:draft="onDraft"
        @commit="flush()"
      />
    </ul>
    <p v-else class="empty">{{ MESSAGES.emptyMonth }}</p>

    <dl class="totals">
      <div class="line">
        <dt>총 지출</dt>
        <dd>{{ formatWon(ledger.summary.variableTotal) }}원</dd>
      </div>
    </dl>

    <button type="button" class="fixed-card" @click="$emit('open-fixed')">
      <span>고정 지출</span>
      <span class="amount">{{ formatWon(ledger.summary.fixedTotal) }}원</span>
    </button>

    <div class="grand">
      <span>월간 총 지출</span>
      <strong>{{ formatWon(ledger.summary.grandTotal) }}원</strong>
    </div>

    <p class="no-expense">무지출 데이 {{ ledger.summary.noExpenseCount }}회</p>
  </div>
</template>

<style scoped>
.summary-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
}
.period {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9em;
}
.rows {
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface-2);
}
.empty {
  margin: 0;
  padding: var(--space-4);
  color: var(--text-muted);
  text-align: center;
}
.totals {
  margin: 0;
}
.line {
  display: flex;
  justify-content: space-between;
  padding: 0 var(--space-3);
}
.line dt,
.line dd {
  margin: 0;
}
.fixed-card {
  display: flex;
  justify-content: space-between;
  padding: var(--space-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  color: var(--text);
  text-align: left;
}
.grand {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: var(--space-3);
  background: var(--accent);
  color: var(--on-accent);
  border-radius: var(--radius-card);
  font-size: 1.1em;
}
.no-expense {
  margin: 0;
  color: var(--text-muted);
  text-align: center;
}
.amount {
  font-variant-numeric: tabular-nums;
}
</style>
