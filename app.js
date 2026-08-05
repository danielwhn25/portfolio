/* ============================================================
   Shared behaviour for every page.
   - scroll-driven reveals (IntersectionObserver)
   - nav elevation + active-section tracking
   - appearance (light/dark) toggle
   - model-viewer auto-rotate pause on interaction
   ============================================================ */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Appearance ──────────────────────────────────────────
     The stored choice is applied by an inline snippet in <head>
     so there is no flash; this only wires up the toggle.      */
  const initTheme = () => {
    const toggle = document.querySelector('[data-theme-toggle]');
    if (!toggle) return;

    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const label = () =>
      toggle.setAttribute(
        'aria-label',
        document.documentElement.dataset.theme === 'dark'
          ? 'Switch to light appearance'
          : 'Switch to dark appearance'
      );

    toggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
      label();
    });

    // Follow the OS until the visitor picks a side.
    system.addEventListener('change', event => {
      let stored = null;
      try { stored = localStorage.getItem('theme'); } catch (e) { /* private mode */ }
      if (stored) return;
      document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
      label();
    });

    label();
  };

  /* ── Scroll reveals ──────────────────────────────────────
     Elements marked [data-reveal] fade and rise into place.
     Children of [data-reveal-group] are staggered.           */
  const initReveals = () => {
    document.querySelectorAll('[data-reveal-group]').forEach(group => {
      const step = Number(group.dataset.revealStep || 70);
      [...group.children].forEach((child, i) => {
        if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', '');
        child.style.setProperty('--reveal-delay', `${i * step}ms`);
      });
    });

    const targets = document.querySelectorAll('[data-reveal]');
    if (!targets.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );

    targets.forEach(el => observer.observe(el));

    // Anything already on screen at load reveals immediately.
    requestAnimationFrame(() => {
      targets.forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.9) {
          el.classList.add('is-visible');
        }
      });
    });
  };

  /* ── Nav: elevation on scroll + active section ── */
  const initNav = () => {
    const nav = document.querySelector('.site-nav');
    if (!nav) return;

    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const links = [...nav.querySelectorAll('.nav-links a[href^="#"]')];
    if (!links.length) return;

    const sections = links
      .map(link => document.querySelector(link.getAttribute('href')))
      .filter(Boolean);
    if (!sections.length) return;

    const setActive = () => {
      let current = sections[0].id;
      sections.forEach(section => {
        if (section.getBoundingClientRect().top <= window.innerHeight * 0.35) current = section.id;
      });
      links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${current}`));
    };

    window.addEventListener('scroll', setActive, { passive: true });
    window.addEventListener('resize', setActive);
    setActive();
  };

  /* ── Side tabs (project pages) ── */
  const initSideTabs = () => {
    const links = [...document.querySelectorAll('.side-tabs a')];
    const sections = [...document.querySelectorAll('.anchor-target')];
    if (!links.length || !sections.length) return;

    const setActive = () => {
      let current = sections[0].id;
      sections.forEach(section => {
        if (section.getBoundingClientRect().top <= window.innerHeight * 0.32) current = section.id;
      });
      links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${current}`));
    };

    window.addEventListener('scroll', setActive, { passive: true });
    window.addEventListener('resize', setActive);
    setActive();
  };

  /* ── model-viewer: pause auto-rotate while the user drags ── */
  const initViewers = () => {
    document.querySelectorAll('model-viewer').forEach(viewer => {
      if (viewer.dataset.rotateBound) return;
      viewer.dataset.rotateBound = 'true';

      const pause = () => {
        if (viewer.hasAttribute('auto-rotate')) {
          viewer.dataset.wasAutoRotate = 'true';
          viewer.removeAttribute('auto-rotate');
        }
        clearTimeout(viewer._resumeTimer);
      };
      const resume = () => {
        if (viewer.dataset.wasAutoRotate !== 'true') return;
        clearTimeout(viewer._resumeTimer);
        viewer._resumeTimer = setTimeout(() => viewer.setAttribute('auto-rotate', ''), 2500);
      };

      viewer.addEventListener('pointerdown', pause);
      viewer.addEventListener('pointerup', resume);
      viewer.addEventListener('pointercancel', resume);
      viewer.addEventListener('mouseleave', resume);
    });
  };

  /* ── Sheet stacks ─────────────────────────────────────────
     Schematics rendered as a tossed pile of paper. Clicking a
     buried sheet shuffles it to the front; clicking the front
     sheet opens it full size.                                 */

  /* Even diagonal cascade: same size, no rotation, uniform step down
     and to the right. The step is wide enough that every buried sheet
     exposes an L of its own edge to hover. */
  const STEP_X = 32;
  const STEP_Y = 30;
  const OPEN = 1.25;   // how much further the cascade spreads on hover

  const initSheetStacks = () => {
    const stacks = [...document.querySelectorAll('[data-sheet-stack]')];
    if (!stacks.length) return;

    const lightbox = createLightbox();

    stacks.forEach(block => {
      const stage = block.querySelector('.sheet-stack');
      const caption = block.querySelector('[data-sheet-caption]');
      const count = block.querySelector('[data-sheet-count]');
      if (!stage) return;

      // Visual order, front first. Independent of DOM order.
      let order = [...stage.querySelectorAll('.sheet')];
      if (!order.length) return;

      const sheets = order.slice();

      const render = () => {
        order.forEach((sheet, depth) => {
          sheet.dataset.depth = depth;
          sheet.style.zIndex = String(order.length - depth);
          sheet.style.setProperty('--tx', `${depth * STEP_X}px`);
          sheet.style.setProperty('--ty', `${depth * STEP_Y}px`);
          sheet.style.setProperty('--tx-open', `${depth * STEP_X * OPEN}px`);
          sheet.style.setProperty('--ty-open', `${depth * STEP_Y * OPEN}px`);

          sheet.setAttribute('aria-label', `${sheet.dataset.sheetLabel || ''}, open full size`);
        });

        if (!peeked) describe(order[0]);
      };

      const describe = sheet => {
        if (caption) caption.textContent = sheet.dataset.sheetLabel || '';
        if (count) count.textContent = `${sheets.indexOf(sheet) + 1} / ${sheets.length}`;
      };

      /* Hovering any sheet floats it clear of the pile so you can see
         what you're about to open, without disturbing the stack order. */
      let peeked = null;

      const peek = sheet => {
        if (peeked === sheet) return;
        if (peeked) unpeek();
        peeked = sheet;
        sheet.classList.add('is-peek');
        sheet.style.zIndex = String(order.length + 10);
        describe(sheet);
      };

      const unpeek = () => {
        if (!peeked) return;
        peeked.classList.remove('is-peek');
        peeked.style.zIndex = String(order.length - Number(peeked.dataset.depth || 0));
        peeked = null;
      };

      order.forEach(sheet => {
        sheet.addEventListener('pointerenter', () => peek(sheet));
        sheet.addEventListener('focus', () => peek(sheet));
        sheet.addEventListener('blur', () => { unpeek(); describe(order[0]); });
      });

      stage.addEventListener('pointerleave', () => { unpeek(); describe(order[0]); });

      stage.addEventListener('click', event => {
        const sheet = event.target.closest('.sheet');
        if (!sheet || !order.includes(sheet)) return;
        lightbox.open(sheets, sheets.indexOf(sheet));
      });

      render();
    });
  };

  /* Full-size viewer with wheel zoom and drag-to-pan. Built once,
     lazily, so no page has to carry the markup. */
  const createLightbox = () => {
    let root, frame, img, captionEl, metaEl, prevBtn, nextBtn;
    let items = [];
    let index = 0;
    const view = { scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0 };

    const build = () => {
      root = document.createElement('div');
      root.className = 'lightbox';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Full size drawing');
      root.innerHTML = `
        <div class="lightbox-scrim" data-close></div>
        <div class="lightbox-stage">
          <div class="lightbox-frame"><img class="lightbox-img" alt=""></div>
          <div class="lightbox-bar">
            <div>
              <div class="lightbox-caption"></div>
              <div class="lightbox-meta">Scroll to zoom &middot; drag to pan &middot; double-click to reset</div>
            </div>
            <div class="lightbox-controls">
              <button class="lightbox-btn" data-prev aria-label="Previous drawing">&lsaquo;</button>
              <button class="lightbox-btn" data-next aria-label="Next drawing">&rsaquo;</button>
              <button class="lightbox-btn" data-close aria-label="Close">&times;</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(root);

      frame = root.querySelector('.lightbox-frame');
      img = root.querySelector('.lightbox-img');
      captionEl = root.querySelector('.lightbox-caption');
      metaEl = root.querySelector('.lightbox-meta');
      prevBtn = root.querySelector('[data-prev]');
      nextBtn = root.querySelector('[data-next]');

      root.addEventListener('click', event => {
        if (event.target.closest('[data-close]')) close();
      });
      prevBtn.addEventListener('click', () => show(index - 1));
      nextBtn.addEventListener('click', () => show(index + 1));

      document.addEventListener('keydown', event => {
        if (!root.classList.contains('is-open')) return;
        if (event.key === 'Escape') close();
        if (event.key === 'ArrowLeft') show(index - 1);
        if (event.key === 'ArrowRight') show(index + 1);
      });

      bindPanZoom();
    };

    const resetView = () => {
      view.scale = 1;
      view.x = 0;
      view.y = 0;
      img.style.transform = '';
      frame.classList.remove('is-zoomed');
    };

    const clamp = () => {
      const rect = frame.getBoundingClientRect();
      const w = img.offsetWidth * view.scale;
      const h = img.offsetHeight * view.scale;
      view.x = Math.min(0, Math.max(rect.width - w, view.x));
      view.y = Math.min(0, Math.max(rect.height - h, view.y));
      if (view.scale === 1) { view.x = 0; view.y = 0; }
    };

    const paint = () => {
      img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      frame.classList.toggle('is-zoomed', view.scale > 1);
    };

    const bindPanZoom = () => {
      frame.addEventListener('wheel', event => {
        event.preventDefault();
        const rect = frame.getBoundingClientRect();
        const prev = view.scale;
        const next = Math.min(6, Math.max(1, prev * Math.exp(-event.deltaY * 0.0012)));
        if (next === prev) return;

        const localX = event.clientX - rect.left;
        const localY = event.clientY - rect.top;
        const ratio = next / prev;
        view.x = localX - (localX - view.x) * ratio;
        view.y = localY - (localY - view.y) * ratio;
        view.scale = next;
        clamp();
        paint();
      }, { passive: false });

      frame.addEventListener('pointerdown', event => {
        if (view.scale === 1) return;
        event.preventDefault();
        view.dragging = true;
        view.lastX = event.clientX;
        view.lastY = event.clientY;
        frame.classList.add('is-dragging');
        frame.setPointerCapture(event.pointerId);
      });

      frame.addEventListener('pointermove', event => {
        if (!view.dragging) return;
        view.x += event.clientX - view.lastX;
        view.y += event.clientY - view.lastY;
        view.lastX = event.clientX;
        view.lastY = event.clientY;
        clamp();
        paint();
      });

      const endDrag = event => {
        view.dragging = false;
        frame.classList.remove('is-dragging');
        if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
      };
      frame.addEventListener('pointerup', endDrag);
      frame.addEventListener('pointercancel', endDrag);
      frame.addEventListener('dblclick', () => { resetView(); });
    };

    const show = next => {
      if (!items.length) return;
      index = (next + items.length) % items.length;

      const sheet = items[index];
      const source = sheet.querySelector('img');
      img.src = source ? source.currentSrc || source.src : '';
      img.alt = sheet.dataset.sheetLabel || '';
      captionEl.textContent = sheet.dataset.sheetLabel || '';
      metaEl.textContent = items.length > 1
        ? `${index + 1} of ${items.length} · scroll to zoom · drag to pan`
        : 'Scroll to zoom · drag to pan';

      const single = items.length < 2;
      prevBtn.disabled = single;
      nextBtn.disabled = single;
      resetView();
    };

    const close = () => {
      root.classList.remove('is-open');
      document.body.style.overflow = '';
      resetView();
    };

    return {
      open(sheetList, startIndex) {
        if (!root) build();
        items = sheetList;
        show(startIndex);
        root.classList.add('is-open');
        document.body.style.overflow = 'hidden';
      }
    };
  };

  const start = () => {
    initTheme();
    initReveals();
    initNav();
    initSideTabs();
    initViewers();
    initSheetStacks();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
