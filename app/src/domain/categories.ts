import type { Category } from './types';

/** 명세 §4.10: 색 계열 순서값. #RRGGBB만 해석하고 그 밖은 999. */
export function colorGroup(hex: string): number {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return 999;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  if (max < 0.15 || diff < 0.05) return 7;
  let h: number;
  if (max === r) h = 60 * (((g - b) / diff) % 6);
  else if (max === g) h = 60 * ((b - r) / diff + 2);
  else h = 60 * ((r - g) / diff + 4);
  if (h < 0) h += 360;
  if (h < 15 || h >= 345) return 0;
  if (h < 45) return 1;
  if (h < 75) return 2;
  if (h < 165) return 3;
  if (h < 255) return 4;
  if (h < 300) return 5;
  return 6;
}

export function compareCategories(a: Category, b: Category): number {
  const d = colorGroup(a.color) - colorGroup(b.color);
  if (d !== 0) return d;
  return a.name.localeCompare(b.name, 'ko');
}

export function sortCategories(list: Category[]): Category[] {
  return [...list].sort(compareCategories);
}

/** `RRGGBB` 또는 `#rrggbb`를 `#RRGGBB`로. 그 밖은 null. */
export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(input.trim());
  return m ? `#${m[1].toUpperCase()}` : null;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 카테고리를 찾을 수 없는 지출 칩에 쓰는 색. 글자색 계산(textColorFor)에 쓰이므로 CSS 변수가 아닌 상수다. */
export const UNKNOWN_CATEGORY_COLOR = '#CCCCCC';

/** WCAG 대비가 더 큰 글자색. */
export function textColorFor(hex: string): '#000000' | '#FFFFFF' {
  const n = normalizeHex(hex);
  if (!n) return '#000000';
  const L =
    0.2126 * channel(parseInt(n.slice(1, 3), 16)) +
    0.7152 * channel(parseInt(n.slice(3, 5), 16)) +
    0.0722 * channel(parseInt(n.slice(5, 7), 16));
  const contrastBlack = (L + 0.05) / 0.05;
  const contrastWhite = 1.05 / (L + 0.05);
  return contrastBlack >= contrastWhite ? '#000000' : '#FFFFFF';
}

export const PRESETS: { name: string; color: string }[] = [
  { name: '빨강', color: '#FCB9BA' },
  { name: '주황', color: '#FCD5B5' },
  { name: '노랑', color: '#FBF6A5' },
  { name: '초록', color: '#C5F0C0' },
  { name: '파랑', color: '#B7D9FC' },
  { name: '보라', color: '#DAB6FC' },
  { name: '분홍', color: '#FCBBFB' },
  { name: '검정/회색', color: '#BDBDBD' },
];

export const PALETTE: string[] = `
#FF0000 #FF4500 #FF8C00 #FFA500 #FFD700 #FFFF00 #ADFF2F #7CFC00 #00FF00 #00FA9A
#00FFFF #00BFFF #1E90FF #0000FF #4169E1 #8A2BE2 #800080 #C71585 #FF1493 #FF69B4
#FFB6C1 #A52A2A #D2691E #F4A460 #F5DEB3 #808000 #008000 #008080 #20B2AA #40E0D0
#4682B4 #708090 #800000 #4B0082 #6A5ACD #9370DB #EE82EE #FF00FF #FFC0CB #F08080
#FFFFFF #F2F2F2 #D9D9D9 #BFBFBF #999999 #666666 #333333 #000000
`.trim().split(/\s+/);

export const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: '식비', color: '#FCB9BA' },
  { name: '카페·간식', color: '#FCD5B5' },
  { name: '생활', color: '#FBF6A5' },
  { name: '교통', color: '#B7D9FC' },
  { name: '쇼핑', color: '#DAB6FC' },
  { name: '문화·여가', color: '#FCBBFB' },
  { name: '의료', color: '#C5F0C0' },
  { name: '기타', color: '#BDBDBD' },
];
