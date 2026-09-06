import * as THREE from 'three/webgpu';
import { Fn, If, atomicStore, float, instancedArray, instanceIndex, int, vec3, vec4 } from 'three/tsl';
import { computeDensityPass } from '../src/app/simulation/sph/calcutate/density';
import { computePressureForcePass } from '../src/app/simulation/sph/calcutate/pressureForce';
import { computeViscosityPass } from '../src/app/simulation/sph/calcutate/viscosity';
import { CELL_SCAN_BLOCK_SIZE, computeCellBlockSumsPass, computeBlockedCellStartsPass } from '../src/app/simulation/sph/calcutate/cellStartIndices';
import { Particles } from '../src/app/simulation/sph/Particles';
import { SPHConfig } from '../src/app/simulation/sph/SPHConfig';
import { BoundaryConfig } from '../src/app/simulation/boundaries/BoundaryConfig';
const out = document.querySelector('#result')!;
const messages: string[] = [];
function check(ok: boolean, label: string) {
  console.info(`${ok ? "PASS" : "FAIL"} ${label}`);
  messages.push(`${ok ? 'PASS' : 'FAIL'} ${label}`); out.textContent = messages.join('\n');
  if (!ok) throw new Error(label);
}
async function run() {
  const renderer = new THREE.WebGPURenderer(); await renderer.init();
  for (const size of [1, 255, 256, 257, 32000]) {
    const blockCount = Math.ceil(size / CELL_SCAN_BLOCK_SIZE);
    const scanCounts = instancedArray(size, 'int').toAtomic();
    const scanStarts = instancedArray(size, 'int');
    const sums = instancedArray(blockCount, 'int');
    const initCounts = Fn(() => {
      If(instanceIndex.lessThan(size), () => {
        atomicStore(scanCounts.element(instanceIndex), int(instanceIndex.mod(7)));
      });
    })().compute(size);
    const passes = [initCounts,
      computeCellBlockSumsPass(scanCounts, sums, size)().compute(blockCount),
      computeBlockedCellStartsPass(scanStarts, scanCounts, sums, size)().compute(blockCount)];
    await renderer.computeAsync(passes);
    const values = new Int32Array(await renderer.getArrayBufferAsync(scanStarts.value));
    let sum = 0, valid = true;
    for (let i = 0; i < size; i++) { valid &&= values[i] === sum; sum += i % 7; }
    check(valid, `Blocked prefix matches CPU at ${size} cells`);
    passes.forEach(pass => pass.dispose());
    scanCounts.dispose(); scanStarts.dispose(); sums.dispose();
  }
  const config = new SPHConfig();
  const p = instancedArray(4, 'vec3'), v = instancedArray(4, 'vec3'), rho = instancedArray(4, 'float');
  const pressures = instancedArray(4, 'float'), force = instancedArray(4, 'vec3');
  const starts = instancedArray(1, 'int'), counts = instancedArray(1, 'int').toAtomic();
  const packed = instancedArray(4, 'vec4');
  const init = Fn(() => {
    If(instanceIndex.lessThan(4), () => {
    const x = float(instanceIndex.mod(2)).mul(0.2).sub(0.1);
    const y = float(instanceIndex.div(2)).floor().mul(0.2).sub(0.1);
    p.element(instanceIndex).assign(vec3(x, y, 0));
    v.element(instanceIndex).assign(vec3(x.mul(3), y.mul(3), 0));
    pressures.element(instanceIndex).assign(10);
    If(instanceIndex.equal(0), () => { starts.element(0).assign(0); atomicStore(counts.element(0), int(4)); });
    });
  })().compute(4);
  await renderer.computeAsync(init);
  const actualPositions = new Float32Array(await renderer.getArrayBufferAsync(p.value));
  const actualCounts = new Int32Array(await renderer.getArrayBufferAsync(counts.value));
  await renderer.computeAsync(computeDensityPass(p, rho, starts, counts, config.poly6Kernel, config.h2,
    config.h6, config.mass, 1, 1, 1, 1, -0.5, -0.5, -0.5, 4)().compute(4));
  const density = new Float32Array(await renderer.getArrayBufferAsync(rho.value));
  out.textContent = `density=${[...density]}\n`;
  const expected = config.mass * config.poly6Kernel * (config.h6 + 2 * (config.h2 - 0.04) ** 3 + (config.h2 - 0.08) ** 3);
  check([...density].every(x => Math.abs(x - expected) < 1e-5), `Density includes neighbours before AND after self (actual=${[...density]}, expected=${expected}, positions=${[...actualPositions]}, counts=${[...actualCounts]})`);
  await renderer.computeAsync(computePressureForcePass(p, rho, pressures, force, starts, counts, config.mass,
    config.h, config.h2, config.spiky, 1, 1, 1, 1, -0.5, -0.5, -0.5, 4)().compute(4));
  const capture = Fn(() => { If(instanceIndex.lessThan(4), () => { packed.element(instanceIndex).assign(vec4(force.element(instanceIndex), 0)); }); })().compute(4);
  await renderer.computeAsync(capture);
  let data = new Float32Array(await renderer.getArrayBufferAsync(packed.value));
  const sum = [0, 0, 0]; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) sum[j] += data[i * 4 + j];
  check(sum.every(x => Math.abs(x) < 1e-4) && Math.abs(data[0]) > 0.01, 'Symmetric pressure has zero net internal force');
  await renderer.computeAsync(computeViscosityPass(p, v, rho, force, starts, counts, config.viscosity,
    config.viscosityMu, config.h, config.h2, config.mass, 1, 1, 1, 1, -0.5, -0.5, -0.5, 4)().compute(4));
  await renderer.computeAsync(capture);
  data = new Float32Array(await renderer.getArrayBufferAsync(packed.value));
  const expectedForce = config.viscosityMu * config.mass ** 2 / expected * 0.6 * config.viscosity
    * ((config.h - 0.2) + (config.h - Math.sqrt(0.08)));
  check(Math.abs(data[0] - expectedForce) < 1e-5, 'Viscosity force includes receiving particle mass');

  config.particleCount = 4;
  const simulation = new Particles(renderer, config, new BoundaryConfig());
  await simulation.initialize();
  await renderer.computeAsync(Fn(() => {
    If(instanceIndex.lessThan(4), () => {
    simulation.getPositionsBuffer().element(instanceIndex).assign(vec3(float(instanceIndex).mul(2).sub(6), 0, 0));
    simulation.getVelocitiesBuffer().element(instanceIndex).assign(vec3(65, 0, 0));
    });
  })().compute(4));
  for (let tick = 0; tick < 3; tick++) await simulation.compute();
  await renderer.computeAsync(Fn(() => { If(instanceIndex.lessThan(4), () => { packed.element(instanceIndex).assign(vec4(simulation.getPositionsBuffer().element(instanceIndex), 0)); }); })().compute(4));
  data = new Float32Array(await renderer.getArrayBufferAsync(packed.value));
  const grid = simulation.getGridParams();
  const gridStarts = new Int32Array(await renderer.getArrayBufferAsync(simulation.getCellStartIndicesBuffer().value));
  let membership = true;
  for (let i = 0; i < 4; i++) {
    const x = Math.floor((data[4 * i] - grid.xMinCoord) / grid.cellSize);
    const y = Math.floor((data[4 * i + 1] - grid.yMinCoord) / grid.cellSize);
    const z = Math.floor((data[4 * i + 2] - grid.zMinCoord) / grid.cellSize);
    const cell = x + y * grid.cellCountX + z * grid.cellCountX * grid.cellCountY;
    membership &&= gridStarts[cell] <= i && i < (gridStarts[cell + 1] ?? 4);
  }
  check(membership, 'Hash membership matches integrated particle positions');
  out.textContent += '\nAll GPU regression checks passed.';
  renderer.dispose();
}
run().catch(error => { out.textContent = messages.join('\n') + '\nERROR: ' + error; console.error(error); });
