use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::State;
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::Command,
    sync::oneshot,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
mod job {
    use std::{ffi::c_void, mem::size_of, ptr};

    use windows_sys::Win32::{
        Foundation::{CloseHandle, GetLastError, HANDLE},
        System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, TerminateJobObject,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
    };

    pub struct JobHandle(HANDLE);

    // Job 句柄是进程级内核对象，可以跨线程持有；这里只做 assign/terminate/close。
    unsafe impl Send for JobHandle {}

    impl JobHandle {
        pub fn create() -> Result<Self, String> {
            let handle = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
            if handle.is_null() {
                return Err(format!(
                    "创建 Job Object 失败：{}",
                    unsafe { GetLastError() }
                ));
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION =
                unsafe { std::mem::zeroed() };
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = unsafe {
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const c_void,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            };
            if ok == 0 {
                let error = unsafe { GetLastError() };
                unsafe { CloseHandle(handle) };
                return Err(format!("配置 Job Object 失败：{error}"));
            }
            Ok(Self(handle))
        }

        pub fn assign(&self, process: HANDLE) -> Result<(), String> {
            let ok = unsafe { AssignProcessToJobObject(self.0, process) };
            if ok == 0 {
                Err(format!(
                    "把 CLI 进程加入 Job Object 失败：{}",
                    unsafe { GetLastError() }
                ))
            } else {
                Ok(())
            }
        }

        pub fn terminate(&self) {
            unsafe {
                TerminateJobObject(self.0, 1);
            }
        }
    }

    impl Drop for JobHandle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[cfg(windows)]
use job::JobHandle;

#[cfg(windows)]
fn job_for_child(child: &tokio::process::Child) -> Option<JobHandle> {
    let job = match job::JobHandle::create() {
        Ok(job) => job,
        Err(error) => {
            eprintln!("{error}");
            return None;
        }
    };
    let Some(handle) = child.raw_handle() else {
        return None;
    };
    if let Err(error) = job.assign(handle as windows_sys::Win32::Foundation::HANDLE) {
        eprintln!("{error}");
        return None;
    }
    Some(job)
}

#[cfg(not(windows))]
struct JobHandle;

#[cfg(not(windows))]
impl JobHandle {
    fn terminate(&self) {}
}

#[cfg(not(windows))]
fn job_for_child(_child: &tokio::process::Child) -> Option<JobHandle> {
    None
}

fn kill_tree(child: &mut tokio::process::Child, job: Option<&JobHandle>) {
    if let Some(job) = job {
        job.terminate();
    }
    #[cfg(windows)]
    {
        if let Some(pid) = child.id() {
            let _ = std::process::Command::new("taskkill.exe")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(0x0800_0000)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }
    let _ = child.start_kill();
}

fn hide_window(command: &mut Command) {
    #[cfg(windows)]
    {
        command.creation_flags(0x0800_0000);
    }
}

const PS_UTF8_PRELUDE: &str =
    "try { [Console]::InputEncoding = [Text.UTF8Encoding]::new($false) } catch {}; \
     try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch {}; ";

#[derive(Default)]
pub struct AiState {
    cancel: Mutex<HashMap<String, oneshot::Sender<()>>>,
    /// `ai_cancel` 可能比 `ai_run` 注册 sender 更早到达，先记下请求，
    /// 等 `ai_run` 启动时立刻取消，避免切笔记时漏杀整个进程树。
    pending_cancels: Mutex<HashSet<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRunResult {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    timed_out: bool,
    canceled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDetectionResult {
    found: bool,
    path: Option<String>,
    version: Option<String>,
    error: Option<String>,
}

fn expand_home(value: &str) -> String {
    let rest = value
        .strip_prefix("~/")
        .or_else(|| value.strip_prefix("~\\"));
    let Some(rest) = rest else {
        return value.to_string();
    };
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok();
    match home {
        Some(home) => format!("{home}\\{rest}"),
        None => value.to_string(),
    }
}

fn extension_rank(path: &Path) -> u8 {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "exe" => 0,
        "cmd" => 1,
        "bat" => 2,
        "ps1" => 3,
        _ => 4,
    }
}

fn resolve_command(command: &str) -> Result<PathBuf, String> {
    let raw = expand_home(command.trim());
    if raw.is_empty() {
        return Err("CLI 路径为空。".to_string());
    }

    let direct = PathBuf::from(&raw);
    if raw.contains('/') || raw.contains('\\') {
        return if direct.is_file() {
            Ok(direct)
        } else {
            Err(format!("找不到 CLI：{raw}"))
        };
    }

    #[cfg(windows)]
    {
        let output = std::process::Command::new("where.exe")
            .arg(&raw)
            .output()
            .map_err(|error| format!("无法查询 PATH：{error}"))?;
        if !output.status.success() {
            return Err(format!("PATH 中找不到 {raw}"));
        }
        let mut candidates: Vec<PathBuf> = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(PathBuf::from)
            .filter(|path| path.is_file())
            .collect();
        candidates.sort_by_key(|path| extension_rank(path));
        return candidates
            .into_iter()
            .next()
            .ok_or_else(|| format!("PATH 中找不到 {raw}"));
    }

    #[cfg(not(windows))]
    {
        let output = std::process::Command::new("which")
            .arg(&raw)
            .output()
            .map_err(|error| format!("无法查询 PATH：{error}"))?;
        if !output.status.success() {
            return Err(format!("PATH 中找不到 {raw}"));
        }
        let path = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(PathBuf::from)
            .ok_or_else(|| format!("PATH 中找不到 {raw}"))?;
        Ok(path)
    }
}

#[cfg(windows)]
fn powershell_program() -> &'static str {
    static PROGRAM: OnceLock<String> = OnceLock::new();
    PROGRAM
        .get_or_init(|| {
            let has_pwsh = std::process::Command::new("where.exe")
                .arg("pwsh")
                .output()
                .map(|output| output.status.success())
                .unwrap_or(false);
            if has_pwsh {
                "pwsh.exe".to_string()
            } else {
                "powershell.exe".to_string()
            }
        })
        .as_str()
}

/// `.exe` 直跑；`.ps1`/`.cmd`/`.bat` 用固定 PowerShell 包装，
/// 参数通过环境变量 JSON 传递，避免拼接命令行。
fn build_process(command_path: &Path, args: &[String]) -> Result<Command, String> {
    #[cfg(windows)]
    {
        let extension = command_path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if extension == "ps1" || extension == "cmd" || extension == "bat" {
            let script = format!(
                "{PS_UTF8_PRELUDE}$a = ConvertFrom-Json $env:WIKLOOM_AI_ARGS; & $env:WIKLOOM_AI_CLI @a; exit $LASTEXITCODE"
            );
            let mut command = Command::new(powershell_program());
            command
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                ])
                .arg(script)
                .env("WIKLOOM_AI_CLI", command_path)
                .env(
                    "WIKLOOM_AI_ARGS",
                    serde_json::to_string(args)
                        .map_err(|error| format!("无法传递 CLI 参数：{error}"))?,
                );
            hide_window(&mut command);
            return Ok(command);
        }
    }

    let mut command = Command::new(command_path);
    command.args(args);
    hide_window(&mut command);
    Ok(command)
}

fn configure_process(command: &mut Command, with_stdin: bool) {
    command
        .stdin(if with_stdin {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
}

async fn read_pipe<R: AsyncRead + Unpin>(mut reader: R) -> String {
    let mut buffer = Vec::new();
    let _ = reader.read_to_end(&mut buffer).await;
    String::from_utf8_lossy(&buffer).to_string()
}

fn temp_output_path() -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "wikloom-ai-{}-{stamp}.md",
        std::process::id()
    ))
}

fn duration_ms(value: Option<u64>, default_ms: u64) -> Duration {
    Duration::from_millis(value.unwrap_or(default_ms).max(1_000))
}

#[tauri::command]
pub async fn ai_run(
    state: State<'_, AiState>,
    request_id: String,
    command: String,
    args: Vec<String>,
    prompt: String,
    timeout_ms: Option<u64>,
    capture_output_file: Option<bool>,
) -> Result<AiRunResult, String> {
    // 取消可能先于本次 ai_run 到达；直接返回取消，不启动进程。
    let canceled_before_start = state
        .pending_cancels
        .lock()
        .map(|mut pending| pending.remove(&request_id))
        .unwrap_or(false);
    if canceled_before_start {
        return Ok(AiRunResult {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            timed_out: false,
            canceled: true,
        });
    }

    let command_path = resolve_command(&command)?;

    let needs_output_file =
        capture_output_file.unwrap_or(false) || args.iter().any(|arg| arg == "{outputFile}");
    let output_file = needs_output_file.then(temp_output_path);
    let args: Vec<String> = args
        .into_iter()
        .map(|arg| {
            if arg == "{outputFile}" {
                output_file
                    .as_ref()
                    .map(|path| path.to_string_lossy().to_string())
                    .unwrap_or_default()
            } else {
                arg
            }
        })
        .collect();

    let mut process = build_process(&command_path, &args)?;
    configure_process(&mut process, true);
    let mut child = process.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            format!("CLI_NOT_FOUND: 找不到 {}", command_path.display())
        } else {
            format!("无法启动 CLI：{error}")
        }
    })?;

    // 在写入 stdin 前把直接子进程绑到 Job Object；之后它启动的
    // cmd/PowerShell/node 等孙进程会自动继承，超时/取消可整棵树终止。
    #[cfg(windows)]
    let job = job_for_child(&child);
    #[cfg(not(windows))]
    let job: Option<JobHandle> = None;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法打开 CLI stdin。".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 CLI stdout。".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 CLI stderr。".to_string())?;

    let prompt_bytes = prompt.into_bytes();
    let writer = tokio::spawn(async move {
        let _ = stdin.write_all(&prompt_bytes).await;
        let _ = stdin.shutdown().await;
    });
    let stdout_task = tokio::spawn(read_pipe(stdout));
    let stderr_task = tokio::spawn(read_pipe(stderr));

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    {
        let mut pending = state
            .cancel
            .lock()
            .map_err(|_| "AI 取消状态锁失败。".to_string())?;
        pending.insert(request_id.clone(), cancel_tx);
    }
    // 覆盖「取消在 spawn 之后、注册 sender 之前到达」的窗口。
    let canceled_before_register = state
        .pending_cancels
        .lock()
        .map(|mut pending| pending.remove(&request_id))
        .unwrap_or(false);

    let deadline = Instant::now() + duration_ms(timeout_ms, 180_000);
    let mut timed_out = false;
    let mut canceled = false;
    let mut wait_error: Option<String> = None;
    let exit_code = loop {
        if canceled_before_register {
            canceled = true;
            kill_tree(&mut child, job.as_ref());
            let _ = child.wait().await;
            break None;
        }

        match child.try_wait() {
            Ok(Some(status)) => break status.code(),
            Ok(None) => {}
            Err(error) => {
                wait_error = Some(format!("等待 CLI 退出失败：{error}"));
                break None;
            }
        }

        if cancel_rx.try_recv().is_ok() {
            canceled = true;
            kill_tree(&mut child, job.as_ref());
            let _ = child.wait().await;
            break None;
        }
        if Instant::now() >= deadline {
            timed_out = true;
            kill_tree(&mut child, job.as_ref());
            let _ = child.wait().await;
            break None;
        }
        tokio::time::sleep(Duration::from_millis(30)).await;
    };

    {
        if let Ok(mut pending) = state.cancel.lock() {
            pending.remove(&request_id);
        }
    }

    // 正常退出也关一次 Job：清掉 CLI 可能留下的后台孙进程。
    if let Some(job) = &job {
        job.terminate();
    }

    let _ = writer.await;
    let mut stdout = stdout_task.await.unwrap_or_default();
    let stderr = stderr_task.await.unwrap_or_default();

    if let Some(path) = output_file {
        if let Ok(text) = std::fs::read_to_string(&path) {
            if !text.trim().is_empty() {
                stdout = text;
            }
        }
        let _ = std::fs::remove_file(&path);
    }

    if let Some(error) = wait_error {
        return Err(error);
    }

    Ok(AiRunResult {
        stdout,
        stderr,
        exit_code,
        timed_out,
        canceled,
    })
}

#[tauri::command]
pub fn ai_cancel(state: State<'_, AiState>, request_id: String) {
    let sender = state
        .cancel
        .lock()
        .ok()
        .and_then(|mut map| map.remove(&request_id));
    if let Some(sender) = sender {
        let _ = sender.send(());
        return;
    }

    // ai_run 可能还没注册 sender；先记下，等它注册后立刻取消。
    if let Ok(mut pending) = state.pending_cancels.lock() {
        pending.insert(request_id);
    }
}

fn first_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

#[tauri::command]
pub async fn ai_detect(command: String, args: Vec<String>) -> AiDetectionResult {
    let command_path = match resolve_command(&command) {
        Ok(path) => path,
        Err(error) => {
            return AiDetectionResult {
                found: false,
                path: None,
                version: None,
                error: Some(error),
            }
        }
    };

    let mut process = match build_process(&command_path, &args) {
        Ok(process) => process,
        Err(error) => {
            return AiDetectionResult {
                found: true,
                path: Some(command_path.to_string_lossy().to_string()),
                version: None,
                error: Some(error),
            }
        }
    };
    configure_process(&mut process, false);

    match tokio::time::timeout(Duration::from_secs(8), process.output()).await {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            AiDetectionResult {
                found: true,
                path: Some(command_path.to_string_lossy().to_string()),
                version: first_line(&stdout).or_else(|| first_line(&stderr)),
                error: if output.status.success() {
                    None
                } else {
                    Some(stderr.trim().to_string())
                },
            }
        }
        Ok(Err(error)) => AiDetectionResult {
            found: true,
            path: Some(command_path.to_string_lossy().to_string()),
            version: None,
            error: Some(format!("无法运行 CLI：{error}")),
        },
        Err(_) => AiDetectionResult {
            found: true,
            path: Some(command_path.to_string_lossy().to_string()),
            version: None,
            error: Some("检测超时。".to_string()),
        },
    }
}

#[tauri::command]
pub async fn ai_ollama_detect(url: String) -> AiDetectionResult {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return AiDetectionResult {
                found: false,
                path: None,
                version: None,
                error: Some(error.to_string()),
            }
        }
    };

    match client.get(&url).send().await {
        Ok(response) if response.status().is_success() => {
            let text = response.text().await.unwrap_or_default();
            let count = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|value| value["models"].as_array().map(Vec::len));
            AiDetectionResult {
                found: true,
                path: None,
                version: Some(match count {
                    Some(count) => format!("Ollama API 可用，{count} 个模型"),
                    None => "Ollama API 可用".to_string(),
                }),
                error: None,
            }
        }
        Ok(response) => AiDetectionResult {
            found: false,
            path: None,
            version: None,
            error: Some(format!("Ollama 返回 HTTP {}", response.status())),
        },
        Err(error) => AiDetectionResult {
            found: false,
            path: None,
            version: None,
            error: Some(format!("无法连接 Ollama：{error}")),
        },
    }
}

#[tauri::command]
pub async fn ai_ollama(
    url: String,
    model: String,
    prompt: String,
    system: String,
    timeout_ms: Option<u64>,
) -> Result<AiRunResult, String> {
    let endpoint = format!("{}/api/generate", url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(duration_ms(timeout_ms, 180_000))
        .build()
        .map_err(|error| format!("无法初始化 Ollama 请求：{error}"))?;
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "system": system,
        "stream": false,
    });

    let response = match client.post(endpoint).json(&body).send().await {
        Ok(response) => response,
        Err(error) => {
            let timed_out = error.is_timeout();
            return Ok(AiRunResult {
                stdout: String::new(),
                stderr: format!("Ollama 连接失败：{error}"),
                exit_code: Some(1),
                timed_out,
                canceled: false,
            });
        }
    };

    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Ok(AiRunResult {
            stdout: String::new(),
            stderr: format!("Ollama HTTP {}：{text}", status.as_u16()),
            exit_code: Some(1),
            timed_out: false,
            canceled: false,
        });
    }

    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(value) => {
            if let Some(error) = value["error"].as_str() {
                return Ok(AiRunResult {
                    stdout: String::new(),
                    stderr: format!("Ollama：{error}"),
                    exit_code: Some(1),
                    timed_out: false,
                    canceled: false,
                });
            }
            Ok(AiRunResult {
                stdout: value["response"].as_str().unwrap_or("").to_string(),
                stderr: String::new(),
                exit_code: Some(0),
                timed_out: false,
                canceled: false,
            })
        }
        Err(error) => Ok(AiRunResult {
            stdout: String::new(),
            stderr: format!("无法解析 Ollama 返回：{error}"),
            exit_code: Some(1),
            timed_out: false,
            canceled: false,
        }),
    }
}
