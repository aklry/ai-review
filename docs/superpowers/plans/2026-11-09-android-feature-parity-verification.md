# 安卓功能对齐验收记录

日期：2026-11-09。实现位于 `codex/android-feature-parity`，尚未部署。没有安装 npm/Gradle/Maven 依赖，也没有调用真实模型或识别服务。

## 本次实现

- 手机独立准备资料：PDF/DOCX 上传或文本、岗位/JD/公司、STAR 故事、岗位分析轮询及恢复，选择语言、轮次、难度、题数、反馈方式和时间。
- 面试控制、按题草稿、逐题反馈、提前结束、完整复盘、评分异议、参考答案查看记录、三阶段专项练习与评分项比较。
- 手机录音、三分钟自动停止、后台/卸载停止保存、本机回听/删除、手动服务端转写、校正后主动提交；原音仅存当前设备。
- 移除手机连接设置；固定构建 API 地址，忽略旧地址偏好，保留旧路由跳转。
- 共享工作流 API 与语音响应契约；服务端新增受限 WAV 转写入口和可配置识别服务。

## 已执行的验证

| 验证                                | 结果                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                 | 通过；忽略 Android 生成的构建目录，未格式化其产物                                                                                       |
| `pnpm lint`                         | 全仓 7 个任务通过                                                                                                                       |
| `pnpm typecheck`                    | 全仓 7 个任务通过                                                                                                                       |
| `pnpm test`                         | 全仓 6 个任务通过；API 中 4 个 PostgreSQL 集成与 2 个真实模型用例按环境配置跳过                                                         |
| `pnpm -F mobile test`（审查修正后） | 6 个文件、39 项通过                                                                                                                     |
| 独立后端/共享客户端审查测试         | 4 个文件、59 项通过；另有桌面 HTTP 4 项通过                                                                                             |
| `pnpm build`                        | 全仓 6 个构建任务通过；移动端有资源包体积提示                                                                                           |
| `pnpm -F mobile android:sync`       | 通过，静态资源和原生配置已同步                                                                                                          |
| 手机宽度浏览器联调                  | 本地合成 API，390×844；建场、分析、四题/30 分钟选项、暂停恢复草稿、回答/评分/下一题、提前结束与报告、三阶段练习、完成记录筛选与分页通过 |

录音测试覆盖权限拒绝、迟到权限、停止与最终音频刷新、卸载清理、时长限制、存储失败、迟到转写、删除后旧片段不复现及音频编码。会话与练习测试覆盖响应丢失、同步失败、重复点击、同目标在途提交重开、旧目标响应隔离、超长转写校正和草稿隔离。岗位准备测试覆盖恢复断网、存储不可用、故事重试和表单重置。

独立代码审查发现的同目标重开竞态、nullable 反馈解析、练习原音键、超长回答和复测状态文案均已修正。

## APK 构建阻碍与后续验收

使用本机 JDK 21、`D:\Android`（Android 36、Build Tools 35.0.0）及已有本地 Gradle ZIP，执行 `gradlew.bat --offline assembleDebug`。离线构建在依赖解析处失败：缓存缺少 `com.android.tools.build:gradle:8.13.0` 与 `com.google.gms:google-services:4.4.4`。没有联网下载。工作区原有的 `app-debug.apk` 不是本次构建产物。

依赖由用户准备。用户可在仓库根目录执行以下命令，让 Gradle 下载工程所需依赖并打包：

```powershell
$env:JAVA_HOME = 'D:\Program Files\Java\jdk-21.0.12.1'
$env:ANDROID_HOME = 'D:\Android'
Push-Location apps/mobile/android
.\gradlew.bat assembleDebug
Pop-Location
```

新包路径应为 `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`，以本次成功构建和新时间戳为准。

真实 ASR 需要部署新增 API，配置服务端的 `ASR_BASE_URL`、`ASR_MODEL`，按提供方需要填写 `ASR_API_KEY`；`ASR_TIMEOUT_MS` 默认 120000，上限 180000。安装版来源配置为 `MOBILE_ORIGIN=https://localhost`。

尚未验证 Android 真机权限、麦克风硬件、原音回听、锁屏/杀进程恢复、真实转写效果和桌面跨设备刷新。浏览器及模拟麦克风测试不能替代这些结果。完成依赖准备和服务配置后，按 [Android 构建指南](../../android-build-guide.md) 执行真机验收。
