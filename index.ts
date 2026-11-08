import {
  Context, CreateError, ForbiddenError, Handler, NotFoundError, ObjectId,
  param, PERM, PRIV, ProblemModel, Types, UserFacingError, UserModel,
} from 'hydrooj';
import {
  addTicket, CATEGORIES, CATEGORY_KEYS, changeStatus, claim, ensureIndexes,
  getTicket, isMod, listTickets, pushReply, STATUSES, STATUS_KEYS,
  TicketCategory, TicketDoc, TicketStatus, unclaim,
} from './model';

const PAGE_SIZE = 20;
const MAX_TEXT = 20000;

// Hydro 的错误文案在「定义错误类」时固定，构造参数只作为 {0} 占位符的参数。
// error.html 用 _(error.message).formatFromArray(error.params) 渲染，所以这里必须自定义错误类。
const TicketError = CreateError('TicketError', UserFacingError, '{0}', 400);
const TicketForbiddenError = CreateError('TicketForbiddenError', ForbiddenError, '{0}', 403);

function clean(v: any, max = MAX_TEXT): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function requireText(v: string, label: string): string {
  if (!v) throw new TicketError(`请填写「${label}」`);
  return v;
}

function collectUids(t: TicketDoc): number[] {
  const set = new Set<number>([t.owner]);
  if (typeof t.assignee === 'number') set.add(t.assignee);
  for (const r of t.replies || []) set.add(r.uid);
  for (const l of t.logs || []) set.add(l.uid);
  return Array.from(set);
}

/** 工单列表 / 管理员面板。普通用户只能看自己提交的；MOD_BADGE 用户可看全部、按状态分类筛选。 */
class TicketMainHandler extends Handler {
  @param('page', Types.PositiveInt, true)
  async get(domainId: string, page = 1) {
    const args = this.args as Record<string, any>;
    const mod = isMod(this.user);
    const view = clean(args.view) || (mod ? 'all' : 'mine');
    const status = clean(args.status);
    const category = clean(args.category);
    const pid = clean(args.pid);

    const query: Record<string, any> = { domainId };
    if (!mod || view === 'mine') query.owner = this.user._id;
    else if (view === 'claimed') query.assignee = this.user._id;
    if ((STATUS_KEYS as readonly string[]).includes(status)) query.status = status;
    if ((CATEGORY_KEYS as readonly string[]).includes(category)) query.category = category;
    if (pid) query.pid = pid;

    // Hydro 的 paginate 返回 [docs, numPages, totalCount]，第二个值就是模板里的 pcount。
    const [docs, pcount, count] = await this.paginate(listTickets(query), page, PAGE_SIZE);
    const tickets = (docs as TicketDoc[]).map((t) => ({ ...t, tid: t._id.toString() }));
    const uids = Array.from(new Set<number>(tickets.flatMap((t) => [t.owner, t.assignee].filter((x): x is number => typeof x === 'number'))));
    const udict = await UserModel.getList(domainId, uids);

    this.response.template = 'ticket_main.html';
    this.response.body = {
      tickets, udict, count, page, pcount,
      mod, view, status, category, pid,
      statuses: STATUSES, statusKeys: STATUS_KEYS,
      categories: CATEGORIES, categoryKeys: CATEGORY_KEYS,
    };
  }
}

/** 新建工单：某个题目的反馈入口。 */
class TicketCreateHandler extends Handler {
  @param('pid', Types.String)
  async get(domainId: string, pid: string) {
    this.checkPerm(PERM.PERM_VIEW_PROBLEM);
    const pdoc = await ProblemModel.get(domainId, pid);
    if (!pdoc) throw new NotFoundError(pid);
    this.response.template = 'ticket_create.html';
    this.response.body = {
      pid, pdoc,
      categories: CATEGORIES, categoryKeys: CATEGORY_KEYS,
      defaultTitle: `${pid} · 题面修缮`,
    };
  }

  @param('pid', Types.String)
  @param('category', Types.String)
  @param('title', Types.Title)
  async post(domainId: string, pid: string, category: string, title: string) {
    this.checkPerm(PERM.PERM_VIEW_PROBLEM);
    await this.limitRate('ticket_create', 60, 5);
    if (!(CATEGORY_KEYS as readonly string[]).includes(category)) throw new TicketError('请选择有效的反馈分类');
    const pdoc = await ProblemModel.get(domainId, pid);
    if (!pdoc) throw new NotFoundError(pid);

    const args = this.args as Record<string, any>;
    const def = CATEGORIES[category as TicketCategory];
    const fields: Record<string, string> = {};
    for (const f of def.fields) {
      const value = clean(args[`f_${f.key}`]);
      if (f.required) requireText(value, f.label);
      if (value) fields[f.key] = value;
    }

    const id = await addTicket({
      domainId,
      pid,
      problemTitle: String(pdoc.title || pid),
      owner: this.user._id,
      category: category as TicketCategory,
      title: clean(title, 64),
      fields,
      content: clean(args.content),
    });
    this.response.redirect = this.url('ticket_detail', { id: id.toString() });
  }
}

/** 工单详情：回复、状态流转、认领。 */
class TicketDetailHandler extends Handler {
  ticket!: TicketDoc;
  mod = false;

  @param('id', Types.String)
  async _prepare(domainId: string, id: string) {
    const t = await getTicket(domainId, id);
    if (!t) throw new NotFoundError(id);
    this.mod = isMod(this.user);
    if (t.owner !== this.user._id && !this.mod) throw new TicketForbiddenError('无权查看该工单');
    this.ticket = t;
  }

  private canReply(): boolean {
    if (this.mod) return true;
    return this.ticket.status !== 'closed' && this.ticket.status !== 'done';
  }

  @param('id', Types.String)
  async get(domainId: string, id: string) {
    const t = this.ticket;
    const udict = await UserModel.getList(domainId, collectUids(t));
    let pdoc: any = null;
    try { pdoc = await ProblemModel.get(domainId, t.pid); } catch { pdoc = null; }

    this.response.template = 'ticket_detail.html';
    this.response.body = {
      ticket: { ...t, tid: t._id.toString() },
      udict, pdoc,
      mod: this.mod,
      canReply: this.canReply(),
      categoryMeta: CATEGORIES[t.category] || CATEGORIES.statement,
      statuses: STATUSES, statusKeys: STATUS_KEYS,
    };
  }

  @param('content', Types.Content)
  async postReply(domainId: string, content: string) {
    if (!this.canReply()) throw new TicketForbiddenError('该工单已关闭或已完成，无法继续回复');
    await this.limitRate('ticket_reply', 30, 10);
    const t = this.ticket;
    const args = this.args as Record<string, any>;
    const markReplied = this.mod
      && (args.mark_replied === 'on' || args.mark_replied === true || args.mark_replied === 'true');

    let next: TicketStatus | null = null;
    if (markReplied && t.status !== 'closed' && t.status !== 'done') next = 'replied';
    else if (!this.mod && t.status === 'replied') next = 'processing';

    const patch: Record<string, any> = {};
    const logs = [...(t.logs || [])];
    if (next && next !== t.status) {
      patch.status = next;
      logs.push({ at: new Date(), uid: this.user._id, text: `状态由「${STATUSES[t.status]}」变更为「${STATUSES[next]}」` });
    }
    patch.logs = logs;

    await pushReply(t, {
      _id: new ObjectId(), uid: this.user._id, content, at: new Date(), isMod: this.mod,
    }, patch);
    this.response.redirect = this.url('ticket_detail', { id: t._id.toString() });
  }

  @param('status', Types.String)
  async postSetStatus(domainId: string, status: string) {
    if (!this.mod) throw new TicketForbiddenError('只有 MOD_BADGE 用户可以修改工单状态');
    if (!(STATUS_KEYS as readonly string[]).includes(status)) throw new TicketError('无效的工单状态');
    await changeStatus(this.ticket, status as TicketStatus, this.user._id);
    this.response.redirect = this.url('ticket_detail', { id: this.ticket._id.toString() });
  }

  async postClaim(domainId: string) {
    if (!this.mod) throw new TicketForbiddenError('只有 MOD_BADGE 用户可以认领工单');
    const t = this.ticket;
    if (t.assignee && t.assignee !== this.user._id) throw new TicketError('该工单已被其他管理员认领');
    await claim(t, this.user._id);
    this.response.redirect = this.url('ticket_detail', { id: t._id.toString() });
  }

  async postUnclaim(domainId: string) {
    if (!this.mod) throw new TicketForbiddenError('只有 MOD_BADGE 用户可以认领工单');
    if (this.ticket.assignee !== this.user._id) throw new TicketError('你没有认领该工单');
    await unclaim(this.ticket, this.user._id);
    this.response.redirect = this.url('ticket_detail', { id: this.ticket._id.toString() });
  }
}

export async function apply(ctx: Context) {
  ctx.Route('ticket_main', '/ticket', TicketMainHandler, PRIV.PRIV_USER_PROFILE);
  ctx.Route('ticket_create', '/ticket/new/:pid', TicketCreateHandler, PRIV.PRIV_USER_PROFILE);
  ctx.Route('ticket_detail', '/ticket/:id', TicketDetailHandler, PRIV.PRIV_USER_PROFILE);

  // Nav 节点会走 url(item.name, item.args) 并用 item.args.prefix 判断高亮。
  ctx.injectUI('Nav', 'ticket_main', {
    prefix: 'ticket', displayName: '工单', icon: 'flag',
  }, PRIV.PRIV_USER_PROFILE);
  ctx.injectUI('UserDropdown', 'ticket_main', {
    icon: 'flag', displayName: '我的工单',
  }, PRIV.PRIV_USER_PROFILE);
  ctx.injectUI('DomainManage', 'ticket_main', {
    family: '工单', icon: 'flag', displayName: '工单面板',
  }, (h: Handler) => isMod(h.user));

  ctx.i18n.load('zh', {
    '工单': '工单',
    '我的工单': '我的工单',
    '工单面板': '工单面板',
    'Ticket': '工单',
    'ticket_main': '工单',
  });
  ctx.i18n.load('en', {
    '工单': 'Tickets',
    '我的工单': 'My Tickets',
    '工单面板': 'Ticket Panel',
    'ticket_main': 'Tickets',
  });

  ctx.on('app/ready', async () => {
    try { await ensureIndexes(); } catch (e) {
      console.error('[hydrooj-plugin-ticket] createIndex failed:', e);
    }
  });
}
