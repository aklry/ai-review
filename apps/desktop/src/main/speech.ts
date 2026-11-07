import { execFile } from 'node:child_process';
import { join } from 'node:path';

// Keep all commands fixed; only PCM audio goes through the child process's stdin.
const recognize = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech
$culture = [Globalization.CultureInfo]::GetCultureInfo($env:INTERVIEW_SPEECH_LANG)
$engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($culture)
$memory = [IO.MemoryStream]::new()
try {
  [Console]::OpenStandardInput().CopyTo($memory)
  $memory.Position = 0
  $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
  $engine.SetInputToWaveStream($memory)
  while ($true) {
    try { $result = $engine.Recognize() }
    catch [System.InvalidOperationException] {
      if ($memory.Position -eq $memory.Length) { break }
      throw
    }
    if ($null -eq $result) { break }
    [Console]::WriteLine($result.Text)
  }
} finally { $engine.Dispose(); $memory.Dispose() }
`;
export async function transcribeWav(bytes: Uint8Array, language: string): Promise<string> {
  if (process.platform !== 'win32') throw new Error('此平台暂不支持本地语音识别');
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 44 ||
    bytes.length > 6_000_000 ||
    Buffer.from(bytes.subarray(0, 4)).toString() !== 'RIFF'
  )
    throw new Error('无效的录音');
  const shell = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  return new Promise((resolve, reject) => {
    const child = execFile(
      shell,
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(recognize, 'utf16le').toString('base64'),
      ],
      {
        windowsHide: true,
        timeout: 120000,
        encoding: 'utf8',
        env: {
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          USERPROFILE: process.env.USERPROFILE,
          INTERVIEW_SPEECH_LANG: language === 'en-US' ? 'en-US' : 'zh-CN',
        },
      },
      (error, stdout) => {
        if (error)
          reject(new Error('本机语音识别不可用，请检查对应语言的 Windows 语音包，或手动输入。'));
        else if (!stdout.trim()) reject(new Error('未识别到语音，可重录或手动输入。'));
        else resolve(stdout.trim());
      },
    );
    child.stdin?.on('error', () => {}); // Early recognizer errors are reported by execFile.
    child.stdin?.end(Buffer.from(bytes));
  });
}
