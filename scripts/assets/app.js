// 閲覧ページ: スクロールでヘッダーを隠す / タップで表示切替 / 共有ボタン
(() => {
  const bar = document.getElementById('bar');
  const reader = document.getElementById('reader');
  if (bar) {
    let lastY = scrollY;
    addEventListener(
      'scroll',
      () => {
        const y = scrollY;
        if (Math.abs(y - lastY) < 8) return;
        bar.classList.toggle('is-hidden', y > lastY && y > 80);
        lastY = y;
      },
      { passive: true }
    );
    reader?.addEventListener('click', () => bar.classList.toggle('is-hidden'));
  }

  for (const btn of document.querySelectorAll('[data-share]')) {
    btn.addEventListener('click', async () => {
      const data = { title: btn.dataset.title, url: location.href };
      if (navigator.share) {
        try { await navigator.share(data); } catch {}
        return;
      }
      try {
        await navigator.clipboard.writeText(location.href);
        const label = btn.textContent;
        btn.textContent = 'コピーしました';
        setTimeout(() => (btn.textContent = label), 1500);
      } catch {
        prompt('このURLをコピーしてください', location.href);
      }
    });
  }
})();
