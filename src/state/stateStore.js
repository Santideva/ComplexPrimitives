// File: src/state/stateStore.js

export const stateStore = {
    shapes: [],
    addShape(shape) {
      this.shapes.push(shape);
      console.log(`Shape with id ${shape.id} added. Total shapes: ${this.shapes.length}`);
    },
    getShapes() {
      return this.shapes;
    },
    clear() {
      this.shapes = [];
      console.log("State store cleared.");
    }
  };
  