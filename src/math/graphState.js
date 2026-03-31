const N = 10;

function makeInitialNodes() {
  const r = 0.34;
  return Array.from({ length: N }, (_, i) => {
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    return { id: i + 1, nx: 0.5 + r * Math.cos(angle), ny: 0.5 + r * Math.sin(angle) };
  });
}

export const INITIAL_GRAPH = { nodes: makeInitialNodes(), edges: [] };
