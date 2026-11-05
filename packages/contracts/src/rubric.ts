import { z } from 'zod';

export const rubricSnapshotSchema = z
  .object({
    bankId: z.string().min(1),
    questionVersion: z.string().min(1),
    rubricVersion: z.literal('rubric-v3'),
    skillIds: z.array(z.string().min(1)).min(1),
    constraints: z.array(z.string().min(1)).min(1),
    commonMistakes: z.array(z.string().min(1)).optional(),
    followUpRules: z.array(z.string().min(1)).optional(),
    criteria: z
      .array(z.object({ id: z.string().min(1), description: z.string().min(1) }))
      .length(4),
    anchors: z
      .array(z.object({ score: z.number().int().min(1).max(5), description: z.string().min(1) }))
      .length(5),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.criteria.map((c) => c.id)).size !== 4)
      ctx.addIssue({ code: 'custom', message: 'Rubric criterion IDs must be unique' });
    if (new Set(value.anchors.map((a) => a.score)).size !== 5)
      ctx.addIssue({ code: 'custom', message: 'Rubric must define all five score anchors' });
  });
export type RubricSnapshot = z.infer<typeof rubricSnapshotSchema>;

export const rubricEvaluationSchema = z
  .object({
    rubricVersion: z.literal('rubric-v3'),
    bankId: z.string().min(1),
    questionVersion: z.string().min(1),
    items: z
      .array(
        z.object({
          criterionId: z.string().min(1),
          status: z.enum(['met', 'missing', 'incorrect', 'unclear']),
          reason: z.string().min(1),
          quotes: z.array(z.string().trim().min(1)),
        }),
      )
      .length(4),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.items.map((item) => item.criterionId)).size !== 4)
      ctx.addIssue({ code: 'custom', message: 'Assessment criteria must be unique' });
    for (const [index, item] of value.items.entries()) {
      if (item.status === 'missing' ? item.quotes.length !== 0 : item.quotes.length === 0)
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'quotes'],
          message: 'Missing criteria have no quotes; all other judgments require answer quotes',
        });
    }
  });
export type RubricEvaluation = z.infer<typeof rubricEvaluationSchema>;
