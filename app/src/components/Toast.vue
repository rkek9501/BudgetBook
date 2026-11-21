<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { useLedgerStore } from '@/stores/ledger';

const ledger = useLedgerStore();
let timer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => ledger.toast,
  (msg) => {
    clearTimeout(timer);
    if (msg !== null) timer = setTimeout(() => ledger.clearToast(), 4000);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div v-if="ledger.toast !== null" class="toast" role="status" @click="ledger.clearToast()">
    {{ ledger.toast }}
  </div>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: var(--space-4);
  transform: translateX(-50%);
  max-width: min(420px, calc(100% - 2 * var(--space-4)));
  padding: var(--space-2) var(--space-3);
  background: var(--text);
  color: var(--bg);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-sheet);
  cursor: pointer;
  z-index: 100;
}
</style>
