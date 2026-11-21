<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { onMenu, openBackupFolder } from '@/api/commands';
import { MESSAGES } from '@/domain/messages';
import { useShortcuts } from '@/composables/useShortcuts';
import AppShell from '@/components/AppShell.vue';
import FixedExpenseSheet from '@/components/FixedExpenseSheet.vue';
import MainLayout from '@/components/MainLayout.vue';
import SettingsSheet from '@/components/SettingsSheet.vue';
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
  await ledger.reload();
}

function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
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
  if (dialogOpen()) return;
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
      if (ledger.selectedDate === null) ledger.select(ledger.today);
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
        ledger.toast = MESSAGES.saveFailed;
      }
      break;
  }
}

let unlisten: (() => void) | null = null;
let disposed = false;
onMounted(() => {
  void ledger.init();
  void onMenu((id) => void onMenuId(id)).then((u) => {
    if (disposed) u();
    else unlisten = u;
  });
});
onBeforeUnmount(() => {
  disposed = true;
  unlisten?.();
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
