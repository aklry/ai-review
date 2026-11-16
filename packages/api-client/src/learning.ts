import type { AxiosRequestConfig } from 'axios';
import {
  dailyLearningSchema,
  learningItemSchema,
  learningListSchema,
  type LearningFilter,
  type LearningItem,
} from '@interview-assistant/contracts';

export function createLearningApi(request: <T>(config: AxiosRequestConfig) => Promise<T>) {
  const path = (id: string) => `/learning/items/${encodeURIComponent(id)}`;
  return {
    async dailyLearning() {
      return dailyLearningSchema.parse(await request({ method: 'POST', url: '/learning/daily' }));
    },
    async listLearning(filter: LearningFilter, page = 1) {
      return learningListSchema.parse(
        await request({ method: 'GET', url: '/learning/items', params: { filter, page } }),
      );
    },
    async getLearning(id: string) {
      return learningItemSchema.parse(await request({ method: 'GET', url: path(id) }));
    },
    async updateLearning(
      id: string,
      data: Partial<Pick<LearningItem, 'bookmarked' | 'reviewStatus'>>,
    ) {
      return learningItemSchema.parse(await request({ method: 'PATCH', url: path(id), data }));
    },
    async importLearning(questionId: string) {
      return learningItemSchema.parse(
        await request({
          method: 'POST',
          url: `/learning/import/${encodeURIComponent(questionId)}`,
        }),
      );
    },
    async answerLearning(
      id: string,
      data: { requestId: string; version: number; answerText: string },
    ) {
      return learningItemSchema.parse(
        await request({ method: 'POST', url: `${path(id)}/answers`, data, timeout: 300000 }),
      );
    },
  };
}
