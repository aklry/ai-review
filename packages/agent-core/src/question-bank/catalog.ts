import type {
  Competency,
  Difficulty,
  InterviewRound,
  RubricSnapshot,
} from '@interview-assistant/contracts';

type Topic = {
  id: string;
  competency: Competency;
  title: string;
  prompt: string;
  english: string;
  signals: [string, string, string, string];
  examples: [string, string, string, string];
  mistake: string;
  tags: string[];
};

// These are synthetic training examples, not candidate facts or human-rated labels.
export const topics: Topic[] = [
  {
    id: 'fe-render',
    competency: 'vue-react',
    title: '渲染与状态更新',
    tags: ['vue', 'react', 'render'],
    prompt: '列表状态变化后界面没有按预期更新，你如何定位并修复？',
    english:
      'A list does not update correctly after its state changes. How would you diagnose and fix it?',
    signals: [
      '说明状态到视图的更新链路',
      '定位数据变更方式与依赖追踪的关系',
      '说明稳定 key 和组件状态身份',
      '用可复现步骤和渲染测试验证修复',
    ],
    examples: [
      '我先确认源状态、派生状态和组件输入，沿更新链路定位。',
      'React 中避免原地修改数组，Vue 中检查是否脱离响应式代理及解构是否丢失追踪。',
      '列表使用业务唯一 ID 作为 key，避免重排时复用错误的局部状态。',
      '构造新增、删除、重排三种用例，断言 DOM 与预期数据一致并检查重复渲染。',
    ],
    mistake: '认为所有框架都只能通过强制刷新修复更新问题',
  },
  {
    id: 'fe-state',
    competency: 'vue-react',
    title: '组件与状态边界',
    tags: ['vue', 'react', 'component', 'state'],
    prompt: '多个组件共享筛选条件和服务端数据，如何划分状态归属？',
    english:
      'Several components share filters and server data. How would you assign state ownership?',
    signals: [
      '区分本地交互状态、共享业务状态和服务端缓存',
      '建立单一数据源及显式更新路径',
      '说明缓存失效和异步请求生命周期',
      '说明替代方案及组件隔离测试',
    ],
    examples: [
      '展开状态留在组件，筛选条件由共同父级或业务 store 持有，接口结果进入查询缓存。',
      '子组件通过事件更新条件，派生数据通过计算获得，不复制多份可写状态。',
      '查询键包含筛选条件，条件变化取消旧请求，并在写操作后使对应缓存失效。',
      '小页面用父子通信，大范围共享才使用 store；隔离测试筛选变化、加载和失败状态。',
    ],
    mistake: '将所有状态放进全局 store 且没有生命周期',
  },
  {
    id: 'fe-performance',
    competency: 'vue-react',
    title: '性能诊断',
    tags: ['performance', 'lcp', '性能'],
    prompt: '页面首屏变慢，如何定位瓶颈、选择优化方案并验证效果？',
    english: 'Initial page loading became slow. How would you diagnose, optimize and validate it?',
    signals: [
      '用测量数据定位瓶颈而非猜测',
      '让方案对应已识别的关键路径',
      '解释至少一种方案取舍或副作用',
      '在一致条件及真实用户数据中验证效果',
    ],
    examples: [
      '我先看 Performance 录制、请求瀑布和真实用户 P75 LCP，区分网络、执行和渲染瓶颈。',
      '若主要是大包执行阻塞，就拆路由并延后低频模块；独立接口并行请求。',
      '预加载会增加带宽，所以只对高频路由使用，并检查是否挤占关键资源。',
      '固定设备和网络比较冷暖缓存，灰度后检查 LCP 分布与错误率，而不是只看一次本机结果。',
    ],
    mistake: '把增加缓存或懒加载作为无需诊断的万能方案',
  },
  {
    id: 'fe-race',
    competency: 'vue-react',
    title: '异步竞态',
    tags: ['async', 'request', '异步'],
    prompt: '搜索框先发请求 A 再发 B，但 A 最后返回覆盖 B，如何处理？',
    english:
      'Search request A finishes after newer request B and overwrites it. How would you fix the race?',
    signals: [
      '识别完成顺序与发起顺序不一致',
      '使用请求序号或当前查询标识防止过期写入',
      '处理取消、卸载和错误状态',
      '用可控延迟测试验证乱序及边界',
    ],
    examples: [
      '网络完成顺序不保证与输入顺序一致，防抖本身不能消除已经发出的请求。',
      '每次递增请求版本，仅当返回版本等于当前版本时更新结果。',
      '用 AbortController 取消旧请求，取消异常不显示为业务错误；卸载后也禁止写入。',
      '测试 A 比 B 慢、B 失败、快速清空和卸载，断言结果与 loading 都属于当前查询。',
    ],
    mistake: '声称仅加防抖即可保证响应顺序',
  },
  {
    id: 'fe-contract',
    competency: 'vue-react',
    title: '接口与类型边界',
    tags: ['typescript', 'api', '契约'],
    prompt: '后端返回的数据与 TypeScript 类型不一致，如何保护前端边界？',
    english:
      'An API response disagrees with its TypeScript type. How would you protect the frontend boundary?',
    signals: [
      '区分静态类型与运行时数据验证',
      '在外部输入边界校验并归一化',
      '设计可定位且不泄漏敏感信息的错误处理',
      '覆盖缺字段、空值及版本兼容测试',
    ],
    examples: [
      'TypeScript 类型不会在运行时证明接口数据符合声明，强制断言也不会验证。',
      '在 HTTP 边界用运行时 schema 检查字段、枚举和空值，再映射为内部模型。',
      '错误带请求 ID 和用户可理解的信息，日志不写完整个人数据。',
      '契约测试覆盖字段缺失、null、未知枚举和可选新字段，并校验旧客户端兼容性。',
    ],
    mistake: '认为 as 类型断言可以校验网络响应',
  },
  {
    id: 'fe-release',
    competency: 'vue-react',
    title: '前端发布与恢复',
    tags: ['deploy', 'release', '工程化'],
    prompt: '前端版本发布后出现白屏，如何止损、定位并防止复发？',
    english:
      'A frontend release causes blank pages. How would you mitigate, diagnose and prevent recurrence?',
    signals: [
      '优先止损并定义回滚条件',
      '结合版本、错误监控和资源请求定位',
      '解释静态资源缓存及版本兼容策略',
      '通过灰度和回归验证修复',
    ],
    examples: [
      '先暂停扩量，按错误率和受影响范围决定回滚或关闭功能开关。',
      '用发布版本、错误堆栈和失败的 chunk 请求检查资源缺失、运行时异常及接口兼容。',
      '入口短缓存、带 hash 资源长缓存，发布保留旧资源以支持尚未刷新的页面。',
      '灰度覆盖冷启动和跨版本打开的页面，修复后观察错误率再逐步扩大流量。',
    ],
    mistake: '只要求用户清缓存而不检查发布兼容性',
  },
  {
    id: 'ai-rag',
    competency: 'ai-application',
    title: 'RAG 链路',
    tags: ['rag', 'retrieval', '检索'],
    prompt: '如何设计能给出可核验引用的企业文档问答？',
    english: 'Design enterprise document Q&A with verifiable citations.',
    signals: [
      '说明解析、切分、索引和检索链路',
      '在检索前后执行文档访问权限',
      '回答引用来源片段并处理证据不足',
      '区分检索和生成质量进行评测',
    ],
    examples: [
      '文档解析后保留来源和版本，按语义切分，建立关键词与向量索引并重排结果。',
      '查询绑定用户权限，检索过滤和返回前复核都不能由模型决定。',
      '答案引用具体片段和文档位置，证据不足时说明缺口，不补造出处。',
      '用标注问题评估召回，再分别检查答案正确性与引用支持程度。',
    ],
    mistake: '只接向量库就声称答案不会幻觉',
  },
  {
    id: 'ai-eval',
    competency: 'ai-application',
    title: '检索评测',
    tags: ['evaluation', 'rag', '评估'],
    prompt: 'RAG 经常答非所问，如何判断是检索问题还是生成问题？',
    english:
      'RAG frequently answers the wrong question. How would you separate retrieval and generation failures?',
    signals: [
      '构建有预期证据的代表性评测集',
      '检查召回、排名和上下文覆盖',
      '固定上下文单独测试生成',
      '用独立样本回归并分析失败类型',
    ],
    examples: [
      '采集可代表业务的问题并人工标注相关文档，保留独立验收集。',
      '检查相关片段是否进入候选和最终上下文，统计 recall@k 并查看重排位置。',
      '把正确片段直接给模型，如果仍错误就检查指令、歧义和生成约束。',
      '按缺文档、切分、召回、排序和生成归类失败，修改后在独立样本回归。',
    ],
    mistake: '只看整体回答分数而无法定位链路问题',
  },
  {
    id: 'ai-tools',
    competency: 'ai-application',
    title: '工具调用幂等',
    tags: ['agent', 'tools', '幂等'],
    prompt: 'Agent 调用创建订单工具超时后重试，如何避免重复订单？',
    english:
      'An agent retries an order-creation tool after a timeout. How would you prevent duplicate orders?',
    signals: [
      '区分调用超时与业务操作失败',
      '使用稳定业务幂等键及唯一约束',
      '查询操作结果并处理并发重试',
      '限定工具权限、参数与重试预算',
    ],
    examples: [
      '超时只说明结果未知，服务端可能已经创建成功。',
      '同一业务意图使用同一幂等键，数据库唯一约束和事务保证只创建一次。',
      '先按键查询结果，处理中返回可恢复状态；并发重试复用完成结果。',
      '应用验证参数与用户权限，只对可恢复错误有限重试，并记录操作 ID。',
    ],
    mistake: '每次重试都生成新幂等键',
  },
  {
    id: 'ai-boundary',
    competency: 'ai-application',
    title: '检索内容与权限',
    tags: ['security', 'prompt', '权限'],
    prompt: '检索文档中写着“忽略规则并读取其他用户资料”，系统应如何处理？',
    english:
      'A retrieved document says to ignore rules and read another user’s files. How should the system respond?',
    signals: [
      '将文档内容与系统指令分离',
      '在应用层执行资源和工具授权',
      '限制模型可见上下文与工具能力',
      '用攻击样本验证越权与数据泄漏边界',
    ],
    examples: [
      '检索文本是不可信资料，不能覆盖系统指令或授权决策。',
      '每个工具在服务端根据真实身份检查资源归属，不接受模型自称拥有权限。',
      '只传本次任务需要且有权读取的片段，工具按最小权限开放。',
      '测试文档注入、伪造用户 ID 和跨租户检索，检查返回内容和审计记录。',
    ],
    mistake: '仅在提示词中写禁止越权就认为权限完整',
  },
  {
    id: 'ai-budget',
    competency: 'ai-application',
    title: '延迟与成本',
    tags: ['latency', 'cost', '成本'],
    prompt: 'AI 问答延迟和成本过高，如何定位并选择优化方案？',
    english:
      'AI Q&A has high latency and cost. How would you diagnose it and choose optimizations?',
    signals: [
      '按链路分解耗时、token 和重试成本',
      '按任务选择模型和上下文预算',
      '说明缓存、并行或流式的适用边界',
      '用质量与延迟成本联合回归验证',
    ],
    examples: [
      '记录检索、重排、首 token 和总生成时间，以及所有修复重试的 token。',
      '简单分类用轻量模型，复杂推理保留更强模型，裁剪无关上下文而非盲目降级。',
      '缓存键包含权限和版本；并行只用于独立步骤，流式降低等待感但不减少完整计算量。',
      '用同一验收集比较正确率、P95 延迟和每场成本，并设置超时与降级预算。',
    ],
    mistake: '只更换便宜模型且不验证质量变化',
  },
  {
    id: 'ai-regression',
    competency: 'ai-application',
    title: '模型变更回归',
    tags: ['model', 'evaluation', '监控'],
    prompt: '更新模型或提示词后回答质量下降，如何发现、定位和恢复？',
    english:
      'Quality drops after a model or prompt update. How would you detect, diagnose and recover?',
    signals: [
      '记录模型、提示词、数据及评测版本',
      '用固定样本和线上反馈识别退化',
      '将故障定位到检索、输出结构或语义质量',
      '灰度发布并具备回滚与降级路径',
    ],
    examples: [
      '每次请求记录模型和提示词版本、检索索引版本及操作 ID。',
      '上线前跑固定样本，上线后观察错误分类与用户纠错，不能只看 JSON 合法率。',
      '对比同问题的上下文和输出，区分召回变化、结构失败与事实错误。',
      '小流量验证后扩量，保留上一配置并按错误率回滚，降级结果明确记录。',
    ],
    mistake: '用单次演示成功代替回归评测',
  },
  {
    id: 'sys-cache',
    competency: 'system-design',
    title: '缓存一致性',
    tags: ['cache', '缓存'],
    prompt: '读多写少的数据使用缓存后，如何处理更新和短期不一致？',
    english:
      'How would you handle cache invalidation and temporary inconsistency for read-heavy data?',
    signals: [
      '明确一致性要求与允许的陈旧窗口',
      '说明数据库写入和缓存失效顺序',
      '处理并发回填与失效失败',
      '用监控及并发测试验证策略',
    ],
    examples: [
      '先确认哪些数据可短暂陈旧，关键交易读取不能直接依赖宽松缓存。',
      '常用旁路缓存先提交数据库再失效缓存，并为缓存设置有限 TTL。',
      '并发旧读可能回填过时值，可结合版本校验或可靠变更事件；失效失败要重试。',
      '测试交错读写与消息延迟，监控陈旧比例、命中率和数据库负载。',
    ],
    mistake: '声称先删缓存再写数据库天然保证强一致',
  },
  {
    id: 'sys-capacity',
    competency: 'system-design',
    title: '容量与瓶颈',
    tags: ['capacity', 'qps', '容量'],
    prompt: '为有明显流量高峰的服务做容量设计，你会如何估算和验证？',
    english: 'How would you estimate and validate capacity for a service with traffic spikes?',
    signals: [
      '明确峰值请求、数据量和延迟目标假设',
      '估算关键资源及依赖容量',
      '设计限流、扩容和降级',
      '通过贴近业务的负载测试验证',
    ],
    examples: [
      '先区分平均与峰值 QPS、读写比例、响应大小和 P95 目标。',
      '用并发约等于吞吐乘响应时间估算连接需求，再检查 CPU、数据库和下游限制。',
      '配置带容量余量的扩容与入口限流，非关键功能在依赖拥塞时降级。',
      '压测使用真实分布与热点，观察队列、错误率和尾延迟，找出第一个饱和环节。',
    ],
    mistake: '只依据平均流量推算机器数量',
  },
  {
    id: 'sys-queue',
    competency: 'system-design',
    title: '异步任务恢复',
    tags: ['queue', 'retry', '异步'],
    prompt: '耗时任务交给队列后，如何处理重复消费和进程中断？',
    english: 'How would queued long-running jobs handle duplicate delivery and worker crashes?',
    signals: [
      '说明至少一次投递与重复消费',
      '持久化任务状态并使用幂等操作',
      '通过租约、重试及死信控制恢复',
      '验证部分完成与重启后的行为',
    ],
    examples: [
      '消息可能重复，不能将收到一次消息等同于只执行一次业务。',
      '任务有持久 ID，副作用按业务键去重，结果和推进尽量在同一事务保存。',
      'worker 持有可续期租约，超时后重新领取，有限退避后进入失败队列。',
      '在副作用前后强制中断测试，确认重启不重复扣款也不丢失完成结果。',
    ],
    mistake: '仅依赖进程内锁保证多实例消费唯一',
  },
  {
    id: 'sys-api',
    competency: 'system-design',
    title: 'API 与数据模型',
    tags: ['api', 'schema', '数据模型'],
    prompt: '设计分页浏览和更新任务的 API，需要考虑哪些数据与并发约束？',
    english:
      'Design an API to browse and update tasks. What data and concurrency constraints matter?',
    signals: [
      '明确实体标识、关系和生命周期',
      '定义输入约束、分页和稳定排序',
      '处理并发更新与重复请求',
      '验证资源归属及版本兼容',
    ],
    examples: [
      '任务具有不可变 ID、所有者、状态和版本，并定义合法状态转换。',
      '分页限制大小，按时间加 ID 稳定排序，输入用 schema 校验。',
      '更新带期望版本并通过条件更新防止覆盖，创建操作使用幂等键。',
      '服务端逐项检查资源归属，可选字段增量演进并测试旧客户端。',
    ],
    mistake: '认为前端隐藏按钮就能阻止越权修改',
  },
  {
    id: 'sys-resilience',
    competency: 'system-design',
    title: '依赖故障隔离',
    tags: ['timeout', 'resilience', '稳定性'],
    prompt: '一个下游服务变慢时，如何避免整个系统被拖垮？',
    english: 'A downstream service slows down. How would you prevent a cascading failure?',
    signals: [
      '定位依赖和资源耗尽路径',
      '设置端到端超时与取消传播',
      '限制并发及有条件重试',
      '提供降级并用故障注入验证',
    ],
    examples: [
      '检查线程、连接池和队列是否因下游等待被占满。',
      '从端到端预算分配各步骤超时，并向下游传播取消。',
      '限制在途请求，只有幂等且可恢复错误才退避重试，避免重试风暴。',
      '返回可解释的降级结果，用延迟和断连注入验证尾延迟及恢复速度。',
    ],
    mistake: '无限重试或扩大超时作为唯一措施',
  },
  {
    id: 'sys-observe',
    competency: 'system-design',
    title: '可观测性与发布',
    tags: ['monitoring', 'release', '监控'],
    prompt: '新服务上线后，如何判断运行正常并快速定位异常？',
    english: 'How would you establish service health and diagnose issues after a release?',
    signals: [
      '定义用户相关的成功和延迟指标',
      '关联日志、指标、追踪与版本',
      '设置可行动告警和回滚条件',
      '验证异常场景及恢复流程',
    ],
    examples: [
      '以关键操作成功率和 P95 延迟定义目标，不能只检查进程是否存活。',
      '用请求 ID 串联入口、队列和下游，并记录发布版本。',
      '根据错误预算和持续时间告警，指定负责人和回滚阈值。',
      '演练依赖不可用及数据库慢查询，确认告警、排障信息和回滚确实可用。',
    ],
    mistake: '只暴露健康检查就认为具备生产可观测性',
  },
  {
    id: 'project-ownership',
    competency: 'project-depth',
    title: '个人贡献',
    tags: ['ownership', '项目'],
    prompt: '介绍一个你参与的项目，说明你亲自负责的部分、关键决定和结果。',
    english: 'Describe a project, your personal responsibilities, key decisions and outcomes.',
    signals: [
      '区分个人职责与团队职责',
      '说明具体行动和实施细节',
      '解释备选方案与决策理由',
      '给出结果依据和归因边界',
    ],
    examples: [
      '在这个虚构的后台项目中，我负责查询页状态管理和接口适配，同事负责服务端索引。',
      '我整理请求状态机，加入取消和请求序号，编写乱序响应测试并接入错误监控。',
      '比较仅防抖和版本校验后采用后者，因为防抖不能阻止已发请求乱序返回。',
      '回归用例不再出现旧结果覆盖；线上错误下降还可能受服务端修改影响，不能全归因于我。',
    ],
    mistake: '把团队成果全部归为本人且无法说明具体行动',
  },
  {
    id: 'project-tradeoff',
    competency: 'project-depth',
    title: '技术取舍',
    tags: ['tradeoff', 'decision', '取舍'],
    prompt: '介绍一次技术选型或方案取舍，为什么没有采用另一种方案？',
    english: 'Describe a technical decision and explain why you rejected an alternative.',
    signals: [
      '明确业务目标和约束',
      '比较至少两个可行方案',
      '提供验证依据和决策过程',
      '说明代价及后续修正条件',
    ],
    examples: [
      '虚构项目要求两周内上线内部检索，数据规模有限且权限复杂。',
      '我比较专用搜索服务与现有数据库全文检索，前者能力强但增加运维成本。',
      '用代表性查询测召回和延迟，现有数据库满足首阶段目标，因此采用它。',
      '接受排序能力有限的代价，保留查询抽象；当规模或质量越过阈值时再迁移。',
    ],
    mistake: '只因技术流行或熟悉而忽略业务约束',
  },
  {
    id: 'project-impact',
    competency: 'project-depth',
    title: '效果与归因',
    tags: ['metrics', 'impact', '指标'],
    prompt: '你如何证明某项改进有效，而不是测量误差或其他改动造成的？',
    english:
      'How would you show that an improvement worked rather than reflecting noise or other changes?',
    signals: [
      '定义基线与成功指标',
      '控制测量条件或比较分组',
      '分析波动、样本和其他影响因素',
      '说明结果限制与持续观察',
    ],
    examples: [
      '虚构实验把首屏 P75 LCP 和错误率作为指标，先记录稳定的上线前基线。',
      '保持设备网络条件一致，线上采用可比的灰度分组，避免混入其他发布。',
      '检查样本量和分布，同时区分缓存、流量结构及服务端改动的影响。',
      '说明这只支持当前人群和时间窗口，持续观察而不把短期改善宣传为普遍因果。',
    ],
    mistake: '用一次本机测试得出普遍效果结论',
  },
  {
    id: 'project-incident',
    competency: 'project-depth',
    title: '故障复盘',
    tags: ['incident', '复盘'],
    prompt: '介绍一次线上故障处理，说明止损、定位和后续改进。',
    english: 'Describe an incident, including mitigation, diagnosis and follow-up improvements.',
    signals: [
      '说明影响与个人承担的动作',
      '先控制影响并保留排障证据',
      '建立根因链条而非只描述现象',
      '制定可验证的修复与预防措施',
    ],
    examples: [
      '虚构发布中部分页面白屏，我负责前端止损和排查，同事处理流量切换。',
      '暂停扩量并回滚入口，保存版本、错误堆栈和失败资源路径。',
      '定位为部署删除旧 chunk，未刷新的页面仍请求旧资源，健康检查未覆盖跨版本访问。',
      '保留旧资源并增加跨版本端到端测试，用灰度错误率和演练验证措施。',
    ],
    mistake: '复盘只写加强测试而无可执行措施',
  },
  {
    id: 'project-collaboration',
    competency: 'project-depth',
    title: '跨团队协作',
    tags: ['collaboration', '沟通'],
    prompt: '需求或接口存在分歧时，你如何推动协作并保证交付？',
    english:
      'How did you resolve a requirement or API disagreement while keeping delivery on track?',
    signals: [
      '明确分歧及各方约束',
      '说明本人沟通和澄清动作',
      '用可验证方案达成决策',
      '记录结果与后续协作改进',
    ],
    examples: [
      '虚构项目中前端需要分页筛选，后端担心复杂查询影响上线时间。',
      '我整理用户场景、查询样例和最小必需字段，与后端逐项澄清约束。',
      '一起比较全量下发与服务端分页，用数据量和压测结果选择有限筛选的分页方案。',
      '形成接口契约和验收用例，按约交付后补充变更通知流程，避免口头约定失效。',
    ],
    mistake: '只归咎其他团队而没有本人推进动作',
  },
  {
    id: 'project-learning',
    competency: 'project-depth',
    title: '失败与改进',
    tags: ['learning', 'failure', '成长'],
    prompt: '介绍一次效果不及预期的技术尝试，你如何调整并验证改进？',
    english:
      'Describe a technical attempt that underperformed, how you adjusted it and validated the change.',
    signals: [
      '明确原始假设及失败表现',
      '承认本人决策与信息不足',
      '根据证据调整方案',
      '验证改进并沉淀可复用经验',
    ],
    examples: [
      '虚构项目原假设预加载所有页面能改善导航，但低带宽用户首屏反而更慢。',
      '我提出了预加载方案，却没有检查关键请求被争抢带宽的情况。',
      '从瀑布图确认后改为按访问概率和空闲时机预取，并支持关闭。',
      '按网络分组验证首屏与跳转表现，把资源优先级检查加入后续发布清单。',
    ],
    mistake: '只包装成功结果而不说明假设如何被证伪',
  },
];

export const difficultyConstraints: Record<Difficulty, { zh: string; en: string }> = {
  l1: {
    zh: '先解释核心机制，并给出一个具体例子和验证方法。',
    en: 'Explain the core mechanism with a concrete example and a verification method.',
  },
  l2: {
    zh: '同时考虑正确性与交付成本，说明替代方案和验证方式。',
    en: 'Consider correctness and delivery cost together; explain an alternative and how you would validate the decision.',
  },
  l3: {
    zh: '增加高并发或依赖故障的约束，说明失败路径、取舍和可验证的恢复方案。',
    en: 'Add high concurrency or dependency failures; explain failure paths, trade-offs and a verifiable recovery plan.',
  },
};
export const roundInstructions: Record<InterviewRound, { zh: string; en: string }> = {
  technical: { zh: '技术讨论：', en: 'Technical discussion: ' },
  screening: {
    zh: '请简洁回答，可说明你尚未实践的部分：',
    en: 'Answer concisely and distinguish what you have not practised: ',
  },
  behavioral: {
    zh: '请结合一次真实经历回答，说明个人行动；没有相关经历时请明确说明：',
    en: 'Use a real experience and explain your own actions; explicitly say if you have no such experience: ',
  },
  'system-design': {
    zh: '请从系统边界、约束和设计取舍展开：',
    en: 'Discuss system boundaries, constraints and design trade-offs: ',
  },
};

export function snapshotFor(topic: Topic, difficulty: Difficulty): RubricSnapshot {
  return {
    bankId: topic.id,
    questionVersion: `1.0:${difficulty}`,
    rubricVersion: 'rubric-v3',
    skillIds: [topic.id],
    constraints: [
      difficultyConstraints[difficulty].zh,
      '允许不同有效解法；经历必须来自用户本人，不能补造。',
    ],
    commonMistakes: [topic.mistake],
    followUpRules: [
      `回答出现“${topic.mistake}”相关误区时，用具体反例要求解释，不代写答案。`,
      `回答缺少“${topic.signals[3]}”时，要求补充实际验证步骤。`,
      '已经充分覆盖四项标准时不要求追加追问；应用仍限制每道主问题最多追问一次。',
    ],
    criteria: topic.signals.map((description, index) => ({
      id: `${topic.id}:${index + 1}`,
      description,
    })),
    anchors: [0, 1, 2, 3, 4].map((count) => ({
      score: count + 1,
      description: `${count} 项标准有充分且正确的回答证据；其余标记缺失、错误或不清楚。`,
    })),
  };
}

export const rubricSamples = topics.flatMap((topic, index) => [
  {
    id: `${topic.id}:strong`,
    bankId: topic.id,
    quality: 'strong' as const,
    answer: topic.examples.join(''),
    expectedRange: [4, 5] as const,
    split: index % 4 === 3 ? 'holdout' : 'development',
  },
  {
    id: `${topic.id}:medium`,
    bankId: topic.id,
    quality: 'medium' as const,
    answer: topic.examples.slice(0, 2).join(''),
    expectedRange: [2, 3] as const,
    split: index % 4 === 3 ? 'holdout' : 'development',
  },
  {
    id: `${topic.id}:weak`,
    bankId: topic.id,
    quality: 'weak' as const,
    answer: `关于${topic.title}，我暂时不知道具体机制，也无法解释方案或验证方法。`,
    expectedRange: [1, 2] as const,
    split: index % 4 === 3 ? 'holdout' : 'development',
  },
]);
