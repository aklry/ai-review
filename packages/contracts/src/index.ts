import { z } from 'zod';

export const interviewModeSchema = z.enum(['preparation', 'simulation', 'authorized-assist']);
export type InterviewMode = z.infer<typeof interviewModeSchema>;

export const interviewLanguageSchema = z.enum(['zh-CN', 'en-US', 'mixed']);
export type InterviewLanguage = z.infer<typeof interviewLanguageSchema>;

export const interviewRoundSchema = z.enum([
  'screening',
  'technical',
  'system-design',
  'behavioral',
]);
export type InterviewRound = z.infer<typeof interviewRoundSchema>;

export const difficultySchema = z.enum(['l1', 'l2', 'l3']);
export type Difficulty = z.infer<typeof difficultySchema>;

export const competencySchema = z.enum([
  'vue-react',
  'ai-application',
  'system-design',
  'project-depth',
]);
export type Competency = z.infer<typeof competencySchema>;

export const competencyScoreSchema = z.number().int().min(1).max(5);
export type CompetencyScore = z.infer<typeof competencyScoreSchema>;

export const competencyScoresSchema = z.object({
  'vue-react': competencyScoreSchema.nullable(),
  'ai-application': competencyScoreSchema.nullable(),
  'system-design': competencyScoreSchema.nullable(),
  'project-depth': competencyScoreSchema.nullable(),
});
export type CompetencyScores = z.infer<typeof competencyScoresSchema>;

export const evidenceSourceSchema = z.enum(['resume', 'job_description', 'answer', 'history']);
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

export const evidenceSchema = z.object({
  source: evidenceSourceSchema,
  quote: z.string().trim().min(1),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const structuredProfileSchema = z.object({
  summary: z.string().trim().min(1),
  skills: z.array(z.string().trim().min(1)),
  projects: z.array(
    z.object({
      name: z.string().trim().min(1),
      contribution: z.string().trim().min(1),
      decisions: z.array(z.string().trim().min(1)),
      results: z.array(z.string().trim().min(1)),
      evidence: z.array(evidenceSchema).min(1),
    }),
  ),
  evidence: z.array(evidenceSchema).min(1),
  missingEvidence: z.array(z.string().trim().min(1)),
});
export type StructuredProfile = z.infer<typeof structuredProfileSchema>;

export const storyInputSchema = z.object({
  title: z.string().trim().min(1),
  project: z.string().trim().min(1),
  situation: z.string().trim().min(1),
  task: z.string().trim().min(1),
  action: z.string().trim().min(1),
  result: z.string().trim().min(1),
  metrics: z.array(z.string().trim().min(1)).default([]),
});
export type StoryInput = z.infer<typeof storyInputSchema>;

export const profileInputSchema = z.object({
  resumeText: z.string().trim().min(20),
  displayName: z.string().trim().min(1).optional(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const resumeSourceSchema = z.enum(['file', 'text']);
export type ResumeSource = z.infer<typeof resumeSourceSchema>;

export const resumeParseStatusSchema = z.enum(['pending', 'parsing', 'parsed', 'failed']);
export type ResumeParseStatus = z.infer<typeof resumeParseStatusSchema>;

export const resumeDocumentSummarySchema = z.object({
  id: z.string().trim().min(1),
  originalName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  extension: z.enum(['pdf', 'docx']),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().trim().min(1),
  parseStatus: resumeParseStatusSchema,
  extractedChars: z.number().int().nonnegative(),
});
export type ResumeDocumentSummary = z.infer<typeof resumeDocumentSummarySchema>;

export const uploadedProfileSchema = z.object({
  id: z.string().trim().min(1),
  resumeText: z.string().trim().min(20),
  displayName: z.string().trim().min(1).nullable(),
  resumeSource: resumeSourceSchema,
  resumeDocument: resumeDocumentSummarySchema.nullable(),
});
export type UploadedProfile = z.infer<typeof uploadedProfileSchema>;

export const jobAnalyzeInputSchema = z.object({
  profileId: z.string().trim().min(1),
  targetRole: z.string().trim().min(1),
  company: z.string().trim().min(1).optional(),
  jobDescription: z.string().trim().min(20),
});
export type JobAnalyzeInput = z.infer<typeof jobAnalyzeInputSchema>;

export const jobAnalysisStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type JobAnalysisStatus = z.infer<typeof jobAnalysisStatusSchema>;

export const competencyAnalysisSchema = z.object({
  competency: competencySchema,
  priority: z.enum(['high', 'medium', 'low']),
  summary: z.string().trim().min(1),
  focusAreas: z.array(z.string().trim().min(1)).min(1),
  evidence: z.array(evidenceSchema).min(1),
});
export type CompetencyAnalysis = z.infer<typeof competencyAnalysisSchema>;

export const jobAnalysisSchema = z.object({
  summary: z.string().trim().min(1),
  competencies: z.array(competencyAnalysisSchema).min(1),
  likelyQuestions: z.array(z.string().trim().min(1)).min(1),
  missingEvidence: z.array(z.string().trim().min(1)),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

export const jobRecordSchema = z.object({
  id: z.string().trim().min(1),
  profileId: z.string().trim().min(1),
  targetRole: z.string().trim().min(1),
  company: z.string().trim().min(1).nullable(),
  description: z.string().trim().min(1),
  analysis: jobAnalysisSchema.nullable(),
  analysisStatus: jobAnalysisStatusSchema,
  analysisError: z.string().trim().min(1).nullable(),
});
export type JobRecord = z.infer<typeof jobRecordSchema>;

export const questionSchema = z.object({
  // IDs are assigned by the API after generation; accepting an omitted ID
  // keeps model output compatible while preserving a required string type.
  id: z.string().trim().min(1).default('question'),
  competency: competencySchema,
  difficulty: difficultySchema,
  prompt: z.string().trim().min(1),
  isCore: z.boolean(),
  parentQuestionId: z.string().min(1).nullable().optional(),
});
export type InterviewQuestion = z.infer<typeof questionSchema>;

export const questionSetSchema = z.object({
  questions: z.array(questionSchema).min(1).max(12),
});
export type QuestionSet = z.infer<typeof questionSetSchema>;

export const coachingCueSchema = z.object({
  competency: competencySchema,
  score: competencyScoreSchema,
  strengths: z.array(z.string().trim().min(1)),
  gaps: z.array(z.string().trim().min(1)),
  nextAction: z.string().trim().min(1),
  evidence: z.array(evidenceSchema).min(1),
  followUpQuestion: z.string().trim().min(1).optional(),
});
export type CoachingCue = z.infer<typeof coachingCueSchema>;

export const interviewSessionCreateInputSchema = z.object({
  profileId: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
  language: interviewLanguageSchema,
  round: interviewRoundSchema,
  difficulty: difficultySchema,
  questionCount: z.number().int().min(1).max(12).default(8),
});
export type InterviewSessionCreateInput = z.infer<typeof interviewSessionCreateInputSchema>;

export const answerSubmitInputSchema = z.object({
  questionId: z.string().trim().min(1),
  answerText: z.string().trim().min(1),
});
export type AnswerSubmitInput = z.infer<typeof answerSubmitInputSchema>;

export const trainingDaySchema = z.object({
  day: z.number().int().min(1).max(7),
  focus: competencySchema,
  task: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});
export type TrainingDay = z.infer<typeof trainingDaySchema>;

export const trainingPlanSchema = z
  .array(trainingDaySchema)
  .length(7)
  .refine(
    (days) => new Set(days.map((day) => day.day)).size === 7,
    'Training plan must cover each of days 1 through 7 exactly once',
  );

export const reportNarrativeSchema = z.object({
  summary: z.string().trim().min(1),
  strengths: z.array(z.string().trim().min(1)),
  gaps: z.array(z.string().trim().min(1)),
  nextPlan: trainingPlanSchema,
});
export type ReportNarrative = z.infer<typeof reportNarrativeSchema>;

export const evaluationReportSchema = z.object({
  summary: z.string().trim().min(1),
  overallScore: z.number().min(0).max(100).nullable(),
  competencyScores: competencyScoresSchema,
  cues: z.array(coachingCueSchema),
  supplementalCues: z.array(coachingCueSchema).optional(),
  strengths: z.array(z.string().trim().min(1)),
  gaps: z.array(z.string().trim().min(1)),
  nextPlan: trainingPlanSchema,
  scoringVersion: z.enum(['legacy-v1', 'evidence-v2']).optional(),
  assessmentStatus: z.enum(['complete', 'partial', 'unassessed']).optional(),
});
export type EvaluationReport = z.infer<typeof evaluationReportSchema>;

/** Read historical plans as stored; only evidence-v2 promises distinct days. */
export const persistedReportSchema = evaluationReportSchema
  .extend({ nextPlan: z.array(trainingDaySchema).length(7) })
  .superRefine((report, context) => {
    if (
      report.scoringVersion === 'evidence-v2' &&
      new Set(report.nextPlan.map((day) => day.day)).size !== 7
    ) {
      context.addIssue({
        code: 'custom',
        path: ['nextPlan'],
        message: 'New reports must cover each training day exactly once',
      });
    }
  });

export const sessionStatusSchema = z.enum(['active', 'awaiting_finish', 'completed']);
export const sessionHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  status: sessionStatusSchema.optional(),
});
export type SessionHistoryQuery = z.infer<typeof sessionHistoryQuerySchema>;

export const sessionHistoryItemSchema = z.object({
  id: z.string().min(1),
  status: sessionStatusSchema,
  targetRole: z.string(),
  company: z.string().nullable(),
  language: interviewLanguageSchema,
  round: interviewRoundSchema,
  difficulty: difficultySchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  mainQuestionCount: z.number().int().nonnegative(),
  answeredMainQuestionCount: z.number().int().nonnegative(),
  followUpCount: z.number().int().nonnegative(),
  report: z
    .object({
      overallScore: z.number().min(0).max(100).nullable(),
      scoringVersion: z.string(),
    })
    .nullable(),
});
export type SessionHistoryItem = z.infer<typeof sessionHistoryItemSchema>;
export const sessionHistoryPageSchema = z.object({
  items: z.array(sessionHistoryItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type SessionHistoryPage = z.infer<typeof sessionHistoryPageSchema>;

export const sessionReviewSchema = sessionHistoryItemSchema.extend({
  activeQuestionId: z.string().nullable(),
  questions: z.array(
    questionSchema.extend({
      answer: z
        .object({
          answerText: z.string(),
          createdAt: z.string().datetime(),
          cue: coachingCueSchema.nullable(),
        })
        .nullable(),
    }),
  ),
  report: persistedReportSchema.nullable(),
});
export type SessionReview = z.infer<typeof sessionReviewSchema>;

export const scoreWeights = {
  'vue-react': 10,
  'ai-application': 20,
  'system-design': 30,
  'project-depth': 40,
} as const satisfies Record<Competency, number>;

export const questionInventory = {
  'vue-react': { total: 12, l1: 4, l2: 6, l3: 2, core: 4 },
  'ai-application': { total: 24, l1: 7, l2: 12, l3: 5, core: 6 },
  'system-design': { total: 36, l1: 10, l2: 18, l3: 8, core: 8 },
  'project-depth': { total: 48, l1: 14, l2: 24, l3: 10, core: 10 },
} as const satisfies Record<
  Competency,
  {
    total: number;
    l1: number;
    l2: number;
    l3: number;
    core: number;
  }
>;

export const healthResponseSchema = z.object({
  service: z.string(),
  status: z.literal('ok'),
  timestamp: z.string().datetime(),
  scoringReady: z.boolean(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const createApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    code: z.number().int(),
    message: z.string(),
    data: dataSchema,
    requestId: z.string().min(1),
    timestamp: z.string().datetime(),
  });

export type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
  requestId: string;
  timestamp: string;
};
