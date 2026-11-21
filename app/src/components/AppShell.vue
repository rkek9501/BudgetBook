<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useLedgerStore } from '@/stores/ledger';
import ErrorScreen from './ErrorScreen.vue';
import Toast from './Toast.vue';

const ledger = useLedgerStore();
const refresh = () => ledger.refreshToday();

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(refresh, 60_000);
  window.addEventListener('focus', refresh);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  window.removeEventListener('focus', refresh);
});
</script>

<template>
  <div class="shell">
    <div v-if="!ledger.ready" class="loading" aria-busy="true" />
    <ErrorScreen v-else-if="ledger.dbError !== null" />
    <slot v-else />
    <Toast />
  </div>
</template>

<style scoped>
.shell {
  height: 100%;
  background: var(--bg);
  color: var(--text);
}
.loading {
  height: 100%;
}
</style>
