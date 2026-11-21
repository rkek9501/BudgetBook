<script setup lang="ts">
import { ref } from 'vue';
import type { Category } from '@/domain/types';

const props = defineProps<{
  name: string;
  expenseCount: number;
  noteCount: number;
  targets: Category[];
  busy?: boolean;
}>();
const emit = defineEmits<{ (e: 'confirm', targetId: number): void; (e: 'cancel'): void }>();

const target = ref<number>(props.targets[0]?.id ?? 0);
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')" @keydown.esc.stop.prevent="emit('cancel')">
    <div class="dialog" role="alertdialog" aria-modal="true" aria-label="카테고리 삭제">
      <h3 class="title">'{{ name }}' 삭제</h3>
      <p>지출 {{ expenseCount }}건을 옮길 카테고리를 고르세요.</p>
      <p v-if="noteCount > 0">메모 {{ noteCount }}개도 함께 옮겨요.</p>
      <select v-model.number="target" aria-label="옮길 카테고리">
        <option v-for="c in targets" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <div class="actions">
        <button type="button" class="btn" @click="emit('cancel')">취소</button>
        <button
          type="button"
          class="btn primary"
          :disabled="busy || !targets.length"
          @click="emit('confirm', target)"
        >
          옮기고 삭제
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
  background: var(--overlay);
}
.dialog {
  min-width: 280px;
  max-width: 380px;
  padding: var(--space-4);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-sheet);
}
.title {
  margin: 0 0 var(--space-2);
  font-size: 1.05em;
}
p {
  margin: 0 0 var(--space-2);
}
select {
  width: 100%;
  margin-bottom: var(--space-4);
  padding: var(--space-1) var(--space-2);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.btn {
  padding: var(--space-1) var(--space-3);
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.btn.primary {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--surface);
}
.btn:disabled {
  opacity: 0.5;
}
</style>
