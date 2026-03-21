import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FetchPostsRequest {
  platform: 'meta' | 'tiktok';
  pageId?: string; // For Meta - Facebook Page ID
  identityId?: string; // For TikTok - Identity ID
  advertiserId?: string; // For TikTok
  postIdOrUrl?: string; // For direct lookup by ID or URL
  limit?: number;
}

interface OrganicPost {
  id: string;
  platform: 'meta' | 'tiktok';
  postId: string;
  pageId?: string;
  identityId?: string;
  message?: string;
  caption?: string;
  thumbnailUrl?: string;
  mediaType?: 'image' | 'video' | 'carousel';
  createdTime?: string;
  permalink?: string;
  isSparkEligible?: boolean;
  /** For Meta posts: 'facebook' or 'instagram' based on post source */
  sourceNetwork?: 'facebook' | 'instagram';
  /** Media dimensions when available from the platform API */
  width?: number;
  height?: number;
}

async function readJsonSafe(response: Response, context?: string): Promise<any> {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    const payload = {
      error: {
        message: "Non-JSON response",
        status: response.status,
        body: raw.slice(0, 500),
      },
    };

    // TikTok APIs intermittently return HTML / empty bodies even on 200s.
    // Logging here makes it debuggable from function logs.
    console.warn(
      `[fetch-organic-posts] Non-JSON response${context ? ` (${context})` : ""}: status=${response.status}, ok=${response.ok}, bodyPreview=${payload.error.body}`
    );

    return payload;
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Debug: log all received headers
    const allHeaders: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      allHeaders[key] = key.toLowerCase() === 'authorization' ? '[REDACTED]' : value;
    });
    console.log('[fetch-organic-posts] Request headers:', JSON.stringify(allHeaders));

    // Get user from request
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      console.error('[fetch-organic-posts] No authorization header found. Available headers:', Object.keys(allHeaders).join(', '));
      throw new Error("No authorization header");
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const body: FetchPostsRequest = await req.json();
    const { platform, pageId, identityId, advertiserId, postIdOrUrl, limit = 25 } = body;

    console.log(`[fetch-organic-posts] Request: platform=${platform}, pageId=${pageId}, identityId=${identityId}, postIdOrUrl=${postIdOrUrl}`);

    if (platform === 'meta') {
      return await handleMetaPosts(supabase, user.id, pageId, postIdOrUrl, limit);
    } else if (platform === 'tiktok') {
      return await handleTikTokPosts(supabase, user.id, identityId, advertiserId, postIdOrUrl, limit);
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error: any) {
    console.error("[fetch-organic-posts] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});

async function handleMetaPosts(
  supabase: any,
  userId: string,
  pageId?: string,
  postIdOrUrl?: string,
  limit: number = 25
): Promise<Response> {
  // Get user's connected Meta platform
  const { data: platforms, error: platformsError } = await supabase
    .from("connected_platforms")
    .select("id, access_token")
    .eq("user_id", userId)
    .eq("platform_type", "meta")
    .eq("is_active", true);

  if (platformsError) throw platformsError;

  if (!platforms || platforms.length === 0) {
    return new Response(
      JSON.stringify({ posts: [], error: "Meta platform not connected" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const platform = platforms[0];
  const accessToken = await getAccessToken(supabase, platform.id, platform.access_token);
  
  if (!accessToken) {
    throw new Error("Meta access token not found");
  }

  const posts: OrganicPost[] = [];

  // If looking up a specific post by ID or URL
  if (postIdOrUrl) {
    const postId = extractMetaPostId(postIdOrUrl);
    if (postId) {
      const post = await fetchMetaPostById(accessToken, postId);
      if (post) posts.push(post);
    }
    return new Response(
      JSON.stringify({ posts }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // If pageId provided, fetch recent posts from that page
  if (pageId) {
    const { data: pageData } = await supabase
      .from("meta_pages")
      .select("id, access_token, page_id, page_name")
      .eq("user_id", userId)
      .eq("page_id", pageId)
      .maybeSingle();

    const persistPageToken = async (token: string, pageName?: string) => {
      const nowIso = new Date().toISOString();
      if (pageData?.id) {
        await supabase
          .from("meta_pages")
          .update({ access_token: token, synced_at: nowIso })
          .eq("id", pageData.id);
      } else {
        await supabase.from("meta_pages").insert({
          user_id: userId,
          page_id: pageId,
          page_name: pageName || `Page ${pageId}`,
          access_token: token,
          synced_at: nowIso,
        });
      }
    };

    const fetchFeed = async (token: string) => {
      console.log(`[fetch-organic-posts] Fetching Meta feed for page ${pageId}`);
      const res = await fetch(
        `https://graph.facebook.com/v22.0/${pageId}/feed?fields=id,message,full_picture,created_time,permalink_url,is_published,attachments{media_type,media{image{width,height,src}},subattachments}&limit=${limit}&access_token=${token}`,
        { method: "GET" }
      );
      return await readJsonSafe(res);
    };

    const fetchPosts = async (token: string) => {
      const res = await fetch(
        `https://graph.facebook.com/v22.0/${pageId}/posts?fields=id,message,full_picture,created_time,permalink_url,is_published,attachments{media_type,media{image{width,height,src}},subattachments}&limit=${limit}&access_token=${token}`,
        { method: "GET" }
      );
      return await readJsonSafe(res);
    };

    // Prefer a Page access token (stored from prior sync). If missing, fetch it via /me/accounts.
    let pageAccessToken: string | null = pageData?.access_token ?? null;

    if (!pageAccessToken) {
      const tokenInfo = await fetchMetaPageTokenFromAccounts(accessToken, pageId);
      if (tokenInfo?.accessToken) {
        pageAccessToken = tokenInfo.accessToken;
        await persistPageToken(tokenInfo.accessToken, tokenInfo.pageName);
      }
    }

    // Fall back to user token if we truly can't obtain a page token
    const initialToken = pageAccessToken || accessToken;

    let feedData = await fetchFeed(initialToken);

    // If feed fails with token-related errors, retry with a freshly pulled Page token
    const tokenRelatedError =
      !!feedData?.error &&
      (feedData.error?.error_subcode === 2069032 ||
        feedData.error?.code === 190 ||
        (typeof feedData.error?.message === "string" &&
          feedData.error.message.includes("Page access token is required")));

    // Common when token is missing the required permissions (e.g. pages_read_engagement)
    const permissionError =
      !!feedData?.error &&
      (feedData.error?.code === 10 ||
        (typeof feedData.error?.message === "string" &&
          feedData.error.message.includes("pages_read_engagement")));

    // If we got a stale/insufficient page token (or used a user token), force-refresh a page token and retry once.
    if (tokenRelatedError || permissionError) {
      const tokenInfo = await fetchMetaPageTokenFromAccounts(accessToken, pageId);
      if (tokenInfo?.accessToken) {
        const newToken = tokenInfo.accessToken;
        if (newToken !== pageAccessToken) {
          pageAccessToken = newToken;
          await persistPageToken(newToken, tokenInfo.pageName);
        }
        feedData = await fetchFeed(pageAccessToken);
      }
    }

    if (feedData.error) {
      // Try /posts as fallback (using Page token if available)
      const postsData = await fetchPosts(pageAccessToken || accessToken);

      if (!postsData.error && postsData.data) {
        console.warn(
          `[fetch-organic-posts] Meta feed failed for page ${pageId} (code ${feedData.error?.code}); used /posts fallback`
        );
        for (const post of postsData.data) {
          posts.push(transformMetaPost(post, pageId));
        }
      } else {
        console.error(
          `[fetch-organic-posts] Meta feed API error for page ${pageId}:`,
          feedData.error
        );
        if (postsData.error) {
          console.error(
            `[fetch-organic-posts] Meta posts API error for page ${pageId}:`,
            postsData.error
          );
        }
      }
    } else if (feedData.data) {
      for (const post of feedData.data) {
        posts.push(transformMetaPost(post, pageId));
      }
    }

    // Also fetch Instagram posts from connected Instagram Business Account
    const instagramPosts = await fetchInstagramPosts(supabase, userId, accessToken, pageAccessToken || accessToken, limit);
    posts.push(...instagramPosts);
  }

  console.log(`[fetch-organic-posts] Found ${posts.length} Meta posts (FB: ${posts.filter(p => p.sourceNetwork === 'facebook').length}, IG: ${posts.filter(p => p.sourceNetwork === 'instagram').length})`);
  return new Response(
    JSON.stringify({ posts }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

async function handleTikTokPosts(
  supabase: any,
  userId: string,
  identityId?: string,
  advertiserId?: string,
  postIdOrUrl?: string,
  limit: number = 25
): Promise<Response> {
  // Get user's connected TikTok platform
  const { data: platforms, error: platformsError } = await supabase
    .from("connected_platforms")
    .select("id, access_token, metadata")
    .eq("user_id", userId)
    .eq("platform_type", "tiktok")
    .eq("is_active", true);

  if (platformsError) throw platformsError;

  if (!platforms || platforms.length === 0) {
    return new Response(
      JSON.stringify({ posts: [], error: "TikTok platform not connected" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const platform = platforms[0];
  const accessToken = await getAccessToken(supabase, platform.id, platform.access_token);
  
  if (!accessToken) {
    throw new Error("TikTok access token not found");
  }

  // Determine advertiser ID
  const resolvedAdvertiserId = advertiserId || 
    platform.metadata?.advertiser_id || 
    platform.metadata?.advertiser_ids?.[0];

  // TikTok endpoints are not always consistently available across versions.
  // We prefer v1.3 but fall back to v1.2 when TikTok returns 404 (often plain-text).
  const tiktokApiBases = [
    "https://business-api.tiktok.com/open_api/v1.3",
    "https://business-api.tiktok.com/open_api/v1.2",
  ];

  const posts: OrganicPost[] = [];

  // If looking up a specific post by ID, URL, or auth code
  if (postIdOrUrl) {
    // Check if this is a Spark Ads authorization code
    if (isSparkAuthCode(postIdOrUrl)) {
      console.log(`[fetch-organic-posts] Detected Spark Ads auth code, validating...`);
      if (resolvedAdvertiserId) {
        const post = await validateSparkAuthCode(accessToken, resolvedAdvertiserId, postIdOrUrl);
        if (post) posts.push(post);
      }
    } else {
      // Regular video ID or URL
      const itemId = extractTikTokPostId(postIdOrUrl);
      if (itemId && resolvedAdvertiserId) {
        const post = await fetchTikTokPostById(accessToken, resolvedAdvertiserId, itemId);
        if (post) posts.push(post);
      }
    }
    return new Response(
      JSON.stringify({ posts }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // If identityId provided, fetch authorized posts for Spark Ads
  if (identityId && resolvedAdvertiserId) {
    try {
      // Attempt to resolve the identity type from the DB (if we have it)
      // First check platform_identities (new table), then tiktok_identities (legacy table)
      let identityType: string | null = null;
      
      const { data: identityRow } = await supabase
        .from("platform_identities")
        .select("identity_type")
        .eq("user_id", userId)
        .eq("identity_id", identityId)
        .maybeSingle();
      
      if (identityRow?.identity_type) {
        identityType = identityRow.identity_type;
        console.log(`[fetch-organic-posts] Found identity_type from platform_identities: ${identityType}`);
      } else {
        // Fallback to legacy tiktok_identities table
        const { data: legacyRow } = await supabase
          .from("tiktok_identities")
          .select("identity_type")
          .eq("user_id", userId)
          .eq("identity_id", identityId)
          .maybeSingle();
        
        if (legacyRow?.identity_type) {
          identityType = legacyRow.identity_type;
          console.log(`[fetch-organic-posts] Found identity_type from tiktok_identities: ${identityType}`);
        }
      }

      // Build list of identity types to try.
      // IMPORTANT: Even if we have a stored identity_type, TikTok sometimes returns an empty list
      // (no error) when the identity_type is not the one expected by the listing endpoint.
      // So we always try a small, ordered set of fallbacks.
      const fallbackIdentityTypes = ["TT_USER", "BC_AUTH_TT", "TT_ACCOUNT", "CUSTOMIZED_USER"];
      const identityTypesToTry: string[] = Array.from(
        new Set([...(identityType ? [identityType] : []), ...fallbackIdentityTypes])
      );

      // Strategy 1: identity/video/list (most reliable when the account is properly authorized)
      for (const identityType of identityTypesToTry) {
        for (const baseUrl of tiktokApiBases) {
          // TikTok Business API listing endpoints are GET with query params.
          // NOTE: We intentionally include Content-Type on GET to match other TikTok sync calls;
          // we've observed 404 plain-text responses without it in some environments.
          const identityVideoUrl = `${baseUrl}/identity/video/list/?advertiser_id=${encodeURIComponent(
            resolvedAdvertiserId
          )}&identity_id=${encodeURIComponent(identityId)}&identity_type=${encodeURIComponent(
            identityType
          )}&page=1&page_size=${encodeURIComponent(String(Math.min(limit, 100)))}`;

          console.log(
            `[fetch-organic-posts] Fetching TikTok identity videos: base=${baseUrl}, advertiser=${resolvedAdvertiserId}, identity=${identityId}, identity_type=${identityType}`
          );

          const identityResponse = await fetch(identityVideoUrl, {
            method: "GET",
            headers: {
              "Access-Token": accessToken,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          });

          const identityData = await readJsonSafe(
            identityResponse,
            `tiktok identity/video/list (base=${baseUrl}) identity_type=${identityType}`
          );

          // If TikTok returned non-JSON or an explicit error, keep trying fallbacks.
          if (identityData?.error) {
            console.warn(
              `[fetch-organic-posts] TikTok identity/video/list error (base=${baseUrl}, identity_type=${identityType}):`,
              identityData.error
            );
            continue;
          }

          console.log(
            `[fetch-organic-posts] TikTok identity/video/list response (base=${baseUrl}): code=${identityData.code}, message=${identityData.message || "none"}, videos=${identityData.data?.video_list?.length || 0}`
          );

          if (identityData.code === 0 && Array.isArray(identityData.data?.video_list)) {
            for (const video of identityData.data.video_list.slice(0, limit)) {
              posts.push({
                id: video.item_id || video.video_id,
                platform: "tiktok",
                postId: video.item_id || video.video_id,
                identityId,
                caption: video.video_text || video.display_name || "",
                thumbnailUrl: video.video_cover_url || video.poster_url,
                mediaType: "video",
                createdTime: video.create_time
                  ? new Date(video.create_time * 1000).toISOString()
                  : undefined,
                isSparkEligible: true,
              });
            }
          }

          if (posts.length > 0) break;
        }

        if (posts.length > 0) break;
      }

      // Strategy 2: Spark Ads authorized posts (fallback)
      if (posts.length === 0) {
        console.log(
          `[fetch-organic-posts] Trying Spark Ads authorized posts for advertiser ${resolvedAdvertiserId}`
        );

        for (const baseUrl of tiktokApiBases) {
          // TikTok Business API listing endpoint is GET with query params.
          const sparkAuthUrl = `${baseUrl}/creative/spark_ads/authorized_posts/get/?advertiser_id=${encodeURIComponent(
            resolvedAdvertiserId
          )}&page=1&page_size=${encodeURIComponent(String(Math.min(limit, 100)))}`;

          const sparkResponse = await fetch(sparkAuthUrl, {
            method: "GET",
            headers: {
              "Access-Token": accessToken,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          });

          const sparkData = await readJsonSafe(
            sparkResponse,
            `tiktok creative/spark_ads/authorized_posts/get (base=${baseUrl})`
          );

          if (sparkData?.error) {
            console.warn(
              `[fetch-organic-posts] TikTok spark_ads/authorized_posts/get error (base=${baseUrl}):`,
              sparkData.error
            );
            continue;
          }

          console.log(
            `[fetch-organic-posts] TikTok spark_ads/authorized_posts response (base=${baseUrl}): code=${sparkData.code}, posts=${sparkData.data?.authorized_posts?.length || 0}`
          );

          if (sparkData.code === 0 && Array.isArray(sparkData.data?.authorized_posts)) {
            for (const post of sparkData.data.authorized_posts.slice(0, limit)) {
              posts.push({
                id: post.item_id || post.video_id,
                platform: "tiktok",
                postId: post.item_id || post.video_id,
                identityId: post.tt_account_id || identityId,
                caption: post.video_info?.video_text || post.caption || "",
                thumbnailUrl:
                  post.video_info?.video_cover_url || post.cover_image_url,
                mediaType: "video",
                createdTime: post.create_time
                  ? new Date(post.create_time * 1000).toISOString()
                  : undefined,
                isSparkEligible: true,
              });
            }
          }

          if (posts.length > 0) break;
        }
      }
    } catch (err) {
      console.error("[fetch-organic-posts] TikTok API error:", err);
    }
  }

  console.log(`[fetch-organic-posts] Found ${posts.length} TikTok posts`);
  return new Response(
    JSON.stringify({ posts }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

// Helper functions
function extractMetaPostId(input: string): string | null {
  // Handle URLs like https://www.facebook.com/page/posts/123456 or just IDs
  const urlMatch = input.match(/(?:posts?|videos?)\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  
  // Handle format: pageId_postId
  const compoundMatch = input.match(/^\d+_(\d+)$/);
  if (compoundMatch) return input;
  
  // Plain ID
  if (/^\d+$/.test(input)) return input;
  
  return null;
}

function extractTikTokPostId(input: string): string | null {
  // Handle URLs like https://www.tiktok.com/@user/video/123456
  const urlMatch = input.match(/video\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  
  // Plain ID
  if (/^\d+$/.test(input)) return input;
  
  return null;
}

/**
 * Fetch posts from connected Instagram Business Account(s)
 * Uses the Instagram Graph API /media endpoint
 */
async function fetchInstagramPosts(
  supabase: any,
  userId: string,
  userAccessToken: string,
  pageAccessToken: string,
  limit: number = 25
): Promise<OrganicPost[]> {
  const posts: OrganicPost[] = [];

  try {
    // Look up connected Instagram Business Accounts for this user
    const { data: igAccounts, error: igError } = await supabase
      .from("meta_instagram_accounts")
      .select("instagram_account_id, username")
      .eq("user_id", userId);

    if (igError || !igAccounts || igAccounts.length === 0) {
      console.log(`[fetch-organic-posts] No Instagram accounts found for user`);
      return posts;
    }

    // Dedupe by instagram_account_id (in case of duplicates)
    const uniqueIgAccounts = Array.from(
      new Map(igAccounts.map((a: any) => [a.instagram_account_id, a])).values()
    ) as any[];

    console.log(`[fetch-organic-posts] Found ${uniqueIgAccounts.length} Instagram account(s) to fetch`);

    for (const igAccount of uniqueIgAccounts) {
      const igAccountId = igAccount.instagram_account_id;
      
      // Use the page access token (Instagram Business Accounts use Page tokens)
      const token = pageAccessToken || userAccessToken;
      
      console.log(`[fetch-organic-posts] Fetching Instagram media for account ${igAccountId}`);
      
      const mediaUrl = `https://graph.facebook.com/v22.0/${igAccountId}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,media_product_type&limit=${limit}&access_token=${token}`;
      
      const response = await fetch(mediaUrl, { method: "GET" });
      const data = await readJsonSafe(response, `Instagram media for ${igAccountId}`);

      if (data.error) {
        console.error(`[fetch-organic-posts] Instagram API error for account ${igAccountId}:`, data.error);
        continue;
      }

      if (data.data && Array.isArray(data.data)) {
        console.log(`[fetch-organic-posts] Found ${data.data.length} Instagram posts for account ${igAccountId}`);
        
        for (const media of data.data) {
          posts.push(transformInstagramPost(media, igAccountId, igAccount.username));
        }
      }
    }
  } catch (err) {
    console.error("[fetch-organic-posts] Error fetching Instagram posts:", err);
  }

  return posts;
}

/**
 * Transform an Instagram media object into the OrganicPost format
 */
function transformInstagramPost(media: any, igAccountId: string, username?: string): OrganicPost {
  // Map Instagram media_type to our format
  let mediaType: 'image' | 'video' | 'carousel' = 'image';
  if (media.media_type === 'VIDEO') {
    mediaType = 'video';
  } else if (media.media_type === 'CAROUSEL_ALBUM') {
    mediaType = 'carousel';
  }

  return {
    id: `ig_${media.id}`,
    platform: 'meta',
    postId: media.id,
    pageId: igAccountId,
    message: media.caption,
    caption: media.caption,
    thumbnailUrl: media.thumbnail_url || media.media_url,
    mediaType,
    createdTime: media.timestamp,
    permalink: media.permalink,
    sourceNetwork: 'instagram',
  };
}
/**
 * Check if the input looks like a Spark Ads authorization code
 * Auth codes are typically base64-encoded strings, often with special characters
 */
function isSparkAuthCode(input: string): boolean {
  // Auth codes often start with # or contain special characters like +, /, =
  // and are NOT purely numeric (video IDs are numeric)
  const trimmed = input.trim().replace(/^#/, '');
  
  // Must contain at least some base64-ish characters and not be a simple numeric ID
  const hasSpecialChars = /[+/=]/.test(trimmed);
  const isNotNumeric = !/^\d+$/.test(trimmed);
  const isLongEnough = trimmed.length > 20;
  
  return hasSpecialChars && isNotNumeric && isLongEnough;
}

/**
 * Validate a Spark Ads authorization code and get video details
 */
async function validateSparkAuthCode(
  accessToken: string,
  advertiserId: string,
  authCode: string
): Promise<OrganicPost | null> {
  // Remove leading # if present
  const cleanAuthCode = authCode.trim().replace(/^#/, '');
  
  console.log(`[fetch-organic-posts] Validating Spark Ads auth code for advertiser ${advertiserId}`);
  
  // TikTok Business API v1.3 for Spark Ads validation
  const tiktokApiBases = [
    "https://business-api.tiktok.com/open_api/v1.3",
    "https://business-api.tiktok.com/open_api/v1.2",
  ];
  
  for (const baseUrl of tiktokApiBases) {
    try {
      // Use POST to validate the authorization code
      const validateUrl = `${baseUrl}/tt_video/authorize/`;
      
      console.log(`[fetch-organic-posts] Calling ${validateUrl} with auth_code`);
      
      const response = await fetch(validateUrl, {
        method: "POST",
        headers: {
          "Access-Token": accessToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          advertiser_id: advertiserId,
          auth_code: cleanAuthCode,
        }),
      });
      
      const data = await readJsonSafe(response, `tiktok tt_video/authorize (base=${baseUrl})`);
      
      console.log(`[fetch-organic-posts] Spark auth validation response (base=${baseUrl}):`, JSON.stringify(data));
      
      if (data?.error) {
        console.warn(`[fetch-organic-posts] tt_video/authorize error (base=${baseUrl}):`, data.error);
        continue;
      }
      
      // Success - code 0 means the auth code was validated
      if (data.code === 0 && data.data) {
        const videoData = data.data;
        
        return {
          id: videoData.item_id || videoData.video_id || 'unknown',
          platform: 'tiktok',
          postId: videoData.item_id || videoData.video_id || 'unknown',
          identityId: videoData.tt_account_id,
          caption: videoData.video_info?.video_text || videoData.caption || '',
          thumbnailUrl: videoData.video_info?.video_cover_url || videoData.cover_image_url,
          mediaType: 'video',
          createdTime: videoData.create_time
            ? new Date(videoData.create_time * 1000).toISOString()
            : undefined,
          isSparkEligible: true,
        };
      }
      
      // If we get a different response format, try to extract video info
      if (data.code === 0) {
        console.log(`[fetch-organic-posts] Auth code validated but no video data in response`);
        // The auth code was accepted - return a placeholder that indicates success
        return {
          id: 'spark-authorized',
          platform: 'tiktok',
          postId: 'spark-authorized',
          caption: 'Spark Ads authorized video',
          mediaType: 'video',
          isSparkEligible: true,
        };
      }
      
      // Log any error codes for debugging
      console.warn(`[fetch-organic-posts] tt_video/authorize returned code ${data.code}: ${data.message}`);
      
    } catch (err) {
      console.error(`[fetch-organic-posts] tt_video/authorize exception (base=${baseUrl}):`, err);
    }
  }
  
  return null;
}

/**
 * Fetch page access token from /me/accounts using user access token
 */
async function fetchMetaPageTokenFromAccounts(
  userAccessToken: string,
  targetPageId: string
): Promise<{ accessToken: string; pageName?: string } | null> {
  try {
    console.log(`[fetch-organic-posts] Fetching page token for ${targetPageId} via /me/accounts`);
    const res = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`,
      { method: "GET" }
    );
    const data = await readJsonSafe(res);

    if (data.error) {
      console.error("[fetch-organic-posts] /me/accounts error:", data.error);
      return null;
    }

    const pages: Array<{ id: string; name?: string; access_token?: string }> = data.data || [];
    const match = pages.find((p) => p.id === targetPageId);

    if (match?.access_token) {
      console.log(`[fetch-organic-posts] Found page token for ${targetPageId}`);
      return { accessToken: match.access_token, pageName: match.name };
    }

    console.log(`[fetch-organic-posts] Page ${targetPageId} not found in /me/accounts (${pages.length} pages returned)`);
    return null;
  } catch (err) {
    console.error("[fetch-organic-posts] fetchMetaPageTokenFromAccounts error:", err);
    return null;
  }
}

async function fetchMetaPostById(accessToken: string, postId: string): Promise<OrganicPost | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${postId}?fields=id,message,full_picture,created_time,permalink_url,from{id,name},attachments{media_type,media{image{width,height,src}},subattachments}&access_token=${accessToken}`,
      { method: "GET" }
    );

    const data = await readJsonSafe(response);
    if (data.error) {
      console.error("[fetch-organic-posts] Error fetching Meta post:", data.error);
      return null;
    }

    return transformMetaPost(data, data.from?.id);
  } catch (err) {
    console.error("[fetch-organic-posts] Error:", err);
    return null;
  }
}

async function fetchTikTokPostById(accessToken: string, advertiserId: string, itemId: string): Promise<OrganicPost | null> {
  try {
    // Use the tt_video/info endpoint to get video details
    const response = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/tt_video/info/?advertiser_id=${advertiserId}&item_ids=["${itemId}"]`,
      {
        method: "GET",
        headers: {
          "Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await readJsonSafe(response);
    if (data.error || data.code !== 0 || !data.data?.videos?.[0]) {
      console.error("[fetch-organic-posts] Error fetching TikTok post:", data.error || data);
      return null;
    }

    const video = data.data.videos[0];
    return {
      id: video.item_id || itemId,
      platform: 'tiktok',
      postId: video.item_id || itemId,
      caption: video.video_title || video.caption || '',
      thumbnailUrl: video.cover_image_url || video.video_cover_url,
      mediaType: 'video',
      createdTime: video.create_time ? new Date(video.create_time * 1000).toISOString() : undefined,
      isSparkEligible: true,
    };
  } catch (err) {
    console.error("[fetch-organic-posts] Error:", err);
    return null;
  }
}

function transformMetaPost(post: any, pageId?: string): OrganicPost {
  let mediaType: 'image' | 'video' | 'carousel' = 'image';
  let width: number | undefined;
  let height: number | undefined;
  
  if (post.attachments?.data?.[0]) {
    const attachment = post.attachments.data[0];
    if (attachment.media_type === 'video') {
      mediaType = 'video';
    } else if (attachment.subattachments?.data?.length > 1) {
      mediaType = 'carousel';
    }
    // Extract dimensions from attachment media image data
    const imageData = attachment.media?.image;
    if (imageData) {
      if (typeof imageData.width === 'number') width = imageData.width;
      if (typeof imageData.height === 'number') height = imageData.height;
    }
  }

  // Detect source network from permalink or post structure
  let sourceNetwork: 'facebook' | 'instagram' = 'facebook';
  const permalink = post.permalink_url || '';
  if (permalink.includes('instagram.com') || post.instagram_media_id) {
    sourceNetwork = 'instagram';
  }

  return {
    id: post.id,
    platform: 'meta',
    postId: post.id,
    pageId: pageId || post.from?.id,
    message: post.message,
    thumbnailUrl: post.full_picture,
    mediaType,
    createdTime: post.created_time,
    permalink: post.permalink_url,
    sourceNetwork,
    width,
    height,
  };
}
