# Fluid Simulation TSL

## Demo

[https://shuya-tamaru.github.io/fluid-simulation-tsl/](https://shuya-tamaru.github.io/fluid-simulation-tsl/)

## WGSL version

https://github.com/shuya-tamaru/sph-wgsl

## Water rendering (Step 3)

The demo starts in **Water** mode. Use the bottom **Water → Particles** button
to switch without resetting the simulation. Particle mode retains its original
velocity colours and black background. Water uses a tiled floor and procedural
studio sky, with an initial camera angle that shows the surface and floor.

Water reads the same GPU position buffer as the particle view:

1. Nearest particle depth, followed by three bilateral-filter pairs.
2. Surface normals reconstructed from interpolated view-space depth.
3. Additive particle chord lengths, smoothed using surface depth as a guide.
4. Screen-space refraction (IOR 1.333), Beer-Lambert colour absorption and
   Schlick Fresnel reflections from a shared procedural environment.

The selector exposes **Surface**, **Normals**, **Depth**, and **Thickness**.
Water passes run at CSS-pixel resolution; the refraction background is captured
at drawing-buffer resolution. All targets resize with the viewport and are
released when particle-count changes rebuild the renderer. Count changes restart
the simulation, as before, and preserve the display mode. Water passes and the
studio stage are skipped in Particles mode.

Thickness is an overlapping-particle approximation. Refraction only samples the
visible scene, with foreground rejection and edge fading; reflection uses the
procedural sky, not ray-traced scene objects. Caustics, foam and underwater views
are not implemented. Sparse droplets and close silhouettes can retain particle
bumps. The projection assumes the application's perspective WebGPU camera.
