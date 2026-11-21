<script setup lang="ts">
import { ref } from 'vue';
import * as api from '@/api/commands';
import type { BackupInfo } from '@/api/commands';
import { useLedgerStore } from '@/stores/ledger';

const ledger = useLedgerStore();

const detail = ref(ledger.dbError ?? '');
const busy = ref(false);
const showBackups = ref(false);
const backups = ref<BackupInfo[]>([]);
const chosen = ref<BackupInfo | null>(null);
const inlineError = ref<string | null>(null);

async function retry() {
  if (busy.value) return;
  busy.value = true;
  inlineError.value = null;
  try {
    const status = await api.retryOpen();
    if (status.ok) await ledger.init();
    else detail.value = status.error ?? 'unknown';
  } catch (e) {
    detail.value = (e instanceof Error && e.message) || 'unknown';
  } finally {
    busy.value = false;
  }
}

async function openBackups() {
  inlineError.value = null;
  chosen.value = null;
  try {
    backups.value = await api.listBackups();
    showBackups.value = true;
  } catch {
    inlineError.value = '백업 목록을 불러오지 못했어요.';
  }
}

async function restore() {
  const target = chosen.value;
  if (!target || busy.value) return;
  busy.value = true;
  inlineError.value = null;
  try {
    await api.restoreBackup(target.fileName);
    await ledger.init();
  } catch (e) {
    inlineError.value = '복원하지 못했어요. 지금 데이터는 그대로예요.';
    detail.value = (e instanceof Error && e.message) || detail.value;
  } finally {
    busy.value = false;
  }
}

async function openFolder() {
  inlineError.value = null;
  try {
    await api.openBackupFolder();
  } catch {
    inlineError.value = '백업 폴더를 열지 못했어요.';
  }
}
</script>

<template>
  <main class="error-screen">
    <section class="card">
      <h1>가계부 데이터를 열 수 없어요</h1>
      <p>파일은 그대로 두었어요. 다시 시도하거나 백업에서 되돌릴 수 있어요.</p>

      <details class="detail">
        <summary>자세히</summary>
        <pre>{{ detail }}</pre>
      </details>

      <div class="actions">
        <button type="button" class="primary" :disabled="busy" @click="retry">다시 시도</button>
        <button type="button" :disabled="busy" @click="openBackups">백업에서 복원</button>
        <button type="button" :disabled="busy" @click="openFolder">백업 폴더 열기</button>
      </div>

      <div v-if="showBackups" class="backups">
        <p v-if="backups.length === 0" class="muted">보관된 백업이 없어요.</p>
        <ul v-else>
          <li v-for="b in backups" :key="b.fileName">
            <button
              type="button"
              data-testid="backup-item"
              class="backup-item"
              :aria-pressed="chosen?.fileName === b.fileName"
              :disabled="busy"
              @click="chosen = b"
            >
              <span>{{ b.createdAt }}</span>
              <span class="amount muted">{{ b.expenseCount < 0 ? '확인 불가' : `지출 ${b.expenseCount}건` }}</span>
            </button>
          </li>
        </ul>

        <div v-if="chosen" class="confirm">
          <p>이 백업으로 되돌립니다. 지금 데이터는 먼저 보관됩니다.</p>
          <div class="actions">
            <button type="button" class="primary" :disabled="busy" @click="restore">되돌리기</button>
            <button type="button" :disabled="busy" @click="chosen = null">취소</button>
          </div>
        </div>
      </div>

      <p v-if="inlineError" role="alert" class="inline-error">{{ inlineError }}</p>
    </section>
  </main>
</template>

<style scoped>
.error-screen {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: var(--space-4);
}
.card {
  width: min(480px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-sheet);
  padding: var(--space-4);
}
h1 {
  margin: 0 0 var(--space-2);
  font-size: 18px;
}
p {
  margin: 0 0 var(--space-3);
}
.muted {
  color: var(--text-muted);
}
.detail {
  margin-bottom: var(--space-3);
  color: var(--text-muted);
}
.detail pre {
  margin: var(--space-2) 0 0;
  padding: var(--space-2);
  background: var(--surface-2);
  border-radius: var(--radius-chip);
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
button {
  padding: var(--space-2) var(--space-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
.backups {
  margin-top: var(--space-3);
}
.backups ul {
  list-style: none;
  margin: 0 0 var(--space-3);
  padding: 0;
  display: grid;
  gap: var(--space-1);
}
.backup-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  border-radius: var(--radius-card);
}
.backup-item[aria-pressed='true'] {
  border-color: var(--selected-ring);
  box-shadow: 0 0 0 1px var(--selected-ring);
}
.inline-error {
  margin: var(--space-3) 0 0;
  color: var(--danger);
}
</style>
