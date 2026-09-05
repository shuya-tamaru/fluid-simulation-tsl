import * as THREE from "three/webgpu";
import { Fn, float, floor, instanceIndex, vec3 } from "three/tsl";
import { Particles } from "../src/app/simulation/sph/Particles";
import { SPHConfig } from "../src/app/simulation/sph/SPHConfig";
import { BoundaryConfig } from "../src/app/simulation/boundaries/BoundaryConfig";
import { WhitewaterRenderer } from "../src/app/rendering/WhitewaterRenderer";

const output = document.querySelector("#result")!;
const renderer = new THREE.WebGPURenderer();
const report: string[] = [];
async function run() {
  const config = new SPHConfig();
  config.particleCount = 2048;
  const boundary = new BoundaryConfig();
  const particles = new Particles(renderer, config, boundary);
  await particles.initialize();
  const settings = { enabled: true, amount: 1 };
  const effects = new WhitewaterRenderer(particles, config, boundary, settings);
  // A compact block near the floor settles into a calm pool quickly.
  const initialize = Fn(() => {
    const i = float(instanceIndex);
    particles.getPositionsBuffer().element(instanceIndex).assign(vec3(
      i.mod(16).mul(0.45).sub(3.4),
      floor(i.div(256)).mul(0.45).sub(7.4),
      floor(i.div(16)).mod(16).mul(0.45).sub(3.4)
    ));
    particles.getVelocitiesBuffer().element(instanceIndex).assign(vec3(0));
  })().compute(config.particleCount);
  // Horizontally converging splash: opposing streams trap air (unlike a
  // uniform translation, which must not emit anything).
  const impulse = Fn(() => {
    const position = particles.getPositionsBuffer().element(instanceIndex);
    particles.getVelocitiesBuffer().element(instanceIndex).assign(vec3(
      position.x.mul(-1.5), 5, position.z.mul(-1.5)
    ));
  })().compute(config.particleCount);
  await renderer.computeAsync(initialize);
  const step = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await particles.compute();
      await effects.update(renderer);
    }
  };
  // Test-only buffer inspection; production does not read secondary particles back.
  const stats = async () => {
    const buffer = (effects as unknown as { states: { value: THREE.BufferAttribute } }).states.value;
    const data = new Float32Array(await renderer.getArrayBufferAsync(buffer));
    let spray = 0, foam = 0, bubble = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (![data[i], data[i + 1], data[i + 2], data[i + 3]].every(Number.isFinite)) throw new Error("Nonfinite state");
      if (data[i + 2] === 1) spray++;
      if (data[i + 2] === 2) foam++;
      if (data[i + 2] === 3) bubble++;
    }
    return { spray, foam, bubble, total: spray + foam + bubble };
  };
  const check = (condition: boolean, label: string, counts: unknown) => {
    report.push(`${condition ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(counts)}`);
    output.textContent = report.join("\n");
    if (!condition) throw new Error(label);
  };
  await step(120);
  settings.enabled = false;
  await step(1);
  settings.enabled = true;
  await step(30);
  let counts = await stats();
  check(counts.total <= 20, "Calm water emits nothing", counts);
  await renderer.computeAsync(impulse);
  await step(30);
  counts = await stats();
  check(counts.total > 0, "Converging splash emits whitewater", counts);
  await step(150);
  counts = await stats();
  check(counts.foam + counts.bubble > 0, "Whitewater rides the surface as foam", counts);
  settings.enabled = false;
  await step(1);
  counts = await stats();
  check(counts.total === 0, "Disable clears particles", counts);
  settings.enabled = true;
  await renderer.computeAsync(impulse);
  await step(30);
  counts = await stats();
  check(counts.total > 0, "Re-enable resumes emission", counts);
  effects.dispose();
  initialize.dispose(); impulse.dispose();
  output.textContent += "\nAll GPU lifecycle checks passed.";
}
run().catch(error => { output.textContent = report.join("\n") + "\nERROR: " + error; console.error(error); });
