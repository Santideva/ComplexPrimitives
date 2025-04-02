// File: src/utils/DistanceMapping.js

/**
 * Identity mapping: returns the raw distance unchanged.
 * @param {number} d - Raw distance.
 * @returns {number}
 */
export const identityMapping = d => d;

/**
 * Creates a polynomial mapping function based on provided coefficients.
 * For a polynomial f(d) = c0 + c1*d + c2*d^2 + ...
 * @param {number[]} polyCoeffs - Array of coefficients.
 * @returns {Function} A function that maps a raw distance.
 */
export function createPolynomialMapping(polyCoeffs) {
  return function(d) {
    return polyCoeffs.reduce((acc, coeff, i) => acc + coeff * Math.pow(d, i), 0);
  };
}

/**
 * Creates an exponential mapping function.
 * f(d) = a * exp(b * d) + c
 * @param {number} a - Scaling factor.
 * @param {number} b - Exponent factor.
 * @param {number} c - Offset.
 * @returns {Function} A function that maps a raw distance.
 */
export function createExponentialMapping(a = 1, b = 1, c = 0) {
  return function(d) {
    return a * Math.exp(b * d) + c;
  };
}

/**
 * Creates a logarithmic mapping function.
 * f(d) = a * log(b * d + c) + e
 * Prevents log(0) by ensuring argument is positive.
 * @param {number} a - Scaling factor.
 * @param {number} b - Internal scaling.
 * @param {number} c - Prevents log(0) for d=0.
 * @param {number} e - Offset.
 * @returns {Function} A function that maps a raw distance.
 */
export function createLogarithmicMapping(a = 1, b = 1, c = 1, e = 0) {
  return function(d) {
    const arg = b * d + c;
    return arg > 0 ? a * Math.log(arg) + e : e;
  };
}

/**
 * Creates a sinusoidal mapping function.
 * f(d) = a * sin(b * d + c) + e
 * @param {number} a - Amplitude.
 * @param {number} b - Frequency.
 * @param {number} c - Phase shift.
 * @param {number} e - Vertical shift.
 * @returns {Function} A function that maps a raw distance.
 */
export function createSinusoidalMapping(a = 1, b = 1, c = 0, e = 0) {
  return function(d) {
    return a * Math.sin(b * d + c) + e;
  };
}

/**
 * Creates a power mapping function.
 * f(d) = a * d^b + c
 * @param {number} a - Scaling factor.
 * @param {number} b - Power.
 * @param {number} c - Offset.
 * @returns {Function} A function that maps a raw distance.
 */
export function createPowerMapping(a = 1, b = 2, c = 0) {
  return function(d) {
    return a * Math.pow(d, b) + c;
  };
}

/**
 * Common easing functions for smooth transitions.
 */
export const easingFunctions = {
  // Quadratic easing
  easeInQuad: d => d * d,
  easeOutQuad: d => d * (2 - d),
  easeInOutQuad: d => d < 0.5 ? 2 * d * d : -1 + (4 - 2 * d) * d,
  
  // Cubic easing
  easeInCubic: d => d * d * d,
  easeOutCubic: d => (--d) * d * d + 1,
  easeInOutCubic: d => d < 0.5 ? 4 * d * d * d : (d - 1) * (2 * d - 2) * (2 * d - 2) + 1,
  
  // Elastic
  easeInElastic: d => {
    const c4 = (2 * Math.PI) / 3;
    return d === 0 ? 0 : d === 1 ? 1 : -Math.pow(2, 10 * d - 10) * Math.sin((d * 10 - 10.75) * c4);
  },
  easeOutElastic: d => {
    const c4 = (2 * Math.PI) / 3;
    return d === 0 ? 0 : d === 1 ? 1 : Math.pow(2, -10 * d) * Math.sin((d * 10 - 0.75) * c4) + 1;
  },
  
  // Bounce
  easeOutBounce: d => {
    const n1 = 7.5625;
    const d1 = 2.75;
    
    if (d < 1 / d1) {
      return n1 * d * d;
    } else if (d < 2 / d1) {
      return n1 * (d -= 1.5 / d1) * d + 0.75;
    } else if (d < 2.5 / d1) {
      return n1 * (d -= 2.25 / d1) * d + 0.9375;
    } else {
      return n1 * (d -= 2.625 / d1) * d + 0.984375;
    }
  }
};

/**
 * Creates a composite distance mapper by combining two mapping functions.
 * @param {Function} mapperA - First distance mapper.
 * @param {Function} mapperB - Second distance mapper.
 * @param {Function} combiner - Function that combines the two mapped distances.
 * @returns {Function} A composite mapping function.
 */
export function createCompositeMapping(mapperA, mapperB, combiner) {
  return function(d) {
    const resultA = mapperA(d);
    const resultB = mapperB(d);
    return combiner(resultA, resultB);
  };
}

/**
 * Common combining functions for composite mappers.
 */
export const combiningFunctions = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => b !== 0 ? a / b : a,
  min: (a, b) => Math.min(a, b),
  max: (a, b) => Math.max(a, b),
  average: (a, b) => (a + b) / 2,
  smoothMin: (a, b, k = 1) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * h * k * (1/6);
  }
};

/**
 * Creates a periodic mapping function using mod operation.
 * @param {Function} baseMapper - Base distance mapper to apply periodically.
 * @param {number} period - The period length.
 * @returns {Function} A periodic mapping function.
 */
export function createPeriodicMapping(baseMapper, period = 1) {
  return function(d) {
    return baseMapper(d % period);
  };
}

/**
 * Registry of available distance mapping functions.
 */
export const distanceMappingRegistry = {
  identity: identityMapping,
  polynomial: createPolynomialMapping([0, 1, 0]),  // Linear by default
  exponential: createExponentialMapping(),
  logarithmic: createLogarithmicMapping(),
  sinusoidal: createSinusoidalMapping(),
  power: createPowerMapping(),
  easeInQuad: easingFunctions.easeInQuad,
  easeOutQuad: easingFunctions.easeOutQuad,
  easeInOutQuad: easingFunctions.easeInOutQuad,
  easeInCubic: easingFunctions.easeInCubic,
  easeOutCubic: easingFunctions.easeOutCubic,
  easeInOutCubic: easingFunctions.easeInOutCubic,
  easeInElastic: easingFunctions.easeInElastic,
  easeOutElastic: easingFunctions.easeOutElastic,
  easeOutBounce: easingFunctions.easeOutBounce
};