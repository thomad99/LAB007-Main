(() => {
  const links = [
    ['Home', '/'],
    ['Web-Dashboard', '/tomopi'],
    ['Digital Marketing', '/digitalmarketing'],
    ['CursorAI', '/cursorai'],
    ['BUCK', 'https://buck-lab007.onrender.com/'],
    ['007Trade', '/007trade'],
    ['Elite Cleaning', '/elite-cleaning'],
    ['Citrix-2-HZ', '/citrix'],
    ['Web-Alerts', '/webalert'],
    ['Contact', '/contact']
  ];

  const style = document.createElement('style');
  style.textContent = `
    .lab007MenuButton{position:fixed;top:18px;right:18px;z-index:10000;width:48px;height:48px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,18,.76);color:#f6f8ff;font-size:25px;font-weight:950;line-height:1;display:grid;place-items:center;box-shadow:0 12px 34px rgba(0,0,0,.32);backdrop-filter:blur(14px);cursor:pointer}
    .lab007MenuButton:hover{background:rgba(18,28,42,.9);border-color:rgba(118,244,197,.48)}
    .lab007Menu{position:fixed;top:76px;right:18px;z-index:10001;display:none;min-width:270px;max-width:min(360px,calc(100vw - 36px));padding:10px;border:1px solid rgba(255,255,255,.16);border-radius:20px;background:rgba(8,12,18,.95);box-shadow:0 20px 60px rgba(0,0,0,.44);backdrop-filter:blur(16px);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:-.01em}
    .lab007Menu.open{display:block}.lab007Menu a{display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:14px;color:#f6f8ff!important;text-decoration:none!important;font-weight:780;font-size:15px;line-height:1.15;letter-spacing:.005em}.lab007Menu a:hover,.lab007Menu a.active{background:rgba(118,244,197,.12);color:#76f4c5!important}
    .lab007MenuIcon{width:28px;height:28px;object-fit:contain;border-radius:8px;filter:drop-shadow(0 0 10px rgba(118,244,197,.34));flex:0 0 auto}
    @media print{.lab007MenuButton,.lab007Menu{display:none!important}}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.className = 'lab007MenuButton';
  button.type = 'button';
  button.setAttribute('aria-label', 'Open navigation menu');
  button.textContent = '\u2630';
  const menu = document.createElement('nav');
  menu.className = 'lab007Menu';
  menu.setAttribute('aria-label', 'LAB007 navigation');
  const current = location.pathname.replace(/\/index\.html$/, '/').replace(/\/elite-cleaning\.html$/, '/elite-cleaning') || '/';
  menu.innerHTML = links.map(([label, href, icon]) => {
    const isActive = href === current || (href === '/elite-cleaning' && current.startsWith('/elite-cleaning'));
    return `<a href="${href}"${isActive ? ' class="active"' : ''}${href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${icon ? `<img class="lab007MenuIcon" src="${icon}" alt="" loading="lazy">` : ''}<span>${label}</span></a>`;
  }).join('');
  button.addEventListener('click', (event) => { event.stopPropagation(); menu.classList.toggle('open'); });
  document.addEventListener('click', event => { if (!event.target.closest('.lab007Menu') && !event.target.closest('.lab007MenuButton')) menu.classList.remove('open'); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') menu.classList.remove('open'); });
  document.body.prepend(menu);
  document.body.prepend(button);
})();
