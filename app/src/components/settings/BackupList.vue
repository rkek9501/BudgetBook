<script setup lang="ts">
import { onMounted, ref } from 'vue';
import * as api from '@/api/commands';
import type { BackupInfo } from '@/api/commands';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

withDefaults(defineProps<{ showFolderButton?: boolean }>(), { showFolderButton: true });
const emit = defineEmits<{ (e: 'restored'): void }>();

const backups = ref<BackupInfo[]>([]);
const loaded = ref(false);
const chosen = ref<BackupInfo | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    backups.value = await api.listBackups();
    loaded.value = true;
  } catch {
    error.value = '백업 목록을 불러오지 못했어요.';
  }
});

async function restore() {
  const target = chosen.value;
  if (!target || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await api.restoreBackup(target.fileName);
    chosen.value = null;
    emit('restored');
  } catch {
    chosen.value = null;
    error.value = '복원하지 못했어요. 지금 데이터는 그대로예요.';
  } finally {
    busy.value = false;
  }
}

async function openFolder() {
  error.value = null;
  try {
    await api.openBackupFolder();
  } catch {
    error.value = '백업 폴더를 열지 못했어요.';
  }
}
</script>

<template>
  <div class="backup-list">
    <p v-if="loaded && backups.length === 0" class="muted">보관된 백업이 없어요.</p>
    <ul v-else-if="loaded">
      <li v-for="b in backups" :key="b.fileName" data-testid="backup-item" class="backup-item">
        <span>{{ b.createdAt }}</span>
        <span class="muted">{{ b.expenseCount < 0 ? '확인 불가' : `지출 ${b.expenseCount}건` }}</span>
        <button type="button" data-testid="backup-restore" :disabled="busy" @click="chosen = b">복원</button>
      </li>
    </ul>

    <div v-if="showFolderButton" class="actions">
      <button type="button" @click="openFolder">백업 폴더 열기</button>
    </div>
    <p v-if="error" role="alert" class="inline-error">{{ error }}</p>

    <ConfirmDialog
      :open="chosen !== null"
      message="이 백업으로 되돌립니다. 지금 데이터는 먼저 보관됩니다."
      confirm-label="되돌리기"
      :danger="true"
      @confirm="restore"
      @cancel="chosen = null"
    />
  </div>
</template>

<style scoped>
.muted {
  color: var(--text-muted);
}
p {
  margin: 0 0 var(--space-3);
}
ul {
  list-style: none;
  margin: 0 0 var(--space-3);
  padding: 0;
  display: grid;
  gap: var(--space-1);
}
.backup-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-1) var(--space-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
}
.backup-item > span:first-child {
  flex: 1;
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
.inline-error {
  margin: var(--space-3) 0 0;
  color: var(--danger);
}
</style>
