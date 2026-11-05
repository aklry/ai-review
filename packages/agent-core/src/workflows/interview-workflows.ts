import { Annotation, END, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  CoachingCue,
  CompetencyScores,
  EvaluationReport,
  InterviewQuestion,
  JobAnalysis,
  StructuredProfile,
} from '@interview-assistant/contracts';
import { structuredProfileSchema, evaluationReportSchema } from '@interview-assistant/contracts';
import { calculateWeightedScore, normalizeCompetencyScores } from '../index.js';
import { ProfileAgent, type ProfileAgentInput } from '../agents/profile-agent.js';
import { JobAgent, type JobAgentInput } from '../agents/job-agent.js';
import { InterviewerAgent, type QuestionAgentInput } from '../agents/interviewer-agent.js';
import { CoachAgent, type CoachAgentInput } from '../agents/coach-agent.js';
import { ReportAgent } from '../agents/report-agent.js';
import type { AgentModelGateway } from '../agents/model-gateway.js';
import { selectStandardQuestions } from '../question-bank/selection.js';

export type PreparationInput = JobAgentInput & { cachedProfile?: StructuredProfile };
export type WorkflowRun = { operationId: string; sessionId?: string };
export type ReportInput = {
  sessionId: string;
  language: string;
  profileSummary: string;
  jobSummary: string;
  cues: CoachingCue[];
  supplementalCues?: CoachingCue[];
};

const PreparationState = Annotation.Root({
  input: Annotation<PreparationInput>(),
  profile: Annotation<StructuredProfile>(),
  analysis: Annotation<JobAnalysis>(),
});
const QuestionState = Annotation.Root({
  input: Annotation<QuestionAgentInput>(),
  questions: Annotation<InterviewQuestion[]>(),
});
const TurnState = Annotation.Root({
  input: Annotation<CoachAgentInput>(),
  cue: Annotation<CoachingCue>(),
  followUp: Annotation<InterviewQuestion | null>(),
  model: Annotation<string>(),
  degraded: Annotation<boolean>(),
});
const ReportState = Annotation.Root({
  input: Annotation<ReportInput>(),
  scores: Annotation<CompetencyScores>(),
  report: Annotation<EvaluationReport>(),
});

export class InterviewWorkflows {
  private readonly preparation;
  private readonly questionGeneration;
  private readonly coaching;
  private readonly reporting;
  private readonly checkpointer: BaseCheckpointSaver | undefined;

  constructor(model: AgentModelGateway, options: { checkpointer?: BaseCheckpointSaver } = {}) {
    this.checkpointer = options.checkpointer;
    const compile = options.checkpointer ? { checkpointer: options.checkpointer } : {};
    const profileAgent = new ProfileAgent(model);
    const jobAgent = new JobAgent(model);
    const interviewer = new InterviewerAgent(model);
    const coach = new CoachAgent(model);
    const reportAgent = new ReportAgent(model);
    this.preparation = new StateGraph(PreparationState)
      .addNode('extractProfile', async (state, config) => ({
        profile: state.input.cachedProfile
          ? structuredProfileSchema.parse(state.input.cachedProfile)
          : (await profileAgent.invoke(state.input as ProfileAgentInput, config)).data,
      }))
      .addNode('job', async (state, config) => ({
        analysis: (
          await jobAgent.invoke({ ...state.input, structuredProfile: state.profile }, config)
        ).data,
      }))
      .addEdge(START, 'extractProfile')
      .addEdge('extractProfile', 'job')
      .addEdge('job', END)
      .compile(compile);
    this.questionGeneration = new StateGraph(QuestionState)
      .addNode('interviewer', async (state, config) => ({
        questions: state.input.standardQuestions
          ? selectStandardQuestions(
              state.input,
              String(config?.configurable?.thread_id ?? 'initial'),
            )
          : (await interviewer.invoke(state.input, config)).data.questions,
      }))
      .addEdge(START, 'interviewer')
      .addEdge('interviewer', END)
      .compile(compile);
    this.coaching = new StateGraph(TurnState)
      .addNode('coach', async (state, config) => {
        const result = await coach.invoke(state.input, config);
        return { cue: result.data, followUp: null, model: result.model, degraded: result.degraded };
      })
      .addNode('askFollowUp', async (state, config) => {
        const result = await interviewer.followUp.invoke(
          {
            currentQuestion: state.input.currentQuestion,
            answerText: state.input.answerText,
            language: state.input.language,
            cue: state.cue,
          },
          config,
        );
        return {
          followUp: {
            ...result.data.question,
            id: `followup-${state.input.currentQuestion.id}`,
            parentQuestionId: state.input.currentQuestion.id,
            competency: state.input.currentQuestion.competency,
            difficulty: state.input.currentQuestion.difficulty,
            isCore: false,
            rubricSnapshot: null,
          },
          degraded: state.degraded || result.degraded,
        };
      })
      .addEdge(START, 'coach')
      .addConditionalEdges('coach', (state) =>
        !state.input.currentQuestion.parentQuestionId && state.cue.followUpQuestion
          ? 'askFollowUp'
          : END,
      )
      .addEdge('askFollowUp', END)
      .compile(compile);
    this.reporting = new StateGraph(ReportState)
      .addNode('scoring', (state) => ({ scores: normalizeCompetencyScores(state.input.cues) }))
      .addNode('writeReport', async (state, config) => {
        const result = await reportAgent.invoke(
          { ...state.input, competencyScores: state.scores },
          config,
        );
        const measured = Object.values(state.scores).filter((score) => score !== null).length;
        return {
          report: evaluationReportSchema.parse({
            ...result.data,
            cues: state.input.cues,
            supplementalCues: state.input.supplementalCues ?? [],
            competencyScores: state.scores,
            overallScore: calculateWeightedScore(state.scores),
            scoringVersion:
              state.input.cues.length > 0 && state.input.cues.every((cue) => cue.rubricEvaluation)
                ? 'rubric-v3'
                : 'evidence-v2',
            assessmentStatus:
              measured === 4 ? 'complete' : measured === 0 ? 'unassessed' : 'partial',
          }),
        };
      })
      .addEdge(START, 'scoring')
      .addEdge('scoring', 'writeReport')
      .addEdge('writeReport', END)
      .compile(compile);
  }

  async prepare(input: PreparationInput, run: WorkflowRun) {
    const config = this.config('prepare', run);
    const result = await this.preparation.invoke(
      await this.resumeInput(this.preparation, input, config),
      config,
    );
    return { profile: result.profile, analysis: result.analysis };
  }
  async questions(input: QuestionAgentInput, run: WorkflowRun) {
    const config = this.config('questions', run);
    const result = await this.questionGeneration.invoke(
      await this.resumeInput(this.questionGeneration, input, config),
      config,
    );
    return result.questions;
  }
  async coach(input: CoachAgentInput, run: WorkflowRun) {
    const config = this.config('coach', run);
    const result = await this.coaching.invoke(
      await this.resumeInput(this.coaching, input, config),
      config,
    );
    return {
      cue: result.cue,
      followUp: result.followUp,
      model: result.model,
      degraded: result.degraded,
    };
  }
  async report(input: ReportInput, run: WorkflowRun) {
    const config = this.config('report', run);
    const result = await this.reporting.invoke(
      await this.resumeInput(this.reporting, input, config),
      config,
    );
    return result.report;
  }
  private config(kind: string, run: WorkflowRun): RunnableConfig {
    return {
      configurable: {
        thread_id: `${kind}:${run.operationId}`,
        ...(run.sessionId ? { sessionId: run.sessionId } : {}),
      },
      recursionLimit: 12,
    };
  }
  private async resumeInput<T>(
    graph: { getState(config: RunnableConfig): Promise<{ values: Record<string, unknown> }> },
    input: T,
    config: RunnableConfig,
  ): Promise<{ input: T } | null> {
    if (this.checkpointer) {
      const snapshot = await graph.getState(config);
      if (snapshot.values.input) {
        const canonical = (value: unknown) =>
          JSON.stringify(value, (key, item) => (key === 'cachedProfile' ? undefined : item));
        if (canonical(snapshot.values.input) !== canonical(input))
          throw new Error('Workflow operation reused with different input');
        return null;
      }
    }
    return { input };
  }
}
