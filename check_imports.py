import os
import re
from pathlib import Path
from collections import defaultdict

# 统计导入语句中的路径使用情况
components_imports = defaultdict(int)
features_imports = defaultdict(int)

# 正则表达式匹配导入语句
import_pattern = re.compile(r'from\s+["\']@/(components|features)/([^"\']+)["\']')

# 扫描所有 tsx/ts 文件
for root, _, files in os.walk('src'):
    for f in files:
        if f.endswith(('.tsx', '.ts')):
            filepath = os.path.join(root, f)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
                    content = file.read()
                    matches = import_pattern.findall(content)
                    for match in matches:
                        folder, path = match
                        if folder == 'components':
                            components_imports[path.split('/')[0]] += 1
                        elif folder == 'features':
                            features_imports[path] += 1
            except Exception as e:
                print(f"Error reading {filepath}: {e}")

print("\n=== 导入路径使用统计 ===\n")
print(f"从 @/components/ 导入: {sum(components_imports.values())} 次")
print(f"从 @/features/ 导入: {sum(features_imports.values())} 次")

print("\n--- 最常用的 @/components 导入（前 20 个）---")
for name, count in sorted(components_imports.items(), key=lambda x: x[1], reverse=True)[:20]:
    print(f"  {name}: {count} 次")

print("\n--- 最常用的 @/features 导入（前 20 个）---")
for name, count in sorted(features_imports.items(), key=lambda x: x[1], reverse=True)[:20]:
    print(f"  {name}: {count} 次")
