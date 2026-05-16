import { fetchWithTimeout } from "./fetch-with-timeout.ts";
import { logApiRequest, logApiResponse } from "./api-logger.ts";

const ADVERTISER_INFO_BATCH_SIZE = 50;
const BC_FETCH_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 20_000;

export interface TikTokSyncProgress {
  status: "pending" | "syncing" | "completed" | "error";
  platform: "tiktok";
  totalSteps: number;
  currentStep: number;
  currentAssetType?: string;
  currentAssetName?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  lastProgressAt?: string;
  processedCounts?: {
    adAccounts?: number;
  };
}

type SupabaseClient = {
  from: (table: string) => {
    select: (cols: string) => { eq: (col: string, val: string) => { single: () => Promise<{ data: any }> } };
    update: (row: unknown) => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
  };
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/**
 * Fetch TikTok advertiser details in batches (avoids 1 API call per account and edge timeouts).
 */
export async function syncTikTokAdvertiserDetails(
  supabase: SupabaseClient,
  platformId: string,
  accessToken: string,
  advertiserIds: string[],
  tokenContext: "USER" | "ADVERTISER",
  tiktokUserInfo: unknown,
  logContext = "tiktok-advertiser-sync",
): Promise<void> {
  const accounts: any[] = [];
  const businessCenters = new Map<string, any>();
  const totalSteps = advertiserIds.length;

  const updateProgress = async (progress: Partial<TikTokSyncProgress>) => {
    try {
      const { data: current } = await supabase
        .from("connected_platforms")
        .select("metadata")
        .eq("id", platformId)
        .single();

      const currentMetadata = current?.metadata || {};

      await supabase
        .from("connected_platforms")
        .update({
          metadata: {
            ...currentMetadata,
            sync_progress: {
              ...currentMetadata.sync_progress,
              platform: "tiktok",
              totalSteps,
              currentAssetType: "advertisers",
              ...progress,
              lastProgressAt: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", platformId);
    } catch (err) {
      console.error(`[${logContext}] Failed to update progress:`, err);
    }
  };

  try {
    await updateProgress({
      status: "syncing",
      currentStep: 0,
      startedAt: new Date().toISOString(),
    });

    const batches = chunk(advertiserIds, ADVERTISER_INFO_BATCH_SIZE);
    let processed = 0;

    for (const batch of batches) {
      const advertiserUrl =
        `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=${
          encodeURIComponent(JSON.stringify(batch))
        }`;

      logApiRequest(advertiserUrl, {
        functionName: logContext,
        method: "GET",
        context: `advertisers batch (${batch.length})`,
      });

      let list: any[] = [];
      try {
        const advertiserResponse = await fetchWithTimeout(
          advertiserUrl,
          { headers: { "Access-Token": accessToken } },
          REQUEST_TIMEOUT_MS,
        );
        const advertiserData = await advertiserResponse.json();
        logApiResponse(advertiserUrl, advertiserData, {
          functionName: logContext,
          method: "GET",
          context: `advertisers batch (${batch.length})`,
        });

        if (advertiserData.code === 0 && Array.isArray(advertiserData.data?.list)) {
          list = advertiserData.data.list;
        }
      } catch (batchError) {
        console.error(`[${logContext}] Batch advertiser fetch failed:`, batchError);
      }

      const infoById = new Map<string, any>();
      for (const info of list) {
        const id = String(info.advertiser_id ?? info.id ?? "");
        if (id) infoById.set(id, info);
      }

      for (const advertiserId of batch) {
        const advertiserInfo = infoById.get(advertiserId);
        if (advertiserInfo) {
          accounts.push({
            advertiser_id: advertiserId,
            name: advertiserInfo.name || `Advertiser ${advertiserId}`,
            currency: advertiserInfo.currency || "USD",
            timezone: advertiserInfo.timezone || "UTC",
            status: advertiserInfo.status || "ENABLE",
            bc_id: advertiserInfo.owner_bc_id || advertiserInfo.bc_id || null,
            business_center: null,
          });
        } else {
          accounts.push({
            advertiser_id: advertiserId,
            name: `Advertiser ${advertiserId}`,
            currency: "USD",
            timezone: "UTC",
            status: "UNKNOWN",
            bc_id: null,
            business_center: null,
          });
        }
      }

      processed += batch.length;
      const lastName = list[list.length - 1]?.name ?? batch[batch.length - 1];
      await updateProgress({
        currentStep: processed,
        currentAssetName: typeof lastName === "string" ? lastName : `Batch ${processed}/${totalSteps}`,
      });
    }

    // Attach business centers (limited concurrency; skip on timeout)
    const uniqueBcIds = [
      ...new Set(accounts.map((a) => a.bc_id).filter((id): id is string => Boolean(id))),
    ];

    await mapWithConcurrency(uniqueBcIds, BC_FETCH_CONCURRENCY, async (bcId) => {
      if (businessCenters.has(bcId)) return;
      try {
        const bcUrl = `https://business-api.tiktok.com/open_api/v1.3/bc/get/?bc_id=${bcId}`;
        logApiRequest(bcUrl, { functionName: logContext, method: "GET", context: `bc ${bcId}` });

        const bcResponse = await fetchWithTimeout(
          bcUrl,
          { headers: { "Access-Token": accessToken } },
          REQUEST_TIMEOUT_MS,
        );
        const bcData = await bcResponse.json();
        logApiResponse(bcUrl, bcData, { functionName: logContext, method: "GET", context: `bc ${bcId}` });

        if (bcData.code === 0 && bcData.data) {
          businessCenters.set(bcId, {
            bc_id: bcId,
            name: bcData.data.name || `Business Center ${bcId}`,
            role: bcData.data.role,
            status: bcData.data.status,
          });
        }
      } catch (bcError) {
        console.error(`[${logContext}] BC fetch failed for ${bcId}:`, bcError);
      }
    });

    for (const account of accounts) {
      if (account.bc_id && businessCenters.has(account.bc_id)) {
        account.business_center = businessCenters.get(account.bc_id);
      }
    }

    const { data: finalCurrent } = await supabase
      .from("connected_platforms")
      .select("metadata")
      .eq("id", platformId)
      .single();

    const finalMetadata = finalCurrent?.metadata || {};

    await supabase
      .from("connected_platforms")
      .update({
        metadata: {
          ...finalMetadata,
          advertiser_ids: advertiserIds,
          accounts,
          business_centers: Array.from(businessCenters.values()),
          token_context: tokenContext,
          tiktok_user_info: tiktokUserInfo,
          sync_progress: {
            status: "completed",
            platform: "tiktok",
            totalSteps,
            currentStep: totalSteps,
            currentAssetType: "advertisers",
            completedAt: new Date().toISOString(),
            lastProgressAt: new Date().toISOString(),
            processedCounts: { adAccounts: accounts.length },
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", platformId);

    console.log(`[${logContext}] Completed: ${accounts.length} advertisers for platform ${platformId}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to sync advertiser accounts";
    console.error(`[${logContext}] Sync error for platform ${platformId}:`, error);
    await updateProgress({
      status: "error",
      errorMessage: message,
    });
    throw error;
  }
}
