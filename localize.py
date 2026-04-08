#!/usr/bin/env python3
"""
UI汉化脚本
用法:
  python localize.py apply   - 应用汉化（备份原文件并替换为中文）
  python localize.py restore - 还原原始文件
"""

import os
import sys
import json
import shutil
import re
from pathlib import Path
from typing import Dict, List, Tuple

# 配置
BACKUP_DIR = ".localize_backup"
TRANSLATIONS_FILE = "translations.json"
TARGET_DIRS = [
    "packages/ui/src",
    "packages/web/src",
    "packages/desktop/src"
]
FILE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"]

class Localizer:
    def __init__(self):
        self.root_dir = Path.cwd()
        self.backup_dir = self.root_dir / BACKUP_DIR
        self.translations = self.load_translations()

    def load_translations(self) -> Dict[str, str]:
        """加载翻译映射"""
        trans_file = self.root_dir / TRANSLATIONS_FILE
        if not trans_file.exists():
            print(f"警告: 翻译文件 {TRANSLATIONS_FILE} 不存在，将创建默认配置")
            self.create_default_translations()
            return self.load_translations()

        with open(trans_file, 'r', encoding='utf-8') as f:
            return json.load(f)

    def create_default_translations(self):
        """创建默认翻译配置"""
        default_translations = {
            # 导航和命令
            "Open Command Palette": "打开命令面板",
            "Show Keyboard Shortcuts": "显示键盘快捷键",
            "Toggle Session Sidebar": "切换会话侧边栏",
            "Toggle Right Sidebar": "切换右侧边栏",
            "Navigation & Commands": "导航与命令",

            # 常用UI文本
            "Settings": "设置",
            "Help": "帮助",
            "Close": "关闭",
            "Cancel": "取消",
            "Save": "保存",
            "Delete": "删除",
            "Edit": "编辑",
            "Add": "添加",
            "Remove": "移除",
            "Search": "搜索",
            "Filter": "筛选",
            "Loading": "加载中",
            "Error": "错误",
            "Success": "成功",
            "Warning": "警告",
            "Info": "信息",

            # 添加更多翻译...
        }

        trans_file = self.root_dir / TRANSLATIONS_FILE
        with open(trans_file, 'w', encoding='utf-8') as f:
            json.dump(default_translations, f, ensure_ascii=False, indent=2)
        print(f"已创建默认翻译文件: {TRANSLATIONS_FILE}")
        print("请编辑此文件添加更多翻译映射")

    def get_target_files(self) -> List[Path]:
        """获取需要汉化的文件列表"""
        files = []
        for target_dir in TARGET_DIRS:
            dir_path = self.root_dir / target_dir
            if not dir_path.exists():
                continue

            for ext in FILE_EXTENSIONS:
                files.extend(dir_path.rglob(f"*{ext}"))

        return files

    def backup_file(self, file_path: Path):
        """备份文件"""
        relative_path = file_path.relative_to(self.root_dir)
        backup_path = self.backup_dir / relative_path
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file_path, backup_path)

    def replace_text(self, content: str) -> Tuple[str, int]:
        """替换文本中的英文为中文"""
        modified_content = content
        replace_count = 0

        # 按照翻译文本长度排序，优先替换长文本（避免部分匹配问题）
        sorted_translations = sorted(
            self.translations.items(),
            key=lambda x: len(x[0]),
            reverse=True
        )

        for en_text, zh_text in sorted_translations:
            # 匹配字符串字面量中的文本
            # 支持双引号和单引号
            patterns = [
                (f'"{re.escape(en_text)}"', f'"{zh_text}"'),
                (f"'{re.escape(en_text)}'", f"'{zh_text}'"),
                (f'`{re.escape(en_text)}`', f'`{zh_text}`'),
            ]

            for pattern, replacement in patterns:
                if pattern in modified_content:
                    modified_content = modified_content.replace(pattern, replacement)
                    replace_count += 1

        return modified_content, replace_count

    def apply_localization(self):
        """应用汉化"""
        print("开始汉化...")

        # 创建备份目录
        self.backup_dir.mkdir(exist_ok=True)

        files = self.get_target_files()
        total_files = len(files)
        modified_files = 0
        total_replacements = 0

        print(f"找到 {total_files} 个文件需要处理")

        for i, file_path in enumerate(files, 1):
            try:
                # 读取文件
                with open(file_path, 'r', encoding='utf-8') as f:
                    original_content = f.read()

                # 替换文本
                modified_content, replace_count = self.replace_text(original_content)

                if replace_count > 0:
                    # 备份原文件
                    self.backup_file(file_path)

                    # 写入修改后的内容
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(modified_content)

                    modified_files += 1
                    total_replacements += replace_count
                    print(f"[{i}/{total_files}] ✓ {file_path.relative_to(self.root_dir)} ({replace_count} 处替换)")
                else:
                    print(f"[{i}/{total_files}] - {file_path.relative_to(self.root_dir)} (无需修改)")

            except Exception as e:
                print(f"[{i}/{total_files}] ✗ {file_path.relative_to(self.root_dir)} - 错误: {e}")

        print(f"\n汉化完成!")
        print(f"修改文件数: {modified_files}/{total_files}")
        print(f"总替换次数: {total_replacements}")
        print(f"备份目录: {self.backup_dir}")

    def restore_files(self):
        """还原文件"""
        print("开始还原...")

        if not self.backup_dir.exists():
            print(f"错误: 备份目录 {self.backup_dir} 不存在")
            return

        # 获取所有备份文件
        backup_files = []
        for ext in FILE_EXTENSIONS:
            backup_files.extend(self.backup_dir.rglob(f"*{ext}"))

        total_files = len(backup_files)
        restored_files = 0

        print(f"找到 {total_files} 个备份文件")

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
    localizer = Localizer()

    if command == "apply":
        localizer.apply_localization()
    elif command == "restore":
        localizer.restore_files()
    else:
        print(f"未知命令: {command}")
        print(__doc__)
        sys.exit(1)

if __name__ == "__main__":
    main()
