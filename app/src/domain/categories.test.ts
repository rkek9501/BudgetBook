import { describe, it, expect } from 'vitest';
import { colorGroup, sortCategories, normalizeHex, textColorFor, PRESETS, PALETTE, DEFAULT_CATEGORIES } from './categories';

describe('categories', () => {
  it('프리셋은 이름과 같은 계열', () => expect(PRESETS.map(p => colorGroup(p.color))).toEqual([0,1,2,3,4,5,6,7]));
  it('계열 판정', () => {
    expect(colorGroup('#333333')).toBe(7); expect(colorGroup('#FF0000')).toBe(0);
    expect(colorGroup('#80FF00')).toBe(3); expect(colorGroup('zzz')).toBe(999);
    expect(colorGroup('#FCEBB7')).toBe(2); expect(colorGroup('#B8F6EE')).toBe(4);
    expect(colorGroup('#fcb9ba')).toBe(0); expect(colorGroup('#FFF')).toBe(999);
    expect(colorGroup('#FFFF0000')).toBe(999);
  });
  it('정렬: 계열 → 이름', () => {
    const r = sortCategories([{id:1,name:'생활',color:'#B8F6EE'},{id:2,name:'교통',color:'#B7D9FC'},{id:3,name:'식비',color:'#FCB9BA'},{id:4,name:'기타',color:'#333333'}]);
    expect(r.map(c => c.name)).toEqual(['식비','교통','생활','기타']);
  });
  it('HEX 정규화', () => {
    expect(normalizeHex('333333')).toBe('#333333'); expect(normalizeHex(' #fcb9ba ')).toBe('#FCB9BA');
    expect(normalizeHex('#12')).toBeNull(); expect(normalizeHex('#FFFFFFFF')).toBeNull();
  });
  it('글자색', () => { expect(textColorFor('#FCB9BA')).toBe('#000000'); expect(textColorFor('#333333')).toBe('#FFFFFF'); });
  it('팔레트 48색, 기본 카테고리 8개', () => { expect(PALETTE).toHaveLength(48); expect(DEFAULT_CATEGORIES).toHaveLength(8); });
});
