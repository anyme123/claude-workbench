#!/bin/bash
# Codex 集成诊断脚本
# 用于快速检测 Codex 集成是否正常工作

echo "======================================"
echo "  Codex 集成诊断工具"
echo "======================================"
echo ""

# 1. 检查 Codex CLI
echo "📋 Step 1: 检查 Codex CLI 安装"
echo "-------------------------------------"
if command -v codex &> /dev/null; then
    CODEX_VERSION=$(codex --version 2>&1)
    echo "✅ Codex CLI 已安装"
    echo "   版本: $CODEX_VERSION"
else
    echo "❌ Codex CLI 未找到"
    echo "   请运行: npm install -g @openai/codex"
    exit 1
fi
echo ""

# 2. 检查 Codex API Key
echo "📋 Step 2: 检查 API 密钥"
echo "-------------------------------------"
if [ -n "$CODEX_API_KEY" ]; then
    MASKED_KEY="${CODEX_API_KEY:0:7}...${CODEX_API_KEY: -4}"
    echo "✅ CODEX_API_KEY 已设置"
    echo "   值: $MASKED_KEY"
else
    echo "⚠️  CODEX_API_KEY 未设置"
    echo "   可选设置: export CODEX_API_KEY=sk-..."
fi
echo ""

# 3. 测试 Codex 执行
echo "📋 Step 3: 测试 Codex 基本执行"
echo "-------------------------------------"
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR" || exit 1
git init -q

echo "测试命令: codex exec \"list files\" --json --skip-git-repo-check"
if codex exec "list files" --json --skip-git-repo-check 2>&1 | head -5; then
    echo "✅ Codex 执行成功"
else
    echo "❌ Codex 执行失败"
fi
cd - > /dev/null
rm -rf "$TEMP_DIR"
echo ""

# 4. 检查 Tauri 编译状态
echo "📋 Step 4: 检查 Tauri 编译状态"
echo "-------------------------------------"
if [ -f "src-tauri/target/debug/claude-workbench.exe" ] || [ -f "src-tauri/target/debug/claude-workbench" ]; then
    echo "✅ Tauri Debug 版本已编译"
    echo "   位置: src-tauri/target/debug/"
else
    echo "⚠️  Tauri Debug 版本未找到"
    echo "   需要运行: cd src-tauri && cargo build"
fi
echo ""

# 5. 检查 Codex 命令文件
echo "📋 Step 5: 检查集成文件"
echo "-------------------------------------"
FILES=(
    "src/types/codex.ts"
    "src/lib/codexConverter.ts"
    "src/components/ExecutionEngineSelector.tsx"
    "src-tauri/src/commands/codex.rs"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file (缺失)"
    fi
done
echo ""

# 总结
echo "======================================"
echo "  诊断完成"
echo "======================================"
echo ""
echo "🎯 下一步:"
echo "   1. 如果 Codex CLI 可用,重新编译 Tauri:"
echo "      npm run tauri build -- --debug"
echo ""
echo "   2. 启动应用并检查控制台:"
echo "      npm run tauri dev"
echo ""
echo "   3. 打开浏览器 DevTools (F12) 查看日志"
echo ""
