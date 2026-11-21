import { describe, it, expect } from 'vitest';
import { parseWindowsData, type ImportPayload, type ImportPreview } from './importWindows';

type Ok = { ok: true; payload: ImportPayload; preview: ImportPreview };

const SPEC_EXAMPLE_JSON = `{
  "Categories": [
    { "Id": 1, "CategoryName": "식비", "Color": "#FCB9BA", "ColorOrder": 0 }
  ],
  "DayData": [
    {
      "Date": "2026-11-15T00:00:00",
      "Description": "점심",
      "Amount": 12000,
      "CategoryId": 1,
      "IsNoExpenseDay": false,
      "Id": "3f2b0c1e-0000-0000-0000-000000000000"
    },
    {
      "Date": "2026-11-16T00:00:00",
      "Description": "",
      "Amount": 0,
      "CategoryId": 0,
      "IsNoExpenseDay": true,
      "Id": "9a7d4e2f-0000-0000-0000-000000000000"
    }
  ],
  "FixedExpenses": [
    {
      "Id": "c1d2e3f4-0000-0000-0000-000000000000",
      "Name": "월세",
      "MonthlyAmounts": { "2026-10": 500000, "2026-11": 500000 }
    }
  ],
  "AccountingStartDay": 25,
  "CategoryNotes": { "2026-11:1": "회식이 많았음" }
}`;

const parse = (o: unknown) => parseWindowsData(JSON.stringify(o)) as Ok;
const day = (over: object) => ({ Date: '2026-11-15T00:00:00', Description: 'x', Amount: 1, CategoryId: 1, IsNoExpenseDay: false, ...over });
const cat = (Id: number, CategoryName: string, Color = '#FCB9BA') => ({ Id, CategoryName, Color, ColorOrder: 0 });

describe('parseWindowsData', () => {
  it('명세 §5.2 예시', () => {
    const r = parseWindowsData(SPEC_EXAMPLE_JSON) as Ok;
    expect(r.ok).toBe(true);
    expect(r.payload.categories).toEqual([{ sourceId: 1, name: '식비', color: '#FCB9BA' }]);
    expect(r.payload.expenses).toEqual([{ date: '2026-11-15', description: '점심', amount: 12000, sourceCategoryId: 1 }]);
    expect(r.payload.noExpenseDays).toEqual(['2026-11-16']);
    expect(r.payload.fixedItems).toEqual([{ name: '월세', sortOrder: 0, amounts: [{ month: '2026-10', amount: 500000 }, { month: '2026-11', amount: 500000 }] }]);
    expect(r.payload.notes).toEqual([{ month: '2026-11', sourceCategoryId: 1, note: '회식이 많았음' }]);
    expect(r.payload.accountingStartDay).toBe(25);
    expect(r.preview).toEqual({ categories: 1, expenses: 1, noExpenseDays: 1, fixedItems: 1, notes: 1, unclassified: 0 });
  });

  it('UTF-8 BOM이 앞에 붙은 파일도 같은 결과', () => {
    const plain = parseWindowsData(SPEC_EXAMPLE_JSON) as Ok;
    const bom = parseWindowsData('﻿' + SPEC_EXAMPLE_JSON) as Ok;
    expect(bom.ok).toBe(true);
    expect(bom.payload).toEqual(plain.payload);
  });

  it('손상된 JSON', () => expect(parseWindowsData('{"Categories": [')).toEqual({ ok: false, error: 'invalid-json' }));

  it.each(['{}', '[]', '{"Categories": [], "DayData": 3}'])('형식이 다른 JSON %s', t =>
    expect(parseWindowsData(t)).toEqual({ ok: false, error: 'unsupported-format' }));

  it('찾을 수 없는 카테고리 → 미분류, 고정 0 제외, 소수 반올림, 9자리 색', () => {
    const r = parse({
      Categories: [cat(1, '식비', '#FFFCB9BA')],
      DayData: [day({ CategoryId: 9, Amount: 1000.5 })],
      FixedExpenses: [{ Name: '월세', MonthlyAmounts: { '2026-12': 0 } }],
    });
    expect(r.payload.categories).toEqual([
      { sourceId: 1, name: '식비', color: '#FCB9BA' },
      { sourceId: -1, name: '미분류', color: '#BDBDBD' },
    ]);
    expect(r.payload.expenses).toEqual([{ date: '2026-11-15', description: 'x', amount: 1001, sourceCategoryId: -1 }]);
    expect(r.payload.fixedItems).toEqual([{ name: '월세', sortOrder: 0, amounts: [] }]);
    expect(r.preview.unclassified).toBe(1);
    expect(r.preview.categories).toBe(2);
  });

  it('잘못된 색은 #BDBDBD', () => {
    const r = parse({ Categories: [cat(1, 'A', 'red')], DayData: [] });
    expect(r.payload.categories[0].color).toBe('#BDBDBD');
  });

  it('같은 날 일반 지출이 있으면 무지출 표식을 버리고, 중복은 합친다', () => {
    const r = parse({
      Categories: [cat(1, 'A')],
      DayData: [
        day({ Date: '2026-11-15T00:00:00' }),
        day({ Date: '2026-11-15T00:00:00', IsNoExpenseDay: true, Amount: 0 }),
        day({ Date: '2026-11-17T00:00:00', IsNoExpenseDay: true, Amount: 0 }),
        day({ Date: '2026-11-17T00:00:00', IsNoExpenseDay: true, Amount: 0 }),
        day({ Date: '2026-11-16T00:00:00', IsNoExpenseDay: true, Amount: 0 }),
      ],
    });
    expect(r.payload.noExpenseDays).toEqual(['2026-11-16', '2026-11-17']);
    expect(r.payload.expenses).toHaveLength(1);
  });

  it('카테고리 이름 중복(대소문자 무시)은 첫 항목으로 연결', () => {
    const r = parse({
      Categories: [cat(1, 'Food'), cat(2, ' food '), cat(3, 'Etc')],
      DayData: [day({ CategoryId: 2 })],
      CategoryNotes: { '2026-11:2': 'n' },
    });
    expect(r.payload.categories.map(c => c.sourceId)).toEqual([1, 3]);
    expect(r.payload.expenses[0].sourceCategoryId).toBe(1);
    expect(r.payload.notes).toEqual([{ month: '2026-11', sourceCategoryId: 1, note: 'n' }]);
  });

  it('원본에 미분류가 있으면 그 카테고리를 쓴다', () => {
    const r = parse({ Categories: [cat(5, '미분류')], DayData: [day({ CategoryId: 99 })] });
    expect(r.payload.categories).toHaveLength(1);
    expect(r.payload.expenses[0].sourceCategoryId).toBe(5);
    expect(r.preview.unclassified).toBe(1);
  });

  it('빈 내용, 빈 이름, 음수·비숫자 금액', () => {
    const r = parse({
      Categories: [cat(4, '  ')],
      DayData: [day({ CategoryId: 4, Description: '  ', Amount: -5 }), day({ CategoryId: 4, Amount: 'abc' })],
    });
    expect(r.payload.categories[0].name).toBe('카테고리 4');
    expect(r.payload.expenses.map(e => [e.description, e.amount])).toEqual([['(내용 없음)', 0], ['x', 0]]);
  });

  it('메모: 잘못된 키·빈 메모 버리고 알 수 없는 카테고리는 미분류', () => {
    const r = parse({
      Categories: [cat(1, 'A')],
      DayData: [],
      CategoryNotes: { 'bad': 'a', '2026-11:1': '  ', '2026-11:7': 'orphan', '2026-1:1': 'b' },
    });
    expect(r.payload.notes).toEqual([{ month: '2026-11', sourceCategoryId: -1, note: 'orphan' }]);
    expect(r.preview.unclassified).toBe(1);
  });

  it('고정 지출: 중복 이름은 (2)를 붙여 금액까지 가져옴, 월 정렬, 순서', () => {
    const r = parse({
      Categories: [], DayData: [],
      FixedExpenses: [
        { Name: '월세', MonthlyAmounts: { '2026-11': 2, '2026-10': 1.4 } },
        { Name: '월세 ', MonthlyAmounts: { '2026-09': 9 } },
        { Name: '통신', MonthlyAmounts: {} },
        { Id: 'x' },
      ],
    });
    expect(r.payload.fixedItems).toEqual([
      { name: '월세', sortOrder: 0, amounts: [{ month: '2026-10', amount: 1 }, { month: '2026-11', amount: 2 }] },
      { name: '월세 (2)', sortOrder: 1, amounts: [{ month: '2026-09', amount: 9 }] },
      { name: '통신', sortOrder: 2, amounts: [] },
    ]);
  });

  it('고정 지출: 원래 있던 고유 이름은 바꾸지 않고 중복만 빈 번호를 받는다', () => {
    const r = parse({
      Categories: [], DayData: [],
      FixedExpenses: [{ Name: '월세' }, { Name: '월세' }, { Name: '월세 (2)' }],
    });
    expect(r.payload.fixedItems.map((i) => i.name)).toEqual(['월세', '월세 (3)', '월세 (2)']);
  });

  it('고정 지출: 세 번 겹치면 (2), (3)이고 이미 있는 이름과도 겹치지 않는다', () => {
    const r = parse({
      Categories: [], DayData: [],
      FixedExpenses: [
        { Name: '보험', MonthlyAmounts: { '2026-11': 1 } },
        { Name: '보험 (2)', MonthlyAmounts: { '2026-11': 5 } },
        { Name: 'BOHUM', MonthlyAmounts: {} },
        { Name: '보험', MonthlyAmounts: { '2026-11': 2 } },
        { Name: ' 보험 ', MonthlyAmounts: { '2026-11': 3 } },
        { Name: 'bohum', MonthlyAmounts: { '2026-11': 4 } },
      ],
    });
    expect(r.payload.fixedItems.map((i) => i.name)).toEqual([
      '보험', '보험 (2)', 'BOHUM', '보험 (3)', '보험 (4)', 'bohum (2)',
    ]);
    expect(r.payload.fixedItems.map((i) => i.amounts[0]?.amount)).toEqual([1, 5, undefined, 2, 3, 4]);
    expect(r.payload.fixedItems.map((i) => i.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('시작일 기본값과 검증, 선택 섹션 누락', () => {
    expect(parse({ Categories: [], DayData: [] }).payload.accountingStartDay).toBe(25);
    expect(parse({ Categories: [], DayData: [], AccountingStartDay: 32 }).payload.accountingStartDay).toBe(25);
    expect(parse({ Categories: [], DayData: [], AccountingStartDay: 1 }).payload.accountingStartDay).toBe(1);
  });

  it('잘못된 항목은 건너뛴다', () => {
    const r = parse({ Categories: [{ CategoryName: 'x' }, cat(1, 'A')], DayData: [{ Date: 'bad' }, null, day({})] });
    expect(r.payload.categories).toHaveLength(1);
    expect(r.payload.expenses).toHaveLength(1);
  });

  it('금액 상한: 비유한/음수 -> 0, 초과 -> MAX_AMOUNT (지출·고정 지출)', () => {
    const text = `{"Categories":[{"Id":1,"CategoryName":"A","Color":"#FCB9BA"}],
      "DayData":[
        {"Date":"2026-11-15","Description":"a","Amount":1e999,"CategoryId":1},
        {"Date":"2026-11-15","Description":"b","Amount":1e300,"CategoryId":1},
        {"Date":"2026-11-15","Description":"c","Amount":-5,"CategoryId":1}],
      "FixedExpenses":[{"Name":"f","MonthlyAmounts":{"2026-01":1e999,"2026-02":1e300,"2026-03":-5}}]}`;
    const r = parseWindowsData(text) as Ok;
    expect(r.payload.expenses.map(e => e.amount)).toEqual([0, 99999999999, 0]);
    expect(r.payload.fixedItems[0].amounts).toEqual([{ month: '2026-02', amount: 99999999999 }]);
  });

  it('가상 미분류 ID는 원본 ID -1과 겹치지 않는다', () => {
    const r = parse({ Categories: [cat(-1, 'Neg')], DayData: [day({ CategoryId: 9 }), day({ CategoryId: -1 })] });
    expect(r.payload.categories.map(c => c.name)).toEqual(['Neg', '미분류']);
    const [neg, un] = r.payload.categories;
    expect(un.sourceId).not.toBe(neg.sourceId);
    expect(r.payload.expenses.map(e => e.sourceCategoryId)).toEqual([un.sourceId, neg.sourceId]);
  });

  it('중복 카테고리 메모는 줄바꿈으로 합쳐진다', () => {
    const r = parse({
      Categories: [cat(1, 'Food'), cat(2, 'food')], DayData: [],
      CategoryNotes: { '2026-11:1': 'a', '2026-11:2': 'b' },
    });
    expect(r.payload.notes).toEqual([{ month: '2026-11', sourceCategoryId: 1, note: 'a\nb' }]);
    expect(r.preview.notes).toBe(1);
    expect(r.preview.unclassified).toBe(0);
  });

  it('알 수 없는 카테고리 메모 2개가 미분류로 합쳐지면 unclassified는 메모 건수(2)', () => {
    const r = parse({
      Categories: [cat(1, 'A')], DayData: [],
      CategoryNotes: { '2026-11:7': 'x', '2026-11:8': 'y' },
    });
    expect(r.payload.notes).toEqual([{ month: '2026-11', sourceCategoryId: -1, note: 'x\ny' }]);
    expect(r.preview.notes).toBe(1);
    expect(r.preview.unclassified).toBe(2);
  });
});
