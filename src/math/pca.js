// ─── RANDOM / DATA GENERATION ────────────────────────────────────────────────

export function seededRandom(seed) {
  let x = seed;
  return () => {
    x = Math.sin(x) * 10000;
    return x - Math.floor(x);
  };
}

export function randNormal(r) {
  let u = 0, v = 0;
  while (!u) u = r();
  while (!v) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Generate centered 2D correlated data */
export function generateData2D(n = 120, seed = 42) {
  const r = seededRandom(seed);
  const rn = () => randNormal(r);
  const raw = Array.from({ length: n }, () => {
    const t = rn();
    return { x: t, y: 0.75 * t + 0.22 * rn() };
  });
  const mx = raw.reduce((s, p) => s + p.x, 0) / n;
  const my = raw.reduce((s, p) => s + p.y, 0) / n;
  return raw.map((p) => ({ x: p.x - mx, y: p.y - my }));
}

// ─── BASIC STATISTICS ────────────────────────────────────────────────────────

export function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function varianceOf(arr) {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

// ─── 2D PCA (analytic — no library needed) ───────────────────────────────────

/**
 * Compute PCA for an array of {x, y} points.
 * Assumes data is already mean-centered.
 * Returns { pc1Var, pc2Var, totalVar, idealAngle }
 */
export function computePCA2D(pts) {
  const n = pts.length;
  const cxx = pts.reduce((s, p) => s + p.x * p.x, 0) / n;
  const cyy = pts.reduce((s, p) => s + p.y * p.y, 0) / n;
  const cxy = pts.reduce((s, p) => s + p.x * p.y, 0) / n;
  const tr = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  const ex = l1 - cyy, ey = cxy;
  const len = Math.sqrt(ex * ex + ey * ey) || 1;
  const angle = (Math.atan2(ey / len, ex / len) * 180 / Math.PI + 360) % 180;
  return { pc1Var: l1, pc2Var: l2, totalVar: cxx + cyy, idealAngle: angle };
}

/** Project {x,y} points onto a rotated 2D frame */
export function projectPoints2D(pts, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return pts.map((p) => ({
    pc1: p.x * cos + p.y * sin,
    pc2: -p.x * sin + p.y * cos,
  }));
}

// ─── 3D PCA (power-iteration eigenvectors) ────────────────────────────────────

/**
 * Compute PCA for an array of {x, y, z} points.
 * Returns:
 *   mean3:     [mx, my, mz]
 *   covMatrix: [[...],[...],[...]]  — 3×3 covariance matrix
 *   eigenvectors: [v1, v2, v3]     — each vi = [vx, vy, vz], sorted desc by eigenvalue
 *   eigenvalues:  [l1, l2, l3]     — sorted descending
 *   totalVar
 */
export function computePCA3D(pts) {
  const n = pts.length;
  const mx = mean(pts.map((p) => p.x));
  const my = mean(pts.map((p) => p.y));
  const mz = mean(pts.map((p) => p.z));
  const centered = pts.map((p) => ({ x: p.x - mx, y: p.y - my, z: p.z - mz }));

  // 3×3 covariance (symmetric)
  const cov = (a, b) => centered.reduce((s, p) => s + p[a] * p[b], 0) / n;
  const C = [
    [cov("x","x"), cov("x","y"), cov("x","z")],
    [cov("y","x"), cov("y","y"), cov("y","z")],
    [cov("z","x"), cov("z","y"), cov("z","z")],
  ];

  // Jacobi eigendecomposition for 3×3 symmetric matrices
  const { eigenvalues, eigenvectors } = jacobiEigen3(C);

  // Sort descending by eigenvalue
  const order = [0, 1, 2].sort((a, b) => eigenvalues[b] - eigenvalues[a]);
  return {
    mean3: [mx, my, mz],
    covMatrix: C,
    eigenvectors: order.map((i) => eigenvectors[i]),
    eigenvalues:  order.map((i) => eigenvalues[i]),
    totalVar: eigenvalues.reduce((s, v) => s + v, 0),
    centeredPts: centered,
  };
}

/**
 * Jacobi eigendecomposition for a real 3×3 symmetric matrix.
 * Returns { eigenvalues: [l0,l1,l2], eigenvectors: [[v0],[v1],[v2]] }
 * each eigenvector is a [3] array (column of V).
 */
function jacobiEigen3(A) {
  const N = 3;
  // Copy A into a mutable array
  let a = A.map((r) => [...r]);
  // V starts as identity
  let v = [[1,0,0],[0,1,0],[0,0,1]];

  for (let iter = 0; iter < 50; iter++) {
    // Find largest off-diagonal element
    let p = 0, q = 1, max = Math.abs(a[0][1]);
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (Math.abs(a[i][j]) > max) { max = Math.abs(a[i][j]); p = i; q = j; }
      }
    }
    if (max < 1e-10) break;

    // Compute rotation angle
    const theta = 0.5 * Math.atan2(2 * a[p][q], a[p][p] - a[q][q]);
    const cos = Math.cos(theta), sin = Math.sin(theta);

    // Apply Jacobi rotation to a
    const newA = a.map((r) => [...r]);
    for (let i = 0; i < N; i++) {
      if (i !== p && i !== q) {
        newA[i][p] = cos * a[i][p] + sin * a[i][q];
        newA[p][i] = newA[i][p];
        newA[i][q] = -sin * a[i][p] + cos * a[i][q];
        newA[q][i] = newA[i][q];
      }
    }
    newA[p][p] = cos*cos*a[p][p] + 2*sin*cos*a[p][q] + sin*sin*a[q][q];
    newA[q][q] = sin*sin*a[p][p] - 2*sin*cos*a[p][q] + cos*cos*a[q][q];
    newA[p][q] = 0; newA[q][p] = 0;
    a = newA;

    // Apply same rotation to eigenvector matrix
    const newV = v.map((r) => [...r]);
    for (let i = 0; i < N; i++) {
      newV[i][p] =  cos * v[i][p] + sin * v[i][q];
      newV[i][q] = -sin * v[i][p] + cos * v[i][q];
    }
    v = newV;
  }

  return {
    eigenvalues:  [a[0][0], a[1][1], a[2][2]],
    // eigenvectors[i] = column i of V = [v[0][i], v[1][i], v[2][i]]
    eigenvectors: [0,1,2].map((i) => [v[0][i], v[1][i], v[2][i]]),
  };
}

/** Project 3D {x,y,z} points onto the top-k eigenvectors */
export function projectPoints3D(pts, eigenvectors, k = 2) {
  return pts.map((p) => {
    const coords = eigenvectors.slice(0, k).map(([vx, vy, vz]) =>
      p.x * vx + p.y * vy + p.z * vz
    );
    return { pc1: coords[0] ?? 0, pc2: coords[1] ?? 0, pc3: coords[2] ?? 0 };
  });
}
