# Interview Assistant

面向 3-5 年经验前端与 AI 技术求职者的面试训练 Agent，采用 Vue + Electron + NestJS + Turborepo。

## 当前状态

当前提交是项目初始化骨架，已经包含：

- pnpm workspace + Turborepo
- Vue 3 + Electron + electron-vite 桌面端
- NestJS API 和 `/api/health` 健康检查
- BullMQ worker 占位入口
- `@interview-assistant/contracts` 共享 Zod 契约
- `@interview-assistant/agent-core` 四维评分权重和 120 题库蓝图
- ESLint flat config 与 Prettier
- PostgreSQL、Redis、MinIO 本地 Compose

依赖没有安装，仓库中也不会提交 `pnpm-lock.yaml`。这是刻意保留给项目维护者执行的步骤。

## 安装依赖

在仓库根目录执行：

```bash
pnpm install
```

## 本地开发

复制环境变量样例后按需修改：

```bash
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d
pnpm dev
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d
pnpm dev
```

API 健康检查：`http://localhost:3000/api/health`

桌面端开发窗口由 electron-vite 启动。生产模型 API Key 只能放在服务端 Secret 管理系统中，不能写入 `.env`、Electron 安装包或 renderer 代码。

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
- `/training`：训练配置占位页
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

## 目录结构

```text
apps/
  api/       NestJS HTTP API
  desktop/   Electron main/preload + Vue renderer
  worker/    BullMQ 异步任务入口
packages/
  agent-core/ 评分权重、题库配置和 Agent 领域逻辑
  contracts/  Zod schema、DTO 和跨端事件契约
infra/
  docker/    PostgreSQL、Redis、MinIO
docs/
  interview-assistant-agent-solution.md  产品与技术方案
```
