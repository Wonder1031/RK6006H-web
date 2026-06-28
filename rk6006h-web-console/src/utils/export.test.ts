import { describe, expect, it } from 'vitest';
import { buildCsv, CSV_BOM } from './export';

describe('buildCsv', () => {
  it('基本行列拼接', () => {
    expect(
      buildCsv([
        ['id', 'name'],
        [1, '电压'],
        [2, '电流'],
      ]),
    ).toBe('id,name\n1,电压\n2,电流');
  });

  it('含逗号 / 引号 / 换行的字段被转义', () => {
    expect(buildCsv([['a,b'], ['c"d'], ['e\nf']])).toBe('"a,b"\n"c""d"\n"e\nf"');
  });

  it('数字字段原样输出', () => {
    expect(buildCsv([[12.5, 0]])).toBe('12.5,0');
  });
});

describe('CSV_BOM', () => {
  it('为 UTF-8 BOM 字符', () => {
    expect(CSV_BOM).toBe('﻿');
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff);
  });
});
