/*
 * JRC portfolio — filtering + shared-element lightbox.
 * No dependencies. Project data is read from the JSON block inside each card,
 * so the cards themselves stay crawlable static HTML.
 *
 * Transition contract: opening flies the thumbnail into place and closing flies
 * it back to the very same spot. The page scroll position is never touched.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-pf-root]');
  if (!root) return;

  var grid     = root.querySelector('[data-pf-grid]');
  var filters  = root.querySelectorAll('[data-pf-filter]');
  var countEl  = root.querySelector('[data-pf-count]');
  var items    = Array.prototype.slice.call(grid.querySelectorAll('.pf-item'));
  var reduce   = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------ filtering */

  function announce(shown) {
    if (!countEl) return;
    countEl.textContent = shown === items.length
      ? 'Showing all ' + items.length + ' projects'
      : 'Showing ' + shown + ' of ' + items.length + ' projects';
  }

  function applyFilter(cat) {
    var shown = 0;
    items.forEach(function (item) {
      var cats = (item.getAttribute('data-cats') || '').split(' ');
      var show = cat === 'all' || cats.indexOf(cat) !== -1;
      item.hidden = !show;
      if (show) shown++;
    });
    filters.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-pf-filter') === cat));
    });
    announce(shown);
  }

  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyFilter(btn.getAttribute('data-pf-filter'));
    });
  });
  announce(items.length);

  /* ------------------------------------------------ lightbox */

  var lb        = document.querySelector('[data-pf-lightbox]');
  if (!lb) return;
  var backdrop  = lb.querySelector('.pf-lb-backdrop');
  var stage     = lb.querySelector('[data-pf-stage]');
  var catEl     = lb.querySelector('[data-pf-lb-cat]');
  var nameEl    = lb.querySelector('[data-pf-lb-name]');
  var subEl     = lb.querySelector('[data-pf-lb-sub]');
  var counterEl = lb.querySelector('[data-pf-lb-counter]');
  var dlEl      = lb.querySelector('[data-pf-lb-dl]');
  var btnClose  = lb.querySelector('[data-pf-close]');
  var btnPrev   = lb.querySelector('[data-pf-prev]');
  var btnNext   = lb.querySelector('[data-pf-next]');

  var project = null;   // { title, category, tools, doc, assets: [...] }
  var index   = 0;
  var trigger = null;   // the card that opened us, so we can fly back to it
  var busy    = false;

  function scrollbarWidth() {
    return window.innerWidth - document.documentElement.clientWidth;
  }

  var lockedPad = '';
  function lockScroll() {
    // Hiding overflow on <html> keeps scrollTop intact; pad for the lost
    // scrollbar so the page behind does not shift sideways.
    var sb = scrollbarWidth();
    lockedPad = document.documentElement.style.paddingRight;
    if (sb > 0) document.documentElement.style.paddingRight = sb + 'px';
    document.documentElement.style.overflow = 'hidden';
  }
  function unlockScroll() {
    document.documentElement.style.overflow = '';
    document.documentElement.style.paddingRight = lockedPad;
  }

  /* rect the media should occupy when fully open */
  function fittedRect(w, h) {
    var maxW = window.innerWidth  * (window.innerWidth < 768 ? 0.94 : 0.86);
    var maxH = window.innerHeight * (window.innerWidth < 768 ? 0.74 : 0.82);
    var ratio = (w && h) ? w / h : 1;
    var tw = maxW, th = tw / ratio;
    if (th > maxH) { th = maxH; tw = th * ratio; }
    return {
      left  : Math.round((window.innerWidth  - tw) / 2),
      top   : Math.round((window.innerHeight - th) / 2),
      width : Math.round(tw),
      height: Math.round(th)
    };
  }

  function setStageBox(r) {
    stage.style.left   = r.left + 'px';
    stage.style.top    = r.top + 'px';
    stage.style.width  = r.width + 'px';
    stage.style.height = r.height + 'px';
  }

  /* FLIP: place the stage at `to`, then visually offset it to `from` and
     animate the offset away. Only transform animates. */
  function flip(from, to, done) {
    setStageBox(to);
    stage.classList.remove('is-flying');
    var dx = from.left - to.left;
    var dy = from.top  - to.top;
    var sx = to.width  ? from.width  / to.width  : 1;
    var sy = to.height ? from.height / to.height : 1;
    stage.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';

    if (reduce) { stage.style.transform = 'none'; if (done) done(); return; }

    // force layout so the starting transform is committed
    void stage.offsetWidth;
    stage.classList.add('is-flying');
    stage.style.transform = 'none';
    var fired = false;
    function end() {
      if (fired) return;
      fired = true;
      stage.removeEventListener('transitionend', end);
      stage.classList.remove('is-flying');
      if (done) done();
    }
    stage.addEventListener('transitionend', end);
    setTimeout(end, 420);   // guard if transitionend never lands
  }

  function currentAsset() { return project.assets[index]; }

  function thumbInCard() {
    return trigger ? trigger.querySelector('.pf-shot img') : null;
  }

  /* fill the stage with the asset at `index` */
  function renderAsset(playVideo) {
    var a = currentAsset();
    stage.innerHTML = '';
    var node;
    if (a.type === 'video') {
      node = document.createElement('video');
      node.setAttribute('controls', '');
      node.setAttribute('playsinline', '');
      node.setAttribute('preload', 'metadata');
      node.muted = true;                       // never surprise anyone with audio
      if (a.poster) node.poster = a.poster;
      node.src = a.src;
      if (playVideo) {
        var p = node.play();
        if (p && p.catch) p.catch(function () { /* autoplay blocked: poster + controls remain */ });
      }
    } else {
      node = document.createElement('img');
      node.src = a.src;
      node.alt = a.alt || '';
      node.setAttribute('decoding', 'async');
    }
    stage.appendChild(node);

    catEl.textContent  = project.category;
    nameEl.textContent = project.title;
    var bits = [];
    if (a.label) bits.push(a.label);
    if (project.tools) bits.push('Made with ' + project.tools);
    subEl.textContent = bits.join('  ·  ');
    subEl.hidden = bits.length === 0;

    var many = project.assets.length > 1;
    counterEl.textContent = many ? (index + 1) + ' / ' + project.assets.length : '';
    btnPrev.hidden = !many;
    btnNext.hidden = !many;

    if (project.doc) {
      dlEl.hidden = false;
      dlEl.href = project.doc;
    } else {
      dlEl.hidden = true;
      dlEl.removeAttribute('href');
    }

    preloadNeighbours();
  }

  function preloadNeighbours() {
    if (project.assets.length < 2) return;
    [index + 1, index - 1].forEach(function (i) {
      var a = project.assets[(i + project.assets.length) % project.assets.length];
      if (!a || a.type === 'video') return;
      var im = new Image();
      im.src = a.src;
    });
  }

  function go(delta) {
    if (project.assets.length < 2) return;
    var from = stage.getBoundingClientRect();
    index = (index + delta + project.assets.length) % project.assets.length;
    renderAsset(true);
    var a = currentAsset();
    flip(from, fittedRect(a.w, a.h));
  }

  function open(card) {
    if (busy) return;
    busy = true;
    trigger = card;
    project = JSON.parse(card.querySelector('[data-pf-data]').textContent);
    index = 0;

    var thumb = thumbInCard();
    var from  = thumb ? thumb.getBoundingClientRect()
                      : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 10, height: 10 };

    lockScroll();
    lb.classList.add('is-open');
    lb.setAttribute('aria-hidden', 'false');
    renderAsset(true);

    if (thumb) thumb.style.opacity = '0';

    var a = currentAsset();
    flip(from, fittedRect(a.w, a.h), function () { busy = false; });
    // fade the backdrop/chrome in alongside the flight
    requestAnimationFrame(function () { lb.classList.add('is-shown'); });
    btnClose.focus({ preventScroll: true });
  }

  function close() {
    if (busy || !lb.classList.contains('is-open')) return;
    busy = true;

    var vid = stage.querySelector('video');
    if (vid) vid.pause();

    lb.classList.remove('is-shown');

    var thumb = thumbInCard();
    // Recompute the thumb's position now — if the layout moved (resize, filter
    // change) we still land exactly on it rather than on a stale rect.
    var to = thumb ? thumb.getBoundingClientRect() : null;
    var visible = to && to.bottom > 0 && to.top < window.innerHeight && to.width > 0;

    function finish() {
      lb.classList.remove('is-open');
      lb.setAttribute('aria-hidden', 'true');
      stage.innerHTML = '';
      stage.style.transform = 'none';
      unlockScroll();
      if (thumb) thumb.style.opacity = '';
      if (trigger) trigger.focus({ preventScroll: true });   // no scrolling, ever
      trigger = null;
      busy = false;
    }

    if (visible && !reduce) {
      // fly the media back into the card it came from
      var from = stage.getBoundingClientRect();
      setStageBox(from);
      stage.classList.remove('is-flying');
      void stage.offsetWidth;
      stage.classList.add('is-flying');
      var dx = to.left - from.left, dy = to.top - from.top;
      var sx = to.width / from.width, sy = to.height / from.height;
      stage.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
      var fired = false;
      function end() {
        if (fired) return;
        fired = true;
        stage.removeEventListener('transitionend', end);
        stage.classList.remove('is-flying');
        finish();
      }
      stage.addEventListener('transitionend', end);
      setTimeout(end, 420);
    } else {
      finish();
    }
  }

  /* ------------------------------------------------ wiring */

  grid.addEventListener('click', function (e) {
    var card = e.target.closest ? e.target.closest('.pf-card') : null;
    if (card) open(card);
  });

  btnClose.addEventListener('click', close);
  btnPrev.addEventListener('click', function () { go(-1); });
  btnNext.addEventListener('click', function () { go(1); });

  // click anywhere that is not the media itself
  lb.addEventListener('click', function (e) {
    if (e.target === backdrop || e.target === lb || e.target.classList.contains('pf-lb-chrome')) close();
  });

  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape')     { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft')  { go(-1); }
    else if (e.key === 'ArrowRight') { go(1); }
    else if (e.key === 'Tab') {
      // keep focus inside the dialog
      var f = Array.prototype.filter.call(
        lb.querySelectorAll('button, [href]'),
        function (el) { return !el.hidden && el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // keep the open media correctly fitted through rotation / resize
  var rt;
  window.addEventListener('resize', function () {
    if (!lb.classList.contains('is-open')) return;
    clearTimeout(rt);
    rt = setTimeout(function () {
      var a = currentAsset();
      stage.classList.remove('is-flying');
      stage.style.transform = 'none';
      setStageBox(fittedRect(a.w, a.h));
    }, 120);
  });

  // swipe between assets on touch
  var tx = 0, ty = 0, touching = false;
  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    touching = true; tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (!touching) return;
    touching = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
