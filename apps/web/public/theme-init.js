// Applies the saved theme before first paint (no flash of the wrong theme).
// Kept as a static file so the CSP can forbid inline scripts.
try {
  var t = localStorage.getItem('devhub.theme') || 'system';
  var dark =
    t === 'dark' ||
    t === 'cyberpunk' ||
    (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = t === 'system' ? (dark ? 'dark' : 'light') : t;
  document.documentElement.classList.toggle('dark', dark);
} catch (e) {}
