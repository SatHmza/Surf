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
  staggerGroup(".service-grid", 90, 3);
  staggerGroup(".gallery__grid", 70, 5);
  staggerGroup(".about__facts", 100, 2);
  staggerGroup(".stats__grid", 90, 3);
  staggerGroup(".schedule__list", 110, 2);

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
  /* Testimonials carousel — the viewport (css/style.css) is the actual   */
  /* horizontally-scrolling element with scroll-snap, so touch/trackpad   */
  /* drag and native keyboard scrolling already work on their own. These  */
  /* prev/next buttons just nudge scrollLeft by one card's width (card +  */
  /* its flex gap), and their disabled state tracks how close the        */
  /* viewport is to either end so you can't arrow past the last card.     */
  /* ------------------------------------------------------------------ */
  (function () {
    var viewport = document.getElementById("testimonialsViewport");
    var track = viewport ? viewport.querySelector(".testimonials__track") : null;
    var prevBtn = document.getElementById("testimonialsPrev");
    var nextBtn = document.getElementById("testimonialsNext");
    if (!viewport || !track || !prevBtn || !nextBtn) return;

    function cardStep() {
      var card = track.querySelector(".testimonial-card");
      if (!card) return viewport.clientWidth;
      var gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || "0") || 0;
      return card.getBoundingClientRect().width + gap;
    }

    function updateArrowState() {
      var max = track.scrollWidth - viewport.clientWidth;
      var pos = viewport.scrollLeft;
      var atStart = pos <= 2;
      var atEnd = pos >= max - 2;
      prevBtn.disabled = atStart;
      nextBtn.disabled = max <= 2 ? true : atEnd;
    }

    function scrollByCards(dir) {
      viewport.scrollBy({ left: dir * cardStep(), behavior: "smooth" });
    }

    prevBtn.addEventListener("click", function () {
      // A click right after a drag would otherwise also fire scrollByCards
      // on top of wherever the drag left off; suppressClickAfterDrag guards
      // against that (see the drag block below).
      if (suppressClickAfterDrag) return;
      scrollByCards(-1);
    });
    nextBtn.addEventListener("click", function () {
      if (suppressClickAfterDrag) return;
      scrollByCards(1);
    });

    var scrollTicking = false;
    viewport.addEventListener(
      "scroll",
      function () {
        if (!scrollTicking) {
          requestAnimationFrame(function () { updateArrowState(); scrollTicking = false; });
          scrollTicking = true;
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", updateArrowState);
    updateArrowState();

    /* Click-and-drag with a mouse — overflow:auto only picks up touch and
       trackpad gestures natively, not a plain mouse click-drag, so desktop
       mouse users had no way to pan the carousel. This tracks the pointer
       manually and drives viewport.scrollLeft directly (which is always an
       instant, un-smoothed assignment, unlike scrollBy/scrollTo) so the
       cards track the cursor 1:1 while dragging. */
    var isDragging = false;
    var dragStartX = 0;
    var dragStartScrollLeft = 0;
    var dragMoved = false;
    var suppressClickAfterDrag = false;

    viewport.addEventListener("mousedown", function (e) {
      isDragging = true;
      dragMoved = false;
      dragStartX = e.pageX;
      dragStartScrollLeft = viewport.scrollLeft;
      viewport.classList.add("is-dragging");
    });

    window.addEventListener("mousemove", function (e) {
      if (!isDragging) return;
      var delta = e.pageX - dragStartX;
      if (Math.abs(delta) > 3) dragMoved = true;
      viewport.scrollLeft = dragStartScrollLeft - delta;
    });

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      viewport.classList.remove("is-dragging");
      if (dragMoved) {
        // Prevent the mouseup's own click (and, on the arrow buttons, its
        // click handler) from also acting on this same gesture.
        suppressClickAfterDrag = true;
        window.setTimeout(function () { suppressClickAfterDrag = false; }, 50);
      }
    }
    window.addEventListener("mouseup", endDrag);
    viewport.addEventListener("mouseleave", function () { if (isDragging) endDrag(); });

    // Dragging across card text would otherwise start a text-selection drag
    // instead of (or alongside) panning the carousel.
    viewport.addEventListener("dragstart", function (e) { e.preventDefault(); });
  })();

  /* Hero scroll-scrubbed frame sequence now lives in js/hero-scroll.js */
})();
