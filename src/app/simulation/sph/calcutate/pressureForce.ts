import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";
import {
  atomicLoad,
  clamp,
  float,
  Fn,
  If,
  instanceIndex,
  int,
  Loop,
  max,
  vec3,
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
  spiky: number,
  cellSize: number,
  cellCountX: number,
  cellCountY: number,
  cellCountZ: number,
  xMinCoord: number,
  yMinCoord: number,
  zMinCoord: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pressureForce_i = pressureForcesBuffer.element(instanceIndex);
    const pressure_i = pressuresBuffer.element(instanceIndex);
    const pos_i = positionsBuffer.element(instanceIndex);
    const density_i = max(
      densitiesBuffer.element(instanceIndex),
      float(1e-8)
    ).toVar();
    const pForce_i = vec3(0, 0, 0).toVar();

    // @ts-ignore
    //prettier-ignore
    const cc = positionToCellCoord(pos_i, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord);

    const dz = int(-1).toVar();
    Loop(dz.lessThanEqual(1), () => {
      const zc = clamp(cc.z.add(dz), int(0), int(cellCountZ).sub(int(1)));
      const dy = int(-1).toVar();
      Loop(dy.lessThanEqual(1), () => {
        const yc = clamp(cc.y.add(dy), int(0), int(cellCountY).sub(int(1)));
        const dx = int(-1).toVar();
        Loop(dx.lessThanEqual(1), () => {
          const xc = clamp(cc.x.add(dx), int(0), int(cellCountX).sub(int(1)));
          // @ts-ignore
          //prettier-ignore
          const cellIndex = coordToIndex(vec3(xc, yc, zc), cellCountX, cellCountY)
          const start = cellStartIndicesBuffer.element(cellIndex).toVar();
          const count = atomicLoad(cellCountsBuffer.element(cellIndex)).toVar();
          const end = start.add(count).toVar();
          let j = int(start).toVar();

          Loop(j.lessThan(end).and(j.notEqual(instanceIndex)), () => {
            If(j.notEqual(instanceIndex), () => {
              const pos_j = positionsBuffer.element(j);
              const dir = pos_j.sub(pos_i).toVar();
              const r = dir.length().toVar();
              If(r.greaterThan(float(0.001)).and(r.lessThan(h)), () => {
                const t = float(h).sub(r).toVar();
                const density_j = densitiesBuffer.element(j);
                const invR = float(1.0)
                  .div(max(r, float(1e-6)))
                  .toVar();
                const _dir = dir.mul(invR).toVar();
                const gradW = float(spiky).mul(t.mul(t)).mul(_dir).toVar();
                const rhoj = max(density_j, float(1e-8)).toVar();
                const press_j = pressuresBuffer.element(j);
                const term = pressure_i
                  .div(density_i.mul(density_i))
                  .add(press_j.div(rhoj.mul(rhoj)))
                  .toVar();
                const fi = float(mass)
                  .mul(float(mass))
                  .mul(term)
                  .mul(gradW)
                  .toVar();
                pForce_i.addAssign(fi);
              });
            });

            j.addAssign(int(1));
          });
          dx.addAssign(int(1));
        });
        dy.addAssign(int(1));
      });
      dz.addAssign(int(1));
    });

    pressureForce_i.assign(pForce_i);
  });
}
