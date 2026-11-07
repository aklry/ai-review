import type { InterviewQuestion, InterviewLanguage } from '@interview-assistant/contracts';
import { difficultyConstraints } from './catalog.js';

const cases: Record<string, { zh: [string, string]; en: [string, string] }> = {
  'fe-render': {
    zh: ['排序后行内编辑框保留了另一行的值。', '分页返回后图表仍使用前一页的状态。'],
    en: [
      "After sorting, a row editor retains another row's value.",
      "After pagination, the chart still uses the previous page's state.",
    ],
  },
  'fe-state': {
    zh: [
      '两个列表共享 URL 筛选，返回时出现两套筛选结果。',
      '弹窗编辑未提交的数据后，侧栏的服务端汇总也随之改变。',
    ],
    en: [
      'Two lists sharing URL filters disagree after back navigation.',
      'Editing an unsaved draft changes the server summary in the sidebar.',
    ],
  },
  'fe-performance': {
    zh: [
      '瀑布图显示 HTML 在 200ms 返回，主图到 2.8s 才开始下载。',
      '一次发布后移动端 LCP 从 2.4s 到 4.1s，桌面端没变。',
    ],
    en: [
      'HTML arrives at 200ms but the hero image request starts at 2.8s.',
      'After release mobile LCP moves from 2.4s to 4.1s while desktop stays flat.',
    ],
  },
  'fe-race': {
    zh: [
      '请求记录为 page=2 开始、page=3 开始、page=3 成功、page=2 成功，界面停在第二页。',
      '用户切换 A/B 两个账号后，A 的慢请求覆盖了 B 的余额与加载状态。',
    ],
    en: [
      'Page 2 starts, page 3 starts, page 3 succeeds, page 2 succeeds. The UI shows page 2.',
      'A slow balance response for account A overwrites account B and its loading state after a switch.',
    ],
  },
  'fe-contract': {
    zh: [
      '接口样本中 amount 分别为 12、"12" 和 null，图表偶发崩溃。',
      '灰度期间旧客户端收到新枚举值与缺失日期字段。',
    ],
    en: [
      'A chart crashes on responses with amount 12, "12" or null.',
      'During rollout old clients receive a new enum and omitted dates.',
    ],
  },
  'fe-release': {
    zh: [
      '灰度日志出现 ChunkLoadError，刷新后部分用户恢复。',
      '新版只在旧 WebView 白屏，错误率随放量上升。',
    ],
    en: [
      'A canary reports ChunkLoadError; refreshing only helps some users.',
      'Only older WebViews show a blank screen, with errors rising during rollout.',
    ],
  },
  'ai-rag': {
    zh: [
      '两版内部手册对额度规定不同，回答引用了过期章节。',
      '产品 FAQ 的答案引用了相似产品的条款。',
    ],
    en: [
      'Two editions of a handbook conflict and answers cite the old policy.',
      "Product FAQ answers cite a similar product's terms.",
    ],
  },
  'ai-eval': {
    zh: [
      '检索 top-5 含正确手册，回答却引用了不相关段落。',
      '换向量模型后引用命中率下降，但回答流畅度没变。',
    ],
    en: [
      'Top-5 includes the right manual, but the output cites an unrelated paragraph.',
      'Changing embeddings reduces citation hits while fluency stays flat.',
    ],
  },
  'ai-tools': {
    zh: [
      '写入日历的工具超时，但服务端已创建事件。',
      '生成发票的任务在确认响应丢失后被两个 worker 接手。',
    ],
    en: [
      'A calendar tool times out after the event was created.',
      'Two workers resume invoice creation after acknowledgement is lost.',
    ],
  },
  'ai-boundary': {
    zh: [
      '知识库文章请求助手导出读者无权访问的资料。',
      '共享文件包含第三方要求扩大工具权限的文本。',
    ],
    en: [
      'A retrieved article requests export of records the reader cannot access.',
      'A shared file contains third-party text asking for expanded tool permissions.',
    ],
  },
  'ai-budget': {
    zh: [
      '日志显示首 token 等待 4 秒，检索只耗时 100ms。',
      '流量翻倍后账单增长四倍，长对话尾部延迟上升。',
    ],
    en: [
      'Time to first token is four seconds but retrieval takes only 100ms.',
      'Traffic doubles, billing quadruples, and tail latency grows for long chats.',
    ],
  },
  'ai-regression': {
    zh: [
      '改检索模板后引用准确性下降，平均评分不变。',
      '小流量上线新模型后双语回答明显变短，投诉增加。',
    ],
    en: [
      'Citation accuracy drops after a template change while mean scores stay flat.',
      'A new model shortens bilingual answers in a canary and complaints increase.',
    ],
  },
  'sys-cache': {
    zh: ['商品改价后两个地区的详情页显示不同价格。', '权限撤销后，多节点缓存短时返回旧菜单。'],
    en: [
      'Two regions show different prices after a catalog update.',
      'Several cache nodes briefly serve the old menu after access revocation.',
    ],
  },
  'sys-capacity': {
    zh: [
      '促销前日均 50 QPS，但开场一分钟可能有 2 万人同时进入。',
      '每小时整点导出任务与在线查询竞争同一连接池。',
    ],
    en: [
      'Average traffic is 50 QPS, but 20,000 shoppers can arrive in the opening minute.',
      'Hourly export jobs compete with live queries for one connection pool.',
    ],
  },
  'sys-queue': {
    zh: ['任务写入结果后 worker 重启，消息再次投递。', '批量转换任务第 7 个文件完成时租约过期。'],
    en: [
      'A worker restarts after writing a result and receives the message again.',
      'A batch conversion lease expires after the seventh output file.',
    ],
  },
  'sys-api': {
    zh: [
      '列表翻到第二页时有人插入并编辑靠前记录。',
      '移动端离线编辑后恢复网络，与网页编辑发生冲突。',
    ],
    en: [
      'Earlier rows are inserted and edited while a reader requests page two.',
      'An offline mobile edit conflicts with a web update on reconnect.',
    ],
  },
  'sys-resilience': {
    zh: [
      '推荐服务 P99 从 120ms 升到 5s，首页线程池耗尽。',
      '支付页的可选风控摘要偶发超时，重试后队列变长。',
    ],
    en: [
      'Recommendation P99 jumps from 120ms to 5s and exhausts homepage workers.',
      'An optional checkout summary times out and retries grow the queue.',
    ],
  },
  'sys-observe': {
    zh: [
      '错误率稳定，用户反馈结算变慢，服务刚完成分批发布。',
      '总请求正常但某地区成功订单减少，指标只有全局均值。',
    ],
    en: [
      'Errors are flat but checkout slows after a staged deployment.',
      'Traffic is normal but orders drop in one region; only global averages exist.',
    ],
  },
  'project-ownership': {
    zh: [
      '回忆你接手一个已有模块的经历，说明交接前后由谁决策。',
      '选择一次跨团队交付，讲清团队方案里哪部分由你负责及其结果。',
    ],
    en: [
      'Recall taking ownership of an existing module and explain who made decisions.',
      'Choose a cross-team delivery and distinguish your own responsibility and results.',
    ],
  },
  'project-tradeoff': {
    zh: [
      '回忆一次工期紧张时的技术选型，说明被舍弃的方案。',
      '讲一次依赖或部署环境限制了选型的真实经历。',
    ],
    en: [
      'Recall a deadline-driven technical choice and the rejected option.',
      'Describe a real design choice constrained by dependencies or deployment.',
    ],
  },
  'project-impact': {
    zh: [
      '选一次你实际观察过的体验优化，说明怎样排除流量结构变化。',
      '选择一项效率改进，解释如何判断效果来自该变更。',
    ],
    en: [
      'Choose an actual UX improvement and explain how you controlled for traffic mix.',
      'Choose a productivity improvement and explain how you attributed its effect.',
    ],
  },
  'project-incident': {
    zh: [
      '选一次报警晚于用户反馈的故障，说明你的处置过程。',
      '回忆一次难以复现的问题，你怎样止损并确认修复有效？',
    ],
    en: [
      'Choose an incident reported by users before alerts and describe your response.',
      'Recall an intermittent incident. How did you mitigate it and verify recovery?',
    ],
  },
  'project-collaboration': {
    zh: [
      '回忆一次需求优先级分歧，说明你怎样让参与方作出决定。',
      '选择一次接口契约争议，说明你怎样澄清约束并跟踪交付。',
    ],
    en: [
      'Recall a disagreement over priorities and how you helped reach a decision.',
      'Choose a contract dispute and explain how you clarified constraints and followed delivery.',
    ],
  },
  'project-learning': {
    zh: [
      '选择一次上线后假设落空的尝试，说明你改变了什么。',
      '回忆一次技术试验被你叫停的经历，说明判据和后续验证。',
    ],
    en: [
      'Choose an assumption disproved after rollout and explain what changed.',
      'Recall a trial you stopped; explain your criteria and subsequent validation.',
    ],
  },
};

export function practicePrompts(
  question: InterviewQuestion,
  language: InterviewLanguage,
): string[] {
  const variants = cases[question.rubricSnapshot?.bankId ?? ''];
  if (!variants) throw new Error('该题暂缺同标准的专项练习');
  const lang = language === 'en-US' ? 'en' : 'zh';
  const instruction =
    question.competency === 'project-depth'
      ? lang === 'en'
        ? 'Use your actual experience or explain what you have not tried.'
        : '请依据真实经历作答，缺少相关经历时可以直接说明。'
      : lang === 'en'
        ? 'Explain your diagnosis, decision and validation.'
        : '请说明你的分析、方案选择和验证方法。';
  return [
    question.prompt,
    ...variants[lang].map((scenario) =>
      [scenario, instruction, difficultyConstraints[question.difficulty][lang]].join(' '),
    ),
  ];
}
