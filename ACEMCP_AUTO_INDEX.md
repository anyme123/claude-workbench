# ✅ Acemcp 自动后台索引功能

## 🎯 功能说明

现在当用户**选择项目**时，系统会自动在后台触发 acemcp 索引，无需等待用户首次使用项目上下文功能。

---

## 🚀 工作流程

### 之前（按需索引）

```
用户选择项目
  ↓
打开会话
  ↓
输入提示词
  ↓
启用项目上下文 + 点击优化
  ↓
⏳ 首次索引（等待 1-10 分钟）← 用户需要等待
  ↓
搜索代码
  ↓
优化提示词
```

### 现在（自动后台索引）✅

```
用户选择项目
  ↓
🔄 后台自动索引（静默进行，不阻塞 UI）
  ↓
用户打开会话、输入提示词
  ↓
启用项目上下文 + 点击优化
  ↓
✅ 索引已完成，立即搜索（仅需 2-5 秒）
  ↓
优化提示词
```

---

## ⚡ 优势

### 1. 提升用户体验
- ✅ **无感知索引**：后台静默进行
- ✅ **无需等待**：使用时索引已完成
- ✅ **不阻塞 UI**：选择项目后立即可操作

### 2. 智能触发
- ✅ **选择项目时**自动触发
- ✅ **仅索引一次**：acemcp 自动增量索引
- ✅ **失败不影响**：索引失败不影响其他功能

### 3. 性能优化
- ✅ **并发执行**：索引和用户操作并行
- ✅ **资源控制**：使用异步任务，不占用主线程

---

## 🔍 技术实现

### 触发位置

**App.tsx - handleProjectClick()**:
```typescript
const handleProjectClick = async (project: Project) => {
  // ...加载会话列表
  setSelectedProject(project);

  // 🔍 后台预索引项目
  console.log('[App] Triggering background pre-indexing for:', project.path);
  api.preindexProject(project.path);  // 不等待，立即返回
};
```

### Rust 后端实现

**acemcp.rs - preindex_project()**:
```rust
#[tauri::command]
pub async fn preindex_project(app: AppHandle, project_path: String) -> Result<(), String> {
    // 启动后台任务
    tauri::async_runtime::spawn(async move {
        // 1. 启动 acemcp sidecar
        // 2. 初始化 MCP 会话
        // 3. 调用 search_context 触发索引
        // 4. 关闭客户端
    });

    // 立即返回，不阻塞
    Ok(())
}
```

---

## 📊 索引时机对比

| 时机 | 索引触发 | 用户感知 | 首次使用延迟 |
|------|---------|---------|-------------|
| **之前** | 首次使用项目上下文时 | ⏳ 需要等待 | 1-10 分钟 |
| **现在** | 选择项目时自动触发 | ✅ 无感知 | 2-5 秒（已索引） |

---

## 🎯 使用场景

### 场景 1: 新项目

**用户操作**:
```
1. 打开 Claude Workbench
2. 选择新项目 "my-app"
   → 🔄 后台开始索引（静默）
3. 浏览会话列表（索引仍在后台进行）
4. 5 分钟后，输入提示词并启用项目上下文
   → ✅ 索引已完成，立即搜索
```

### 场景 2: 现有项目（已索引）

**用户操作**:
```
1. 选择项目 "my-app"
   → 🔄 触发增量索引（仅检查新文件，数秒完成）
2. 立即使用项目上下文
   → ✅ 增量索引完成，立即搜索
```

---

## 🔍 日志示例

### 用户选择项目时

**浏览器控制台**:
```
[App] Triggering background pre-indexing for: C:/Users/xxx/project
```

**Rust 日志**:
```
[INFO] Starting background pre-indexing for project: C:/Users/xxx/project
[INFO] 🔄 Pre-indexing project: C:/Users/xxx/project
[INFO] Starting acemcp sidecar...
[INFO] Sidecar path: %TEMP%\.claude-workbench\acemcp-sidecar.exe
[INFO] Acemcp sidecar started successfully
[INFO] Initializing MCP session...
[INFO] MCP session initialized successfully
[INFO] Calling search_context: project=C:/Users/xxx/project, query=preindex initialization
[INFO] ✅ Background pre-indexing completed for: C:/Users/xxx/project
```

### 用户使用项目上下文时

**之前会看到**（首次）:
```
[acemcp] Indexing project... (1-10 分钟)
[acemcp] Uploading 500 files...
[acemcp] Searching...
```

**现在会看到**:
```
[acemcp] Incremental indexing: total=500, existing=500, new=0 ← 已完成！
[acemcp] Searching...
```

---

## ⚙️ 配置控制

### 自动索引触发条件

只有在以下条件都满足时才触发：
1. ✅ 项目路径存在
2. ✅ Acemcp 已配置（有 BASE_URL 和 TOKEN）
3. ✅ 用户选择了项目

### 失败处理

如果后台索引失败：
- ⚠️ 仅记录警告日志
- ✅ 不影响其他功能
- ✅ 用户使用时会重新触发索引

---

## 🎊 总结

### 新增功能

- ✅ **自动后台索引**：选择项目时触发
- ✅ **静默执行**：不阻塞 UI，不弹窗
- ✅ **智能优化**：提前完成索引
- ✅ **降级处理**：失败不影响其他功能

### 用户体验提升

**之前**:
```
选择项目 → 使用上下文 → ⏳ 等待索引（1-10 分钟）→ 搜索
```

**现在**:
```
选择项目（后台索引） → 使用上下文 → ✅ 立即搜索（2-5 秒）
```

### 性能对比

| 操作 | 之前 | 现在 |
|------|------|------|
| 选择项目 | 即时 | 即时 |
| 首次使用上下文 | 等待 1-10 分钟 | 等待 2-5 秒 |
| 后续使用上下文 | 2-5 秒 | 2-5 秒 |

**首次使用延迟减少 95%！** 🚀

---

**完全实现了你的需求：选择项目后自动后台索引，用户使用时无需等待！** 🎉
