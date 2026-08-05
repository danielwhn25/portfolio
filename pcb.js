/* ============================================================
   Daniel Ng. Portfolio, layer-stack edition.

   Three jobs:
     1. draw a plausible copper layer for every board in the stack
     2. fly a camera down through that stack as the page scrolls
     3. the ordinary page furniture (reveals, nav, chess feed)

   The stack is decorative: every project is also plain markup in
   .panel, so the page still reads with JS off or motion reduced.
   ============================================================ */
(() => {
  'use strict';

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  /* Deterministic PRNG so a given layer always draws the same board. */
  const rng = seed => {
    let s = (seed * 2654435761) >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  /* ══ 1. Layer artwork ═══════════════════════════════════════
     Board is 900 × 580 user units. M is the routing keepout. */

  const W = 900, H = 580, M = 34;

  /* Manhattan-plus-45° route, the way a real autorouter breaks a corner. */
  const route = (x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1;
    const run = Math.min(Math.abs(dx), Math.abs(dy));
    const mx = x1 + Math.sign(dx) * run;
    const my = y1 + Math.sign(dy) * run;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${mx.toFixed(1)} ${my.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };

  const via = (x, y, r = 5.5) =>
    `<circle class="pcb-pad" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>` +
    `<circle class="pcb-drill" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * .45).toFixed(1)}"/>`;

  /* Quad-flat package: pad fences on all four sides. */
  const qfp = (cx, cy, body, perSide, pitch) => {
    const out = [];
    const padL = 15, padW = 5.5;
    const half = body / 2;
    const span = (perSide - 1) * pitch;
    for (let i = 0; i < perSide; i++) {
      const o = -span / 2 + i * pitch;
      // top / bottom
      out.push(`<rect class="pcb-pad" x="${(cx + o - padW / 2).toFixed(1)}" y="${(cy - half - padL).toFixed(1)}" width="${padW}" height="${padL}" rx="2"/>`);
      out.push(`<rect class="pcb-pad" x="${(cx + o - padW / 2).toFixed(1)}" y="${(cy + half).toFixed(1)}" width="${padW}" height="${padL}" rx="2"/>`);
      // left / right
      out.push(`<rect class="pcb-pad" x="${(cx - half - padL).toFixed(1)}" y="${(cy + o - padW / 2).toFixed(1)}" width="${padL}" height="${padW}" rx="2"/>`);
      out.push(`<rect class="pcb-pad" x="${(cx + half).toFixed(1)}" y="${(cy + o - padW / 2).toFixed(1)}" width="${padL}" height="${padW}" rx="2"/>`);
    }
    out.push(`<rect class="pcb-silk-line" x="${(cx - half).toFixed(1)}" y="${(cy - half).toFixed(1)}" width="${body}" height="${body}" rx="3"/>`);
    out.push(`<circle class="pcb-silk" cx="${(cx - half + 9).toFixed(1)}" cy="${(cy - half + 9).toFixed(1)}" r="3"/>`);
    return out.join('');
  };

  /* Two-pad passive, 0603-ish. */
  const passive = (x, y, rot) => {
    const g = `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})">` +
      `<rect class="pcb-pad" x="-13" y="-6" width="9" height="12" rx="1.5"/>` +
      `<rect class="pcb-pad" x="4" y="-6" width="9" height="12" rx="1.5"/>` +
      `</g>`;
    return g;
  };

  /* Edge connector: a row of finger pads. */
  const connector = (x, y, count, vertical) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const px = vertical ? x : x + i * 15;
      const py = vertical ? y + i * 15 : y;
      out.push(`<rect class="pcb-pad" x="${px}" y="${py}" width="${vertical ? 26 : 9}" height="${vertical ? 9 : 26}" rx="2"/>`);
    }
    return out.join('');
  };

  const DESIGNATORS = ['R', 'C', 'U', 'L', 'D', 'Q', 'J', 'TP', 'FB', 'Y'];

  const drawLayer = el => {
    const kind = el.dataset.kind;
    const seed = Number(el.dataset.seed) || 1;
    const title = el.dataset.silk || '';
    const name = el.dataset.name || '';
    const R = rng(seed);
    const uid = `u${seed}`;
    const svg = [];

    svg.push(`<defs>
      <pattern id="hx-${uid}" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line class="pcb-hatch" x1="0" y1="0" x2="0" y2="13"/></pattern>
      <clipPath id="cp-${uid}"><rect x="0" y="0" width="${W}" height="${H}" rx="18"/></clipPath>
    </defs>`);

    /* Board body + outline. Everything after this is clipped to the routing
       area, so no trace can wander off the board edge. */
    svg.push(`<rect class="pcb-body" x="0" y="0" width="${W}" height="${H}" rx="18"/>`);
    svg.push(`<g clip-path="url(#cp-${uid})">`);
    svg.push(`<rect class="pcb-rim" x="${M / 2}" y="${M / 2}" width="${W - M}" height="${H - M}" rx="11" stroke-dasharray="7 9"/>`);

    /* Vias are shared between the copper and the plane cut-outs. */
    const vias = [];
    for (let i = 0; i < 30; i++) {
      vias.push({
        x: M + 24 + R() * (W - 2 * M - 48),
        y: M + 24 + R() * (H - 2 * M - 48)
      });
    }

    if (kind === 'plane') {
      /* Copper pour, hatched, with a split between the two rails. */
      svg.push(`<rect class="pcb-pour" x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" rx="12"/>`);
      svg.push(`<rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" rx="12" fill="url(#hx-${uid})" opacity=".28"/>`);

      const splitY = 200 + R() * 180;
      svg.push(`<path class="pcb-antipad" stroke="var(--mask)" stroke-width="16" fill="none" stroke-linecap="round"
        d="${route(M, splitY, W - M, splitY + (R() * 120 - 60))}"/>`);

      /* Stitching vias hugging the board edge. */
      for (let x = M + 40; x < W - M - 30; x += 62) {
        vias.push({ x, y: M + 16 }, { x, y: H - M - 16 });
      }

      /* Anti-pads clear every via out of the pour. */
      vias.forEach(v => svg.push(`<circle class="pcb-antipad" cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}" r="11"/>`));
      vias.forEach(v => svg.push(via(v.x, v.y, 5)));

      /* A couple of breakout traces escaping the plane. */
      for (let i = 0; i < 3; i++) {
        svg.push(`<path class="pcb-trace" style="stroke-width:5" d="${route(
          M + 30 + R() * 200, M + 30 + R() * (H - 2 * M - 60),
          W - M - 40 - R() * 220, M + 30 + R() * (H - 2 * M - 60))}"/>`);
      }
      svg.push(`<text class="pcb-label" x="${M + 12}" y="${H - M - 6}">POUR &#183; ${kind.toUpperCase()} &#183; 1oz Cu</text>`);
    }

    if (kind === 'signal') {
      /* Buses first: parallel runs read instantly as routing. Both ends are
         kept out of the middle band so the silkscreen name stays legible. */
      const band = () => R() < .5 ? M + 24 + R() * 150 : H - M - 190 + R() * 140;
      for (let b = 0; b < 4; b++) {
        const n = 4 + Math.floor(R() * 5);
        const pitch = 9 + R() * 6;
        const x1 = M + 20 + R() * 240;
        const y1 = band();
        const x2 = clamp(x1 + 220 + R() * 380, M + 40, W - M - 20);
        const y2 = band();
        const width = 3 + R() * 2;
        for (let i = 0; i < n; i++) {
          svg.push(`<path class="pcb-trace" style="stroke-width:${width.toFixed(1)}" opacity="${(0.55 + R() * .4).toFixed(2)}"
            d="${route(x1, y1 + i * pitch, x2, y2 + i * pitch)}"/>`);
        }
      }

      /* Scattered single nets. */
      for (let i = 0; i < 16; i++) {
        const x1 = M + 20 + R() * (W - 2 * M - 40);
        const y1 = band();
        const x2 = M + 20 + R() * (W - 2 * M - 40);
        const y2 = band();
        svg.push(`<path class="pcb-trace" style="stroke-width:${(2.5 + R() * 4).toFixed(1)}" opacity="${(0.4 + R() * .5).toFixed(2)}" d="${route(x1, y1, x2, y2)}"/>`);
      }

      svg.push(qfp(230 + R() * 90, 118 + R() * 30, 92, 9, 11));
      svg.push(qfp(650 + R() * 60, 430 + R() * 40, 62, 6, 10));
      for (let i = 0; i < 9; i++) {
        svg.push(passive(M + 40 + R() * (W - 2 * M - 80), band(), R() > .5 ? 0 : 90));
      }
      svg.push(connector(W - M - 34, M + 60, 8, true));
      svg.push(connector(M + 60, H - M - 34, 6, false));
      vias.forEach(v => svg.push(via(v.x, v.y)));

      svg.push(`<text class="pcb-label" x="${M + 12}" y="${H - M - 6}">SIGNAL &#183; 50&#8486; SE / 100&#8486; DIFF</text>`);
    }

    if (kind === 'silk') {
      /* Overlay layer: outlines and designators, no copper. */
      for (let i = 0; i < 22; i++) {
        const x = M + 30 + R() * (W - 2 * M - 110);
        const y = M + 30 + R() * (H - 2 * M - 70);
        const w = 22 + R() * 46;
        const h = 12 + R() * 20;
        svg.push(`<rect class="pcb-silk-line" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2.5"/>`);
        const d = DESIGNATORS[Math.floor(R() * DESIGNATORS.length)] + (1 + Math.floor(R() * 48));
        svg.push(`<text class="pcb-desig" x="${x.toFixed(1)}" y="${(y - 5).toFixed(1)}">${d}</text>`);
      }
      svg.push(qfp(280, 190, 100, 9, 11));
      svg.push(`<circle class="pcb-silk" cx="700" cy="150" r="3.5"/>`);
      svg.push(`<text class="pcb-desig" x="716" y="155">U1 PIN 1</text>`);
      svg.push(`<text class="pcb-label" x="${M + 12}" y="${H - M - 6}">REV 2.1</text>`);
      vias.slice(0, 10).forEach(v => svg.push(`<circle class="pcb-silk-line" cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}" r="7"/>`));
    }

    /* Mounting holes sit above everything, like real drills. */
    [[M + 6, M + 6], [W - M - 6, M + 6], [M + 6, H - M - 6], [W - M - 6, H - M - 6]].forEach(([x, y]) => {
      svg.push(`<circle class="pcb-hole" cx="${x}" cy="${y}" r="13"/><circle class="pcb-drill" cx="${x}" cy="${y}" r="7"/>`);
    });

    /* The project name, printed on the board. The mask-coloured halo is the
       silkscreen clearance. It's what lets the name read over dense copper. */
    if (title) {
      const size = clamp(760 / (title.length * 0.72), 34, 82);
      const y = H / 2 + size * .34;
      const at = `x="${W / 2}" y="${y.toFixed(0)}" font-size="${size.toFixed(0)}" text-anchor="middle"`;
      svg.push(`<text class="pcb-title-halo" ${at}>${title}</text>`);
      svg.push(`<text class="pcb-title-fill" ${at}>${title}</text>`);
      svg.push(`<text class="pcb-title" ${at}>${title}</text>`);
    }
    if (name) {
      svg.push(`<text class="pcb-label" x="${W - M - 12}" y="${M + 4}" text-anchor="end">${name}</text>`);
    }

    svg.push(`</g>`);
    svg.push(`<rect class="pcb-edge" x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="17"/>`);

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${svg.join('')}</svg>`;
  };

  /* A layer either carries real Gerber output exported from Altium
     (data-art, built by tools/build-layers.mjs) or is drawn above.
     If the file can't be fetched (opened over file://, say) the
     generated board stands in so the stack is never empty. */
  const paintLayer = el => {
    const art = el.dataset.art;
    if (!art) return drawLayer(el);

    fetch(art)
      .then(res => {
        if (!res.ok) throw new Error(res.status);
        return res.text();
      })
      .then(svg => { el.innerHTML = svg; })
      .catch(() => {
        el.dataset.kind = 'signal';
        el.dataset.seed = String(art.length * 7);
        drawLayer(el);
      });
  };

  /* ══ 2. The stack ═══════════════════════════════════════════ */

  const initStack = () => {
    const track = document.querySelector('[data-track]');
    const stage = document.querySelector('[data-stage]');
    const board = document.querySelector('[data-board]');
    const rail = document.querySelector('.layer-rail');
    const layers = [...document.querySelectorAll('.layer')];
    const panels = [...document.querySelectorAll('.panel')];
    if (!track || !board || !layers.length) return;

    const N = layers.length;
    const HOLD = 0.07;          // dead zone at each end so the first and last layer settle
    const GAP_CLOSED = 30;      // laminated board
    const GAP_OPEN = 285;       // delaminated, one layer per screen
    const hudZ = document.querySelector('[data-hud-z]');
    const hudPct = document.querySelector('[data-hud-pct]');
    const hudLayer = document.querySelector('[data-hud-layer]');

    /* Layer names live on the panel eyebrows: single source of truth. */
    const meta = layers.map((el, i) => {
      const eyebrow = panels[i] && panels[i].querySelector('.layer-eyebrow');
      const text = eyebrow ? eyebrow.textContent.trim() : `L${i + 1}`;
      const [code, ...rest] = text.split('·');
      return {
        code: code.trim(),
        name: rest.join('·').trim() || code.trim(),
        hue: el.style.getPropertyValue('--hue').trim() || '#e3a93f'
      };
    });

    layers.forEach((el, i) => {
      el.dataset.name = `${meta[i].code} ${meta[i].name}`.toUpperCase();
      paintLayer(el);
    });

    /* Scroll position that puts layer i under the camera. */
    const goTo = (i, smooth) => {
      const usable = track.offsetHeight - innerHeight;
      const t = HOLD + (clamp(i, 0, N - 1) / (N - 1)) * (1 - 2 * HOLD);
      scrollTo({ top: track.offsetTop + t * usable, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    };

    /* Layer tab bar */
    if (rail) {
      rail.innerHTML = meta.map((m, i) =>
        `<button class="layer-tab" type="button" role="tab" data-goto="${i}" style="--hue:${m.hue}" aria-label="${m.code} ${m.name}">
           <i></i>${m.code}<span>&#183; ${m.name}</span>
         </button>`).join('');
      rail.addEventListener('click', event => {
        const btn = event.target.closest('[data-goto]');
        if (btn) goTo(Number(btn.dataset.goto), true);
      });
    }
    const tabs = rail ? [...rail.querySelectorAll('.layer-tab')] : [];

    if (reduceMotion) {
      document.documentElement.classList.add('is-flat');
      return;
    }

    /* Track length: roughly one screen of scroll per layer, plus the holds. */
    const sizeTrack = () => { track.style.height = `${(N - 1) * 105 + 190}vh`; };
    sizeTrack();

    /* Board scale: keep the whole fanned stack inside the viewport. */
    let scale = 1;
    const measure = () => {
      scale = clamp(Math.min(innerWidth / 1360, innerHeight / 860), 0.34, 0.92);
      /* Narrow screens let the board bleed off both edges. It reads better
         big and cropped than small and complete. */
      if (innerWidth <= 1080) scale = clamp(Math.min(innerWidth / 760, innerHeight / 1500), 0.32, 0.7);
      board.style.setProperty('--bscale', scale.toFixed(3));
    };
    measure();
    addEventListener('resize', () => { sizeTrack(); measure(); }, { passive: true });

    const chrome = [...document.querySelectorAll('.layer-rail, .hud')];
    const softBlur = innerWidth > 900;
    let pNow = 0, pTarget = 0, active = -1, running = false;
    let mx = 0.5, my = 0.46;

    const readScroll = () => {
      const rect = track.getBoundingClientRect();
      const usable = Math.max(1, track.offsetHeight - innerHeight);
      const t = clamp(-rect.top / usable, 0, 1);
      const tt = clamp((t - HOLD) / (1 - 2 * HOLD), 0, 1);
      pTarget = tt * (N - 1);
      return t;
    };

    const render = (t, time) => {
      const spread = smoothstep(0, 0.85, pNow);
      const gap = lerp(GAP_CLOSED, GAP_OPEN, spread);

      /* Camera: sit on the plane of layer pNow, looking down the stack. */
      board.style.setProperty('--camz', `${(pNow * gap).toFixed(1)}px`);
      board.style.setProperty('--rx', `${lerp(58, 64, spread).toFixed(2)}deg`);
      board.style.setProperty('--rz', `${(-34 + pNow * 1.1 + Math.sin(time / 4200) * 1.4).toFixed(2)}deg`);
      board.parentElement.style.setProperty('--px', `${(50 + (mx - .5) * 14).toFixed(1)}%`);
      board.parentElement.style.setProperty('--py', `${(46 + (my - .5) * 10).toFixed(1)}%`);

      const mid = (N - 1) / 2;
      layers.forEach((el, i) => {
        const d = pNow - i;                       // >0 the camera has passed it
        /* Against a light page a board that fades toward the background reads
           as ghosted rather than distant, so depth is carried mostly by blur
           and the deeper layers stay close to solid. */
        const o = d > 0
          ? clamp(1 - d / 0.85, 0, 1)             // fades out behind you
          : clamp(1 + d * 0.09, 0.6, 1);          // recedes into the depth
        el.style.setProperty('--z', `${(-i * gap).toFixed(1)}px`);
        el.style.setProperty('--ox', `${((i - mid) * 30 * spread).toFixed(1)}px`);
        el.style.setProperty('--oy', `${((i - mid) * 16 * spread).toFixed(1)}px`);
        el.style.setProperty('--o', o.toFixed(3));
        el.style.visibility = o < 0.008 ? 'hidden' : 'visible';
        if (softBlur) {
          /* Quantised: a blur radius that changes every frame forces a full
             re-raster of the layer, which is the one thing here that costs. */
          const blur = Math.round((d > 0 ? Math.min(10, d * 11) : Math.min(5, -d * 1.3)) * 2) / 2;
          if (blur !== Number(el.dataset.blur)) {
            el.dataset.blur = blur;
            el.style.filter = blur > 0.25 ? `blur(${blur}px)` : 'none';
          }
        }
      });

      const focus = clamp(Math.round(pNow), 0, N - 1);
      if (focus !== active) {
        active = focus;
        panels.forEach((p, i) => {
          p.classList.toggle('is-active', i === focus);
          p.inert = i !== focus;          // keeps off-screen links out of the tab order
        });
        tabs.forEach((b, i) => {
          b.classList.toggle('is-current', i === focus);
          b.setAttribute('aria-selected', i === focus ? 'true' : 'false');
        });
        if (hudLayer) hudLayer.textContent = `${meta[focus].code} ${meta[focus].name}`;
      }
      if (hudZ) hudZ.textContent = `Z ${(pNow * 0.203).toFixed(3)} mm`;
      if (hudPct) hudPct.textContent = `${Math.round(t * 100)}%`;

      /* On the way out the board is allowed to scroll away on its own, but the
         pinned chrome fades first so it never rides up over the next section. */
      const exit = smoothstep(0.88, 1, t);
      chrome.forEach(el => {
        el.style.opacity = (1 - exit).toFixed(3);
        el.style.pointerEvents = exit > 0.5 ? 'none' : '';
      });
    };

    const tick = time => {
      if (!running) return;
      const t = readScroll();
      pNow += (pTarget - pNow) * 0.14;
      if (Math.abs(pTarget - pNow) < 0.0004) pNow = pTarget;
      render(t, time);
      requestAnimationFrame(tick);
    };

    /* Only animate while the board is actually on screen. */
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !running) {
          running = true;
          requestAnimationFrame(tick);
        } else if (!entry.isIntersecting) {
          running = false;
        }
      });
    }, { threshold: 0 });
    io.observe(stage);

    stage.addEventListener('pointermove', event => {
      mx = event.clientX / innerWidth;
      my = event.clientY / innerHeight;
    }, { passive: true });

    /* #layer-3 deep-links straight to a board. */
    const fromHash = () => {
      const hit = /^#layer-(\d+)$/.exec(location.hash);
      if (!hit) return false;
      goTo(Number(hit[1]) - 1, false);
      return true;
    };
    addEventListener('hashchange', () => {
      const hit = /^#layer-(\d+)$/.exec(location.hash);
      if (hit) goTo(Number(hit[1]) - 1, true);
    });
    fromHash();

    readScroll();
    pNow = pTarget;
    render(0, 0);
  };

  /* ══ 3. Page furniture ══════════════════════════════════════ */

  const initReveals = () => {
    document.querySelectorAll('[data-reveal-group]').forEach(group => {
      [...group.children].forEach((child, i) => {
        child.setAttribute('data-reveal', '');
        child.style.setProperty('--reveal-delay', `${i * 80}ms`);
      });
    });

    const targets = document.querySelectorAll('[data-reveal]');
    if (!targets.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
    targets.forEach(el => io.observe(el));
  };

  const initNav = () => {
    const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
    const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    if (!sections.length) return;
    const setActive = () => {
      let current = sections[0].id;
      sections.forEach(s => {
        if (s.getBoundingClientRect().top <= innerHeight * 0.4) current = s.id;
      });
      links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${current}`));
    };
    addEventListener('scroll', setActive, { passive: true });
    setActive();
  };

  /* Chess.com feed: ratings and the last three finished games. */
  const initChess = () => {
    const USER = 'daniel_whn';
    const API = `https://api.chess.com/pub/player/${USER}`;
    const summary = document.querySelector('[data-chess-summary]');
    const cards = [...document.querySelectorAll('[data-recent-game-card]')];
    const pieces = {
      p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
      P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔'
    };

    const getJson = url => fetch(url).then(res => {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    });

    const draw = board => {
      const squares = [];
      (board.dataset.fen || '').split(' ')[0].split('/').forEach(rank => {
        rank.split('').forEach(token => {
          const blanks = Number(token);
          if (blanks) for (let i = 0; i < blanks; i++) squares.push('');
          else squares.push(token);
        });
      });
      if (board.dataset.flip === 'true') squares.reverse();

      const frag = document.createDocumentFragment();
      squares.slice(0, 64).forEach((piece, index) => {
        const cell = document.createElement('span');
        const row = Math.floor(index / 8), col = index % 8;
        cell.className = `chess-square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
        if (piece) {
          cell.textContent = pieces[piece] || '';
          cell.classList.add(piece === piece.toUpperCase() ? 'white-piece' : 'black-piece');
        }
        frag.appendChild(cell);
      });
      board.replaceChildren(frag);
    };

    document.querySelectorAll('[data-chess-board]').forEach(draw);

    if (summary) {
      getJson(`${API}/stats`).then(stats => {
        const line = (label, stat) => stat && stat.last && stat.last.rating ? `${label} ${stat.last.rating}` : '';
        const parts = [
          line('Rapid', stats.chess_rapid),
          line('Blitz', stats.chess_blitz),
          line('Bullet', stats.chess_bullet),
          stats.tactics && stats.tactics.highest ? `Puzzles ${stats.tactics.highest.rating} peak` : ''
        ].filter(Boolean);
        if (parts.length) summary.textContent = `${USER} // ${parts.join(' // ')}`;
      }).catch(() => {});
    }

    if (!cards.length) return;
    const draws = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);
    const label = v => v ? v.charAt(0).toUpperCase() + v.slice(1) : 'Chess';
    const day = ts => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(ts * 1000));

    getJson(`${API}/games/archives`)
      .then(data => {
        const archives = data.archives || [];
        const latest = archives[archives.length - 1];
        return latest ? getJson(latest) : { games: [] };
      })
      .then(data => {
        (data.games || [])
          .filter(g => g.rules === 'chess' && g.fen && g.url)
          .sort((a, b) => b.end_time - a.end_time)
          .slice(0, cards.length)
          .forEach((game, i) => {
            const card = cards[i];
            const board = card.querySelector('[data-chess-board]');
            const isWhite = game.white && game.white.username && game.white.username.toLowerCase() === USER;
            const me = isWhite ? game.white : game.black;
            const them = isWhite ? game.black : game.white;
            const result = me.result === 'win' ? 'Win' : draws.has(me.result) ? 'Draw' : 'Loss';
            const title = `${USER} vs ${them && them.username ? them.username : 'opponent'}`;
            const metaText = `${result} // ${label(game.time_class)} // ${day(game.end_time)}`;

            card.href = game.url;
            card.setAttribute('aria-label', `${title}, ${metaText}`);
            card.querySelector('[data-game-title]').textContent = title;
            card.querySelector('[data-game-meta]').textContent = metaText;
            if (board) {
              board.dataset.fen = game.fen;
              board.dataset.flip = isWhite ? 'false' : 'true';
              draw(board);
            }
          });
      })
      .catch(() => {});
  };

  const start = () => {
    const year = document.querySelector('[data-year]');
    if (year) year.textContent = new Date().getFullYear();
    initStack();
    initReveals();
    initNav();
    initChess();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
