import { computed, onScopeDispose, ref, watchEffect } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSettingsStore } from '@/stores/settings';

const QUERY = '(prefers-color-scheme: dark)';

// settings 스토어를 보고 <html>의 data-theme / data-appearance(light|dark 확정값)를 맞춘다.
export function useAppearance() {
  const settings = useSettingsStore();
  const mq = typeof matchMedia === 'function' ? matchMedia(QUERY) : null;
  const osDark = ref(mq?.matches ?? false);
  const onChange = () => {
    osDark.value = mq?.matches ?? false;
  };
  mq?.addEventListener('change', onChange);
  onScopeDispose(() => mq?.removeEventListener('change', onChange));

  const resolved = computed<'light' | 'dark'>(() =>
    settings.appearance === 'system' ? (osDark.value ? 'dark' : 'light') : settings.appearance,
  );

  watchEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.appearance = resolved.value;
  });

  watchEffect(() => {
    const value = settings.appearance === 'system' ? null : settings.appearance;
    // 창 테마 적용 실패(권한·비Tauri 환경)는 화면 표시에 영향이 없으므로 무시한다.
    // getCurrentWindow()는 Tauri 밖에서 동기적으로 던질 수 있어 then 안에서 호출한다.
    Promise.resolve()
      .then(() => getCurrentWindow().setTheme(value))
      .catch(() => {});
  });

  return { resolved };
}
