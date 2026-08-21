/* ==========================================================================
   PROJECT VIEWER — shared-element lightbox for the work grid
   No dependencies. Reads each project's asset list from the JSON block inside
   its card, so the cards stay static, crawlable HTML.

   Motion contract:
     open  — the card thumbnail flies from where it sits into the viewport
     close — it flies back to the very same spot
   The page scroll position is never read, written, or otherwise disturbed:
   no scrollIntoView, no hash changes, and every focus() passes preventScroll.
   ========================================================================== */
(function () {
  'use strict';

  var grid = document.getElementById('workGrid');
  var lb   = document.getElementById('lightbox');
  if (!grid || !lb) return;

  var backdrop = lb.querySelector('[data-lb-backdrop]');
  var stage    = lb.querySelector('[data-lb-stage]');
  var catEl    = lb.querySelector('[data-lb-cat]');
  var titleEl  = lb.querySelector('[data-lb-title]');
  var subEl    = lb.querySelector('[data-lb-sub]');
  var counter  = lb.querySelector('[data-lb-counter]');
  var docEl    = lb.querySelector('[data-lb-doc]');
  var btnClose = lb.querySelector('[data-lb-close]');
  var btnPrev  = lb.querySelector('[data-lb-prev]');
  var btnNext  = lb.querySelector('[data-lb-next]');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var project = null;
  var index   = 0;
  var trigger = null;   // the .work-card__link that opened the viewer
  var busy    = false;
  var padWas  = '';

  function thumbOf(link) { return link ? link.querySelector('.work-card__media img') : null; }

  function lockScroll() {
    // overflow:hidden on <html> keeps scrollTop intact; pad for the vanished
    // scrollbar so the page behind does not shift sideways.
    var sb = window.innerWidth - document.documentElement.clientWidth;
    padWas = document.documentElement.style.paddingRight;
    if (sb > 0) document.documentElement.style.paddingRight = sb + 'px';
    document.documentElement.style.overflow = 'hidden';
  }
  function unlockScroll() {
    document.documentElement.style.overflow = '';
    document.documentElement.style.paddingRight = padWas;
  }

  /* where the media should sit when fully open */
  function fittedRect(w, h) {
    var narrow = window.innerWidth < 768;
    var maxW = window.innerWidth  * (narrow ? 0.94 : 0.86);
    var maxH = window.innerHeight * (narrow ? 0.74 : 0.80);
    var ratio = (w && h) ? w / h : 1.5;
    var tw = maxW, th = tw / ratio;
    if (th > maxH) { th = maxH; tw = th * ratio; }
    return {
      left:   Math.round((window.innerWidth  - tw) / 2),
      top:    Math.round((window.innerHeight - th) / 2),
      width:  Math.round(tw),
      height: Math.round(th)
    };
  }

  function setBox(r) {
    stage.style.left   = r.left + 'px';
    stage.style.top    = r.top + 'px';
    stage.style.width  = r.width + 'px';
    stage.style.height = r.height + 'px';
  }

  /* FLIP — lay the stage out at `to`, offset it to look like `from`, then
     animate the offset away. Only `transform` animates. */
  function flip(from, to, done) {
    setBox(to);
    stage.classList.remove('is-flying');
    var dx = from.left - to.left;
    var dy = from.top  - to.top;
    var sx = to.width  ? from.width  / to.width  : 1;
    var sy = to.height ? from.height / to.height : 1;
    stage.style.transform =
      'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';

    if (reduce) { stage.style.transform = 'none'; if (done) done(); return; }

    void stage.offsetWidth;                 // commit the start transform
    stage.classList.add('is-flying');
    stage.style.transform = 'none';
    settle(done);
  }

  /* run `done` once, whether the transition ends or never fires */
  function settle(done) {
    var fired = false;
    function end() {
      if (fired) return;
      fired = true;
      stage.removeEventListener('transitionend', end);
      stage.classList.remove('is-flying');
      if (done) done();
    }
    stage.addEventListener('transitionend', end);
    setTimeout(end, 420);
  }

  function asset() { return project.assets[index]; }

  function render(autoplay) {
    var a = asset();
    stage.innerHTML = '';
    var node;
    if (a.type === 'video') {
      node = document.createElement('video');
      node.setAttribute('controls', '');
      node.setAttribute('playsinline', '');
      node.setAttribute('preload', 'metadata');
      node.muted = true;                     // never surprise anyone with sound
      if (a.poster) node.poster = a.poster;
      node.src = a.src;
      if (autoplay) {
        var pr = node.play();
        if (pr && pr.catch) pr.catch(function () { /* blocked: poster + controls remain */ });
      }
    } else {
      node = document.createElement('img');
      node.src = a.src;
      node.alt = a.alt || '';
      node.setAttribute('decoding', 'async');
    }
    stage.appendChild(node);

    catEl.textContent   = project.category;
    titleEl.textContent = project.title;

    var bits = [];
    if (a.label) bits.push(a.label);
    if (project.tools) bits.push('Made with ' + project.tools);
    subEl.textContent = bits.join('   ·   ');
    subEl.hidden = bits.length === 0;

    var many = project.assets.length > 1;
    counter.textContent = many ? (index + 1) + ' / ' + project.assets.length : '';
    btnPrev.hidden = !many;
    btnNext.hidden = !many;

    if (project.doc) { docEl.hidden = false; docEl.href = project.doc; }
    else { docEl.hidden = true; docEl.removeAttribute('href'); }

    prefetchNeighbours();
  }

  function prefetchNeighbours() {
    if (project.assets.length < 2) return;
    [index + 1, index - 1].forEach(function (i) {
      var a = project.assets[(i + project.assets.length) % project.assets.length];
      if (a && a.type !== 'video') { var im = new Image(); im.src = a.src; }
    });
  }

  function go(step) {
    if (project.assets.length < 2) return;
    var from = stage.getBoundingClientRect();
    index = (index + step + project.assets.length) % project.assets.length;
    render(true);
    flip(from, fittedRect(asset().w, asset().h));
  }

  function open(link) {
    if (busy) return;
    var holder = link.closest('.work-card');
    var json = holder && holder.querySelector('[data-work-data]');
    if (!json) return;                        // no data: let the link behave normally
    busy = true;

    trigger = link;
    project = JSON.parse(json.textContent);
    index = 0;

    var thumb = thumbOf(link);
    var from = thumb ? thumb.getBoundingClientRect()
                     : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 40, height: 40 };

    lockScroll();
    lb.classList.add('is-open');
    lb.setAttribute('aria-hidden', 'false');
    render(true);
    if (thumb) thumb.classList.add('is-lifted');

    flip(from, fittedRect(asset().w, asset().h), function () { busy = false; });
    btnClose.focus({ preventScroll: true });
  }

  function close() {
    if (busy || !lb.classList.contains('is-open')) return;
    busy = true;

    var vid = stage.querySelector('video');
    if (vid) vid.pause();

    var thumb = thumbOf(trigger);
    // Re-measure now: if the layout moved while the viewer was open we still
    // land on the card rather than on a stale rectangle.
    var to = thumb ? thumb.getBoundingClientRect() : null;
    var onScreen = to && to.width > 0 && to.bottom > 0 && to.top < window.innerHeight;

    function finish() {
      lb.classList.remove('is-open');
      lb.setAttribute('aria-hidden', 'true');
      stage.innerHTML = '';
      stage.style.transform = 'none';
      unlockScroll();
      if (thumb) thumb.classList.remove('is-lifted');
      if (trigger) trigger.focus({ preventScroll: true });
      trigger = null;
      busy = false;
    }

    if (onScreen && !reduce) {
      var from = stage.getBoundingClientRect();
      setBox(from);
      stage.classList.remove('is-flying');
      void stage.offsetWidth;
      stage.classList.add('is-flying');
      stage.style.transform =
        'translate(' + (to.left - from.left) + 'px,' + (to.top - from.top) + 'px) ' +
        'scale(' + (to.width / from.width) + ',' + (to.height / from.height) + ')';
      settle(finish);
    } else {
      finish();
    }
  }

  /* ---------------------------------------------------------------- wiring */

  grid.addEventListener('click', function (e) {
    var link = e.target.closest('.work-card__link');
    if (!link) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;  // let people open in a new tab
    e.preventDefault();
    open(link);
  });

  btnClose.addEventListener('click', close);
  btnPrev.addEventListener('click', function () { go(-1); });
  btnNext.addEventListener('click', function () { go(1); });

  lb.addEventListener('click', function (e) {
    if (e.target === backdrop || e.target === lb ||
        e.target.classList.contains('lb__chrome')) close();
  });

  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowLeft')  { go(-1); return; }
    if (e.key === 'ArrowRight') { go(1);  return; }
    if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(
        lb.querySelectorAll('button, a[href]'),
        function (el) { return !el.hidden && el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus({ preventScroll: true }); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus({ preventScroll: true }); }
    }
  });

  var rt;
  window.addEventListener('resize', function () {
    if (!lb.classList.contains('is-open')) return;
    clearTimeout(rt);
    rt = setTimeout(function () {
      stage.classList.remove('is-flying');
      stage.style.transform = 'none';
      setBox(fittedRect(asset().w, asset().h));
    }, 120);
  });

  /* swipe between assets */
  var sx = 0, sy = 0, tracking = false;
  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
