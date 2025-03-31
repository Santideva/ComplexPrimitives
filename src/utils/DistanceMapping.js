// File: src/utils/DistanceMapping.js

/**
 * Identity mapping: returns the raw distance unchanged.
 * @param {number} d - Raw distance.
 * @returns {number}
 */
export const identityMapping = d => d;

/**
 * Creates a polynomial mapping function based on provided coefficients.
 * For a polynomial f(d) = c0 + c1*d + c2*d^2 + ...,
 * @param {number[]} polyCoeffs - Array of coefficients.
 * @returns {Function} A function that maps a raw distance.
 */
export function createPolynomialMapping(polyCoeffs) {
  return function(d) {
    return polyCoeffs.reduce((acc, coeff, i) => acc + coeff * Math.pow(d, i), 0);
  };
}

/**
 * Registry of available distance mapping functions.
 */
export const distanceMappingRegistry = {
  identity: identityMapping,
  // You can add additional pre-configured mapping functions here.
  // For example, a quadratic mapping could be predefined.
};
