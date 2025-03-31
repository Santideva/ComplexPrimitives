// File: src/rendering/LightingManager.js
import * as THREE from "three";

export class LightingManager {
  constructor(scene) {
    this.scene = scene;

    // Example: add an ambient light and a directional light
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    this.directionalLight.position.set(10, 10, 10);

    this.scene.add(this.ambientLight);
    this.scene.add(this.directionalLight);
  }

  setAmbientIntensity(intensity) {
    this.ambientLight.intensity = intensity;
  }

  setDirectionalIntensity(intensity) {
    this.directionalLight.intensity = intensity;
  }
}
