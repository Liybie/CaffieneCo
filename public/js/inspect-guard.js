(function () {
  'use strict';

  document.addEventListener(
    'contextmenu',
    (e) => {
      e.preventDefault();
    },
    { capture: true }
  );

  document.addEventListener(
    'keydown',
    (e) => {
      const key = (e.key || '').toUpperCase();

      if (key === 'F12') {
        e.preventDefault();
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && (key === 'I' || key === 'J' || key === 'C')) {
        e.preventDefault();
        return;
      }

      if (mod && !e.shiftKey && key === 'U') {
        e.preventDefault();
      }
    },
    { capture: true }
  );

  const isDesktop = () => window.matchMedia('(min-width: 769px)').matches;
  const threshold = 170;
  let overlay = null;

  function devToolsLikelyOpen() {
    if (!isDesktop()) return false;
    const widthGap = window.outerWidth - window.innerWidth;
    const heightGap = window.outerHeight - window.innerHeight;
    return widthGap > threshold || heightGap > threshold;
  }

  function showOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'inspect-guard-overlay';
    overlay.setAttribute('role', 'alert');
    overlay.innerHTML =
      '<div style="max-width:420px;padding:0 24px">' +
      '<h1 style="font-family:Georgia,serif;font-size:24px;margin:0 0 12px;color:#c8a97e">Developer Tools Disabled</h1>' +
      '<p style="margin:0;line-height:1.6;color:#d4c4a8">Please close inspect / developer tools to continue browsing this site.</p>' +
      '</div>';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      background: 'rgba(26, 18, 9, 0.97)',
      color: '#f5e6d3',
      fontFamily: 'Inter, system-ui, sans-serif'
    });
    document.body.appendChild(overlay);
  }

  function hideOverlay() {
    overlay?.remove();
    overlay = null;
  }

  setInterval(() => {
    if (devToolsLikelyOpen()) showOverlay();
    else hideOverlay();
  }, 750);
})();
