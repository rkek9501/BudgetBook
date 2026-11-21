<script setup lang="ts">
import { ref } from 'vue';
import Sheet from '@/components/Sheet.vue';
import CategoriesTab from './settings/CategoriesTab.vue';
import DataTab from './settings/DataTab.vue';
import GeneralTab from './settings/GeneralTab.vue';

const props = defineProps<{ initialTab?: 'general' | 'categories' | 'data'; action?: 'import' | 'export' | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'action-done'): void }>();

type TabId = 'general' | 'categories' | 'data';
const tabs: { id: TabId; label: string }[] = [
  { id: 'general', label: '일반' },
  { id: 'categories', label: '카테고리' },
  { id: 'data', label: '데이터' },
];
const tab = ref<TabId>(props.initialTab ?? 'general');
</script>

<template>
  <Sheet :open="true" title="설정" @close="emit('close')">
    <div class="tabs" role="tablist">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        role="tab"
        class="tab"
        :class="{ on: tab === t.id }"
        :aria-selected="tab === t.id"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>
    <div class="tab-body" role="tabpanel">
      <GeneralTab v-if="tab === 'general'" />
      <CategoriesTab v-else-if="tab === 'categories'" />
      <DataTab v-else :action="props.action" @action-done="emit('action-done')" />
    </div>
    <div class="footer">
      <button type="button" class="btn" @click="emit('close')">닫기</button>
    </div>
  </Sheet>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: var(--space-1) var(--space-3);
  background: none;
  color: var(--text-muted);
  border: 0;
  border-bottom: 2px solid transparent;
}
.tab.on {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.tab-body {
  overflow: auto;
  min-height: 200px;
}
.footer {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-3);
}
.btn {
  padding: var(--space-1) var(--space-3);
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-chip);
}
</style>
