export const FREE_LIMITS = {
  plan: "free" as const,
  name: "Freemium",
  priceMonthly: 0,
  maxAiGenerations: 5,
  maxBills: 50,
  maxStorageBytes: 500 * 1024 * 1024, // 500 MB
  showAds: true,
};

export const PRO_LIMITS = {
  plan: "pro" as const,
  name: "Pro Business",
  priceMonthly: 5, // $5
  maxAiGenerations: null, // Unlimited
  maxBills: null, // Unlimited
  maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
  showAds: false,
};

export interface UserUsageInfo {
  plan: "free" | "pro";
  isPro: boolean;
  showAds: boolean;
  aiGenerationsUsed: number;
  maxAiGenerations: number | null;
  aiGenerationsRemaining: number | null;
  billsCount: number;
  maxBills: number | null;
  billsRemaining: number | null;
  storageBytes: number;
  maxStorageBytes: number;
  storageRemainingBytes: number;
  planSubscribedAt: string | null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
