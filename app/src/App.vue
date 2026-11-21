<script setup lang="ts">
import { onMounted } from 'vue';
import AppShell from '@/components/AppShell.vue';
import MainLayout from '@/components/MainLayout.vue';
import { useAppearance } from '@/composables/useAppearance';
import { useLedgerStore } from '@/stores/ledger';

useAppearance();
const ledger = useLedgerStore();
onMounted(() => {
  void ledger.init();
});
</script>

<template>
  <AppShell>
    <MainLayout />
  </AppShell>
</template>

