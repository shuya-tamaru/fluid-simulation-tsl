import { uniform } from "three/tsl";

export class BoundaryConfig {
  width = uniform(16);
  height = uniform(16);
  depth = uniform(10);
  // The left wall never moves; the width slider pushes the right wall only,
  // acting like a wave-making piston. Box X range is [xMin, xMin + width].
  readonly xMin = -8;
  // Slider maxima: the spatial-hash grid is built once to cover these, so
  // every reachable box size stays inside the neighbour grid.
  readonly maxWidth = 32;
  readonly maxHeight = 16;
  readonly maxDepth = 32;
}
