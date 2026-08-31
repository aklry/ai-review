import { z } from 'zod';

export const interviewModeSchema = z.enum(['preparation', 'simulation', 'authorized-assist']);
export type InterviewMode = z.infer<typeof interviewModeSchema>;

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
  'vue-react': competencyScoreSchema,
  'ai-application': competencyScoreSchema,
  'system-design': competencyScoreSchema,
  'project-depth': competencyScoreSchema,
});
export type CompetencyScores = z.infer<typeof competencyScoresSchema>;

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
