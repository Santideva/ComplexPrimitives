// File: src/geometry/Face.js

let faceCounter = 0;

export class Face {
  constructor(vertices = []) {
    this.id = ++faceCounter;
    this.vertices = vertices;
  }

  getFaceColor() {
    const total = this.vertices.length;
    const blended = this.vertices.reduce(
      (acc, vertex) => {
        acc.h += vertex.color.h;
        acc.s += vertex.color.s;
        acc.l += vertex.color.l;
        acc.a += vertex.color.a;
        return acc;
      },
      { h: 0, s: 0, l: 0, a: 0 }
    );
    return {
      h: blended.h / total,
      s: blended.s / total,
      l: blended.l / total,
      a: blended.a / total,
    };
  }

  transform(matrix) {
    this.vertices.forEach(vertex => vertex.transform(matrix));
  }
}
