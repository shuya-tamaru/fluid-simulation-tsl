import { float, Fn, vec3, clamp, mix, smoothstep } from "three/tsl";
import * as THREE from "three/webgpu";

export class ParticleHelper {
  static getColorByVelocity(
    speed: THREE.TSL.ShaderNodeObject<THREE.VarNode>,
    maxSpeed: number
  ) {
    // @ts-ignore
    return Fn(() => {
      const normalized = clamp(
        float(speed).div(float(maxSpeed)),
        float(0.0),
        float(1.0)
      ).toVar();

      const deep = vec3(0.0, 0.1, 0.9); // 遅いときの色（濃い青）
      const foam = vec3(1.0); // 速いときの色（白）

      // グラデーション幅を狭くする閾値
      const thresholdStart = float(0.1);
      const thresholdEnd = float(1); // ←幅わずか 0.07

      // ふんわり切り替え
      const t = smoothstep(thresholdStart, thresholdEnd, normalized);
      const mixColor = mix(deep, foam, t);

      return mixColor;
    });
  }
}
