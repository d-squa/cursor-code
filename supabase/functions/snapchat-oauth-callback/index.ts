import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { storePlatformToken } from "../_shared/vault-helper.ts";
import {
  assertUserCanAccessTeam,
  assertUserCanUsePlatform,
  teamScopedPlatformFields,
} from "../_shared/team-access.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const FUNCTION_NAME = "snapchat-oauth-callback";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const oauthInputSchema = z.object({
  code: z.string().min(1).max(2000),
  redirectUri: z.string().optional().nullable(),
  platformId: z.string().uuid().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
});

interface SnapchatOrganization {
  id: string;
  name: string;
  address_line_1?: string;
  country?: string;
  type?: string;
}

interface SnapchatAdAccount {
  id: string;
  name: string;
  advertiser_id?: string;
  organization_id: string;
  currency: string;
  timezone: string;
  status: string;
  type?: string;
}

interface SyncProgress {
  status: "pending" | "syncing" | "completed" | "error";
  platform: "snapchat";
  totalSteps: number;
  currentStep: number;
  currentAssetType?: string;
  currentAssetName?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  processedCounts?: {
    organizations?: number;
    adAccounts?: number;
  };
}

async function fetchOrganizationsAndAccountsBackground(
  supabase: any,
  platformId: string,
  accessToken: string,
) {
  const organizations: SnapchatOrganization[] = [];
  const adAccounts: SnapchatAdAccount[] = [];

  const updateProgress = async (progress: Partial<SyncProgress>) => {
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
              ...progress,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", platformId);
    } catch (err) {
      console.error("Failed to update progress:", err);
    }
  };

  try {
    await updateProgress({
      status: "syncing",
      platform: "snapchat",
      totalSteps: 2,
      currentStep: 0,
      currentAssetType: "organizations",
      startedAt: new Date().toISOString(),
    });

    // Step 1: Fetch organizations (equivalent to Meta's Business Managers)
    console.log("Fetching Snapchat organizations...");
    const orgsResponse = await fetch(
      "https://adsapi.snapchat.com/v1/me/organizations",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!orgsResponse.ok) {
      const errorText = await orgsResponse.text();
      console.error("Failed to fetch organizations:", orgsResponse.status, errorText);
      throw new Error(`Failed to fetch organizations: ${orgsResponse.status}`);
    }

    const orgsData = await orgsResponse.json();
    const orgsList = orgsData?.organizations || [];

    for (const orgWrapper of orgsList) {
      const org = orgWrapper.organization || orgWrapper;
      organizations.push({
        id: org.id,
        name: org.name || `Organization ${org.id}`,
        address_line_1: org.address_line_1,
        country: org.country,
        type: org.type,
      });
    }

    console.log(`Found ${organizations.length} organization(s)`);

    await updateProgress({
      currentStep: 1,
      currentAssetType: "ad_accounts",
      currentAssetName: `Found ${organizations.length} organizations`,
    });

    // Step 2: Fetch ad accounts for each organization
    for (const org of organizations) {
      try {
        const accountsResponse = await fetch(
          `https://adsapi.snapchat.com/v1/organizations/${org.id}/adaccounts`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );

        if (accountsResponse.ok) {
          const accountsData = await accountsResponse.json();
          const accountsList = accountsData?.adaccounts || [];

          for (const accWrapper of accountsList) {
            const acc = accWrapper.adaccount || accWrapper;
            adAccounts.push({
              id: acc.id,
              name: acc.name || `Ad Account ${acc.id}`,
              organization_id: org.id,
              currency: acc.currency || "USD",
              timezone: acc.timezone || "UTC",
              status: acc.status || "ACTIVE",
              type: acc.type,
            });
          }
        } else {
          console.error(`Failed to fetch ad accounts for org ${org.id}:`, accountsResponse.status);
        }
      } catch (err) {
        console.error(`Error fetching ad accounts for org ${org.id}:`, err);
      }
    }

    console.log(`Found ${adAccounts.length} ad account(s) total`);

    // Update platform with all data
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
          organizations,
          accounts: adAccounts,
          sync_progress: {
            status: "completed",
            platform: "snapchat",
            totalSteps: 2,
            currentStep: 2,
            currentAssetType: "ad_accounts",
            completedAt: new Date().toISOString(),
            processedCounts: {
              organizations: organizations.length,
              adAccounts: adAccounts.length,
            },
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", platformId);

    console.log(`Background sync completed for platform ${platformId}: ${adAccounts.length} accounts`);
  } catch (error: any) {
    console.error(`Background sync error for platform ${platformId}:`, error);
    await updateProgress({
      status: "error",
      errorMessage: error.message || "Failed to sync Snapchat accounts",
    });
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const parseResult = oauthInputSchema.safeParse(body);
    if (!parseResult.success) {
      console.error("Validation error:", parseResult.error);
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { code, redirectUri, platformId, teamId } = parseResult.data;

    if (teamId) {
      await assertUserCanAccessTeam(supabase, user.id, teamId);
    }

    const teamFields = teamScopedPlatformFields(teamId ?? undefined);

    const snapchatClientId = Deno.env.get("SNAPCHAT_CLIENT_ID");
    const snapchatClientSecret = Deno.env.get("SNAPCHAT_CLIENT_SECRET");

    if (!snapchatClientId || !snapchatClientSecret) {
      throw new Error("Snapchat app credentials not configured");
    }

    console.log("Exchanging Snapchat authorization code for access token...");

    // Exchange code for access token using Basic Auth
    const basicAuth = btoa(`${snapchatClientId}:${snapchatClientSecret}`);
    const tokenUrl = "https://accounts.snapchat.com/login/oauth2/access_token";
    
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri || "",
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: tokenBody.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Snapchat token exchange error:", tokenData);
      throw new Error(tokenData.error_description || tokenData.error || "Failed to exchange authorization code");
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    console.log(`Received Snapchat access token (expires in ${expires_in}s)`);

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + (expires_in || 1800) * 1000).toISOString();

    // Initial sync progress
    const initialSyncProgress: SyncProgress = {
      status: "pending",
      platform: "snapchat",
      totalSteps: 2,
      currentStep: 0,
      currentAssetType: "organizations",
      startedAt: new Date().toISOString(),
    };

    let resultPlatformId: string;

    if (platformId) {
      const { data: existingPlatform, error: existingError } = await supabase
        .from("connected_platforms")
        .select("user_id, team_id")
        .eq("id", platformId)
        .single();

      if (existingError || !existingPlatform) {
        throw new Error("Platform connection not found");
      }

      await assertUserCanUsePlatform(supabase, user.id, existingPlatform);
      const reconnectTeamId = teamId ?? existingPlatform.team_id ?? undefined;

      // Reconnecting existing platform
      console.log(`Reconnecting Snapchat platform ${platformId}`);

      const { error: updateError } = await supabase
        .from("connected_platforms")
        .update({
          updated_at: new Date().toISOString(),
          is_active: true,
          token_expires_at: expiresAt,
          metadata: {
            sync_progress: initialSyncProgress,
          },
          ...teamScopedPlatformFields(reconnectTeamId),
        })
        .eq("id", platformId);

      if (updateError) throw updateError;

      // Store tokens in Vault
      await storePlatformToken(supabase, platformId, access_token, "access");
      if (refresh_token) {
        await storePlatformToken(supabase, platformId, refresh_token, "refresh");
      }

      resultPlatformId = platformId;
    } else {
      // Create new platform connection
      console.log("Creating new Snapchat platform connection");

      const { data: newPlatform, error: insertError } = await supabase
        .from("connected_platforms")
        .insert({
          user_id: user.id,
          platform_type: "snapchat",
          platform_name: "Snapchat Ads",
          is_active: true,
          token_expires_at: expiresAt,
          metadata: {
            sync_progress: initialSyncProgress,
          },
          ...teamFields,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Store tokens in Vault
      await storePlatformToken(supabase, newPlatform.id, access_token, "access");
      if (refresh_token) {
        await storePlatformToken(supabase, newPlatform.id, refresh_token, "refresh");
      }

      resultPlatformId = newPlatform.id;
    }

    // Start background task to fetch organizations and ad accounts
    // @ts-ignore - EdgeRuntime is available in Deno Deploy
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(
        fetchOrganizationsAndAccountsBackground(supabase, resultPlatformId, access_token),
      );
      console.log("Background sync task started via EdgeRuntime.waitUntil");
    } else {
      console.log("EdgeRuntime not available, running sync in foreground");
      await fetchOrganizationsAndAccountsBackground(supabase, resultPlatformId, access_token);
    }

    return new Response(
      JSON.stringify({
        success: true,
        platformId: resultPlatformId,
        syncInProgress: true,
        message: platformId
          ? "Snapchat connection renewed - syncing accounts in background"
          : "Snapchat connected - syncing accounts in background",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Snapchat OAuth callback error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to connect Snapchat account" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
};

serve(handler);
