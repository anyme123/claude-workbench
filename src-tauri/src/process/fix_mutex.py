import sys

# 读取文件
with open('registry.rs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 定位函数开始行（第 625 行，索引 624）
# 修改策略：重写第 629-640 行

# 新的代码块
new_block = '''        // First, collect all process IDs (lock released immediately)
        let run_ids: Vec<i64> = {
            let processes = processes_lock.lock().map_err(|e| e.to_string())?;
            processes.keys().cloned().collect()
        }; // ✅ Lock is released here, before any await points

        // Then check each process (no lock held during async operations)
        for run_id in run_ids {
            if !self.is_process_running(run_id).await? {
                finished_runs.push(run_id);
            }
        }

'''

# 替换第 629-640 行（索引 628-639）
output_lines = lines[:628]  # 保留前 628 行
output_lines.append(new_block)
output_lines.extend(lines[640:])  # 保留第 641 行之后的内容

# 写回文件
with open('registry.rs', 'w', encoding='utf-8') as f:
    f.writelines(output_lines)

print('Successfully fixed Mutex deadlock issue')
