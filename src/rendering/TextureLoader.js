// File: src/rendering/TextureLoader.js
import * as THREE from "three";

export class TextureLoader {
  constructor() {
    this.loader = new THREE.TextureLoader();
    this.cache = new Map();
  }

  loadTexture(url) {
    if (this.cache.has(url)) {
      return this.cache.get(url);
    }
    const texture = this.loader.load(url);
    this.cache.set(url, texture);
    return texture;
  }
}
