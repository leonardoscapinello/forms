/**
 * Production security hardening.
 * Disables DevTools access, right-click, and common inspection shortcuts.
 * Only active in production builds.
 */

export function initSecurityGuard(): void {
  if (!import.meta.env.PROD) return;

  // Disable right-click context menu
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Block common DevTools keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(e.key.toUpperCase())) ||
      (e.ctrlKey && e.key.toUpperCase() === 'U')
    ) {
      e.preventDefault();
    }
  });

  // Detect DevTools via size heuristic
  let devtoolsOpen = false;
  const check = () => {
    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    const isOpen = widthDiff > threshold || heightDiff > threshold;

    if (isOpen && !devtoolsOpen) {
      devtoolsOpen = true;
      // Instead of destroying the DOM, redirect away
      document.title = 'Access Denied';
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:#fff"><h1>⚠️ Acesso negado</h1></div>';
    } else if (!isOpen) {
      devtoolsOpen = false;
    }
  };
  setInterval(check, 1000);
}
