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

export function calculateWeightedScore(scores: CompetencyScores): number | null {
  const validScores = competencyScoresSchema.parse(scores);
  if (competencies.some((competency) => validScores[competency] === null)) return null;
  const weightedScore = competencies.reduce((total, competency) => {
    const score = validScores[competency]!;
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
        if (scores.length === 0) return [competency, null];
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
    const normalized = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    let parsed: unknown;
    try {
      parsed = JSON.parse(normalized);
    } catch {
      // Some providers add a short explanation before/after the JSON object.
      // Parse the first complete object so harmless wrapper text does not
      // turn an otherwise valid structured response into a failure.
      const start = normalized.indexOf('{');
      const end = normalized.lastIndexOf('}');
      if (start < 0 || end <= start) throw new Error('response did not contain a JSON object');
      parsed = JSON.parse(normalized.slice(start, end + 1));
    }
    try {
      return schema.parse(parsed);
    } catch (firstError) {
      for (const repair of [repairQuestionSet, repairCoachingCue, repairEvaluationReport]) {
        const repaired = repair(parsed);
        if (repaired === parsed) continue;
        const candidate = schema.safeParse(repaired);
        if (candidate.success) return candidate.data;
      }
      throw firstError;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown schema error';
    throw new Error(`Invalid model output: ${detail}`);
  }
}

function repairEvaluationReport(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  const hasReportShape =
    Object.keys(root).length === 0 ||
    'report' in root ||
    ['summary', 'overallScore', 'competencyScores', 'cues', 'strengths', 'gaps', 'nextPlan'].some(
      (key) => key in root,
    );
  if (!hasReportShape) return value;
  const source = (root.report ?? root.result ?? root) as Record<string, unknown>;
  return source;
}

function repairCoachingCue(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  const hasCueShape =
    Object.keys(root).length === 0 ||
    'feedback' in root ||
    'coaching' in root ||
    'result' in root ||
    [
      'competency',
      'dimension',
      'area',
      'strengths',
      'gaps',
      'nextAction',
      'evidence',
      'recommendation',
    ].some((key) => key in root);
  if (!hasCueShape) return value;
  const source = (root.feedback ?? root.coaching ?? root.result ?? root) as unknown;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return value;
  const cue = source as Record<string, unknown>;
  const competency = String(cue.competency ?? cue.dimension ?? cue.area ?? '').toLowerCase();
  const aliases: Record<string, string> = {
    vue: 'vue-react',
    react: 'vue-react',
    frontend: 'vue-react',
    ai: 'ai-application',
    rag: 'ai-application',
    system: 'system-design',
    architecture: 'system-design',
    project: 'project-depth',
    behavioral: 'project-depth',
  };
  const rawScore = Number(cue.score ?? cue.rating ?? cue.level);
  const score = Number.isFinite(rawScore) ? rawScore : undefined;
  const strengths = Array.isArray(cue.strengths) ? cue.strengths : [];
  const gaps = Array.isArray(cue.gaps)
    ? cue.gaps
    : Array.isArray(cue.weaknesses)
      ? cue.weaknesses
      : [];
  const nextAction = cue.nextAction ?? cue.recommendation ?? cue.action;
  const evidence = cue.evidence;
  return {
    ...cue,
    competency: aliases[competency] ?? competency,
    score,
    strengths,
    gaps,
    nextAction,
    evidence,
  };
}

function repairQuestionSet(value: unknown): unknown {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { questions?: unknown }).questions)
  ) {
    return value;
  }
  const questions = (value as { questions: unknown[] }).questions;
  return {
    ...(value as Record<string, unknown>),
    questions: questions.map((item, index) => {
      if (!item || typeof item !== 'object') return item;
      const question = item as Record<string, unknown>;
      const competencyAliases: Record<string, string> = {
        vue: 'vue-react',
        react: 'vue-react',
        frontend: 'vue-react',
        ai: 'ai-application',
        rag: 'ai-application',
        system: 'system-design',
        architecture: 'system-design',
        project: 'project-depth',
        behavioral: 'project-depth',
      };
      const difficulty = String(question.difficulty ?? '').toLowerCase();
      const competency = String(question.competency ?? '').toLowerCase();
      return {
        ...question,
        id: question.id ?? `question_${index + 1}`,
        prompt: question.prompt ?? question.question ?? question.text,
        competency: competencyAliases[competency] ?? question.competency,
        difficulty:
          difficulty === 'easy'
            ? 'l1'
            : difficulty === 'medium'
              ? 'l2'
              : difficulty === 'hard'
                ? 'l3'
                : (question.difficulty ?? 'l2'),
        isCore: typeof question.isCore === 'boolean' ? question.isCore : false,
      };
    }),
  };
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
    '请生成 summary、competencies、likelyQuestions、missingEvidence。competencies 必须包含以下四个 competency 各一项：vue-react、ai-application、system-design、project-depth；priority 只能是 high、medium、low；evidence 必须是包含 source 和 quote 的对象数组，source 只能是 resume、job_description、answer、history。',
    '严格只输出一个 JSON 对象，不要 Markdown 代码围栏。格式示例：',
    JSON.stringify({
      summary: '岗位重视前端交付与 AI 应用能力。',
      competencies: [
        {
          competency: 'vue-react',
          priority: 'high',
          summary: '需要 Vue 或 React 交付经验。',
          focusAreas: ['组件设计'],
          evidence: [{ source: 'job_description', quote: 'Build frontend applications.' }],
        },
        {
          competency: 'ai-application',
          priority: 'medium',
          summary: '需要 AI 功能落地经验。',
          focusAreas: ['评估与监控'],
          evidence: [{ source: 'resume', quote: 'Built an AI application.' }],
        },
        {
          competency: 'system-design',
          priority: 'medium',
          summary: '需要系统设计和技术取舍能力。',
          focusAreas: ['可用性'],
          evidence: [{ source: 'job_description', quote: 'Own system design.' }],
        },
        {
          competency: 'project-depth',
          priority: 'low',
          summary: '需要可量化的项目结果。',
          focusAreas: ['结果指标'],
          evidence: [{ source: 'resume', quote: 'Reduced page load time.' }],
        },
      ],
      likelyQuestions: ['请介绍一个相关项目。'],
      missingEvidence: [],
    }),
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
    '每个数组最多 2 项，每项不超过 80 个字；nextAction 不超过 120 个字；禁止输出额外解释，确保 JSON 完整闭合。',
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

export * from './agents/model-gateway.js';
export * from './agents/profile-agent.js';
export * from './agents/job-agent.js';
export * from './agents/interviewer-agent.js';
export * from './agents/coach-agent.js';
export * from './agents/report-agent.js';
export * from './workflows/interview-workflows.js';
