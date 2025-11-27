//! API URL 规范化工具模块
//!
//! 提供智能 URL 识别与自动补全功能，支持 OpenAI 和 Anthropic 两种 API 格式。

use log::debug;

/// API 端点类型
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ApiEndpointType {
    /// OpenAI 兼容格式 - 使用 /v1/chat/completions 端点
    OpenAI,
    /// Anthropic 格式 - 使用 /v1/messages 端点
    Anthropic,
}

/// 已知的 API 端点后缀
const OPENAI_COMPLETIONS_SUFFIX: &str = "/chat/completions";
const OPENAI_V1_COMPLETIONS_SUFFIX: &str = "/v1/chat/completions";
const ANTHROPIC_MESSAGES_SUFFIX: &str = "/messages";
const ANTHROPIC_V1_MESSAGES_SUFFIX: &str = "/v1/messages";
const V1_SUFFIX: &str = "/v1";

/// 需要移除的所有已知端点后缀（用于提取基础 URL）
const ALL_ENDPOINT_SUFFIXES: &[&str] = &[
    OPENAI_V1_COMPLETIONS_SUFFIX,
    OPENAI_COMPLETIONS_SUFFIX,
    ANTHROPIC_V1_MESSAGES_SUFFIX,
    ANTHROPIC_MESSAGES_SUFFIX,
    V1_SUFFIX,
];

/// 规范化 API URL，根据端点类型自动补全路径
///
/// # 参数
/// - `base_url`: 用户输入的 API 基础 URL
/// - `endpoint_type`: API 端点类型（OpenAI 或 Anthropic）
///
/// # 返回
/// 规范化后的完整 API URL
///
/// # 示例
/// ```
/// use crate::commands::url_utils::{normalize_api_url, ApiEndpointType};
///
/// // OpenAI 格式
/// assert_eq!(
///     normalize_api_url("http://localhost:3001", ApiEndpointType::OpenAI),
///     "http://localhost:3001/v1/chat/completions"
/// );
/// assert_eq!(
///     normalize_api_url("http://localhost:3001/v1", ApiEndpointType::OpenAI),
///     "http://localhost:3001/v1/chat/completions"
/// );
/// assert_eq!(
///     normalize_api_url("http://localhost:3001/v1/chat/completions", ApiEndpointType::OpenAI),
///     "http://localhost:3001/v1/chat/completions"
/// );
///
/// // Anthropic 格式
/// assert_eq!(
///     normalize_api_url("http://localhost:3001", ApiEndpointType::Anthropic),
///     "http://localhost:3001/v1/messages"
/// );
/// ```
pub fn normalize_api_url(base_url: &str, endpoint_type: ApiEndpointType) -> String {
    let url = base_url.trim().trim_end_matches('/');

    match endpoint_type {
        ApiEndpointType::OpenAI => normalize_openai_url(url),
        ApiEndpointType::Anthropic => normalize_anthropic_url(url),
    }
}

/// 规范化 OpenAI 兼容格式的 URL
fn normalize_openai_url(url: &str) -> String {
    // 检查是否已经包含完整路径
    if url.ends_with(OPENAI_COMPLETIONS_SUFFIX) {
        debug!("OpenAI URL already contains /chat/completions: {}", url);
        return url.to_string();
    }

    // 检查是否只包含 /v1
    if url.ends_with(V1_SUFFIX) {
        let result = format!("{}{}", url, OPENAI_COMPLETIONS_SUFFIX);
        debug!(
            "OpenAI URL with /v1, appending /chat/completions: {}",
            result
        );
        return result;
    }

    // 提取基础 URL 并添加完整路径
    let base = extract_base_url(url);
    let result = format!("{}{}", base, OPENAI_V1_COMPLETIONS_SUFFIX);
    debug!("OpenAI URL normalized from '{}' to '{}'", url, result);
    result
}

/// 规范化 Anthropic 格式的 URL
fn normalize_anthropic_url(url: &str) -> String {
    // 检查是否已经包含完整路径
    if url.ends_with(ANTHROPIC_MESSAGES_SUFFIX) {
        debug!("Anthropic URL already contains /messages: {}", url);
        return url.to_string();
    }

    // 检查是否只包含 /v1
    if url.ends_with(V1_SUFFIX) {
        let result = format!("{}{}", url, ANTHROPIC_MESSAGES_SUFFIX);
        debug!("Anthropic URL with /v1, appending /messages: {}", result);
        return result;
    }

    // 提取基础 URL 并添加完整路径
    let base = extract_base_url(url);
    let result = format!("{}{}", base, ANTHROPIC_V1_MESSAGES_SUFFIX);
    debug!("Anthropic URL normalized from '{}' to '{}'", url, result);
    result
}

/// 提取基础 URL（移除所有已知的端点后缀）
///
/// # 参数
/// - `url`: 输入的 URL
///
/// # 返回
/// 移除端点后缀后的基础 URL
fn extract_base_url(url: &str) -> String {
    let url = url.trim().trim_end_matches('/');

    for suffix in ALL_ENDPOINT_SUFFIXES {
        if let Some(base) = url.strip_suffix(suffix) {
            debug!("Extracted base URL: '{}' from '{}'", base, url);
            return base.to_string();
        }
    }

    url.to_string()
}

/// 规范化基础 URL（用于存储配置）
///
/// 移除所有已知的端点后缀，只保留基础 URL。
/// 这对于存储用户配置很有用，因为端点路径可以在运行时动态添加。
///
/// # 参数
/// - `base_url`: 用户输入的 URL
///
/// # 返回
/// 移除端点后缀后的基础 URL
///
/// # 示例
/// ```
/// use crate::commands::url_utils::normalize_base_url;
///
/// assert_eq!(
///     normalize_base_url("http://localhost:3001/v1/chat/completions"),
///     "http://localhost:3001"
/// );
/// assert_eq!(
///     normalize_base_url("http://localhost:3001/v1/messages"),
///     "http://localhost:3001"
/// );
/// assert_eq!(
///     normalize_base_url("http://localhost:3001/v1"),
///     "http://localhost:3001"
/// );
/// ```
pub fn normalize_base_url(base_url: &str) -> String {
    extract_base_url(base_url)
}

/// 检测 URL 是否需要规范化
///
/// 判断给定的 URL 是否已经是规范化的完整端点 URL
#[allow(dead_code)]
pub fn needs_normalization(url: &str, endpoint_type: ApiEndpointType) -> bool {
    let url = url.trim().trim_end_matches('/');

    match endpoint_type {
        ApiEndpointType::OpenAI => !url.ends_with(OPENAI_COMPLETIONS_SUFFIX),
        ApiEndpointType::Anthropic => !url.ends_with(ANTHROPIC_MESSAGES_SUFFIX),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_openai_url_bare() {
        assert_eq!(
            normalize_api_url("http://localhost:3001", ApiEndpointType::OpenAI),
            "http://localhost:3001/v1/chat/completions"
        );
    }

    #[test]
    fn test_normalize_openai_url_with_trailing_slash() {
        assert_eq!(
            normalize_api_url("http://localhost:3001/", ApiEndpointType::OpenAI),
            "http://localhost:3001/v1/chat/completions"
        );
    }

    #[test]
    fn test_normalize_openai_url_with_v1() {
        assert_eq!(
            normalize_api_url("http://localhost:3001/v1", ApiEndpointType::OpenAI),
            "http://localhost:3001/v1/chat/completions"
        );
    }

    #[test]
    fn test_normalize_openai_url_already_complete() {
        assert_eq!(
            normalize_api_url(
                "http://localhost:3001/v1/chat/completions",
                ApiEndpointType::OpenAI
            ),
            "http://localhost:3001/v1/chat/completions"
        );
    }

    #[test]
    fn test_normalize_anthropic_url_bare() {
        assert_eq!(
            normalize_api_url("http://localhost:3001", ApiEndpointType::Anthropic),
            "http://localhost:3001/v1/messages"
        );
    }

    #[test]
    fn test_normalize_anthropic_url_with_v1() {
        assert_eq!(
            normalize_api_url("http://localhost:3001/v1", ApiEndpointType::Anthropic),
            "http://localhost:3001/v1/messages"
        );
    }

    #[test]
    fn test_normalize_anthropic_url_already_complete() {
        assert_eq!(
            normalize_api_url(
                "http://localhost:3001/v1/messages",
                ApiEndpointType::Anthropic
            ),
            "http://localhost:3001/v1/messages"
        );
    }

    #[test]
    fn test_normalize_base_url_from_openai() {
        assert_eq!(
            normalize_base_url("http://localhost:3001/v1/chat/completions"),
            "http://localhost:3001"
        );
    }

    #[test]
    fn test_normalize_base_url_from_anthropic() {
        assert_eq!(
            normalize_base_url("http://localhost:3001/v1/messages"),
            "http://localhost:3001"
        );
    }

    #[test]
    fn test_normalize_base_url_from_v1() {
        assert_eq!(
            normalize_base_url("http://localhost:3001/v1"),
            "http://localhost:3001"
        );
    }

    #[test]
    fn test_normalize_base_url_already_bare() {
        assert_eq!(
            normalize_base_url("http://localhost:3001"),
            "http://localhost:3001"
        );
    }

    #[test]
    fn test_real_world_urls() {
        // SiliconFlow
        assert_eq!(
            normalize_api_url("https://api.siliconflow.cn/v1", ApiEndpointType::OpenAI),
            "https://api.siliconflow.cn/v1/chat/completions"
        );

        // Anthropic 官方
        assert_eq!(
            normalize_api_url("https://api.anthropic.com", ApiEndpointType::Anthropic),
            "https://api.anthropic.com/v1/messages"
        );

        // OpenRouter
        assert_eq!(
            normalize_api_url("https://openrouter.ai/api/v1", ApiEndpointType::OpenAI),
            "https://openrouter.ai/api/v1/chat/completions"
        );

        // 本地代理
        assert_eq!(
            normalize_api_url("http://127.0.0.1:8080", ApiEndpointType::Anthropic),
            "http://127.0.0.1:8080/v1/messages"
        );
    }

    #[test]
    fn test_needs_normalization() {
        assert!(needs_normalization(
            "http://localhost:3001",
            ApiEndpointType::OpenAI
        ));
        assert!(needs_normalization(
            "http://localhost:3001/v1",
            ApiEndpointType::OpenAI
        ));
        assert!(!needs_normalization(
            "http://localhost:3001/v1/chat/completions",
            ApiEndpointType::OpenAI
        ));

        assert!(needs_normalization(
            "http://localhost:3001",
            ApiEndpointType::Anthropic
        ));
        assert!(needs_normalization(
            "http://localhost:3001/v1",
            ApiEndpointType::Anthropic
        ));
        assert!(!needs_normalization(
            "http://localhost:3001/v1/messages",
            ApiEndpointType::Anthropic
        ));
    }
}
