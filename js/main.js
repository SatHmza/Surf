(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Intro — full-screen wordmark, borrowed from monarque-evenements.com: */
  /* every letter fades/rises in on its own (staggered via --i on each    */
  /* .intro__char, see css/style.css), the full word holds for a beat,    */
  /* then the whole wordmark shrinks down into the real nav's brand text. */
  /* The shrink is a FLIP animation: measure the intro wordmark's rect    */
  /* and the real nav brand's rect, compute the scale/translate between   */
  /* them, then transition from identity to that transform. Because it's */
  /* computed from the actual rendered positions (not a guessed offset),  */
  /* it lands correctly at any viewport width. The whole sequence is      */
  /* timed below to run a solid ~4s. Falls back to just showing the real  */
  /* header immediately if reduced motion is requested or any required    */
  /* element is missing.                                                  */
  /* ------------------------------------------------------------------ */
  (function () {
    var intro = document.getElementById("intro");
    var introInner = document.getElementById("introInner");
    var introWordmark = document.getElementById("introWordmark");
    var introMark = document.getElementById("introMark");
    var introChars = introWordmark ? introWordmark.querySelectorAll(".intro__char") : [];
    var header = document.getElementById("siteHeader");
    // FLIP against the whole .brand link (icon + name), not just the name.
    // Shrinking only the wordmark text used to leave the compass icon
    // (introMark) stranded in place while the text flew off to the nav —
    // since .intro__inner and .brand share the same "icon, gap, text" flex
    // layout, animating the shared .intro__inner container instead carries
    // the icon along with the text so they land together.
    var navBrand = header ? header.querySelector(".brand") : null;
    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function finishIntroImmediately() {
      document.body.classList.remove("intro-active");
      if (header) header.classList.add("is-visible");
      if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
    }

    if (!intro || !introInner || !introWordmark || !header || !navBrand || reducedMotion) {
      finishIntroImmediately();
    } else {
      // Timing constants for the whole sequence — kept in one place so the
      // ~4s total is easy to re-tune. STAGGER_MS / CHAR_DURATION_MS must
      // match the --i multiplier and transition duration on .intro__char
      // in css/style.css; SHRINK_DURATION_MS / FADE_DURATION_MS must match
      // .intro__wordmark.is-shrinking and .intro respectively.
      var REVEAL_START_DELAY_MS = 120;   // beat before the first letter appears
      var STAGGER_MS = 45;               // per-letter delay step (css: --i * 45ms)
      var CHAR_DURATION_MS = 500;        // each letter's own fade/rise duration
      var HOLD_MS = 1350;                // full word sits still before shrinking
      var SHRINK_DURATION_MS = 800;      // wordmark -> nav position
      var HEADER_REVEAL_OFFSET_MS = 400; // reveal real header partway through the shrink
      var FADE_DURATION_MS = 500;        // whole overlay fades out after shrink
      var REMOVE_BUFFER_MS = 100;        // small pad before pruning the intro from the DOM

      if (introMark) window.setTimeout(function () { introMark.classList.add("is-visible"); }, Math.max(0, REVEAL_START_DELAY_MS - 30));

      var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      fontsReady.then(function () {
        window.setTimeout(function () {
          // Kick off the letter-by-letter reveal.
          introWordmark.classList.add("is-revealing");

          var charCount = introChars.length || 1;
          var lastCharDelay = (charCount - 1) * STAGGER_MS;
          var charsDoneMs = lastCharDelay + CHAR_DURATION_MS;

          var shrinkStartMs = charsDoneMs + HOLD_MS;
          var headerRevealMs = shrinkStartMs + HEADER_REVEAL_OFFSET_MS;
          var fadeStartMs = shrinkStartMs + SHRINK_DURATION_MS;
          var removeMs = fadeStartMs + FADE_DURATION_MS + REMOVE_BUFFER_MS;

          window.setTimeout(function () {
            var from = introInner.getBoundingClientRect();
            var to = navBrand.getBoundingClientRect();
            if (!from.width || !from.height || !to.width) { finishIntroImmediately(); return; }

            var scale = to.height / from.height;
            var dx = to.left - from.left;
            // transform-origin is left/center, so align vertical centers
            var dy = (to.top + to.height / 2) - (from.top + from.height / 2);

            introInner.classList.add("is-shrinking");
            introInner.style.transform = "translate(" + dx + "px, " + dy + "px) scale(" + scale + ")";
          }, shrinkStartMs);

          // reveal the real header a little before the shrink finishes so
          // the handoff overlaps instead of reading as a hard swap
          window.setTimeout(function () { header.classList.add("is-visible"); }, headerRevealMs);

          // start fading the whole overlay away right as the shrink completes
          window.setTimeout(function () {
            intro.classList.add("is-hidden");
            document.body.classList.remove("intro-active");
          }, fadeStartMs);

          // remove it once its own fade-out transition has finished
          window.setTimeout(function () {
            if (intro.parentNode) intro.parentNode.removeChild(intro);
          }, removeMs);
        }, REVEAL_START_DELAY_MS);
      });
    }
  })();

  /* ------------------------------------------------------------------ */
  /* Ocean background video — the looping water footage behind the glass */
  /* shell. Now plays on phones too (previously skipped there to save    */
  /* battery/data — re-enabled by request). Still skipped under reduced  */
  /* motion or a slow/data-saver connection, where the poster (a real    */
  /* frame of the loop) just sits there as a static image instead.       */
  /* ------------------------------------------------------------------ */
  (function () {
    var ocean = document.getElementById("oceanBg");
    if (!ocean || typeof ocean.pause !== "function") return;

    var noMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var conn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
    var isConstrainedConnection = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || "")));

    if (noMotion || isConstrainedConnection) {
      return; // leave it exactly as authored: no src, poster frame only
    }

    ocean.src = ocean.dataset.src;
    ocean.preload = "auto";
    ocean.load();

    // Same iOS/WebKit quirk as the hero video (js/hero-scroll.js): a
    // gesture-less play() at page load can be silently vetoed on a real
    // phone even when muted+playsinline+autoplay are all set. Retrying on
    // the user's first touch/scroll is what actually unblocks it there —
    // that's a genuine user gesture, which the page-load attempt never had.
    var started = false;
    function tryPlay() {
      if (started) return;
      var p = ocean.play();
      if (p && p.then) {
        p.then(function () { started = true; }).catch(function () {
          // still vetoed (Low Power Mode etc.) — poster stays until the
          // next touch/scroll retry, or visibilitychange below
        });
      } else {
        started = true;
      }
    }
    tryPlay();
    ["touchstart", "pointerdown", "scroll"].forEach(function (evt) {
      window.addEventListener(evt, tryPlay, { passive: true });
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        ocean.pause();
      } else {
        tryPlay();
      }
    });
  })();

  /* ------------------------------------------------------------------ */
  /* Footer year                                                         */
  /* ------------------------------------------------------------------ */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ------------------------------------------------------------------ */
  /* Mobile nav toggle                                                   */
  /* ------------------------------------------------------------------ */
  var navToggle = document.getElementById("navToggle");
  var mainNav = document.getElementById("mainNav");
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", function () {
      var open = mainNav.classList.toggle("is-open");
      navToggle.classList.toggle("is-open", open);
      navToggle.setAttribute("aria-expanded", String(open));
    });
    mainNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mainNav.classList.remove("is-open");
        navToggle.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Reveal-on-scroll for sections below the hero, and for the motif      */
  /* marks (see index.html). Motifs already carry .reveal-scale in the   */
  /* markup (a scale+fade variant, distinct from the translateY .reveal  */
  /* used elsewhere), so they're only added to the observed list here,   */
  /* not the class-adding step, and both groups share one observer.      */
  /* ------------------------------------------------------------------ */
  var revealTargets = document.querySelectorAll(
    ".about__media, .about__copy, .about__fact, .section-head, .service-card, " +
    ".gallery__img, .location__copy, .location__map, .cta-footer__intro, .footer__form, " +
    ".stats__heading, .stat, .quote__inner, .schedule__row"
  );
  revealTargets.forEach(function (el) { el.classList.add("reveal"); });

  // Stagger siblings within the same group so they cascade in one after
  // another as you scroll, instead of every card/image in a row appearing
  // in the same instant (which is what happens by default: items sitting
  // at the same scroll position all cross the IntersectionObserver
  // threshold together). --reveal-delay is read by the .reveal transition
  // in css/style.css. Capped per group so a long row doesn't end up with
  // the last item lagging seconds behind.
  function staggerGroup(selector, stepMs, maxSteps) {
    document.querySelectorAll(selector).forEach(function (group) {
      Array.prototype.forEach.call(group.children, function (child, i) {
        child.style.setProperty("--reveal-delay", Math.min(i, maxSteps) * stepMs + "ms");
      });
    });
  }
  staggerGroup(".service-grid", 110, 3);
  staggerGroup(".gallery__grid", 90, 5);
  staggerGroup(".about__facts", 120, 2);
  staggerGroup(".stats__grid", 110, 3);
  staggerGroup(".schedule__list", 130, 2);

  var motifRevealTargets = document.querySelectorAll(".reveal-scale");
  var allRevealTargets = Array.prototype.concat.call([], Array.prototype.slice.call(revealTargets), Array.prototype.slice.call(motifRevealTargets));

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    allRevealTargets.forEach(function (el) { io.observe(el); });
  } else {
    allRevealTargets.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ------------------------------------------------------------------ */
  /* Floating WhatsApp CTA                                               */
  /* Floats in once the hero has been scrolled past (the header already  */
  /* carries its own "Book on WhatsApp" button the whole time, so this   */
  /* one only needs to exist once you're deeper into the page), and      */
  /* tucks itself away again whenever the footer's own big CTA is on     */
  /* screen so the two never sit on top of each other.                   */
  /* ------------------------------------------------------------------ */
  var floatingCta = document.getElementById("floatingCta");
  var heroWrapperEl = document.getElementById("heroScrollWrapper");
  var footerEl = document.getElementById("contact");
  if (floatingCta && heroWrapperEl) {
    var footerInView = false;

    if ("IntersectionObserver" in window && footerEl) {
      var footerIo = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) { footerInView = entry.isIntersecting; });
          updateFloatingCta();
        },
        { threshold: 0.15 }
      );
      footerIo.observe(footerEl);
    }

    function updateFloatingCta() {
      var pastHero = heroWrapperEl.getBoundingClientRect().bottom <= 0;
      floatingCta.classList.toggle("is-visible", pastHero && !footerInView);
    }

    var ctaTicking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (!ctaTicking) {
          requestAnimationFrame(function () { updateFloatingCta(); ctaTicking = false; });
          ctaTicking = true;
        }
      },
      { passive: true }
    );
    updateFloatingCta();
  }

  /* ------------------------------------------------------------------ */
  /* Contact form -> WhatsApp deep link                                  */
  /* ------------------------------------------------------------------ */
  var WHATSAPP_NUMBER = "212600000000"; // TODO: replace with the club's real WhatsApp number
  var form = document.getElementById("contactForm");
  var formNote = document.getElementById("formNote");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("cf-name").value.trim();
      var message = document.getElementById("cf-message").value.trim();
      if (!name || !message) {
        formNote.textContent = "Please fill in your name and message.";
        return;
      }
      var text = "Hi Rabat Surf Club, I'm " + name + ". " + message;
      var url = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(text);
      formNote.textContent = "Opening WhatsApp...";
      window.open(url, "_blank", "noopener");
      form.reset();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Testimonials carousel — auto-looping ticker (no arrows). The 3 real */
  /* cards are cloned once (clones aria-hidden) so the track holds two   */
  /* identical sets; the shared rAF loop below (same one that drives the */
  /* WaveTicker motion) advances scrollLeft continuously and wraps it by */
  /* exactly one set's width at the seam — the two positions are pixel-  */
  /* identical, so the loop never visibly jumps. Auto-advance pauses on  */
  /* hover, during a drag, and for a few seconds after a touch; mouse    */
  /* drag panning is kept from the old carousel. Under reduced motion    */
  /* none of this runs — no clones, no auto-scroll, native scrolling.    */
  /* ------------------------------------------------------------------ */
  (function () {
    var viewport = document.getElementById("testimonialsViewport");
    var track = viewport ? viewport.querySelector(".testimonials__track") : null;
    if (!viewport || !track) return;
    var carouselReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!carouselReduced) {
      Array.prototype.slice.call(track.querySelectorAll(".testimonial-card")).forEach(function (card) {
        var clone = card.cloneNode(true);
        clone.setAttribute("aria-hidden", "true");
        track.appendChild(clone);
      });
    }

    function trackGap() {
      return parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || "0") || 0;
    }
    // Width of ONE set of cards including the gap that follows it — the
    // scrollLeft distance at which the second set sits exactly where the
    // first one started (track.scrollWidth spans padding + both sets).
    function wrapWidth() {
      var cs = getComputedStyle(track);
      var pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      return (track.scrollWidth - pad + trackGap()) / 2;
    }

    var AUTO_SPEED = 30;      // auto-scroll, px per second
    var autoPaused = false;   // desktop hover
    var touchPauseUntil = 0;  // mobile: resume a beat after the finger leaves
    viewport.addEventListener("mouseenter", function () { autoPaused = true; });
    viewport.addEventListener("mouseleave", function () { autoPaused = false; });
    viewport.addEventListener("touchstart", function () { touchPauseUntil = performance.now() + 3500; }, { passive: true });

    /* Click-and-drag with a mouse — overflow:auto only picks up touch and
       trackpad gestures natively, not a plain mouse click-drag, so desktop
       mouse users had no way to pan the carousel. This tracks the pointer
       manually and drives viewport.scrollLeft directly (which is always an
       instant, un-smoothed assignment, unlike scrollBy/scrollTo) so the
       cards track the cursor 1:1 while dragging. */
    var isDragging = false;
    var dragStartX = 0;
    var dragStartScrollLeft = 0;

    viewport.addEventListener("mousedown", function (e) {
      isDragging = true;
      dragStartX = e.pageX;
      dragStartScrollLeft = viewport.scrollLeft;
      viewport.classList.add("is-dragging");
    });

    window.addEventListener("mousemove", function (e) {
      if (!isDragging) return;
      var delta = e.pageX - dragStartX;
      viewport.scrollLeft = dragStartScrollLeft - delta;
    });

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      viewport.classList.remove("is-dragging");
    }
    window.addEventListener("mouseup", endDrag);
    viewport.addEventListener("mouseleave", function () { if (isDragging) endDrag(); });

    // Dragging across card text would otherwise start a text-selection drag
    // instead of (or alongside) panning the carousel.
    viewport.addEventListener("dragstart", function (e) { e.preventDefault(); });

    /* WaveTicker motion (native re-implementation of Framer's WaveTicker
       module — the original is a Framer-only ESM, so the effect is built
       here instead): every card rides a slow TRAVELING sine wave. Each
       frame, a card's vertical offset and tilt derive from its current
       on-screen X position (so dragging/arrow-scrolling moves it along
       the wave shape) plus a time term (so even a resting row visibly
       undulates, crests rolling left like swell passing underneath).
       Tilt = cos (the wave's slope), so cards lean into the roll rather
       than staying rigidly upright. The rAF loop only runs while the
       carousel is actually on screen, and not under reduced motion. */
    // Includes the clones — they ride the same wave (their phase comes
    // from on-screen X, so the wave stays continuous across the seam).
    var waveCards = Array.prototype.slice.call(track.querySelectorAll(".testimonial-card"));
    if (waveCards.length && !carouselReduced) {
      var WAVE_AMP = 10;       // px of rise/fall
      var WAVE_LEN = 520;      // px between crests
      var WAVE_SPEED = 0.0011; // phase advance per ms (direction: crests travel left)
      var WAVE_TILT = 1.7;     // max degrees of lean, following the slope

      var waveRunning = false;
      var waveRaf = 0;
      var waveInView = false;
      var lastFrameTs = 0;

      var waveFrame = function (now) {
        if (!waveRunning) return;
        var dt = lastFrameTs ? now - lastFrameTs : 16;
        lastFrameTs = now;
        if (dt > 120) dt = 16; // resumed after jank/tab switch — don't lurch

        // ---- auto-loop advance + seam wrap (see block comment above) ----
        if (!isDragging) {
          if (!autoPaused && now > touchPauseUntil) {
            viewport.scrollLeft += AUTO_SPEED * (dt / 1000);
          }
          var w = wrapWidth();
          if (viewport.scrollLeft >= w) {
            viewport.scrollLeft -= w;
          } else if (viewport.scrollLeft < 1) {
            // covers a user who dragged back to the hard left edge: jump
            // forward one set (pixel-identical position) so there's
            // always room to keep looping in both directions
            viewport.scrollLeft += w;
          }
        }

        var originLeft = viewport.getBoundingClientRect().left;
        waveCards.forEach(function (card) {
          var r = card.getBoundingClientRect();
          var x = r.left + r.width / 2 - originLeft;
          var phase = (x / WAVE_LEN) * Math.PI * 2 - now * WAVE_SPEED;
          var y = Math.sin(phase) * WAVE_AMP;
          var tilt = Math.cos(phase) * WAVE_TILT;
          card.style.transform = "translateY(" + y.toFixed(2) + "px) rotate(" + tilt.toFixed(2) + "deg)";
        });
        waveRaf = requestAnimationFrame(waveFrame);
      };

      var setWave = function (on) {
        if (on && !waveRunning) {
          waveRunning = true;
          lastFrameTs = 0; // fresh dt after a pause — no catch-up jump
          waveRaf = requestAnimationFrame(waveFrame);
        } else if (!on && waveRunning) {
          waveRunning = false;
          cancelAnimationFrame(waveRaf);
        }
      };

      if ("IntersectionObserver" in window) {
        var waveIo = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            waveInView = entry.isIntersecting;
            setWave(waveInView && document.visibilityState !== "hidden");
          });
        }, { threshold: 0 });
        waveIo.observe(viewport);
      } else {
        waveInView = true;
        setWave(true);
      }
      document.addEventListener("visibilitychange", function () {
        setWave(waveInView && document.visibilityState === "visible");
      });
    }
  })();

  /* Hero scroll-scrubbed frame sequence now lives in js/hero-scroll.js */
})();
