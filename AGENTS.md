# OpenChamber Agent Guide

## 项目概览

OpenChamber 是一个 Bun monorepo,包含 web、UI、desktop 和 VS Code 运行时。它是 OpenCode 服务器的 UI 外壳,通过 HTTP + SSE
通信。Desktop 是轻量级 Tauri 包装器;除非真正需要 Rust 原生集成,否则核心逻辑应保留在 web/UI 中。

## 关键入口点

- Web 客户端: `packages/web/src/main.tsx` | 服务器: `packages/web/server/index.js` | CLI: `packages/web/bin/cli.js`
- 共享 UI: `packages/ui/src/main.tsx` | 状态管理: `packages/ui/src/stores/`
- Desktop: `packages/desktop/src-tauri/src/main.rs` | VS Code: `packages/vscode/src/extension.ts`

## 核心命令速查

### 开发

```bash
bun run dev                    # 所有服务(热重载)
bun run dev:web:full          # Web 全栈
bun run dev:web               # 仅 Web 客户端
bun run dev:web:server        # 仅服务器(nodemon watch)
bun run desktop:dev           # Desktop 应用
bun run vscode:dev            # VS Code 扩展
```

### 构建与验证

```bash
bun run build                 # 构建所有包
bun run build:web             # 仅 Web 包
bun run type-check            # 所有包类型检查
bun run type-check:web        # 仅 Web
bun run lint                  # 所有包 lint
bun run lint:web              # 仅 Web
```

### 测试

```bash
bun test                                           # 运行所有测试
bun test packages/web/bin/cli.test.js             # 单个文件
bun test --test-name-pattern "symlinked"          # 按名称过滤
bun test --watch                                   # 监听模式(仅开发)
```

测试使用 Bun 内置运行器。优先将 `*.test.js` 文件放在实现旁边。

### 提交前基线

交付代码前必须运行: `bun run type-check && bun run lint && bun run build`

## 代码风格要点

### 导入顺序(重要)

```typescript
// 1. 外部包
import React from 'react';
import {Textarea} from '@heroui/react';

// 2. 仅类型导入
import type {SessionConfig} from './types';

// 3. 内部别名(@/ 用于 UI, @openchamber/* 用于跨包)
import {useSessionStore} from '@/stores/useSessionStore';
import {Button} from '@/components/ui/button';

// 4. 相对导入
import {helper} from './utils';
```

- 对仅类型使用 `import type`
- UI 包中优先使用 `@/` 别名(`packages/ui/src`)
- 匹配周围文件的引号风格(单/双引号)和分号

### TypeScript 严格模式

- 避免 `any`;使用 `unknown`、联合类型或泛型
- 导出函数如果不明显则显式声明返回类型
- 在边界验证外部数据(需要时使用 `zod`)
- 在创建重复类型前先复用 `packages/ui/src/types/` 中的类型

### 命名约定

- 组件: `PascalCase`(文件 + 符号,每个文件一个)
- Hooks: `useXxx` 放在 `hooks/` 或相邻文件夹
- Stores: `useXxxStore` 及配套 helpers
- 常量: `UPPER_SNAKE_CASE` 仅用于真正的常量
- 避免晦涩缩写,除非已经确立

### 代码组织

- 函数保持在 50 行以内;增长时提取 helper
- 最多 3 层嵌套;更深则重构
- 优先使用早返回而非深层嵌套
- 每个文件一个组件;超过 300 行时拆分
- 相关文件放在一起(组件 + hooks + types 在同一文件夹)

## React 与 UI 模式

### 组件最佳实践

```typescript
// ✅ 好: 函数组件,结构清晰
export function ChatInput({onSubmit}: ChatInputProps) {
    const [value, setValue] = useState('');

    const handleSubmit = () => {
        if (!value.trim()) return;
        onSubmit(value);
        setValue('');
    };

    return <Textarea value = {value}
    onChange = {e
=>
    setValue(e.target.value)
}
    />;
}

// ❌ 坏: 渲染期间副作用,结构不清晰
export function ChatInput({onSubmit}: ChatInputProps) {
    const [value, setValue] = useState('');
    value && onSubmit(value); // 渲染期间的副作用!
    return <Textarea / >;
}
```

### 状态管理

- 共享状态使用 Zustand stores(`packages/ui/src/stores/`)
- 尽可能保持组件状态本地化
- 避免 prop drilling;深层树使用 context 或 stores
- 不要过早优化;性能分析后再添加 `memo`/`useMemo`

### 主题与样式(关键)

**任何 UI 工作前,加载 `theme-system` skill。**

- 使用主题 tokens: `--surface-elevated`, `--interactive-hover`, `--status-warning`
- 绝不硬编码颜色或原始 Tailwind 类(`bg-blue-500` ❌)
- 查看 `packages/ui/src/lib/typography.ts` 获取文本 helpers
- 保持移动端响应式行为

### 常见陷阱

- ❌ 直接导入 `sonner` → ✅ 使用 `@/components/ui` toast 包装器
- ❌ 修改无关行 → ✅ 保持 diff 紧凑
- ❌ 到处添加注释 → ✅ 仅对非显而易见的逻辑添加
- ❌ 不必要地创建新文件 → ✅ 优先编辑现有文件

## 服务器与 CLI

### 服务器代码风格

```javascript
// ESM 导入,显式错误处理
import express from 'express';
import {createTunnelService} from './lib/tunnels/index.js';

try {
    const result = await riskyOperation();
    if (!result) throw new Error('Operation failed');
} catch (err) {
    // 访问属性前收窄 unknown
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Operation failed:', message);
}
```

### CLI 开发

**CLI 工作前,加载 `clack-cli-patterns` skill。**

- 在命令逻辑中验证,不仅在提示中
- `--quiet`、`--json`、非 TTY 模式必须有相同的安全性
- 无效操作必须以非零退出码失败
- 测试人类和机器输出

## 错误处理模式

```typescript
// ✅ 好: 快速失败,收窄 unknown,可操作的消息
try {
    const data = await fetchData();
    if (!data.id) throw new Error('Invalid data: missing id');
    return processData(data);
} catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    toast.error(`Failed to load data: ${message}`);
    throw err; // 如果调用者需要处理则重新抛出
}

// ❌ 坏: 静默失败,吞掉错误
try {
    await fetchData();
} catch (err) {
    // 静默失败 - 用户不知道发生了什么
}
```

## 文档与模块边界

编辑这些区域前先阅读模块文档:

- Git: `packages/web/server/lib/git/DOCUMENTATION.md`
- GitHub: `packages/web/server/lib/github/DOCUMENTATION.md`
- OpenCode: `packages/web/server/lib/opencode/DOCUMENTATION.md`
- Notifications: `packages/web/server/lib/notifications/DOCUMENTATION.md`
- Skills: `packages/web/server/lib/skills-catalog/DOCUMENTATION.md`

## 调试技巧

- 服务器日志: 检查运行 `dev:web:server` 的终端
- 客户端错误: 浏览器 DevTools 控制台
- 类型错误: 运行 `bun run type-check:web` 或 `type-check:ui`
- 热重载问题: 重启开发服务器,清理 `dist/` 文件夹
- 跨包更改: 重新构建受影响的包(`bun run build:ui`)

## 关键规则

- ❌ 绝不修改 `../opencode`(独立仓库)
- ❌ 除非用户明确要求,否则不运行 git/GitHub 命令
- ❌ 代码中不要有 secrets、tokens 或 `.env` 值
- ❌ 不要顺手重构;保持 diff 聚焦
- ✅ 先检查附近文件;遵循本地模式
- ✅ Desktop 更改?验证 web 应用仍然工作
- ✅ Settings UI?研究 `packages/ui/src/components/sections/`

## 技术栈参考

- UI: React 19, TypeScript, Vite, Tailwind v4
- 状态: Zustand | 原语: Radix UI, HeroUI, Remixicon
- 服务器: Express 5, Bun runtime, Node APIs
- Desktop: Tauri v2 + Rust | VS Code: Extension host + webview
- 包管理器: `bun@1.3.5` | Node: `>=20`

## 快速参考

- 路径别名: `@/`(UI 本地), `@openchamber/ui/*`, `@openchamber/web/*`
- TypeScript: 严格模式, `verbatimModuleSyntax: true`
- ESLint: 强制基线(无 Prettier 配置)
- 发布上下文: 查看 `CHANGELOG.md`
