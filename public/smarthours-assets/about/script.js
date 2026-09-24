const asset = '/SmartHours/assets/about/';
const themes = {
  autumn: {
    src: asset + 'theme-autumn.webp',
    alt: 'Autumn background with warm leaves and space for opening hours',
    title: 'Autumn / warm & welcoming'
  },
  christmas: {
    src: asset + 'theme-christmas.webp',
    alt: 'Christmas opening-hours artwork with a tree, snowman and festive border',
    title: 'Christmas / a festive welcome'
  },
  barber: {
    src: asset + 'theme-barber.webp',
    alt: 'Portrait barber shop background with a barber pole and space for opening hours',
    title: 'Barber shop / made for your business'
  },
  neon: {
    src: asset + 'theme-neon.webp',
    alt: 'Autumn opening-hours artwork with a neon-style design',
    title: 'Neon style / a bold seasonal look'
  }
};
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTheme(tab, focus = false) {
  const theme = themes[tab.dataset.theme];
  tabs.forEach((item) => {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
  });
  const image = document.getElementById('theme-image');
  image.src = theme.src;
  image.alt = theme.alt;
  document.getElementById('theme-title').textContent = theme.title;
  document.getElementById('theme-panel').setAttribute('aria-labelledby', tab.id);
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTheme(tab));
  tab.addEventListener('keydown', (event) => {
    let next = index;
    if (['ArrowDown', 'ArrowRight'].includes(event.key)) next = (index + 1) % tabs.length;
    else if (['ArrowUp', 'ArrowLeft'].includes(event.key)) next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTheme(tabs[next], true);
  });
});
