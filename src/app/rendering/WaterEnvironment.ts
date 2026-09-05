import * as THREE from "three/webgpu";
import { abs, exp, float, max, mix, pow, smoothstep, vec3 } from "three/tsl";

type Node = THREE.TSL.ShaderNodeObject<THREE.Node>;

// Shared world-space studio sky for the visible background and water reflections.
// Procedural lighting keeps the demo self-contained, with no external HDR downloads.
export function waterEnvironment(direction: Node) {
  const sky = mix(vec3(0.72, 0.81, 0.9), vec3(0.16, 0.34, 0.62), smoothstep(0, 0.9, direction.y));
  const ground = vec3(0.4, 0.46, 0.51);
  const base = mix(ground, sky, smoothstep(-0.12, 0.12, direction.y));
  const sunDirection = vec3(-0.45, 0.75, 0.48).normalize();
  const key = exp(float(1).sub(max(direction.dot(sunDirection), 0)).mul(-95));
  // A sharp sun disc gives the water surface its specular glints.
  const sun = pow(max(direction.dot(sunDirection), 0), 900).mul(smoothstep(0, 0.05, direction.y));
  const strip = exp(abs(direction.x.add(0.4)).mul(-35))
    .mul(smoothstep(0.1, 0.3, direction.y)).mul(float(1).sub(smoothstep(0.8, 1, direction.y)));
  return base.add(vec3(1, 0.94, 0.84).mul(key.mul(3.5)))
    .add(vec3(1, 0.96, 0.88).mul(sun.mul(40)))
    .add(vec3(0.7, 0.86, 1).mul(strip.mul(0.65)));
}
