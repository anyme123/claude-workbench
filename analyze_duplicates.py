import os
import json
from pathlib import Path
from collections import defaultdict

# 分析重复文件
files_dict = defaultdict(list)
for root, _, files in os.walk('src'):
    for f in files:
        if f.endswith(('.tsx', '.ts')) and not f.startswith('index.'):
            full_path = os.path.join(root, f)
            rel_path = full_path.replace('src\\', '').replace('src/', '').replace('\\', '/')
            files_dict[f].append(rel_path)

# 找出重复的文件
duplicates = {name: paths for name, paths in files_dict.items() if len(paths) > 1}

print("\n=== 重复文件分析 ===\n")
print(f"总共发现 {len(duplicates)} 个重复文件名\n")

for name, paths in sorted(duplicates.items()):
    print(f"\n{name}: {len(paths)} 个副本")
    for path in sorted(paths):
        print(f"  - {path}")

print(f"\n\n总计：{len(duplicates)} 个重复文件名，共 {sum(len(paths) for paths in duplicates.values())} 个文件副本")
