import { CoachAgent, InterviewWorkflows } from '@interview-assistant/agent-core';
import type { AgentModelGateway } from '@interview-assistant/agent-core';
import type { CoachingCue, InterviewQuestion } from '@interview-assistant/contracts';
import { evaluateScorePair } from './evaluation-runner.js';
import type { EvaluationProbe } from './evaluation-runner.js';

const resumeText =
  '虚构候选人：4 年前端经验，负责 Vue 3 管理系统和 RAG 文档问答。主导首屏优化，将 LCP 从 4.8 秒降至 2.1 秒；通过性能埋点和灰度验证。负责需求拆解、代码实现与上线复盘。';
const jobDescription =
  '招聘前端工程师，要求 Vue/React、前端性能优化、AI 应用、系统设计和项目交付经验。需要解释技术取舍并用指标验证结果。';
const answers = {
  'zh-CN': {
    question: '介绍你主导的一次首屏性能优化，说明定位过程、技术取舍、验证方式和结果。',
    profile: resumeText,
    job: jobDescription,
    strong:
      '我负责 Vue 3 管理系统首屏优化。先用 Performance 面板和真实用户埋点确认瓶颈是入口包过大以及瀑布式接口请求。我将低频图表组件改为动态加载，拆分路由包，并把独立接口并行请求。我比较过全量预加载方案，但低频模块会增加带宽和内存，因此只预取高频路由。上线前用相同设备与网络做了 30 次测试，上线后按用户分组灰度并监控错误率。真实用户 P75 LCP 从 4.8 秒降至 2.1 秒，错误率没有明显上升。为避免测试缓存干扰，我分别统计冷缓存和热缓存，并持续观察了一周。',
    weak: '我没有主导过性能优化，主要跟着同事做，不知道为什么这样改，也没有测量指标。',
  },
  'en-US': {
    question:
      'Describe a frontend performance optimization you owned, including diagnosis, trade-offs, validation and results.',
    profile:
      'Synthetic candidate with 4 years of frontend experience. Owned a Vue 3 dashboard performance project, reducing LCP from 4.8 to 2.1 seconds using telemetry and a staged rollout.',
    job: 'Frontend engineer role requiring performance analysis, technical trade-offs, AI application development and measurable project delivery.',
    strong:
      'I owned the initial-load optimization of a Vue 3 dashboard. Browser traces and real-user telemetry showed a large entry bundle and sequential independent API calls. I lazy-loaded infrequently used chart modules, split route bundles and parallelized independent requests. I rejected preloading every module because it would increase bandwidth and memory usage. Before rollout I ran 30 comparisons on the same device and network, separating cold and warm caches. I then used a staged rollout with error-rate monitoring. Real-user P75 LCP fell from 4.8 to 2.1 seconds without a meaningful increase in errors. We monitored the result for a week to reduce the risk of a one-off measurement.',
    weak: 'I did not own the optimization. A colleague told me what to change. I cannot explain the trade-offs and did not measure the outcome.',
  },
};

/** Seven probes, eight logical model calls; the provider may repair/fallback once per call. */
export function createSyntheticEvaluation(model: AgentModelGateway, runId: string) {
  const workflows = new InterviewWorkflows(model);
  const coach = new CoachAgent(model);
  let preparation: Awaited<ReturnType<InterviewWorkflows['prepare']>> | undefined;
  const cues = new Map<string, CoachingCue>();
  const probes: EvaluationProbe[] = [
    {
      id: 'zh-preparation',
      title: '中文简历事实提取与岗位分析',
      run: async () => {
        preparation = await workflows.prepare(
          {
            profileId: 'synthetic-profile',
            targetRole: '前端工程师',
            resumeText,
            jobDescription,
            stories: [],
          },
          { operationId: `${runId}:prepare` },
        );
        return {
          output: preparation,
          checks: [
            {
              name: 'four-competencies',
              passed:
                new Set(preparation.analysis.competencies.map((c) => c.competency)).size === 4,
            },
          ],
        };
      },
    },
    {
      id: 'zh-questions',
      title: '四维核心题生成',
      skip: () => (!preparation ? 'Preparation did not produce validated analysis' : undefined),
      run: async () => {
        const questions = await workflows.questions(
          {
            targetRole: '前端工程师',
            language: 'zh-CN',
            round: 'technical',
            difficulty: 'l2',
            questionCount: 4,
            jobAnalysis: preparation!.analysis,
            profileSummary: resumeText,
            stories: [],
          },
          { operationId: `${runId}:questions` },
        );
        return {
          output: questions,
          checks: [
            {
              name: 'four-core-competencies',
              passed:
                questions.length === 4 &&
                new Set(questions.filter((q) => q.isCore).map((q) => q.competency)).size === 4,
            },
            {
              name: 'concrete-distinct-questions',
              passed:
                new Set(questions.map((q) => q.prompt.trim())).size === 4 &&
                questions.every((q) => !/替换为|TODO|placeholder/i.test(q.prompt)),
            },
          ],
        };
      },
    },
  ];
  for (const language of ['zh-CN', 'en-US'] as const) {
    for (const strength of ['strong', 'weak'] as const) {
      const id = `${language}-${strength}`;
      const facts = answers[language];
      probes.push({
        id,
        title: `${language} ${strength === 'strong' ? '有证据回答' : '薄弱回答'}评分`,
        run: async () => {
          const currentQuestion: InterviewQuestion = {
            id: `synthetic-${language}`,
            competency: 'project-depth',
            difficulty: 'l2',
            prompt: facts.question,
            isCore: true,
            parentQuestionId: null,
          };
          const result = await coach.invoke({
            sessionId: runId,
            language,
            currentQuestion,
            answerText: facts[strength],
            profileSummary: facts.profile,
            jobSummary: facts.job,
            priorCues: [],
          });
          cues.set(id, result.data);
          return {
            output: result.data,
            checks: [
              {
                name: 'validated-answer-evidence',
                passed: result.data.evidence.some((e) => e.source === 'answer'),
              },
            ],
          };
        },
      });
    }
  }
  probes.push({
    id: 'partial-report',
    title: '提前结束报告与未测评维度',
    skip: () =>
      !cues.has('zh-CN-strong') ? 'Missing validated Chinese coaching result' : undefined,
    run: async () => {
      const report = await workflows.report(
        {
          sessionId: runId,
          language: 'zh-CN',
          profileSummary: resumeText,
          jobSummary: jobDescription,
          cues: [cues.get('zh-CN-strong')!],
        },
        { operationId: `${runId}:report` },
      );
      return {
        output: report,
        checks: [
          {
            name: 'unassessed-dimensions-stay-null',
            passed:
              report.overallScore === null &&
              report.assessmentStatus === 'partial' &&
              Object.values(report.competencyScores).filter((s) => s === null).length === 3,
          },
          {
            name: 'seven-distinct-training-days',
            passed:
              report.nextPlan.length === 7 && new Set(report.nextPlan.map((d) => d.day)).size === 7,
          },
        ],
      };
    },
  });
  return {
    probes,
    qualityChecks: () =>
      (['zh-CN', 'en-US'] as const).map((language) =>
        evaluateScorePair(
          language,
          cues.get(`${language}-strong`)?.score,
          cues.get(`${language}-weak`)?.score,
        ),
      ),
  };
}
