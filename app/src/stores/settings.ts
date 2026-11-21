import { defineStore } from 'pinia';
import { ref } from 'vue';
import { setSetting } from '@/api/commands';
import type { Appearance, Settings, Theme } from '@/domain/types';

export const useSettingsStore = defineStore('settings', () => {
  const accountingStartDay = ref(1);
  const theme = ref<Theme>('macos');
  const appearance = ref<Appearance>('system');

  function load(s: Settings) {
    accountingStartDay.value = s.accountingStartDay;
    theme.value = s.theme;
    appearance.value = s.appearance;
  }

  // 저장에 성공한 뒤에만 상태를 바꾼다. 실패는 호출한 쪽이 화면에 알린다.
  async function setStartDay(n: number) {
    await setSetting('accounting_start_day', String(n));
    accountingStartDay.value = n;
  }
  async function setTheme(t: Theme) {
    await setSetting('theme', String(t));
    theme.value = t;
  }
  async function setAppearance(a: Appearance) {
    await setSetting('appearance', String(a));
    appearance.value = a;
  }

  return { accountingStartDay, theme, appearance, load, setStartDay, setTheme, setAppearance };
});
