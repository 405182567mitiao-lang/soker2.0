/* Adapt the recovered presentation's controls without changing its scene choreography. */
const controls = document.querySelectorAll('[role="button"], .navigation-item, .footer-mobile-navigation-inner-item');
controls.forEach(control => {
  control.setAttribute('tabindex', '0');
  control.setAttribute('role', 'button');
  control.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      control.click();
    }
  });
});

let returnFocus = null;
const dialogs = [...document.querySelectorAll('[role="dialog"]')];
const closeDialogs = () => {
  document.dispatchEvent(new CustomEvent('soker:close-dialog'));
};
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', closeDialogs));

document.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link) return;
  const destination = link.getAttribute('href');
  const index = { '#section-0': 0, '#section-3': 1, '#section-12': 2 }[destination];
  if (index !== undefined) {
    event.preventDefault();
    document.dispatchEvent(new CustomEvent('soker:navigate', { detail: { index } }));
  } else if (destination === '#workflow') {
    event.preventDefault();
    document.dispatchEvent(new CustomEvent('soker:workflow'));
  }
});

dialogs.forEach(dialog => {
  dialog.setAttribute('aria-hidden', 'true');
  dialog.inert = true;
  new MutationObserver(() => {
    const open = dialog.classList.contains('--is-opened');
    dialog.setAttribute('aria-hidden', String(!open));
    dialog.inert = !open;
    if (open) {
      returnFocus = document.activeElement;
      dialog.querySelector('[data-close-dialog]')?.focus({ preventScroll: true });
    } else if (dialog.contains(document.activeElement)) {
      returnFocus?.focus({ preventScroll: true });
    }
  }).observe(dialog, { attributes: true, attributeFilter: ['class'] });
});

document.addEventListener('keydown', event => {
  const dialog = dialogs.find(item => item.classList.contains('--is-opened'));
  if (!dialog) return;
  if (event.key === 'Escape') closeDialogs();
  if (event.key === 'Tab') {
    const items = [...dialog.querySelectorAll('a[href], button, [tabindex="0"]')];
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});

const betaPanel = document.getElementById('soker-beta');
if (betaPanel) {
  ['wheel', 'touchstart', 'touchmove'].forEach(type => {
    betaPanel.addEventListener(type, event => event.stopPropagation(), { passive: true });
  });
  betaPanel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape' && !betaPanel.querySelector('dialog[open]')) document.dispatchEvent(new CustomEvent('soker:beta-back'));
  });
  betaPanel?.querySelector('[data-beta-back]')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('soker:beta-back'));
    // 回到首屏：3D 首屏的入场文字只在首次载入时播放一次，回到顶部不会重播，
    // 所以这里清掉 #beta 锚点后重新进入首页，保证看到的是完整的「Soker 获客助手」首屏
    location.replace(location.pathname + location.search);
  });

}
document.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (link?.getAttribute('href') === '#beta') {
    event.preventDefault();
    document.dispatchEvent(new CustomEvent('soker:beta'));
  }
  if (['#beta-apply', '#join'].includes(link?.getAttribute('href'))) {
    event.preventDefault();
    document.getElementById(link.getAttribute('href').slice(1))?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
});

/* Pause the guided playback whenever the visitor takes control. */
const playbackButton = document.createElement('button');
playbackButton.type = 'button';
playbackButton.id = 'soker-playback';
playbackButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
playbackButton.setAttribute('aria-pressed', 'false');
playbackButton.setAttribute('aria-label', '自动缓慢播放产品介绍');
/* 容器缺失时不要中断整个脚本——后面还有目录切换与弹窗滚动逻辑 */
document.getElementById('ui')?.append(playbackButton);
const pausePlayback = () => document.dispatchEvent(new CustomEvent('soker:playback', { detail: { playing: false } }));
playbackButton.addEventListener('click', event => {
  event.stopPropagation();
  document.dispatchEvent(new CustomEvent('soker:playback'));
});
document.addEventListener('soker:playback-state', event => {
  const playing = event.detail.playing;
  playbackButton.innerHTML = playing
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM14 5h4v14h-4z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  playbackButton.setAttribute('aria-pressed', String(playing));
  playbackButton.setAttribute('aria-label', playing ? '暂停自动播放' : '自动缓慢播放产品介绍');
});
['wheel', 'touchstart', 'pointerdown'].forEach(type => document.addEventListener(type, event => {
  if (!playbackButton.contains(event.target)) pausePlayback();
}, { passive: true, capture: true }));
document.addEventListener('keydown', event => {
  if (!playbackButton.contains(event.target) && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Escape', 'Tab'].includes(event.key)) pausePlayback();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pausePlayback(); });

/* ---------- 使用指南：左侧目录切换 ---------- */
const guideTabs = [...document.querySelectorAll('.soker-guide-tab')];
const guidePanels = [...document.querySelectorAll('.soker-guide-panel')];
const guideScroll = document.querySelector('.soker-guide-panels');
const activateGuide = key => {
  guideTabs.forEach(tab => {
    const on = tab.dataset.guide === key;
    tab.classList.toggle('--active', on);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  guidePanels.forEach(panel => {
    const on = panel.dataset.panel === key;
    panel.classList.toggle('--active', on);
    panel.hidden = !on;
  });
  // 换栏目时回到顶部，避免上一个栏目滚到底后新内容从中间开始
  if (guideScroll) guideScroll.scrollTop = 0;
};
guideTabs.forEach(tab => {
  tab.addEventListener('click', () => activateGuide(tab.dataset.guide));
  tab.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const next = guideTabs[(guideTabs.indexOf(tab) + step + guideTabs.length) % guideTabs.length];
    activateGuide(next.dataset.guide);
    next.focus({ preventScroll: true });
  });
});
if (guideTabs.length) activateGuide('what');

/* ---------- 联系我们 ---------- */
const contactLayer = document.getElementById('soker-contact');
const guideContainer = document.getElementById('live-demo-container');
const setContactOpen = open => {
  contactLayer?.classList.toggle('--is-open', open);
  guideContainer?.classList.toggle('--contact-open', open);
};
const closeContact = () => setContactOpen(false);
document.querySelectorAll('[data-open-contact]').forEach(button => {
  button.addEventListener('click', () => {
    if (!contactLayer) return;
    setContactOpen(true);
    contactLayer.querySelector('[data-close-contact]')?.focus({ preventScroll: true });
  });
});
document.querySelectorAll('[data-close-contact]').forEach(button => button.addEventListener('click', closeContact));
contactLayer?.addEventListener('click', event => { if (event.target === contactLayer) closeContact(); });
document.addEventListener('soker:close-dialog', closeContact);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && contactLayer?.classList.contains('--is-open')) {
    event.stopPropagation();
    closeContact();
  }
}, { capture: true });

/* 从指南里点“预约内测”时，先收起弹窗 */
document.querySelectorAll('[data-guide-beta]').forEach(link => {
  link.addEventListener('click', () => closeDialogs());
});

/* ---------- 弹窗内滚动 ---------- */
/* 首页用的是全屏滚动系统，它会对 wheel 调用 preventDefault，弹窗里的长内容
   （尤其常见问题）因此滚不动。stopPropagation 单独用也不行——事件到不了目标，
   浏览器就不知道该滚哪个容器。所以在捕获阶段直接接管，手动改 scrollTop。 */
const scrollPaneOf = node =>
  node instanceof Element
    ? node.closest('.soker-guide-panels') || node.closest('.soker-contact')
    : null;
window.addEventListener('wheel', event => {
  const pane = scrollPaneOf(event.target);
  if (!pane) return;
  const max = pane.scrollHeight - pane.clientHeight;
  if (max <= 0) return;
  event.preventDefault();
  event.stopPropagation();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pane.clientHeight : 1;
  const next = pane.scrollTop + event.deltaY * unit;
  pane.scrollTop = Math.max(0, Math.min(max, next));
}, { capture: true, passive: false });
