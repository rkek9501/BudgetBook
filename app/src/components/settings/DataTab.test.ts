import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/commands', () => ({
  readTextFile: vi.fn(),
  importReplaceAll: vi.fn(),
  exportJson: vi.fn(),
  listBackups: vi.fn(),
  restoreBackup: vi.fn(),
  openBackupFolder: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('@/domain/importWindows', () => ({ parseWindowsData: vi.fn() }));

import * as api from '@/api/commands';
import { open, save } from '@tauri-apps/plugin-dialog';
import { parseWindowsData } from '@/domain/importWindows';
import { useLedgerStore } from '@/stores/ledger';
import { MESSAGES } from '@/domain/messages';
import DataTab from './DataTab.vue';

const preview = { categories: 3, expenses: 10, noExpenseDays: 2, fixedItems: 1, notes: 4, unclassified: 0 };

function setup(props: Record<string, unknown> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const ledger = useLedgerStore();
  ledger.today = '2026-11-21';
  const init = vi.spyOn(ledger, 'init').mockResolvedValue();
  const w = mount(DataTab, { props, global: { plugins: [pinia] } });
  return { w, init };
}
const btn = (w: ReturnType<typeof setup>['w'], label: string) =>
  w.findAll('button').find((b) => b.text() === label);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listBackups).mockResolvedValue([
    { fileName: 'a.db', createdAt: '2026-11-15 10:00', expenseCount: 12 },
  ]);
});

async function pick(w: ReturnType<typeof setup>['w']) {
  vi.mocked(open).mockResolvedValue('C:/data.json');
  vi.mocked(api.readTextFile).mockResolvedValue('{}');
  await btn(w, '가져오기…')!.trigger('click');
  await flushPromises();
}

describe('DataTab', () => {
  it('안내 문구 표시', () => {
    const { w } = setup();
    expect(w.text()).toContain(String.raw`Windows의 %LOCALAPPDATA%\Household_account_Book\data.json 파일을 선택하세요.`);
  });

  it('형식이 다른 파일이면 오류 문구, importReplaceAll 호출 없음', async () => {
    vi.mocked(parseWindowsData).mockReturnValue({ ok: false, error: 'unsupported-format' });
    const { w } = setup();
    await pick(w);
    expect(w.text()).toContain('가계부 데이터 형식이 아니에요.');
    expect(api.importReplaceAll).not.toHaveBeenCalled();
  });

  it('JSON이 깨졌거나 읽기 실패면 읽을 수 없어요 문구', async () => {
    vi.mocked(parseWindowsData).mockReturnValue({ ok: false, error: 'invalid-json' });
    const { w } = setup();
    await pick(w);
    expect(w.find('[role="alert"]').text()).toBe('파일을 읽을 수 없어요. data.json 파일인지 확인해 주세요.');
    vi.mocked(api.readTextFile).mockRejectedValue(new Error('big'));
    await btn(w, '가져오기…')!.trigger('click');
    await flushPromises();
    expect(w.find('[role="alert"]').text()).toContain('파일을 읽을 수 없어요');
  });

  it('파일 선택 취소면 아무 일도 없음', async () => {
    vi.mocked(open).mockResolvedValue(null);
    const { w } = setup();
    await btn(w, '가져오기…')!.trigger('click');
    await flushPromises();
    expect(api.readTextFile).not.toHaveBeenCalled();
  });

  it('미리보기·확인 후 가져오기, 결과 표시, 이후 init', async () => {
    const payload = { x: 1 };
    vi.mocked(parseWindowsData).mockReturnValue({
      ok: true,
      payload,
      preview: { ...preview, unclassified: 2 },
    } as never);
    vi.mocked(api.importReplaceAll).mockResolvedValue({
      categories: 3, expenses: 10, noExpenseDays: 2, fixedItems: 1, notes: 4,
    });
    const { w, init } = setup();
    await pick(w);
    expect(w.text()).toContain('카테고리 3개 · 지출 10건 · 무지출 2일 · 고정 지출 1개 · 메모 4개');
    expect(w.text()).toContain("카테고리를 찾을 수 없는 2건은 '미분류'로 가져와요.");
    expect(w.text()).toContain('지금 데이터는 모두 지우고 가져온 데이터로 바꿉니다. 바꾸기 전에 자동으로 백업합니다.');
    expect(api.importReplaceAll).not.toHaveBeenCalled();
    await btn(w, '가져오기')!.trigger('click');
    await flushPromises();
    expect(api.importReplaceAll).toHaveBeenCalledWith(payload);
    expect(w.text()).toContain('카테고리 3개, 지출 10건, 무지출 2일, 고정 지출 1개, 메모 4개를 가져왔어요.');
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('확인 취소면 가져오지 않음, 실패면 saveFailed', async () => {
    vi.mocked(parseWindowsData).mockReturnValue({ ok: true, payload: {}, preview } as never);
    const { w, init } = setup();
    await pick(w);
    await btn(w, '취소')!.trigger('click');
    expect(api.importReplaceAll).not.toHaveBeenCalled();
    await btn(w, '가져오기…')!.trigger('click');
    await flushPromises();
    vi.mocked(api.importReplaceAll).mockRejectedValue(new Error('x'));
    await btn(w, '가져오기')!.trigger('click');
    await flushPromises();
    expect(w.find('[role="alert"]').text()).toBe(MESSAGES.saveFailed);
    expect(init).not.toHaveBeenCalled();
  });

  it('가져오기가 invalid_input으로 거부되면 전용 문구', async () => {
    const preview = { categories: 1, expenses: 0, noExpenseDays: 0, fixedItems: 0, notes: 0, unclassified: 0 };
    vi.mocked(parseWindowsData).mockReturnValue({ ok: true, payload: {}, preview } as never);
    const { w, init } = setup();
    await pick(w);
    vi.mocked(api.importReplaceAll).mockRejectedValue(Object.assign(new Error('x'), { code: 'invalid_input' }));
    await btn(w, '가져오기')!.trigger('click');
    await flushPromises();
    expect(w.find('[role="alert"]').text()).toBe(MESSAGES.importInvalid);
    expect(init).not.toHaveBeenCalled();
  });

  it('내보내기: 기본 파일명, exportJson, 완료 문구', async () => {
    vi.mocked(save).mockResolvedValue('C:/out.json');
    vi.mocked(api.exportJson).mockResolvedValue();
    const { w } = setup();
    await btn(w, 'JSON으로 내보내기…')!.trigger('click');
    await flushPromises();
    expect(vi.mocked(save).mock.calls[0][0]).toMatchObject({ defaultPath: '가계부-20261121.json' });
    expect(api.exportJson).toHaveBeenCalledWith('C:/out.json');
    expect(w.text()).toContain('내보냈어요.');
  });

  it('내보내기 취소면 exportJson 없음, 실패면 saveFailed', async () => {
    vi.mocked(save).mockResolvedValue(null);
    const { w } = setup();
    await btn(w, 'JSON으로 내보내기…')!.trigger('click');
    await flushPromises();
    expect(api.exportJson).not.toHaveBeenCalled();
    vi.mocked(save).mockResolvedValue('C:/o.json');
    vi.mocked(api.exportJson).mockRejectedValue(new Error('x'));
    await btn(w, 'JSON으로 내보내기…')!.trigger('click');
    await flushPromises();
    expect(w.find('[role="alert"]').text()).toBe(MESSAGES.saveFailed);
  });

  it('복원 확인 후 restoreBackup(fileName), 이후 init', async () => {
    vi.mocked(api.restoreBackup).mockResolvedValue();
    const { w, init } = setup();
    await flushPromises();
    expect(w.text()).toContain('지출 12건');
    await w.find('[data-testid="backup-restore"]').trigger('click');
    expect(w.text()).toContain('이 백업으로 되돌립니다. 지금 데이터는 먼저 보관됩니다.');
    expect(api.restoreBackup).not.toHaveBeenCalled();
    await btn(w, '되돌리기')!.trigger('click');
    await flushPromises();
    expect(api.restoreBackup).toHaveBeenCalledWith('a.db');
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('action prop: 마운트 시 가져오기 시작 후 action-done 한 번', async () => {
    vi.mocked(open).mockResolvedValue(null);
    const { w } = setup({ action: 'import' });
    await flushPromises();
    expect(open).toHaveBeenCalledTimes(1);
    expect(w.emitted('action-done')).toHaveLength(1);
    await w.setProps({ action: null });
    await w.setProps({ action: 'export' });
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(1);
    expect(w.emitted('action-done')).toHaveLength(2);
  });

  it('init이 dbError를 설정해도 가져오기 성공이면 saveFailed 없음', async () => {
    vi.mocked(parseWindowsData).mockReturnValue({ ok: true, payload: {}, preview } as never);
    vi.mocked(api.importReplaceAll).mockResolvedValue({
      categories: 1, expenses: 1, noExpenseDays: 0, fixedItems: 0, notes: 0,
    });
    const { w, init } = setup();
    const ledger = useLedgerStore();
    init.mockImplementation(async () => {
      ledger.dbError = 'boom';
    });
    await pick(w);
    await btn(w, '가져오기')!.trigger('click');
    await flushPromises();
    expect(w.text()).not.toContain(MESSAGES.saveFailed);
    expect(w.text()).toContain('가져왔어요.');
  });

  it('busy 중 도착한 action은 busy가 풀린 뒤 시작되고 그때 action-done', async () => {
    let release!: (v: string | null) => void;
    vi.mocked(open).mockReturnValue(new Promise((r) => (release = r)) as never);
    vi.mocked(save).mockResolvedValue(null);
    const { w } = setup();
    await btn(w, '가져오기…')!.trigger('click');
    await w.setProps({ action: 'export' });
    await flushPromises();
    expect(save).not.toHaveBeenCalled();
    expect(w.emitted('action-done')).toBeUndefined();
    release(null);
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(1);
    expect(w.emitted('action-done')).toHaveLength(1);
  });
});
