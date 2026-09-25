(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const track = document.getElementById('themeTrack');
  const prev = document.querySelector('.theme-nav.prev');
  const next = document.querySelector('.theme-nav.next');
  const dotsWrap = document.getElementById('themeDots');
  const status = document.getElementById('themeStatus');
  if (!track || !prev || !next || !dotsWrap) return;

  const slides = [...track.querySelectorAll('.theme-slide')];
  let index = 0;
  let drag = null;
  let timer = null;

  slides.forEach((slide, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-dot';
    button.setAttribute('role', 'tab');
    const name = slide.querySelector('figcaption strong');
    button.setAttribute('aria-label', name ? name.textContent : 'Example ' + (i + 1));
    button.addEventListener('click', () => go(i));
    dotsWrap.appendChild(button);
  });
  const dots = [...dotsWrap.children];

  function go(i, smooth = true) {
    index = (i + slides.length) % slides.length;
    const slide = slides[index];
    const trackRect = track.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const left = track.scrollLeft + (slideRect.left - trackRect.left) + slideRect.width / 2 - track.clientWidth / 2;
    track.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
    update();
    restart();
  }

  function nearest() {
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let dist = Infinity;
    slides.forEach((slide, i) => {
      const center = slide.offsetLeft + slide.offsetWidth / 2;
      const d = Math.abs(center - mid);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    index = best;
    update();
  }

  function update() {
    dots.forEach((dot, i) => {
      const active = i === index;
      if (active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
      dot.tabIndex = active ? 0 : -1;
    });
    const name = slides[index].querySelector('figcaption strong');
    if (status && name) {
      status.textContent = name.textContent + ' · ' + (index + 1) + ' of ' + slides.length;
    }
  }

  function restart() {
    window.clearInterval(timer);
    if (reduced) return;
    timer = window.setInterval(() => go(index + 1), 4200);
  }

  prev.addEventListener('click', () => go(index - 1));
  next.addEventListener('click', () => go(index + 1));

  track.addEventListener('scroll', () => {
    window.clearTimeout(track._snapTimer);
    track._snapTimer = window.setTimeout(nearest, 90);
  }, { passive: true });

  track.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(index - 1);
    }
  });

  track.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, scroll: track.scrollLeft };
    track.classList.add('is-dragging');
    track.setPointerCapture(event.pointerId);
    window.clearInterval(timer);
  });

  track.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    track.scrollLeft = drag.scroll - (event.clientX - drag.x);
  });

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    drag = null;
    track.classList.remove('is-dragging');
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    else {
      nearest();
      restart();
    }
  }

  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('mouseenter', () => window.clearInterval(timer));
  track.addEventListener('mouseleave', restart);

  update();
  restart();
})();
