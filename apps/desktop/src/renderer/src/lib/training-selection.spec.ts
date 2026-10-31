import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { activateTrainingSelection } from './training-selection.js';

async function routerAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/training', component: { template: '<div />' } },
      { path: '/history', component: { template: '<div />' } },
    ],
  });
  await router.push(path);
  return router;
}
describe('one-time historical session selection', () => {
  it('consumes the selected ID after successful restore while preserving unrelated query parameters', async () => {
    const router = await routerAt('/training?sessionId=old&source=history');
    const store = {
      sessionId: '',
      activate: vi.fn(async () => {
        store.sessionId = 'old';
      }),
    };
    await activateTrainingSelection(store, router, 'old');
    expect(store.activate).toHaveBeenCalledWith('old');
    expect(router.currentRoute.value.query).toEqual({ source: 'history' });
  });
  it('does not clear a newer route selection when an earlier restore finishes late', async () => {
    const router = await routerAt('/training?sessionId=new');
    const store = { sessionId: 'old', activate: vi.fn(async () => undefined) };
    await activateTrainingSelection(store, router, 'old');
    expect(router.currentRoute.value.query.sessionId).toBe('new');
  });
  it('preserves a failed selection so it can be retried', async () => {
    const router = await routerAt('/training?sessionId=missing');
    const store = { sessionId: '', activate: vi.fn(async () => undefined) };
    await activateTrainingSelection(store, router, 'missing');
    expect(router.currentRoute.value.query.sessionId).toBe('missing');
  });
});
