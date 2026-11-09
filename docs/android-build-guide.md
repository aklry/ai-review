# Android 打包流程说明

适用项目：Interview Assistant 移动端

文档更新日期：2026 年 11 月 9 日

Android 打包的核心，是把代码、资源和应用配置编译成可分发的文件，并完成签名和安装验证。本项目使用 Vue、Ionic 和 Capacitor，需要先构建前端页面，再同步到 Android 工程，最后由 Gradle 生成 APK 或 AAB。

本文给出构建和验收步骤，不代表本轮已经生成 APK、完成 Android 真机测试或接通真实语音识别服务；这些结果需要单独记录。

## 1 打包全流程

```text
前端源码 → Vite 构建 → dist 静态资源
                         ↓ Capacitor 同步
Android 工程 → Gradle 编译与资源处理 → 打包与签名
                         ↓
                APK 安装测试 / AAB 上传商店
```

Capacitor 将 HTML、CSS、JavaScript 放入 Android 应用，通过 WebView 运行，并提供调用原生能力的桥接。它不会把 Vue 页面转换成 Java 或 Kotlin。API、数据库和模型服务独立部署，不会随 APK 一起启动。

### Android 构建内部做了什么

| 环节         | 主要工作                                                              | 主要产物           |
| ------------ | --------------------------------------------------------------------- | ------------------ |
| 解析构建配置 | Gradle 和 Android Gradle Plugin 读取模块、依赖和构建变体              | 构建任务及依赖图   |
| 合并应用清单 | 合并应用、依赖库及变体的 AndroidManifest                              | 最终清单           |
| 处理资源     | AAPT2 编译与链接原生资源，生成资源索引                                | 编译资源和资源标识 |
| 编译代码     | Java 或 Kotlin 编译为字节码，再由 D8 转为 DEX；启用压缩时使用 R8 优化 | classes.dex 等     |
| 组装产物     | 合并 DEX、资源、assets、原生库和清单                                  | APK 或 AAB         |
| 签名与验证   | APK 完成对齐和签名；AAB 按发布流程签名                                | 可验证的分发文件   |

这些任务存在依赖关系，部分可以并行执行。通常由 Gradle 自动编排，无需逐个运行底层工具。手工处理 APK 时，应先执行 zipalign，再用 apksigner 签名，签名后不能再修改 APK 内容。

### APK 与 AAB 的区别

| 文件 | 用途                                       | 能否直接安装                |
| ---- | ------------------------------------------ | --------------------------- |
| APK  | 真机调试、自用分发、支持 APK 的应用市场    | 可以                        |
| AAB  | 上传 Google Play，由平台生成设备需要的 APK | 不能直接用 adb install 安装 |

AAB 本地测试可以使用 bundletool 生成 APK 集，再安装到设备。自用或给测试人员安装，通常先选择 APK。

<!-- pagebreak -->

## 2 本项目的构建配置

| 项目           | 当前配置                                        |
| -------------- | ----------------------------------------------- |
| 移动端目录     | apps/mobile                                     |
| 技术栈         | Vue 3、TypeScript、Ionic Vue、Vite、Capacitor 8 |
| 前端输出目录   | apps/mobile/dist                                |
| Android 工程   | apps/mobile/android，当前工作区已经存在         |
| 应用标识       | dev.interviewassistant.mobile                   |
| 应用名称       | 面试训练                                        |
| Android 版本号 | versionCode 为 1，versionName 为 1.0            |
| SDK 配置       | minSdk 24，compileSdk 36，targetSdk 36          |
| 构建工具       | Android Gradle Plugin 8.13.0，Gradle 8.14.3     |
| Java 编译配置  | Java 21                                         |
| Release 配置   | minifyEnabled 为 false，未配置 Release 签名     |

移动端 package.json 的版本是 0.1.0，与 Android 的 versionName 并不自动同步。Android 升级和应用商店发布，应修改 app/build.gradle 中的 versionCode 和 versionName。

### 环境准备

- 使用 Node.js 22 或以上版本；仓库指定 pnpm 10.34.5。
- 准备 Android SDK Platform 36、Platform Tools 和所需 Build Tools。可使用 Android Studio 管理，也可仅安装命令行工具；无 Android Studio 的配置步骤见第 6 节。
- 准备兼容的 JDK；本项目 Java 编译目标为 21，建议使用 JDK 21，并确保终端 JAVA_HOME 与 Android Studio 的 Gradle JDK 设置一致。
- 配置 SDK 路径，可通过 Android Studio 自动生成的 local.properties 中的 sdk.dir 指定；adb 需可从终端调用。
- 首次构建需要取得 Gradle、Maven 和前端依赖；离线构建要求已有完整缓存。

### 先检查 Gradle 下载地址

当前 gradle-wrapper.properties 使用以下本机路径：

```properties
distributionUrl=file:///D:/code/gradle-8.14.3-bin.zip
```

只有该文件实际存在时才能使用。换电脑或在 CI 中构建时，应提供对应文件，或改为同版本的官方下载地址：

```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.14.3-bin.zip
```

修改前应遵循项目的依赖来源要求。为排查下载问题而直接升级 Gradle 或 Android Gradle Plugin，可能引入新的兼容性问题。

<!-- pagebreak -->

## 3 生成并安装测试 APK

以下命令使用 Windows PowerShell，从仓库根目录执行。依赖由项目维护者自行安装，不由自动化流程代为安装。测试包使用自动生成的 Debug 签名，适合开发和验收。

### 第一步 安装依赖并构建页面

```powershell
pnpm install --frozen-lockfile
pnpm -F @interview-assistant/contracts build
$env:VITE_API_BASE_URL = 'https://api.example.com/api'
pnpm -F @interview-assistant/mobile build
```

将示例地址替换为真实 API 地址。VITE_API_BASE_URL 在构建时写入前端资源；未配置时沿用 http://175.178.92.165:3100/api。改变地址后，需要重新构建、同步和打包。手机已移除连接设置，不读取旧的 interview.mobile.api 地址偏好。VITE 变量会进入客户端，不得存放语音识别或其他模型密钥、数据库密码等服务端凭据。

### 第二步 同步到 Android 工程

```powershell
pnpm -F @interview-assistant/mobile android:sync
```

android:sync 会复制 dist 资源，并更新原生配置和插件依赖。它不会代替 Vite 构建；只执行同步可能把旧页面再次放进安装包。当前工作区已有 Android 工程，不需要再次执行 android:add。

### 第三步 使用 Gradle 打包

```powershell
Push-Location apps/mobile/android
.\gradlew.bat --version
.\gradlew.bat :app:assembleDebug
Pop-Location
```

Debug APK 默认位于：

```text
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

也可以执行以下命令打开 Android Studio，再连接设备运行：

```powershell
pnpm -F @interview-assistant/mobile android:open
```

### 第四步 安装并验收

开启手机开发者选项和 USB 调试，连接数据线并接受调试授权：

```powershell
adb devices
adb install -r .\apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

确认应用能启动、连接 API、读取训练、提交回答并查看报告。随后检查返回键、输入法遮挡、切后台、锁屏和重新打开后的恢复行为。命令显示 BUILD SUCCESSFUL 只代表构建成功，不能替代这些运行验证。

当前手机应能独立完成称呼与简历上传或文本输入、岗位和 JD、项目 STAR 与量化结果、岗位分析及恢复，再选择语言、轮次、难度、4/8 题、逐题辅导/完整模拟和时间限制。继续验证暂停、恢复、跳过、提前结束、完整报告与逐题评分证据、参考答案、评分异议、历史筛选分页及三轮专项练习。提前结束和反馈时机继续由服务端规则控制。

面试与专项练习都要验证录音、停止、本机回听/删除、点击转写、保留已有草稿、校正后主动提交。麦克风拒绝时文字输入仍可用；录音最长三分钟，切后台应停止并保存已取得的音频。录音仅保存在录制手机的 IndexedDB，按题目或练习阶段隔离；服务端临时转写，不做原音跨设备同步。真机还需检查重新打开后的本机回听、切题和迟到转写隔离、响应丢失同步与草稿恢复。

<!-- pagebreak -->

## 4 网络配置与真机连接

### 安装包访问 API 的方式

开发服务器使用 Vite 代理，把 /api 转发到开发电脑的 3000 端口。安装包包含静态页面，不携带 Vite 开发服务器，因此必须使用手机能访问的完整 API 地址。

当前代码生产构建使用 VITE_API_BASE_URL，未配置时默认连接 http://175.178.92.165:3100/api。首页已移除连接设置，也不再读取旧的 interview.mobile.api 偏好；旧 /settings 链接回到首页。切换地址后需要重新 build、android:sync、Gradle 打包并安装，不会被手机中旧的地址设置覆盖。

构建地址应填写手机可达的完整 API 根地址（包含 /api），建议正式部署使用 HTTPS。Android 模拟器通常通过 10.0.2.2 访问宿主电脑；真机需要局域网地址、USB 转发或可达的服务器地址，并满足 Android 的网络与证书策略。手机上的 localhost 指向手机本身。

### 服务端允许客户端来源

Capacitor 安装版默认页面来源为 https://localhost。API 的运行环境需配置：

```properties
MOBILE_ORIGIN=https://localhost
```

配置后重启 API。这里填写的是客户端页面的 Origin，不是 API 域名，也不包含 /api 路径。若修改了 Capacitor 的 hostname 或 scheme，应按实际 Origin 调整。CORS 只控制浏览器跨域访问，不能替代身份验证。

### 当前 HTTP 兼容配置

capacitor.config.ts 当前设置 server.cleartext 为 true，并开启 android.allowMixedContent，以兼容现有 HTTP 服务。正式分发建议切换到 HTTPS，再评估收紧这些配置；修改 Capacitor 配置后也需要重新同步和打包。

### 服务端语音转写配置

手机录音先保存在本机，用户点击“转为文字”后才发送至 API。需要在服务端部署新增语音接口，并配置兼容 OpenAI /audio/transcriptions 的识别服务：

```properties
ASR_BASE_URL=https://asr.example.com/v1
ASR_MODEL=provider-supported-model
ASR_API_KEY=
ASR_TIMEOUT_MS=120000
```

ASR_BASE_URL 为 API 根地址，保留提供方要求的 /v1 等路径，API 会追加 audio/transcriptions；它和 ASR_MODEL 必填。ASR_API_KEY 仅在服务端持有，自建免密服务可留空，不复用 DeepSeek 密钥。ASR_TIMEOUT_MS 默认 120000 毫秒，上限 180000 毫秒。不要把密钥放入 VITE 变量或 APK。缺少地址或模型时会提示“语音转写服务未配置”，文字训练和本机回听仍可用。

POST /api/speech/transcriptions 使用 multipart 的 file 与 language（zh-CN、en-US、mixed），返回统一响应信封中的 { text: string }。手机上传前将录音转换为 16 kHz、单声道、16-bit PCM WAV；服务端校验文件不超过 6 MB、时长不超过 180 秒，以及 WAV 容器、PCM 参数和数据长度。服务端只为本次转写临时处理音频，不写入业务库或对象存储，不记录音频或识别正文，也不向客户端回传提供方原始错误。

真实识别验收需要有效提供方配置和 Android 真机：录一段中文或英文，先回听再转写，校正后主动提交，电脑刷新后核对同一文字回答与报告。其他设备不应显示本机原音可用。模拟服务测试仅验证接口行为，不能证明真实识别效果。

### 使用热更新调试页面

这里的 live reload 指开发调试，不是正式安装包的在线更新机制。先运行开发服务：

```powershell
pnpm -F @interview-assistant/mobile dev
```

另开一个终端，从仓库根目录运行：

```powershell
pnpm -F @interview-assistant/mobile exec cap run android `
  --live-reload --host localhost --port 5174 `
  --forwardPorts 5174:5174
```

该方式通过 USB 转发访问开发电脑的页面，API 仍由 Vite 代理。API 需允许实际开发页面的 Origin。正式打包前，应结束热更新调试，确认没有遗留指向开发服务器的 server.url，再执行 build、android:sync 和 Gradle 构建。

<!-- pagebreak -->

## 5 生成正式发布包

### 签名和版本管理

Debug 包自动使用开发证书签名。Release 包需要明确的发布签名；本项目当前未配置 signingConfigs，因此直接执行 assembleRelease 不能视为已经得到可分发的已签名包。minifyEnabled 为 false，也表示当前 Release 未启用 R8 代码压缩和混淆。

Android 更新通常要求 applicationId 相同、签名证书或受支持的签名继承关系一致，且 versionCode 满足安装或商店的递增要求。versionName 是给用户看的版本文本。Debug 和 Release 证书不同，互相覆盖安装可能失败；卸载旧应用会清除其本地数据。

### 在 Android Studio 中生成签名包

1. 修改 app/build.gradle 中的 versionCode 和 versionName，确认应用标识、名称、图标及 API 地址。
2. 重新执行前端 build 和 android:sync，再用 android:open 打开工程。
3. 在 Android Studio 选择 Build 菜单中的 Generate Signed App Bundle or APK，按需要选择 APK 或 Android App Bundle。
4. 首次发布创建并安全备份 keystore，后续发布使用对应密钥和别名，选择 release 变体后生成。
5. 从向导显示的输出目录取得文件，并验证签名、版本和实际安装行为。

签名向导生成一次签名包，不代表仓库已配置命令行 Release 签名。使用 CI 或命令行时，应单独配置 Gradle 的 signingConfigs 和 release.signingConfig，并通过受保护的环境变量或构建系统 Secret 注入密码，避免把密钥和密码提交到仓库。

### 使用命令行构建已配置签名的 Release

在完成上述 Gradle 签名配置后，从仓库根目录执行：

```powershell
Push-Location apps/mobile/android
.\gradlew.bat :app:assembleRelease
.\gradlew.bat :app:bundleRelease
Pop-Location
```

按实际发布目标选择其中一个构建任务，无需每次都生成两种文件。常见输出目录如下，具体文件名以构建输出为准：

```text
APK: apps/mobile/android/app/build/outputs/apk/release/
AAB: apps/mobile/android/app/build/outputs/bundle/release/
```

### 验证与上传

用 Android SDK Build Tools 中的 apksigner 验证 APK。以下命令从仓库根目录执行，路径应按实际产物调整：

```powershell
$signedApk = '.\apps\mobile\android\app\build\outputs\apk\release\app-release.apk'
apksigner verify --verbose --print-certs $signedApk
```

如果 apksigner 未加入 PATH，需使用对应 Build Tools 目录下的完整路径。该工具用于 APK；AAB 可用 JDK 的 jarsigner 验证，并在商店测试轨道或通过 bundletool 验证实际分发和安装。

Google Play App Signing 会区分上传密钥与应用签名密钥。上传的 AAB 使用上传密钥签名，最终分发 APK 由平台使用应用签名密钥签名。其他市场应按其当前上传格式、目标 SDK、权限和审核要求提交。

<!-- pagebreak -->

## 6 安卓打包对话踩坑复盘

置顶聊天「现在我想做一个移动端的app，帮我规划一下」中，打包先后卡在 Gradle 下载、工程路径和 SDK 定位，随后确认本机使用 JDK 17。下面保留实际报错、原因和当时的处理办法。Java 21 编译错误属于后续需要预防的问题，并非对话中已经出现的报错。

### 第一个坑 Gradle 下载超过默认超时时间

实际报错发生在下载 gradle-8.14.3-all.zip 时：

```text
java.io.IOException: Downloading from
https://services.gradle.org/distributions/gradle-8.14.3-all.zip
failed: timeout (10000ms)
```

这是 Wrapper 下载 Gradle 时超过 10 秒限制，尚未开始编译应用。对话中已将 networkTimeout 从 10000 改为 120000，并换成同版本、体积更小且足够构建的 bin 包：

```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.14.3-bin.zip
networkTimeout=120000
```

也讨论了浏览器下载 ZIP 后通过 file:/// 读取的方式。当前工作区实际指向 D:/code/gradle-8.14.3-bin.zip。该办法只解决 Gradle 本体的下载；Android 插件、Maven 依赖和 SDK 仍需另行取得，不能据此认为已具备完整离线环境。

### 第二个坑 工作目录和终端路径语法混用

实际报错指出以下项目目录不存在：

```text
.../apps/mobile/android/.appsmobileandroid
```

路径中已经包含 apps/mobile/android，却又追加了错误的相对路径。需要先确认终端当前位置；在 Git Bash 中直接粘贴未加引号的 PowerShell 反斜杠路径，也可能因转义形成 .appsmobileandroid。

已经进入 apps/mobile/android 后，只执行对应终端的命令：

```powershell
.\gradlew.bat assembleDebug
```

```bash
./gradlew assembleDebug
```

不要在该目录下再传入相对于仓库根目录的 -p 参数。PowerShell 用 Get-Location、Git Bash 用 pwd 确认位置，避免盲目重复同一条命令。

### 第三个坑 Windows 工程路径含中文

实际截图中的关键提示是：

```text
Your project path contains non-ASCII characters.
```

工程路径 G:\桌面\code\private\ai-review 包含中文「桌面」，Android Gradle Plugin 因此在应用插件时停止。对话给出的临时处理，是在 apps/mobile/android/gradle.properties 添加 android.overridePathCheck=true；该项目前已存在。

这个开关仅跳过检查，不会将路径转换为英文。后续工具若仍受影响，应把整个仓库放到纯英文路径，例如 G:\code\private\ai-review，再重新确认依赖和 SDK 路径。

<!-- pagebreak -->

### 第四个坑 Gradle 找不到 Android SDK

实际截图提示：

```text
SDK location not found.
Define a valid SDK location with ANDROID_HOME
or set sdk.dir in local.properties.
```

当时检查未发现默认 SDK 目录，也未设置 ANDROID_HOME；你随后说明「没有 Android Studio」。Android Studio 提供图形开发环境，Android SDK 才是命令行编译的必要组件，因此可以不安装 Studio，改用官方 Command line tools。

下载 Windows 命令行工具后，假设 SDK 放在 D:\Android\Sdk，需整理成下列目录，避免解压后多套一层 cmdline-tools：

```text
D:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat
D:\Android\Sdk\cmdline-tools\latest\lib\
```

先完成下方的 JDK 21 设置，再在同一 PowerShell 窗口安装 SDK。以下路径均需替换为实际安装位置：

```powershell
$env:ANDROID_HOME = 'D:\Android\Sdk'
$sdkManager = "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat"
& $sdkManager "--sdk_root=$env:ANDROID_HOME" --licenses
& $sdkManager "--sdk_root=$env:ANDROID_HOME" `
  'platforms;android-36' 'build-tools;35.0.0' 'platform-tools'
$env:Path = "$env:ANDROID_HOME\platform-tools;$env:Path"
```

许可证按提示确认。API 36 与 Build Tools 35.0.0 是不同组件的版本标识；以上延用当时对话的安装示例，其他项目应按 Android Gradle Plugin 要求调整。

也可以在 apps/mobile/android/local.properties 中写入 sdk.dir=D:/Android/Sdk，让此工程定位 SDK。路径必须真实存在并包含所需组件，单独创建配置文件不能代替 SDK 安装；本机路径文件通常不提交到仓库。

### 第五个坑 本机 JDK 17 与 Java 21 编译目标不一致

你在对话最后明确说明「现在是 Java17」，应以该澄清为准；较早的环境检查曾读到 Java 11，不能继续用旧检查结果代表后来打开的终端。项目和 Capacitor 的编译配置均指定 JavaVersion.VERSION_21。

JDK 17 能运行相应 Gradle，不代表它能编译 Java 21 源码。在未另行配置 Java 21 工具链时，后续可能出现 invalid source release: 21。可以保留旧 JDK，在打包窗口临时切换到 JDK 21：

```powershell
$env:JAVA_HOME = 'D:\Java\jdk-21'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
javac -version
```

两条版本输出都应为 21。设置只对当前终端及其子进程生效；在新窗口构建时需重新确认。无需为迁就本机旧 JDK，直接修改 Capacitor 自动生成文件中的 Java 编译目标。

<!-- pagebreak -->

### 排查顺序与可复用构建命令

这轮排错依次暴露了多个独立条件：Gradle 下载正常后，才走到路径检查；路径检查通过后，又发现 SDK 未就绪。出现下一条错误并不表示前一步处理无效，应定位本次日志最先出现的具体原因。

建议按顺序核对：终端类型和当前目录、JAVA_HOME 与 java/javac 版本、SDK 安装和定位、Gradle 下载地址，最后再执行前端构建与 Android 打包。

以下片段适用于 PowerShell，前提是前端依赖、JDK 21 和 SDK 已准备好。进入实际仓库根目录后执行；已有 Android 工程时仅同步，首次才创建：

```powershell
$ErrorActionPreference = 'Stop'
pnpm -F @interview-assistant/contracts build
if ($LASTEXITCODE -ne 0) { throw 'Contracts build failed' }

pnpm -F @interview-assistant/mobile build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }

if (Test-Path '.\apps\mobile\android\gradlew.bat') {
    pnpm -F @interview-assistant/mobile android:sync
} else {
    pnpm -F @interview-assistant/mobile android:add
}
if ($LASTEXITCODE -ne 0) { throw 'Android sync/add failed' }

Push-Location '.\apps\mobile\android'
try {
    .\gradlew.bat --version
    if ($LASTEXITCODE -ne 0) { throw 'Gradle check failed' }
    .\gradlew.bat :app:assembleDebug
    if ($LASTEXITCODE -ne 0) { throw 'APK build failed' }
} finally {
    Pop-Location
}
```

原生程序返回非零退出码时，PowerShell 的 ErrorActionPreference 并不保证自动停止，因此片段还显式检查 LASTEXITCODE，避免页面构建失败后继续打包旧 dist。

### 这轮对话的验证结果

已核对 Wrapper 的超时配置为 120000，下载地址目前使用 D 盘本地 ZIP；中文路径检查开关也已存在。SDK 安装、JDK 21 切换、完整 APK 构建和真机安装仍需按上述步骤验收。对话最后停留在环境准备，不能把已给出处理办法等同于已成功生成 APK。

<!-- pagebreak -->

## 7 常见问题与发布核对

| 现象                                   | 优先检查                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Gradle 找不到压缩包或下载失败          | Wrapper 当前指向 D 盘本地文件；检查路径、下载源及网络                                                          |
| Java 版本不兼容或无效的 source release | 检查 JAVA_HOME、Gradle JDK，以及 Java 21 编译配置                                                              |
| SDK location not found 或缺少平台      | 检查 local.properties、SDK 路径和 Android 36 平台组件                                                          |
| 新包中仍是旧页面                       | 是否依次执行 build、android:sync、Gradle 构建，并安装最新 APK                                                  |
| 启动正常但 API 请求失败                | 构建时的完整 VITE_API_BASE_URL、服务端可达性、证书、MOBILE_ORIGIN 和 HTTP 策略；修改地址后重新构建、同步、打包 |
| 能录音但转写失败                       | 服务端 ASR 地址和模型是否配置、提供方凭据与可达性、超时及 WAV 大小/时长限制；文字提交和本机回听应仍可用        |
| 安装提示签名冲突                       | 设备上同包名应用的签名是否一致；先确认本地数据处理方案                                                         |
| 安装或上传提示版本过低                 | versionCode 是否递增；package.json 版本不会自动更新 Android 版本                                               |
| Release 文件无法安装或不被接受         | 是否实际签名；是否把 AAB 当成 APK 安装；检查渠道校验结果                                                       |

日常更新通常不需要 clean。只有怀疑构建缓存或原生产物异常时，再考虑执行 Gradle clean 并重新构建，避免把清缓存当作固定步骤。

### 发布前核对

- [ ] 构建所需的 Node、pnpm、JDK、SDK 和 Gradle 来源已确认。
- [ ] 应用标识正确，versionCode 已递增，versionName 已更新。
- [ ] VITE_API_BASE_URL 或默认 API 地址符合发布环境，MOBILE_ORIGIN、HTTPS 与 CORS 已验证；手机没有连接设置覆盖入口。
- [ ] 前端重新构建，Capacitor 已同步，未遗留开发服务器地址。
- [ ] APK 或 AAB 已按目标渠道签名，密钥已有可恢复的安全备份。
- [ ] 在真机完成独立准备训练、控制、提交、报告、复盘、专项练习、返回键及中断恢复验收。
- [ ] 在真机验证麦克风授权、三分钟停止、切后台、本机回听与删除；用有效 ASR 完成转写、校正和主动提交。
- [ ] 保存安装包、提交号、版本、构建环境和发布说明，便于定位后续问题。
- [ ] 若后续开启混淆，保存 mapping.txt；若含原生库，按需保存调试符号。

## 8 配置来源与进一步阅读

项目依据：apps/mobile/package.json、capacitor.config.ts、src/connection.ts、vite.config.ts；Android 工程中的 app/build.gradle、app/capacitor.build.gradle、build.gradle、variables.gradle、gradle/wrapper/gradle-wrapper.properties；以及 apps/api/src/main.ts 和 docs/2026-11-05-mobile-app-plan.md。

Android 官方文档：[构建概览](https://developer.android.com/build)、[命令行构建](https://developer.android.com/build/building-cmdline)、[应用签名](https://developer.android.com/studio/publish/app-signing)、[App Bundle](https://developer.android.com/guide/app-bundle)、[SDK 管理工具](https://developer.android.com/tools/sdkmanager)。

Capacitor 官方文档：[Android 平台](https://capacitorjs.com/docs/android)、[sync 命令](https://capacitorjs.com/docs/cli/commands/sync)。

文中的版本和路径对应核对日期的项目配置。工具版本兼容范围及商店发布规则应在正式发布前按官方文档再次确认。
