/**
 * Production security hardening.
 * Disables DevTools access, right-click, and common inspection shortcuts.
 * Only active in production builds.
 */

export function initSecurityGuard(): void {
  // Only active in production AND not inside an iframe (preview)
  if (!import.meta.env.PROD || window.self !== window.top) return;

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

  // IMPORTANT: never replace the DOM or block access using viewport-size heuristics.
  // Those checks create false positives in previews, embedded contexts and some browsers.
}
