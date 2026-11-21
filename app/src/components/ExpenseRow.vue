<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { formatAmountInput, formatWon } from '@/domain/money';
import { MESSAGES } from '@/domain/messages';
import type { Expense } from '@/domain/types';
import { useLedgerStore } from '@/stores/ledger';
import ConfirmDialog from './ConfirmDialog.vue';
import { isImeKey, useAmountInput } from '@/composables/useAmountInput';
import { validateExpenseFields, type FieldErrors } from './expenseValidation';

const props = defineProps<{ expense: Expense }>();
const ledger = useLedgerStore();

const category = computed(() => ledger.categories.find((c) => c.id === props.expense.categoryId));

const editing = ref(false);
const description = ref('');
const categoryId = ref<number | null>(null);
const errors = ref<FieldErrors>({});
const { amount, onInput: onAmountInput } = useAmountInput(() => {
  errors.value = { ...errors.value, amount: undefined };
});
const busy = ref(false);
const confirming = ref(false);

const rowEl = ref<HTMLElement | null>(null);
const descEl = ref<HTMLInputElement | null>(null);

async function startEdit() {
  if (editing.value) return;
  description.value = props.expense.description;
  amount.value = formatAmountInput(String(props.expense.amount));
  categoryId.value = props.expense.categoryId;
  errors.value = {};
  editing.value = true;
  await nextTick();
  descEl.value?.focus();
}

async function cancelEdit() {
  editing.value = false;
  errors.value = {};
  await nextTick();
  rowEl.value?.focus();
}

async function save() {
  if (busy.value) return;
  const r = validateExpenseFields(description.value, amount.value, categoryId.value, true);
  if (!r.ok) {
    errors.value = r.errors;
    return;
  }
  busy.value = true;
  try {
    const ok = await ledger.updateExpense({
      id: props.expense.id,
      description: r.description,
      amount: r.amount,
      categoryId: r.categoryId,
    });
    if (ok) {
      editing.value = false;
      await nextTick();
      rowEl.value?.focus();
    }
  } finally {
    busy.value = false;
  }
}

function onRowKeydown(e: KeyboardEvent) {
  if (e.target !== rowEl.value || editing.value || isImeKey(e)) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    void startEdit();
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    confirming.value = true;
  }
}

function onEditKeydown(e: KeyboardEvent) {
  if (isImeKey(e)) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    void cancelEdit();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    void save();
  }
}

async function confirmDelete() {
  if (busy.value) return;
  busy.value = true;
  try {
    const ok = await ledger.deleteExpense(props.expense.id);
    if (ok) confirming.value = false;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <li ref="rowEl" class="expense-row" tabindex="0" :class="{ editing }" @keydown="onRowKeydown">
    <template v-if="!editing">
      <div class="view" @click="startEdit">
        <span class="dot" :style="{ background: category?.color }" aria-hidden="true" />
        <span class="desc">{{ expense.description }}</span>
        <span class="cat">{{ category?.name ?? '' }}</span>
        <span class="amount">{{ formatWon(expense.amount) }}원</span>
      </div>
      <button type="button" class="del" aria-label="삭제" @click.stop="confirming = true">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M3 4h10M6.5 4V2.5h3V4M4.5 4l.5 9h6l.5-9"
            fill="none"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </template>
    <div v-else class="edit" @keydown="onEditKeydown">
      <input
        ref="descEl"
        v-model="description"
        class="input"
        type="text"
        aria-label="내용"
        autocomplete="off"
        :aria-invalid="errors.description ? 'true' : undefined"
        @input="errors = { ...errors, description: undefined }"
      />
      <p v-if="errors.description" class="error" role="alert">{{ errors.description }}</p>
      <div class="edit-row">
        <input
          class="input amount-input"
          type="text"
          inputmode="numeric"
          aria-label="금액"
          autocomplete="off"
          :value="amount"
          :aria-invalid="errors.amount ? 'true' : undefined"
          @input="onAmountInput"
        />
        <select v-model.number="categoryId" class="input" aria-label="분류">
          <option v-for="c in ledger.sortedCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <p v-if="errors.amount" class="error" role="alert">{{ errors.amount }}</p>
      <p v-if="errors.category" class="error" role="alert">{{ errors.category }}</p>
    </div>
    <ConfirmDialog
      :open="confirming"
      :message="MESSAGES.confirmDeleteExpense"
      @confirm="confirmDelete"
      @cancel="confirming = false"
    />
  </li>
</template>

<style scoped>
.expense-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  list-style: none;
}
.expense-row:hover {
  background: var(--surface-2);
}
.view {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--border);
}
.desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cat {
  color: var(--text-muted);
  font-size: 12px;
}
.amount {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.del {
  flex: none;
  display: grid;
  place-items: center;
  padding: var(--space-1);
  background: transparent;
  border: 0;
  border-radius: var(--radius-chip);
  color: var(--text-muted);
}
.del:hover {
  color: var(--danger);
}
.edit {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.edit-row {
  display: flex;
  gap: var(--space-2);
}
.input {
  flex: 1;
  min-width: 0;
  padding: var(--space-1) var(--space-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.input[aria-invalid='true'] {
  border-color: var(--danger);
}
.amount-input {
  text-align: right;
}
.error {
  margin: 0;
  color: var(--danger);
  font-size: 12px;
}
</style>
