<script setup lang="ts">
import { onMounted } from 'vue';
import AppShell from '@/components/AppShell.vue';
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
    <main class="placeholder">가계부</main>
  </AppShell>
</template>

<style scoped>
.placeholder {
  padding: var(--space-4);
}
</style>
