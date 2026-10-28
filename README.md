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
