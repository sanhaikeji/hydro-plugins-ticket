// @ts-nocheck
/* 本文件刻意写成纯 JS（挂 DOM 自定义属性、无类型标注），便于离线预览直接转译复用。
 * hydrooj-plugin-ticket · 动效层（唯一动效源码）
 *
 * 帧级依据：把两个参考视频的 mp4 拉下来，用 ffmpeg 按 0.067s / 0.1s 间隔逐帧拆解后复刻。
 *
 *  A. BV14Q4y1z7bW 5.0~8.4s「storehouse 选择」
 *     右侧列表切换 → 左侧大色块从右上以 rotate(-28deg)+scale(.08) 弹性展开到
 *     rotate(0)+scale(1)，并带 1.08 的 overshoot；旧色块 rotate(16deg)+scale(1.35)
 *     模糊淡出；大标题被 scaleX(1.6) 挤压后回弹；主体图形 rotate(-42deg)+scale(.35)
 *     旋转放大进场。一次切换 0.45~0.55s（实测 6.0s 黄→绿、7.7s 绿→紫）。
 *     → 本文件 initStageSwitch() + CSS tk-blob-in / tk-blob-out / tk-title-squash / tk-art-in
 *
 *  B. BV1Zg411C7D4 4.8~6.2s「卡片切换」
 *     右侧 › 点击 → 当前卡 rotate(±13deg)+scale(1.08~1.15)，带 3 层堆叠残影；
 *     旧卡向左后旋出 + blur 淡出，新卡从右侧 rotate(14deg)+scale(.78) 旋转放大进入，
 *     0.26~0.35s 归位。→ 本文件 initStatusDeck() + CSS tk-card-out / tk-card-in
 *
 *  C. BV1Zg411C7D4 2.8~3.6s「圆形扩散主题切换」
 *     一个巨大白色圆形从右下角开关处 scale(0) 扩散覆盖整页，把暗色擦成亮色。
 *     → 本文件 initThemeReveal() + CSS tk-reveal
 *
 * 本文件刻意只用纯 JS 语法（无类型标注），这样离线预览页可以用
 * typescript.transpileModule 内联同一份源码，保证预览与线上动效完全一致。
 */

function tkReplay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  // 强制重排，让同名 animation 能重新播放
  void el.offsetWidth;
  el.classList.add(cls);
}

function tkReduced() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** A. 提交反馈页：右侧分类切换 → 左侧大色块旋转放大展开 */
function initStageSwitch(root) {
  const board = root.querySelector('[data-tk-board]');
  if (!board) return;
  const form = board.closest('form') || root.querySelector('#tk-create-form');
  const stage = board.querySelector('[data-tk-stage]');
  const blob = board.querySelector('[data-tk-blob]');
  const titleEl = board.querySelector('[data-tk-title]');
  const descEl = board.querySelector('[data-tk-desc]');
  const indexEl = board.querySelector('[data-tk-index]');
  const artEl = board.querySelector('[data-tk-art]');
  const artImgs = artEl ? Array.prototype.slice.call(artEl.querySelectorAll('[data-tk-art-img]')) : [];
  const fieldzone = board.querySelector('[data-tk-fieldzone]');
  const cats = Array.prototype.slice.call(board.querySelectorAll('.tk-cat'));
  const groups = Array.prototype.slice.call(board.querySelectorAll('.tk-fields'));
  const titleInput = form && form.querySelector('#tk-title');
  if (!blob || !form || !cats.length) return;

  let titlePristine = true;
  if (titleInput) {
    titleInput.addEventListener('input', () => { titlePristine = false; });
  }

  function syncFields(key) {
    for (const g of groups) {
      const on = g.getAttribute('data-category') === key;
      g.hidden = !on;
      const ctrls = g.querySelectorAll('input, textarea, select');
      for (const c of ctrls) c.disabled = !on;
    }
  }

  function activate(cat, animate) {
    const key = cat.getAttribute('data-category');
    const label = cat.getAttribute('data-label') || '';
    const hint = cat.getAttribute('data-hint') || '';
    const idx = cat.getAttribute('data-index') || '0';
    const generatedTitle = cat.getAttribute('data-title') || '';
    const prev = board.getAttribute('data-active');
    const changed = prev !== key;
    const motion = animate && changed && !tkReduced();

    if (changed && motion) {
      // 旧色块原地旋出，新色块从右上弹性展开盖上来（视频 A 的 6.0s / 7.7s）
      const ghost = document.createElement('div');
      ghost.className = 'tk-stage__blob tk-stage__blob--out';
      ghost.style.setProperty('--tk-accent', 'var(--tk-cat-' + prev + ')');
      stage.appendChild(ghost);
      ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
      setTimeout(() => ghost.remove(), 1200);
      tkReplay(blob, 'is-enter');
      tkReplay(stage, 'is-swap');
    }

    board.setAttribute('data-active', key);
    // 主体图形：3D 实物图随分类切换（is-on 控制显隐，切换时机与色块同步）
    for (const im of artImgs) im.classList.toggle('is-on', im.getAttribute('data-cat') === key);
    if (titleEl) titleEl.textContent = label;
    if (descEl) descEl.textContent = hint;
    if (indexEl) indexEl.textContent = String(Number(idx) + 1).padStart(2, '0');

    if (motion) {
      tkReplay(titleEl, 'is-enter');   // scaleX 挤压回弹
      tkReplay(descEl, 'is-enter');
      tkReplay(artEl, 'is-enter');     // 旋转放大
      tkReplay(fieldzone, 'is-enter'); // 字段区 3D 抬入
      tkReplay(cat, 'is-bump');        // 选中行轻微弹一下
    }

    for (const c of cats) c.classList.toggle('active', c === cat);
    const radio = cat.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
    syncFields(key);
    if (titleInput && titlePristine && generatedTitle) titleInput.value = generatedTitle;

    // 让「下一步」按钮知道当前进度
    board.setAttribute('data-step', changed || animate ? '2' : '1');
  }

  for (const cat of cats) {
    cat.addEventListener('click', (e) => {
      // 点击行本身即选中（label + radio 的原生行为之外，再显式驱动一次动效）
      if (e.target && e.target.tagName === 'A') return;
      activate(cat, true);
    });
    const radio = cat.querySelector('input[type="radio"]');
    if (radio) radio.addEventListener('change', () => activate(cat, true));
    // 键盘可达
    cat.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(cat, true); }
    });
  }

  const first = cats.filter((c) => c.classList.contains('active'))[0] || cats[0];
  activate(first, false);

  // 浮动胶囊工具条里的深色圆形 → ：滚到补充区并高亮（对应 storehouse 的下一步）
  const next = board.querySelector('[data-tk-next]');
  if (next) {
    next.addEventListener('click', () => {
      const after = root.querySelector('[data-tk-after]');
      if (!after) return;
      after.scrollIntoView({ behavior: tkReduced() ? 'auto' : 'smooth', block: 'center' });
      tkReplay(after, 'is-focus');
    });
  }

  // 预览页用：暴露手动切换，供自动演示 / 截图
  board.__tkActivate = (key) => {
    const target = cats.filter((c) => c.getAttribute('data-category') === key)[0];
    if (target) activate(target, true);
  };
  board.__tkKeys = cats.map((c) => c.getAttribute('data-category'));
}

/** B. 详情页状态卡：右侧 ‹ › 切换 → 左侧卡片堆叠旋转 + 大幅缩放 */
function initStatusDeck(root) {
  const deck = root.querySelector('[data-tk-deck]');
  if (!deck) return;
  const cards = Array.prototype.slice.call(deck.querySelectorAll('[data-tk-deck-card]'));
  const label = deck.querySelector('[data-tk-deck-label]');
  if (cards.length < 2) return;
  let cur = 0;
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].classList.contains('is-current')) cur = i;
  }
  // 必须先确定 cur 再统一设置 hidden，否则边算边设会让前两张卡同时可见
  for (let i = 0; i < cards.length; i++) cards[i].hidden = i !== cur;
  if (label) label.textContent = (cur + 1) + ' / ' + cards.length;

  function go(dir) {
    const next = (cur + dir + cards.length) % cards.length;
    if (next === cur) return;
    const old = cards[cur];
    const incoming = cards[next];
    old.classList.remove('is-in');
    incoming.classList.remove('is-out');
    tkReplay(old, 'is-out');
    incoming.hidden = false;
    tkReplay(incoming, 'is-in');
    tkReplay(deck, 'is-flipping');
    const finish = () => {
      old.hidden = true;
      old.classList.remove('is-out', 'is-in', 'is-current');
      incoming.classList.remove('is-in');
      incoming.classList.add('is-current');
      deck.classList.remove('is-flipping');
    };
    if (tkReduced()) finish(); else setTimeout(finish, 380);
    cur = next;
    if (label) label.textContent = (cur + 1) + ' / ' + cards.length;
  }

  const prevBtn = deck.querySelector('[data-tk-deck-prev]');
  const nextBtn = deck.querySelector('[data-tk-deck-next]');
  if (prevBtn) prevBtn.addEventListener('click', () => go(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => go(1));
  deck.__tkGo = go;
}

/** C. 圆形扩散主题切换：从按钮圆心 scale 出整片新底色，中途换主题变量 */
function initThemeReveal(root) {
  const shell = root.querySelector('[data-tk-shell]') || root.querySelector('.tk-shell');
  if (!shell) return;
  const btn = shell.querySelector('[data-tk-theme]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const sr = shell.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const x = br.left + br.width / 2 - sr.left;
    const y = br.top + br.height / 2 - sr.top;
    const toDark = !shell.classList.contains('tk-dark');
    const reveal = document.createElement('div');
    reveal.className = 'tk-reveal';
    reveal.style.setProperty('--rx', x + 'px');
    reveal.style.setProperty('--ry', y + 'px');
    reveal.style.setProperty('--tk-reveal-bg', toDark ? '#111827' : '#f4f6fa');
    shell.appendChild(reveal);
    btn.setAttribute('aria-pressed', String(toDark));
    const toggle = () => shell.classList.toggle('tk-dark', toDark);
    if (tkReduced()) { toggle(); reveal.remove(); return; }
    setTimeout(toggle, 290);
    reveal.addEventListener('animationend', () => reveal.remove(), { once: true });
    setTimeout(() => reveal.remove(), 1200);
  });
}

export function initTicketMotion(root) {
  const scope = root || document;
  initStageSwitch(scope);
  initStatusDeck(scope);
  initThemeReveal(scope);
  return {
    stage: initStageSwitch,
    deck: initStatusDeck,
    theme: initThemeReveal,
  };
}
