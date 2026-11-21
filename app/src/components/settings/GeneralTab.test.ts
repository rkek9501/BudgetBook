import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import GeneralTab from './GeneralTab.vue';
import ColorPicker from './ColorPicker.vue';
import { useLedgerStore } from '@/stores/ledger';
import { useSettingsStore } from '@/stores/settings';
import { MESSAGES } from '@/domain/messages';

vi.mock('@/api/commands', () => ({ setSetting: vi.fn() }));

function setup(_attach = false) {
  setActivePinia(createPinia());
  const settings = useSettingsStore();
  const ledger = useLedgerStore();
  ledger.today = '2026-11-21';
  const setStartDay = vi.spyOn(settings, 'setStartDay').mockResolvedValue();
  const setAppearance = vi.spyOn(settings, 'setAppearance').mockResolvedValue();
  const setTheme = vi.spyOn(settings, 'setTheme').mockResolvedValue();
  const changed = vi.spyOn(ledger, 'onStartDayChanged').mockResolvedValue();
  const w = mount(GeneralTab, { attachTo: document.body });
  return { w, settings, setStartDay, setAppearance, setTheme, changed };
}

beforeEach(() => vi.clearAllMocks());

describe('GeneralTab', () => {
  it('setAppearance 실패 → 이전 라디오로 복귀하고 saveFailed 표시', async () => {
    const { w, setAppearance } = setup(true);
    setAppearance.mockRejectedValueOnce(new Error('x'));
    const radios = w.findAll('input[type=radio]');
    expect((radios[0].element as HTMLInputElement).checked).toBe(true);
    (radios[2].element as HTMLInputElement).checked = true;
    await radios[2].trigger('change');
    await flushPromises();
    expect((radios[0].element as HTMLInputElement).checked).toBe(true);
    expect((radios[2].element as HTMLInputElement).checked).toBe(false);
    expect(w.find('.tab-error').text()).toBe(MESSAGES.saveFailed);
  });

  it('시작일 선택 시 미리보기, 적용 시 onStartDayChanged(old,new)', async () => {
    const { w, setStartDay, changed } = setup();
    expect(w.text()).toContain('이번 회계월: 11/1 ~ 11/30');
    const apply = w.findAll('button').find((b) => b.text() === '적용')!;
    expect(apply.attributes('disabled')).toBeDefined();
    await w.find('select').setValue('25');
    expect(w.text()).toContain('이번 회계월: 10/25 ~ 11/24');
    expect(setStartDay).not.toHaveBeenCalled();
    await apply.trigger('click');
    await flushPromises();
    expect(setStartDay).toHaveBeenCalledWith(25);
    expect(changed).toHaveBeenCalledWith(1, 25);
  });

  it('화면 모드 다크 선택 → setAppearance("dark")', async () => {
    const { w, setAppearance } = setup();
    await w.findAll('input[type=radio]')[2].setValue(true);
    await flushPromises();
    expect(setAppearance).toHaveBeenCalledWith('dark');
  });

  it('테마 카드 선택 → setTheme, 실패하면 saveFailed', async () => {
    const { w, setTheme } = setup();
    setTheme.mockRejectedValueOnce(new Error('x'));
    await w.findAll('.theme-card')[1].trigger('click');
    await flushPromises();
    expect(setTheme).toHaveBeenCalledWith('diary');
    expect(w.find('.tab-error').text()).toBe(MESSAGES.saveFailed);
  });
});

describe('ColorPicker', () => {
  it('HEX "333333" 입력 → 미리보기 #333333 즉시 반영', async () => {
    const w = mount(ColorPicker, { props: { modelValue: '#FCB9BA' } });
    expect(w.findAll('.preset')).toHaveLength(8);
    expect(w.findAll('.palette-item')).toHaveLength(48);
    await w.find('.hex-input').setValue('333333');
    expect(w.find('.color-preview').attributes('data-color')).toBe('#333333');
    expect(w.emitted('update:modelValue')!.slice(-1)[0]).toEqual(['#333333']);
  });

  it('무효한 값은 모델을 바꾸지 않고 colorInvalid 표시', async () => {
    const w = mount(ColorPicker, { props: { modelValue: '#FCB9BA' } });
    await w.find('.hex-input').setValue('zz');
    expect(w.emitted('update:modelValue')).toBeUndefined();
    expect(w.find('.color-error').text()).toBe(MESSAGES.colorInvalid);
  });
});
