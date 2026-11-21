<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { formatAmountInput } from '@/domain/money';
import type { DateStr } from '@/domain/types';
import { useLedgerStore } from '@/stores/ledger';
import { validateExpenseFields, type FieldErrors } from './expenseValidation';

const props = defineProps<{ date: DateStr }>();
const ledger = useLedgerStore();

const description = ref('');
const amount = ref('');
const categoryId = ref<number | null>(null);
const errors = ref<FieldErrors>({});
const submitting = ref(false);

const descEl = ref<HTMLInputElement | null>(null);
const amountEl = ref<HTMLInputElement | null>(null);
const categoryEl = ref<HTMLSelectElement | null>(null);

watch(
  () => ledger.sortedCategories,
  (list) => {
    if (categoryId.value === null || !list.some((c) => c.id === categoryId.value)) {
      categoryId.value = list[0]?.id ?? null;
    }
  },
  { immediate: true },
);

function focusDescription() {
  descEl.value?.focus();
}
defineExpose({ focusDescription });

function onAmountInput(e: Event) {
  const el = e.target as HTMLInputElement;
  amount.value = formatAmountInput(el.value);
  el.value = amount.value;
  errors.value = { ...errors.value, amount: undefined };
}

async function submit() {
  if (submitting.value) return;
  const r = validateExpenseFields(description.value, amount.value, categoryId.value);
  if (!r.ok) {
    errors.value = r.errors;
    return;
  }
  errors.value = {};
  submitting.value = true;
  try {
    const ok = await ledger.addExpense({
      date: props.date,
      description: r.description,
      amount: r.amount,
      categoryId: r.categoryId,
    });
    if (ok) {
      description.value = '';
      amount.value = '';
      await nextTick();
      focusDescription();
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form class="expense-form" novalidate @submit.prevent>
    <label class="field">
      <span class="label">내용</span>
      <input
        ref="descEl"
        v-model="description"
        class="input"
        type="text"
        autocomplete="off"
        :aria-invalid="errors.description ? 'true' : undefined"
        @input="errors = { ...errors, description: undefined }"
        @keydown.enter.prevent="amountEl?.focus()"
      />
    </label>
    <p v-if="errors.description" class="error" role="alert">{{ errors.description }}</p>

    <div class="row">
      <label class="field grow">
        <span class="label">금액</span>
        <input
          ref="amountEl"
          class="input amount"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :value="amount"
          :aria-invalid="errors.amount ? 'true' : undefined"
          @input="onAmountInput"
          @keydown.enter.prevent="categoryEl?.focus()"
        />
      </label>
      <label class="field grow">
        <span class="label">분류</span>
        <select
          ref="categoryEl"
          v-model.number="categoryId"
          class="input"
          :aria-invalid="errors.category ? 'true' : undefined"
          @keydown.enter.prevent="submit"
        >
          <option v-for="c in ledger.sortedCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
    </div>
    <p v-if="errors.amount" class="error" role="alert">{{ errors.amount }}</p>
    <p v-if="errors.category" class="error" role="alert">{{ errors.category }}</p>

    <div class="actions">
      <button type="button" class="add" @click="submit">추가</button>
    </div>
  </form>
</template>

<style scoped>
.expense-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-top: 1px solid var(--border);
}
.row {
  display: flex;
  gap: var(--space-2);
}
.field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.grow {
  flex: 1;
}
.label {
  flex: none;
  color: var(--text-muted);
  font-size: 12px;
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
.amount {
  text-align: right;
}
.error {
  margin: 0;
  color: var(--danger);
  font-size: 12px;
}
.actions {
  display: flex;
  justify-content: flex-end;
}
.add {
  padding: var(--space-1) var(--space-3);
  background: var(--accent);
  color: var(--on-accent);
  border: 1px solid var(--accent);
  border-radius: var(--radius-chip);
}
</style>
