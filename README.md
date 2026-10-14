# Facility Set Cover

An interactive teaching tool for the vertex-restricted facility location / set cover problem:
facilities may only be opened on vertices, and a facility covers every vertex within Euclidean distance R.

- **Challenge mode:** students place facilities by clicking. Answers stay hidden until revealed.
- **Exact solvers in the browser:** branch and bound for "covered ≥ 1" (set cover) and "covered = 1" (exact cover).
- **Greedy comparison:** shows where the "cover the most first" rule is suboptimal.
- **Find tricky instance:** searches random layouts until "= 1" is infeasible *and* greedy is not optimal.
- **Edit vertices:** add, drag and delete points, or paste coordinates.
- **Exports:** CPLEX-LP models (both variants), the coverage matrix `a_ij` and the distance matrix as CSV.
- **Share links:** the instance is stored in the URL. Add `&reveal=1` to share an answer key.

## Run locally

It's a static site with no build step. Open `index.html` in a browser.

## Deploy (GitHub → Vercel)

1. Push this repo to GitHub.
2. On vercel.com, click **Add New → Project** and import the repo.
3. Set Framework Preset to **Other** and leave the Build Command and Output Directory empty. Then click **Deploy**.

Every push to `main` redeploys automatically.

## Note on "= 1"

When the candidate sites are the vertices themselves, a feasible exact cover is always a *minimum* cover.
If E covers every vertex exactly once, the neighbourhoods N[e] for e ∈ E are disjoint. Any cover D must hit each one, so |D| ≥ |E|.
So in this model the equality constraint can't make the answer more expensive. It either changes nothing or makes the model infeasible.
