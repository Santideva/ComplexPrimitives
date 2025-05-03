/*
 * utils/affine.js
 * 
 * A utility module for 2D affine transformations, compatible with ComplexPrimitive2D,
 * ComplexShape2D, Face, and Vertex classes. No external dependencies.
 */

/**
 * @typedef {Object} Affine
 * @prop {number} a  - Scale and rotation component (row 1, col 1)
 * @prop {number} b  - Rotation and shear component (row 1, col 2)
 * @prop {number} c  - Rotation and shear component (row 2, col 1)
 * @prop {number} d  - Scale and rotation component (row 2, col 2)
 * @prop {number} tx - Translation X
 * @prop {number} ty - Translation Y
 */

/**
 * Returns the identity matrix
 * @returns {Affine}
 */
export function identity() {
    return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  }
  
  /**
   * Compute the determinant of an affine matrix: det = a * d - b * c
   * @param {Affine} M
   * @returns {number}
   */
  export function determinant(M) {
    return M.a * M.d - M.b * M.c;
  }
  
  /**
   * Check if an affine transform is invertible (det ≠ 0)
   * @param {Affine} M
   * @returns {boolean}
   */
  export function isInvertible(M) {
    return Math.abs(determinant(M)) > Number.EPSILON;
  }
  
  /**
   * Invert an affine transform. Throws if singular.
   * @param {Affine} M
   * @returns {Affine}
   */
  export function invertAffine(M) {
    const det = determinant(M);
    if (Math.abs(det) < Number.EPSILON) {
      throw new Error("Cannot invert singular affine matrix");
    }
    const invDet = 1 / det;
    return {
      a:  M.d * invDet,
      b: -M.b * invDet,
      c: -M.c * invDet,
      d:  M.a * invDet,
      tx: (M.b * M.ty - M.d * M.tx) * invDet,
      ty: (M.c * M.tx - M.a * M.ty) * invDet
    };
  }
  
  /**
   * Compose two affines: apply M1 then M2 (M2 ∘ M1).
   * @param {Affine} M2
   * @param {Affine} M1
   * @returns {Affine}
   */
  export function composeAffine(M2, M1) {
    return {
      a:  M2.a * M1.a + M2.b * M1.c,
      b:  M2.a * M1.b + M2.b * M1.d,
      c:  M2.c * M1.a + M2.d * M1.c,
      d:  M2.c * M1.b + M2.d * M1.d,
      tx: M2.a * M1.tx + M2.b * M1.ty + M2.tx,
      ty: M2.c * M1.tx + M2.d * M1.ty + M2.ty
    };
  }
  
  /**
   * Create a translation affine.
   * @param {number} x
   * @param {number} y
   * @returns {Affine}
   */
  export function translate(x = 0, y = 0) {
    return { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y };
  }
  
  /**
   * Create a scale affine.
   * @param {number} sx
   * @param {number} [sy=sx]
   * @returns {Affine}
   */
  export function scale(sx = 1, sy = sx) {
    return { a: sx, b: 0, c: 0, d: sy, tx: 0,  ty: 0 };
  }
  
  /**
   * Create a rotation affine (around origin).
   * @param {number} theta  Rotation angle in radians
   * @returns {Affine}
   */
  export function rotate(theta = 0) {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return { a: cos, b: -sin, c: sin, d: cos, tx: 0, ty: 0 };
  }
  
  /**
   * Create a horizontal shear affine.
   * @param {number} shx  Horizontal shear factor
   * @returns {Affine}
   */
  export function shearX(shx = 0) {
    return { a: 1, b: shx, c: 0, d: 1, tx: 0, ty: 0 };
  }
  
  /**
   * Create a vertical shear affine.
   * @param {number} shy  Vertical shear factor
   * @returns {Affine}
   */
  export function shearY(shy = 0) {
    return { a: 1, b: 0, c: shy, d: 1, tx: 0, ty: 0 };
  }
  
  /**
   * Create a horizontal reflection (flip around Y axis).
   * @returns {Affine}
   */
  export function reflectX() {
    return { a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  }
  
  /**
   * Create a vertical reflection (flip around X axis).
   * @returns {Affine}
   */
  export function reflectY() {
    return { a: 1, b: 0, c: 0, d: -1, tx: 0, ty: 0 };
  }
  
  /**
   * Create a reflection across a line through the origin with the given angle.
   * @param {number} theta  Angle of the reflection line in radians
   * @returns {Affine}
   */
  export function reflect(theta = 0) {
    const cos2 = Math.cos(2 * theta);
    const sin2 = Math.sin(2 * theta);
    return { a: cos2, b: sin2, c: sin2, d: -cos2, tx: 0, ty: 0 };
  }
  
  /**
   * Create a combined affine from rotation, uniform scale, and translation.
   * @param {Object} opts
   * @param {number} [opts.rotation=0]
   * @param {number} [opts.scale=1]
   * @param {{x:number,y:number}} [opts.translate={x:0,y:0}]
   * @returns {Affine}
   */
  export function makeAffine({ rotation = 0, scale: s = 1, translate: { x = 0, y = 0 } = {} } = {}) {
    const cos = Math.cos(rotation) * s;
    const sin = Math.sin(rotation) * s;
    return { a: cos, b: -sin, c: sin, d: cos, tx: x, ty: y };
  }
  
  /**
   * Apply affine to a point.
   * @param {{x:number,y:number}} pt
   * @param {Affine} M
   * @returns {{x:number,y:number}}
   */
  export function applyAffineToPoint(pt, M) {
    return {
      x: M.a * pt.x + M.b * pt.y + M.tx,
      y: M.c * pt.x + M.d * pt.y + M.ty
    };
  }
  
  /**
   * Apply affine transform to a Vertex instance in-place.
   * @param {import("../Geometry/Vertex.js").Vertex} vertex
   * @param {Affine} M
   */
  export function applyAffineToVertex(vertex, M) {
    const { x, y } = vertex.position;
    const p = applyAffineToPoint({ x, y }, M);
    vertex.position.x = p.x;
    vertex.position.y = p.y;
  }
  
  /**
   * Apply affine transform to a Face (all its vertices) in-place.
   * @param {import("../geometry/Face.js").Face} face
   * @param {Affine} M
   */
  export function applyAffineToFace(face, M) {
    face.vertices.forEach(v => applyAffineToVertex(v, M));
  }
  
  /**
   * Apply affine transform to an array of points in-place.
   * @param {Array<{x:number,y:number}>} points
   * @param {Affine} M
   */
  export function applyAffineToPoints(points, M) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const newP = applyAffineToPoint(p, M);
      p.x = newP.x;
      p.y = newP.y;
    }
  }
  
  /**
   * Serialize an affine into an array [a,b,c,d,tx,ty]
   * @param {Affine} M
   * @returns {number[]}
   */
  export function matrixToArray(M) {
    return [M.a, M.b, M.c, M.d, M.tx, M.ty];
  }
  
  /**
   * Deserialize an array into an affine.
   * @param {number[]} arr  [a, b, c, d, tx, ty]
   * @returns {Affine}
   */
  export function arrayToMatrix(arr) {
    const [a, b, c, d, tx, ty] = arr;
    return { a, b, c, d, tx, ty };
  }