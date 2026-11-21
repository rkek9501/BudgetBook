import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';

vi.mock('@/api/commands', () => ({
  retryOpen: vi.fn(),
  listBackups: vi.fn(),
  restoreBackup: vi.fn(),
  openBackupFolder: vi.fn(),
  setSetting: vi.fn(),
}));

import * as api from '@/api/commands';
import { useLedgerStore } from '@/stores/ledger';
import ErrorScreen from './ErrorScreen.vue';

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const ledger = useLedgerStore();
  ledger.dbError = 'database disk image is malformed';
  const init = vi.spyOn(ledger, 'init').mockResolvedValue();
  const w = mount(ErrorScreen, { global: { plugins: [pinia] } });
  return { w, ledger, init };
}
const btn = (w: ReturnType<typeof setup>['w'], label: string) =>
  w.findAll('button').find((b) => b.text() === label);

describe('ErrorScreen', () => {
  beforeEach(() => vi.resetAllMocks());

  it('오류 화면에 세 버튼, 원문은 자세히 안에만', () => {
    const { w } = setup();
    expect(w.text()).toContain('가계부 데이터를 열 수 없어요');
    expect(btn(w, '다시 시도')).toBeTruthy();
    expect(btn(w, '백업에서 복원')).toBeTruthy();
    expect(btn(w, '백업 폴더 열기')).toBeTruthy();
    expect(w.find('h1').text()).not.toContain('malformed');
    expect(w.find('details').text()).toContain('database disk image is malformed');
  });

  it('다시 시도 성공 시 init 호출', async () => {
    vi.mocked(api.retryOpen).mockResolvedValue({ ok: true, error: null, backupError: null });
    const { w, init } = setup();
    await btn(w, '다시 시도')!.trigger('click');
    await flushPromises();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('다시 시도 실패 시 init 없이 자세히 문구 갱신', async () => {
    vi.mocked(api.retryOpen).mockResolvedValue({ ok: false, error: 'locked', backupError: null });
    const { w, init } = setup();
    await btn(w, '다시 시도')!.trigger('click');
    await flushPromises();
    expect(init).not.toHaveBeenCalled();
    expect(w.find('details').text()).toContain('locked');
  });

  it('백업 목록: 지출 N건 / 확인 불가, 선택 → 확인 → restore → init', async () => {
    vi.mocked(api.listBackups).mockResolvedValue([
      { fileName: 'a.db', createdAt: '2026-11-15 10:00', expenseCount: 12 },
      { fileName: 'b.db', createdAt: '2026-11-14 10:00', expenseCount: -1 },
    ]);
    vi.mocked(api.restoreBackup).mockResolvedValue();
    const { w, init } = setup();
    await btn(w, '백업에서 복원')!.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('2026-11-15 10:00');
    expect(w.text()).toContain('지출 12건');
    expect(w.text()).toContain('확인 불가');
    await w.findAll('[data-testid="backup-restore"]')[0].trigger('click');
    expect(w.text()).toContain('이 백업으로 되돌립니다. 지금 데이터는 먼저 보관됩니다.');
    expect(api.restoreBackup).not.toHaveBeenCalled();
    await btn(w, '되돌리기')!.trigger('click');
    await flushPromises();
    expect(api.restoreBackup).toHaveBeenCalledWith('a.db');
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('복원 실패는 인라인 오류, init 호출 안 함', async () => {
    vi.mocked(api.listBackups).mockResolvedValue([
      { fileName: 'a.db', createdAt: 't', expenseCount: 1 },
    ]);
    vi.mocked(api.restoreBackup).mockRejectedValue(new Error('boom'));
    const { w, init } = setup();
    await btn(w, '백업에서 복원')!.trigger('click');
    await flushPromises();
    await w.find('[data-testid="backup-restore"]').trigger('click');
    await btn(w, '되돌리기')!.trigger('click');
    await flushPromises();
    expect(init).not.toHaveBeenCalled();
    expect(w.find('[role="alert"]').text()).toContain('복원하지 못했어요');
  });

  it('백업 폴더 열기', async () => {
    vi.mocked(api.openBackupFolder).mockResolvedValue();
    const { w } = setup();
    await btn(w, '백업 폴더 열기')!.trigger('click');
    expect(api.openBackupFolder).toHaveBeenCalled();
  });
});
