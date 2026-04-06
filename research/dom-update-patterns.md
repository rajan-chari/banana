# DOM Update Patterns for Real-Time Dashboards (Without Frameworks)

**Researched:** 2026-04-04
**Requested by:** Rajan
**Context:** pty-win vanilla JS dashboard flickers on full innerHTML rebuild every WebSocket update (9+ session cards, stats table, 5-second refresh cycle).

---

## Table of Contents

1. [DOM Diffing Without Frameworks](#1-dom-diffing-without-frameworks)
2. [Partial Patch Patterns](#2-partial-patch-patterns)
3. [How Real-Time Dashboards Handle This](#3-how-real-time-dashboards-handle-this)
4. [Recommendation for pty-win](#4-recommendation-for-pty-win)

---

## 1. DOM Diffing Without Frameworks

Six libraries were evaluated. All operate on **real DOM nodes** (no virtual DOM abstraction), accept an HTML string or DOM tree as input, and produce the minimum set of mutations to transform the existing DOM into the target.

### 1.1 morphdom

**The original.** Created by Patrick Steele-Idem (eBay/Marko team). The most widely adopted real-DOM diffing library.

| Attribute | Value |
|-----------|-------|
| **Size** | ~4 KB min+gzip (UMD build ~15 KB uncompressed) |
| **API** | `morphdom(fromNode, toNode, options)` |
| **Matching** | ID-based sibling matching |
| **Browser support** | IE9+ and all modern browsers |
| **Stars** | ~3,500 |
| **Maintained** | Yes, 384 commits, though update cadence has slowed |
| **Used by** | Phoenix LiveView, htmx (originally), Marko, CableReady, Omi.js |

**API example:**
```javascript
import morphdom from 'morphdom';

// From DOM node to HTML string
morphdom(document.getElementById('dashboard'), '<div id="dashboard">...new HTML...</div>');

// With options
morphdom(existingEl, newEl, {
  getNodeKey: (node) => node.id,                    // custom key function
  onBeforeElUpdated: (fromEl, toEl) => {
    // Return false to skip this element's update
    if (fromEl.dataset.ignore) return false;
    return true;
  },
  onBeforeNodeDiscarded: (node) => {
    // Return false to prevent removal
    return true;
  },
  childrenOnly: true  // only morph children, not the root
});
```

**Available hooks:** `getNodeKey`, `onBeforeNodeAdded`, `onNodeAdded`, `onBeforeElUpdated`, `onElUpdated`, `onBeforeNodeDiscarded`, `onNodeDiscarded`, `onBeforeElChildrenUpdated`, `skipFromChildren`, `addChild`, `childrenOnly`.

**Benchmarks (from morphdom repo, MacBook Pro 2.3 GHz i5):**
- morphdom total: 820ms
- virtual-dom total: 334ms
- nanomorph total: 3,178ms

Morphdom excels at small, incremental changes (0.01-0.60ms per op). Virtual DOM wins on large wholesale transformations.

**Source:** [github.com/patrick-steele-idem/morphdom](https://github.com/patrick-steele-idem/morphdom)

---

### 1.2 idiomorph

**The smart matcher.** Created by Carson Gross (htmx creator). Used by htmx and Turbo 8. The key innovation is **ID set matching** -- before diffing, it pre-scans both trees and maps each element to the set of all IDs found within its descendants.

| Attribute | Value |
|-----------|-------|
| **Size** | 3.3 KB min+gzip |
| **API** | `Idiomorph.morph(existingNode, newContent, options)` |
| **Matching** | ID set-based deep matching |
| **Browser support** | Modern browsers (ES6+) |
| **Stars** | ~1,100 |
| **Maintained** | Yes, actively, 338 commits |
| **Used by** | htmx, Turbo 8, Datastar |

**Why it exists:** morphdom and nanomorph only match siblings by their own `id` attribute. They do not consider the IDs of descendant nodes. This means if you have two `<div>` siblings without IDs but with differently-IDed children, morphdom cannot tell which `<div>` maps to which. Idiomorph solves this by building an ID set for each subtree, enabling much better matching of nested structures -- fewer unnecessary DOM operations, better state preservation (focus, media playback, scroll position).

**Performance:** ~10% slower than morphdom on large morphs. Equal or faster on small morphs. The tradeoff is better matching accuracy vs. raw speed.

**API example:**
```javascript
// Basic morph
Idiomorph.morph(existingNode, '<div>New Content</div>');

// Inner HTML only (morph children, leave container alone)
Idiomorph.morph(existingNode, newContent, { morphStyle: 'innerHTML' });

// With callbacks
Idiomorph.morph(existingNode, newContent, {
  ignoreActive: true,          // don't morph focused element
  ignoreActiveValue: true,     // don't morph value of focused input
  restoreFocus: true,          // restore focus after morph
  callbacks: {
    beforeNodeAdded: (node) => { /* return false to skip */ },
    beforeNodeMorphed: (oldNode, newNode) => { /* ... */ },
    beforeNodeRemoved: (node) => { /* ... */ },
    beforeAttributeUpdated: (attr, el) => { /* ... */ }
  }
});
```

**Why Turbo switched from morphdom:** Basecamp found idiomorph "way more suitable" -- it "just worked great with all the tests they threw at it" while morphdom was "incredibly picky about ids to match nodes."

**Source:** [github.com/bigskysoftware/idiomorph](https://github.com/bigskysoftware/idiomorph)

---

### 1.3 nanomorph

**The minimalist.** From the choo/yo-yo ecosystem. API-compatible with morphdom but stripped of all hooks for simplicity.

| Attribute | Value |
|-----------|-------|
| **Size** | ~1 KB min+gzip (**unverified** -- README says "hyper fast" but does not state exact size) |
| **API** | `nanomorph(oldTree, newTree)` |
| **Matching** | ID-based sibling matching (same as morphdom) |
| **Browser support** | Modern browsers only (no IE) |
| **Stars** | 748 |
| **Maintained** | Last release v5.4.3 (March 2021) -- **effectively unmaintained** |

**Key differences from morphdom:**
- Copies event handlers (e.g., `onclick`) automatically
- No hooks/callbacks at all -- you get predictable behavior but no customization
- Drops legacy browser support

**API example:**
```javascript
var morph = require('nanomorph');
var html = require('nanohtml');

var tree = html`<div>hello people</div>`;
document.body.appendChild(tree);

// Morph in place (mutates oldTree)
morph(tree, html`<div>updated content</div>`);
```

**List optimization:** Add `id` attributes to DOM nodes for efficient reordering. Use `data-nanomorph-component-id` to control when nodes are replaced vs. morphed.

**Benchmark:** 3,178ms total in morphdom's benchmark suite (3.9x slower than morphdom). Not competitive for large updates.

**Verdict:** Not recommended for new projects. Unmaintained, slow on benchmarks, no customization hooks.

**Source:** [github.com/choojs/nanomorph](https://github.com/choojs/nanomorph)

---

### 1.4 set-dom

**The tiny one.** Focused on minimal size and a dead-simple API.

| Attribute | Value |
|-----------|-------|
| **Size** | ~800 bytes min+gzip |
| **API** | `setDOM(existingElement, newHTML)` |
| **Matching** | `data-key` or `id` attribute |
| **Browser support** | Modern browsers |
| **Stars** | Low (niche) |
| **Maintained** | 118 commits, slow cadence |

**Unique features:**
- `data-checksum` attribute: skip diffing an entire subtree if checksum unchanged (great for static sections)
- `data-ignore` attribute: completely escape diffing for manually-managed DOM sections
- Custom `mount`/`dismount` events for keyed elements

**API example:**
```javascript
const setDOM = require('set-dom');

// Update an element
setDOM(myElement, '<div data-key="card-1">Updated card</div>');

// Update entire document
setDOM(document, newDocumentHTML);
```

**Verdict:** Interesting for its `data-checksum` optimization but limited ecosystem and adoption. The 800-byte size is appealing if you need absolute minimum overhead.

**Source:** [github.com/DylanPiercey/set-dom](https://github.com/DylanPiercey/set-dom)

---

### 1.5 diffhtml

**The framework-lite.** More ambitious than the others -- includes an HTML parser, virtual DOM, middleware system, and Web Components support.

| Attribute | Value |
|-----------|-------|
| **Size** | ~14 KB min+gzip (standard), smaller with "lite" build (no parser) |
| **API** | React-like: `innerHTML`, `outerHTML`, tagged templates |
| **Matching** | Virtual DOM diffing with object pooling |
| **Browser support** | Modern browsers |
| **Stars** | 872 |
| **Maintained** | 1,072 commits, still in beta (v1.0.0-beta.30) |

**Key features:**
- Memory-efficient VDOM with object pooling
- Middleware system for extending (logging, linting, synthetic events, PWA)
- Babel plugin for compile-time template optimization
- Web Components integration

**Verdict:** Overkill for the pty-win use case. It is closer to a lightweight React replacement than a DOM patching utility. The perpetual beta status and 14 KB size make it a poor fit for "just patch my table."

**Source:** [github.com/tbranyen/diffhtml](https://github.com/tbranyen/diffhtml), [diffhtml.org](https://diffhtml.org/)

---

### 1.6 morphlex

**The newest contender.** Inspired by idiomorph, written in TypeScript, with an emphasis on doing even less work than idiomorph.

| Attribute | Value |
|-----------|-------|
| **Size** | Small (exact size **unverified** -- not yet on Bundlephobia at time of research) |
| **API** | Similar to idiomorph |
| **Matching** | ID set-based (like idiomorph) with optimized traversal |
| **Maintained** | Early stage, low adoption |

**Key claim:** "Morphlex typically ends up doing significantly less work than other DOM morphing libraries in real world scenarios due to its design, so it's very fast."

**Verdict:** Too early to recommend. Low adoption, unproven in production. Worth watching.

**Source:** [joel.drapper.me/p/morphlex/](https://joel.drapper.me/p/morphlex/), [github.com/yippee-fun/morphlex](https://github.com/yippee-fun/morphlex)

---

### 1.7 Comparison Matrix

| Library | Size (min+gz) | Speed | Matching | Hooks | Maintained | Best For |
|---------|--------------|-------|----------|-------|------------|----------|
| **morphdom** | ~4 KB | Fast | ID siblings | Rich | Yes (slow) | Battle-tested, customizable |
| **idiomorph** | 3.3 KB | Fast-ish | ID sets (deep) | Yes | Active | Complex nested structures, htmx/Turbo |
| **nanomorph** | ~1 KB | Slow | ID siblings | None | No | Legacy choo apps only |
| **set-dom** | ~800 B | Unknown | key/id | Limited | Slow | Absolute minimum size |
| **diffhtml** | ~14 KB | Unknown | VDOM | Middleware | Beta | Near-framework needs |
| **morphlex** | Small | Fast (claimed) | ID sets | TBD | Early | Watching only |

### 1.8 Best for Table/Card Grid

**For the pty-win case (table + card grid from JSON):** morphdom or idiomorph.

- **morphdom** if you want the most battle-tested option with rich hooks for controlling updates.
- **idiomorph** if you want better automatic matching (especially if cards can reorder) and slightly newer maintenance.

Both handle the pattern of "re-render HTML from data, morph it into the existing DOM" with near-zero flicker.

---

## 2. Partial Patch Patterns

Instead of using a diffing library, you can surgically update only the DOM elements that changed. This is often **faster** than morphdom/idiomorph for small, structured updates because there is zero parsing or tree-walking overhead.

### 2.1 Data Attribute Keying

Use `data-session-id` (or similar) to create a stable mapping between your data model and DOM elements:

```html
<div class="session-card" data-session-id="abc123">
  <span class="status">running</span>
  <span class="cost">$0.42</span>
  <span class="duration">12m</span>
</div>
```

```javascript
function updateSessionCard(session) {
  const card = document.querySelector(`[data-session-id="${session.id}"]`);
  if (!card) return; // card doesn't exist yet

  // Only touch elements whose values changed
  const statusEl = card.querySelector('.status');
  if (statusEl.textContent !== session.status) {
    statusEl.textContent = session.status;
  }

  const costEl = card.querySelector('.cost');
  const costText = `$${session.cost.toFixed(2)}`;
  if (costEl.textContent !== costText) {
    costEl.textContent = costText;
  }

  const durationEl = card.querySelector('.duration');
  if (durationEl.textContent !== session.duration) {
    durationEl.textContent = session.duration;
  }
}
```

### 2.2 JSON State Diffing

Keep a copy of the previous state and compare incoming data to determine what changed:

```javascript
let previousSessions = new Map();

function applySessionUpdates(newSessions) {
  const newMap = new Map(newSessions.map(s => [s.id, s]));
  const currentIds = new Set(newMap.keys());
  const previousIds = new Set(previousSessions.keys());

  // 1. Removed sessions
  for (const id of previousIds) {
    if (!currentIds.has(id)) {
      removeSessionCard(id);
    }
  }

  // 2. Added sessions
  for (const id of currentIds) {
    if (!previousIds.has(id)) {
      addSessionCard(newMap.get(id));
    }
  }

  // 3. Updated sessions (only changed fields)
  for (const id of currentIds) {
    if (previousIds.has(id)) {
      const oldSession = previousSessions.get(id);
      const newSession = newMap.get(id);
      if (!shallowEqual(oldSession, newSession)) {
        updateSessionCard(newSession);
      }
    }
  }

  previousSessions = newMap;
}

function shallowEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
```

### 2.3 Key-Based Reconciliation (Manual React Keys)

The same idea as React's `key` prop, implemented manually. Each DOM element gets a stable identity:

```javascript
function reconcileChildren(container, newItems, keyFn, renderFn) {
  const existingByKey = new Map();
  for (const child of container.children) {
    existingByKey.set(child.dataset.key, child);
  }

  const fragment = document.createDocumentFragment();
  const newKeys = new Set();

  for (const item of newItems) {
    const key = keyFn(item);
    newKeys.add(key);

    let el = existingByKey.get(key);
    if (el) {
      // Update existing element in place
      updateElement(el, item);
    } else {
      // Create new element
      el = renderFn(item);
      el.dataset.key = key;
    }
    fragment.appendChild(el);
  }

  // Remove elements that no longer exist
  for (const [key, el] of existingByKey) {
    if (!newKeys.has(key)) {
      el.remove();
    }
  }

  container.appendChild(fragment);
}
```

### 2.4 DocumentFragment for Batch Insertion

When adding multiple new elements, stage them off-DOM in a DocumentFragment:

```javascript
function addMultipleCards(sessions) {
  const fragment = document.createDocumentFragment();
  for (const session of sessions) {
    const card = createCardElement(session);
    fragment.appendChild(card);
  }
  // Single DOM insertion -- one reflow instead of N
  document.getElementById('grid').appendChild(fragment);
}
```

**Source:** [dev.to/alex_aslam/optimizing-dom-updates-in-javascript-for-better-performance-90k](https://dev.to/alex_aslam/optimizing-dom-updates-in-javascript-for-better-performance-90k)

### 2.5 JSON Patch (RFC 6902) for WebSocket State Sync

Instead of sending full state on every WebSocket message, send only the delta as a JSON Patch:

```javascript
// Server sends patches like:
// [
//   { "op": "replace", "path": "/sessions/0/status", "value": "idle" },
//   { "op": "replace", "path": "/sessions/0/cost", "value": 0.58 },
//   { "op": "add", "path": "/sessions/3", "value": { "id": "new1", ... } }
// ]

// Client applies patches to local state, then updates only affected DOM
ws.onmessage = (event) => {
  const patches = JSON.parse(event.data);
  for (const patch of patches) {
    applyPatch(state, patch);          // update local state object
    applyDomPatch(patch);              // update only affected DOM elements
  }
};
```

This approach reduces both network bandwidth and DOM update scope. Libraries like `fast-json-patch` (npm) implement RFC 6902 for JavaScript.

**Source:** [cetra3.github.io/blog/synchronising-with-websocket/](https://cetra3.github.io/blog/synchronising-with-websocket/)

### 2.6 When Direct DOM Manipulation Beats Virtual DOM

The "virtual DOM is overhead" argument is valid in specific scenarios:

1. **Few, known update points** -- If you know exactly which 3 fields changed, `textContent = x` is faster than diffing a tree.
2. **Small DOM surface** -- With 9 cards and a stats table (~50-100 elements), the DOM is tiny. Tree diffing overhead is measurable relative to the update cost.
3. **No structural changes** -- If cards don't reorder or appear/disappear often, you're paying diffing cost for nothing.
4. **High frequency updates** -- At sub-second intervals, every microsecond of overhead multiplies.

**The crossover point:** Morphdom/idiomorph become worthwhile when (a) the template is complex enough that manual patching is error-prone, or (b) structural changes (add/remove/reorder) happen frequently. For a fixed-structure dashboard with known update points, manual patching is simpler and faster.

---

## 3. How Real-Time Dashboards Handle This

### 3.1 Grafana

**Stack:** Go backend, TypeScript + React frontend, Scenes library for dashboard rendering.

**How it works:**
- Dashboard JSON is the source of truth
- JSON is transformed into a `dashboardScene` object -- a tree where nodes represent visualizations, data, variables, and time ranges
- The Scenes library renders the tree and handles all update logic
- For real-time streaming: **Grafana Live** pushes data over persistent WebSocket connections (pub/sub model) -- the frontend subscribes to channels and receives data frames as they publish
- Grafana 12 added conditional rendering (show/hide panels based on variables or data presence) to reduce unnecessary rendering

**Key lesson for pty-win:** Grafana uses React + a scene graph abstraction. The relevant pattern is the pub/sub WebSocket model and the principle of only rendering what is visible.

**Source:** [grafana.com/blog/2024/10/31/grafana-dashboards-are-now-powered-by-scenes/](https://grafana.com/blog/2024/10/31/grafana-dashboards-are-now-powered-by-scenes/), [grafana.com/docs/grafana/latest/setup-grafana/set-up-grafana-live/](https://grafana.com/docs/grafana/latest/setup-grafana/set-up-grafana-live/)

### 3.2 Datadog

**Stack:** React frontend with custom RUM components.

**How it works:**
- Uses React with their own `customVital` API for component-level performance measurement
- Real-time dashboards use standard React reconciliation with memoization
- No public documentation on their specific DOM update strategy, but they ship custom React components for granular data capture

**Key lesson for pty-win:** Not directly applicable (React-based), but the principle of measuring component render time is useful for identifying which card/table update is costly.

**Source:** [datadoghq.com/blog/datadog-rum-react-components/](https://www.datadoghq.com/blog/datadog-rum-react-components/)

### 3.3 ag-Grid (JavaScript Data Grid)

**The gold standard for high-frequency table updates.** Processes 150,000+ updates/second.

**Techniques used:**
1. **DOM virtualization:** Only rows visible in the viewport exist in the DOM. Rows are created/destroyed on scroll (default: 10-row buffer above and below viewport).
2. **Dirty checking:** Each cell stores its current value and compares to the new value. DOM is only touched if the value actually changed.
3. **Async transactions:** For high-frequency streaming, updates are batched into async transaction queues. The grid applies them in batches on the next animation frame rather than one-at-a-time.
4. **Change detection, not re-rendering:** The grid never re-renders the whole table. It walks the data model, finds changed cells, and updates only those cells.

**Key lesson for pty-win:** The dirty-checking pattern (store previous value, compare, update only if different) is exactly the right approach for a stats table. The DOM virtualization is overkill for 9 sessions but the principle of "only touch what changed" is essential.

**Source:** [blog.ag-grid.com/streaming-updates-in-javascript-datagrids/](https://blog.ag-grid.com/streaming-updates-in-javascript-datagrids/), [ag-grid.com/javascript-data-grid/dom-virtualisation/](https://ag-grid.com/javascript-data-grid/dom-virtualisation/)

### 3.4 Terminal UIs (blessed, Ink, FrankenTUI)

**blessed:** Uses the painter's algorithm with a **screen damage buffer**. Only redraws regions that changed. This is the terminal equivalent of dirty-rectangle rendering.

**Ink (React for CLIs):** Originally did full-tree traversal and complete screen redraws on every state change, causing visible flicker (especially in tmux). The root cause: `ansiEscapes.eraseLines(previousLineCount) + output` -- erases all lines then rewrites everything. Ink later added an **incremental rendering mode** that only updates changed lines.

**FrankenTUI:** Propagates deltas through a DAG of view operators. Only dirty nodes are recomputed -- layouts, styled text, and visibility flags are not recalculated from scratch every frame.

**Key lesson for pty-win:** The Ink flickering problem is **exactly** the same as pty-win's innerHTML problem -- rebuilding everything causes visible flicker. The fix (in both cases) is differential/dirty-region updates.

**Source:** [github.com/atxtechbro/test-ink-flickering/blob/main/INK-ANALYSIS.md](https://github.com/atxtechbro/test-ink-flickering/blob/main/INK-ANALYSIS.md), [github.com/Dicklesworthstone/frankentui](https://github.com/Dicklesworthstone/frankentui)

### 3.5 requestAnimationFrame Batching

Synchronize all DOM writes with the browser's paint cycle:

```javascript
let updatePending = false;
let latestData = null;

function scheduleUpdate(data) {
  latestData = data;
  if (!updatePending) {
    updatePending = true;
    requestAnimationFrame(() => {
      applyUpdate(latestData);
      updatePending = false;
    });
  }
}

// WebSocket handler -- may fire many times between frames
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  scheduleUpdate(data);  // coalesces multiple messages into one paint
};
```

**Why this matters:** If WebSocket messages arrive faster than 60fps (16.7ms), multiple updates get coalesced into a single DOM write. The browser never sees intermediate states. Even at pty-win's 5-second interval this is good hygiene -- it ensures the update happens right before paint, not at an arbitrary point in the frame.

**Source:** [developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

### 3.6 Read/Write Batching (Avoid Layout Thrashing)

Interleaving DOM reads and writes forces the browser to recalculate layout repeatedly:

```javascript
// BAD -- layout thrashing (read, write, read, write...)
elements.forEach(el => {
  const height = el.offsetHeight;        // read -> forces layout
  el.style.height = height + 10 + 'px';  // write -> invalidates layout
});

// GOOD -- batch all reads, then all writes
const heights = elements.map(el => el.offsetHeight);  // all reads
elements.forEach((el, i) => {
  el.style.height = heights[i] + 10 + 'px';           // all writes
});
```

**Source:** [dev.to/alex_aslam/optimizing-dom-updates-in-javascript-for-better-performance-90k](https://dev.to/alex_aslam/optimizing-dom-updates-in-javascript-for-better-performance-90k)

### 3.7 CSS Containment (`contain: content`)

Tell the browser that an element's internals don't affect anything outside it:

```css
.session-card {
  contain: content;  /* equivalent to: contain: layout paint */
}
```

**What this does:**
- **Layout containment:** Changes inside the card don't trigger layout recalculation on siblings or parents
- **Paint containment:** The card's paint is isolated -- repainting the card doesn't repaint neighbors
- The browser can skip work: if a card is offscreen, it skips painting entirely

**For pty-win:** Apply `contain: content` to each session card and to the stats table. This limits the blast radius of any DOM update to just the affected card.

**Source:** [developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Using](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Using)

### 3.8 `content-visibility: auto`

Skip rendering entirely for offscreen elements:

```css
.session-card {
  content-visibility: auto;
  contain-intrinsic-size: 0 200px;  /* estimated height when not rendered */
}
```

**Performance impact:** Up to 7x rendering performance improvement on initial load (per web.dev benchmarks). The browser skips style, layout, and paint for elements outside the viewport.

**For pty-win:** Less useful since 9 cards likely all fit on screen. But if the dashboard ever scrolls (more sessions, expanded details), this is free performance.

**Baseline browser support:** All major browsers as of September 2025.

**Source:** [web.dev/articles/content-visibility](https://web.dev/articles/content-visibility)

### 3.9 `will-change` and Compositor Layers

```css
.session-card {
  will-change: contents;
}
```

**Caution:** `will-change` promotes the element to its own compositor layer, consuming GPU memory. For a simple text dashboard this is overkill and can actually hurt performance. Reserve it for elements with CSS animations/transitions. **Not recommended for pty-win's card grid.**

### 3.10 Double-Buffering Pattern for DOM

Build the new state offscreen, then swap it in:

```javascript
function doubleBufferUpdate(containerId, renderFn, data) {
  const container = document.getElementById(containerId);

  // Create offscreen clone
  const buffer = container.cloneNode(false);  // shallow clone (same tag + attributes)
  buffer.style.display = 'none';
  buffer.innerHTML = renderFn(data);

  // Swap: replace container's children with buffer's children
  // Using morphdom on the offscreen buffer avoids any visible intermediate state
  morphdom(container, buffer, { childrenOnly: true });
}
```

**Alternative without morphdom** -- hide during update:

```javascript
container.style.display = 'none';
container.innerHTML = renderFn(data);
container.style.display = '';
// Browser batches the hide+update+show into one paint
```

**Source:** [j11y.io/snippets/avoiding-dom-flickering/](https://j11y.io/snippets/avoiding-dom-flickering/)

### 3.11 Throttling/Debouncing Update Frequency

Even if data arrives every 100ms, the user cannot perceive changes faster than ~200ms. Throttle updates:

```javascript
function throttle(fn, ms) {
  let last = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn.apply(this, args);
      }, ms - (now - last));
    }
  };
}

const throttledUpdate = throttle(applyDashboardUpdate, 1000);

ws.onmessage = (event) => {
  throttledUpdate(JSON.parse(event.data));
};
```

At pty-win's 5-second interval, throttling is not necessary. But if the interval ever decreases, this pattern prevents wasted work.

---

## 4. Recommendation for pty-win

### Context Recap

- Vanilla JS, no build step
- Session cards in a CSS grid (9+ sessions)
- Stats/costs table
- WebSocket refresh every 5 seconds
- Current approach: full `innerHTML` rebuild causes visible flicker

### 4.1 Recommended Approach: Manual Partial Patching

**For pty-win's specific case, manual patching is the best fit.** Here is why:

1. **Small, known DOM surface** -- 9 cards + 1 table = ~100 elements. Not enough to justify a diffing library's overhead.
2. **Structured data** -- Each card maps 1:1 to a session object with known fields. You always know exactly what might change.
3. **No build step** -- morphdom/idiomorph require either a `<script>` tag for a CDN copy or npm + bundler. Manual patching requires zero dependencies.
4. **Stable structure** -- Cards rarely appear/disappear (sessions don't start/stop every 5 seconds). Most updates are field-value changes within existing cards.

### 4.2 However: Consider idiomorph If...

- You want to keep using a single `renderDashboard()` function that produces HTML (simpler mental model)
- Cards frequently appear/disappear/reorder
- The dashboard grows more complex over time

Idiomorph is 3.3 KB, zero dependencies, and can be loaded from a CDN with a single `<script>` tag -- no build step needed:

```html
<script src="https://unpkg.com/idiomorph@0.7.4/dist/idiomorph.js"></script>
```

### 4.3 Complete Code Pattern: Manual Partial Patching

```javascript
// === State Management ===
let previousSessions = new Map();

// === WebSocket Handler ===
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  requestAnimationFrame(() => {
    updateDashboard(data.sessions);
    updateStatsTable(data.stats);
  });
};

// === Card Grid Updates ===
function updateDashboard(sessions) {
  const grid = document.getElementById('session-grid');
  const newMap = new Map(sessions.map(s => [s.id, s]));

  // Remove cards for ended sessions
  for (const [id] of previousSessions) {
    if (!newMap.has(id)) {
      const card = grid.querySelector(`[data-session-id="${id}"]`);
      if (card) {
        card.classList.add('removing');
        // Remove after CSS transition completes
        card.addEventListener('transitionend', () => card.remove(), { once: true });
        // Fallback removal if no transition
        setTimeout(() => { if (card.parentNode) card.remove(); }, 300);
      }
    }
  }

  // Add or update cards
  for (const [id, session] of newMap) {
    let card = grid.querySelector(`[data-session-id="${id}"]`);

    if (!card) {
      // New session -- create card
      card = createSessionCard(session);
      grid.appendChild(card);
    } else {
      // Existing session -- patch only changed fields
      const prev = previousSessions.get(id);
      if (prev) {
        patchSessionCard(card, prev, session);
      }
    }
  }

  previousSessions = newMap;
}

function createSessionCard(session) {
  const card = document.createElement('div');
  card.className = 'session-card';
  card.dataset.sessionId = session.id;
  card.innerHTML = `
    <div class="card-header">
      <span class="session-name">${escapeHtml(session.name)}</span>
      <span class="session-status" data-field="status">${escapeHtml(session.status)}</span>
    </div>
    <div class="card-body">
      <span data-field="cost">${formatCost(session.cost)}</span>
      <span data-field="duration">${session.duration}</span>
      <span data-field="tokens">${session.tokens}</span>
    </div>
  `;
  return card;
}

function patchSessionCard(card, oldSession, newSession) {
  // Only touch DOM for fields that actually changed
  const fields = ['status', 'cost', 'duration', 'tokens'];
  for (const field of fields) {
    if (oldSession[field] !== newSession[field]) {
      const el = card.querySelector(`[data-field="${field}"]`);
      if (el) {
        const formatted = field === 'cost' ? formatCost(newSession[field]) : newSession[field];
        el.textContent = formatted;

        // Optional: flash animation on change
        el.classList.remove('updated'); // reset
        void el.offsetWidth;           // force reflow to restart animation
        el.classList.add('updated');
      }
    }
  }

  // Update status class on card
  if (oldSession.status !== newSession.status) {
    card.className = `session-card status-${newSession.status}`;
  }
}

// === Stats Table Updates ===
function updateStatsTable(stats) {
  for (const [key, value] of Object.entries(stats)) {
    const cell = document.querySelector(`#stats-table [data-stat="${key}"]`);
    if (cell) {
      const formatted = typeof value === 'number' ? value.toLocaleString() : value;
      if (cell.textContent !== String(formatted)) {
        cell.textContent = formatted;
      }
    }
  }
}

// === Utilities ===
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatCost(cents) {
  return '$' + (cents / 100).toFixed(2);
}
```

### 4.4 CSS for Zero-Flicker Updates

```css
/* Isolate each card's layout/paint from siblings */
.session-card {
  contain: content;
  transition: opacity 0.2s ease;
}

/* Fade out removing cards */
.session-card.removing {
  opacity: 0;
  transition: opacity 0.2s ease;
}

/* Flash animation for changed values */
@keyframes flash-update {
  0% { background-color: rgba(255, 255, 0, 0.3); }
  100% { background-color: transparent; }
}

.updated {
  animation: flash-update 0.5s ease;
}
```

### 4.5 Alternative: idiomorph Drop-In

If manual patching feels like too much bookkeeping, here is the idiomorph equivalent:

```html
<script src="https://unpkg.com/idiomorph@0.7.4/dist/idiomorph.js"></script>
<script>
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  requestAnimationFrame(() => {
    const grid = document.getElementById('session-grid');
    const newHTML = renderSessionGrid(data.sessions);  // your existing render function
    Idiomorph.morph(grid, newHTML, {
      morphStyle: 'innerHTML',
      ignoreActive: true,       // don't clobber focused inputs
      callbacks: {
        beforeNodeRemoved: (node) => {
          // Animate removal
          if (node.classList?.contains('session-card')) {
            node.classList.add('removing');
            setTimeout(() => node.remove(), 200);
            return false;  // prevent immediate removal
          }
          return true;
        }
      }
    });

    const table = document.getElementById('stats-table');
    const newTableHTML = renderStatsTable(data.stats);
    Idiomorph.morph(table, newTableHTML, { morphStyle: 'innerHTML' });
  });
};
</script>
```

**Advantage:** You keep your existing `renderSessionGrid()` / `renderStatsTable()` functions that produce HTML strings. Zero refactoring of your template logic. Idiomorph handles the diffing.

**Disadvantage:** 3.3 KB dependency. Slightly more work than manual patching for simple field updates. Parses HTML strings on every update (though this is fast for small DOMs).

### 4.6 Handling Cards Appearing/Disappearing

**New sessions:**
- Manual approach: `grid.appendChild(createSessionCard(session))` -- appears instantly or with CSS `animation: fadeIn`
- Idiomorph approach: Just include the new card in the rendered HTML. Idiomorph inserts it automatically.

**Ended sessions:**
- Manual approach: Add `.removing` class, wait for transition, then `.remove()`. Use `transitionend` event with a `setTimeout` fallback.
- Idiomorph approach: Use `beforeNodeRemoved` callback to animate before allowing removal (return `false` to delay, then remove manually after animation).

**Reordered sessions** (e.g., sort by cost):
- Manual approach: Requires explicit reordering logic (`insertBefore` based on sort order). Gets complex.
- Idiomorph approach: Just render in the new order. Idiomorph matches by ID sets and moves DOM nodes. This is where idiomorph truly shines over manual patching.

### 4.7 Decision Matrix

| Factor | Manual Patching | idiomorph |
|--------|----------------|-----------|
| Dependencies | None | 3.3 KB CDN script |
| Complexity | Medium (must track fields) | Low (keep existing render functions) |
| Performance | Fastest (surgical updates) | Very fast (small overhead for parsing + diff) |
| Cards appear/disappear | Moderate effort | Automatic |
| Cards reorder | Hard | Automatic |
| Build step needed | No | No (CDN) |
| Code to maintain | More (patch logic per field) | Less (just render HTML) |

### 4.8 Final Recommendation

**Start with manual patching** (Section 4.3) because:
1. It eliminates the flicker with zero new dependencies
2. The pty-win dashboard is small and structured -- you know exactly what changes
3. It is the fastest possible approach for this use case
4. CSS `contain: content` on cards limits repaint scope

**Upgrade to idiomorph later** if:
- The dashboard grows more complex
- You add features like card reordering or drag-and-drop
- Manual field-tracking becomes a maintenance burden

Both approaches work. Manual patching is the lightest-weight, most performant option for the current scale. Idiomorph is the right upgrade path when complexity grows.

---

## Sources

### Libraries
- [morphdom - GitHub](https://github.com/patrick-steele-idem/morphdom) -- Original real-DOM diffing library
- [idiomorph - GitHub](https://github.com/bigskysoftware/idiomorph) -- ID set-based DOM morphing (htmx team)
- [nanomorph - GitHub](https://github.com/choojs/nanomorph) -- Minimalist morphdom alternative
- [set-dom - GitHub](https://github.com/DylanPiercey/set-dom) -- ~800 byte DOM diffing
- [diffhtml - GitHub](https://github.com/tbranyen/diffhtml) -- Virtual DOM + HTML parser framework
- [morphlex - Joel Drapper](https://joel.drapper.me/p/morphlex/) -- Newer ID set-based morpher

### Patterns & Techniques
- [Optimizing DOM Updates - DEV Community](https://dev.to/alex_aslam/optimizing-dom-updates-in-javascript-for-better-performance-90k) -- DocumentFragment, batching, rAF
- [requestAnimationFrame - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [CSS Containment - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Using)
- [content-visibility - web.dev](https://web.dev/articles/content-visibility) -- 7x rendering boost
- [Avoiding DOM Flickering - James Padolsey](https://j11y.io/snippets/avoiding-dom-flickering/)
- [Synchronizing State with WebSockets and JSON Patch](https://cetra3.github.io/blog/synchronising-with-websocket/)

### Dashboard Implementations
- [Grafana Scenes Architecture](https://grafana.com/blog/2024/10/31/grafana-dashboards-are-now-powered-by-scenes-big-changes-same-ui/)
- [Grafana Live (WebSocket streaming)](https://grafana.com/docs/grafana/latest/setup-grafana/set-up-grafana-live/)
- [ag-Grid Streaming Updates](https://blog.ag-grid.com/streaming-updates-in-javascript-datagrids/)
- [ag-Grid DOM Virtualisation](https://ag-grid.com/javascript-data-grid/dom-virtualisation/)
- [Datadog RUM React Components](https://www.datadoghq.com/blog/datadog-rum-react-components/)

### Terminal UIs
- [Ink Flickering Analysis](https://github.com/atxtechbro/test-ink-flickering/blob/main/INK-ANALYSIS.md)
- [FrankenTUI - diff-based terminal rendering](https://github.com/Dicklesworthstone/frankentui)

### Morphdom + WebSocket Pattern
- [Making a Static Blog Dynamic with morphdom + WebSocket](https://sdehm.dev/posts/making-a-static-blog-dynamic/)

### Benchmarks
- [morphdom Bundlephobia](https://bundlephobia.com/package/morphdom) -- size metrics
- [morphdom virtual-dom comparison](https://github.com/patrick-steele-idem/morphdom/blob/master/docs/virtual-dom.md)
