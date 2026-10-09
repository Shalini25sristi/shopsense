/* ShopSense frontend. Vanilla JS, no build step. */
const API = "/api";
const TOKEN_KEY = "shopsense_token";
const PROFILE_KEY = "shopsense_profile";
let CURRENT_USER = null;

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function isLoggedIn() { return !!CURRENT_USER; }
function getUser() { return CURRENT_USER ? CURRENT_USER.id : null; }
function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(user));
  CURRENT_USER = user;
}
function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  CURRENT_USER = null;
}
async function loadSession() {
  if (!getToken()) return;
  try {
    const res = await fetch(API + "/auth/me", { headers: { Authorization: "Bearer " + getToken() } });
    if (!res.ok) throw new Error("session expired");
    const data = await res.json();
    CURRENT_USER = data.user;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data.user));
  } catch {
    clearAuth();
  }
}

async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers);
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(API + path, { ...opts, headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

/* ---------------- wishlist state ---------------- */
const WISHLIST_IDS = new Set();

async function refreshWishlistIds() {
  WISHLIST_IDS.clear();
  if (!isLoggedIn()) return;
  try {
    const w = await api("/wishlist");
    (w.ids || []).forEach((id) => WISHLIST_IDS.add(id));
  } catch { /* ignore */ }
}

function paintHearts() {
  document.querySelectorAll(".wish-heart").forEach((b) => {
    const on = WISHLIST_IDS.has(b.dataset.wishId);
    b.classList.toggle("on", on);
    b.innerHTML = on ? "&#9829;" : "&#9825;";
    b.title = on ? "Remove from wishlist" : "Add to wishlist";
  });
}

async function toggleWishlist(productId) {
  try {
    if (WISHLIST_IDS.has(productId)) {
      await api(`/wishlist/${encodeURIComponent(productId)}`, { method: "DELETE" });
      WISHLIST_IDS.delete(productId);
    } else {
      await api("/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      WISHLIST_IDS.add(productId);
    }
    paintHearts();
    return true;
  } catch {
    return false;
  }
}

// One delegated handler covers every heart rendered anywhere on the site.
document.addEventListener("click", (e) => {
  const btn = e.target.closest && e.target.closest(".wish-heart");
  if (!btn) return;
  e.preventDefault();
  const id = btn.dataset.wishId;
  const after = () => { if (document.body.dataset.page === "wishlist") initWishlist(); };
  if (!isLoggedIn()) {
    requireAuth(async () => { await toggleWishlist(id); after(); }, "Create a profile to save items to your wishlist.");
    return;
  }
  toggleWishlist(id).then(after);
});

const money = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN");
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function colorFor(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h},55%,42%), hsl(${(h + 40) % 360},55%,30%))`;
}
const initials = (s) =>
  String(s || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/* Real product photos keyed by category (keyword image service), with a
    the actual product image from the catalogue (DummyJSON CDN). Falls back to
    the local SVG illustration only if the real image cannot be loaded. */
function productImg(p, opts = {}) {
  const lazy = opts.lazy !== false ? ' loading="lazy"' : "";
  const fallback = `/api/images/${encodeURIComponent(p.id)}.svg`;
  const src = p.image || fallback;
  return `<img src="${src}" alt="${esc(p.title)}"${lazy} onerror="this.onerror=null;this.src='${fallback}'" />`;
}

function productCard(p, opts = {}) {
  const href = opts.href || `/product?id=${encodeURIComponent(p.id)}`;
  const rank = opts.rank != null ? `<div class="rank-badge">#${opts.rank}</div>` : "";
  const ai = p.aiScore;
  // Prefer the AI spec score (0-100). Fall back to a normalised relevance
  // score, always kept within 0-100 so the badge never shows four digits.
  let score = null;
  if (ai) {
    score = `<div class="score-badge ai" title="${esc(aiTooltip(ai))}"><span class="ai-mark">AI</span>${ai.score}<span class="ai-of">/100</span></div>`;
  } else if (opts.score != null) {
    const n = opts.score <= 1 ? opts.score * 100 : opts.score;
    score = `<div class="score-badge">${Math.max(0, Math.min(100, Math.round(n)))}</div>`;
  }
  const reason = opts.reason ? `<div class="reason">${esc(opts.reason)}</div>` : "";
  const tags = (p.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const mrp = p.mrp && p.mrp > p.price ? `<s>${money(p.mrp)}</s>` : "";
  const on = WISHLIST_IDS.has(p.id);
  return `
    <div class="card-wrap">
      <a class="card" href="${href}">
        <div class="thumb" style="background:${colorFor(p.brand)}">
          ${productImg(p)}
          ${rank}${score}
        </div>
        <div class="card-body">
          <div class="brand">${esc(p.brand)}</div>
          <div class="title">${esc(p.title)}</div>
          <div class="rating">&#9733; ${p.rating} <span>(${Number(p.ratingCount).toLocaleString("en-IN")})</span></div>
          <div class="price">${money(p.price)} ${mrp}</div>
          <div class="tags">${tags}</div>
          ${reason}
        </div>
      </a>
      <button class="wish-heart ${on ? "on" : ""}" data-wish-id="${esc(p.id)}" type="button"
        aria-label="${on ? "Remove from wishlist" : "Add to wishlist"}"
        title="${on ? "Remove from wishlist" : "Add to wishlist"}">${on ? "&#9829;" : "&#9825;"}</button>
    </div>`;
}

/** Human-readable tooltip for the AI spec score, built from its breakdown. */
function aiTooltip(ai) {
  const parts = Object.values(ai.breakdown || {}).map((b) => `${b.label}: ${b.value}/${b.max}`);
  return [`AI spec score ${ai.score}/100 (grade ${ai.grade})`, ...parts].join("\n");
}

/** Larger AI spec score panel for the product detail page. */
function aiScorePanel(ai) {
  if (!ai) return "";
  const parts = Object.values(ai.breakdown || {});
  return `
    <div class="ai-panel">
      <div class="ai-panel-head">
        <div class="ai-panel-score"><span class="ai-mark">AI</span>${ai.score}<span class="ai-of">/100</span></div>
        <div class="ai-panel-meta">
          <strong>AI spec score &middot; Grade ${esc(ai.grade)}</strong>
          <span>Scored by AI from specifications, ratings, review volume and value</span>
        </div>
      </div>
      <div class="ai-panel-bars">
        ${parts
          .map(
            (b) => `<div class="ai-bar">
          <span class="ai-bar-label">${esc(b.label)}</span>
          <div class="ai-bar-track"><i style="width:${Math.round((b.value / b.max) * 100)}%"></i></div>
          <span class="ai-bar-val">${b.value}/${b.max}</span>
        </div>`
          )
          .join("")}
      </div>
    </div>`;
}

function grid(items, optsFn) {
  if (!items || !items.length) return `<div class="empty">No items.</div>`;
  return `<div class="grid">${items
    .map((it, i) => {
      const isWrapped = it.product;
      const p = isWrapped ? it.product : it;
      const o = optsFn ? optsFn(it, i) : {};
      return productCard(p, { ...o, reason: it.reason || o.reason, score: it.score != null ? it.score : o.score, rank: o.rank });
    })
    .join("")}</div>`;
}

function renderHeader(active) {
  const el = document.getElementById("header");
  if (!el) return;
  const links = [
    ["home", "/", "Home"],
    ["search", "/search", "Search"],
    ...(isLoggedIn() ? [["wishlist", "/wishlist", "Wishlist"]] : []),
    ["admin", "/admin", "Dashboard"],
  ];
  const right = isLoggedIn()
    ? `
      <div class="user-menu">
        <button class="user-btn" id="userBtn">
          <span class="avatar">${esc(initials(CURRENT_USER.name))}</span>
          <span class="user-name">${esc(CURRENT_USER.name)}</span>
          <span class="caret">&#9662;</span>
        </button>
        <div class="user-drop" id="userDrop" hidden>
          <div class="ud-head"><strong>${esc(CURRENT_USER.name)}</strong><span>${esc(CURRENT_USER.email || "")}</span></div>
          <a href="/wishlist">My wishlist</a>
          <button id="logoutBtn" type="button">Log out</button>
        </div>
      </div>`
    : `
      <div class="auth-actions">
        <button class="chip" id="loginBtn" type="button">Log in</button>
        <button class="btn-primary" id="signupBtn" type="button">Create profile</button>
      </div>`;
  el.innerHTML = `
    <div class="header-inner">
      <a class="logo" href="/"><span class="dot"></span>ShopSense</a>
      <nav class="nav">
        ${links.map(([k, href, label]) => `<a href="${href}" class="${active === k ? "active" : ""}">${label}</a>`).join("")}
      </nav>
      <div class="spacer"></div>
      ${right}
    </div>`;

  const g = (id) => document.getElementById(id);
  if (g("loginBtn")) g("loginBtn").addEventListener("click", () => openAuthModal("login"));
  if (g("signupBtn")) g("signupBtn").addEventListener("click", () => openAuthModal("signup"));
  if (g("userBtn")) {
    g("userBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      g("userDrop").hidden = !g("userDrop").hidden;
    });
    document.addEventListener("click", () => { const d = g("userDrop"); if (d) d.hidden = true; });
  }
  if (g("logoutBtn")) {
    g("logoutBtn").addEventListener("click", () => {
      clearAuth();
      location.href = "/";
    });
  }
}

/* ---------------- AUTH MODAL ---------------- */
function openAuthModal(mode = "signup", onSuccess = null, message = null) {
  closeAuthModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "authOverlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" id="authClose" type="button" aria-label="Close">&times;</button>
      <div class="tabs">
        <button class="tab ${mode === "signup" ? "active" : ""}" data-mode="signup" type="button">Create profile</button>
        <button class="tab ${mode === "login" ? "active" : ""}" data-mode="login" type="button">Log in</button>
      </div>
      ${message ? `<p class="modal-note">${esc(message)}</p>` : `<p class="modal-note">Create a profile to continue. It takes a few seconds.</p>`}
      <form id="authForm" novalidate>
        <div data-pane="signup" class="${mode === "signup" ? "" : "hidden"}">
          <label class="field"><span>Name *</span><input name="name" autocomplete="name" /></label>
          <label class="field"><span>Email *</span><input name="email" type="email" autocomplete="email" /></label>
          <div class="field-row">
            <label class="field"><span>Password *</span><input name="password" type="password" autocomplete="new-password" /></label>
            <label class="field"><span>Confirm password *</span><input name="confirm" type="password" autocomplete="new-password" /></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Contact number</span><input name="phone" autocomplete="tel" placeholder="Optional" /></label>
            <label class="field"><span>Profession</span><input name="profession" placeholder="Optional" /></label>
          </div>
        </div>
        <div data-pane="login" class="${mode === "login" ? "" : "hidden"}">
          <label class="field"><span>Email</span><input name="loginEmail" type="email" autocomplete="email" /></label>
          <label class="field"><span>Password</span><input name="loginPassword" type="password" autocomplete="current-password" /></label>
        </div>
        <div class="modal-error" id="authError" hidden></div>
        <button class="btn-primary block" type="submit" id="authSubmit">${mode === "login" ? "Log in" : "Create profile"}</button>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  let current = mode;
  const form = document.getElementById("authForm");
  const errorEl = document.getElementById("authError");
  const submit = document.getElementById("authSubmit");

  const setMode = (m) => {
    current = m;
    overlay.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === m));
    overlay.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== m));
    submit.textContent = m === "login" ? "Log in" : "Create profile";
    errorEl.hidden = true;
  };
  overlay.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
  document.getElementById("authClose").addEventListener("click", closeAuthModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAuthModal(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      let payload;
      if (current === "login") {
        if (!data.loginEmail || !data.loginPassword) throw new Error("Enter your email and password.");
        payload = await api("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: data.loginEmail.trim(), password: data.loginPassword }),
        });
      } else {
        const name = (data.name || "").trim();
        const email = (data.email || "").trim();
        const password = data.password || "";
        const confirm = data.confirm || "";
        if (!name) throw new Error("Name is required.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
        if (password !== confirm) throw new Error("Passwords do not match.");
        payload = await api("/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, phone: (data.phone || "").trim(), profession: (data.profession || "").trim() }),
        });
      }
      setAuth(payload.token, payload.user);
      await refreshWishlistIds();
      closeAuthModal();
      renderHeader(document.body.dataset.page);
      paintHearts();
      if (typeof onSuccess === "function") await onSuccess();
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong.";
      errorEl.hidden = false;
    }
  });
}

function closeAuthModal() {
  const el = document.getElementById("authOverlay");
  if (el) el.remove();
  document.body.style.overflow = "";
}

/** Run `action` if logged in, otherwise prompt to create a profile. */
function requireAuth(action, message = null) {
  if (isLoggedIn()) return action();
  openAuthModal("signup", action, message);
}

/* ---------------- HOME ---------------- */
async function initHome() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="hero">
      <h1>Find the right product, not 10,000 options.</h1>
      <form class="searchbar" id="heroSearch">
        <input id="heroInput" placeholder="Try: running shoes for flat feet" autocomplete="off" />
        <button type="submit">Search</button>
        <div class="suggestions" id="heroSug" hidden></div>
      </form>
    </div>
    <section class="section">
      <div class="section-head"><h2 id="recTitle">Popular right now</h2><span class="sub" id="recSub"></span></div>
      <div id="recGrid"></div>
    </section>
    <section class="section" id="wishSection" hidden>
      <div class="section-head"><h2>Your wishlist</h2><span class="sub"><a href="/wishlist">View all &rarr;</a></span></div>
      <div id="wishGrid"></div>
    </section>
    <section class="section" id="brandSection" hidden>
      <div class="section-head"><h2>Top brands</h2><span class="sub">Names people know and trust</span></div>
      <div id="brandChips" class="chips" style="margin-bottom:16px"></div>
      <div id="brandGrid"></div>
    </section>
    <div id="catSections"></div>
    <section class="section">
      <div class="section-head"><h2>Curated lists</h2><span class="sub">Ranked by rating, popularity & value</span></div>
      <div id="listGrid" class="grid"></div>
    </section>`;

  wireSearchBox("heroSearch", "heroInput", "heroSug");

  const recUrl = isLoggedIn()
    ? `/recommendations?userId=${encodeURIComponent(getUser())}&limit=10`
    : `/recommendations/trending?limit=10`;
  api(recUrl).then((d) => {
    document.getElementById("recTitle").textContent = isLoggedIn() ? `Recommended for you, ${CURRENT_USER.name.split(" ")[0]}` : "Popular right now";
    document.getElementById("recSub").textContent = d.strategy ? `strategy: ${d.strategy}` : "";
    document.getElementById("recGrid").innerHTML = grid(d.items, (it) => ({ reason: it.reason }));
  });

  if (isLoggedIn()) {
    api("/wishlist")
      .then((w) => {
        if (!w.items.length) return;
        document.getElementById("wishSection").hidden = false;
        document.getElementById("wishGrid").innerHTML = grid(w.items.slice(0, 5), () => ({}));
      })
      .catch(() => {});
  }

  api("/home").then((h) => {
    if (h.featured && h.featured.length) {
      document.getElementById("brandSection").hidden = false;
      document.getElementById("brandChips").innerHTML = h.featuredBrands
        .map((b) => `<a class="chip" href="/search?brand=${encodeURIComponent(b)}">${esc(b)}</a>`)
        .join("");
      document.getElementById("brandGrid").innerHTML = grid(h.featured, () => ({}));
    }
    document.getElementById("catSections").innerHTML = (h.verticals || [])
      .map(
        (v) => `
      <section class="section">
        <div class="section-head"><h2>Shop ${esc(v.vertical)}</h2><span class="sub"><a href="/search?q=${encodeURIComponent(v.vertical)}">See all ${v.count} &rarr;</a></span></div>
        ${grid(v.products, () => ({}))}
      </section>`
      )
      .join("");
  });

  api("/curated-lists").then(({ lists }) => {
    document.getElementById("listGrid").innerHTML = lists
      .slice(0, 12)
      .map(
        (l) => `<a class="card" href="/list?id=${encodeURIComponent(l.id)}">
          <div class="thumb" style="background:${colorFor(l.category)}">${initials(l.category)}</div>
          <div class="card-body"><div class="brand">${esc(l.category)}</div>
          <div class="title">${esc(l.title)}</div>
          <div class="reason">${l.count} ranked picks</div></div></a>`
      )
      .join("");
  });
}

function wireSearchBox(formId, inputId, sugId) {
  const form = document.getElementById(formId);
  const input = document.getElementById(inputId);
  const sug = document.getElementById(sugId);
  let timer = null;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (input.value.trim()) location.href = `/search?q=${encodeURIComponent(input.value.trim())}`;
  });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { sug.hidden = true; return; }
    timer = setTimeout(async () => {
      try {
        const { suggestions } = await api(`/search/suggest?q=${encodeURIComponent(q)}`);
        if (!suggestions.length) { sug.hidden = true; return; }
        sug.innerHTML = suggestions.map((s) => `<div data-w="${esc(s)}">${esc(s)}</div>`).join("");
        sug.hidden = false;
        sug.querySelectorAll("div").forEach((d) =>
          d.addEventListener("click", () => { input.value = d.dataset.w; sug.hidden = true; })
        );
      } catch { sug.hidden = true; }
    }, 160);
  });
  document.addEventListener("click", (e) => { if (!form.contains(e.target)) sug.hidden = true; });
}

/* ---------------- SEARCH ---------------- */
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function initSearch() {
  const app = document.getElementById("app");
  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get("q") || "",
    vertical: params.get("vertical") || "",
    brand: params.get("brand") || "",
    priceMin: params.get("priceMin") || "",
    priceMax: params.get("priceMax") || "",
    inStock: params.get("inStock") === "true",
    sort: params.get("sort") || "relevance",
    page: Math.max(1, Number(params.get("page")) || 1),
  };

  app.innerHTML = `
    <form class="searchbar" id="searchForm" style="margin-bottom:22px" autocomplete="off">
      <input id="searchInput" value="${esc(state.q)}" placeholder="Search products, brands, categories" autocomplete="off" />
      <button type="submit">Search</button>
      <div class="suggestions" id="sug" hidden></div>
    </form>
    <div class="search-layout">
      <aside class="facets" id="facets"></aside>
      <div>
        <div class="result-meta" id="meta"></div>
        <div id="results"></div>
        <div class="pager" id="pager"></div>
      </div>
    </div>`;

  const form = document.getElementById("searchForm");
  const input = document.getElementById("searchInput");
  const sug = document.getElementById("sug");
  let seq = 0;

  function queryString() {
    const sp = new URLSearchParams();
    if (state.q) sp.set("q", state.q);
    if (state.vertical) sp.set("vertical", state.vertical);
    if (state.brand) sp.set("brand", state.brand);
    if (state.priceMin) sp.set("priceMin", state.priceMin);
    if (state.priceMax) sp.set("priceMax", state.priceMax);
    if (state.inStock) sp.set("inStock", "true");
    sp.set("sort", state.sort);
    sp.set("page", String(state.page || 1));
    sp.set("pageSize", "40");
    return sp.toString();
  }

  async function run() {
    const qs = queryString();
    history.replaceState(null, "", `/search?${qs}`);
    const my = ++seq;
    let result;
    try {
      result = await api(`/search?${qs}`);
    } catch {
      return;
    }
    if (my !== seq) return;
    render(result);
  }

  function render(result) {
    document.getElementById("meta").innerHTML = `
      <span class="badge green">${result.total} results</span>
      <span class="badge">${result.strategy}</span>
      <span class="badge">${result.tookMs} ms</span>
      ${result.corrected && result.corrected.length ? `<span class="badge">corrected: ${result.corrected.map((c) => `${esc(c.from)} &rarr; ${esc(c.to)}`).join(", ")}</span>` : ""}
      ${result.message ? `<span class="badge" style="background:#fdecea;color:#b3261e">${esc(result.message)}</span>` : ""}`;

    const resultsEl = document.getElementById("results");
    if (result.total === 0) {
      const sugg = (result.suggestions || []).map((s) => `<a class="chip" href="/search?q=${encodeURIComponent(s)}">${esc(s)}</a>`).join(" ");
      resultsEl.innerHTML = `<div class="empty">
        <div style="font-size:16px;font-weight:700;color:var(--text)">${esc(result.message || "No results found.")}</div>
        ${sugg ? `<div style="margin-top:12px">Did you mean: ${sugg}</div>` : `<div style="margin-top:8px">Try a different keyword or browse a category.</div>`}
      </div>`;
    } else {
      resultsEl.innerHTML = grid(result.results, () => ({}));
    }

    const pages = result.pages || 1;
    const pager = document.getElementById("pager");
    pager.innerHTML =
      pages > 1
        ? `<button class="chip" id="prevPage" type="button" ${result.page <= 1 ? "disabled" : ""}>&larr; Previous</button>
           <span class="pager-info">Page ${result.page} of ${pages} &middot; ${Number(result.total).toLocaleString("en-IN")} results</span>
           <button class="chip" id="nextPage" type="button" ${result.page >= pages ? "disabled" : ""}>Next &rarr;</button>`
        : "";
    const goTo = (p) => { state.page = p; run(); window.scrollTo({ top: 0, behavior: "smooth" }); };
    if (document.getElementById("prevPage")) document.getElementById("prevPage").addEventListener("click", () => goTo(result.page - 1));
    if (document.getElementById("nextPage")) document.getElementById("nextPage").addEventListener("click", () => goTo(result.page + 1));

    const verticalEntries = Object.entries(result.facets.vertical || {});
    const brandEntries = Object.entries(result.facets.brand || {}).slice(0, 12);
    document.getElementById("facets").innerHTML = `
      <h3>Sort</h3>
      <select id="sortSel">
        ${[["relevance", "Relevance"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"], ["rating", "Rating"], ["popularity", "Popularity"]]
          .map(([v, l]) => `<option value="${v}" ${state.sort === v ? "selected" : ""}>${l}</option>`)
          .join("")}
      </select>
      <h3>Category</h3>
      <div id="catList">
        <label><input type="radio" name="vert" value="" ${!state.vertical ? "checked" : ""}/> All</label>
        ${verticalEntries.map(([v, n]) => `<label><input type="radio" name="vert" value="${esc(v)}" ${state.vertical === v ? "checked" : ""}/> ${esc(v)}<span class="n">${n}</span></label>`).join("")}
      </div>
      <h3>Brand</h3>
      ${brandEntries.map(([b, n]) => `<label><input type="checkbox" class="brandcb" value="${esc(b)}" ${state.brand === b ? "checked" : ""}/> ${esc(b)}<span class="n">${n}</span></label>`).join("")}
      <h3>Price</h3>
      <div class="price-row">
        <input type="number" id="pmin" placeholder="min" value="${esc(state.priceMin)}" />
        <input type="number" id="pmax" placeholder="max" value="${esc(state.priceMax)}" />
      </div>
      <h3>Availability</h3>
      <label><input type="checkbox" id="inStock" ${state.inStock ? "checked" : ""}/> In stock only</label>
      <div style="margin-top:14px"><button class="chip" id="applyBtn" style="width:100%">Apply filters</button></div>`;

    document.getElementById("sortSel").addEventListener("change", (e) => { state.sort = e.target.value; state.page = 1; run(); });
    document.querySelectorAll('input[name="vert"]').forEach((r) => r.addEventListener("change", (e) => { state.vertical = e.target.value; state.page = 1; run(); }));
    document.querySelectorAll(".brandcb").forEach((cb) => cb.addEventListener("change", (e) => { state.brand = e.target.checked ? e.target.value : ""; state.page = 1; run(); }));
    document.getElementById("inStock").addEventListener("change", (e) => { state.inStock = e.target.checked; state.page = 1; run(); });
    document.getElementById("applyBtn").addEventListener("click", () => { readPrice(); state.page = 1; run(); });
    const onPrice = debounce(() => { readPrice(); state.page = 1; run(); }, 500);
    document.getElementById("pmin").addEventListener("input", onPrice);
    document.getElementById("pmax").addEventListener("input", onPrice);
  }

  function readPrice() {
    state.priceMin = document.getElementById("pmin").value;
    state.priceMax = document.getElementById("pmax").value;
  }

  // Search-as-you-type.
  const onType = debounce(async () => {
    state.q = input.value.trim();
    state.page = 1;
    run();
    if (state.q.length < 2) { sug.hidden = true; return; }
    try {
      const { suggestions } = await api(`/search/suggest?q=${encodeURIComponent(state.q)}`);
      if (!suggestions.length) { sug.hidden = true; return; }
      sug.innerHTML = suggestions.map((s) => `<div data-w="${esc(s)}">${esc(s)}</div>`).join("");
      sug.hidden = false;
      sug.querySelectorAll("div").forEach((d) =>
        d.addEventListener("click", () => { input.value = d.dataset.w; state.q = d.dataset.w; state.page = 1; sug.hidden = true; run(); })
      );
    } catch { sug.hidden = true; }
  }, 280);

  input.addEventListener("input", onType);
  form.addEventListener("submit", (e) => { e.preventDefault(); state.q = input.value.trim(); state.page = 1; sug.hidden = true; run(); });
  document.addEventListener("click", (e) => { if (!form.contains(e.target)) sug.hidden = true; });

  await run();
}

/* ---------------- PRODUCT ---------------- */
async function initProduct() {
  const app = document.getElementById("app");
  const id = new URLSearchParams(location.search).get("id");
  if (!id) { app.innerHTML = `<div class="empty">Missing product id.</div>`; return; }
  const d = await api(`/products/${encodeURIComponent(id)}`);
  const p = d.product;
  const offers = d.offers || [];
  const attrs = Object.entries(p.attributes || {})
    .map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, " "))}</td><td>${esc(typeof v === "boolean" ? (v ? "Yes" : "No") : v)}</td></tr>`)
    .join("");

  const stars = (n) => {
    const k = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return "\u2605".repeat(k) + "\u2606".repeat(5 - k);
  };

  const specsHtml = (d.specs || []).length
    ? `
    <section class="section" style="margin-top:34px">
      <div class="section-head"><h2>Specifications</h2><span class="sub">Aggregated from catalogue data</span></div>
      <div class="spec-grid">
        ${(d.specs || [])
          .map(
            (g) => `
          <div class="spec-group">
            <h4>${esc(g.title)}</h4>
            <table class="attrs">${g.items.map((it) => `<tr><td>${esc(it.label)}</td><td>${esc(it.value)}</td></tr>`).join("")}</table>
          </div>`
          )
          .join("")}
      </div>
    </section>`
    : "";

  const rv = d.reviews || {};
  const sum = rv.summary;
  const reviewsHtml = sum
    ? `
    <section class="section" style="margin-top:36px">
      <div class="section-head"><h2>Ratings &amp; reviews</h2><span class="sub">Sample reviews aggregated from ${sum.bySource.length} stores</span></div>
      <div class="review-layout">
        <div class="review-summary">
          <div class="rs-score">${sum.average}<span>/5</span></div>
          <div class="rs-stars">${stars(sum.average)}</div>
          <div class="rs-total">${Number(sum.total).toLocaleString("en-IN")} ratings</div>
          <div class="rs-bars">
            ${[5, 4, 3, 2, 1]
              .map(
                (s) => `<div class="rs-bar"><span>${s}\u2605</span><div class="rs-track"><i style="width:${sum.percentages[s]}%"></i></div><span class="rs-pct">${sum.percentages[s]}%</span></div>`
              )
              .join("")}
          </div>
        </div>
        <div class="review-main">
          <div class="rs-sources">
            ${sum.bySource.map((s) => `<span class="src-badge">${esc(s.source)} \u00b7 ${s.average}\u2605 <b>${Number(s.count).toLocaleString("en-IN")}</b></span>`).join("")}
          </div>
          <div class="review-list">
            ${(rv.reviews || [])
              .map(
                (r) => `
              <article class="review">
                <div class="rv-head">
                  <span class="rv-avatar">${esc(initials(r.author))}</span>
                  <div class="rv-who">
                    <div class="rv-author">${esc(r.author)} <span class="rv-loc">${esc(r.location)}</span></div>
                    <div class="rv-meta">${stars(r.rating)} <span class="rv-src">via ${esc(r.merchant)}</span>${r.verified ? ' <span class="badge green">Verified</span>' : ""}</div>
                  </div>
                  <time class="rv-date">${new Date(r.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</time>
                </div>
                <h5 class="rv-title">${esc(r.title)}</h5>
                <p class="rv-body">${esc(r.body)}</p>
                <div class="rv-help">${r.helpful} people found this helpful</div>
              </article>`
              )
              .join("")}
          </div>
          <div class="review-note">Reviews shown are sample data aggregated across partner stores for demonstration.</div>
        </div>
      </div>
    </section>`
    : "";
  const offersHtml = offers.length
    ? `
    <section class="section" style="margin-top:34px">
      <div class="section-head"><h2>Compare prices</h2><span class="sub">${offers.length} stores &middot; lowest first &middot; checked ${new Date(offers[0].checkedAt).toLocaleString()}</span></div>
      <div class="offers">
        ${offers
          .map(
            (o, i) => `
          <div class="offer ${i === 0 ? "lowest" : ""}">
            <div class="offer-merchant">
              <div class="m-top"><span class="m-name">${esc(o.merchant)}</span>${i === 0 ? '<span class="badge green">Lowest</span>' : ""}</div>
              <div class="m-sub">${esc(o.domain)} &middot; ${o.inStock ? "In stock" : "Out of stock"} &middot; ${o.deliveryDays}-day delivery</div>
              ${o.coupon ? `<div class="m-coupon">${esc(o.coupon)}</div>` : ""}
            </div>
            <div class="offer-price">
              <div class="op">${money(o.price)}</div>
              ${o.mrp > o.price ? `<s>${money(o.mrp)}</s>` : ""}
              <a class="buy-btn" href="/go?product=${encodeURIComponent(p.id)}&merchant=${encodeURIComponent(o.merchantSlug)}&userId=${encodeURIComponent(getUser() || "")}" target="_blank" rel="noopener" title="Buy on ${esc(o.merchant)}">Buy &#8599;</a>
            </div>
          </div>`
          )
          .join("")}
      </div>
    </section>`
    : "";
  app.innerHTML = `
    <div class="detail">
      <div class="hero-img" style="background:${colorFor(p.brand)}">${productImg(p, { lazy: false })}</div>
      <div>
        <div class="brand">${esc(p.brand)} &middot; ${esc(p.categoryPath.join(" / "))}</div>
        <h1>${esc(p.title)}</h1>
        <div class="rating">&#9733; ${p.rating} <span>(${Number(p.ratingCount).toLocaleString("en-IN")} ratings)</span></div>
        ${aiScorePanel(p.aiScore)}
        <div class="price-big">${money(p.price)} ${p.mrp > p.price ? `<s>${money(p.mrp)}</s>` : ""}</div>
        ${offers.length > 1 ? `<div class="lowest-line">Lowest at <strong>${esc(offers[0].merchant)}</strong> &middot; compare ${offers.length} stores &darr;</div>` : ""}
        <div class="pill-row">${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        <p>${esc(p.description)}</p>
        <table class="attrs">${attrs}</table>
        <div style="margin-top:18px;display:flex;gap:10px">
          <button class="chip" id="wishBtn">&#9825; Add to wishlist</button>
          <button class="chip" id="viewBtn">Log a view</button>
        </div>
        ${d.rankedIn.length ? `<div class="section" style="margin-top:24px"><h3>Ranked in</h3>${d.rankedIn.map((r) => `<a class="chip" href="/list?id=${encodeURIComponent(r.id)}" style="margin-right:8px">#${r.rank} ${esc(r.title)}</a>`).join("")}</div>` : ""}
      </div>
    </div>
    ${specsHtml}
    ${offersHtml}
    ${reviewsHtml}
    <section class="section" style="margin-top:36px">
      <div class="section-head"><h2>Similar products</h2><span class="sub">Content-based similarity</span></div>
      ${grid(d.similar, (it) => ({ reason: it.reason }))}
    </section>
    <section class="section">
      <div class="section-head"><h2>Users also viewed</h2><span class="sub">Item-item collaborative filtering</span></div>
      ${grid(d.alsoViewed, (it) => ({ reason: it.reason }))}
    </section>`;

  const logEvent = (type) =>
    api("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p.id, type, userId: getUser(), sessionId: "web" }),
    }).catch(() => {});

  // Wishlist: requires a profile, persisted per user (shared state with hearts).
  const wishBtn = document.getElementById("wishBtn");
  const paintWish = () => {
    const on = WISHLIST_IDS.has(p.id);
    wishBtn.innerHTML = on ? "&#9829; In wishlist" : "&#9825; Add to wishlist";
    wishBtn.classList.toggle("active", on);
  };
  paintWish();
  wishBtn.addEventListener("click", () =>
    requireAuth(
      async () => { await toggleWishlist(p.id); paintWish(); },
      `Create a profile to save "${p.title}" to your wishlist.`
    )
  );

  document.getElementById("viewBtn").addEventListener("click", () => logEvent("view"));
  logEvent("view");
}

/* ---------------- WISHLIST ---------------- */
async function initWishlist() {
  const app = document.getElementById("app");
  if (!isLoggedIn()) {
    app.innerHTML = `
      <div class="empty">
        <div style="font-size:16px;font-weight:700;color:var(--text)">Your wishlist is waiting</div>
        <p>Create a profile to save products you love and find them again later.</p>
        <button class="btn-primary" id="wlSignup" type="button">Create profile</button>
      </div>`;
    document.getElementById("wlSignup").addEventListener("click", () =>
      openAuthModal("signup", initWishlist, "Create a profile to see your wishlist.")
    );
    return;
  }
  const w = await api("/wishlist");
  if (!w.items.length) {
    app.innerHTML = `
      <div class="section-head"><h2>My wishlist</h2><span class="sub">0 saved items</span></div>
      <div class="empty">Nothing saved yet. Tap the heart on any product to add it here.</div>`;
    return;
  }
  app.innerHTML = `
    <div class="section-head"><h2>My wishlist</h2><span class="sub">${w.items.length} saved item${w.items.length === 1 ? "" : "s"}</span></div>
    ${grid(w.items, () => ({}))}`;
}

/* ---------------- CURATED LIST ---------------- */
async function initList() {
  const app = document.getElementById("app");
  const id = new URLSearchParams(location.search).get("id");
  if (!id) { app.innerHTML = `<div class="empty">Missing list id.</div>`; return; }
  const l = await api(`/curated-lists/${encodeURIComponent(id)}`);
  app.innerHTML = `
    <div class="section-head"><div><div class="brand">${esc(l.category)}</div><h2>${esc(l.title)}</h2>
      <div class="sub">${esc(l.intro)} &middot; generated ${new Date(l.generatedAt).toLocaleDateString()}</div></div></div>
    <div style="margin-top:20px">
      ${l.items
        .map(
          (it) => `
        <div class="list-row">
          <div class="list-rank">#${it.rank}</div>
          <div class="list-thumb"><img src="/api/images/${encodeURIComponent(it.product.id)}.svg" alt="" loading="lazy" /></div>
          <div class="list-info">
            <div class="t"><a href="/product?id=${encodeURIComponent(it.product.id)}">${esc(it.product.title)}</a></div>
            <div class="m">${esc(it.product.brand)} &middot; &#9733; ${it.product.rating} &middot; ${money(it.product.price)}</div>
          </div>
          <div class="list-score">${it.score}</div>
        </div>`
        )
        .join("")}
    </div>`;
}

/* ---------------- ADMIN / DASHBOARD ---------------- */
async function initAdmin() {
  const app = document.getElementById("app");
  const s = await api("/stats");
  const maxQ = Math.max(1, ...s.topQueries.map((q) => q.count));
  app.innerHTML = `
    <div class="section-head"><h2>Dashboard</h2><span class="sub">Live search &amp; recommendation analytics</span></div>
    <div class="stat-grid">
      <div class="stat"><div class="v">${s.catalogue.products}</div><div class="l">Products</div></div>
      <div class="stat"><div class="v">${s.catalogue.vocabulary}</div><div class="l">Index terms</div></div>
      <div class="stat"><div class="v">${s.recommender.usersWithHistory}</div><div class="l">Users with history</div></div>
      <div class="stat"><div class="v">${s.searches}</div><div class="l">Searches</div></div>
      <div class="stat"><div class="v">${s.zeroResultSearches}</div><div class="l">Zero-result</div></div>
      <div class="stat"><div class="v">${s.events}</div><div class="l">Events logged</div></div>
    </div>
    <section class="section" style="margin-top:30px">
      <div class="section-head"><h2>Top queries</h2></div>
      ${s.topQueries.length ? s.topQueries.map((q) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:14px"><span>${esc(q.query || "(empty)")}</span><span>${q.count}</span></div><div class="bar"><span style="width:${(q.count / maxQ) * 100}%"></span></div></div>`).join("") : `<div class="empty">No searches yet. Try the search page.</div>`}
    </section>
    <section class="section">
      <div class="section-head"><h2>Recommender internals</h2></div>
      <div class="stat-grid">
        <div class="stat"><div class="v">${s.recommender.itemsInCF}</div><div class="l">Items in CF</div></div>
        <div class="stat"><div class="v">${s.recommender.mfUsers} x ${s.recommender.mfItems}</div><div class="l">MF matrix</div></div>
        <div class="stat"><div class="v">${s.catalogue.avgDocLength}</div><div class="l">Avg doc length</div></div>
      </div>
    </section>`;
}

/* ---------------- boot ---------------- */
document.addEventListener("DOMContentLoaded", async () => {
  await loadSession();
  await refreshWishlistIds();
  const page = document.body.dataset.page;
  renderHeader(page);
  const run = { home: initHome, search: initSearch, product: initProduct, list: initList, wishlist: initWishlist, admin: initAdmin }[page];
  if (run) run().catch((e) => {
    document.getElementById("app").innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  });
});
