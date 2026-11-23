// Dos Santos Jesus: menu drawer and live date details.
(() => {
  const root = document.documentElement;
  const btn = document.querySelector('.menu-btn');
  const drawer = document.getElementById('menu');
  const scrim = document.querySelector('.scrim');
  const page = document.querySelector('.page');

  const isOpen = () => root.classList.contains('menu-open');
  function setOpen(open, returnFocus) {
    root.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    drawer.inert = !open;
    if (page) page.inert = open;
    if (open) {
      const first = drawer.querySelector('a.menu-item');
      setTimeout(() => first && first.focus({ preventScroll: true }), 80);
    } else if (returnFocus) {
      btn.focus({ preventScroll: true });
    }
  }

  if (btn && drawer) {
    drawer.inert = true;
    btn.addEventListener('click', () => setOpen(!isOpen(), true));
    if (scrim) scrim.addEventListener('click', () => setOpen(false, true));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOpen()) setOpen(false, true);
    });
    drawer.addEventListener('click', e => {
      const link = e.target.closest('a.menu-item');
      if (link && link.getAttribute('aria-current') === 'page') { e.preventDefault(); setOpen(false, true); }
    });
    // Coming back with the browser's Back button should show the page with the menu closed.
    window.addEventListener('pageshow', () => { if (isOpen()) setOpen(false, false); });
  }

  // Live date details: today's date, ISO week number and day of the year.
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const isoDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - startOfYear) / 86400000) + 1;
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
