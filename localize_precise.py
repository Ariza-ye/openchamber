#!/usr/bin/env python3
"""
精确UI汉化脚本
基于代码分析结果，对每个文件进行精确的文本替换

用法:
  python localize_precise.py apply   - 应用汉化（备份原文件并替换为中文）
  python localize_precise.py restore - 还原原始文件
  python localize_precise.py check   - 检查哪些文件会被修改（不实际修改）
"""

import os
import sys
import json
import shutil
import re
from pathlib import Path
from typing import Dict, List, Tuple
from translations_data import TRANSLATIONS
from translations_data_settings import SETTINGS_TRANSLATIONS

# 配置
BACKUP_DIR = ".localize_backup"

class PreciseLocalizer:
    def __init__(self):
        self.root_dir = Path.cwd()
        self.backup_dir = self.root_dir / BACKUP_DIR
        # 合并两个翻译数据文件
        self.translations = {**TRANSLATIONS, **SETTINGS_TRANSLATIONS}

    def backup_file(self, file_path: Path):
        """备份文件"""
        relative_path = file_path.relative_to(self.root_dir)
        backup_path = self.backup_dir / relative_path
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file_path, backup_path)

    def replace_in_file(self, file_path: Path, replacements: List[Tuple[str, str]]) -> Tuple[str, int]:
        """在文件中进行精确替换"""
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original_content = content
        replace_count = 0

        # 按照替换文本长度排序，优先替换长文本
        sorted_replacements = sorted(replacements, key=lambda x: len(x[0]), reverse=True)

        for en_text, zh_text in sorted_replacements:
            # 转义特殊字符
            escaped_en = re.escape(en_text)

            # 匹配各种引号包裹的字符串
            patterns = [
                (f'"{escaped_en}"', f'"{zh_text}"'),
                (f"'{escaped_en}'", f"'{zh_text}'"),
                (f'`{escaped_en}`', f'`{zh_text}`'),
                # 匹配JSX中的文本
                (f'>{escaped_en}<', f'>{zh_text}<'),
                # 匹配placeholder等属性
                (f'placeholder="{escaped_en}"', f'placeholder="{zh_text}"'),
                (f"placeholder='{escaped_en}'", f"placeholder='{zh_text}'"),
                (f'title="{escaped_en}"', f'title="{zh_text}"'),
                (f"title='{escaped_en}'", f"title='{zh_text}'"),
                (f'aria-label="{escaped_en}"', f'aria-label="{zh_text}"'),
                (f"aria-label='{escaped_en}'", f"aria-label='{zh_text}'"),
            ]

            for pattern, replacement in patterns:
                if re.search(pattern, content):
                    content = re.sub(pattern, replacement, content)
                    replace_count += 1

        return content, replace_count

    def apply_localization(self):
        """应用汉化"""
        print("开始精确汉化...")

        # 创建备份目录
        self.backup_dir.mkdir(exist_ok=True)

        total_files = len(self.translations)
        modified_files = 0
        total_replacements = 0

        print(f"找到 {total_files} 个文件需要处理\n")

        for i, (file_path_str, replacements) in enumerate(self.translations.items(), 1):
            file_path = self.root_dir / file_path_str

            if not file_path.exists():
                print(f"[{i}/{total_files}] ✗ {file_path_str} - 文件不存在")
                continue

            try:
                # 替换文本
                modified_content, replace_count = self.replace_in_file(file_path, replacements)

                if replace_count > 0:
                    # 备份原文件
                    self.backup_file(file_path)

                    # 写入修改后的内容
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(modified_content)

                    modified_files += 1
                    total_replacements += replace_count
                    print(f"[{i}/{total_files}] ✓ {file_path_str} ({replace_count} 处替换)")
                else:
                    print(f"[{i}/{total_files}] - {file_path_str} (无匹配)")

            except Exception as e:
                print(f"[{i}/{total_files}] ✗ {file_path_str} - 错误: {e}")

        print(f"\n汉化完成!")
        print(f"修改文件数: {modified_files}/{total_files}")
        print(f"总替换次数: {total_replacements}")
        print(f"备份目录: {self.backup_dir}")

    def check_localization(self):
        """检查哪些文件会被修改（不实际修改）"""
        print("检查汉化影响...\n")

        total_files = len(self.translations)
        would_modify = 0
        total_replacements = 0

        for i, (file_path_str, replacements) in enumerate(self.translations.items(), 1):
            file_path = self.root_dir / file_path_str

            if not file_path.exists():
                print(f"[{i}/{total_files}] ✗ {file_path_str} - 文件不存在")
                continue

            try:
                # 模拟替换
                _, replace_count = self.replace_in_file(file_path, replacements)

                if replace_count > 0:
                    would_modify += 1
                    total_replacements += replace_count
                    print(f"[{i}/{total_files}] ✓ {file_path_str} (将替换 {replace_count} 处)")
                else:
                    print(f"[{i}/{total_files}] - {file_path_str} (无匹配)")

            except Exception as e:
                print(f"[{i}/{total_files}] ✗ {file_path_str} - 错误: {e}")

        print(f"\n检查完成!")
        print(f"将修改文件数: {would_modify}/{total_files}")
        print(f"预计替换次数: {total_replacements}")

    def restore_files(self):
        """还原文件"""
        print("开始还原...")

        if not self.backup_dir.exists():
            print(f"错误: 备份目录 {self.backup_dir} 不存在")
            return

        # 获取所有备份文件
        backup_files = list(self.backup_dir.rglob("*"))
        backup_files = [f for f in backup_files if f.is_file()]

        total_files = len(backup_files)
        restored_files = 0

        print(f"找到 {total_files} 个备份文件\n")

        for i, backup_path in enumerate(backup_files, 1):
            try:
                # 计算原始文件路径
                relative_path = backup_path.relative_to(self.backup_dir)
                original_path = self.root_dir / relative_path

                # 还原文件
                shutil.copy2(backup_path, original_path)
                restored_files += 1
                print(f"[{i}/{total_files}] ✓ {relative_path}")

            except Exception as e:
                print(f"[{i}/{total_files}] ✗ {relative_path} - 错误: {e}")

        # 删除备份目录
        try:
            shutil.rmtree(self.backup_dir)
            print(f"\n已删除备份目录: {self.backup_dir}")
        except Exception as e:
            print(f"\n警告: 无法删除备份目录 {self.backup_dir}: {e}")

        print(f"\n还原完成!")
        print(f"还原文件数: {restored_files}/{total_files}")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()
    localizer = PreciseLocalizer()

    if command == "apply":
        localizer.apply_localization()
    elif command == "restore":
        localizer.restore_files()
    elif command == "check":
        localizer.check_localization()
    else:
        print(f"未知命令: {command}")
        print(__doc__)
        sys.exit(1)

if __name__ == "__main__":
    main()
