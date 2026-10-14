(() => {
  "use strict";
  const S = window.SetCover;
  const $ = id => document.getElementById(id);
  const NODE_LIMIT = 3e6;

  const state = {
    points: [], R: 18,
    mine: new Set(),
    view: "mine", mode: "play",
    hide: true, showCircles: true, showEdges: false, showLabels: true,
    cov: null, res: null, solving: false, hover: -1, drag: -1,
  };

  // ---------- helpers ----------
  const lbl = i => "v" + (i + 1);
  const fmt = x => (Math.round(x * 10) / 10).toString();
  const toSvgY = y => 100 - y; // plot with y pointing up
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  function copy(text, what) {
    navigator.clipboard.writeText(text).then(() => toast(what + " copied"), () => toast("Copy failed"));
  }
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- core updates ----------
  function rebuildCoverage() { state.cov = S.buildCoverage(state.points, state.R); }

  let solveTimer = 0, solveToken = 0;
  function scheduleSolve() {
    rebuildCoverage();
    state.res = null; state.solving = true;
    render();
    clearTimeout(solveTimer);
    const token = ++solveToken;
    solveTimer = setTimeout(() => {
      // let the "Solving…" state paint first
      requestAnimationFrame(() => setTimeout(() => {
        if (token !== solveToken) return;
        const cov = state.cov;
        const res = {
          greedy: S.greedy(cov),
          atLeast: S.solve(cov, false, NODE_LIMIT),
          exactly: S.solve(cov, true, NODE_LIMIT),
        };
        if (token !== solveToken) return;
        state.res = res; state.solving = false;
        render(); writeHash();
      }, 0));
    }, 120);
  }

  function setPoints(points, keepMine) {
    state.points = points;
    if (!keepMine) state.mine = new Set();
    syncCoordsBox();
    scheduleSolve();
  }

  function viewFacilities() {
    const r = state.res;
    switch (state.view) {
      case "mine": return [...state.mine];
      case "cover": return r ? r.atLeast.solution : [];
      case "exact": return r && r.exactly.solution ? r.exactly.solution : [];
      case "greedy": return r ? r.greedy : [];
    }
    return [];
  }

  // ---------- rendering ----------
  const svg = $("plot");

  function render() {
    renderPlot();
    renderCards();
    renderControls();
  }

  function renderControls() {
    document.querySelectorAll("[data-view]").forEach(b => {
      b.classList.toggle("on", b.dataset.view === state.view);
      if (b.classList.contains("ans")) b.disabled = state.hide;
    });
    document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === state.mode));
    $("btnReveal").textContent = state.hide ? "Reveal answers" : "Hide answers";
    $("hideAnswers").checked = state.hide;
    svg.classList.toggle("edit", state.mode === "edit");
    $("modeHint").textContent = state.mode === "play"
      ? "Click vertices to open or close facilities in “My attempt”."
      : "Click empty space to add a vertex, drag to move, right-click (or Shift+click) to delete.";
    $("ROut").textContent = fmt(state.R);
  }

  function renderPlot() {
    const { points, R, cov } = state;
    if (!cov) return;
    const fac = viewFacilities();
    const facSet = new Set(fac);
    const counts = S.coverCounts(cov, fac);
    const out = [];

    // grid
    out.push(`<rect x="0" y="0" width="100" height="100" fill="none" stroke="var(--line)" stroke-width="0.25"/>`);
    for (let g = 10; g < 100; g += 10) {
      out.push(`<line x1="${g}" y1="0" x2="${g}" y2="100" stroke="var(--grid)" stroke-width="0.25"/>`);
      out.push(`<line x1="0" y1="${g}" x2="100" y2="${g}" stroke="var(--grid)" stroke-width="0.25"/>`);
    }
    out.push(`<rect id="bg" x="-4" y="-4" width="108" height="108" fill="transparent"/>`);

    // scale bar for R
    out.push(`<g opacity="0.8"><line x1="1" y1="102.2" x2="${1 + R}" y2="102.2" stroke="var(--muted)" stroke-width="0.4"/>
      <line x1="1" y1="101.4" x2="1" y2="103" stroke="var(--muted)" stroke-width="0.4"/>
      <line x1="${1 + R}" y1="101.4" x2="${1 + R}" y2="103" stroke="var(--muted)" stroke-width="0.4"/>
      <text x="${1.6 + R}" y="103.1" font-size="2.4" fill="var(--muted)">R = ${fmt(R)}</text></g>`);

    // edges
    if (state.showEdges) {
      for (let j = 0; j < points.length; j++) for (const i of cov.coveredBy[j]) {
        if (i <= j) continue;
        out.push(`<line x1="${points[i].x}" y1="${toSvgY(points[i].y)}" x2="${points[j].x}" y2="${toSvgY(points[j].y)}" stroke="var(--edge)" stroke-width="0.3"/>`);
      }
    }

    // coverage circles (clipped to the plot square)
    if (state.showCircles) {
      out.push(`<clipPath id="plotClip"><rect x="0" y="0" width="100" height="100"/></clipPath><g clip-path="url(#plotClip)">`);
      for (const j of fac) {
        out.push(`<circle cx="${points[j].x}" cy="${toSvgY(points[j].y)}" r="${R}" fill="var(--accent-soft)" stroke="var(--accent-ring)" stroke-width="0.3" pointer-events="none"/>`);
      }
      out.push(`</g>`);
    }

    // hover radius
    const h = state.hover;
    const hoverNbrs = new Set(h >= 0 && h < points.length ? cov.coveredBy[h] : []);
    if (h >= 0 && h < points.length) {
      out.push(`<circle cx="${points[h].x}" cy="${toSvgY(points[h].y)}" r="${R}" fill="none" stroke="var(--ink)" stroke-width="0.3" stroke-dasharray="1 0.8" pointer-events="none" opacity="0.6"/>`);
    }

    // vertices
    for (let i = 0; i < points.length; i++) {
      const x = points[i].x, y = toSvgY(points[i].y), c = counts[i];
      const color = c === 0 ? "var(--c0)" : c === 1 ? "var(--c1)" : "var(--c2)";
      const ring = h >= 0 && hoverNbrs.has(i) && i !== h ? `<circle cx="${x}" cy="${y}" r="2.6" fill="none" stroke="var(--ink)" stroke-width="0.35"/>` : "";
      let mark;
      if (facSet.has(i)) {
        mark = `<rect x="${x - 1.9}" y="${y - 1.9}" width="3.8" height="3.8" rx="0.6" fill="var(--accent)" stroke="var(--panel)" stroke-width="0.5"/>
                <rect x="${x - 1.1}" y="${y - 1.1}" width="2.2" height="2.2" rx="0.3" fill="${color}"/>`;
      } else if (c === 0) {
        mark = `<circle cx="${x}" cy="${y}" r="1.35" fill="var(--panel)" stroke="${color}" stroke-width="0.6"/>`;
      } else {
        mark = `<circle cx="${x}" cy="${y}" r="1.5" fill="${color}" stroke="var(--panel)" stroke-width="0.35"/>`;
      }
      const label = state.showLabels ? `<text x="${x + 2}" y="${y - 1.7}" font-size="2.5" fill="var(--muted)" pointer-events="none">${i + 1}${c > 1 ? `<tspan fill="var(--c2)" font-weight="700"> ×${c}</tspan>` : ""}</text>` : "";
      out.push(`<g class="v" data-i="${i}">${ring}<circle cx="${x}" cy="${y}" r="3" fill="transparent"/>${mark}</g>${label}`);
    }

    if (!points.length) out.push(`<text x="50" y="50" text-anchor="middle" font-size="3.5" fill="var(--muted)">No vertices. Switch to “Edit vertices” and click to add some.</text>`);
    svg.innerHTML = out.join("");
    renderHoverInfo();
  }

  function renderHoverInfo() {
    const h = state.hover, el = $("hoverInfo");
    if (h < 0 || h >= state.points.length) { el.textContent = ""; return; }
    const p = state.points[h];
    const nb = state.cov.coveredBy[h].filter(j => j !== h).map(lbl);
    el.textContent = `${lbl(h)} (${fmt(p.x)}, ${fmt(p.y)}) · within R: ${nb.length ? nb.join(", ") : "none"}`;
  }

  function idList(arr) { return arr.slice().sort((a, b) => a - b).map(lbl).join(", "); }

  function renderCards() {
    const { cov, res, hide, solving } = state;
    const n = cov.n;
    const mine = [...state.mine];
    const mc = S.coverCounts(cov, mine);
    const unc = mc.filter(c => c === 0).length, over = mc.filter(c => c > 1).length;
    const opt = res ? res.atLeast.solution.length : null;

    // My attempt
    {
      let status = "", cls = "";
      if (!mine.length) status = `<p>Click vertices to place facilities. Try to cover all ${n} vertices with as few as possible.</p>`;
      else if (unc) status = `<p><span class="tag bad">${unc} uncovered</span>${over ? `<span class="tag warn">${over} covered 2+</span>` : ""}</p>`;
      else {
        cls = "good";
        let cmp = "";
        if (!hide && res) cmp = mine.length === opt ? `<span class="tag good">optimal</span>` : `<span class="tag warn">optimum is ${opt}</span>`;
        else if (hide) cmp = `<span class="tag good">feasible</span>`;
        status = `<p>${cmp}${over ? `<span class="tag warn">${over} covered 2+, breaks “= 1”</span>` : `<span class="tag good">also satisfies “= 1”</span>`}</p>`;
      }
      $("cardMine").className = "panel card " + cls;
      $("cardMine").innerHTML = `<h3>My attempt</h3><div class="big">${mine.length}<small>facilities</small></div>${status}
        ${mine.length ? `<p class="ids">${idList(mine)}</p>` : ""}`;
    }

    const hiddenCard = (id, title) => { $(id).className = "panel card"; $(id).innerHTML = `<h3>${title}</h3><div class="big">?</div><p>Hidden. Press “Reveal answers”.</p>`; };
    const solvingCard = (id, title) => { $(id).className = "panel card"; $(id).innerHTML = `<h3>${title}</h3><div class="big">…</div><p>Solving…</p>`; };

    if (hide) {
      hiddenCard("cardCover", "Optimal, every vertex ≥ 1");
      hiddenCard("cardExact", "Exact, every vertex = 1");
      hiddenCard("cardGreedy", "Greedy heuristic");
      return;
    }
    if (solving || !res) {
      solvingCard("cardCover", "Optimal, every vertex ≥ 1");
      solvingCard("cardExact", "Exact, every vertex = 1");
      solvingCard("cardGreedy", "Greedy heuristic");
      return;
    }

    // >= 1
    {
      const sol = res.atLeast.solution;
      const cc = S.coverCounts(cov, sol);
      const ov = cc.filter(c => c > 1).length;
      $("cardCover").className = "panel card";
      $("cardCover").innerHTML = `<h3>Optimal, every vertex ≥ 1</h3>
        <div class="big">${sol.length}<small>facilities${res.atLeast.optimal ? "" : " (best found)"}</small></div>
        <p>${ov ? `<span class="tag warn">${ov} vertices covered 2+</span>` : `<span class="tag good">no overlap</span>`}</p>
        <p class="ids">${idList(sol)}</p>
        <p>${res.atLeast.optimal ? `Proven optimal (${res.atLeast.nodes.toLocaleString()} search nodes).` : `Node limit hit, so this may not be optimal.`}</p>`;
    }

    // = 1
    {
      const ex = res.exactly;
      if (ex.solution) {
        $("cardExact").className = "panel card good";
        $("cardExact").innerHTML = `<h3>Exact, every vertex = 1</h3>
          <div class="big">${ex.solution.length}<small>facilities</small></div>
          <p><span class="tag good">feasible</span> Same count as ≥ 1. When sites are the vertices, a feasible exact cover is always also a minimum cover.</p>
          <p class="ids">${idList(ex.solution)}</p>`;
      } else {
        $("cardExact").className = "panel card bad";
        $("cardExact").innerHTML = `<h3>Exact, every vertex = 1</h3>
          <div class="big">${ex.optimal ? "Infeasible" : "Unknown"}</div>
          <p>${ex.optimal
            ? `No set of facilities covers every vertex exactly once (search proved it in ${ex.nodes.toLocaleString()} nodes). The ≥ 1 optimum needs overlaps, shown in orange.`
            : `Node limit hit before a proof was found.`}</p>`;
      }
    }

    // greedy
    {
      const g = res.greedy, gap = g.length - opt;
      $("cardGreedy").className = "panel card " + (gap > 0 ? "bad" : "");
      $("cardGreedy").innerHTML = `<h3>Greedy heuristic</h3>
        <div class="big">${g.length}<small>facilities</small></div>
        <p>${gap > 0 ? `<span class="tag bad">+${gap} vs optimum</span> The “cover the most first” choice is a trap.` : `<span class="tag good">optimal here</span>`}</p>
        <p class="ids">${g.map(lbl).join(" → ")}</p>`;
    }
  }

  // ---------- coordinates / export ----------
  function syncCoordsBox() {
    $("coords").value = state.points.map(p => `${fmt(p.x)}, ${fmt(p.y)}`).join("\n");
  }
  function parseCoords(text) {
    const pts = [];
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim(); if (!t || t.startsWith("#")) continue;
      const m = t.split(/[\s,;]+/).map(Number);
      if (m.length < 2 || !isFinite(m[0]) || !isFinite(m[1])) throw new Error(`Can't read line: "${t}"`);
      pts.push({ x: Math.min(100, Math.max(0, m[0])), y: Math.min(100, Math.max(0, m[1])) });
    }
    if (pts.length > 120) throw new Error("At most 120 vertices.");
    return pts;
  }

  function lpText(exact) {
    const n = state.cov.n, xs = Array.from({ length: n }, (_, j) => "x" + (j + 1));
    const lines = [`\\ Facility set cover, ${n} vertices, R = ${fmt(state.R)}, constraint ${exact ? "= 1" : ">= 1"}`, "Minimize", " obj: " + xs.join(" + "), "Subject To"];
    for (let i = 0; i < n; i++) lines.push(` c${i + 1}: ${state.cov.coveredBy[i].map(j => xs[j]).join(" + ")} ${exact ? "=" : ">="} 1`);
    lines.push("Binary", " " + xs.join(" "), "End");
    return lines.join("\n");
  }
  function coverageCSV() {
    const n = state.cov.n, rows = [["i\\j", ...Array.from({ length: n }, (_, j) => lbl(j))].join(",")];
    for (let i = 0; i < n; i++) {
      const s = new Set(state.cov.coveredBy[i]);
      rows.push([lbl(i), ...Array.from({ length: n }, (_, j) => (s.has(j) ? 1 : 0))].join(","));
    }
    return rows.join("\n");
  }
  function distanceCSV() {
    const P = state.points, rows = [["", "x", "y", ...P.map((_, j) => lbl(j))].join(",")];
    P.forEach((p, i) => rows.push([lbl(i), fmt(p.x), fmt(p.y), ...P.map(q => Math.hypot(p.x - q.x, p.y - q.y).toFixed(2))].join(",")));
    return rows.join("\n");
  }

  // ---------- share link ----------
  function writeHash() {
    const p = state.points.map(q => `${fmt(q.x)},${fmt(q.y)}`).join(";");
    history.replaceState(null, "", `#R=${fmt(state.R)}&p=${p}` + (state.hide ? "" : `&reveal=1&view=${state.view}`));
  }
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.get("p")) return false;
    try {
      const pts = h.get("p").split(";").filter(Boolean).map(s => { const [x, y] = s.split(",").map(Number); return { x, y }; });
      if (!pts.length || pts.some(p => !isFinite(p.x) || !isFinite(p.y))) return false;
      const R = Number(h.get("R")); if (isFinite(R) && R > 0) state.R = R;
      if (h.get("reveal") === "1") state.hide = false; // answer-key links
      if (["cover", "exact", "greedy"].includes(h.get("view")) && !state.hide) state.view = h.get("view");
      $("R").value = state.R; $("n").value = Math.min(60, pts.length); $("nOut").textContent = $("n").value;
      setPoints(pts);
      return true;
    } catch { return false; }
  }

  // ---------- generation ----------
  function genParams() {
    return { n: +$("n").value, R: state.R, minSep: +$("sep").value, seed: Math.max(0, Math.floor(+$("seed").value || 0)) };
  }
  function randomInstance() {
    const { n, minSep, seed } = genParams();
    const pts = S.randomPoints(n, seed, minSep);
    setMsg(pts.length < n ? `Only fit ${pts.length} vertices with that spacing.` : `Random instance, seed ${seed}.`, pts.length < n ? "err" : "");
    setPoints(pts);
  }
  let genRun = 0;
  function trickyInstance() {
    const { n, R, minSep, seed } = genParams();
    const reqExact = $("reqExact").checked, reqGreedy = $("reqGreedy").checked;
    const run = ++genRun, CHUNK = 20, MAX = 2000;
    let tried = 0;
    $("btnTricky").disabled = true;
    setMsg("Searching…");
    const step = () => {
      if (run !== genRun) return;
      const r = S.findTricky({ n, R, startSeed: seed + tried, maxTries: CHUNK, requireGreedyGap: reqGreedy, requireExactInfeasible: reqExact, minSep });
      if (r) {
        $("btnTricky").disabled = false;
        $("seed").value = r.seed + 1; // next click continues the search
        setMsg(`Found seed ${r.seed} after ${tried + r.tries} tries.`, "ok");
        setPoints(r.points);
        return;
      }
      tried += CHUNK;
      if (tried >= MAX) {
        $("btnTricky").disabled = false;
        setMsg(`Nothing found in ${MAX} tries. Try a different R or vertex count. Medium density works best (each vertex reaching about 3–6 others).`, "err");
        return;
      }
      setMsg(`Searching… ${tried} tries`);
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }
  function setMsg(t, cls) { const m = $("genMsg"); m.textContent = t; m.className = "msg " + (cls || ""); }

  // ---------- pointer interaction ----------
  function svgPoint(evt) {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.min(100, Math.max(0, Math.round(p.x * 10) / 10)), y: Math.min(100, Math.max(0, Math.round((100 - p.y) * 10) / 10)) };
  }
  const vertexOf = evt => { const g = evt.target.closest && evt.target.closest(".v"); return g ? +g.dataset.i : -1; };

  function deleteVertex(i) {
    const pts = state.points.slice(); pts.splice(i, 1);
    // shift indices in my attempt
    const mine = new Set();
    for (const j of state.mine) if (j !== i) mine.add(j > i ? j - 1 : j);
    state.mine = mine; state.hover = -1;
    setPoints(pts, true);
  }

  svg.addEventListener("pointerdown", e => {
    if (e.button === 2) return;
    const i = vertexOf(e);
    if (state.mode === "play") {
      if (i < 0) return;
      state.mine.has(i) ? state.mine.delete(i) : state.mine.add(i);
      state.view = "mine";
      render();
      return;
    }
    // edit mode
    if (i >= 0 && e.shiftKey) { deleteVertex(i); return; }
    if (i >= 0) { state.drag = i; svg.setPointerCapture(e.pointerId); return; }
    if (state.points.length >= 120) { toast("At most 120 vertices"); return; }
    setPoints([...state.points, svgPoint(e)], true);
  });
  svg.addEventListener("pointermove", e => {
    if (state.drag >= 0) {
      state.points[state.drag] = svgPoint(e);
      rebuildCoverage(); state.res = null; state.solving = true;
      renderPlot();
      return;
    }
    const i = vertexOf(e);
    if (i !== state.hover) { state.hover = i; renderPlot(); }
  });
  const endDrag = () => { if (state.drag >= 0) { state.drag = -1; syncCoordsBox(); scheduleSolve(); } };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", () => { if (state.drag < 0 && state.hover !== -1) { state.hover = -1; renderPlot(); } });
  svg.addEventListener("contextmenu", e => {
    if (state.mode !== "edit") return;
    e.preventDefault();
    const i = vertexOf(e); if (i >= 0) deleteVertex(i);
  });

  // ---------- controls ----------
  const bindRange = (id, outId, fn) => { const el = $(id); const upd = () => { $(outId).textContent = el.value; fn && fn(+el.value); }; el.addEventListener("input", upd); upd(); };
  bindRange("n", "nOut");
  bindRange("sep", "sepOut");
  $("R").addEventListener("input", () => { state.R = +$("R").value; scheduleSolve(); });

  $("btnRandom").onclick = randomInstance;
  $("btnTricky").onclick = trickyInstance;
  $("btnClear").onclick = () => { state.mine.clear(); render(); };
  $("btnReveal").onclick = () => { state.hide = !state.hide; if (state.hide) state.view = "mine"; render(); };
  $("hideAnswers").onchange = e => { state.hide = e.target.checked; if (state.hide) state.view = "mine"; render(); };
  $("showCircles").onchange = e => { state.showCircles = e.target.checked; renderPlot(); };
  $("showEdges").onchange = e => { state.showEdges = e.target.checked; renderPlot(); };
  $("showLabels").onchange = e => { state.showLabels = e.target.checked; renderPlot(); };
  document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => { state.view = b.dataset.view; render(); });
  document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { state.mode = b.dataset.mode; render(); });
  $("btnApplyCoords").onclick = () => {
    try { setPoints(parseCoords($("coords").value)); toast("Coordinates applied"); }
    catch (err) { toast(err.message); }
  };
  $("btnLP1").onclick = () => copy(lpText(false), "LP (≥ 1)");
  $("btnLP2").onclick = () => copy(lpText(true), "LP (= 1)");
  $("btnCSVa").onclick = () => download("coverage_matrix.csv", coverageCSV());
  $("btnCSVd").onclick = () => download("distance_matrix.csv", distanceCSV());
  $("btnShare").onclick = () => { writeHash(); copy(location.href, "Share link"); };

  // ---------- boot ----------
  state.R = +$("R").value;
  if (!readHash()) {
    // default: a tricky instance so the page opens on something interesting
    const p = genParams();
    const r = S.findTricky({ n: p.n, R: state.R, startSeed: p.seed, maxTries: 500, requireGreedyGap: true, requireExactInfeasible: true, minSep: p.minSep });
    if (r) { $("seed").value = r.seed + 1; setMsg(`Loaded tricky instance (seed ${r.seed}).`, "ok"); setPoints(r.points); }
    else randomInstance();
  }
})();
