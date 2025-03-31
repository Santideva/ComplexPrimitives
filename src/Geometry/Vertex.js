// File: src/geometry/Vertex.js

let vertexCounter = 0;

export class Vertex {
    constructor({ position = { x: 0, y: 0 }, color = { h: 0, s: 1, l: 0.5, a: 1 } } = {}) {
      this.id = ++vertexCounter;        
      this.position = position; // Metric component
      this.color = color;       // Color component in HSLA or another color space
    }
  
    // Apply a 2D transformation (for example)
    transform(matrix) {
      const { x, y } = this.position;
      const newX = matrix.a * x + matrix.b * y + (matrix.tx || 0);
      const newY = matrix.c * x + matrix.d * y + (matrix.ty || 0);
      this.position = { x: newX, y: newY };
    }
  }
  