import os
import re
from pathlib import Path

# 需要检查的组件列表（从 components 目录）
components_to_check = [
    'IconPicker',
    'ErrorDisplay',  # 有 common/ErrorDisplay
    'ErrorBoundary',  # 有 common/ErrorBoundary
    'TokenCounter',  # 有 common/TokenCounter 和 features 版本
    'LanguageSelector',  # 有 common/LanguageSelector
    'UpdateBadge',  # 有 common/UpdateBadge
]

print("\n=== 检查可能未使用的组件 ===\n")

for component in components_to_check:
    # 搜索导入语句
    count = 0
    files_using = []
    
    for root, _, files in os.walk('src'):
        for f in files:
            if f.endswith(('.tsx', '.ts')):
                filepath = os.path.join(root, f)
                # 跳过组件定义文件本身
                if component in f:
                    continue
                    
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
                        content = file.read()
                        # 检查导入或使用
                        if re.search(rf'\b{component}\b', content):
                            count += 1
                            rel_path = filepath.replace('src\\', '').replace('src/', '').replace('\\', '/')
                            files_using.append(rel_path)
                except:
                    pass
    
    status = "[USED]" if count > 0 else "[UNUSED]"
    print(f"{component}: {status} ({count} refs)")
    if count > 0 and count <= 3:
        for f in files_using[:3]:
            print(f"  - {f}")

# 检查 lib 目录下可能未使用的文件
print("\n\n=== 检查 lib 目录 ===\n")

lib_files = []
for f in os.listdir('src/lib'):
    if f.endswith(('.ts', '.tsx')) and f != 'api.ts':
        lib_files.append(f[:-3] if f.endswith('.ts') else f[:-4])

for lib_file in sorted(lib_files)[:15]:  # 只检查前15个
    count = 0
    for root, _, files in os.walk('src'):
        for f in files:
            if f.endswith(('.tsx', '.ts')):
                filepath = os.path.join(root, f)
                if lib_file in os.path.basename(filepath):
                    continue
                    
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
                        content = file.read()
                        if lib_file in content:
                            count += 1
                except:
                    pass
    
    if count == 0:
        print(f"[UNUSED] {lib_file}")
    elif count <= 2:
        print(f"[LOW-USE] {lib_file}: {count} times")
