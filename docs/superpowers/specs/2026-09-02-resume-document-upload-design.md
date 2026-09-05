# Resume Document Upload Design

## Goal

将简历分析的主入口从“直接粘贴文本”升级为“上传 PDF、DOCX 简历文件”，并将原始文件安全存储在 MinIO，将解析后的文本继续接入现有的岗位分析和面试训练链路。

## Scope

本次实现覆盖：

- 桌面端上传 PDF、DOCX，以及对旧版 DOC 给出可操作的兼容提示。
- API 端使用 multipart 上传并限制文件大小。
- 服务端校验扩展名、MIME 类型和文件头。
- 原始文件写入私有 MinIO bucket。
- PDF 文本层解析和 DOCX XML 文本解析。
- PostgreSQL/Prisma 保存文件元数据、解析状态和 profile 关联。
- 解析后的文本写入现有 `CandidateProfile.resumeText`。
- 上传成功后复用现有 `/jobs/analyze`、面试会话和报告流程。
- 解析失败、文件类型不支持、文件过大和空文本的明确错误提示。

本次不覆盖：

- 扫描 PDF OCR。
- 旧版二进制 DOC 的直接解析。
- 前端直传 MinIO。
- 用户登录、跨用户权限和生产级 KMS。
- 文档在线预览和下载。

## Architecture

```text
Electron Renderer
  -> POST /api/profiles/resume (multipart/form-data)
  -> NestJS ResumeController
  -> ResumeService
       -> validate file
       -> MinioStorageService.putObject
       -> ResumeParserService.extractText
       -> ResumeRepository.createProfileFromDocument
  -> CandidateProfile.resumeText
  -> existing Job/Interview flow
```

API 是 MinIO 的唯一访问方。MinIO bucket 保持私有，renderer 不持有 MinIO 凭据，也不接触 object key 的访问权限。

## Storage

### MinIO

开发环境使用现有 Docker Compose 中的 MinIO 服务，新增配置：

```env
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=interview
MINIO_SECRET_KEY=interview_dev_only
MINIO_BUCKET_RESUMES=interview-resumes
MINIO_USE_SSL=false
RESUME_MAX_FILE_MB=10
```

对象 key 使用不可读的 document id，不包含姓名、邮箱和原始文件名：

```text
users/{userKey}/resume-documents/{documentId}/original.{extension}
```

原始文件名只保存在数据库，原始文件内容不进入 PostgreSQL。

### Prisma

新增 `ResumeDocument`：

| 字段             | 说明                                     |
| ---------------- | ---------------------------------------- |
| `id`             | 文档标识                                 |
| `profileId`      | 解析成功后关联 `CandidateProfile`        |
| `bucket`         | MinIO bucket                             |
| `objectKey`      | MinIO object key                         |
| `originalName`   | 用户上传时的文件名                       |
| `mimeType`       | 服务端确认的 MIME                        |
| `extension`      | `pdf` 或 `docx`                          |
| `sizeBytes`      | 文件大小                                 |
| `sha256`         | 原始文件 hash                            |
| `parseStatus`    | `pending`、`parsing`、`parsed`、`failed` |
| `parseError`     | 面向服务端排查的错误摘要                 |
| `parserVersion`  | 解析器版本                               |
| `extractedChars` | 解析出的字符数                           |
| `parsedAt`       | 解析成功时间                             |

`CandidateProfile.resumeText` 仍然作为 Agent 的稳定输入，`resumeSource` 标记为 `file` 或 `text`。这样现有分析链路不需要读取 MinIO，也不需要改动 prompt 的输入结构。

## API

### Upload

```http
POST /api/profiles/resume
Content-Type: multipart/form-data
```

Form fields:

```text
file: required, PDF/DOCX
displayName: optional
```

Success response:

```json
{
  "id": "profile_id",
  "displayName": "Candidate",
  "resumeText": "Extracted resume text",
  "resumeSource": "file",
  "resumeDocument": {
    "id": "document_id",
    "originalName": "resume.pdf",
    "mimeType": "application/pdf",
    "extension": "pdf",
    "sizeBytes": 123456,
    "sha256": "sha256",
    "parseStatus": "parsed",
    "extractedChars": 4500
  }
}
```

### Compatibility

现有 `POST /api/profiles` 文本入口继续保留，用于兼容旧客户端和解析失败后的手动输入兜底。新的桌面端默认使用文件上传接口。

## Parsing

### PDF

使用 PDF.js 提取已有文本层。每页文本按阅读顺序拼接，并进行空白字符清洗。没有可提取文本时返回 `scanned_pdf_requires_ocr`，不把乱码送入模型。

### DOCX

使用 ZIP 读取 `word/document.xml`，抽取段落、表格中的文本节点并解码 XML 实体。结果统一进行空白字符清洗。

### DOC

旧版 `.doc` 使用 OLE 二进制格式，MVP 不直接解析。服务端返回 `legacy_doc_not_supported`，前端提示用户另存为 `.docx` 或 PDF 后重新上传。

## Error Contract

错误响应仍使用仓库现有 API envelope，消息面向用户且不包含文件内容、MinIO 凭据或内部堆栈：

| code/message key           | 场景                      |
| -------------------------- | ------------------------- |
| `unsupported_file_type`    | 扩展名或 MIME 不支持      |
| `file_too_large`           | 超过 `RESUME_MAX_FILE_MB` |
| `invalid_file_signature`   | 文件头与声明类型不一致    |
| `legacy_doc_not_supported` | `.doc` 文件               |
| `empty_resume_text`        | 文件没有文本层            |
| `resume_parse_failed`      | 解析器异常                |
| `resume_storage_failed`    | MinIO 写入失败            |

## Frontend Flow

`TrainingView` 的候选人档案区域改为：

1. 选择文件。
2. 上传中显示文件名和进度。
3. 解析成功显示文件元数据、提取字数和文本预览。
4. 解析失败显示明确原因、重新上传按钮和“手动粘贴文本”入口。
5. 分析按钮要求 `profileId` 已存在，或用户已经切换到文本兜底并成功创建 profile。

`profileId` 在上传成功时获得，点击“分析岗位并继续”时直接复用该 id。

## Reliability and Security

- MinIO bucket 私有，API 是唯一访问入口。
- 上传前后均进行大小限制，服务端以 `Buffer.byteLength` 为最终依据。
- 文件名只用于展示，object key 不包含 PII。
- DB 写入失败时删除已经上传的对象，避免孤儿文件。
- 解析失败时保留 `ResumeDocument` 的失败记录，便于问题排查和后续重试。
- 不记录原始简历内容、模型 prompt、MinIO secret 或 object body。
- 删除 profile 的后续扩展应由 service 同步删除关联对象；本次不新增删除 UI。

## Test Strategy

- `ResumeParserService`：PDF、DOCX、空文本、旧 DOC 和非法文件头。
- `MinioStorageService`：验证 put/delete 调用参数，使用注入的 S3 client fake。
- `ResumeService`：验证上传、持久化、失败清理和 profile 返回值。
- Controller/module：验证 multipart 路由和 provider 注册。
- Desktop API client：验证 FormData 和上传进度回调。
- Desktop view：类型检查，手工验证上传成功、解析失败和文本兜底状态。

## Acceptance Criteria

- 上传一个文本型 PDF 或 DOCX 后，可以创建 `CandidateProfile`。
- `CandidateProfile.resumeText` 包含抽取文本，现有岗位分析接口可以直接使用该 profile。
- MinIO 中存在对应原始文件，数据库中存在 `ResumeDocument` 元数据。
- 不支持的文件、损坏文件、空文本和超大文件会返回明确错误。
- 现有文本创建 profile 和原有面试流程测试继续通过。
- `pnpm test`、`pnpm typecheck`、`pnpm build` 在依赖和本地环境可用时通过。
