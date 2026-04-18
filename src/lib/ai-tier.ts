export type AITier = 1 | 2 | 3;

export function getTierByLevel(level: number | null | undefined): AITier {
  if (level == null) return 2;
  if (level <= 2) return 1;
  if (level <= 5) return 2;
  return 3;
}

export function tierCategory(tier: AITier): string {
  return `system_tier${tier}`;
}

export const TIER_LABEL: Record<AITier, string> = {
  1: "1-2 级（启蒙）",
  2: "3-5 级（基础）",
  3: "6-8 级（竞赛）",
};
