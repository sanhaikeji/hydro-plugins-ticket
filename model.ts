import { db, ObjectId, PERM, PRIV } from 'hydrooj';

/**
 * 工单集合。Hydro 会在启动时按 domainId 分域，工单全部带 domainId 字段，
 * 避免跨域读到别人的工单。
 */
export const coll = db.collection('ticket');

export const CATEGORY_KEYS = ['statement', 'data', 'difficulty'] as const;
export type TicketCategory = (typeof CATEGORY_KEYS)[number];

export interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  kind: 'text' | 'textarea';
  required: boolean;
}

export interface CategoryDef {
  label: string;
  hint: string;
  fields: FieldDef[];
}

/** 三类反馈及其对应的填写项。改这里就能改表单，模板会自动跟着渲染。 */
export const CATEGORIES: Record<TicketCategory, CategoryDef> = {
  statement: {
    label: '题面修缮',
    hint: '错别字、表述歧义、格式/公式/样例错误、中英文不一致等',
    fields: [
      { key: 'location', label: '问题位置', placeholder: '例如：题面第 2 段 / 输入格式第 1 行 / 样例 1 说明', kind: 'text', required: true },
      { key: 'original', label: '原文内容', placeholder: '把有问题的原文粘贴进来', kind: 'textarea', required: true },
      { key: 'suggestion', label: '建议修改为', placeholder: '写出你建议的正确表述', kind: 'textarea', required: true },
      { key: 'reason', label: '补充说明', placeholder: '选填，可写依据、链接、截图说明等', kind: 'textarea', required: false },
    ],
  },
  data: {
    label: '数据维护',
    hint: '数据点错误、答案/Special Judge 有误、文件 IO、时空限制不合理等',
    fields: [
      { key: 'scope', label: '涉及的数据 / 测试点', placeholder: '例如：#7、subtask 2、所有 .in/.out 文件', kind: 'text', required: true },
      { key: 'evidence', label: '复现方式与证据', placeholder: '提交记录编号、对拍结果、出错数据点编号等', kind: 'textarea', required: true },
      { key: 'suggestion', label: '建议处理方式', placeholder: '例如：重造第 7 个数据点 / 修正 checker', kind: 'textarea', required: false },
      { key: 'reason', label: '补充说明', placeholder: '选填', kind: 'textarea', required: false },
    ],
  },
  difficulty: {
    label: '难度调整',
    hint: '标注难度与实际不符、建议上调或下调难度标签',
    fields: [
      { key: 'current', label: '当前标注难度', placeholder: '例如：普及- / 提高+ / 5', kind: 'text', required: true },
      { key: 'expected', label: '建议难度', placeholder: '例如：普及 / 提高 / 8', kind: 'text', required: true },
      { key: 'evidence', label: '数据依据', placeholder: '通过率、提交人数、学生反馈、题意复杂度等（选填）', kind: 'textarea', required: false },
      { key: 'reason', label: '调整理由', placeholder: '为什么应该调整，写清依据', kind: 'textarea', required: true },
    ],
  },
};

/** 所有动态字段的 name 清单，后端只读 f_<key>。 */
export const FIELD_KEYS: string[] = Array.from(new Set(
  CATEGORY_KEYS.flatMap((k) => CATEGORIES[k].fields.map((f) => f.key)),
));

export const STATUS_KEYS = ['pending', 'processing', 'replied', 'closed', 'done'] as const;
export type TicketStatus = (typeof STATUS_KEYS)[number];

export const STATUSES: Record<TicketStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  replied: '已回复/待补充',
  closed: '已关闭',
  done: '已完成',
};

export interface TicketReply {
  _id: ObjectId;
  uid: number;
  content: string;
  at: Date;
  isMod: boolean;
}

export interface TicketLog {
  at: Date;
  uid: number;
  text: string;
}

export interface TicketDoc {
  _id: ObjectId;
  domainId: string;
  pid: string;
  problemTitle: string;
  owner: number;
  category: TicketCategory;
  title: string;
  fields: Record<string, string>;
  content: string;
  status: TicketStatus;
  assignee: number | null;
  replies: TicketReply[];
  logs: TicketLog[];
  createdAt: Date;
  updatedAt: Date;
}

declare module 'hydrooj' {
  interface Collections {
    ticket: TicketDoc;
  }
}

/**
 * MOD_BADGE 判定。
 * Hydro 里 MOD 徽章有两个来源：
 *   - PERM.PERM_MOD_BADGE  「Show MOD badge」域权限（1n<<2n）
 *   - PRIV.PRIV_MOD_BADGE  系统级特权（1<<25）
 * 两者任一命中即视为管理员；另外把域管理 / 系统管理员也纳入，避免 root 被挡在门外。
 */
export function isMod(user: any): boolean {
  if (!user) return false;
  try {
    if (typeof user.hasPerm === 'function' && user.hasPerm(PERM.PERM_MOD_BADGE)) return true;
    if (typeof user.hasPriv === 'function' && user.hasPriv(PRIV.PRIV_MOD_BADGE)) return true;
    if (typeof user.hasPriv === 'function' && user.hasPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN)) return true;
    if (typeof user.hasPriv === 'function' && user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) return true;
  } catch { /* 权限对象异常时按普通用户处理 */ }
  return false;
}

export interface AddTicketInput {
  domainId: string;
  pid: string;
  problemTitle: string;
  owner: number;
  category: TicketCategory;
  title: string;
  fields: Record<string, string>;
  content: string;
}

export async function addTicket(input: AddTicketInput): Promise<ObjectId> {
  const now = new Date();
  const _id = new ObjectId();
  const doc: any = {
    _id,
    domainId: input.domainId,
    pid: input.pid,
    problemTitle: input.problemTitle,
    owner: input.owner,
    category: input.category,
    title: input.title,
    fields: input.fields,
    content: input.content,
    status: 'pending',
    assignee: null,
    replies: [],
    logs: [{ at: now, uid: input.owner, text: '提交工单，状态设为「待处理」' }],
    createdAt: now,
    updatedAt: now,
  };
  await coll.insertOne(doc);
  return _id;
}

export async function getTicket(domainId: string, id: string): Promise<TicketDoc | null> {
  if (!/^[a-f\d]{24}$/i.test(String(id || ''))) return null;
  return coll.findOne({ _id: new ObjectId(String(id)), domainId }) as Promise<TicketDoc | null>;
}

export function listTickets(query: any = {}) {
  return coll.find(query).sort({ updatedAt: -1 });
}

export async function pushReply(t: TicketDoc, reply: TicketReply, patch: Record<string, any> = {}) {
  await coll.updateOne({ _id: t._id, domainId: t.domainId }, {
    $push: { replies: reply },
    $set: { updatedAt: new Date(), ...patch },
  } as any);
}

export async function changeStatus(t: TicketDoc, status: TicketStatus, uid: number) {
  const now = new Date();
  await coll.updateOne({ _id: t._id, domainId: t.domainId }, {
    $set: { status, updatedAt: now },
    $push: { logs: { at: now, uid, text: `状态由「${STATUSES[t.status]}」变更为「${STATUSES[status]}」` } },
  } as any);
}

export async function claim(t: TicketDoc, uid: number) {
  const now = new Date();
  const logs: TicketLog[] = [...(t.logs || []), { at: now, uid, text: '认领了该工单' }];
  const patch: any = { assignee: uid, updatedAt: now, logs };
  if (t.status === 'pending') {
    patch.status = 'processing';
    logs.push({ at: now, uid, text: '状态由「待处理」变更为「处理中」' });
  }
  await coll.updateOne({ _id: t._id, domainId: t.domainId }, { $set: patch } as any);
}

export async function unclaim(t: TicketDoc, uid: number) {
  const now = new Date();
  const logs: TicketLog[] = [...(t.logs || []), { at: now, uid, text: '取消认领该工单' }];
  await coll.updateOne({ _id: t._id, domainId: t.domainId }, {
    $set: { assignee: null, updatedAt: now, logs },
  } as any);
}

export async function ensureIndexes() {
  await Promise.all([
    coll.createIndex({ domainId: 1, updatedAt: -1 }),
    coll.createIndex({ domainId: 1, owner: 1, updatedAt: -1 }),
    coll.createIndex({ domainId: 1, status: 1, updatedAt: -1 }),
    coll.createIndex({ domainId: 1, pid: 1, updatedAt: -1 }),
    coll.createIndex({ domainId: 1, assignee: 1, updatedAt: -1 }),
  ]);
}
