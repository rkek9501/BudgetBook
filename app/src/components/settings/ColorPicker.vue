<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { normalizeHex, PALETTE, PRESETS } from '@/domain/categories';
import { MESSAGES } from '@/domain/messages';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  (e: 'invalid', v: boolean): void;
}>();

const text = ref(props.modelValue);
const invalid = ref(false);

watch(
  () => props.modelValue,
  (v) => {
    if (normalizeHex(text.value) !== v) {
      text.value = v;
      invalid.value = false;
      emit('invalid', false);
    }
  },
);

// 입력할 때마다 미리보기를 바로 갱신한다. 무효한 값은 모델에 반영하지 않는다.
const preview = computed(() => normalizeHex(text.value) ?? props.modelValue);

function onInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value;
  const n = normalizeHex(text.value);
  invalid.value = n === null;
  emit('invalid', invalid.value);
  if (n !== null && n !== props.modelValue) emit('update:modelValue', n);
}

function pick(hex: string) {
  text.value = hex;
  invalid.value = false;
  emit('invalid', false);
  emit('update:modelValue', hex);
}
</script>

<template>
  <div class="color-picker">
    <div class="presets">
      <button
        v-for="p in PRESETS"
        :key="p.name"
        type="button"
        class="swatch preset"
        :class="{ on: normalizeHex(p.color) === preview }"
        :aria-label="p.name"
        :title="p.name"
        :style="{ background: p.color }"
        @click="pick(p.color)"
      />
    </div>
    <div class="palette">
      <button
        v-for="c in PALETTE"
        :key="c"
        type="button"
        class="swatch palette-item"
        :class="{ on: normalizeHex(c) === preview }"
        :aria-label="c"
        :title="c"
        :style="{ background: c }"
        @click="pick(c)"
      />
    </div>
    <div class="hex-row">
      <span class="color-preview" :data-color="preview" :style="{ background: preview }" />
      <input
        class="hex-input"
        type="text"
        aria-label="HEX 색상"
        placeholder="#RRGGBB"
        :value="text"
        @input="onInput"
      />
    </div>
    <p v-if="invalid" class="color-error" role="alert">{{ MESSAGES.colorInvalid }}</p>
  </div>
</template>

<style scoped>
.color-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.presets,
.palette {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.swatch.on {
  outline: 2px solid var(--selected-ring);
  outline-offset: 1px;
}
.hex-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.color-preview {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.hex-input {
  width: 110px;
  padding: var(--space-1) var(--space-2);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.color-error {
  margin: 0;
  color: var(--danger);
  font-size: 0.9em;
}
</style>
