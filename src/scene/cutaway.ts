/** The opening radius is measured against the sphere's apparent screen radius. */
export const CUTAWAY_RADIUS_MIN = 0.25;
export const CUTAWAY_RADIUS_MAX = 0.95;
export const CUTAWAY_EDGE_WIDTH = 0.018;

export interface CutawayCosines {
  /** No part of the shell below this dot product is removed. */
  outer: number;
  /** The shell above this dot product is completely removed. */
  inner: number;
}

export function clampOpeningRadius(radius: number): number {
  return Math.min(CUTAWAY_RADIUS_MAX, Math.max(CUTAWAY_RADIUS_MIN, Number.isFinite(radius) ? radius : 0.8));
}

/**
 * Convert a circular opening in the sphere's perspective image into a spherical
 * cap. A fixed dot-product threshold would expand to the silhouette during zoom.
 *
 * For q = sphereRadius / cameraDistance and screen-radius fraction r, intersect
 * the near sphere with a ray whose tan(angle) is r times the silhouette's
 * tan(angle). The resulting point has the following normalized axial height.
 *
 * Close to / inside the shell, keep a small physical opening so the camera can
 * pass between the one-block-thick outer and inner faces without being trapped.
 */
export function cutawayCapCosine(radius: number, cameraDistance: number, sphereRadius: number): number {
  const r = Math.min(CUTAWAY_RADIUS_MAX, Math.max(0, radius));
  const q = sphereRadius / Math.max(cameraDistance, sphereRadius * 1.08);
  const q2 = q * q;
  const r2 = r * r;
  return (r2 * q + (1 - q2) * Math.sqrt(1 - r2)) / (1 - (1 - r2) * q2);
}

export function getCutawayCosines(radius: number, cameraDistance: number, sphereRadius: number): CutawayCosines {
  if (radius <= 0.0001) {
    // Dot products cannot reach either value: a closed shell has no discarded
    // fragments, and the shader never receives equal smoothstep endpoints.
    return { outer: 1.001, inner: 1.002 };
  }
  const outer = cutawayCapCosine(radius, cameraDistance, sphereRadius);
  return {
    outer,
    // Keep the endpoints distinct after conversion to a GPU float, even for a
    // nearly closed opening during the last animation frames.
    inner: Math.max(outer + 0.000001, cutawayCapCosine(Math.max(0, radius - CUTAWAY_EDGE_WIDTH), cameraDistance, sphereRadius)),
  };
}
