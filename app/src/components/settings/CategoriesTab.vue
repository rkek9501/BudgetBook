<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import * as api from '@/api/commands';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { MESSAGES } from '@/domain/messages';
import { PRESETS } from '@/domain/categories';
import { useLedgerStore } from '@/stores/ledger';
import ColorPicker from './ColorPicker.vue';
import CategoryDeleteDialog from './CategoryDeleteDialog.vue';

const ledger = useLedgerStore();

const selectedId = ref<number | null>(null);
const editName = ref('');
const editColor = ref(PRESETS[0].color);
const newName = ref('');
const newColor = ref(PRESETS[0].color);
const editError = ref('');
const addError = ref('');
const busy = ref(false);

const selected = computed(() => ledger.sortedCategories.find((c) => c.id === selectedId.value) ?? null);

function select(id: number) {
  const c = ledger.sortedCategories.find((x) => x.id === id);
  if (!c) return;
  selectedId.value = id;
  editName.value = c.name;
  editColor.value = c.color;
  editError.value = '';
}

// 선택한 카테고리가 목록에서 사라지면 편집 영역을 닫는다.
watch(selected, (c) => {
  if (!c) selectedId.value = null;
});

function messageFor(e: unknown): string {
  const code = e instanceof api.ApiError ? e.code : '';
  if (code === 'duplicate_name') return MESSAGES.categoryDuplicate;
  if (code === 'last_category') return MESSAGES.lastCategory;
  if (code === 'invalid_input') return MESSAGES.colorInvalid;
  return MESSAGES.saveFailed;
}

async function refresh(): Promise<boolean> {
  try {
    await ledger.refreshCategories();
    await ledger.reload();
    return true;
  } catch {
    return false;
  }
}

async function run(setError: (m: string) => void, fn: () => Promise<void>): Promise<boolean> {
  if (busy.value) return false;
  busy.value = true;
  setError('');
  try {
    try {
      await fn();
    } catch (e) {
      setError(messageFor(e));
      return false;
    }
    if (!(await refresh())) {
      setError(MESSAGES.saveFailed);
      return false;
    }
    return true;
  } finally {
    busy.value = false;
  }
}

async function save() {
  const c = selected.value;
  if (!c) return;
  const name = editName.value.trim();
  if (!name) {
    editError.value = MESSAGES.categoryNameRequired;
    return;
  }
  await run(
    (m) => (editError.value = m),
    async () => {
      await api.updateCategory(c.id, name, editColor.value);
    },
  );
}

async function add() {
  const name = newName.value.trim();
  if (!name) {
    addError.value = MESSAGES.categoryNameRequired;
    return;
  }
  const ok = await run(
    (m) => (addError.value = m),
    async () => {
      await api.createCategory(name, newColor.value);
    },
  );
  if (ok) {
    newName.value = '';
    newColor.value = PRESETS[0].color;
  }
}

// ----- 삭제 -----
const confirmState = ref<{ message: string } | null>(null);
const moveState = ref<{ expenseCount: number; noteCount: number } | null>(null);

async function startDelete() {
  const c = selected.value;
  if (!c || busy.value) return;
  busy.value = true;
  editError.value = '';
  try {
    const u = await api.categoryUsage(c.id);
    if (u.expenseCount > 0) moveState.value = u;
    else if (u.noteCount > 0)
      confirmState.value = { message: MESSAGES.confirmDeleteCategoryWithNotes(c.name, u.noteCount) };
    else confirmState.value = { message: MESSAGES.confirmDeleteCategory(c.name) };
  } catch (e) {
    editError.value = messageFor(e);
  } finally {
    busy.value = false;
  }
}

async function doDelete(moveTo: number | null) {
  const c = selected.value;
  if (!c) return;
  const ok = await run(
    (m) => (editError.value = m),
    async () => {
      await api.deleteCategory(c.id, moveTo);
    },
  );
  confirmState.value = null;
  moveState.value = null;
  if (ok) selectedId.value = null;
}

const targets = computed(() => ledger.sortedCategories.filter((c) => c.id !== selectedId.value));
</script>

<template>
  <div class="categories-tab">
    <ul class="cat-list">
      <li v-for="c in ledger.sortedCategories" :key="c.id">
        <button
          type="button"
          class="cat-item"
          :class="{ on: c.id === selectedId }"
          :aria-pressed="c.id === selectedId"
          @click="select(c.id)"
        >
          <span class="dot" :style="{ background: c.color }" />
          <span class="cat-name">{{ c.name }}</span>
        </button>
      </li>
    </ul>

    <section v-if="selected" class="edit-area" aria-label="카테고리 편집">
      <input v-model="editName" class="name-input edit-name" type="text" aria-label="카테고리 이름" />
      <ColorPicker v-model="editColor" />
      <div class="actions">
        <button type="button" class="btn danger" :disabled="busy" @click="startDelete">삭제</button>
        <button type="button" class="btn primary" :disabled="busy" @click="save">저장</button>
      </div>
      <p v-if="editError" class="tab-error edit-error" role="alert">{{ editError }}</p>
    </section>

    <section class="add-area" aria-label="카테고리 추가">
      <h3>새 카테고리</h3>
      <input v-model="newName" class="name-input add-name" type="text" aria-label="새 카테고리 이름" />
      <ColorPicker v-model="newColor" />
      <div class="actions">
        <button type="button" class="btn primary" :disabled="busy" @click="add">추가</button>
      </div>
      <p v-if="addError" class="tab-error add-error" role="alert">{{ addError }}</p>
    </section>

    <ConfirmDialog
      :open="confirmState !== null"
      :message="confirmState?.message ?? ''"
      @confirm="doDelete(null)"
      @cancel="confirmState = null"
    />
    <CategoryDeleteDialog
      v-if="moveState && selected"
      :name="selected.name"
      :expense-count="moveState.expenseCount"
      :note-count="moveState.noteCount"
      :targets="targets"
      :busy="busy"
      @confirm="doDelete"
      @cancel="moveState = null"
    />
  </div>
</template>

<style scoped>
.categories-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.cat-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.cat-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.cat-item.on {
  outline: 2px solid var(--selected-ring);
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.edit-area,
.add-area {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
}
h3 {
  margin: 0;
  font-size: 1em;
}
.name-input {
  padding: var(--space-1) var(--space-2);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
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
.btn.danger {
  color: var(--danger);
}
.btn:disabled {
  opacity: 0.5;
}
.tab-error {
  margin: 0;
  color: var(--danger);
}
</style>
