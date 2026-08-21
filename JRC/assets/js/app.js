/* ==========================================================================
   JRC PORTFOLIO — APPLICATION SCRIPT
   Vanilla ES2015+, no jQuery, no build step. Every module is independent and
   fails silently if its markup isn't on the page, so sections can be removed
   without breaking anything else.
   --------------------------------------------------------------------------
   MODULES
     01. Helpers & environment
     02. Preloader
     03. Scroll reveal (IntersectionObserver)
     03b. Theme toggle (dark / light)
     04. Navigation (sticky, drawer, scroll-spy)
     05. Scroll progress + back to top
     06. Animated counters
     07. Portfolio filtering
     08. Testimonial slider (autoplay · drag · keyboard)
     09. Process timeline progress
     10. Parallax layers (scroll)
     10b. Pointer parallax (hero, mouse-driven)
     11. Micro-interactions (magnetic, spotlight, tilt, cursor)
     12. Contact form (validation + submit)
     13. Misc (footer year, smooth anchors)
     14. GSAP progressive enhancement (optional CDN)
   ========================================================================== */

(function () {
  'use strict';

  /* ========================================================================
     01. HELPERS & ENVIRONMENT
     ==================================================================== */
  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer  = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* One shared scroll loop — cheaper than a listener per module. */
  var scrollTasks = [];
  var ticking = false;
  function onScroll(fn) { scrollTasks.push(fn); fn(); }
  function runScrollTasks() {
    for (var i = 0; i < scrollTasks.length; i++) scrollTasks[i]();
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(runScrollTasks); ticking = true; }
  }, { passive: true });

  window.addEventListener('resize', debounce(function () {
    runScrollTasks();
    document.dispatchEvent(new CustomEvent('jrc:resize'));
  }, 150));

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  /* True when any part of the element is inside the viewport right now. Used
     as a belt-and-braces check next to IntersectionObserver so content is
     never left invisible if a callback is missed. */
  function inView(el, slack) {
    var r = el.getBoundingClientRect();
    var pad = slack || 0;
    return r.bottom > -pad && r.top < (window.innerHeight || 0) + pad;
  }


  /* ========================================================================
     02. PRELOADER
     Fake-progresses to 90% then completes on window.load, so a slow image
     never leaves the visitor staring at a frozen bar.
     ==================================================================== */
  (function preloader() {
    var el = $('#preloader');
    if (!el) { document.body.classList.remove('is-loading'); return; }

    var fill = $('#preloaderFill');
    var pct  = $('#preloaderPct');
    var value = 0;
    var done = false;

    var timer = setInterval(function () {
      value = Math.min(value + Math.random() * 18, 90);
      paint(value);
    }, 130);

    function paint(v) {
      if (fill) fill.style.width = v + '%';
      if (pct) pct.textContent = Math.round(v) + '%';
    }

    function finish() {
      if (done) return;
      done = true;
      clearInterval(timer);
      paint(100);
      setTimeout(function () {
        el.classList.add('is-done');
        document.body.classList.remove('is-loading');
        document.dispatchEvent(new CustomEvent('jrc:loaded'));
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
      }, 260);
    }

    window.addEventListener('load', finish);
    setTimeout(finish, 4000); // hard ceiling — never trap the visitor
  })();


  /* ========================================================================
     03. SCROLL REVEAL
     Adds .is-visible once an element enters the viewport. data-delay (ms)
     staggers siblings. Elements are unobserved after firing.
     ==================================================================== */
  (function reveal() {
    var items = $$('[data-reveal]');
    if (!items.length) return;

    // No IntersectionObserver (or motion disabled) → show everything now.
    if (!('IntersectionObserver' in window) || reduceMotion) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    function show(el) {
      var delay = parseInt(el.getAttribute('data-delay') || '0', 10);
      if (delay) el.style.transitionDelay = delay + 'ms';
      el.classList.add('is-visible');
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        show(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    items.forEach(function (el) { io.observe(el); });

    // Safety net: anything already on screen after load gets shown outright.
    window.addEventListener('load', function () {
      items.forEach(function (el) {
        if (!el.classList.contains('is-visible') && inView(el)) { show(el); io.unobserve(el); }
      });
    });
  })();


  /* ========================================================================
     03b. THEME TOGGLE
     <html data-theme> is already set by the inline bootstrap in <head>, which
     defaults to dark. This only handles switching, persistence and keeping the
     browser chrome in step. .is-theming scopes the cross-fade (see main.css).
     ==================================================================== */
  (function theme() {
    var root = document.documentElement;
    var btn = $('#themeToggle');
    var KEY = 'jrc-theme';
    var BG = { dark: '#080B12', light: '#F5F8FD' };
    var timer = null;

    function current() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }

    function syncChrome(mode) {
      // a single dynamic meta beats the media-based ones when the user has
      // explicitly overridden their OS preference
      var meta = document.getElementById('themeColorMeta');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        meta.id = 'themeColorMeta';
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', BG[mode] || BG.dark);

      if (btn) {
        var toLight = mode === 'dark';
        btn.setAttribute('aria-label', toLight ? 'Switch to light theme' : 'Switch to dark theme');
        btn.setAttribute('title', toLight ? 'Switch to light theme' : 'Switch to dark theme');
        btn.setAttribute('aria-pressed', String(mode === 'light'));
      }
    }

    function apply(mode, animate) {
      if (animate && !reduceMotion) {
        root.classList.add('is-theming');
        clearTimeout(timer);
        timer = setTimeout(function () { root.classList.remove('is-theming'); }, 400);
      }
      root.setAttribute('data-theme', mode);
      syncChrome(mode);
    }

    syncChrome(current());

    if (btn) {
      btn.addEventListener('click', function () {
        var next = current() === 'dark' ? 'light' : 'dark';
        apply(next, true);
        try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
      });
    }

    /* Deliberately no prefers-color-scheme listener: dark is the default for
       everyone, and only an explicit click (persisted) moves off it. */
  })();


  /* ========================================================================
     04. NAVIGATION — sticky state, mobile drawer, scroll-spy
     ==================================================================== */
  (function navigation() {
    var nav = $('#nav');
    var menu = $('#navMenu');
    var toggle = $('#navToggle');
    if (!nav) return;

    /* — condensed glass bar after 40px — */
    onScroll(function () {
      nav.classList.toggle('is-stuck', window.scrollY > 40);
    });

    /* — mobile drawer — */
    function setMenu(open) {
      if (!menu || !toggle) return;
      menu.classList.toggle('is-open', open);
      nav.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('nav-open', open);
    }

    if (toggle) {
      toggle.addEventListener('click', function () {
        setMenu(toggle.getAttribute('aria-expanded') !== 'true');
      });
    }

    // close on link click, on Escape, or when clicking the dimmed backdrop
    $$('.nav__link').forEach(function (link) {
      link.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMenu(false);
    });
    nav.addEventListener('click', function (e) {
      if (e.target === nav) setMenu(false);
    });

    /* — scroll-spy: highlight the section currently in view — */
    var links = $$('.nav__link');
    var sections = links
      .map(function (l) { return document.getElementById((l.getAttribute('href') || '').slice(1)); })
      .filter(Boolean);

    if (sections.length) {
      onScroll(function () {
        var pos = window.scrollY + 160;
        var current = sections[0];
        for (var i = 0; i < sections.length; i++) {
          if (sections[i].offsetTop <= pos) current = sections[i];
        }
        // near the bottom the last section wins even if it's short
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 60) {
          current = sections[sections.length - 1];
        }
        links.forEach(function (l) {
          l.classList.toggle('is-active', l.getAttribute('href') === '#' + current.id);
        });
      });
    }
  })();


  /* ========================================================================
     05. SCROLL PROGRESS BAR + BACK TO TOP
     ==================================================================== */
  (function progressAndTop() {
    var bar = $('#scrollProgress');
    var fill = bar ? bar.firstElementChild : null;
    var top = $('#toTop');

    onScroll(function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? window.scrollY / max : 0;
      if (fill) fill.style.width = (ratio * 100).toFixed(2) + '%';
      if (top) top.classList.toggle('is-visible', window.scrollY > 700);
    });

    if (top) {
      top.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    }
  })();


  /* ========================================================================
     06. ANIMATED COUNTERS
     Counts 0 → data-count with an ease-out curve, once, when scrolled into
     view. data-suffix is appended verbatim ("+", "%", " hrs").
     ==================================================================== */
  (function counters() {
    var nums = $$('[data-count]');
    if (!nums.length) return;

    function run(el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0;
      var suffix = el.getAttribute('data-suffix') || '';
      var duration = 1600;

      if (reduceMotion) { el.textContent = target + suffix; return; }

      var start = null;
      function step(ts) {
        if (start === null) start = ts;
        var p = clamp((ts - start) / duration, 0, 1);
        var eased = 1 - Math.pow(1 - p, 3);          // easeOutCubic
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) window.requestAnimationFrame(step);
      }
      window.requestAnimationFrame(step);
    }

    if (!('IntersectionObserver' in window)) {
      nums.forEach(run);
      return;
    }
    var started = [];
    function start(el) {
      if (started.indexOf(el) !== -1) return;
      started.push(el);
      run(el);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        start(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    nums.forEach(function (el) { io.observe(el); });

    // same safety net as the reveal module — never leave a counter on zero
    window.addEventListener('load', function () {
      nums.forEach(function (el) { if (inView(el)) { start(el); io.unobserve(el); } });
    });
  })();


  /* ========================================================================
     07. PORTFOLIO FILTERING
     Category lives in data-cat (space separated). The gradient pill slides
     to the active tab on desktop; on mobile CSS paints the active tab.
     ==================================================================== */
  (function portfolioFilter() {
    var wrap = $('.work__filters');
    var grid = $('#workGrid');
    if (!wrap || !grid) return;

    var buttons = $$('.filter', wrap);
    var pill = $('.work__pill', wrap);
    var cards = $$('.work-card', grid);
    var empty = $('#workEmpty');

    /* Position the gradient pill under the active tab. Measured from bounding
       rects so it stays correct while the row is scrolled sideways. */
    function movePill(btn) {
      if (!pill || !btn) return;
      var wr = wrap.getBoundingClientRect();
      var br = btn.getBoundingClientRect();
      var inset = 8; // 1px border + 7px padding = the pill's resting offset
      pill.style.width = br.width + 'px';
      pill.style.transform = 'translateX(' + (br.left - wr.left - inset) + 'px)';
    }

    function apply(filter) {
      var shown = 0;
      cards.forEach(function (card) {
        var cats = (card.getAttribute('data-cat') || '').split(/\s+/);
        var match = filter === 'all' || cats.indexOf(filter) !== -1;
        card.classList.toggle('is-filtered', !match);
        if (!match) return;
        shown++;
        // replay the reveal so surviving cards fade back in together
        if (!reduceMotion) {
          card.classList.remove('is-visible');
          window.requestAnimationFrame(function () { card.classList.add('is-visible'); });
        }
      });
      if (empty) empty.hidden = shown !== 0;
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');
        movePill(btn);
        apply(btn.getAttribute('data-filter'));
      });
    });

    // initial pill placement (after fonts settle so widths are final)
    function init() { movePill($('.filter.is-active', wrap)); }
    init();
    window.addEventListener('load', init);
    document.addEventListener('jrc:resize', init);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
  })();


  /* ========================================================================
     08. TESTIMONIAL SLIDER
     Cards-per-view comes from CSS (flex-basis), so the breakpoints stay in
     one place. Supports arrows, dots, drag/swipe, keyboard and autoplay.
     ==================================================================== */
  (function testimonials() {
    var viewport = $('#testiViewport');
    var track = $('#testiTrack');
    if (!viewport || !track) return;

    var cards = $$('.testi-card', track);
    var dotsWrap = $('#testiDots');
    var prev = $('#testiPrev');
    var next = $('#testiNext');
    if (!cards.length) return;

    var index = 0;
    var autoplayTimer = null;
    var AUTOPLAY_MS = 5500;

    function step() {
      var style = window.getComputedStyle(track);
      var gap = parseFloat(style.columnGap || style.gap || '0') || 0;
      return cards[0].getBoundingClientRect().width + gap;
    }
    function perView() {
      return Math.max(1, Math.round(viewport.clientWidth / step()));
    }
    function maxIndex() {
      return Math.max(0, cards.length - perView());
    }

    function go(i, animate) {
      index = clamp(i, 0, maxIndex());
      track.style.transition = animate === false ? 'none' : '';
      track.style.transform = 'translate3d(' + (-index * step()) + 'px,0,0)';
      syncUi();
    }

    function syncUi() {
      if (prev) prev.disabled = index === 0;
      if (next) next.disabled = index >= maxIndex();
      if (!dotsWrap) return;
      $$('button', dotsWrap).forEach(function (d, i) {
        var active = i === index;
        d.classList.toggle('is-active', active);
        d.setAttribute('aria-selected', String(active));
      });
    }

    function buildDots() {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      for (var i = 0; i <= maxIndex(); i++) {
        (function (i) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('role', 'tab');
          b.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
          b.addEventListener('click', function () { go(i); restart(); });
          dotsWrap.appendChild(b);
        })(i);
      }
      syncUi();
    }

    /* — autoplay, paused on hover/focus and while dragging — */
    function play() {
      if (reduceMotion || maxIndex() === 0) return;
      autoplayTimer = setInterval(function () {
        go(index >= maxIndex() ? 0 : index + 1);
      }, AUTOPLAY_MS);
    }
    function stop() { clearInterval(autoplayTimer); }
    function restart() { stop(); play(); }

    viewport.addEventListener('mouseenter', stop);
    viewport.addEventListener('mouseleave', play);
    viewport.addEventListener('focusin', stop);
    viewport.addEventListener('focusout', play);

    if (prev) prev.addEventListener('click', function () { go(index - 1); restart(); });
    if (next) next.addEventListener('click', function () { go(index + 1); restart(); });

    /* — keyboard — */
    viewport.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { go(index + 1); restart(); e.preventDefault(); }
      if (e.key === 'ArrowLeft')  { go(index - 1); restart(); e.preventDefault(); }
    });

    /* — pointer drag / touch swipe — */
    var startX = 0, startTx = 0, dragging = false;

    viewport.addEventListener('pointerdown', function (e) {
      dragging = true;
      startX = e.clientX;
      startTx = -index * step();
      viewport.classList.add('is-dragging');
      track.style.transition = 'none';
      stop();
    });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      track.style.transform = 'translate3d(' + (startTx + dx) + 'px,0,0)';
    });
    window.addEventListener('pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove('is-dragging');
      track.style.transition = '';
      var dx = e.clientX - startX;
      var threshold = step() * 0.22;
      if (dx < -threshold) go(index + 1);
      else if (dx > threshold) go(index - 1);
      else go(index);
      play();
    });

    // stop the browser turning a horizontal drag into text selection
    viewport.addEventListener('dragstart', function (e) { e.preventDefault(); });

    function rebuild() { buildDots(); go(Math.min(index, maxIndex()), false); }
    rebuild();
    play();
    document.addEventListener('jrc:resize', rebuild);
    window.addEventListener('load', rebuild);
  })();


  /* ========================================================================
     09. PROCESS TIMELINE PROGRESS
     Fills the vertical rail in step with how far the section has scrolled.
     ==================================================================== */
  (function timeline() {
    var list = $('#timeline');
    var fill = $('#timelineFill');
    if (!list || !fill) return;

    onScroll(function () {
      var rect = list.getBoundingClientRect();
      var vh = window.innerHeight;
      var total = rect.height + vh * 0.4;
      var passed = clamp(vh * 0.7 - rect.top, 0, total);
      fill.style.height = clamp((passed / rect.height) * 100, 0, 100).toFixed(1) + '%';
    });
  })();


  /* ========================================================================
     10. PARALLAX LAYERS
     Any [data-parallax="0.08"] drifts against the scroll at that ratio.
     ==================================================================== */
  (function parallax() {
    if (reduceMotion) return;
    var layers = $$('[data-parallax]');
    if (!layers.length) return;

    onScroll(function () {
      var vh = window.innerHeight;
      layers.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) return;   // offscreen
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0;
        var centerOffset = (rect.top + rect.height / 2) - vh / 2;
        // `translate` composes with the CSS float animations' `transform`
        el.style.translate = '0 ' + (-centerOffset * speed).toFixed(1) + 'px';
      });
    });
  })();


  /* ========================================================================
     10b. POINTER PARALLAX
     Hero layers drift with the mouse. Writes the `translate` property (not
     `transform`) so it composes with the CSS float animations instead of
     overwriting them. Values come from data-pointer="0.05" (a strength
     fraction); the rAF loop eases toward the target and stops when settled.
     ==================================================================== */
  (function pointerParallax() {
    if (!finePointer || reduceMotion) return;

    var scope = $('.hero');
    if (!scope) return;
    var layers = $$('[data-pointer]', scope);
    if (!layers.length) return;

    var MAX = 600;            // strength fraction → pixels of travel
    var tx = 0, ty = 0;       // target, -0.5 … 0.5
    var cx = 0, cy = 0;       // current, eased
    var raf = null;

    /* One easing step + write. Returns true while still catching up. */
    function step() {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      layers.forEach(function (el) {
        var s = parseFloat(el.getAttribute('data-pointer')) || 0;
        el.style.translate =
          (cx * s * MAX).toFixed(2) + 'px ' + (cy * s * MAX).toFixed(2) + 'px';
      });
      return Math.abs(tx - cx) > 0.0008 || Math.abs(ty - cy) > 0.0008;
    }
    function loop() { raf = step() ? window.requestAnimationFrame(loop) : null; }

    /* Step synchronously on every pointer move so the layers track the cursor
       even when frames are throttled, and let the rAF loop smooth the motion
       in between events. */
    function kick() {
      step();
      if (!raf) raf = window.requestAnimationFrame(loop);
    }

    scope.addEventListener('mousemove', function (e) {
      var r = scope.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      kick();
    });
    // drift back to centre when the pointer leaves the hero
    scope.addEventListener('mouseleave', function () { tx = 0; ty = 0; kick(); });
  })();


  /* ========================================================================
     10c. HERO PORTRAIT — cursor-driven 3D tilt
     The portrait should read as a physical object floating just above the
     page: it leans toward the cursor, lifts slightly when the cursor is over
     it, and settles back with a little weight when the cursor leaves.

     Three things keep it from fighting the rest of the hero:
       · it writes `transform` to .portrait__tilt only, so the ring keeps its
         own @keyframes float and its [data-pointer] `translate` drift;
       · a light spring (not a linear ease) does the settling, which is what
         gives the motion its sense of mass;
       · the scope rect is cached and only re-measured after scroll/resize, so
         a mousemove never forces a layout.

     Gated on capability rather than width: `(hover: hover)` decides whether
     the cursor effect exists at all, so touchscreens never get it, and
     `(pointer: fine)` plus the tablet breakpoint only scale it down. The idle
     float is CSS, so it keeps running everywhere including touch.
     ==================================================================== */
  (function heroPortrait3d() {
    var el = $('[data-portrait-3d]');
    if (!el) return;
    /* Listener teardown is done with an AbortController; without it, bail out
       and leave the portrait to its CSS float rather than half-wire it. */
    if (!('AbortController' in window)) return;

    var scope = el.closest('.hero__visual') || el.parentElement;
    var zone  = el.closest('.portrait') || el;   // "cursor is over the photo"
    if (!scope) return;

    var mqHover  = window.matchMedia('(hover: hover)');
    var mqFine   = window.matchMedia('(pointer: fine)');
    var mqNarrow = window.matchMedia('(max-width: 1024px)');
    var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    var TILT  = 9;        // degrees across the full scope => about +/-4.5deg
    var LIFT  = 1.032;    // hover scale — deliberately inside 1.02 … 1.04
    /* Tuned by simulating the discrete spring: this pair overshoots its target
       by ~4% and settles in ~28 frames (about 0.45s), while covering 63% of the
       distance in the first 6. That reads as weight. Raising DAMP to 0.80
       overshoots 25% over 0.8s, which reads as a bounce. */
    var STIFF = 0.120;    // spring constant
    var DAMP  = 0.64;     // velocity retained per frame
    var EPS   = 0.0004;

    var t = { x: 0, y: 0, s: 1 };   // target
    var c = { x: 0, y: 0, s: 1 };   // current
    var v = { x: 0, y: 0, s: 0 };   // velocity
    var raf = null, rect = null, ctl = null;

    /* Tablets and trackpad-on-a-touchscreen get a gentler version. */
    function strength() { return (mqNarrow.matches || !mqFine.matches) ? 0.5 : 1; }

    function measure()    { rect = scope.getBoundingClientRect(); }
    function invalidate() { rect = null; }

    function spring(k) {
      v[k] += (t[k] - c[k]) * STIFF;
      v[k] *= DAMP;
      c[k] += v[k];
      return Math.abs(t[k] - c[k]) > EPS || Math.abs(v[k]) > EPS;
    }

    /* One frame: integrate the spring, write a single composited transform.
       The loop parks itself the moment everything has settled. */
    function frame() {
      /* bitwise `|`, not `||`: all three springs must be integrated every
         frame, so short-circuiting would freeze whichever came after. */
      var busy = spring('x') | spring('y') | spring('s');
      var f = strength();
      /* Both axes are negated so the face of the photo leans TOWARD the
         cursor: the edge nearest the pointer comes forward. Dropping either
         minus sign makes that axis lean away instead, and the two axes then
         disagree with each other, which reads as a wobble rather than a tilt. */
      el.style.transform =
        'perspective(1100px)' +
        ' rotateX(' + (-c.y * TILT * f).toFixed(3) + 'deg)' +
        ' rotateY(' + (-c.x * TILT * f).toFixed(3) + 'deg)' +
        ' scale(' + c.s.toFixed(4) + ')';
      raf = busy ? window.requestAnimationFrame(frame) : null;
    }
    function kick() { if (!raf) raf = window.requestAnimationFrame(frame); }

    function onMove(e) {
      if (!rect) measure();
      if (!rect.width || !rect.height) return;
      /* -0.5 … 0.5 from the centre of the portrait's own area */
      t.x = (e.clientX - rect.left) / rect.width  - 0.5;
      t.y = (e.clientY - rect.top)  / rect.height - 0.5;
      kick();
    }
    /* cursor left the area: ease all the way back to the resting pose */
    function onLeave() { t.x = 0; t.y = 0; kick(); }
    function onEnter() { t.s = LIFT; kick(); }
    function onExit()  { t.s = 1;    kick(); }

    function enable() {
      if (ctl || mqReduce.matches || !mqHover.matches) return;
      ctl = new AbortController();
      var o = { signal: ctl.signal };
      var p = { signal: ctl.signal, passive: true };
      scope.addEventListener('mousemove', onMove, p);
      scope.addEventListener('mouseleave', onLeave, o);
      zone.addEventListener('mouseenter', onEnter, o);
      zone.addEventListener('mouseleave', onExit, o);
      /* the rect only changes on scroll/resize, never on mousemove */
      window.addEventListener('scroll', invalidate, p);
      window.addEventListener('resize', invalidate, p);
      measure();
    }

    function disable() {
      if (ctl) { ctl.abort(); ctl = null; }
      if (raf) { window.cancelAnimationFrame(raf); raf = null; }
      t.x = t.y = c.x = c.y = v.x = v.y = v.s = 0;
      t.s = c.s = 1;
      el.style.transform = '';    // hand the element back to CSS
      rect = null;
    }

    /* React to a plugged-in mouse, a rotation, or reduced-motion being
       switched on mid-session, instead of deciding once at load. */
    function sync() {
      if (mqReduce.matches || !mqHover.matches) disable();
      else if (!ctl) enable();
      else { invalidate(); kick(); }
    }
    [mqHover, mqFine, mqNarrow, mqReduce].forEach(function (mq) {
      if (mq.addEventListener) mq.addEventListener('change', sync);
      else if (mq.addListener) mq.addListener(sync);   // Safari < 14
    });

    enable();
  })();


  /* ========================================================================
     11. MICRO-INTERACTIONS
     ==================================================================== */

  /* — Magnetic buttons: the element leans toward the cursor — */
  (function magnetic() {
    if (!finePointer || reduceMotion) return;

    $$('[data-magnetic]').forEach(function (el) {
      var strength = 0.28;
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * strength;
        var y = (e.clientY - r.top - r.height / 2) * strength;
        el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      });
      el.addEventListener('mouseleave', function () { el.style.transform = ''; });
    });
  })();

  /* — Card spotlight: feeds cursor position into CSS custom properties — */
  (function spotlight() {
    if (!finePointer) return;

    $$('[data-spotlight]').forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  })();

  /* — Subtle 3D tilt on the hero scene and portrait — */
  (function tilt() {
    if (!finePointer || reduceMotion) return;

    $$('[data-tilt]').forEach(function (el) {
      var max = 7;
      var parent = el.parentElement || el;

      parent.addEventListener('mousemove', function (e) {
        var r = parent.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform =
          'perspective(1000px) rotateY(' + (px * max).toFixed(2) + 'deg) rotateX(' + (-py * max).toFixed(2) + 'deg)';
      });
      parent.addEventListener('mouseleave', function () { el.style.transform = ''; });
    });
  })();

  /* — Custom cursor: dot snaps, ring trails, grows over interactive things — */
  (function cursor() {
    var el = $('#cursor');
    if (!el || !finePointer || reduceMotion) return;

    var dot = $('.cursor__dot', el);
    var ring = $('.cursor__ring', el);
    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%)';
    });

    (function loop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = 'translate(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px) translate(-50%,-50%)';
      window.requestAnimationFrame(loop);
    })();

    // grow the ring over anything clickable
    document.addEventListener('mouseover', function (e) {
      var target = e.target.closest('a, button, [data-magnetic], .work-card, .svc-card, .tool, input, textarea, select');
      el.classList.toggle('is-hover', !!target);
    });
    document.addEventListener('mouseleave', function () { el.style.opacity = '0'; });
    document.addEventListener('mouseenter', function () { el.style.opacity = '1'; });
  })();


  /* ========================================================================
     12. CONTACT FORM
     Client-side validation, then either POST to data-endpoint (Formspree,
     Getform, Basin…) or fall back to a pre-filled mailto: draft.
     ==================================================================== */
  (function contactForm() {
    var form = $('#contactForm');
    if (!form) return;

    var status = $('#formStatus');
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
    // keep this in sync with the address shown in the contact section
    var FALLBACK_EMAIL = 'clarosjunerey143@gmail.com';

    function setError(field, message) {
      var wrap = field.closest('.field');
      if (!wrap) return;
      wrap.classList.toggle('has-error', !!message);
      var slot = $('[data-err]', wrap);
      if (slot) slot.textContent = message || '';
    }

    /* Required: full name, a plausible email, a project type and a message
       with enough in it to reply to. Company and budget stay optional so the
       form never feels like an interrogation. */
    function validate() {
      var ok = true;
      var name = form.elements.name;
      var email = form.elements.email;
      var projectType = form.elements.projectType;
      var message = form.elements.message;

      if (!name.value.trim()) { setError(name, 'Please tell me your name.'); ok = false; }
      else setError(name, '');

      if (!EMAIL_RE.test(email.value.trim())) { setError(email, 'Enter a valid email address.'); ok = false; }
      else setError(email, '');

      if (projectType && !projectType.value) { setError(projectType, 'Pick the type of project.'); ok = false; }
      else if (projectType) setError(projectType, '');

      if (message.value.trim().length < 10) { setError(message, 'A sentence or two about the project helps.'); ok = false; }
      else setError(message, '');

      return ok;
    }

    // clear an error as soon as the visitor starts fixing it
    ['name', 'email', 'message'].forEach(function (key) {
      var field = form.elements[key];
      if (field) field.addEventListener('input', function () { setError(field, ''); });
    });
    if (form.elements.projectType) {
      form.elements.projectType.addEventListener('change', function () {
        setError(form.elements.projectType, '');
      });
    }

    function say(text, kind) {
      if (!status) return;
      status.textContent = text;
      status.className = 'form__status' + (kind ? ' is-' + kind : '');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // honeypot — silently accept and drop bot submissions
      if (form.elements._gotcha && form.elements._gotcha.value) return;

      if (!validate()) {
        say('Please fix the highlighted fields.', 'err');
        var firstBad = $('.field.has-error input, .field.has-error select, .field.has-error textarea', form);
        if (firstBad) firstBad.focus();
        return;
      }

      var button = $('button[type="submit"]', form);
      var endpoint = form.getAttribute('data-endpoint');
      var data = new FormData(form);

      if (!endpoint) {
        // No backend configured yet → open a pre-filled email instead.
        var subject = 'New project enquiry from ' + data.get('name');
        var body =
          'Name: ' + data.get('name') + '\n' +
          'Email: ' + data.get('email') + '\n' +
          'Company: ' + (data.get('company') || '—') + '\n' +
          'Project type: ' + (data.get('projectType') || '—') + '\n' +
          'Budget: ' + (data.get('budget') || '—') + '\n\n' +
          data.get('message');
        window.location.href = 'mailto:' + FALLBACK_EMAIL +
          '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        say('Opening your email app… if nothing happens, write to ' + FALLBACK_EMAIL + '.', 'ok');
        return;
      }

      if (button) { button.disabled = true; button.style.opacity = '.7'; }
      say('Sending…');

      fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (!res.ok) throw new Error('Request failed');
          form.reset();
          say('Thanks! Your message is in — I reply within 24 hours.', 'ok');
        })
        .catch(function () {
          say('Something went wrong. Email me directly at ' + FALLBACK_EMAIL + '.', 'err');
        })
        .then(function () {
          if (button) { button.disabled = false; button.style.opacity = ''; }
        });
    });
  })();


  /* ========================================================================
     13. MISC
     ==================================================================== */
  (function misc() {
    // footer copyright year
    var year = $('#year');
    if (year) year.textContent = new Date().getFullYear();

    // honour reduced-motion for in-page anchor jumps
    if (reduceMotion) document.documentElement.style.scrollBehavior = 'auto';
  })();


  /* ========================================================================
     14. GSAP PROGRESSIVE ENHANCEMENT
     If the GSAP CDN loaded, layer richer scroll animation on top. The site
     is fully animated without it — this only adds polish.
     ==================================================================== */
  window.addEventListener('load', function () {
    if (reduceMotion || !window.gsap) return;

    var gsap = window.gsap;
    if (!window.ScrollTrigger) return;
    gsap.registerPlugin(window.ScrollTrigger);

    /* Only elements with no CSS transform of their own are handed to GSAP,
       so nothing fights the reveal/hover transitions defined in main.css. */
    gsap.utils.toArray('.step__num').forEach(function (num) {
      gsap.fromTo(num, { yPercent: 26 }, {
        yPercent: -26,
        ease: 'none',
        scrollTrigger: { trigger: num, start: 'top bottom', end: 'bottom top', scrub: 0.5 }
      });
    });

    // marquee reacts to scroll velocity for a kinetic feel
    var track = document.querySelector('.marquee__track');
    if (track) {
      gsap.to(track, {
        ease: 'none',
        scrollTrigger: {
          trigger: '.marquee',
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
          onUpdate: function (self) {
            track.style.animationDuration = (34 / (1 + Math.abs(self.getVelocity()) / 4000)).toFixed(2) + 's';
          }
        }
      });
    }
  });

})();
