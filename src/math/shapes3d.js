import { seededRandom, randNormal } from "./pca.js";

// All shapes are intentionally offset from (0,0,0) to show why mean-centering matters.

const OFFSET = { x: 4, y: 3, z: 2 }; // consistent shift applied to all shapes

/**
 * Helix — points spiral along the z-axis.
 * Strong variance along the helical axis (z) and in the xy plane.
 */
export function generateHelix(n = 200, seed = 11) {
  const r = seededRandom(seed);
  const rn = () => randNormal(r);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 4 * Math.PI;
    pts.push({
      x: Math.cos(t) * 1.5 + rn() * 0.15 + OFFSET.x,
      y: Math.sin(t) * 1.5 + rn() * 0.15 + OFFSET.y,
      z: t * 0.5 + rn() * 0.12 + OFFSET.z,
    });
  }
  return pts;
}

/**
 * Flat disc (pancake) — points lie in a thin disc in the xy plane.
 * Very small variance in z, large in x and y.
 */
export function generateDisc(n = 200, seed = 22) {
  const r = seededRandom(seed);
  const rn = () => randNormal(r);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const angle = r() * 2 * Math.PI;
    const radius = Math.sqrt(r()) * 2.5; // uniform in area
    pts.push({
      x: radius * Math.cos(angle) + rn() * 0.1 + OFFSET.x,
      y: radius * Math.sin(angle) * 0.6 + rn() * 0.1 + OFFSET.y, // slightly elliptical
      z: rn() * 0.18 + OFFSET.z,
    });
  }
  return pts;
}

/**
 * Two clusters — two well-separated Gaussian blobs.
 * The between-cluster axis becomes PC1 after centering.
 */
export function generateClusters(n = 200, seed = 33) {
  const r = seededRandom(seed);
  const rn = () => randNormal(r);
  const half = Math.floor(n / 2);
  const pts = [];
  // Cluster A
  for (let i = 0; i < half; i++) {
    pts.push({
      x: rn() * 0.5 - 2.0 + OFFSET.x,
      y: rn() * 0.5 + 1.0 + OFFSET.y,
      z: rn() * 0.5 - 0.5 + OFFSET.z,
    });
  }
  // Cluster B
  for (let i = 0; i < n - half; i++) {
    pts.push({
      x: rn() * 0.5 + 2.0 + OFFSET.x,
      y: rn() * 0.5 - 1.0 + OFFSET.y,
      z: rn() * 0.5 + 0.5 + OFFSET.z,
    });
  }
  return pts;
}

export const SHAPES = {
  helix:    { label: "Helix",         generate: generateHelix,    description: "A spiral — strong variance along the helical axis." },
  disc:     { label: "Flat disc",     generate: generateDisc,     description: "A pancake — almost all variance in the flat plane, nearly zero along the thin axis." },
  clusters: { label: "Two clusters",  generate: generateClusters, description: "Two blobs — the axis separating clusters becomes PC1." },
};
