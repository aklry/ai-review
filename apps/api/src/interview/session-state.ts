import type { InterviewQuestion } from '@interview-assistant/contracts';

export function planNextTurn(
  questions: InterviewQuestion[],
  current: InterviewQuestion,
  followUp: InterviewQuestion | null,
) {
  const baseQuestions = questions.filter((question) => !question.parentQuestionId);
  const index = baseQuestions.findIndex(
    (question) => question.id === (current.parentQuestionId ?? current.id),
  );
  if (index < 0) throw new Error('Current question has no parent in the interview plan');
  if (followUp && !current.parentQuestionId) {
    return { nextQuestion: followUp, currentQuestionIndex: index, status: 'active' as const };
  }
  const nextQuestion = baseQuestions[index + 1] ?? null;
  return {
    nextQuestion,
    currentQuestionIndex: index + 1,
    status: nextQuestion ? ('active' as const) : ('awaiting_finish' as const),
  };
}
