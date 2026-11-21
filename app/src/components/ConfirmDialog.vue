<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }>(),
  { confirmLabel: '삭제', cancelLabel: '취소', danger: true },
);
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>();

const cancelBtn = ref<HTMLButtonElement | null>(null);
const confirmBtn = ref<HTMLButtonElement | null>(null);
let previous: HTMLElement | null = null;

async function onOpen() {
  previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  cancelBtn.value?.focus();
}

watch(
  () => props.open,
  (o) => {
    if (o) void onOpen();
    else {
      previous?.focus?.();
      previous = null;
    }
  },
);
onMounted(() => {
  if (props.open) void onOpen();
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    emit('cancel');
  } else if (e.key === 'Tab') {
    const a = cancelBtn.value;
    const b = confirmBtn.value;
    if (!a || !b) return;
    const active = document.activeElement;
    if (e.shiftKey && active === a) {
      e.preventDefault();
      b.focus();
    } else if (!e.shiftKey && active === b) {
      e.preventDefault();
      a.focus();
    } else if (active !== a && active !== b) {
      e.preventDefault();
      a.focus();
    }
  }
}
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('cancel')" @keydown="onKeydown">
    <div class="dialog" role="alertdialog" aria-modal="true" aria-label="확인">
      <p class="message">{{ message }}</p>
      <div class="actions">
        <button ref="cancelBtn" type="button" class="btn" @click="emit('cancel')">{{ cancelLabel }}</button>
        <button
          ref="confirmBtn"
          type="button"
          class="btn primary"
          :class="{ danger }"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}
.dialog {
  min-width: 260px;
  max-width: 360px;
  padding: var(--space-4);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-sheet);
}
.message {
  margin: 0 0 var(--space-4);
  white-space: pre-line;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.btn {
  padding: var(--space-1) var(--space-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.btn.primary.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--surface);
}
</style>
