import {
  type CoachingCue,
  competencyScoresSchema,
  scoreWeights,
  type Competency,
  type CompetencyScores,
  type JobAnalyzeInput,
  type InterviewQuestion,
  type StoryInput,
} from '@interview-assistant/contracts';
import type { z } from 'zod';

const competencies: Competency[] = [
  'vue-react',
  'ai-application',
  'system-design',
  'project-depth',
];

export function calculateWeightedScore(scores: CompetencyScores): number {
  const validScores = competencyScoresSchema.parse(scores);
  const weightedScore = competencies.reduce((total, competency) => {
    const score = validScores[competency];
    return total + (score / 5) * scoreWeights[competency];
  }, 0);

  return Math.round(weightedScore * 100) / 100;
}

export function normalizeCompetencyScores(cues: CoachingCue[]): CompetencyScores {
  const totals = Object.fromEntries(
    competencies.map((competency) => [competency, [] as number[]]),
  ) as Record<Competency, number[]>;

  for (const cue of cues) {
    totals[cue.competency].push(cue.score);
  }

  return competencyScoresSchema.parse(
    Object.fromEntries(
      competencies.map((competency) => {
        const scores = totals[competency];
        if (scores.length === 0) return [competency, 3];
        return [
          competency,
          Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
        ];
      }),
    ),
  );
}

export function parseModelJson<T extends z.ZodTypeAny>(schema: T, content: string): z.infer<T> {
  try {
    const withoutFence = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    return schema.parse(JSON.parse(withoutFence));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown schema error';
    throw new Error(`Invalid model output: ${detail}`);
  }
}

export function buildAnalysisPrompt(
  input: JobAnalyzeInput & { resumeText: string; stories: StoryInput[] },
): string {
  return [
    '你是 Interview Assistant 的 Job Agent。',
    '只基于输入事实分析岗位，不得编造候选人的经历。',
    '每条关键结论必须引用简历或 JD 原文，输出必须是符合约定 schema 的 JSON。',
    '证据数组必须引用，缺失信息必须明确列入 missingEvidence。',
    `目标岗位：${input.targetRole}`,
    `公司：${input.company ?? '未提供'}`,
    `简历：${input.resumeText}`,
    `JD：${input.jobDescription}`,
    `候选人已确认的 STAR 故事：${JSON.stringify(input.stories)}`,
    '请生成 summary、competencies、likelyQuestions、missingEvidence。',
  ].join('\n');
}

export function buildCoachingPrompt(input: {
  sessionId: string;
  language: string;
  currentQuestion: InterviewQuestion;
  answerText: string;
  profileSummary: string;
  jobSummary: string;
  priorCues: CoachingCue[];
}): string {
  return [
    '你是 Interview Assistant 的 Coach Agent。',
    '只评估训练表现，不生成是否录用结论。',
    '不得编造简历事实；每条关键反馈必须引用简历、JD 或回答原文。',
    '请只输出一个 JSON 对象，结构必须符合 CoachingCue。',
    `会话：${input.sessionId}`,
    `语言：${input.language}`,
    `当前问题：${JSON.stringify(input.currentQuestion)}`,
    `用户回答：${input.answerText}`,
    `候选人档案摘要：${input.profileSummary}`,
    `岗位摘要：${input.jobSummary}`,
    `之前反馈：${JSON.stringify(input.priorCues)}`,
  ].join('\n');
}

export function buildQuestionPrompt(input: {
  targetRole: string;
  company?: string;
  language: string;
  round: string;
  difficulty: string;
  questionCount: number;
  jobAnalysis: unknown;
  profileSummary: string;
  stories: StoryInput[];
}): string {
  return [
    '你是 Interview Assistant 的 Interviewer Agent。',
    '根据岗位、候选人事实和能力模型生成文字模拟面试题。',
    '题目必须绑定 competency，首场默认覆盖四个能力维度，并优先覆盖核心能力。',
    '不得把模型生成的内容当作候选人事实，不得生成录用判断或真实面试中的实时作答建议。',
    '只输出一个 JSON 对象，结构必须是 {"questions":[...]}。',
    `目标岗位：${input.targetRole}`,
    `公司：${input.company ?? '未提供'}`,
    `语言：${input.language}`,
    `面试轮次：${input.round}`,
    `难度：${input.difficulty}`,
    `题目数量：${input.questionCount}`,
    `岗位能力分析：${JSON.stringify(input.jobAnalysis)}`,
    `候选人档案摘要：${input.profileSummary}`,
    `候选人已确认故事：${JSON.stringify(input.stories)}`,
  ].join('\n');
}

export function buildReportPrompt(input: {
  sessionId: string;
  language: string;
  profileSummary: string;
  jobSummary: string;
  cues: CoachingCue[];
}): string {
  return [
    '你是 Interview Assistant 的 Report Agent。',
    '根据本轮真实回答和已校验的 CoachingCue 生成训练报告。',
    '不得生成是否录用结论，不得编造候选人的经历。',
    '每条关键反馈必须保留可追溯 evidence；nextPlan 必须是 7 天可执行训练计划。',
    '只输出一个 JSON 对象，结构必须符合 EvaluationReport。',
    `会话：${input.sessionId}`,
    `语言：${input.language}`,
    `候选人档案摘要：${input.profileSummary}`,
    `岗位摘要：${input.jobSummary}`,
    `本轮逐题反馈：${JSON.stringify(input.cues)}`,
  ].join('\n');
}

export { questionInventory, scoreWeights } from '@interview-assistant/contracts';
