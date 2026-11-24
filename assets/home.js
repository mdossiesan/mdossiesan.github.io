// Home page: reveal on scroll, scroll progress, section highlighting, feature tabs, live year numbers.
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const hasIO = 'IntersectionObserver' in window;

  /* ---------- sections fade up as they scroll into view ---------- */
  const reveal = document.querySelectorAll('[data-reveal]');
  if (hasIO) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    reveal.forEach(el => io.observe(el));
  } else reveal.forEach(el => el.classList.add('in'));

  /* ---------- top bar: shadow, progress line, DSJ logo after the hero title ---------- */
  const topbar = document.querySelector('.topbar');
  const progress = document.querySelector('.progress span');
  let ticking = false;
  function onScroll() {
    ticking = false;
    const max = root.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    if (progress) progress.style.transform = `scaleX(${p.toFixed(4)})`;
    if (topbar) topbar.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  const heroTitle = document.querySelector('.dsj');
  if (topbar && heroTitle && hasIO) {
    new IntersectionObserver(([e]) => topbar.classList.toggle('show-logo', !e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' }).observe(heroTitle);
  } else if (topbar) topbar.classList.add('show-logo');

  /* ---------- highlight the section you're in ---------- */
  const links = [...document.querySelectorAll('.toplinks a[href^="#"]')];
  const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  if (hasIO && links.length) {
    const spy = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach(a => a.removeAttribute('aria-current'));
        const a = byId.get(e.target.id);
        if (a) a.setAttribute('aria-current', 'true');
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* ---------- feature tabs ---------- */
  const tabs = [...document.querySelectorAll('.tablist [role="tab"]')];
  function select(i, focus) {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (!panel) return;
      panel.hidden = !on;
      if (on) { panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter'); }
    });
    if (focus) tabs[i].focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i, false));
    t.addEventListener('keydown', e => {
      const n = tabs.length;
      const map = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 };
      if (e.key in map) { e.preventDefault(); select(map[e.key], true); }
    });
  });

  /* ---------- live year numbers ---------- */
  const now = new Date();
  const y = now.getFullYear();
  const startOfDay = new Date(y, now.getMonth(), now.getDate());
  const dayOfYear = Math.round((startOfDay - new Date(y, 0, 1)) / 86400000) + 1;
  const daysInYear = Math.round((new Date(y + 1, 0, 1) - new Date(y, 0, 1)) / 86400000);
  const left = daysInYear - dayOfYear;
  const pct = Math.round(dayOfYear / daysInYear * 100);
  const set = (sel, v) => document.querySelectorAll(sel).forEach(el => { el.textContent = v; });
  set('[data-left]', String(left));
  set('[data-pct]', String(pct));
  set('[data-year]', String(y));
  set('[data-dayn]', String(dayOfYear));
  set('[data-daysin]', String(daysInYear));
  const fill = document.querySelector('.yearbar-t i');
  if (fill) {
    const go = () => { fill.style.width = (dayOfYear / daysInYear * 100).toFixed(1) + '%'; };
    if (hasIO) {
      const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { go(); o.disconnect(); } }, { threshold: 0.4 });
      o.observe(fill.parentElement);
    } else go();
  }
})();
