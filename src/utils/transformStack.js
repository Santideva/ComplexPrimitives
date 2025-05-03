/*
 * utils/TransformStack.js
 * 
 * A minimal utility module for managing a stack of affine transformations.
 * Allows pushing, popping, and applying sequences of transformations.
 * Depends on affine.js for the underlying transformation operations.
 */

import { identity, composeAffine } from './affine.js';

/**
 * A stack-based manager for sequential 2D affine transformations.
 */
export class TransformStack {
  /**
   * Create a new transform stack, initialized with identity matrix
   */
  constructor() {
    this.stack = [identity()];
    this.current = 0;
  }

  /**
   * Get the current composite transformation
   * @returns {import('./affine.js').Affine} The current transformation
   */
  get() {
    return this.stack[this.current];
  }

  /**
   * Push a new transformation onto the stack, combining it with the current transform
   * @param {import('./affine.js').Affine} transform - The transformation to add
   * @returns {TransformStack} This instance for chaining
   */
  push(transform) {
    const combined = composeAffine(transform, this.stack[this.current]);
    this.current++;
    this.stack[this.current] = combined;
    // Truncate the stack if we're not at the end (handles case of push after pop)
    if (this.current < this.stack.length - 1) {
      this.stack.length = this.current + 1;
    }
    return this;
  }

  /**
   * Move back one step in the transformation stack
   * @returns {TransformStack} This instance for chaining
   * @throws {Error} If attempting to pop beyond the bottom of the stack
   */
  pop() {
    if (this.current <= 0) {
      throw new Error("Cannot pop beyond the bottom of the transform stack");
    }
    this.current--;
    return this;
  }

  /**
   * Reset to the bottom of the stack (identity transform)
   * @returns {TransformStack} This instance for chaining
   */
  reset() {
    this.current = 0;
    return this;
  }

  /**
   * Save the current state by marking the current position
   * without creating a new transform
   * @returns {number} The saved position index
   */
  save() {
    return this.current;
  }

  /**
   * Restore to a previously saved position
   * @param {number} position - Position index from a previous save() call
   * @returns {TransformStack} This instance for chaining
   * @throws {Error} If the position is invalid
   */
  restore(position) {
    if (position < 0 || position > this.stack.length - 1) {
      throw new Error("Invalid stack position");
    }
    this.current = position;
    return this;
  }

  /**
   * Apply the current transformation to a point
   * @param {{x:number,y:number}} point - The point to transform
   * @returns {{x:number,y:number}} The transformed point
   */
  applyToPoint(point) {
    const transform = this.stack[this.current];
    return {
      x: transform.a * point.x + transform.b * point.y + transform.tx,
      y: transform.c * point.x + transform.d * point.y + transform.ty
    };
  }
  
  /**
   * Apply the current transformation to a vertex in-place
   * @param {import('../Geometry/Vertex.js').Vertex} vertex - The vertex to transform
   */
  applyToVertex(vertex) {
    const transform = this.stack[this.current];
    const { x, y } = vertex.position;
    vertex.position.x = transform.a * x + transform.b * y + transform.tx;
    vertex.position.y = transform.c * x + transform.d * y + transform.ty;
  }
  
  /**
   * Apply the current transformation to all vertices in a face in-place
   * @param {import('../geometry/Face.js').Face} face - The face to transform
   */
  applyToFace(face) {
    const vertices = face.vertices;
    for (let i = 0; i < vertices.length; i++) {
      this.applyToVertex(vertices[i]);
    }
  }
}