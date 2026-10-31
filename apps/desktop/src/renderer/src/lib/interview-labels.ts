import type {
  Competency,
  EvidenceSource,
  InterviewLanguage,
  InterviewRound,
} from '@interview-assistant/contracts';

export const competencyLabels: Record<Competency, string> = {
  'vue-react': 'Vue / React',
  'ai-application': 'AI 应用',
  'system-design': '系统设计',
  'project-depth': '项目深度',
};
export const sourceLabels: Record<EvidenceSource, string> = {
  resume: '简历',
  job_description: '岗位描述',
  answer: '本题回答',
  history: '历史回答',
};
export const languageLabels: Record<InterviewLanguage, string> = {
  'zh-CN': '中文',
  'en-US': '英文',
  mixed: '中英混合',
};
export const roundLabels: Record<InterviewRound, string> = {
  screening: '初筛',
  technical: '技术面',
  'system-design': '系统设计',
  behavioral: '行为面',
};
export const statusLabels = {
  active: '进行中',
  awaiting_finish: '待生成报告',
  completed: '已完成',
} as const;
export function formatInterviewDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
