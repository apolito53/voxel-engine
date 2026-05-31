export const TERRAFORMER_SIZE_MIN = 1;
export const TERRAFORMER_SIZE_MAX = 4;
export const TERRAFORMER_SIZE_DEFAULT = 1;
export const TERRAFORMER_SIZE_STEP = 1;

export type TerraformerSizeStepDirection = "increase" | "decrease";

export function normalizeTerraformerSize(value: unknown, fallback = TERRAFORMER_SIZE_DEFAULT): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  const normalizedFallback = Number.isFinite(fallback) ? fallback : TERRAFORMER_SIZE_DEFAULT;
  const candidate = Number.isFinite(numericValue) ? numericValue : normalizedFallback;
  return Math.max(
    TERRAFORMER_SIZE_MIN,
    Math.min(TERRAFORMER_SIZE_MAX, Math.round(candidate))
  );
}

export function stepTerraformerSize(
  currentSize: number,
  direction: TerraformerSizeStepDirection
): number {
  const delta = direction === "increase" ? TERRAFORMER_SIZE_STEP : -TERRAFORMER_SIZE_STEP;
  return normalizeTerraformerSize(currentSize + delta, currentSize);
}

export function formatTerraformerSize(size: number): string {
  const normalizedSize = normalizeTerraformerSize(size);
  return normalizedSize === 1
    ? "1 sub-cell"
    : `${normalizedSize}x${normalizedSize}x${normalizedSize} sub-cells`;
}
