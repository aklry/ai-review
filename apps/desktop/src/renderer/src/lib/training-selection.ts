import type { Router } from 'vue-router';

/** A historical selection is a one-time navigation, not a permanent recovery override. */
export async function activateTrainingSelection(
  store: { activate(id?: string): Promise<void>; sessionId: string },
  router: Pick<Router, 'currentRoute' | 'replace'>,
  selectedId?: string,
): Promise<void> {
  await store.activate(selectedId);
  const route = router.currentRoute.value;
  if (
    selectedId &&
    store.sessionId === selectedId &&
    route.path === '/training' &&
    route.query.sessionId === selectedId
  ) {
    const query = { ...route.query };
    delete query.sessionId;
    await router.replace({ path: '/training', query });
  }
}
