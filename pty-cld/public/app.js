// @ts-check

const terminals = new Map(); // name -> { term, fitAddon, container }
let activeSession = null;
let ws = null;

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => {
    document.getElementById("status").textContent = "Connected";
    loadIdentities();
  };

  ws.onclose = () => {
    document.getElementById("status").textContent = "Disconnected — reconnecting...";
    setTimeout(connect, 2000);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case "data":
        terminals.get(msg.session)?.term.write(msg.payload);
        break;
      case "sessions":
        updateTabs(msg.payload);
        break;
      case "notification":
        showNotification(msg.session, msg.payload);
        break;
    }
  };
}

async function loadIdentities() {
  try {
    const res = await fetch("/api/identities");
    const identities = await res.json();
    const container = document.getElementById("identities");
    container.innerHTML = "";
    for (const id of identities) {
      const card = document.createElement("div");
      card.className = "identity-card";
      card.innerHTML = `
        <div class="name">${id.name}</div>
        <div class="location">${id.location || "no location"}</div>
      `;
      card.onclick = () => launchSession(id.name, id.location);
      container.appendChild(card);
    }
  } catch (err) {
    console.error("Failed to load identities:", err);
  }
}

async function launchSession(name, location) {
  // Use location as-is (emcom provides absolute or project-relative paths)
  const workingDir = location;

  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, workingDir }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to launch");
    }
  } catch (err) {
    alert("Failed to launch session");
  }
}

function updateTabs(sessionList) {
  const tabsEl = document.getElementById("tabs");

  // Add new sessions
  for (const s of sessionList) {
    if (!terminals.has(s.name)) {
      createTerminal(s.name);
    }
  }

  // Remove dead sessions
  for (const [name] of terminals) {
    if (!sessionList.find((s) => s.name === name)) {
      removeTerminal(name);
    }
  }

  // Rebuild tabs
  tabsEl.innerHTML = "";
  for (const s of sessionList) {
    const tab = document.createElement("div");
    tab.className = `tab ${s.name === activeSession ? "active" : ""}`;
    tab.innerHTML = `${s.name}<span class="badge" id="badge-${s.name}"></span>`;
    tab.onclick = () => switchTo(s.name);
    tabsEl.appendChild(tab);
  }

  // Auto-select first if none active
  if (!activeSession && sessionList.length > 0) {
    switchTo(sessionList[0].name);
  }
}

function createTerminal(name) {
  const container = document.createElement("div");
  container.className = "terminal-container";
  container.id = `term-${name}`;
  document.getElementById("terminals").appendChild(container);

  const term = new window.Terminal({
    theme: {
      background: "#1a1a2e",
      foreground: "#e0e0e0",
      cursor: "#e94560",
    },
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
    fontSize: 14,
  });

  const fitAddon = new window.FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new window.WebLinksAddon.WebLinksAddon());
  term.open(container);
  fitAddon.fit();

  term.onData((data) => {
    ws?.send(JSON.stringify({ type: "input", session: name, payload: data }));
  });

  term.onResize(({ cols, rows }) => {
    ws?.send(JSON.stringify({ type: "resize", session: name, payload: { cols, rows } }));
  });

  terminals.set(name, { term, fitAddon, container });
}

function removeTerminal(name) {
  const entry = terminals.get(name);
  if (entry) {
    entry.term.dispose();
    entry.container.remove();
    terminals.delete(name);
  }
  if (activeSession === name) {
    activeSession = null;
    const first = terminals.keys().next().value;
    if (first) switchTo(first);
  }
}

function switchTo(name) {
  activeSession = name;
  for (const [n, { container, fitAddon }] of terminals) {
    container.classList.toggle("active", n === name);
    if (n === name) {
      fitAddon.fit();
    }
  }
  // Update tab styles
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.textContent.startsWith(name));
  });
  // Clear badge
  const badge = document.getElementById(`badge-${name}`);
  if (badge) {
    badge.classList.remove("show");
    badge.textContent = "";
  }
}

function showNotification(session, payload) {
  if (session === activeSession) return;
  const badge = document.getElementById(`badge-${session}`);
  if (badge) {
    badge.textContent = String(payload.count);
    badge.classList.add("show");
  }
}

// Handle window resize
window.addEventListener("resize", () => {
  if (activeSession) {
    terminals.get(activeSession)?.fitAddon.fit();
  }
});

connect();
