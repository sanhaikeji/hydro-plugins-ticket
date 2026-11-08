import './ticket.page.css';
import { addPage, AutoloadPage } from '@hydrooj/ui-default';
import { initTicketMotion } from './ticket.motion';

declare global {
  interface Window {
    UiContext?: any;
  }
}

/** 题目详情页把 problemId / pdoc 写进 window.UiContext；子页面则从侧边栏链接或 URL 兜底。 */
function resolvePid(): string {
  const uc = window.UiContext || {};
  const raw = uc.pdoc?.pid ?? uc.problemId ?? uc.pdoc?.docId ?? uc.problemNumId;
  if (raw !== undefined && raw !== null && String(raw).length > 0) return String(raw);

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.section--problem-sidebar a[href]'));
  for (const a of links) {
    const m = a.getAttribute('href')?.match(/\/p\/([^/?#]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  const m = window.location.pathname.match(/\/p\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

/**
 * 在题目右侧边栏插入「题目反馈」按钮。
 * 用 AutoloadPage：所有渲染了 problem_sidebar 的页面（题面 / 提交 / 题解 / 文件 / 统计 / 比赛内题目）
 * 都会带上按钮，且不依赖具体 page_name。
 */
function injectProblemButton() {
  if (document.querySelector('[data-ticket-feedback]')) return;
  const menu = document.querySelector<HTMLElement>('.section--problem-sidebar ol.menu');
  if (!menu) return;

  const pid = resolvePid();
  const sep = document.createElement('li');
  sep.className = 'menu__seperator tk-feedback-sep';

  const li = document.createElement('li');
  li.className = 'menu__item';
  const a = document.createElement('a');
  a.className = 'menu__link tk-feedback-btn';
  a.setAttribute('data-ticket-feedback', '1');
  a.href = pid ? `/ticket/new/${encodeURIComponent(pid)}` : '/ticket';
  a.title = '对这道题目提交反馈工单';
  const icon = document.createElement('span');
  icon.className = 'icon icon-comment--text';
  a.append(icon, document.createTextNode(' 题目反馈'));
  li.appendChild(a);
  menu.append(sep, li);
}

/** Hero 里那团弥散光斑跟随鼠标，呼应参考视频里的柔和光感。 */
function bindHeroLight() {
  const hero = document.querySelector<HTMLElement>('.tk-hero');
  if (!hero) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  hero.addEventListener('mousemove', (e) => {
    const rect = hero.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    hero.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width * 100).toFixed(1)}%`);
    hero.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height * 100).toFixed(1)}%`);
  });
  hero.addEventListener('mouseleave', () => {
    hero.style.removeProperty('--mx');
    hero.style.removeProperty('--my');
  });
}

// 全部走 AutoloadPage + DOM 探测：不依赖 Hydro 的 page_name 命名，也不会在未使用页面报错。
addPage(new AutoloadPage('ticket_feedback_button', injectProblemButton));
addPage(new AutoloadPage('ticket_hero_light', bindHeroLight));
// 三套逐帧复刻的动效：色块旋转展开、状态卡堆叠旋转、圆形扩散主题切换
addPage(new AutoloadPage('ticket_motion', () => initTicketMotion(document)));
