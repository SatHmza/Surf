(function () {
  // Real values from assets/timelapse/: 53 frames (aerial drone footage of
  // a surfer riding a wave into shore), named ezgif-frame-001.jpg ..
  // ezgif-frame-053.jpg (3-digit, zero-padded, 1-indexed). The old 103-frame
  // set's leftover files (ezgif-frame-054.jpg onward, if still present)
  // are unused now and can be deleted from assets/timelapse/.
  const FRAME_COUNT = 53;
  const FRAME_PATH = i => `assets/timelapse/ezgif-frame-${String(i + 1).padStart(3, '0')}.jpg`;

  const wrapper = document.getElementById('heroScrollWrapper');
  const canvas = document.getElementById('heroCanvas');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('whiteoutOverlay');
  const beats = Array.from(document.querySelectorAll('.hero-beat'));
  const progressDots = Array.from(document.querySelectorAll('.hero-progress__dot'));
  const progressFill = document.getElementById('heroProgressFill');
  const scrollCue = document.getElementById('heroScrollCue');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Standard ease-out-expo curve (same character as cubic-bezier(0.16,1,0.3,1)):
  // fast off the mark, settles smoothly. Applied to the linear scroll progress
  // before it drives opacity/translateX, so the motion feels premium rather
  // than mechanically 1:1 with the scrollbar. Deliberately NOT a CSS
  // transition, which would lag behind the actual scroll position.
  function easeOutExpo(t) {
    return t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  const images = new Array(FRAME_COUNT);
  const loadedFlags = new Array(FRAME_COUNT).fill(false);
  let currentFrame = -1;
  let currentFrac = 0;

  // Scroll-scrub smoothing: a fast flick of a trackpad/wheel can move the
  // raw scroll position by a huge chunk of the ~460vh hero in a single
  // frame. Rendering that instantly used to make the timelapse jump several
  // frames at once and snap the beat text straight to its end state, which
  // read as broken rather than just "fast". Instead we track the raw
  // scroll-derived TARGET progress separately from a DISPLAY progress that
  // eases toward it a little every animation frame, so a fast scroll still
  // catches up smoothly over a few frames instead of teleporting.
  let targetProgress = 0;
  let displayProgress = 0;
  const SMOOTHING = reducedMotion ? 1 : 0.14; // 1 = no smoothing (instant)
  let looping = false;

  // Falls back to the nearest ALREADY-loaded frame when the exact target
  // isn't ready yet, so a fast scroll never leaves the canvas stuck on a
  // stale frame while its neighbours are still in flight.
  function nearestLoadedFrame(target) {
    if (loadedFlags[target]) return target;
    for (let d = 1; d < FRAME_COUNT; d++) {
      if (target - d >= 0 && loadedFlags[target - d]) return target - d;
      if (target + d < FRAME_COUNT && loadedFlags[target + d]) return target + d;
    }
    return -1;
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawFrame(Math.max(currentFrame, 0), currentFrac);
  }

  // Draws one image "cover"-fit into the canvas (letterboxed/cropped to
  // fill, matching CSS object-fit: cover). Pulled out of drawFrame so the
  // cross-fade below can call it twice — once per frame being blended.
  function drawImageCover(img, alpha) {
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const canvasRatio = canvas.width / canvas.height;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    let dw, dh, dx, dy;
    if (imgRatio > canvasRatio) {
      dh = canvas.height; dw = img.naturalWidth * (dh / img.naturalHeight);
      dx = (canvas.width - dw) / 2; dy = 0;
    } else {
      dw = canvas.width; dh = img.naturalHeight * (dw / img.naturalWidth);
      dx = 0; dy = (canvas.height - dh) / 2;
    }
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(img, dx, dy, dw, dh);
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = 1;
  }

  // Draws frame `index`, cross-fading toward frame `index + 1` by `frac`
  // (0-1, the fractional part of the scroll-driven frame position — see
  // render() below). Without this, scrolling between two stills was a hard
  // filmstrip swap; blending the two makes the timelapse read as continuous
  // motion instead.
  function drawFrame(index, frac) {
    const a = loadedFlags[index] ? index : nearestLoadedFrame(index);
    if (a === -1) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawImageCover(images[a]);
    if (frac && frac > 0.004) {
      const nextIndex = Math.min(index + 1, FRAME_COUNT - 1);
      const b = loadedFlags[nextIndex] ? nextIndex : nearestLoadedFrame(nextIndex);
      if (b !== -1 && b !== a) drawImageCover(images[b], frac);
    }
  }

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
        // (and slide it off to the side) on load
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
  // progress value: the canvas frame/cross-fade, the Ken Burns drift, the
  // beat text, the progress rail, the scroll cue and the whiteout ramp.
  function render(progress) {
    // Fractional frame position: the integer part picks the base frame,
    // the remainder drives how far drawFrame cross-fades toward the next
    // one, so motion stays smooth even though only 53 stills exist.
    const exact = progress * (FRAME_COUNT - 1);
    currentFrame = Math.min(FRAME_COUNT - 1, Math.floor(exact));
    currentFrac = exact - currentFrame;
    drawFrame(currentFrame, currentFrac);

    // Slow, continuous zoom drift — independent of the frame cross-fade
    // above — so the canvas never looks perfectly static between scroll
    // ticks. Skipped under reduced-motion since it's a standing transform,
    // not a one-off transition.
    if (!reducedMotion) canvas.style.transform = 'scale(' + (1 + progress * 0.06) + ')';

    updateBeats(progress);
    updateProgressDots(progress);
    if (progressFill) progressFill.style.height = (progress * 100) + '%';

    // the scroll cue is only meaningful before the user has actually
    // started scrolling; fade it out over the first sliver of progress
    if (scrollCue) {
      const cueFadeEnd = 0.025;
      scrollCue.style.opacity = progress >= cueFadeEnd ? 0 : 1 - progress / cueFadeEnd;
    }

    // Beats now run through progress 0.84 (see index.html data-start/
    // data-end), so the whiteout ramp starts right after the last one
    // instead of leaving a stretch of dead scroll in between.
    const whiteoutStart = 0.86;
    overlay.style.opacity = progress > whiteoutStart ? (progress - whiteoutStart) / (1 - whiteoutStart) : 0;
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
  window.addEventListener('resize', () => { resizeCanvas(); wake(); });

  /* ---- loading: priority frames (start/middle/end) first with a small
     concurrency pool, then the rest sorted by proximity to the middle
     frame, instead of firing all FRAME_COUNT requests at once. Keeps the
     scroll listener from starting before there's anything to show, and
     avoids saturating the network/decode pipeline with 100+ simultaneous
     requests, which is what caused frames to stall while scrolling
     through parts of the sequence that hadn't loaded yet. ---- */

  function loadFrame(index, onDone) {
    if (loadedFlags[index]) return onDone();
    const img = new Image();
    images[index] = img;
    img.decoding = 'async';
    img.onload = () => {
      loadedFlags[index] = true;
      // redraw if this frame is either half of the current blend (base or
      // the next one being cross-faded toward)
      if (index === currentFrame || index === currentFrame + 1) drawFrame(currentFrame, currentFrac);
      onDone();
    };
    img.onerror = onDone;
    img.src = FRAME_PATH(index);
  }

  function loadQueueWithConcurrency(queue, concurrency, onQueueDone) {
    let next = 0;
    let inFlight = 0;
    function pump() {
      while (inFlight < concurrency && next < queue.length) {
        const idx = queue[next++];
        inFlight++;
        loadFrame(idx, () => { inFlight--; pump(); });
      }
      if (inFlight === 0 && next >= queue.length && onQueueDone) {
        onQueueDone();
        onQueueDone = null; // guard against double-fire
      }
    }
    pump();
  }

  function startLoading() {
    const mid = Math.round((FRAME_COUNT - 1) / 2);
    const priority = [0, mid, FRAME_COUNT - 1];

    const rest = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      if (priority.indexOf(i) === -1) rest.push(i);
    }
    rest.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));

    loadQueueWithConcurrency(priority, 3, () => {
      // Wait two animation frames before the first paint. If the tab loaded
      // in the background (a very common real-world case: a link opened
      // from Instagram/WhatsApp/a group chat lands in an unfocused tab),
      // window.innerWidth/innerHeight can briefly read 0 here, which bakes
      // a wrong "mobile" offset and a blank canvas into the initial paint
      // and — since resize only ever redraws the canvas, not the beats —
      // that wrong state would otherwise never self-correct until the user
      // scrolls. Two rAFs reliably land after the browser has committed a
      // real layout for a now-visible tab.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        resizeCanvas();
        displayProgress = targetProgress = getTargetProgress();
        wake();
      }));
      loadQueueWithConcurrency(rest, 6);
    });

    // Belt-and-suspenders for the same background-tab scenario: if the page
    // was still hidden when the two rAFs above fired, re-run once the tab
    // actually becomes visible, so the hero never gets permanently stuck on
    // its (possibly wrong) first-paint state.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        resizeCanvas();
        wake();
      }
    });
  }

  startLoading();
})();
