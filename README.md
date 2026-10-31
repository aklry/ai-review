# Interview Assistant

面向 3-5 年经验前端与 AI 技术求职者的面试训练 Agent，采用 Vue + Electron + NestJS + Turborepo。

## 当前状态

当前已实现简历上传、岗位分析、文字模拟面试和训练报告，流程已拆分为五个独立 Agent：

- pnpm workspace + Turborepo
- Vue 3 + Electron + electron-vite 桌面端
- NestJS API、统一响应信封和 `/api/health` 健康检查
- LangChainJS typed Runnable + LangGraph：ProfileAgent → JobAgent，InterviewerAgent 出题/有限追问，CoachAgent 反馈，ReportAgent 生成总结与七天计划
- ChatDeepSeek 模型接入、主备降级、共享超时预算及逐步骤 token 用量记录
- PostgreSQL checkpoint、岗位分析任务租约/启动恢复、事务会话推进及重复回答幂等
- 桌面端轮询恢复、刷新恢复和未测评分数展示
- BullMQ worker 占位入口
- `@interview-assistant/contracts` 共享 Zod 契约
- `@interview-assistant/agent-core` Agent 实现、图编排、证据校验、四维评分及 120 题库蓝图
- ESLint flat config 与 Prettier
- PostgreSQL、Redis、MinIO 本地 Compose

依赖需要由项目维护者执行 `pnpm install` 安装；MinIO、PostgreSQL 和 Redis 通过本地 Compose 启动。

## 安装依赖

在仓库根目录执行：

```bash
pnpm install
```

## 本地开发

复制环境变量样例后按需修改：

```bash
cp .env.example apps/api/.env
docker compose -f infra/docker/docker-compose.yml up -d
pnpm dev
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example apps/api/.env
pnpm install
docker compose -f infra/docker/docker-compose.yml up -d
pnpm -F @interview-assistant/api prisma:generate
pnpm -F @interview-assistant/api exec prisma migrate deploy
pnpm dev
```

API 健康检查：`http://localhost:3000/api/health`

所有平台首次启动 API 前均需生成 Prisma client 并执行 `prisma migrate deploy`。已有数据库使用增量迁移；不要执行 `prisma:reset`。`20261026000000_agent_workflows` 添加题目父子关联、活动题游标、状态版本、租约、回答结果缓存和报告版本，并修复旧会话的恢复游标。

API 初始化时执行 PostgreSQL checkpointer 的 `setup()`；数据库角色需拥有 checkpoint schema 的建表权限。`AGENT_CHECKPOINT_SCHEMA` 默认 `public`，也可指定专用 schema。Checkpoint 包含面试执行上下文，应采用与简历数据相同的访问控制、备份和保留策略。默认不启用外部 tracing。

岗位分析由 API 在启动后及每 5 秒扫描持久化任务，每次最多取 5 条；数据库租约防止多实例重复领取。租约有效期 5 分钟、每 30 秒续租、中断恢复最多 3 次。正常模型失败会标记失败，用户重试时复用已完成 checkpoint。关停时先等待在途分析结束，再关闭数据库连接。`apps/worker` 仍为占位，本流程不依赖 Redis/BullMQ 消费者。

每个主问题最多追问一次，追问不增加主问题索引，也不作为额外题目加入评分平均。追问反馈以 `supplementalCues` 传给报告，作为文字分析的补充证据。最后一题结束进入 `awaiting_finish`，生成报告后为 `completed`。未测评维度和未完整覆盖四维时的总分均为 `null`；新报告标记 `evidence-v2`，历史报告保留 `legacy-v1`，不会自动重算。

桌面端开发窗口由 electron-vite 启动。API 服务读取 `apps/api/.env`。生产模型 API Key 只能放在服务端 Secret 管理系统中，不能写入 Electron 安装包或 renderer 代码。

## 简历文件上传

训练页的候选人档案默认使用文件上传：

- 支持文本型 PDF 和 DOCX，单个文件默认最大 10 MB。
- 原始文件保存到私有 MinIO bucket `interview-resumes`。
- PostgreSQL 只保存文件元数据、解析状态和解析后的 `resumeText`。
- 旧版 `.doc`、扫描 PDF 暂不直接解析；请另存为 DOCX 或文本型 PDF。
- API 路由为 `POST /api/profiles/resume`，使用 `multipart/form-data` 的 `file` 字段。
- 解析失败时，桌面端可以切换到手动粘贴文本的兼容入口。

MinIO 配置优先使用 `MINIO_*` 环境变量；现有 `S3_ENDPOINT`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_BUCKET` 仍可作为兼容配置。

## API 约定

所有 API 都返回统一信封：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "requestId": "request-id",
  "timestamp": "2026-08-25T00:00:00.000Z"
}
```

成功使用 `code: 0`；异常使用对应 HTTP 状态码作为 `code`，`data` 固定为 `null`。服务端通过 `x-request-id` 透传请求关联 ID，并由全局异常过滤器隐藏未知异常细节。桌面端 Axios 请求拦截器自动注入请求 ID，响应拦截器校验信封、解包 `data`，并将错误转换为 `ApiClientError`。

桌面端已初始化 Element Plus、Pinia 和 Hash Router：

- `/`：工作台与 API 状态
- `/training`：简历档案、岗位分析、模拟问答和训练报告
- `/history`：按状态筛选、分页浏览历史训练；进度只统计主问题
- `/history/:sessionId`：逐题查看原始回答、全部反馈与证据、关联追问及训练报告；未结束的会话可继续训练
- `src/renderer/src/stores/system.ts`：API 健康状态
- `src/renderer/src/lib/http.ts`：Axios 实例、请求/响应拦截器

## 质量检查

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

PostgreSQL 集成测试为显式开启，连接账号需要创建/删除 schema 权限：

```powershell
$env:AGENT_INTEGRATION_DATABASE_URL = 'postgresql://user:password@localhost:5432/database'
pnpm -F @interview-assistant/api exec vitest run src/agents/workflow-postgres.integration.spec.ts
```

测试仅创建随机 `agent_test_*` schema，在其中验证全部迁移、旧会话恢复、跨连接 checkpoint 恢复、并发租约和事务回滚，以及原生 ChatDeepSeek SDK → Agent 工作流 → 服务 → 数据库的完整问答、追问、幂等重试和报告流程，结束后删除该测试 schema。未设置变量时这些用例明确跳过。模型测试使用可注入 transport 和确定性输出，不会调用真实 DeepSeek；真实模型效果、MinIO、Redis、语音/OCR、鉴权与用户隔离需单独验收。

## 历史训练与复盘

- `GET /api/interview-sessions?page=1&pageSize=10&status=completed`：按开始时间和 ID 倒序分页，`pageSize` 最大 50，`status` 可省略或为 `active`、`awaiting_finish`、`completed`。列表只返回岗位、时间、进度和报告分数等元数据。
- `GET /api/interview-sessions/:id/review`：只读复盘数据，包括主问题、与主问题关联的追问、回答、全部评分证据和报告，不返回简历正文、JD、内部租约或请求 hash。
- 历史浏览不替换正在进行的训练；只有点击“继续这场训练”才通过 `/training?sessionId=...` 切换。明确指定的记录不存在时显示错误，不会自动打开另一场面试。
- 两个新接口按当前 MVP 的 `local-user` 过滤。这不是登录或生产级用户隔离；对外开放前仍需接入可信用户身份。

## 真实模型验收

在服务端配置 `DEEPSEEK_API_KEY` 后，在仓库根目录执行：

```bash
pnpm -F @interview-assistant/api eval:live
```

该命令读取 `apps/api/.env`（环境变量优先），顺序执行 7 个探针、8 次逻辑模型调用；每次调用仍可能触发现有的一次修复或备用模型降级，会产生真实模型费用。普通 `pnpm test` 会明确跳过真实模型测试。

样例均为虚构数据，覆盖中文事实提取/岗位分析、四维核心出题、中英文好坏回答区分，以及只测一个维度时的提前结束报告。验收不连接业务数据库，也不写入训练记录。结果保存在被 Git 忽略的 `.cache/evals/*.json`，包含逐项结果、自动检查、输出、耗时、模型、降级状态及 provider 返回的 token 用量。失败也会落盘；依赖失败的探针标记为 skipped，不冒充通过。

自动检查验证结构、引用证据和粗粒度评分区分，不能替代对提问相关性、反馈准确性、语言和计划可执行性的人工复核。单轮小样本不代表稳定的 P95 或总体效果；返回的 token 用量也不是完整计费审计。

## 目录结构

```text
apps/
  api/       NestJS HTTP API
  desktop/   Electron main/preload + Vue renderer
  worker/    BullMQ 占位入口（当前岗位分析由 API 持久恢复调度）
packages/
  agent-core/ 五个 Agent、LangGraph 工作流、证据校验、评分及题库配置
  contracts/  Zod schema、DTO 和跨端事件契约
infra/
  docker/    PostgreSQL、Redis、MinIO
docs/
  interview-assistant-agent-solution.md  产品与技术方案
  superpowers/specs/2026-09-02-resume-document-upload-design.md  简历文件上传设计
```
