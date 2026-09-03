(function () {
  // Hero scrub — a 60fps VIDEO seeked by scroll position, replacing the
  // old canvas frame-sequence (64 stills at 8fps read as steppy).
  // assets/hero/hero-scrub.mp4 is the 4:05-4:13 ride from the POV source
  // clip, encoded specifically for scrubbing: H.264, 1280w, 60fps,
  // keyframe every 8 frames, no B-frames (-g 8 -bf 0), so an arbitrary
  // currentTime seek only ever decodes a handful of frames. The video
  // NEVER plays — scroll progress maps to currentTime and that's it.
  // Re-encode recipe lives in KNOWLEDGE.md.

  const wrapper = document.getElementById('heroScrollWrapper');
  const sticky = document.getElementById('heroSticky');
  const video = document.getElementById('heroVideo');
  if (!wrapper || !sticky || !video) return;
  const beats = Array.from(document.querySelectorAll('.hero-beat'));
  const progressDots = Array.from(document.querySelectorAll('.hero-progress__dot'));
  const progressFill = document.getElementById('heroProgressFill');
  const scrollCue = document.getElementById('heroScrollCue');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Adaptive quality: the markup carries no <source>; pick the encode by
  // how many DEVICE pixels the full-bleed hero actually spans. ≥1600
  // device px gets the 1920w/15MB file (a 1280w encode upscaled ~2x on
  // those screens is exactly what reads as "not 4K"); below that the
  // 1280w/8MB file is already at or above native resolution. Decided once
  // at load — swapping encodes mid-scrub would restart the download.
  const devicePx = window.innerWidth * (window.devicePixelRatio || 1);
  video.src = devicePx >= 1600 ? video.dataset.srcHd : video.dataset.srcSd;
  video.load();

  // MOBILE FIX: a video that only ever gets scrubbed via currentTime (never
  // actually played) is exactly the case mobile browsers refuse to buffer
  // past the poster frame for — preload="auto" is advisory only, and
  // without a real play() they treat it as "not really needed yet" and
  // never fetch beyond metadata. iOS/WebKit is stricter still: it only
  // grants the "silent autoplay, no gesture needed" allowance to a video
  // whose `autoplay` attribute was present in the markup (see index.html) —
  // a script-triggered play() with no user gesture can be vetoed even when
  // muted+playsinline, which is why this can work in a Chrome/Android test
  // and still show nothing on a real iPhone. Two layers here: the markup
  // attribute does the real work on iOS, and this 'play' listener slams it
  // straight back to paused the instant ANYTHING starts it playing —
  // native autoplay, primeBuffering() below, anything — so nothing is ever
  // actually visible; hero-scroll.js owns currentTime entirely via scroll.
  video.addEventListener('play', function () { video.pause(); });

  // Fallback for browsers that don't extend the autoplay attribute's
  // allowance to a src assigned later via JS: an explicit play()-then-
  // pause(), retried on the user's first touch/scroll in case Low Power
  // Mode or a strict data-saver setting vetoed the very first silent
  // attempt.
  var primed = false;
  function primeBuffering() {
    if (primed) return;
    if (video.readyState >= 2 /* HAVE_CURRENT_DATA */) { primed = true; return; }
    var p = video.play();
    if (p && p.then) {
      p.then(function () { primed = true; video.pause(); }).catch(function () {
        // veto'd (Low Power Mode etc.) — the touch/scroll listeners below
        // will try again on the user's first real interaction
      });
    } else {
      primed = true;
      video.pause();
    }
  }
  primeBuffering();
  ['touchstart', 'pointerdown', 'scroll'].forEach(function (evt) {
    window.addEventListener(evt, primeBuffering, { passive: true });
  });

  // Standard ease-out-expo curve (same character as cubic-bezier(0.16,1,0.3,1)):
  // fast off the mark, settles smoothly. Applied to the linear scroll progress
  // before it drives opacity/translateX, so the motion feels premium rather
  // than mechanically 1:1 with the scrollbar. Deliberately NOT a CSS
  // transition, which would lag behind the actual scroll position.
  function easeOutExpo(t) {
    return t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  // Scroll-scrub smoothing: a fast flick of a trackpad/wheel can move the
  // raw scroll position by a huge chunk of the ~460vh hero in a single
  // frame. We track the raw scroll-derived TARGET progress separately from
  // a DISPLAY progress that eases toward it a little every animation frame,
  // so a fast scroll still catches up smoothly instead of teleporting.
  let targetProgress = 0;
  let displayProgress = 0;
  const SMOOTHING = reducedMotion ? 1 : 0.11; // 1 = no smoothing (instant); lower = floatier
  let looping = false;

  /* Seek gate: video seeks are async, and assigning currentTime while a
     previous seek is still in flight makes browsers drop/queue them
     unpredictably (visible as hitching). So only one seek is ever in
     flight; the newest wanted time waits in pendingSeek and fires from
     the 'seeked' event. Net effect: the video scrubs as fast as the
     decoder can actually deliver frames, never faster, never stale. */
  let seekReady = false;
  let seekBusy = false;
  let pendingSeek = -1;

  function requestSeek(t) {
    if (!seekReady) return;
    if (seekBusy) { pendingSeek = t; return; }
    // Skip micro-seeks below one source frame (1/60s) — they cost a full
    // async seek round-trip and change nothing visible.
    if (Math.abs(video.currentTime - t) < 1 / 60) return;
    seekBusy = true;
    video.currentTime = t;
  }
  video.addEventListener('seeked', function () {
    seekBusy = false;
    if (pendingSeek >= 0) {
      const t = pendingSeek;
      pendingSeek = -1;
      requestSeek(t);
    }
  });

  // How far off-center a beat starts/ends, in px. Slightly larger on narrow
  // viewports so the slide still reads as a deliberate motion rather than
  // a barely-there nudge (tuned by testing at 1400px and 390px widths).
  function beatOffDistance() {
    return window.innerWidth < 640 ? 96 : 80;
  }

  function updateBeats(progress) {
    const offDistance = beatOffDistance();
    beats.forEach((beat, i) => {
      const start = parseFloat(beat.dataset.start);
      const end = parseFloat(beat.dataset.end);
      const fadeMargin = (end - start) * 0.2;
      const direction = i % 2 === 0 ? -1 : 1; // alternate left/right per beat

      let localProgress = 0; // 0 = fully off to the side, 1 = fully centered

      if (progress >= start && progress <= end) {
        // a beat starting at 0 is already on screen when the page loads
        // (progress 0), so it holds fully centered/opaque instead of
        // computing (progress-start)/fadeMargin, which would evaluate to 0
        // right at the top of the page and hide the opening headline/CTA
        if (start === 0) {
          localProgress = progress > end - fadeMargin ? (end - progress) / fadeMargin : 1;
        } else if (progress < start + fadeMargin) {
          localProgress = (progress - start) / fadeMargin;
        } else if (progress > end - fadeMargin) {
          localProgress = (end - progress) / fadeMargin;
        } else {
          localProgress = 1;
        }
      }

      // opacity and translateX both derive from the SAME eased value, so
      // the fade and the slide always settle in lockstep
      const eased = easeOutExpo(Math.max(0, Math.min(1, localProgress)));
      const translateX = direction * offDistance * (1 - eased);
      beat.style.opacity = eased;
      beat.style.transform = `translateX(${translateX}px)`;
    });
  }

  // Highlights the dot for whichever beat's [start,end] range currently
  // contains progress. Pure feedback: shows there's more sequence ahead.
  function updateProgressDots(progress) {
    beats.forEach((beat, i) => {
      const start = parseFloat(beat.dataset.start);
      const end = parseFloat(beat.dataset.end);
      const dot = progressDots[i];
      if (!dot) return;
      dot.classList.toggle('is-active', progress >= start && progress <= end);
    });
  }

  // Raw scroll-derived progress (0-1), un-smoothed. This is the TARGET the
  // display progress eases toward every frame — see tick() below.
  function getTargetProgress() {
    const rect = wrapper.getBoundingClientRect();
    const scrollable = wrapper.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return 0;
    return Math.max(0, Math.min(1, -rect.top / scrollable));
  }

  // Paints everything hero-related from a single (already-smoothed)
  // progress value: the video seek, the Ken Burns drift, the beat text,
  // the progress rail, the scroll cue and the exit dissolve.
  function render(progress) {
    if (seekReady) {
      // clamp a hair inside the duration — seeking exactly to the end can
      // land on a black terminator frame in some demuxers
      const dur = video.duration || 8;
      requestSeek(Math.min(progress * dur, dur - 0.02));
    }

    // Slow, continuous zoom drift — so the frame never looks perfectly
    // static between scroll ticks. Skipped under reduced-motion since
    // it's a standing transform, not a one-off transition.
    if (!reducedMotion) video.style.transform = 'scale(' + (1 + progress * 0.06) + ')';

    updateBeats(progress);
    updateProgressDots(progress);
    if (progressFill) progressFill.style.height = (progress * 100) + '%';

    // the scroll cue is only meaningful before the user has actually
    // started scrolling; fade it out over the first sliver of progress
    if (scrollCue) {
      const cueFadeEnd = 0.025;
      scrollCue.style.opacity = progress >= cueFadeEnd ? 0 : 1 - progress / cueFadeEnd;
    }

    // EXIT DISSOLVE — replaces the old white-out (a full-white overlay
    // that just sat there looking frozen for the last 15% of the scroll).
    // Instead the whole sticky hero fades away, revealing the LIVE ocean
    // background video running behind it (.hero-scroll-wrapper is
    // transparent), and the glass pane then scrolls up over that. The
    // background keeps moving through the transition, so nothing ever
    // reads as frozen. Beats end at 0.84 (see index.html data-end), so
    // the dissolve starts right after the last one.
    const exitStart = 0.85;
    const exit = progress > exitStart ? (progress - exitStart) / (1 - exitStart) : 0;
    sticky.style.opacity = String(1 - exit);
    // don't leave an invisible CTA hovering over the ocean, catching clicks
    sticky.style.pointerEvents = exit > 0.4 ? 'none' : '';
  }

  // Runs every animation frame while there's ground to cover between the
  // raw scroll position and what's on screen. Self-stops once the two
  // converge so a page that's just sitting still isn't burning rAFs
  // forever, and wake() below restarts it the next time it's needed.
  function tick() {
    targetProgress = getTargetProgress();
    displayProgress += (targetProgress - displayProgress) * SMOOTHING;
    if (Math.abs(targetProgress - displayProgress) < 0.0004) displayProgress = targetProgress;
    render(displayProgress);

    if (displayProgress !== targetProgress) {
      requestAnimationFrame(tick);
    } else {
      looping = false;
    }
  }

  function wake() {
    if (!looping) { looping = true; requestAnimationFrame(tick); }
  }

  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener('resize', wake);

  function init() {
    seekReady = true;
    // Wait two animation frames before the first paint. If the tab loaded
    // in the background (a link opened from Instagram/WhatsApp lands in an
    // unfocused tab), layout values can briefly read 0, which would bake a
    // wrong initial state in. Two rAFs land after the browser has
    // committed a real layout for a now-visible tab.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      displayProgress = targetProgress = getTargetProgress();
      render(displayProgress);
      wake();
    }));
  }

  if (video.readyState >= 1 /* HAVE_METADATA */) {
    init();
  } else {
    video.addEventListener('loadedmetadata', init, { once: true });
  }

  // Belt-and-suspenders for the background-tab scenario: re-sync whenever
  // the tab actually becomes visible.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
  });
})();
