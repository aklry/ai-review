import { describe, expect, it, vi } from 'vitest';
import { createLearningApi } from './learning.js';
describe('学习 API', () => {
  it('按服务端契约拒绝损坏的详情', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'broken' });
    await expect(createLearningApi(request).getLearning('a/b')).rejects.toThrow();
    expect(request).toHaveBeenCalledWith({ method: 'GET', url: '/learning/items/a%2Fb' });
  });
  it('列表传递筛选与页码并校验响应', async () => {
    const request = vi.fn().mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 20 });
    expect((await createLearningApi(request).listLearning('pending', 2)).items).toEqual([]);
    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      url: '/learning/items',
      params: { filter: 'pending', page: 2 },
    });
  });
  it('提交传递同一请求编号、版本和长任务超时', async () => {
    const request = vi.fn().mockResolvedValue({});
    const data = { requestId: 'request', version: 2, answerText: '回答' };
    await expect(createLearningApi(request).answerLearning('a/b', data)).rejects.toThrow();
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      url: '/learning/items/a%2Fb/answers',
      data,
      timeout: 300000,
    });
  });
});
