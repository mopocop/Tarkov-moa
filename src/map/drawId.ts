// Stroke id generator, split out of DrawLayer.tsx so that file stays a clean
// fast-refresh boundary (component-only export).
export function newDrawId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `draw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
