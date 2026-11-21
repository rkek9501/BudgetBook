<script setup lang="ts">
import { computed, ref } from 'vue';
import { accountMonthOf, accountPeriod } from '@/domain/period';
import { MESSAGES } from '@/domain/messages';
import type { Appearance, Theme } from '@/domain/types';
import { useLedgerStore } from '@/stores/ledger';
import { useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();
const ledger = useLedgerStore();

const days = Array.from({ length: 31 }, (_, i) => i + 1);
const selected = ref(settings.accountingStartDay);
const error = ref('');
const busy = ref(false);

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const preview = computed(() => {
  const p = accountPeriod(accountMonthOf(ledger.today, selected.value), selected.value);
  return `이번 회계월: ${md(p.start)} ~ ${md(p.end)}`;
});
const dirty = computed(() => selected.value !== settings.accountingStartDay);

async function guarded(fn: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await fn();
  } catch {
    error.value = MESSAGES.saveFailed;
  } finally {
    busy.value = false;
  }
}

function applyStartDay() {
  const old = settings.accountingStartDay;
  const next = Number(selected.value);
  return guarded(async () => {
    await settings.setStartDay(next);
    await ledger.onStartDayChanged(old, next);
  });
}

const themes: { id: Theme; label: string; colors: [string, string, string] }[] = [
  { id: 'macos', label: 'macOS 기본', colors: ['#f5f5f7', '#ffffff', '#0060df'] },
  { id: 'diary', label: '따뜻한 다이어리', colors: ['#fff8e7', '#fbefd0', '#e28a00'] },
  { id: 'mono', label: '미니멀 모노톤', colors: ['#f2f2f2', '#ffffff', '#222222'] },
];
const appearances: { id: Appearance; label: string }[] = [
  { id: 'system', label: '시스템 따라감' },
  { id: 'light', label: '라이트' },
  { id: 'dark', label: '다크' },
];
const pickTheme = (t: Theme) => guarded(() => settings.setTheme(t));
const pickAppearance = (a: Appearance) => guarded(() => settings.setAppearance(a));
</script>

<template>
  <div class="general-tab">
    <section>
      <h3>회계 시작일</h3>
      <div class="row">
        <select v-model.number="selected" aria-label="회계 시작일">
          <option v-for="d in days" :key="d" :value="d">{{ d }}일</option>
        </select>
        <button type="button" class="btn primary" :disabled="!dirty || busy" @click="applyStartDay">
          적용
        </button>
      </div>
      <p class="preview">{{ preview }}</p>
    </section>

    <section>
      <h3>테마</h3>
      <div class="theme-cards">
        <button
          v-for="t in themes"
          :key="t.id"
          type="button"
          class="theme-card"
          :class="{ on: settings.theme === t.id }"
          :aria-pressed="settings.theme === t.id"
          :disabled="busy"
          @click="pickTheme(t.id)"
        >
          <span class="theme-swatch">
            <i v-for="c in t.colors" :key="c" :style="{ background: c }" />
          </span>
          <span>{{ t.label }}</span>
        </button>
      </div>
    </section>

    <section>
      <h3>화면 모드</h3>
      <div class="row" role="radiogroup" aria-label="화면 모드">
        <label v-for="a in appearances" :key="a.id" class="radio">
          <input
            type="radio"
            name="appearance"
            :value="a.id"
            :checked="settings.appearance === a.id"
            :disabled="busy"
            @change="pickAppearance(a.id)"
          />
          {{ a.label }}
        </label>
      </div>
    </section>

    <p v-if="error" class="tab-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.general-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
h3 {
  margin: 0 0 var(--space-2);
  font-size: 1em;
}
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.preview {
  margin: var(--space-2) 0 0;
  color: var(--text-muted);
}
select {
  padding: var(--space-1) var(--space-2);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.btn {
  padding: var(--space-1) var(--space-3);
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.btn:disabled {
  opacity: 0.5;
}
.theme-cards {
  display: flex;
  gap: var(--space-2);
}
.theme-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
}
.theme-card.on {
  outline: 2px solid var(--selected-ring);
}
.theme-swatch {
  display: flex;
  width: 60px;
  height: 24px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
.theme-swatch i {
  flex: 1;
}
.radio {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.tab-error {
  margin: 0;
  color: var(--danger);
}
</style>
