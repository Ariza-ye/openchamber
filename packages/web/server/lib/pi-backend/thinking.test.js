import { describe, expect, test } from 'bun:test';

import { modelVariantIds, supportedThinkingLevels } from './thinking.js';

describe('supportedThinkingLevels', () => {
  test('a model without reasoning accepts only off', () => {
    expect(supportedThinkingLevels({})).toEqual(['off']);
    expect(supportedThinkingLevels({ reasoning: false })).toEqual(['off']);
  });

  test('a reasoning model accepts the levels below xhigh when it maps none', () => {
    expect(supportedThinkingLevels({ reasoning: true })).toEqual([
      'off', 'minimal', 'low', 'medium', 'high',
    ]);
  });

  test('a level mapped to null is dropped', () => {
    expect(supportedThinkingLevels({
      reasoning: true,
      thinkingLevelMap: { minimal: null, medium: null },
    })).toEqual(['off', 'low', 'high']);
  });

  test('xhigh and max need an explicit mapping', () => {
    expect(supportedThinkingLevels({
      reasoning: true,
      thinkingLevelMap: { max: 'max' },
    })).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'max']);
  });
});

describe('modelVariantIds', () => {
  test('a model that cannot think offers no variants', () => {
    expect(modelVariantIds({})).toEqual([]);
    expect(modelVariantIds({ reasoning: false, thinkingLevelMap: { low: 'low' } })).toEqual([]);
  });

  test('a reasoning model offers the levels pi accepts', () => {
    expect(modelVariantIds({
      reasoning: true,
      thinkingLevelMap: { minimal: null, max: 'max' },
    })).toEqual(['off', 'low', 'medium', 'high', 'max']);
  });
});
