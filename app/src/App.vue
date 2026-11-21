<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '@/components/AppShell.vue';
import FixedExpenseSheet from '@/components/FixedExpenseSheet.vue';
import MainLayout from '@/components/MainLayout.vue';
import { useAppearance } from '@/composables/useAppearance';
import { useLedgerStore } from '@/stores/ledger';

useAppearance();
const ledger = useLedgerStore();
const fixedOpen = ref(false);
async function onFixedSaved() {
  fixedOpen.value = false;
  await ledger.reload();
}
onMounted(() => {
  void ledger.init();
});
</script>

<template>
  <AppShell>
    <MainLayout @open-fixed="fixedOpen = true" />
    <FixedExpenseSheet
      v-if="fixedOpen"
      :start-month="ledger.viewMonth"
      @close="fixedOpen = false"
      @saved="onFixedSaved"
    />
  </AppShell>
</template>
