import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { expect, it } from 'vitest';
import type { ReferenceAnswer as Answer, SessionReview } from '@interview-assistant/contracts';
import ReferenceAnswer from './ReferenceAnswer.vue';
import QuestionReviewCard from './QuestionReviewCard.vue';

const answer: Answer = {
  kind: 'experience-template',
  content: '我负责【待补充：个人职责】。\n<script>unsafe()</script>',
  keyPoints: ['说明个人行动'],
  missingFacts: ['实际个人职责'],
};

it('renders reference text safely and distinguishes examples from personal facts', async () => {
  const html = await renderToString(createSSRApp(ReferenceAnswer, { answer }));
  expect(html).toContain('本题参考答案');
  expect(html).toContain('经历回答模板');
  expect(html).toContain('需要你补充的事实');
  expect(html).toContain('实际个人职责');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>unsafe()');
});

it('reads saved answers in review while handling old and unanswered questions', async () => {
  const question: SessionReview['questions'][number] = {
    id: 'q1',
    competency: 'project-depth',
    difficulty: 'l2',
    prompt: '介绍个人贡献',
    isCore: true,
    parentQuestionId: null,
    answer: {
      answerText: '完成页面',
      createdAt: '2026-11-05T11:00:00.000Z',
      cue: {
        competency: 'project-depth',
        score: 2,
        strengths: [],
        gaps: [],
        nextAction: '补充验证',
        evidence: [{ source: 'answer', quote: '完成页面' }],
        referenceAnswer: answer,
      },
    },
  };
  const render = () => {
    const app = createSSRApp(QuestionReviewCard, { question, label: '第 1 题' });
    app.component('ElTag', { template: '<span><slot /></span>' });
    return renderToString(app);
  };
  expect(await render()).toContain('本题参考答案');
  delete question.answer!.cue!.referenceAnswer;
  expect(await render()).toContain('这条历史反馈未保存参考答案');
  question.answer = null;
  expect(await render()).not.toContain('本题参考答案');
});
