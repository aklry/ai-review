import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';

describe('history pagination contract', () => {
  it('defaults and coerces bounded page parameters', () => {
    expect(contracts.sessionHistoryQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(
      contracts.sessionHistoryQuerySchema.parse({ page: '2', pageSize: '20', status: 'active' }),
    ).toEqual({ page: 2, pageSize: 20, status: 'active' });
  });
  it.each([{ page: 0 }, { page: 1.5 }, { pageSize: 51 }, { status: 'invalid' }])(
    'rejects invalid query %j',
    (query) => {
      expect(contracts.sessionHistoryQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});
