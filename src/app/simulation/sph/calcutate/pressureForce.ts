import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";
import {
  atomicLoad,
  dot,
  float,
  Fn,
  If,
  instanceIndex,
  int,
  Loop,
  max,
  vec3,
  inverseSqrt,
} from "three/tsl";
import {
  coordToIndex,
  positionToCellCoord,
} from "../utils/positionToCellIndex";

export function computePressureForcePass(
  positionsBuffer: StorageBufferType,
  densitiesBuffer: StorageBufferType,
  pressuresBuffer: StorageBufferType,
  pressureForcesBuffer: StorageBufferType,
  cellStartIndicesBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType,
  mass: number,
  h: number,
  h2: number,
  spiky: number,
  cellSize: number,
  cellCountX: number,
  cellCountY: number,
  cellCountZ: number,
  xMinCoord: number,
  yMinCoord: number,
  zMinCoord: number,
  particleCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const i = instanceIndex.toVar();
    If(i.lessThan(particleCount), () => {
      const pressureForce_i = pressureForcesBuffer.element(i);
      const pressure_i = pressuresBuffer.element(i);
      const pos_i = positionsBuffer.element(i);
      const rho_i = max(densitiesBuffer.element(i), float(1e-8));
      const pForce_i = vec3(0, 0, 0).toVar();

      // @ts-ignore
      //prettier-ignore
      const cc = positionToCellCoord(pos_i, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord);

      const dz = int(-1).toVar();
      Loop(dz.lessThanEqual(1), () => {
        const zTarget = cc.z.add(dz);
        const dy = int(-1).toVar();
        Loop(dy.lessThanEqual(1), () => {
          const yTarget = cc.y.add(dy);
          const dx = int(-1).toVar();
          Loop(dx.lessThanEqual(1), () => {
            const xTarget = cc.x.add(dx);

            const isValidCell = xTarget
              .greaterThanEqual(0)
              .and(xTarget.lessThan(cellCountX))
              .and(yTarget.greaterThanEqual(0))
              .and(yTarget.lessThan(cellCountY))
              .and(zTarget.greaterThanEqual(0))
              .and(zTarget.lessThan(cellCountZ));

            If(isValidCell, () => {
              // @ts-ignore
              //prettier-ignore
              const cellIndex = coordToIndex(vec3(xTarget, yTarget, zTarget), cellCountX, cellCountY);
              const start = cellStartIndicesBuffer.element(cellIndex).toVar();
              const count = atomicLoad(cellCountsBuffer.element(cellIndex));
              const end = start.add(count).toVar();
              let j = int(start).toVar();

              Loop(j.lessThan(end).and(j.notEqual(i)), () => {
                const pos_j = positionsBuffer.element(j);
                const dir = pos_i.sub(pos_j).toVar();
                const r = dir.length().toVar();
                const r2 = dot(dir, dir);
                If(r2.lessThan(h2), () => {
                  const invR = inverseSqrt(max(r2, float(1e-8).mul(h2)));
                  const t = float(h).sub(r).toVar();
                  If(t.greaterThan(float(0.0)), () => {
                    const _dir = dir.mul(invR).toVar();
                    const gradW = float(spiky).mul(t.mul(t)).mul(_dir);
                    const density_j = densitiesBuffer.element(j);
                    const rho_j = max(density_j, float(1e-8));
                    const press_j = pressuresBuffer.element(j);
                    const term = pressure_i
                      .div(rho_i.mul(rho_i))
                      .add(press_j.div(rho_j.mul(rho_j)))
                      .toVar();
                    const fi = float(-1.0).mul(
                      float(mass).mul(float(mass)).mul(term).mul(gradW)
                    );

                    pForce_i.addAssign(fi);
                  });
                });
                j.addAssign(int(1));
              });
            });
            dx.addAssign(int(1));
          });
          dy.addAssign(int(1));
        });
        dz.addAssign(int(1));
      });

      pressureForce_i.assign(pForce_i);
    });
  });
}
