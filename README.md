# hydro-plugins-ticket

HydroOJ 题目反馈工单插件。学生在题目页右侧点「题目反馈」，按 **题面修缮 / 数据维护 / 难度调整** 三类提交工单；拥有 MOD 徽章的管理员在同一套页面里认领、流转状态、用 Markdown 回复。

> 纯后端 + 少量前端页面，无独立服务、无第三方依赖，只依赖 `hydrooj` 本体。

在线看 UI：`ui-preview.html`（单文件离线预览，含亮色 / 暗色 / 动效分帧，直接下载用浏览器打开即可）。

## 功能

- **题目页入口**：题面 / 提交 / 题解 / 文件 / 统计等所有带 `problem_sidebar` 的页面自动插入「题目反馈」按钮，不需要改模板。
- **三类反馈，各自字段**：
  | 分类 | 必填 | 选填 |
  | --- | --- | --- |
  | 题面修缮 | 问题位置、原文内容、建议修改为 | 补充说明 |
  | 数据维护 | 涉及的数据 / 测试点、复现方式与证据 | 建议处理方式、补充说明 |
  | 难度调整 | 当前标注难度、建议难度、调整理由 | 数据依据 |
- **5 种状态**：待处理 → 处理中 → 已回复/待补充 → 已完成 / 已关闭。
- **认领**：管理员可认领工单（自动把「待处理」推进到「处理中」），同一工单只允许一个人认领，可取消认领。
- **双视角**：普通用户只看得到自己提交的工单；MOD 用户看全部，并可按状态 / 分类 / 题目筛选。
- **Markdown 回复**：用户与管理员共用一套回复流，管理员回复会标记来源，可勾选「标记为已回复」。
- **操作日志**：状态变更、认领、取消认领逐条留痕，谁在什么时候做了什么可追溯。
- **权限收敛**：`PRIV_USER_PROFILE` 才能访问路由；建单 60 秒 5 次、回复 30 秒 10 次限流；正文 20000 字上限。

## 安装

```bash
cd /root
git clone https://github.com/sanhaikeji/hydro-plugins-ticket.git
hydrooj addon add /root/hydro-plugins-ticket
pm2 restart hydrooj
```

后端 `index.ts` / `model.ts` 由 Hydro 的加载器直接转译，**不需要预编译**。

### 前端页面需要重打 UI

本插件带前端页面（`frontend/ticket.page.ts`、`ticket.page.css`、`ticket.motion.ts`），它们由 `@hydrooj/ui-default` 在**打包阶段**收集，所以新增插件后必须重建前端产物，否则页面能开但没有样式与交互：

```bash
cd /root && yarn build:ui && pm2 restart hydrooj
```

源码安装的 Hydro 仓库根目录自带 `build:ui` 脚本；若你用的是已预打包的发行版，请按该发行版文档重新构建 UI。

### 给管理员开权限

工单面板、认领、状态流转只对 **MOD 徽章** 用户开放。判定顺序（任一命中即可）：

1. 域权限 `PERM_MOD_BADGE`（`Show MOD badge`）
2. 系统特权 `PRIV_MOD_BADGE`
3. `PRIV_MANAGE_ALL_DOMAIN` / `PRIV_EDIT_SYSTEM`（兜底，避免 root 被挡）

在「域管理 → 权限」里给对应的角色勾上 `Show MOD badge` 即可。

## 路由

| 路由 | 路径 | 说明 |
| --- | --- | --- |
| `ticket_main` | `/ticket` | 工单列表 / 管理员面板 |
| `ticket_create` | `/ticket/new/:pid` | 针对某题的建单页 |
| `ticket_detail` | `/ticket/:id` | 工单详情、回复、状态流转、认领 |

同时注入 `Nav`、`UserDropdown`（我的工单）、`DomainManage`（工单面板，仅 MOD 可见）三个入口。

## 数据结构

单一集合 `ticket`（按 `domainId` 分域，跨域读不到）：

```ts
{
  _id, domainId, pid, problemTitle,
  owner,                       // 提交者 uid
  category,                    // statement | data | difficulty
  title,
  fields: Record<string, string>,   // 分类对应的动态字段
  content,                     // 正文（Markdown）
  status,                      // pending | processing | replied | closed | done
  assignee: number | null,     // 认领人
  replies: { _id, uid, content, at, isMod }[],
  logs: { at, uid, text }[],
  createdAt, updatedAt,
}
```

索引在 `app/ready` 时自动创建：`(domainId, updatedAt)`、`(domainId, owner, updatedAt)`、`(domainId, status, updatedAt)`、`(domainId, pid, updatedAt)`、`(domainId, assignee, updatedAt)`。

## 改分类 / 改字段

只改 `model.ts` 里的 `CATEGORIES` 常量即可。模板按 `CATEGORIES[category].fields` 渲染表单，后端只读 `f_<key>` 形式的字段名，加字段不用动别的地方（记得同步 `templates/` 里的分类色块与文案）。

## 文件结构

```
index.ts                 路由、Handler、UI 注入、i18n
model.ts                 集合、分类与状态定义、MOD 判定、索引
templates/
  ticket_main.html       列表 / 面板（亮暗双主题、筛选、分页）
  ticket_create.html     建单页（三分类选择 + 动态字段 + 内联 3D 素材）
  ticket_detail.html     详情页（hero、字段区、时间线、回复、管理员操作）
frontend/
  ticket.page.ts         AutoloadPage：侧栏按钮注入、hero 光斑
  ticket.page.css        全部样式（设计令牌 + 边缘层级规则 + 暗色反转）
  ticket.motion.ts       动效：色块展开、卡片堆叠、圆形扩散切主题
ui-preview.html          单文件离线预览（含分帧演示）
```

## 设计说明

- 视觉沿用 **流体色块 + 3D 黏土物件 + 扁平发丝线** 三件套，三张分类插画是抠好的透明 webp，base64 内联进模板，不产生额外请求。
- 边缘层级分四档：L0 无边框（贴底区块）、L1 发丝线（1px，常态）、L2 双层描边（hover / 选中）、L3 投影（浮层、弹窗），避免"到处发光"。
- 主色为墨黑（`#14171d`），暗色主题整体反色并单独维护 `--tk-on-primary` 令牌，保证深浅两套主题下按钮文字都可读。
- 已做 `prefers-reduced-motion` 与打印样式降级。

## License

MIT
