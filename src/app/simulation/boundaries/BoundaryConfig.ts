import { uniform } from "three/tsl";

export class BoundaryConfig {
  width = uniform(32);
  height = uniform(16);
  depth = uniform(16);
}
