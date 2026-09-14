import path from "path";
import { readdir, stat } from "fs/promises";
import { db } from "./db";
import { UPLOAD_ROOT } from "./assets";
import { FREE_LIMITS, PRO_LIMITS, type UserUsageInfo } from "./quotas-client";

export * from "./quotas-client";

/** Recursively sum file sizes in uploads/<userId> directory */
export async function getUserStorageBytes(userId: string): Promise<number> {
  const userDir = path.join(UPLOAD_ROOT, userId);
  let totalBytes = 0;

  async function walk(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          try {
            const st = await stat(full);
            totalBytes += st.size;
          } catch {}
        }
      }
    } catch {
      // Directory may not exist yet if user hasn't uploaded anything
    }
  }

  await walk(userDir);
  return totalBytes;
}

export async function getUserUsage(userId: string): Promise<UserUsageInfo> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, plan: true, planSubscribedAt: true, aiGenerationsUsed: true },
  });

  const isPro = user?.plan === "pro";
  const limits = isPro ? PRO_LIMITS : FREE_LIMITS;

  const [billsCount, storageBytes] = await Promise.all([
    db.bill.count({ where: { userId } }),
    getUserStorageBytes(userId),
  ]);

  const aiGenerationsUsed = user?.aiGenerationsUsed ?? 0;

  return {
    plan: isPro ? "pro" : "free",
    isPro,
    showAds: limits.showAds,
    aiGenerationsUsed,
    maxAiGenerations: limits.maxAiGenerations,
    aiGenerationsRemaining: isPro ? null : Math.max(0, FREE_LIMITS.maxAiGenerations - aiGenerationsUsed),
    billsCount,
    maxBills: limits.maxBills,
    billsRemaining: isPro ? null : Math.max(0, FREE_LIMITS.maxBills - billsCount),
    storageBytes,
    maxStorageBytes: limits.maxStorageBytes,
    storageRemainingBytes: Math.max(0, limits.maxStorageBytes - storageBytes),
    planSubscribedAt: user?.planSubscribedAt ? user.planSubscribedAt.toISOString() : null,
  };
}
