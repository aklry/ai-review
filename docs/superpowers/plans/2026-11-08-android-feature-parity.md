# Android Feature Parity Implementation Plan

> **For agentic workers:** Execute the independent backend, shared-client and recording tasks using superpowers:dispatching-parallel-agents, then integrate and review. Use test-driven-development and verification-before-completion.

**Goal:** 手机独立完成电脑端面试训练全流程，支持本地录音、服务端转写和回听，移除连接设置。

**Architecture:** 独立触屏 UI，共享 API 契约与业务后端。服务端临时转写统一 WAV，原音仅存手机 IndexedDB。保留现有权威进度同步与题目级草稿。

**Tech Stack:** Vue 3、Pinia、Ionic、Capacitor 8、NestJS、Node fetch/FormData、Vitest；无新增依赖。

**Spec:** `docs/superpowers/specs/2026-11-08-android-feature-parity-design.md`

## Global Constraints

- 依赖由用户安装，不运行任何安装命令。
- 保留工作区已有未跟踪的 Android 工程、文档和 output 文件。
- 默认生产 API 为 `http://175.178.92.165:3100/api`；构建配置 `VITE_API_BASE_URL` 可覆盖；开发使用 `/api`。
- 录音最长三分钟；16 kHz 单声道 16-bit PCM WAV；服务端最多 6 MB；转写超时默认 120 秒。
- 使用 `ASR_BASE_URL`、`ASR_API_KEY`、`ASR_MODEL`、`ASR_TIMEOUT_MS`，密钥仅在服务端。
- 转写追加到可编辑草稿，不自动提交；原音不跨设备同步。
- 不改变现有评分算法和训练状态机，完整模拟的延迟反馈服从服务端。

### Task 1: Server transcription

**Files:** 新建 `apps/api/src/speech/{speech.module,speech.controller,speech.service,wav}.ts` 和相关测试；修改 AppModule 和 `.env.example`。

**Interface:** `POST /speech/transcriptions` multipart `file`, `language` → `{ text: string }`；Nest 统一信封包裹。`SpeechService.transcribe(file, language)` 验证 WAV 后调用配置的 `/audio/transcriptions`。

- [x] 先写真实 WAV fixture 与服务测试：`await expect(service.transcribe(badFile, 'zh-CN')).rejects.toThrow()`；本地模拟上游检查 multipart 和语言。
- [x] 运行 `pnpm -F @interview-assistant/api exec vitest run src/speech`，确认新能力缺失而失败。
- [x] 实现容器/时长校验、限量上传、配置验证、受限超时和可读错误；不记录原音和正文。
- [x] 跑测试、类型检查和 lint；审查输出。

### Task 2: Shared workflow API

**Files:** `packages/api-client/src/workflows.ts`、导出、测试；`apps/desktop/src/renderer/src/api/interview.ts`；共享 contracts 的语音响应 schema。

**Interface:** `createWorkflowApi(request)` 返回 `createProfile`, `uploadResume`, `analyzeJob`, `getJob`, `createStory`, `createInterviewSession`, `startPractice`, `submitPracticeAnswer`, `markReferenceViewed`, `submitScoreDispute`, `transcribeAudio`。后者签名 `(file: Blob, language: InterviewLanguage): Promise<{text:string}>`；练习签名 `(questionId, criterionId)`、`(taskId, stage, answerText)`。

- [x] 新建测试，以 AxiosRequestConfig 边界验证实际编码路径、multipart、语言及解析返回。
- [x] 运行 `pnpm exec vitest run packages/api-client/src/workflows.spec.ts`，观察缺失实现的失败。
- [x] 提取现有桌面调用，新增练习和转写调用，使用已有 schema 校验。
- [x] 验证共享客户端、contracts 和桌面 API 测试及类型检查。

### Task 3: Mobile recording

**Files:** `apps/mobile/src/lib/recordings.ts`、`apps/mobile/src/components/VoiceAnswer.vue`、测试；AndroidManifest 权限。

**Interface:** 组件 props `clipKey: string`, `language?: string`, `readonly?: boolean`, `disabled?: boolean`；emit `transcript(text: string)`, `busy(value: boolean)`。使用固定配置的 `api.transcribeAudio`。导出录音读取/保存、WAV 转换 helpers。

- [x] 先写音频样本转 WAV 的字节/时长测试，以及录音控制器的权限失败、停止、后台中断、过期回调测试。
- [x] 运行新增测试并确认缺失行为失败。
- [x] 实现录音、时长限制、持久保存、回听/删除、按键转写及清理；不在收到转写时自动提交。
- [x] 添加麦克风权限，运行测试和移动端类型检查。

### Task 4: Mobile full workflow

**Files:** `connection.ts`、`main.ts`、`session.ts`、`preparation.ts`、`practice.ts`、对应 views/components/styles 与测试；删除 ConnectionSettings。

**Interfaces:** 准备 store 调用 Task 2；面试 store 扩充 `control('skip'|'pause'|'resume')` 并允许按后端规则提前 finish。录音 key 使用 `JSON.stringify([address, 'session', sessionId, questionId])`，练习使用 taskId/stage。

- [x] 先扩展 session 测试：暂停/跳过携带当前版本；提前结束可从 active 调用；旧会话迟到 mutation 不影响新会话。
- [x] 写准备 store 测试：上传失败、分析恢复、重试、创建参数、迟到响应隔离；practice 覆盖三阶段和响应丢失恢复。
- [x] 运行测试观察失败，再实现 stores 和页面。
- [x] 首页增加新建/最近历史和筛选；准备页实现简历/STAR/JD/分析/训练选项；面试页接入控制和录音；复盘页展示完整报告/反馈并接入专项练习。
- [x] 移除设置入口与旧地址偏好，保留已发布训练/复盘路径；录音和请求时禁用冲突操作。
- [x] 运行移动端全部测试、类型检查、lint、构建。

### Task 5: Integration and review

**Files:** README、移动端规划、Android 构建说明、实施记录。

- [x] 更新固定 API、服务端 ASR 配置与原音仅本机的说明。
- [x] 整合独立任务，审查差异；运行 `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`，区分既有失败。
- [x] 执行 mobile build 与 android:sync；尝试离线 assembleDebug 并记录缺少的 Gradle 缓存，依赖仍由用户准备。
- [x] 手机视口验证完整训练和专项练习；录音生命周期、保存与转写使用模拟麦克风单元测试验证，真实 ASR、Android 权限与锁屏尚未验收。
- [x] 请求独立代码审查并修复实际问题，最终报告完成项、验证与部署所需配置。

## Progress

- 已批准设计；既有 mobile typecheck 和 4 tests 通过。
- 已审查接口关系：Task 1 与 Task 2 通过 HTTP `{text}` 契约衔接；Task 3 使用 Task 2 的 `transcribeAudio`；Task 4 消费 Task 2/3；Task 5 集成。独立任务文件所有权不重叠。
- 当前 checkout 有未跟踪安卓工程，原地新建功能分支保留它；不额外创建缺少这些文件和依赖的 worktree。

- 2026-11-09：实现、独立审查、全仓检查与手机宽度本地联调完成。APK 离线构建因缺少 AGP/Google Services 缓存失败；未安装依赖。实际结果与由用户执行的准备命令见 [验收记录](2026-11-09-android-feature-parity-verification.md)。
