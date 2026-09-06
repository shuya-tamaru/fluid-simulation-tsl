# Fluid Simulation TSL

## Demo

[https://shuya-tamaru.github.io/fluid-simulation-tsl/](https://shuya-tamaru.github.io/fluid-simulation-tsl/)

## WGSL version

https://github.com/shuya-tamaru/sph-wgsl

## Water and whitewater

Water is the default display. The bottom switch returns to the original particle
view; **Splash** adds a localized impulse, and **Box Width (piston)** pushes the
right wall to generate a wave. Particle count changes restart the simulation.
The frame is hidden in Water by default; **Show frame in Water** restores it.
Particles view always shows the frame. **Top collision** starts enabled; disabling
it opens only the top for both fluid and whitewater, and can be re-enabled live.
The spatial hash clamps out-of-grid particles to edge cells while retaining real
positions for distance tests; many particles above the box can increase search cost.

Comparison controls:

- **Water → Surface preset**: Detailed uses narrower depth filtering (0.48 world
  radius, 0.32 depth tolerance, two separable iterations). Reference restores the
  previous 0.65 / 0.55 / three-iteration surface settings, on the same simulation.
- **Whitewater → Appearance**: Refined combines additive optical-depth splats for
  fine spray/foam/bubbles with refractive, reflective resolved droplets. Reference
  uses the previous opaque-sphere whitewater appearance.
- **Motion**: viscosity and bulk damping are adjustable independently of shading.
- **Water display**: Surface, Normals, Depth and Thickness diagnostics.

The simulation runs at a fixed 1/60-second tick with two pressure substeps.
Rendering at 30, 60, 120 or 144 Hz does not change simulated time. Catch-up is
bounded to three ticks per rendered frame; under sustained overload simulation
slows rather than creating an unbounded backlog. Hidden-tab elapsed time is
ignored. Whitewater advances by the simulated interval once per rendered frame.

Density and pressure iterate over all neighbours while skipping self; viscosity
stores force consistently with the integrator's division by particle mass. The
spatial hash and densities are refreshed after integration, before whitewater
classification; the next substep reuses that valid snapshot instead of rebuilding
it twice. The cell prefix sum uses two GPU dispatches over 256-cell blocks,
including partial blocks. Ordered solver passes share one compute submission per
tick. Whitewater skips neighbourhood work when density rules out a surface normal
or kinetic energy rules out emission. These skips preserve the existing emission
thresholds, particle budget, update rate and rendering settings. Solver compute nodes are cached until configuration or buffers
change. Secondary emission uses bounded unique tickets and never overwrites a
living particle. Padded workgroup invocations are guarded in source-particle
initialization and emission.

The diffuse model is based on
[Ihmsen et al., Unified Spray, Foam and Bubbles for Particle-Based Fluids](https://cg.informatik.uni-freiburg.de/publications/2012_CGI_sprayFoamBubbles.pdf).
Rendering is a real-time approximation: accumulated screen-space optical depth
uses a nearest-depth representative, not a fully integrated 3D volume. Refraction
samples the visible scene; reflections use a procedural environment. Resolved
droplets sample the already-composited framebuffer, without multiple refraction
between droplets. Caustics, underwater views and full volumetric scattering are
not implemented. Thin silhouettes can still reveal the particle resolution.

The pre-improvement implementation is preserved in git at `4f3e1b7`. Reference
controls compare appearance; they deliberately do not reintroduce solver bugs.

## Validation

- `npm run build`: TypeScript and Vite production build.
- `node --test tests/timing.test.mjs` (Node with TypeScript stripping): refresh-rate
  independence, bounded catch-up, and visibility reset.
- With the dev server running, open `/tests/solver.html`: GPU density against a CPU
  reference, pressure symmetry, viscosity force scaling and final hash membership
  across repeated ticks. Block prefix sums are checked against the CPU at 1, 255,
  256, 257 and 32,000 cells.
- Open `/tests/whitewater.html`: a stationary fluid snapshot isolates emission,
  advection/classification, disable/clear and re-enable behaviour from solver waves.
  These pages use GPU readback only for testing; the normal app does not.

- Open `/tests/performance.html` for a fixed-workload benchmark (30,000 particles,
  1280×720, DPR 1). It warms up shaders, measures 60 iterations per stage, and
  waits for GPU completion. Stages cover the solver, whitewater on a frozen fluid
  snapshot, rendering, and combined fixed frames. Run with other GPU workloads
  closed; results are workload timings rather than RAF/display FPS. Stage times
  should not be added together: fluid/whitewater state evolves between stages.

A local before/after sample of that workload (same 30,000-particle and rendering
settings) measured 13.67 → 1.37 ms per solver tick and 14.27 → 8.40 ms per combined
fixed frame after the scan/cache/submission optimizations. These are single-run
observations, not a display-FPS guarantee; GPU contention and evolving particle
state affect results. Rendering itself remains a significant part of the cost.

- Open `/tests/boundaries.html` to check live top-collision toggling for fluid and
  whitewater while keeping floor and side collisions enabled.

Detached droplets preserve their unsmoothed depth and interpolated sphere normals.
A density-based weight (0.25–0.65) blends back into reconstructed fluid normals;
the weight and normal reuse the existing depth target's unused channels. This
avoids flattening small drops with the surface filter and deriving their Fresnel
reflection from a distorted depth slope. Physical grazing-angle reflections remain.
Open `/tests/droplets.html` for a static visual check of isolated drops, overlapping
drops, and a dense cluster in Surface and Normals views.
