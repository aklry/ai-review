import {
  difficultySchema,
  interviewRoundSchema,
  rubricSnapshotSchema,
  type Competency,
  type InterviewQuestion,
} from '@interview-assistant/contracts';
import { topics, snapshotFor, difficultyConstraints, roundInstructions } from './catalog.js';

export function selectStandardQuestions(
  input: {
    questionCount: number;
    difficulty: string;
    round: string;
    language: string;
    profileSummary: string;
    jobAnalysis?: unknown;
    jobDescription?: string | undefined;
    recentTopics?: Array<{ id: string; score: number | null }> | undefined;
  },
  seed = 'initial',
): InterviewQuestion[] {
  const difficulty = difficultySchema.parse(input.difficulty);
  const round = interviewRoundSchema.parse(input.round);
  if (!Number.isInteger(input.questionCount) || input.questionCount < 1 || input.questionCount > 12)
    throw new Error('Question count must be between 1 and 12');
  const competencies: Competency[] = [
    'vue-react',
    'ai-application',
    'system-design',
    'project-depth',
  ];
  const sequence: Competency[] =
    input.questionCount === 8
      ? [
          'vue-react',
          'ai-application',
          'ai-application',
          'system-design',
          'system-design',
          'project-depth',
          'project-depth',
          'project-depth',
        ]
      : Array.from({ length: input.questionCount }, (_, i) => competencies[i % 4]!);
  const context = `${input.profileSummary}\n${JSON.stringify(input.jobAnalysis)}`.toLowerCase();
  const recent = input.recentTopics ?? [];
  const jd = input.jobDescription?.toLowerCase() ?? '';
  const priority = (topic: (typeof topics)[number]) => {
    const last = recent.findIndex((item) => item.id === topic.id);
    const scored = recent.find((item) => item.id === topic.id && item.score !== null);
    const weakness = scored?.score != null && scored.score <= 2 ? 3 : 0;
    const relevance = topic.tags.reduce(
      (sum, tag) => sum + Number(context.includes(tag)) + 2 * Number(jd.includes(tag)),
      0,
    );
    return relevance + weakness - (last < 0 ? 0 : Math.max(1, 12 - last / 2));
  };
  const used = new Set<string>();
  const covered = new Set<Competency>();
  return sequence.map((competency) => {
    const candidates = topics.filter(
      (topic) => topic.competency === competency && !used.has(topic.id),
    );
    candidates.sort(
      (a, b) =>
        priority(b) - priority(a) ||
        hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`) ||
        a.id.localeCompare(b.id),
    );
    const topic = candidates[0];
    if (!topic) throw new Error(`规范题不足：${competency}，请减少题目数量。`);
    used.add(topic.id);
    const isCore = !covered.has(competency);
    covered.add(competency);
    const english = input.language === 'en-US';
    return {
      id: topic.id,
      competency,
      difficulty,
      isCore,
      prompt: english
        ? `${roundInstructions[round].en}${topic.english} ${difficultyConstraints[difficulty].en}`
        : `${roundInstructions[round].zh}${topic.prompt} ${difficultyConstraints[difficulty].zh}${input.language === 'mixed' ? ' 可使用中英混合表达。' : ''}`,
      rubricSnapshot: rubricSnapshotSchema.parse(snapshotFor(topic, difficulty)),
    };
  });
}

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
