import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

vi.mock('@/api/commands', () => ({
  listBackups: vi.fn(),
  restoreBackup: vi.fn(),
  dbStatus: vi.fn(),
  openBackupFolder: vi.fn(),
}));
import * as api from '@/api/commands';
import BackupList from './BackupList.vue';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listBackups).mockResolvedValue([
    { fileName: 'a.db', createdAt: '2026-11-15 10:00', expenseCount: 12 },
    { fileName: 'b.db', createdAt: '2026-11-14 10:00', expenseCount: -1 },
  ]);
});

describe('BackupList', () => {
  it('목록: 지출 N건 / 확인 불가, 복원 확인 후 restored 방출', async () => {
    vi.mocked(api.restoreBackup).mockResolvedValue();
    const w = mount(BackupList);
    await flushPromises();
    expect(w.text()).toContain('지출 12건');
    expect(w.text()).toContain('확인 불가');
    await w.findAll('[data-testid="backup-restore"]')[0].trigger('click');
    await w.findAll('button').find((b) => b.text() === '되돌리기')!.trigger('click');
    await flushPromises();
    expect(api.restoreBackup).toHaveBeenCalledWith('a.db');
    expect(w.emitted('restored')).toHaveLength(1);
  });

  it('복원 실패는 인라인 오류, restored 없음', async () => {
    vi.mocked(api.restoreBackup).mockRejectedValue(new Error('x'));
    const w = mount(BackupList);
    await flushPromises();
    await w.find('[data-testid="backup-restore"]').trigger('click');
    await w.findAll('button').find((b) => b.text() === '되돌리기')!.trigger('click');
    await flushPromises();
    expect(w.emitted('restored')).toBeUndefined();
    expect(w.find('[role="alert"]').text()).toContain('복원하지 못했어요');
  });

  it('복원 실패 + DB를 다시 열 수 없으면 db-lost 방출, 그대로라는 문구 없음', async () => {
    vi.mocked(api.restoreBackup).mockRejectedValue(new Error('x'));
    vi.mocked(api.dbStatus).mockResolvedValue({ ok: false, error: 'damaged', backupError: null });
    const w = mount(BackupList);
    await flushPromises();
    await w.find('[data-testid="backup-restore"]').trigger('click');
    await w.findAll('button').find((b) => b.text() === '되돌리기')!.trigger('click');
    await flushPromises();
    expect(w.emitted('db-lost')).toHaveLength(1);
    expect(w.find('[role="alert"]').text()).not.toContain('그대로');
  });

  it('복원 실패 + DB가 열려 있으면 기존 문구, db-lost 없음', async () => {
    vi.mocked(api.restoreBackup).mockRejectedValue(new Error('x'));
    vi.mocked(api.dbStatus).mockResolvedValue({ ok: true, error: null, backupError: null });
    const w = mount(BackupList);
    await flushPromises();
    await w.find('[data-testid="backup-restore"]').trigger('click');
    await w.findAll('button').find((b) => b.text() === '되돌리기')!.trigger('click');
    await flushPromises();
    expect(w.emitted('db-lost')).toBeUndefined();
    expect(w.find('[role="alert"]').text()).toContain('지금 데이터는 그대로예요');
  });

  it('복원 성공 후 목록을 다시 불러오고 되돌렸어요 표시', async () => {
    vi.mocked(api.restoreBackup).mockResolvedValue();
    const w = mount(BackupList);
    await flushPromises();
    await w.find('[data-testid="backup-restore"]').trigger('click');
    await w.findAll('button').find((b) => b.text() === '되돌리기')!.trigger('click');
    await flushPromises();
    expect(api.listBackups).toHaveBeenCalledTimes(2);
    expect(w.text()).toContain('되돌렸어요.');
  });

  it('목록 로드 실패 → 다시 불러오기 → 목록 표시', async () => {
    vi.mocked(api.listBackups).mockRejectedValueOnce(new Error('x'));
    const w = mount(BackupList);
    await flushPromises();
    expect(w.find('[role="alert"]').text()).toContain('백업 목록을 불러오지 못했어요.');
    await w.findAll('button').find((b) => b.text() === '다시 불러오기')!.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('지출 12건');
    expect(w.find('[role="alert"]').exists()).toBe(false);
  });
});
