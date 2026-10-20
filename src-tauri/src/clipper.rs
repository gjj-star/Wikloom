use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    time::Duration,
};

use encoding_rs::{Encoding, UTF_8};
use reqwest::{
    header::{ACCEPT, CONTENT_TYPE, LOCATION},
    redirect::Policy,
    Client, Url,
};
use serde::Serialize;

const MAX_BYTES: usize = 5 * 1024 * 1024;
const MAX_REDIRECTS: usize = 10;
const FETCH_TIMEOUT: Duration = Duration::from_secs(20);
const DNS_TIMEOUT: Duration = Duration::from_secs(5);
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Wikloom/0.3.0";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedPage {
    pub final_url: String,
    pub html: String,
    pub content_type: String,
    pub charset: String,
    pub status: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipError {
    pub code: String,
    pub message: String,
    pub status: Option<u16>,
}

impl ClipError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            status: None,
        }
    }

    fn with_status(mut self, status: u16) -> Self {
        self.status = Some(status);
        self
    }
}

/// Rust 侧抓取网页。所有重定向都重新走安全校验，避免被重定向到内网。
#[tauri::command]
pub async fn clip_fetch(url: String) -> Result<FetchedPage, ClipError> {
    match tokio::time::timeout(FETCH_TIMEOUT, fetch_page(url)).await {
        Ok(result) => result,
        Err(_) => Err(ClipError::new(
            "TIMEOUT",
            "抓取超时（20 秒）。请检查网络，或稍后重试。",
        )),
    }
}

async fn fetch_page(input: String) -> Result<FetchedPage, ClipError> {
    let mut current = parse_clip_url(&input)?;

    for redirect_count in 0..=MAX_REDIRECTS {
        let addrs = validate_public_url(&current).await?;
        if current.fragment().is_some() {
            current.set_fragment(None);
        }

        // DNS 校验和真实连接使用同一组地址，避免 DNS rebinding 在校验后改指向内网。
        let mut builder = Client::builder()
            .redirect(Policy::none())
            .user_agent(USER_AGENT);
        if !addrs.is_empty() {
            let host = current
                .host_str()
                .ok_or_else(|| ClipError::new("INVALID_URL", "网址缺少域名。"))?;
            builder = builder.resolve_to_addrs(host, &addrs);
        }
        let client = builder.build().map_err(|error| {
            ClipError::new("FETCH_FAILED", format!("初始化网络请求失败：{error}"))
        })?;

        let response = client
            .get(current.clone())
            .header(ACCEPT, "text/html,application/xhtml+xml")
            .send()
            .await
            .map_err(map_reqwest_error)?;
        let status = response.status();

        if status.is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| {
                    ClipError::new(
                        "REDIRECT_FAILED",
                        "服务器返回了重定向，但没有给出目标地址。",
                    )
                })?;
            if redirect_count == MAX_REDIRECTS {
                return Err(ClipError::new(
                    "TOO_MANY_REDIRECTS",
                    "页面重定向次数过多，已停止抓取。",
                ));
            }
            current = current.join(location).map_err(|_| {
                ClipError::new("REDIRECT_FAILED", "重定向目标不是有效的网址。")
            })?;
            continue;
        }

        if status.as_u16() == 404 {
            return Err(ClipError::new(
                "HTTP_404",
                "页面不存在（HTTP 404）。请检查网址是否正确。",
            )
            .with_status(404));
        }
        if !status.is_success() {
            return Err(ClipError::new(
                "HTTP_ERROR",
                format!("页面返回 HTTP {}，无法抓取。", status.as_u16()),
            )
            .with_status(status.as_u16()));
        }

        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        if !is_html_content_type(&content_type) {
            return Err(ClipError::new(
                "NOT_HTML",
                "这个地址返回的不是 HTML 网页，暂时不能剪藏。",
            ));
        }

        let header_charset = charset_from_content_type(&content_type);
        let bytes = read_limited_body(response).await?;
        let (html, charset) = decode_html(&bytes, header_charset.as_deref());

        return Ok(FetchedPage {
            final_url: current.to_string(),
            html,
            content_type,
            charset,
            status: status.as_u16(),
        });
    }

    Err(ClipError::new(
        "TOO_MANY_REDIRECTS",
        "页面重定向次数过多，已停止抓取。",
    ))
}

fn parse_clip_url(input: &str) -> Result<Url, ClipError> {
    let url = Url::parse(input.trim())
        .map_err(|_| ClipError::new("INVALID_URL", "请输入完整的 http 或 https 网址。"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(ClipError::new(
            "UNSAFE_URL",
            "只支持 http 和 https 网页，file:// 等本地地址不能剪藏。",
        ));
    }
    if url.host_str().is_none() {
        return Err(ClipError::new("INVALID_URL", "网址缺少域名。"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(ClipError::new(
            "UNSAFE_URL",
            "网址里不能包含用户名或密码。",
        ));
    }
    Ok(url)
}

async fn validate_public_url(url: &Url) -> Result<Vec<SocketAddr>, ClipError> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err(ClipError::new(
            "UNSAFE_URL",
            "只支持 http 和 https 网页，file:// 等本地地址不能剪藏。",
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| ClipError::new("INVALID_URL", "网址缺少域名。"))?
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim_end_matches('.')
        .to_ascii_lowercase();

    if is_blocked_host_name(&host) {
        return Err(ClipError::new(
            "UNSAFE_URL",
            "不能抓取 localhost、本机地址或内网地址。请使用公开网页网址。",
        ));
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_blocked_ip(ip) {
            return Err(ClipError::new(
                "UNSAFE_URL",
                "不能抓取 localhost、本机地址或内网地址。请使用公开网页网址。",
            ));
        }
        return Ok(Vec::new());
    }

    let port = url.port_or_known_default().unwrap_or(443);
    let lookup = tokio::time::timeout(DNS_TIMEOUT, tokio::net::lookup_host((host.as_str(), port)))
        .await
        .map_err(|_| ClipError::new("TIMEOUT", "域名解析超时，请稍后重试。"))?
        .map_err(|error| ClipError::new("NETWORK", format!("域名解析失败：{error}")))?;

    let mut addresses = Vec::new();
    for address in lookup {
        if is_blocked_ip(address.ip()) {
            return Err(ClipError::new(
                "UNSAFE_URL",
                "这个域名解析到了本机或内网地址，已拒绝抓取。",
            ));
        }
        addresses.push(address);
    }
    if addresses.is_empty() {
        return Err(ClipError::new("NETWORK", "域名没有解析到可用的地址。"));
    }
    Ok(addresses)
}

fn is_blocked_host_name(host: &str) -> bool {
    host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host.ends_with(".lan")
        || host.ends_with(".home")
}

fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_blocked_ipv4(ip),
        IpAddr::V6(ip) => is_blocked_ipv6(ip),
    }
}

fn is_blocked_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_multicast()
        || ip.is_broadcast()
        || a == 0
        || (a == 100 && (64..=127).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 198 && (b == 18 || b == 19))
        || a >= 240
}

fn is_blocked_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return is_blocked_ipv4(mapped);
    }
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || ip.is_unique_local()
        || ip.is_unicast_link_local()
}

async fn read_limited_body(mut response: reqwest::Response) -> Result<Vec<u8>, ClipError> {
    if let Some(length) = response.content_length() {
        if length > MAX_BYTES as u64 {
            return Err(ClipError::new(
                "TOO_LARGE",
                "页面超过 5MB，暂时不支持剪藏。",
            ));
        }
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(map_reqwest_error)? {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err(ClipError::new(
                "TOO_LARGE",
                "页面超过 5MB，暂时不支持剪藏。",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn is_html_content_type(value: &str) -> bool {
    let mime = value
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    mime == "text/html" || mime == "application/xhtml+xml"
}

fn charset_from_content_type(value: &str) -> Option<String> {
    for part in value.split(';').skip(1) {
        let Some((key, raw_value)) = part.split_once('=') else {
            continue;
        };
        if key.trim().eq_ignore_ascii_case("charset") {
            let label = raw_value.trim().trim_matches('"').trim_matches('\'');
            if !label.is_empty() {
                return Some(label.to_string());
            }
        }
    }
    None
}

fn charset_from_html(bytes: &[u8]) -> Option<String> {
    let sample_len = bytes.len().min(8192);
    let sample = String::from_utf8_lossy(&bytes[..sample_len]).to_ascii_lowercase();
    let mut cursor = 0;

    while let Some(relative) = sample[cursor..].find("<meta") {
        let start = cursor + relative;
        let end = sample[start..]
            .find('>')
            .map(|offset| start + offset)
            .unwrap_or(sample.len());
        let tag = &sample[start..end];
        if let Some(charset_pos) = tag.find("charset=") {
            let rest = &tag[charset_pos + "charset=".len()..];
            let rest = rest.trim_start_matches(|character: char| {
                matches!(character, '"' | '\'' | ' ' | ':')
            });
            let end = rest
                .find(|character: char| {
                    character == '"'
                        || character == '\''
                        || character == ';'
                        || character == '>'
                        || character.is_whitespace()
                })
                .unwrap_or(rest.len());
            let label = rest[..end].trim();
            if !label.is_empty() {
                return Some(label.to_string());
            }
        }
        cursor = end.saturating_add(1);
        if cursor >= sample.len() {
            break;
        }
    }
    None
}

fn decode_html(bytes: &[u8], header_charset: Option<&str>) -> (String, String) {
    if let Some((encoding, _)) = Encoding::for_bom(bytes) {
        let (text, _, _) = encoding.decode(bytes);
        return (text.into_owned(), encoding.name().to_string());
    }

    let label = header_charset
        .map(str::to_string)
        .or_else(|| charset_from_html(bytes));
    let encoding = label
        .as_deref()
        .and_then(|value| Encoding::for_label(value.as_bytes()))
        .unwrap_or(UTF_8);
    let (text, _, _) = encoding.decode(bytes);
    (text.into_owned(), encoding.name().to_string())
}

fn map_reqwest_error(error: reqwest::Error) -> ClipError {
    if error.is_timeout() {
        ClipError::new("TIMEOUT", "抓取超时（20 秒）。请检查网络，或稍后重试。")
    } else if error.is_connect() || error.is_request() {
        ClipError::new("NETWORK", "网络连接失败。请检查网络或稍后重试。")
    } else {
        ClipError::new("FETCH_FAILED", format!("抓取页面失败：{error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gbk(value: &str) -> Vec<u8> {
        let (encoded, _, _) = encoding_rs::GBK.encode(value);
        encoded.into_owned()
    }

    #[test]
    fn decodes_gbk_from_meta_charset() {
        let bytes = gbk("<html><head><meta charset=\"gbk\"></head><body>中文内容</body></html>");
        let (html, charset) = decode_html(&bytes, None);
        assert!(charset.eq_ignore_ascii_case("gbk"));
        assert!(html.contains("中文内容"));
    }

    #[test]
    fn header_charset_wins_over_meta() {
        let bytes = gbk("<html><head><meta charset=\"gbk\"></head><body>中文内容</body></html>");
        let (html, charset) = decode_html(&bytes, Some("gb18030"));
        assert!(charset.eq_ignore_ascii_case("gb18030"));
        assert!(html.contains("中文内容"));
    }

    #[test]
    fn blocks_local_and_private_hosts() {
        for value in [
            "127.0.0.1",
            "10.0.0.1",
            "192.168.1.1",
            "172.16.0.1",
            "169.254.1.1",
            "::1",
            "fc00::1",
            "fe80::1",
        ] {
            assert!(is_blocked_ip(value.parse().unwrap()), "{value}");
        }
        for value in ["localhost", "foo.localhost", "printer.local", "x.internal"] {
            assert!(is_blocked_host_name(value), "{value}");
        }
        assert!(!is_blocked_ip("8.8.8.8".parse().unwrap()));
        assert!(!is_blocked_host_name("example.com"));
    }

    #[test]
    fn rejects_non_http_urls() {
        let error = parse_clip_url("file:///C:/secret.txt").unwrap_err();
        assert_eq!(error.code, "UNSAFE_URL");
        let error = parse_clip_url("ftp://example.com/article").unwrap_err();
        assert_eq!(error.code, "UNSAFE_URL");
        assert!(parse_clip_url("https://example.com/article").is_ok());
    }

    #[tokio::test]
    async fn rejects_non_http_redirect_targets() {
        let error = validate_public_url(&Url::parse("file:///C:/secret.txt").unwrap())
            .await
            .unwrap_err();
        assert_eq!(error.code, "UNSAFE_URL");

        let addresses = validate_public_url(&Url::parse("https://8.8.8.8/").unwrap())
            .await
            .unwrap();
        assert!(addresses.is_empty());
    }
}
