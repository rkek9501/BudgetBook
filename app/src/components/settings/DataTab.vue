<script setup lang="ts">
import { ref, watch } from 'vue';
import { open, save } from '@tauri-apps/plugin-dialog';
import * as api from '@/api/commands';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import BackupList from './BackupList.vue';
import { parseWindowsData, type ImportPayload } from '@/domain/importWindows';
import { MESSAGES } from '@/domain/messages';
import { useLedgerStore } from '@/stores/ledger';

const props = defineProps<{ action?: 'import' | 'export' | null }>();
const emit = defineEmits<{ (e: 'action-done'): void }>();

const ledger = useLedgerStore();

const busy = ref(false);
const error = ref<string | null>(null);
const info = ref<string | null>(null);
const pending = ref<{ payload: ImportPayload; summary: string; unclassified: number } | null>(null);
const backupKey = ref(0);

function clear() {
  error.value = null;
  info.value = null;
}

async function startImport() {
  if (busy.value) return;
  busy.value = true;
  clear();
  try {
    const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (typeof path !== 'string') return;
    let text: string;
    try {
      text = await api.readTextFile(path);
    } catch {
      error.value = '파일을 읽을 수 없어요. data.json 파일인지 확인해 주세요.';
      return;
    }
    const r = parseWindowsData(text);
    if (!r.ok) {
      error.value =
        r.error === 'unsupported-format'
          ? '가계부 데이터 형식이 아니에요.'
          : '파일을 읽을 수 없어요. data.json 파일인지 확인해 주세요.';
      return;
    }
    const p = r.preview;
    pending.value = {
      payload: r.payload,
      unclassified: p.unclassified,
      summary: `카테고리 ${p.categories}개 · 지출 ${p.expenses}건 · 무지출 ${p.noExpenseDays}일 · 고정 지출 ${p.fixedItems}개 · 메모 ${p.notes}개`,
    };
  } catch {
    error.value = '파일을 읽을 수 없어요. data.json 파일인지 확인해 주세요.';
  } finally {
    busy.value = false;
  }
}

async function confirmImport() {
  const p = pending.value;
  if (!p || busy.value) return;
  busy.value = true;
  clear();
  let imported = false;
  try {
    const res = await api.importReplaceAll(p.payload);
    pending.value = null;
    info.value = `카테고리 ${res.categories}개, 지출 ${res.expenses}건, 무지출 ${res.noExpenseDays}일, 고정 지출 ${res.fixedItems}개, 메모 ${res.notes}개를 가져왔어요.`;
    backupKey.value++;
    imported = true;
  } catch (e) {
    pending.value = null;
    const code = e instanceof Error ? (e as { code?: unknown }).code : undefined;
    error.value = code === 'invalid_input' ? MESSAGES.importInvalid : MESSAGES.saveFailed;
  } finally {
    busy.value = false;
  }
  // init never rejects (failures go to ledger.dbError), so it is outside the save-failure try.
  if (imported) await ledger.init();
}

async function startExport() {
  if (busy.value) return;
  busy.value = true;
  clear();
  try {
    const path = await save({
      defaultPath: `가계부-${ledger.today.replace(/-/g, '')}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (typeof path !== 'string') return;
    await api.exportJson(path);
    info.value = '내보냈어요.';
  } catch {
    error.value = MESSAGES.saveFailed;
  } finally {
    busy.value = false;
  }
}

const queued = ref<'import' | 'export' | null>(null);
watch(
  () => props.action,
  (a) => {
    if (a === 'import' || a === 'export') queued.value = a;
  },
  { immediate: true },
);
watch(
  [queued, busy],
  () => {
    const a = queued.value;
    if (!a || busy.value) return;
    queued.value = null;
    emit('action-done');
    void (a === 'import' ? startImport() : startExport());
  },
  { immediate: true },
);

async function onRestored() {
  await ledger.init();
}
</script>

<template>
  <div class="data-tab">
    <section class="block">
      <h3>Windows 데이터 가져오기</h3>
      <p class="muted">Windows의 %LOCALAPPDATA%\Household_account_Book\data.json 파일을 선택하세요.</p>
      <button type="button" :disabled="busy" @click="startImport">가져오기…</button>
    </section>

    <section class="block">
      <h3>내보내기</h3>
      <button type="button" :disabled="busy" @click="startExport">JSON으로 내보내기…</button>
    </section>

    <p v-if="error" role="alert" class="tab-error">{{ error }}</p>
    <p v-if="info" role="status" class="tab-info">{{ info }}</p>

    <section class="block">
      <h3>자동 백업</h3>
      <BackupList :key="backupKey" @restored="onRestored" @db-lost="onRestored" />
    </section>

    <ConfirmDialog
      :open="pending !== null"
      :message="
        (pending ? pending.summary + '\n' : '') +
        (pending && pending.unclassified > 0
          ? `카테고리를 찾을 수 없는 ${pending.unclassified}건은 '미분류'로 가져와요.\n`
          : '') +
        '지금 데이터는 모두 지우고 가져온 데이터로 바꿉니다. 바꾸기 전에 자동으로 백업합니다.'
      "
      confirm-label="가져오기"
      :danger="true"
      @confirm="confirmImport"
      @cancel="pending = null"
    />
  </div>
</template>

<style scoped>
.data-tab {
  display: grid;
  gap: var(--space-4);
}
.block h3 {
  margin: 0 0 var(--space-2);
  font-size: 14px;
}
p {
  margin: 0 0 var(--space-2);
}
.muted {
  color: var(--text-muted);
}
button {
  padding: var(--space-1) var(--space-3);
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
.tab-error {
  margin: 0;
  color: var(--danger);
}
.tab-info {
  margin: 0;
  color: var(--text);
}
</style>
