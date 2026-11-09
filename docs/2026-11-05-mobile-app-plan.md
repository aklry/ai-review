# AI 面试训练助手 · 个人移动端规划

2026-11-09 更新。面向本人使用，以独立完成完整训练的 Android 客户端为当前交付范围，后续按使用需要适配 iOS。本文描述当前实现和待完成的部署、构建与真机验收，不代表已经生成 APK 或完成真实语音识别验收。

## 我会怎样用它

只有手机在手边时，也可以上传简历、填写岗位和项目故事，完成岗位分析后直接开始训练。电脑上开始的训练可以在手机继续，手机的文字回答、评分、报告与专项练习也可由电脑读取。两端连接同一套 API 与数据库，沿用现有的 `local-user` 和历史记录。

首页提供新建训练、继续未完成训练和最近记录；记录页按状态筛选并分页。手机不再提供连接设置，API 地址由构建配置确定，连接错误显示重试入口。应用更新后不再读取旧的 `interview.mobile.api` 偏好；旧 `/settings` 链接重定向首页。

## 当前手机功能

| 使用场景 | 手机上要做到                                                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 准备资料 | 填写称呼，上传文本型 PDF/DOCX 简历（10 MB 上限）并查看上传进度和解析结果，或手动粘贴简历文本；解析失败可切换文本输入。                                                                                                     |
| 准备岗位 | 填写岗位、公司、JD，补充项目名称、STAR 字段和量化结果，发起岗位分析并查看能力要求、证据差距、建议和可能问题。保存分析任务 ID，重新打开页面时从服务端恢复，失败可重试。                                                     |
| 开新场   | 选择中文、英文或中英混合；初筛、技术面、系统设计或行为面；L1–L3 难度；4 题短场或 8 题标准场；逐题辅导或完整模拟；不限时或 15/30/45/60 分钟。                                                                               |
| 回答一题 | 一屏一题，展示主问题进度、追问、训练模式与剩余时间。支持文字和录音转写，最多 20,000 字；逐题辅导展示完整反馈，完整模拟遵循服务端延迟反馈规则。                                                                             |
| 控制训练 | 暂停、继续、跳过、提前结束并生成报告，结束条件由服务端判断。录音和转写期间禁用推进题目的操作。每次操作后读取服务端权威状态，响应丢失时先同步再重试。                                                                       |
| 中途离开 | 按 API、会话和题目保存本机草稿。重开时先查服务端进度，只恢复对应题目的草稿；另一设备推进后不把旧草稿填入新题。                                                                                                             |
| 回头看   | 历史支持全部、进行中、待生成报告、已完成筛选及分页。复盘展示综合分、四维分、未测评状态、优势与差距、七天计划，以及主问题关联的追问、原回答、逐项评分、原文证据、参考答案与待补充事实。支持记录参考答案查看和提交评分异议。 |
| 补弱项   | 已完成训练从薄弱评分项进入专项练习，完成原题重答、案例练习、变式复测并比较三轮评分；练习也支持录音转写。                                                                                                                   |

手机保留已有训练和复盘链接的兼容跳转。共享调用位于 `packages/api-client`，两端复用 `packages/contracts`、现有服务端评分逻辑及训练状态机；桌面原有 Windows 本机转写保持独立。

## 录音、转写与本机回听

手机使用 WebView 的 `getUserMedia` 和 `MediaRecorder` 录音，由 Capacitor 的 Android 权限流程申请麦克风。Android 清单声明 `RECORD_AUDIO` 和 `MODIFY_AUDIO_SETTINGS`，不增加存储权限或后台录音服务。每段最长三分钟，停止后保存取得的音频；切后台也会停止录音。权限被拒绝时仍可用文字答题。

录音保存在本机 IndexedDB，按 API、会话和题目隔离，专项练习按任务和阶段隔离。用户可以回听、重录、删除；新录音保存成功后才替换旧录音。保存失败时保留当前页面的回听能力并提示失败，网络失败不删除已有录音。卸载应用或清除应用数据会丢失本机录音。

点击“转为文字”才发送当前选中的录音。手机先将音频转换为 16 kHz、单声道、16-bit PCM WAV，再上传到服务端；转写结果加入已有草稿，保留手写内容。用户检查、校正后，必须主动点击提交才触发评分。原音仅在录制手机回听，服务端只为本次识别临时处理音频，不保存到业务库或对象存储，也不做跨设备同步。

## 固定 API 地址与服务端配置

开发期默认使用 `/api`，由 Vite 代理到本机 3000 端口。生产构建读取 `VITE_API_BASE_URL`，未配置时沿用 `http://175.178.92.165:3100/api`。切换服务器需要重新构建前端、同步 Capacitor 并重新打包，手机内没有保存或覆盖地址的入口。旧默认地址对应的草稿继续兼容读取。

API、PostgreSQL 和简历文件存储独立部署，电脑关机时手机仍可连接服务器训练。Capacitor 安装版的默认页面来源为 `https://localhost`，API 需配置 `MOBILE_ORIGIN=https://localhost` 并重启；若修改了 hostname 或 scheme，则填写实际 Origin。开发浏览器需允许实际开发页面的 Origin。数据库、对象存储与模型密钥仅由服务端持有，当前 `local-user` 语义仍不提供登录或用户隔离。

服务端语音识别使用独立配置，不预设提供方、不复用 DeepSeek 密钥：

```properties
ASR_BASE_URL=https://asr.example.com/v1
ASR_MODEL=provider-supported-model
ASR_API_KEY=
ASR_TIMEOUT_MS=120000
```

`ASR_BASE_URL` 是兼容 `/audio/transcriptions` 的 API 根地址，保留提供方要求的 `/v1` 等路径；地址和 `ASR_MODEL` 必填。自建免密服务可留空 `ASR_API_KEY`。超时默认 120 秒，上限 180 秒。所有 ASR 配置留在服务端，密钥不得写入 APK 或 `VITE_*` 变量。缺少地址或模型时返回“语音转写服务未配置”，文字训练与本机回听继续可用。

`POST /api/speech/transcriptions` 使用 multipart：`file` 为 WAV，`language` 为 `zh-CN`、`en-US` 或 `mixed`，返回共享响应信封中的 `{ text: string }`。服务端限制文件不超过 6 MB，校验 WAV 容器、16 kHz 单声道 16-bit PCM、数据长度及 180 秒时长上限；上游失败、空文本、超时和配置错误返回可读信息，不回传密钥或上游原始响应，也不记录音频与识别正文。

## 本地运行与 Android 构建

沿用 Vue 3、TypeScript、Ionic Vue、Pinia、Axios、Vite 和 Capacitor 8。手机端需要 Node.js 22+；依赖由项目维护者在仓库根目录执行 `pnpm install`，不由自动化流程代为安装。构建 APK 还需 JDK 21、Android SDK 及已有原生工程要求的 Gradle 依赖。详见 [Android 构建指南](./android-build-guide.md)与 [Capacitor 环境要求](https://capacitorjs.com/docs/getting-started/environment-setup)。

维护者安装依赖并启动已配置的 API 后，在仓库根目录运行：

```powershell
pnpm -F @interview-assistant/contracts build
pnpm -F @interview-assistant/mobile dev
```

浏览器打开 `http://localhost:5174`。生产构建可按实际环境指定地址：

```powershell
$env:VITE_API_BASE_URL = 'https://api.example.com/api'
pnpm -F @interview-assistant/mobile build
pnpm -F @interview-assistant/mobile android:sync
pnpm -F @interview-assistant/mobile android:open
```

示例地址需替换为真实地址；使用默认服务器时可不设置该变量。当前工作区已有 `apps/mobile/android`，保留现有工程配置，不重复执行 `android:add`。每次修改页面后先 build 再 sync，再运行 Gradle 或 Android Studio 构建。

如需通过 USB 调试开发页面，先运行 Vite，再执行下列命令；正式打包前确认没有遗留开发用 `server.url`：

```powershell
pnpm -F @interview-assistant/mobile exec cap run android --live-reload --host localhost --port 5174 --forwardPorts 5174:5174
```

## 验收范围

当前功能以已确认的 [Android 功能对齐设计](./superpowers/specs/2026-11-08-android-feature-parity-design.md) 为准。相关命令的实际结果记录在实施记录中；本文不把前端构建或模拟识别服务测试视为 APK、真机或真实 ASR 已通过。

- 在手机视口完整走通资料上传或粘贴、STAR 故事、岗位分析恢复、所有训练选项、答题与控制、报告、历史筛选和三轮专项练习。
- 验证逐题辅导与完整模拟的反馈时机、未测评分数、追问归属，以及响应丢失后同步、草稿隔离和重复提交保护。
- 在 Android 真机验证麦克风允许和拒绝、三分钟停止、回听/删除、录音保存失败、切后台、锁屏、返回键和重新打开后的恢复；确认切题和迟到转写不会修改其他题。
- 在服务端配置有效 ASR 后，用真机录中文或英文，先回听再转写、校正并主动提交；桌面刷新应看到同一份文字回答与报告，其他设备没有原音回听入口。
- 完成 Debug APK 构建与安装后，再记录产物路径和环境结果。正式分发另行验证签名、更新安装和版本号，不以给出命令或完成环境准备替代验收。
