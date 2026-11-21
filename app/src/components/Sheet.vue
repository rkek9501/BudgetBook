<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; title: string; busy?: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const dialog = ref<HTMLElement | null>(null);
const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
let previous: HTMLElement | null = null;

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function focusables(): HTMLElement[] {
  return Array.from(dialog.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
}

async function onOpen() {
  previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  const first = focusables()[0];
  (first ?? dialog.value)?.focus();
}

function onClosed() {
  previous?.focus?.();
  previous = null;
}

watch(
  () => props.open,
  (o) => {
    if (o) void onOpen();
    else onClosed();
  },
);
onMounted(() => {
  if (props.open) void onOpen();
});
onBeforeUnmount(() => {
  if (props.open) onClosed();
});

function onKeydown(e: KeyboardEvent) {
  // 안쪽 확인 대화상자가 이미 처리한 키는 무시한다.
  if (e.defaultPrevented) return;
  if (e.key === 'Escape' && props.busy) {
    e.preventDefault();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  } else if (e.key === 'Tab') {
    const list = focusables();
    if (list.length === 0) {
      e.preventDefault();
      dialog.value?.focus();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (!dialog.value?.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && (active === first || active === dialog.value)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-overlay">
      <div
        ref="dialog"
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <h2 :id="titleId" class="sheet-title">{{ title }}</h2>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay);
}
.sheet {
  display: flex;
  flex-direction: column;
  width: min(560px, calc(100vw - 2 * var(--space-4)));
  max-height: calc(100vh - 2 * var(--space-4));
  padding: var(--space-4);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-sheet);
  outline: none;
}
.sheet-title {
  margin: 0 0 var(--space-3);
  font-size: 1.1em;
}
</style>
