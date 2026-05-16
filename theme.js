(function () {
  const root = document.documentElement;

  function preferredTheme() {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    if (persist) localStorage.setItem('theme', theme);

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const isDark = theme === 'dark';
      button.setAttribute('aria-pressed', String(isDark));
      const icon = button.querySelector('.theme-toggle-icon');
      const text = button.querySelector('.theme-toggle-text');
      if (icon) icon.textContent = isDark ? '☀' : '☾';
      if (text) text.textContent = isDark ? 'Light' : 'Dark';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(preferredTheme(), false);

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next, true);
      });
    });
  });
})();
