<script setup lang="ts">
import { ref } from 'vue';
import * as api from '@/api/commands';
import BackupList from '@/components/settings/BackupList.vue';
import { useLedgerStore } from '@/stores/ledger';

const ledger = useLedgerStore();

const detail = ref(ledger.dbError ?? '');
const busy = ref(false);
const showBackups = ref(false);
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
        <button type="button" :disabled="busy" @click="showBackups = !showBackups">백업에서 복원</button>
        <button type="button" :disabled="busy" @click="openFolder">백업 폴더 열기</button>
      </div>

      <BackupList v-if="showBackups" class="backups" :show-folder-button="false" @restored="ledger.init()" />

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
.inline-error {
  margin: var(--space-3) 0 0;
  color: var(--danger);
}
</style>
