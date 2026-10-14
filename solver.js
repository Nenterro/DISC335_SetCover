// Set cover solvers for the "facility at a vertex, covers everything within R" model.
// Works in the browser (window.SetCover) and in Node (module.exports) for testing.
(function (root) {
  "use strict";

  // ---------- bitset helpers (Uint32Array words) ----------
  function popcount32(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  function hasBit(m, i) { return (m[i >>> 5] >>> (i & 31)) & 1; }
  function setBit(m, i) { m[i >>> 5] |= 1 << (i & 31); }
  function orInto(a, b, W) { const r = new Uint32Array(W); for (let w = 0; w < W; w++) r[w] = a[w] | b[w]; return r; }
  function gain(set, covered, W) { let c = 0; for (let w = 0; w < W; w++) c += popcount32(set[w] & ~covered[w]); return c; }
  function disjoint(set, covered, W) { for (let w = 0; w < W; w++) if (set[w] & covered[w]) return false; return true; }

  // a[i][j] = 1 if a facility at vertex j covers vertex i (Euclidean distance <= R)
  function buildCoverage(points, R) {
    const n = points.length, W = Math.max(1, Math.ceil(n / 32));
    const R2 = R * R + 1e-9;
    const sets = [], coveredBy = [];
    for (let i = 0; i < n; i++) coveredBy.push([]);
    for (let j = 0; j < n; j++) {
      const m = new Uint32Array(W);
      for (let i = 0; i < n; i++) {
        const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y;
        if (dx * dx + dy * dy <= R2) { setBit(m, i); coveredBy[i].push(j); }
      }
      sets.push(m);
    }
    return { n, W, sets, coveredBy };
  }

  function greedy(cov) {
    const { n, W, sets } = cov;
    let covered = new Uint32Array(W), left = n;
    const chosen = [];
    while (left > 0) {
      let bj = -1, bg = 0;
      for (let j = 0; j < n; j++) { const g = gain(sets[j], covered, W); if (g > bg) { bg = g; bj = j; } }
      chosen.push(bj); covered = orInto(covered, sets[bj], W); left -= bg;
    }
    return chosen;
  }

  // exact = false: every vertex covered AT LEAST once (classic set cover)
  // exact = true : every vertex covered EXACTLY once (exact cover / perfect dominating set)
  // Branch and bound: branch on the uncovered vertex with the fewest options,
  // prune with ceil(uncovered / best single gain).
  function solve(cov, exact, nodeLimit) {
    nodeLimit = nodeLimit || 5e6;
    const { n, W, sets, coveredBy } = cov;
    let best = exact ? null : greedy(cov);
    let nodes = 0, aborted = false;

    function rec(covered, chosen, left) {
      if (aborted) return;
      if (++nodes > nodeLimit) { aborted = true; return; }
      if (left === 0) { if (!best || chosen.length < best.length) best = chosen.slice(); return; }

      let maxGain = 0;
      for (let j = 0; j < n; j++) {
        if (exact && !disjoint(sets[j], covered, W)) continue;
        const g = gain(sets[j], covered, W);
        if (g > maxGain) maxGain = g;
      }
      if (maxGain === 0) return;
      if (best && chosen.length + Math.ceil(left / maxGain) >= best.length) return;

      let e = -1, fewest = Infinity, eCands = null;
      for (let i = 0; i < n; i++) {
        if (hasBit(covered, i)) continue;
        const c = exact ? coveredBy[i].filter(j => disjoint(sets[j], covered, W)) : coveredBy[i];
        if (c.length < fewest) { fewest = c.length; e = i; eCands = c; if (fewest === 0) break; }
      }
      if (fewest === 0) return; // some vertex can no longer be covered (exactly once)

      const ranked = eCands.map(j => [j, gain(sets[j], covered, W)]).sort((a, b) => b[1] - a[1]);
      for (const [j, g] of ranked) {
        chosen.push(j);
        rec(orInto(covered, sets[j], W), chosen, left - g);
        chosen.pop();
      }
    }

    rec(new Uint32Array(W), [], n);
    return { solution: best, nodes, optimal: !aborted };
  }

  // Coverage count per vertex for a given set of facility indices.
  function coverCounts(cov, facilities) {
    const counts = new Array(cov.n).fill(0);
    for (const j of facilities) for (let i = 0; i < cov.n; i++) if (hasBit(cov.sets[j], i)) counts[i]++;
    return counts;
  }

  // ---------- instance generation ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomPoints(n, seed, minSep) {
    const rnd = mulberry32(seed);
    const pts = [];
    let tries = 0;
    while (pts.length < n && tries < n * 500) {
      tries++;
      const p = { x: Math.round((5 + rnd() * 90) * 10) / 10, y: Math.round((5 + rnd() * 90) * 10) / 10 };
      if (pts.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= minSep)) pts.push(p);
    }
    return pts;
  }

  // Full analysis of an instance.
  function analyze(points, R, nodeLimit) {
    const cov = buildCoverage(points, R);
    const g = greedy(cov);
    const atLeast = solve(cov, false, nodeLimit);
    const exactly = solve(cov, true, nodeLimit);
    const isolated = cov.coveredBy.filter(c => c.length === 1).length;
    return { cov, greedy: g, atLeast, exactly, isolated };
  }

  // Search seeds for a "tricky" instance:
  //  - exact (=1) is infeasible. (When sites = demand points, a feasible exact
  //    cover is always a minimum cover, so infeasibility is the only way =1 hurts.)
  //  - greedy is strictly worse than optimal (so "eyeballing" is likely to fail)
  //  - no isolated vertices (they make the answer obvious)
  function findTricky(opts) {
    const { n, R, startSeed, maxTries, requireGreedyGap, requireExactInfeasible, minSep } = opts;
    for (let t = 0; t < (maxTries || 400); t++) {
      const seed = (startSeed + t) >>> 0;
      const pts = randomPoints(n, seed, minSep || 0);
      if (pts.length < n) continue;
      const a = analyze(pts, R, 2e5);
      if (!a.atLeast.optimal || !a.exactly.optimal) continue;
      if (a.isolated > 0) continue;
      if (requireExactInfeasible && a.exactly.solution) continue;
      if (requireGreedyGap && a.greedy.length <= a.atLeast.solution.length) continue;
      return { seed, points: pts, analysis: a, tries: t + 1 };
    }
    return null;
  }

  const api = { buildCoverage, greedy, solve, coverCounts, randomPoints, analyze, findTricky, mulberry32 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SetCover = api;
})(this);
