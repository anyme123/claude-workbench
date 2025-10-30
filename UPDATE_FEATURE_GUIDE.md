# 版本更新通知功能使用指南

## ✨ 功能概览

Claude Workbench 现已集成自动版本更新检查和通知功能，用户可以：
- ✅ 自动检查新版本
- ✅ 查看更新说明
- ✅ 一键下载安装
- ✅ 自动重启应用

---

## 🎯 功能特性

### 1. 自动检查更新
- 应用启动2秒后自动检查新版本
- 不影响启动速度
- 静默失败，不打扰用户

### 2. 更新徽章
- 顶部栏显示蓝色更新徽章
- 显示最新版本号
- 可点击查看详情
- 可关闭提醒（记住当前版本）

### 3. 更新对话框
- 显示当前版本和最新版本
- 展示更新说明
- 实时下载进度
- 一键安装和重启

### 4. 智能提醒
- 关闭提醒后，同版本不再显示
- 有更新版本时重新提醒
- 支持手动检查更新

---

## 🖥️ 用户界面

### 更新徽章（Topbar右侧）
```
┌─────────────────┐
│ 📥 v4.0.10  ✕  │  ← 蓝色徽章
└─────────────────┘
```

**交互**:
- **点击徽章**: 打开更新对话框
- **点击 ✕**: 关闭提醒（此版本不再显示）

### 更新对话框
```
┌────────────────────────────────┐
│ 📥 发现新版本              ✕  │
├────────────────────────────────┤
│ 当前版本: v4.0.9              │
│ 最新版本: v4.0.10             │
│                                │
│ 更新内容:                      │
│ ┌──────────────────────────┐  │
│ │ - 修复进程泄漏问题       │  │
│ │ - 添加自动更新功能       │  │
│ │ - 性能优化              │  │
│ └──────────────────────────┘  │
│                                │
│ [下载进度: 65%]                │
│ ████████████░░░░░░░░           │
├────────────────────────────────┤
│          [稍后提醒] [立即更新] │
└────────────────────────────────┘
```

**操作流程**:
1. 点击"立即更新"
2. 显示下载进度
3. 下载完成后显示"立即重启"按钮
4. 点击重启，应用自动更新并重启

---

## 🛠️ 技术实现

### 架构组件

```
UpdateProvider (Context)
    ├── UpdateContext.tsx - 状态管理
    ├── updater.ts - 核心逻辑
    └── Components
        ├── UpdateBadge.tsx - 徽章UI
        └── UpdateDialog.tsx - 对话框UI
```

### 工作流程

```
应用启动
    ↓
延迟2秒
    ↓
checkForUpdate()
    ↓
调用 Tauri updater 插件
    ↓
检查 GitHub Releases
    ↓
有新版本？
    ├─ 是 → 显示徽章
    └─ 否 → 静默
```

### 数据流

```
UpdateContext
    ↓
提供状态和方法
    ↓
UpdateBadge 和 UpdateDialog 消费
    ↓
用户交互
    ↓
更新状态
    ↓
触发下载/安装
```

---

## ⚙️ 配置说明

### tauri.conf.json

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/anyme123/claude-workbench/releases/latest/download/latest.json"
      ],
      "dialog": false,
      "pubkey": "your-public-key"
    }
  }
}
```

**配置项说明**:
- `active`: 启用更新器
- `endpoints`: 更新检查URL（指向GitHub Releases）
- `dialog`: false（使用自定义UI）
- `pubkey`: 签名公钥（用于验证更新包）

---

## 📦 发布新版本流程

### 1. 更新版本号

```bash
# 更新 package.json
"version": "4.0.11"

# 更新 src-tauri/Cargo.toml
version = "4.0.11"

# 更新 src-tauri/tauri.conf.json
"version": "4.0.11"
```

### 2. 创建更新说明

创建 `CHANGELOG_v4.0.11.md`:
```markdown
# v4.0.11 更新日志

## 新增功能
- 功能1
- 功能2

## 修复
- Bug修复1
- Bug修复2
```

### 3. 构建发布包

```bash
# 构建所有平台
npm run tauri build

# 或单独构建
npm run tauri build -- --target x86_64-pc-windows-msvc
npm run tauri build -- --target aarch64-apple-darwin
```

### 4. 创建 latest.json

在发布时，需要创建 `latest.json` 文件：

```json
{
  "version": "4.0.11",
  "notes": "- 修复进程泄漏问题\n- 添加自动更新功能\n- 性能优化",
  "pub_date": "2025-10-29T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "签名字符串",
      "url": "https://github.com/anyme123/claude-workbench/releases/download/v4.0.11/claude-workbench_4.0.11_x64-setup.nsis.zip"
    },
    "darwin-x86_64": {
      "signature": "签名字符串",
      "url": "https://github.com/anyme123/claude-workbench/releases/download/v4.0.11/claude-workbench_4.0.11_x64.dmg.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "签名字符串",
      "url": "https://github.com/anyme123/claude-workbench/releases/download/v4.0.11/claude-workbench_4.0.11_aarch64.dmg.tar.gz"
    }
  }
}
```

### 5. 创建 GitHub Release

```bash
# 提交代码
git add .
git commit -m "chore: bump version to 4.0.11"
git tag -a v4.0.11 -m "Release v4.0.11"
git push origin main
git push origin v4.0.11
```

### 6. 上传到 GitHub Releases

在 GitHub 上创建新 Release：
1. 上传构建的安装包
2. 上传 `latest.json`
3. 复制 CHANGELOG 到 Release Notes

---

## 🔐 签名配置

### 生成密钥对（首次）

```bash
# 安装 Tauri CLI
npm install -g @tauri-apps/cli

# 生成密钥对
tauri signer generate -w ~/.tauri/myapp.key

# 输出
Private key: ~/.tauri/myapp.key
Public key: dW50cnVzdGVkIGNvbW1lbnQ6...
```

### 签名更新包

```bash
# 签名
tauri signer sign <update-file> -k ~/.tauri/myapp.key
```

更新包会生成对应的 `.sig` 文件。

---

## 🧪 测试

### 本地测试

1. **模拟旧版本**:
   ```json
   // tauri.conf.json
   "version": "4.0.9"
   ```

2. **创建测试 latest.json**:
   ```json
   {
     "version": "4.0.10",
     "notes": "测试更新",
     "pub_date": "2025-10-29T12:00:00Z"
   }
   ```

3. **运行应用**:
   ```bash
   npm run tauri dev
   ```

4. **验证**:
   - 2秒后应该显示更新徽章
   - 点击查看详情
   - 测试关闭提醒功能

### 生产测试

1. 构建旧版本并安装
2. 发布新版本到 GitHub
3. 打开应用，等待更新提醒
4. 测试完整更新流程

---

## 🎨 自定义

### 修改检查间隔

编辑 `src/contexts/UpdateContext.tsx`:

```typescript
// 修改启动检查延迟（默认2秒）
setTimeout(() => {
  checkUpdate().catch(console.error);
}, 5000); // 改为5秒

// 或添加定期检查
useEffect(() => {
  const interval = setInterval(() => {
    checkUpdate();
  }, 3600000); // 每小时检查一次

  return () => clearInterval(interval);
}, []);
```

### 修改徽章样式

编辑 `src/components/UpdateBadge.tsx`:

```typescript
className={`
  flex items-center gap-1.5 px-2.5 py-1
  bg-green-50 dark:bg-green-900  // 改为绿色
  border border-green-200 dark:border-green-700
  ...
`}
```

### 修改对话框文案

编辑 `src/components/UpdateDialog.tsx`，修改相应的文本。

---

## 📊 LocalStorage 键

应用使用以下 localStorage 键：

- `claudeworkbench:update:dismissedVersion` - 已关闭提醒的版本号

**清除示例**:
```javascript
// 在浏览器控制台
localStorage.removeItem('claudeworkbench:update:dismissedVersion');
```

---

## 🐛 故障排除

### 问题1: 更新检查失败

**原因**:
- 网络问题
- GitHub API限流
- 配置错误

**解决**:
```typescript
// 查看控制台错误
// 检查 endpoints URL 是否正确
// 确认网络连接
```

### 问题2: 更新徽章不显示

**检查**:
1. 是否有新版本发布？
2. latest.json 格式是否正确？
3. 是否关闭了该版本的提醒？

**调试**:
```javascript
// 控制台查看状态
const ctx = useUpdate();
console.log(ctx);
```

### 问题3: 下载失败

**原因**:
- 网络问题
- 签名验证失败
- URL错误

**解决**:
- 检查 latest.json 中的 URL
- 验证签名是否正确
- 查看应用日志

---

## 📝 API 参考

### UpdateContext

```typescript
interface UpdateContextValue {
  hasUpdate: boolean;              // 是否有更新
  updateInfo: UpdateInfo | null;   // 更新信息
  updateHandle: UpdateHandle | null; // 更新句柄
  isChecking: boolean;             // 是否正在检查
  error: string | null;            // 错误信息
  isDismissed: boolean;            // 是否已关闭提醒
  
  dismissUpdate: () => void;       // 关闭提醒
  checkUpdate: () => Promise<boolean>; // 手动检查
  resetDismiss: () => void;        // 重置关闭状态
}
```

### useUpdate Hook

```typescript
import { useUpdate } from '@/contexts/UpdateContext';

function MyComponent() {
  const { hasUpdate, updateInfo, checkUpdate } = useUpdate();
  
  // 使用状态和方法
}
```

---

## 🚀 最佳实践

### 1. 版本号规范

使用语义化版本：`MAJOR.MINOR.PATCH`

- **MAJOR**: 重大变更，不兼容的API修改
- **MINOR**: 新增功能，向后兼容
- **PATCH**: Bug修复，向后兼容

### 2. 发布周期

- **紧急修复**: 立即发布（PATCH）
- **常规更新**: 每1-2周（MINOR）
- **重大更新**: 每季度（MAJOR）

### 3. 更新说明

编写清晰的更新说明：
```markdown
## v4.0.11 更新日志

### 🆕 新增功能
- 功能描述

### 🐛 修复
- 问题描述

### ⚡ 性能优化
- 优化描述

### ⚠️ 破坏性变更
- 变更说明
```

---

## 📂 文件结构

```
claude-workbench/
├── src/
│   ├── contexts/
│   │   └── UpdateContext.tsx       ← 更新上下文
│   ├── components/
│   │   ├── UpdateBadge.tsx         ← 更新徽章
│   │   └── UpdateDialog.tsx        ← 更新对话框
│   ├── lib/
│   │   └── updater.ts              ← 核心逻辑
│   └── App.tsx                     ← 集成点
├── src-tauri/
│   ├── tauri.conf.json             ← 更新器配置
│   └── src/
│       └── main.rs                 ← 注册插件
└── UPDATE_FEATURE_GUIDE.md         ← 本文档
```

---

## 🔄 更新流程图

```
┌─────────────┐
│  应用启动   │
└──────┬──────┘
       ↓
┌─────────────┐
│  延迟2秒    │
└──────┬──────┘
       ↓
┌─────────────┐
│ 检查更新    │
└──────┬──────┘
       ↓
    有新版本?
    ├─ 是 ──→ ┌──────────────┐
    │         │ 显示更新徽章  │
    │         └──────┬───────┘
    │                ↓
    │         用户点击徽章
    │                ↓
    │         ┌──────────────┐
    │         │ 显示对话框   │
    │         └──────┬───────┘
    │                ↓
    │         用户点击"立即更新"
    │                ↓
    │         ┌──────────────┐
    │         │ 下载更新     │
    │         └──────┬───────┘
    │                ↓
    │         ┌──────────────┐
    │         │ 安装更新     │
    │         └──────┬───────┘
    │                ↓
    │         ┌──────────────┐
    │         │ 重启应用     │
    │         └──────────────┘
    │
    └─ 否 ──→ 静默，无提示
```

---

## 🔍 调试

### 启用详细日志

编辑 `src/contexts/UpdateContext.tsx`:

```typescript
try {
  console.log('[Update] Checking for updates...');
  const result = await checkForUpdate({ timeout: 30000 });
  console.log('[Update] Result:', result);
  // ...
} catch (err) {
  console.error('[Update] Check failed:', err);
}
```

### 查看网络请求

打开开发者工具 → Network 标签，查看对 GitHub 的请求。

### 测试不同场景

```typescript
// 强制显示更新（开发时）
localStorage.removeItem('claudeworkbench:update:dismissedVersion');

// 模拟检查失败
// 断开网络后检查更新
```

---

## 🎯 待办事项

### 首次发布前需要做的：

- [ ] 生成签名密钥对
- [ ] 将公钥添加到 `tauri.conf.json`
- [ ] 配置 GitHub Actions 自动构建
- [ ] 配置 GitHub Actions 自动签名
- [ ] 创建第一个 GitHub Release
- [ ] 上传 `latest.json` 到 Release
- [ ] 测试完整更新流程

### 后续优化：

- [ ] 添加手动检查更新按钮（在设置页面）
- [ ] 支持更新渠道（stable/beta）
- [ ] 显示下载速度和预计时间
- [ ] 支持后台下载
- [ ] 添加更新历史记录

---

## 📚 相关资源

- [Tauri Updater 文档](https://tauri.app/v1/guides/distribution/updater)
- [Tauri Signer 文档](https://tauri.app/v1/guides/distribution/sign-artifacts)
- [GitHub Releases API](https://docs.github.com/en/rest/releases)

---

## ✅ 检查清单

在启用此功能前，确保：

- [x] ✅ 代码已实现并测试
- [x] ✅ UpdateProvider 已包裹 App
- [x] ✅ UpdateBadge 已添加到 Topbar
- [x] ✅ UpdateDialog 已集成
- [x] ✅ tauri-plugin-updater 已注册
- [ ] 🔲 签名密钥已生成
- [ ] 🔲 公钥已添加到配置
- [ ] 🔲 GitHub Release 已创建
- [ ] 🔲 latest.json 已上传
- [ ] 🔲 完整流程已测试

---

## 🎉 总结

**版本更新功能已完全实现！**

✅ 自动检查更新  
✅ 美观的更新徽章  
✅ 详细的更新对话框  
✅ 一键下载安装  
✅ 自动重启应用  
✅ 智能提醒管理  

**所有代码都在本地，等待您的推送指令！** 😊

---

**实现时间**: 2025-10-29  
**状态**: ✅ 已完成（本地）  
**待推送**: 等待指令  



