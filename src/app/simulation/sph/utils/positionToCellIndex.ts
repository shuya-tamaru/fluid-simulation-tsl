import { clamp, Fn, int, vec3 } from "three/tsl";

// @ts-ignore
//prettier-ignore
export const positionToCellCoord = Fn(([position, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord]) => {
  const resolution = position
    .sub(vec3(xMinCoord, yMinCoord, zMinCoord))
    .div(cellSize)
    .toVar();
  const cx = resolution.x.floor();
  const cy = resolution.y.floor();
  const cz = resolution.z.floor();
  const cxc = clamp(cx, 0, int(cellCountX).sub(int(1)));
  const cyc = clamp(cy, 0, int(cellCountY).sub(int(1)));
  const czc = clamp(cz, 0, int(cellCountZ).sub(int(1)));
  const c = vec3(cxc, cyc, czc);

  return c;
});

// @ts-ignore
//prettier-ignore
export const coordToIndex = Fn(([c, cellCountX, cellCountY]) => {
  return c.x.add(c.y.mul(cellCountX)).add(c.z.mul(cellCountX.mul(cellCountY)));
});

// @ts-ignore
//prettier-ignore
export const positionToCellIndex = Fn(([position, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord]) => {
  // @ts-ignore
  const c = positionToCellCoord(position, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord)
  // @ts-ignore
  const index = coordToIndex(c, cellCountX, cellCountY)
  
  return index;
});
