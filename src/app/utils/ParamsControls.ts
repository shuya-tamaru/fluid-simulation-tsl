import * as THREE from "three/webgpu";
import GUI from "lil-gui";
import type { BoxBoundary } from "../simulation/boundaries/BoxBoundary";

export class ParamsControls {
  private gui: GUI;
  private boxBoundary: BoxBoundary;

  constructor(boxBoundary: BoxBoundary) {
    this.gui = new GUI();
    this.boxBoundary = boxBoundary;
    this.initialize();
  }

  initialize() {
    this.gui
      .add(this.boxBoundary.getSizes(), "width", 10, 100, 1)
      .name("Box Width")
      .onChange((value: number) => {
        this.boxBoundary.updateSizes(
          value,
          this.boxBoundary.getSizes().height,
          this.boxBoundary.getSizes().depth
        );
      });
    this.gui
      .add(this.boxBoundary.getSizes(), "depth", 10, 100, 1)
      .name("Box Depth")
      .onChange((value: number) => {
        this.boxBoundary.updateSizes(
          this.boxBoundary.getSizes().width,
          this.boxBoundary.getSizes().height,
          value
        );
      });
  }
}
