<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Sheet from './Sheet.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { loadFixed, saveFixed } from '@/api/commands';
import { formatAmountLive, isImeKey } from '@/composables/useAmountInput';
import { addMonths, formatMonthTitle } from '@/domain/dates';
import { MESSAGES } from '@/domain/messages';
import { formatWon, parseAmount } from '@/domain/money';
import type { FixedAmount, FixedItem, MonthStr } from '@/domain/types';

const props = defineProps<{ startMonth: MonthStr }>();
const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void }>();

const items = ref<FixedItem[]>([]);
// 금액 칸 문자열. 키는 `itemId|month`, ''(또는 키 없음)은 빈칸.
const values = ref<Record<string, string>>({});
const month = ref<MonthStr>(props.startMonth);
const loaded = ref(false);
const loadError = ref('');
const newName = ref('');
const addError = ref('');
const saveError = ref('');
const saving = ref(false);
const deleting = ref<FixedItem | null>(null);

const key = (id: string, m: MonthStr) => `${id}|${m}`;
const getVal = (id: string, m: MonthStr) => values.value[key(id, m)] ?? '';

onMounted(async () => {
  try {
    const data = await loadFixed();
    items.value = [...data.items].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => ({ ...i }));
    const v: Record<string, string> = {};
    for (const a of data.amounts) v[key(a.itemId, a.month)] = formatWon(a.amount);
    values.value = v;
    loaded.value = true;
  } catch {
    loadError.value = MESSAGES.loadFailed;
  }
});

const total = computed(() =>
  items.value.reduce((sum, it) => {
    const r = parseAmount(getVal(it.id, month.value));
    return r.ok ? sum + r.value : sum;
  }, 0),
);

function onAmountInput(id: string, e: Event) {
  const el = e.target as HTMLInputElement;
  const s = formatAmountLive(el.value);
  el.value = s;
  values.value[key(id, month.value)] = s;
  saveError.value = '';
}

function move(n: number) {
  month.value = addMonths(month.value, n);
}

function fillFromPrevious() {
  const prev = addMonths(month.value, -1);
  for (const it of items.value) {
    if (getVal(it.id, month.value) !== '') continue;
    const p = getVal(it.id, prev);
    if (p.trim() !== '') values.value[key(it.id, month.value)] = p;
  }
}

function addItem() {
  const name = newName.value.trim();
  if (name === '') {
    addError.value = MESSAGES.fixedNameRequired;
    return;
  }
  const lower = name.toLowerCase();
  if (items.value.some((i) => i.name.toLowerCase() === lower)) {
    addError.value = MESSAGES.fixedDuplicate;
    return;
  }
  items.value.push({ id: crypto.randomUUID(), name, sortOrder: items.value.length });
  newName.value = '';
  addError.value = '';
}

function onNameEnter(e: KeyboardEvent) {
  if (isImeKey(e)) return;
  e.preventDefault();
  addItem();
}

function confirmDelete() {
  const it = deleting.value;
  deleting.value = null;
  if (!it) return;
  items.value = items.value.filter((i) => i.id !== it.id);
  const prefix = `${it.id}|`;
  for (const k of Object.keys(values.value)) if (k.startsWith(prefix)) delete values.value[k];
}

async function save() {
  if (saving.value) return;
  saveError.value = '';
  const amounts: FixedAmount[] = [];
  for (const it of items.value) {
    const prefix = `${it.id}|`;
    for (const [k, s] of Object.entries(values.value)) {
      if (!k.startsWith(prefix) || s.trim() === '') continue;
      const m = k.slice(prefix.length);
      const r = parseAmount(s);
      if (!r.ok) {
        month.value = m;
        saveError.value = MESSAGES.fixedAmountInvalid(it.name);
        return;
      }
      amounts.push({ itemId: it.id, month: m, amount: r.value });
    }
  }
  const payload = items.value.map((i, idx) => ({ ...i, sortOrder: idx }));
  saving.value = true;
  try {
    await saveFixed(payload, amounts);
  } catch {
    saveError.value = MESSAGES.saveFailed;
    return;
  } finally {
    saving.value = false;
  }
  emit('saved');
}
</script>

<template>
  <Sheet :open="true" title="고정 지출" :busy="saving" @close="emit('close')">
    <div class="month-nav">
      <button type="button" class="icon-btn" aria-label="이전 달" @click="move(-1)">‹</button>
      <span class="month-title">{{ formatMonthTitle(month) }}</span>
      <button type="button" class="icon-btn" aria-label="다음 달" @click="move(1)">›</button>
      <button type="button" class="btn fill" :disabled="!loaded" @click="fillFromPrevious">
        지난달 금액 불러오기
      </button>
    </div>

    <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>
    <div class="list">
      <p v-if="loaded && items.length === 0" class="empty">{{ MESSAGES.emptyFixed }}</p>
      <div v-for="it in items" :key="it.id" class="fixed-row">
        <span class="name">{{ it.name }}</span>
        <input
          class="amount"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :aria-label="`${it.name} 금액`"
          :value="getVal(it.id, month)"
          @input="onAmountInput(it.id, $event)"
        />
        <span class="unit">원</span>
        <button
          type="button"
          class="icon-btn"
          :aria-label="`${it.name} 삭제`"
          @click="deleting = it"
        >
          ✕
        </button>
      </div>
    </div>

    <div class="add-row">
      <input
        v-model="newName"
        type="text"
        placeholder="새 항목 이름"
        aria-label="새 항목 이름"
        autocomplete="off"
        @keydown.enter="onNameEnter"
        @input="addError = ''"
      />
      <button type="button" class="btn" :disabled="!loaded" @click="addItem">추가</button>
    </div>
    <p v-if="addError" class="add-error error" role="alert">{{ addError }}</p>

    <p class="total">이번 달 합계 {{ formatWon(total) }}원</p>
    <p v-if="saveError" class="save-error error" role="alert">{{ saveError }}</p>

    <div class="actions">
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">취소</button>
      <button type="button" class="btn primary" :disabled="!loaded || saving" @click="save">저장</button>
    </div>

    <ConfirmDialog
      :open="deleting !== null"
      :message="deleting ? MESSAGES.confirmDeleteFixed(deleting.name) : ''"
      @confirm="confirmDelete"
      @cancel="deleting = null"
    />
  </Sheet>
</template>

<style scoped>
.month-nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.month-title {
  min-width: 7em;
  text-align: center;
  font-weight: 600;
}
.fill {
  margin-left: auto;
}
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-bottom: var(--space-3);
}
.empty {
  margin: var(--space-3) 0;
  color: var(--text-muted);
}
.fixed-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amount {
  width: 9em;
  text-align: right;
}
input {
  padding: var(--space-1) var(--space-2);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.add-row {
  display: flex;
  gap: var(--space-2);
}
.add-row input {
  flex: 1;
}
.error {
  margin: var(--space-1) 0 0;
  color: var(--danger);
}
.total {
  margin: var(--space-3) 0 var(--space-2);
  font-weight: 600;
  text-align: right;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.btn {
  padding: var(--space-1) var(--space-3);
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.btn:disabled {
  opacity: 0.5;
}
.icon-btn {
  padding: var(--space-1) var(--space-2);
  background: transparent;
  color: var(--text-muted);
  border: 0;
}
</style>
