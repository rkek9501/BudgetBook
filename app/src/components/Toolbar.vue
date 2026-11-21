<script setup lang="ts">
import { formatMonthTitle } from '@/domain/dates';
import { formatWon } from '@/domain/money';
import { useLedgerStore } from '@/stores/ledger';

const ledger = useLedgerStore();
defineEmits<{ (e: 'open-settings'): void }>();
</script>

<template>
  <header class="toolbar">
    <div class="top">
      <button type="button" class="icon-btn" aria-label="이전 회계월" @click="ledger.goPrev()">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <h1 class="title">{{ formatMonthTitle(ledger.viewMonth) }}</h1>
      <button type="button" class="icon-btn" aria-label="다음 회계월" @click="ledger.goNext()">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <button type="button" class="btn" @click="ledger.goToday()">오늘</button>
      <span class="spacer" />
      <button type="button" class="btn ghost" @click="$emit('open-settings')">설정</button>
    </div>
    <p class="summary">
      <span>지출 <b class="amount">{{ formatWon(ledger.summary.variableTotal) }}원</b></span>
      <span class="dot" aria-hidden="true">·</span>
      <span>고정 <b class="amount">{{ formatWon(ledger.summary.fixedTotal) }}원</b></span>
      <span class="dot" aria-hidden="true">·</span>
      <span>합계 <b class="amount total">{{ formatWon(ledger.summary.grandTotal) }}원</b></span>
    </p>
  </header>
</template>

<style scoped>
.toolbar {
  padding: var(--space-4) var(--space-4) var(--space-3);
}
.top {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.title {
  min-width: 7.5em;
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-align: center;
}
.spacer {
  flex: 1;
}
.icon-btn,
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
  transition: background 120ms ease;
}
.icon-btn {
  width: 30px;
}
.btn {
  padding: 0 var(--space-3);
  font-size: 13px;
}
.btn.ghost {
  background: transparent;
  color: var(--text-muted);
}
.icon-btn:hover,
.btn:hover {
  background: var(--surface-2);
}
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: var(--space-2) 0 0;
  font-size: 13px;
  color: var(--text-muted);
}
.summary b {
  font-weight: 600;
  color: var(--text);
}
.summary .total {
  color: var(--accent);
}
.dot {
  opacity: 0.6;
}
</style>
