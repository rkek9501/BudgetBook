<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onMenu, openBackupFolder } from '@/api/commands';
import { MESSAGES } from '@/domain/messages';
import { dialogOpen, useShortcuts } from '@/composables/useShortcuts';
import AppShell from '@/components/AppShell.vue';
import FixedExpenseSheet from '@/components/FixedExpenseSheet.vue';
import MainLayout from '@/components/MainLayout.vue';
import SettingsSheet from '@/components/SettingsSheet.vue';
import { flushAll } from '@/composables/useBeforeClose';
import { useAppearance } from '@/composables/useAppearance';
import { useLedgerStore } from '@/stores/ledger';

useAppearance();
useShortcuts();
const ledger = useLedgerStore();
const fixedOpen = ref(false);
const settingsOpen = ref(false);
const settingsTab = ref<'general' | 'categories' | 'data'>('general');
const settingsAction = ref<'import' | 'export' | null>(null);
async function onFixedSaved() {
  fixedOpen.value = false;
  try {
    await ledger.reload();
  } catch (e) {
    // db_unavailable은 스토어가 오류 화면으로 보낸다. 그 외에는 토스트로 알린다.
    if (!ledger.failDb(e)) ledger.toast = MESSAGES.loadFailed;
  }
}

function openSettings(tab: 'general' | 'categories' | 'data', action: 'import' | 'export' | null) {
  settingsTab.value = tab;
  settingsAction.value = action;
  settingsOpen.value = true;
}
function closeSettings() {
  settingsOpen.value = false;
  settingsAction.value = null;
}
async function onMenuId(id: string) {
  if (ledger.dbError !== null || dialogOpen()) return;
  switch (id) {
    case 'prev-month':
      await ledger.goPrev();
      break;
    case 'next-month':
      await ledger.goNext();
      break;
    case 'today':
      await ledger.goToday();
      break;
    case 'tab-day':
      if (ledger.selectedDate === null && ledger.today >= ledger.period.start && ledger.today <= ledger.period.end) {
        ledger.select(ledger.today);
      }
      ledger.setTab('day');
      break;
    case 'tab-summary':
      ledger.setTab('summary');
      break;
    case 'settings':
      openSettings('general', null);
      break;
    case 'import':
    case 'export':
      openSettings('data', id);
      break;
    case 'open-backups':
      try {
        await openBackupFolder();
      } catch {
        ledger.toast = MESSAGES.openFolderFailed;
      }
      break;
  }
}

let unlisten: (() => void) | null = null;
let closeBlocked = false;
let unlistenClose: (() => void) | null = null;
let disposed = false;
onMounted(() => {
  void ledger.init();
  // 창을 닫기 전에 입력 중인 메모 등을 저장한다. preventDefault를 부르지 않으므로 기다린 뒤 그대로 닫힌다.
  try {
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        const r = await flushAll(2000);
        if (r.ok) {
          closeBlocked = false;
          return;
        }
        // 저장 실패·시간 초과: 한 번만 막고 알린다. 다음 닫기는 결과와 상관없이 닫는다.
        if (!closeBlocked) {
          closeBlocked = true;
          event.preventDefault();
          ledger.toast = MESSAGES.memoCloseFailed;
        }
      })
      .then((u) => {
        if (disposed) u();
        else unlistenClose = u;
      })
      .catch(() => {});
  } catch {
    // Tauri 밖(브라우저 미리보기 등)에서는 창 API가 없다.
  }
  void onMenu((id) => void onMenuId(id)).then((u) => {
    if (disposed) u();
    else unlisten = u;
  });
});
onBeforeUnmount(() => {
  disposed = true;
  unlisten?.();
  unlistenClose?.();
});
</script>

<template>
  <AppShell>
    <MainLayout @open-fixed="fixedOpen = true" @open-settings="openSettings('general', null)" />
    <FixedExpenseSheet
      v-if="fixedOpen"
      :start-month="ledger.viewMonth"
      @close="fixedOpen = false"
      @saved="onFixedSaved"
    />
    <SettingsSheet
      v-if="settingsOpen"
      :initial-tab="settingsTab"
      :action="settingsAction"
      @action-done="settingsAction = null"
      @close="closeSettings"
    />
  </AppShell>
</template>
