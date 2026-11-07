import { NotFoundException } from '@nestjs/common';
import {
  persistedReportSchema,
  sessionHistoryPageSchema,
  sessionReviewSchema,
  type SessionHistoryQuery,
} from '@interview-assistant/contracts';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { toCue } from './cue-record.js';

const metadata = {
  id: true,
  status: true,
  startedAt: true,
  endedAt: true,
  plan: {
    select: {
      language: true,
      round: true,
      difficulty: true,
      job: { select: { targetRole: true, company: true } },
    },
  },
} satisfies Prisma.InterviewSessionSelect;
const historySelect = {
  ...metadata,
  questions: { select: { parentQuestionId: true, answer: { select: { id: true } } } },
  report: { select: { overallScore: true, scoringVersion: true } },
} satisfies Prisma.InterviewSessionSelect;
type HistoryRow = Prisma.InterviewSessionGetPayload<{ select: typeof historySelect }>;

function summary(row: HistoryRow) {
  const main = row.questions.filter((q) => !q.parentQuestionId);
  return {
    id: row.id,
    status: row.status,
    ...row.plan.job,
    language: row.plan.language,
    round: row.plan.round,
    difficulty: row.plan.difficulty,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    mainQuestionCount: main.length,
    answeredMainQuestionCount: main.filter((q) => q.answer).length,
    followUpCount: row.questions.length - main.length,
    report: row.report,
  };
}

/** Read-only projections. Local-user scope matches the current single-user MVP. */
export class SessionHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: SessionHistoryQuery) {
    const where = {
      plan: { profile: { userKey: 'local-user' } },
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.interviewSession.findMany({
        where,
        select: historySelect,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.interviewSession.count({ where }),
    ]);
    return sessionHistoryPageSchema.parse({ ...query, total, items: rows.map(summary) });
  }

  async review(id: string) {
    const row = await this.prisma.interviewSession.findFirst({
      where: { id, plan: { profile: { userKey: 'local-user' } } },
      select: {
        ...metadata,
        feedbackPolicy: true,
        activeQuestionId: true,
        report: true,
        questions: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            parentQuestionId: true,
            competency: true,
            difficulty: true,
            prompt: true,
            isCore: true,
            rubricSnapshot: true,
            skippedAt: true,
            answer: { select: { id: true, answerText: true, createdAt: true, cue: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Interview session not found');
    const deferred = row.feedbackPolicy === 'deferred' && row.status !== 'completed';
    const questions = row.questions.map((q) => ({
      ...q,
      rubricSnapshot: deferred ? null : q.rubricSnapshot,
      skippedAt: q.skippedAt?.toISOString() ?? null,
      referenceViewedAt: deferred
        ? null
        : (q.answer?.cue?.referenceViewedAt?.toISOString() ?? null),
      dispute: deferred ? null : (q.answer?.cue?.dispute ?? null),
      answer: q.answer
        ? {
            answerText: q.answer.answerText,
            createdAt: q.answer.createdAt.toISOString(),
            cue: !deferred && q.answer.cue ? toCue(q.answer.cue) : null,
          }
        : null,
    }));
    const mainCues = questions.flatMap((q) =>
      !q.parentQuestionId && q.answer?.cue ? [q.answer.cue] : [],
    );
    const supplementalCues = questions.flatMap((q) =>
      q.parentQuestionId && q.answer?.cue ? [q.answer.cue] : [],
    );
    const measured = row.report
      ? Object.values(row.report.competencyScores as Record<string, number | null>).filter(
          (s) => s !== null,
        ).length
      : 0;
    return sessionReviewSchema.parse({
      ...summary(row),
      activeQuestionId: row.activeQuestionId,
      feedbackPolicy: row.feedbackPolicy,
      questions,
      report: row.report
        ? persistedReportSchema.parse({
            ...row.report,
            cues: mainCues,
            supplementalCues,
            assessmentStatus:
              measured === 4 ? 'complete' : measured === 0 ? 'unassessed' : 'partial',
          })
        : null,
    });
  }
}
