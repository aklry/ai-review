import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { expect, it } from 'vitest';
import type { RubricEvaluation, RubricSnapshot } from '@interview-assistant/contracts';
import RubricFeedback from './RubricFeedback.vue';

it('renders criterion labels, distinct missing evidence and escaped answer quotes', async () => {
  const snapshot: RubricSnapshot = {
    bankId: 'performance',
    questionVersion: '1.0:l2',
    rubricVersion: 'rubric-v3',
    skillIds: ['performance'],
    constraints: ['Verify results'],
    criteria: [
      { id: 'measurement', description: '用数据定位瓶颈' },
      { id: 'validation', description: '验证改进结果' },
    ],
    anchors: [],
  };
  const evaluation: RubricEvaluation = {
    bankId: snapshot.bankId,
    questionVersion: snapshot.questionVersion,
    rubricVersion: 'rubric-v3',
    items: [
      {
        criterionId: 'measurement',
        status: 'met',
        reason: '提供了定位证据',
        quotes: ['<script>unsafe()</script>'],
      },
      { criterionId: 'validation', status: 'missing', reason: '没有说明验证步骤', quotes: [] },
    ],
  };
  const app = createSSRApp(RubricFeedback, { evaluation, snapshot });
  app.component('ElTag', { template: '<span><slot /></span>' });
  const html = await renderToString(app);
  expect(html).toContain('用数据定位瓶颈');
  expect(html).toContain('已满足');
  expect(html).toContain('未说明');
  expect(html).toContain('本次回答尚未提供此项依据');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>unsafe()');
  expect(html).toContain('rubric-v3');
});
