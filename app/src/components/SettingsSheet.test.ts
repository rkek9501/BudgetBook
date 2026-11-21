import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/commands', () => ({
  listBackups: vi.fn().mockResolvedValue([]),
  restoreBackup: vi.fn(),
  openBackupFolder: vi.fn(),
  exportJson: vi.fn(),
  readTextFile: vi.fn(),
  importReplaceAll: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
import { save } from '@tauri-apps/plugin-dialog';
import { useLedgerStore } from '@/stores/ledger';
import SettingsSheet from './SettingsSheet.vue';

beforeEach(() => vi.clearAllMocks());

describe('SettingsSheet', () => {
  it('initialTab=data + action=export 이면 내보내기 시작, action-done 전달', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useLedgerStore().today = '2026-11-21';
    vi.mocked(save).mockResolvedValue(null);
    const w = mount(SettingsSheet, {
      props: { initialTab: 'data', action: 'export' },
      global: { plugins: [pinia] },
    });
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(1);
    expect(w.emitted('action-done')).toHaveLength(1);
  });
});
