"""
UI汉化翻译数据
基于代码分析结果，包含每个文件的精确翻译映射
"""

# 翻译数据结构: {文件路径: [(英文, 中文), ...]}
TRANSLATIONS = {
    # 1. 对话框和标题
    "packages/ui/src/components/ui/AboutDialog.tsx": [
        ("A fan-made interface for OpenCode agent", "OpenCode 代理的粉丝制作界面"),
        ("Diagnostics copied", "诊断信息已复制"),
        ("Preparing diagnostics...", "正在准备诊断信息..."),
        ("Copy diagnostics", "复制诊断信息"),
        ("Includes OpenChamber state, OpenCode health, directories, and projects.", "包括 OpenChamber 状态、OpenCode 健康状况、目录和项目。"),
        ("Made with love to comunity", "用爱为社区制作"),
    ],

    "packages/ui/src/components/ui/OpenCodeStatusDialog.tsx": [
        ("OpenCode Status", "OpenCode 状态"),
        ("Copied", "已复制"),
        ("OpenCode status copied to clipboard.", "OpenCode 状态已复制到剪贴板。"),
        ("Copy failed", "复制失败"),
    ],

    # 2. 权限相关
    "packages/ui/src/components/chat/PermissionRequest.tsx": [
        ("Permission required:", "需要权限："),
        ("Once", "一次"),
        ("Always", "总是"),
        ("Reject", "拒绝"),
    ],

    # 3. 聊天界面
    "packages/ui/src/components/chat/ChatEmptyState.tsx": [
        ("Fix the failing tests", "修复失败的测试"),
        ("Refactor this to be more readable", "重构以提高可读性"),
        ("Add form validation", "添加表单验证"),
        ("Optimize this function", "优化此函数"),
        ("Write tests for this", "为此编写测试"),
        ("Explain how this works", "解释这是如何工作的"),
        ("Add a new feature", "添加新功能"),
        ("Help me debug this", "帮我调试这个"),
        ("Review my code", "审查我的代码"),
        ("Simplify this logic", "简化此逻辑"),
        ("Add error handling", "添加错误处理"),
        ("Create a new component", "创建新组件"),
        ("Update the documentation", "更新文档"),
        ("Find the bug here", "找到这里的错误"),
        ("Improve performance", "改进性能"),
        ("Add type definitions", "添加类型定义"),
    ],

    "packages/ui/src/components/chat/QuestionCard.tsx": [
        ("Your answer", "你的答案"),
    ],

    # 4. Git 相关
    "packages/ui/src/components/views/git/GitEmptyState.tsx": [
        ("Working tree clean", "工作树干净"),
        ("All changes have been committed", "所有更改已提交"),
    ],

    "packages/ui/src/components/views/git/CommitInput.tsx": [
        ("Commit message", "提交信息"),
    ],

    "packages/ui/src/components/views/git/PullRequestSection.tsx": [
        ("PR status unavailable", "PR 状态不可用"),
        ("PR title", "PR 标题"),
        ("Describe this PR", "描述此 PR"),
        ("Create PR", "创建 PR"),
        ("Select base branch", "选择基础分支"),
        ("What changed and why", "更改了什么以及为什么"),
        ("Draft", "草稿"),
        ("Squash", "压缩"),
        ("Merge", "合并"),
        ("Rebase", "变基"),
        ("PR created", "PR 已创建"),
        ("PR merged", "PR 已合并"),
        ("Marked ready for review", "标记为准备审查"),
        ("PR updated", "PR 已更新"),
        ("GitHub runtime API unavailable", "GitHub 运行时 API 不可用"),
        ("Failed to load check details", "加载检查详情失败"),
        ("Failed to load comments", "加载评论失败"),
        ("No active session", "没有活跃的会话"),
        ("Open a chat session first.", "首先打开聊天会话。"),
        ("No model selected", "未选择模型"),
        ("Failed to send message", "发送消息失败"),
        ("Failed to load checks", "加载检查失败"),
        ("Failed to load PR comments", "加载 PR 评论失败"),
        ("Failed to generate description", "生成描述失败"),
        ("Title is required", "标题是必需的"),
        ("Base branch is required", "基础分支是必需的"),
        ("Base branch must differ from head branch", "基础分支必须与头分支不同"),
        ("Failed to create PR", "创建 PR 失败"),
        ("Merge failed", "合并失败"),
        ("Failed to mark ready", "标记为准备失败"),
        ("Failed to update PR", "更新 PR 失败"),
    ],

    "packages/ui/src/components/views/git/ChangesSection.tsx": [
        ("Select all files", "选择所有文件"),
        ("Clear file selection", "清除文件选择"),
        ("Changed files", "更改的文件"),
    ],

    "packages/ui/src/components/views/git/IntegrateCommitsSection.tsx": [
        ("Move commits", "移动提交"),
        ("Search branches...", "搜索分支..."),
        ("No branches found.", "未找到分支。"),
    ],

    "packages/ui/src/components/views/git/ConflictDialog.tsx": [
        ("No conflict details available", "没有可用的冲突详情"),
    ],

    # 5. 设置界面
    "packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx": [
        ("System", "系统"),
        ("Light", "浅色"),
        ("Dark", "深色"),
        ("Dynamic", "动态"),
        ("New inline, modified side-by-side.", "新增内联，修改并排。"),
        ("Always inline", "始终内联"),
        ("Show as a single unified view.", "显示为单一统一视图。"),
        ("Always side-by-side", "始终并排"),
        ("Compare original and modified files.", "比较原始文件和修改后的文件。"),
        ("Single file", "单个文件"),
        ("Show one file at a time.", "一次显示一个文件。"),
        ("All files", "所有文件"),
        ("Stack all changed files together.", "将所有更改的文件堆叠在一起。"),
    ],

    "packages/ui/src/components/sections/openchamber/NotificationSettings.tsx": [
        ("Enable Notifications", "启用通知"),
        ("Notify While App is Focused", "应用获得焦点时通知"),
        ("Agent Completion", "代理完成"),
        ("Subagent Completion", "子代理完成"),
        ("Agent Errors", "代理错误"),
        ("Agent Questions", "代理问题"),
        ("Title", "标题"),
        ("Message", "消息"),
        ("Summarize Last Message", "总结最后一条消息"),
        ("Summarization Model", "总结模型"),
        ("Not selected", "未选择"),
        ("Threshold", "阈值"),
        ("Reset", "重置"),
        ("Length", "长度"),
        ("Max Length", "最大长度"),
        ("Enable push notifications", "启用推送通知"),
    ],

    "packages/ui/src/components/sections/openchamber/SessionRetentionSettings.tsx": [
        ("Enable Auto-Cleanup", "启用自动清理"),
        ("Retention Period", "保留期"),
        ("days", "天"),
    ],

    "packages/ui/src/components/sections/openchamber/DefaultsSettings.tsx": [
        ("Default", "默认"),
    ],

    # 6. 技能管理
    "packages/ui/src/components/sections/skills/catalog/InstallSkillDialog.tsx": [
        ("Install skill", "安装技能"),
    ],

    "packages/ui/src/components/sections/skills/catalog/InstallFromRepoDialog.tsx": [
        ("Install from Git repository", "从 Git 仓库安装"),
        ("Select all", "全选"),
        ("Select none", "取消全选"),
    ],

    "packages/ui/src/components/sections/skills/catalog/AddCatalogDialog.tsx": [
        ("Add skills catalog", "添加技能目录"),
    ],

    "packages/ui/src/components/sections/skills/catalog/SkillsCatalogPage.tsx": [
        ("Remove Catalog", "移除目录"),
        ("Are you sure you want to remove this catalog?", "确定要移除此目录吗？"),
    ],

    "packages/ui/src/components/sections/skills/catalog/InstallConflictsDialog.tsx": [
        ("Skills already exist", "技能已存在"),
        ("Skip all", "全部跳过"),
        ("Overwrite all", "全部覆盖"),
    ],

    "packages/ui/src/components/sections/skills/SkillsPage.tsx": [
        ("Delete Supporting File", "删除支持文件"),
    ],

    "packages/ui/src/components/sections/skills/SkillsSidebar.tsx": [
        ("Delete Skill", "删除技能"),
        ("Rename Skill", "重命名技能"),
    ],

    # 7. 会话管理
    "packages/ui/src/components/session/NewWorktreeDialog.tsx": [
        ("New Worktree", "新工作树"),
    ],

    "packages/ui/src/components/session/sidebar/SidebarHeader.tsx": [
        ("Add project", "添加项目"),
        ("New session", "新会话"),
        ("New multi-run", "新多运行"),
        ("Project notes", "项目笔记"),
        ("Search sessions", "搜索会话"),
        ("Session display mode", "会话显示模式"),
        ("Search sessions...", "搜索会话..."),
        ("Clear search", "清除搜索"),
    ],

    "packages/ui/src/components/session/sidebar/SidebarFooter.tsx": [
        ("Settings", "设置"),
        ("Shortcuts", "快捷键"),
        ("About OpenChamber", "关于 OpenChamber"),
    ],

    "packages/ui/src/components/session/sidebar/SessionNodeItem.tsx": [
        ("Rename session", "重命名会话"),
        ("Unread updates", "未读更新"),
        ("Pinned session", "固定会话"),
        ("Permission required", "需要权限"),
        ("Session menu", "会话菜单"),
    ],

    "packages/ui/src/components/session/SessionFolderItem.tsx": [
        ("Folder name", "文件夹名称"),
        ("New session", "新会话"),
        ("New sub-folder", "新子文件夹"),
        ("Rename folder", "重命名文件夹"),
    ],

    "packages/ui/src/components/session/ProjectNotesTodoPanel.tsx": [
        ("Capture context, reminders, or links", "捕获上下文、提醒或链接"),
        ("Add a todo", "添加待办事项"),
        ("Add todo", "添加待办事项"),
    ],

    "packages/ui/src/components/session/GitHubIssuePickerDialog.tsx": [
        ("Search by title or #123, or paste issue URL", "按标题或 #123 搜索，或粘贴问题 URL"),
        ("Open in GitHub", "在 GitHub 中打开"),
        ("Toggle worktree", "切换工作树"),
    ],

    # 8. 布局和导航
    "packages/ui/src/components/layout/SidebarFilesTree.tsx": [
        ("Search files...", "搜索文件..."),
        ("Clear search", "清除搜索"),
        ("New File", "新文件"),
        ("New Folder", "新文件夹"),
        ("Refresh", "刷新"),
        ("New name", "新名称"),
        ("Name", "名称"),
    ],

    "packages/ui/src/components/layout/ContextPanel.tsx": [
        ("Collapse panel", "折叠面板"),
        ("Expand panel", "展开面板"),
        ("Close panel", "关闭面板"),
        ("Resize context panel", "调整上下文面板大小"),
    ],

    "packages/ui/src/components/layout/BottomTerminalDock.tsx": [
        ("Resize terminal panel", "调整终端面板大小"),
        ("Restore terminal panel height", "恢复终端面板高度"),
        ("Expand terminal panel", "展开终端面板"),
        ("Close terminal panel", "关闭终端面板"),
    ],

    "packages/ui/src/components/layout/ProjectEditDialog.tsx": [
        ("Project name", "项目名称"),
        ("None", "无"),
        ("Project icon background color", "项目图标背景颜色"),
    ],

    "packages/ui/src/components/layout/ProjectActionsButton.tsx": [
        ("Add action", "添加操作"),
        ("Choose project action", "选择项目操作"),
    ],

    # 9. 命令面板
    "packages/ui/src/components/ui/CommandPalette.tsx": [
        ("Type a command or search...", "输入命令或搜索..."),
        ("No results found.", "未找到结果。"),
    ],

    # 10. 视图相关
    "packages/ui/src/components/views/TerminalView.tsx": [
        ("Close tab", "关闭标签页"),
        ("New tab", "新标签页"),
        ("Force kill and create fresh session", "强制关闭并创建新会话"),
    ],

    "packages/ui/src/components/views/agent-manager/AgentManagerEmptyState.tsx": [
        ("e.g. feature-auth, bugfix-login", "例如 feature-auth, bugfix-login"),
        ("e.g., bun install", "例如 bun install"),
        ("Remove command", "移除命令"),
        ("Ask anything...", "问任何事..."),
        ("Add attachment", "添加附件"),
        ("Start Agent Group", "启动代理组"),
    ],

    "packages/ui/src/components/views/DiffView.tsx": [
        ("Open this file in editor at change", "在编辑器中打开此文件以进行更改"),
        ("Disable line wrap", "禁用行换行"),
        ("Enable line wrap", "启用行换行"),
        ("Open this file at first changed line", "在第一个更改行打开此文件"),
    ],

    "packages/ui/src/components/views/SettingsView.tsx": [
        ("Back to Settings", "返回设置"),
        ("Close settings", "关闭设置"),
        ("Open section list", "打开部分列表"),
        ("Back", "返回"),
        ("Resize settings navigation", "调整设置导航大小"),
    ],

    "packages/ui/src/components/views/PlanView.tsx": [
        ("Copy plan contents", "复制计划内容"),
        ("Copy plan path", "复制计划路径"),
    ],

    "packages/ui/src/components/views/MultiRunWindow.tsx": [
        ("Close multi-run", "关闭多运行"),
    ],

    "packages/ui/src/components/views/GitView.tsx": [
        ("Search gitmojis...", "搜索 gitmojis..."),
        ("No gitmojis found.", "未找到 gitmojis。"),
    ],

    "packages/ui/src/components/views/FilesView.tsx": [
        ("Save now", "立即保存"),
        ("Save", "保存"),
        ("Open in desktop app", "在桌面应用中打开"),
        ("Find in file", "在文件中查找"),
        ("Copy file contents", "复制文件内容"),
        ("Copy file path", "复制文件路径"),
    ],
}
