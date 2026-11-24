// Dos Santos Jesus: menu drawer and live date details.
(() => {
  const root = document.documentElement;
  const body = document.body;
  const base = body.dataset.root || './';   // path back to the site root from this page
  const current = body.dataset.page || '';  // which menu entry is this page

  /* ---------- menu entries (edit here; every page uses this list) ---------- */
  const MENU = [
    { key: 'home', title: 'Home', sub: 'Front page', href: '' },
    { key: 'tracking', title: 'Start Tracking', sub: 'Meals, exercise and calendar', href: 'tracking/', primary: true },
    { key: 'progress', title: 'Progress', sub: 'Streaks and trends', soon: true },
    { key: 'about', title: 'About', sub: "Who's behind this", soon: true },
    { group: 'Personal' },
    { key: 'notes', title: 'Personal Notes', sub: 'Thoughts, plans and reminders', href: 'notes/', notes: true }
  ];
  const ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  const btn = document.querySelector('.menu-btn');
  const drawer = document.getElementById('menu');
  const scrim = document.querySelector('.scrim');
  const page = document.querySelector('.page');
  if (!btn || !drawer) return;

  function buildMenu() {
    const rows = MENU.map((m, i) => {
      const next = MENU[i + 1];
      const cls = next && next.group ? ' class="before-group"' : '';
      if (m.group) return `<li class="group" style="--i:${i}"><p class="menu-group">${m.group}</p></li>`;
      const text = `<span class="mi-text"><span class="mi-title">${m.title}</span><span class="mi-sub">${m.sub}</span></span>`;
      if (m.soon) return `<li${cls} style="--i:${i}"><span class="menu-item soon" aria-disabled="true">${text}<span class="badge">Soon</span></span></li>`;
      const here = m.key === current ? ' aria-current="page"' : '';
      const kind = (m.primary ? ' primary' : '') + (m.notes ? ' notes' : '');
      return `<li${cls} style="--i:${i}"><a class="menu-item${kind}" href="${base}${m.href}"${here}>${text}<span class="mi-arrow">${ARROW}</span></a></li>`;
    }).join('');
    drawer.innerHTML =
      `<div class="drawer-scroll"><p class="drawer-label">Menu</p><ul class="menu-list">${rows}</ul></div>` +
      `<p class="drawer-foot">Dos Santos Jesus · Tracking System</p>`;
  }
  buildMenu();

  /* ---------- fade options in and out while the list scrolls ---------- */
  const scroller = drawer.querySelector('.drawer-scroll');
  const items = [...drawer.querySelectorAll('.menu-item, .menu-group')];
  const ZONE = 84; // px over which an option fades near the top or bottom edge
  const clamp = v => Math.max(0, Math.min(1, v));
  let frame = 0;
  function paint() {
    frame = 0;
    const box = scroller.getBoundingClientRect();
    const max = scroller.scrollHeight - scroller.clientHeight;
    const top = scroller.scrollTop;
    const topK = max > 1 ? clamp(top / ZONE) : 0;          // fade the top edge only once scrolled
    const botK = max > 1 ? clamp((max - top) / ZONE) : 0;  // fade the bottom edge only while more is below
    scroller.style.setProperty('--ft', (topK * 28).toFixed(1) + 'px');
    scroller.style.setProperty('--fb', (botK * 36).toFixed(1) + 'px');
    for (const el of items) {
      const r = el.getBoundingClientRect();
      const mid = (r.top + r.bottom) / 2;
      const fromTop = 1 - (1 - clamp((mid - box.top) / ZONE)) * topK;
      const fromBottom = 1 - (1 - clamp((box.bottom - mid) / ZONE)) * botK;
      const v = Math.min(fromTop, fromBottom);
      el.style.setProperty('--v', v.toFixed(3));
      el.style.setProperty('--dir', fromTop < fromBottom ? '-1' : '1');
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  scroller.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  /* ---------- open and close ---------- */
  const isOpen = () => root.classList.contains('menu-open');
  function setOpen(open, returnFocus) {
    if (open) { scroller.scrollTop = 0; paint(); }
    root.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    drawer.inert = !open;
    if (page) page.inert = open;
    if (open) {
      const first = drawer.querySelector('a.menu-item');
      setTimeout(() => first && first.focus({ preventScroll: true }), 90);
    } else if (returnFocus) {
      btn.focus({ preventScroll: true });
    }
  }
  drawer.inert = true;
  btn.addEventListener('click', () => setOpen(!isOpen(), true));
  if (scrim) scrim.addEventListener('click', () => setOpen(false, true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) setOpen(false, true); });
  drawer.addEventListener('click', e => {
    const link = e.target.closest('a.menu-item');
    if (link && link.getAttribute('aria-current') === 'page') { e.preventDefault(); setOpen(false, true); }
  });
  // Coming back with the browser's Back button shows the page with the menu closed.
  window.addEventListener('pageshow', () => { if (isOpen()) setOpen(false, false); });

  /* ---------- live date details: today, ISO week, day of the year ---------- */
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const isoDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dayOfYear = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(now.getFullYear(), 0, 1)) / 86400000) + 1;
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // Thursday of this ISO week
  const week = Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);

  document.querySelectorAll('[data-today]').forEach(el => {
    el.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (el.tagName === 'TIME') el.dateTime = isoDate;
  });
  document.querySelectorAll('[data-week]').forEach(el => { el.textContent = pad(week); });
  document.querySelectorAll('[data-day]').forEach(el => { el.textContent = String(dayOfYear).padStart(3, '0'); });
  const days = document.querySelectorAll('.days li');
  if (days.length === 7) {
    const today = days[(now.getDay() + 6) % 7];
    today.classList.add('today');
    today.setAttribute('aria-current', 'date');
  }
})();
