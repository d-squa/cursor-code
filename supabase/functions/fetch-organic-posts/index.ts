import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
}

async function readJsonSafe(response: Response): Promise<any> {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    return {
      error: {
        message: 'Non-JSON response',
        status: response.status,
        body: raw.slice(0, 500),
      },
    };
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

    // Get user from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
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
        `https://graph.facebook.com/v22.0/${pageId}/feed?fields=id,message,full_picture,created_time,permalink_url,is_published,attachments{media_type,media,subattachments}&limit=${limit}&access_token=${token}`,
        { method: "GET" }
      );
      return await readJsonSafe(res);
    };

    const fetchPosts = async (token: string) => {
      const res = await fetch(
        `https://graph.facebook.com/v22.0/${pageId}/posts?fields=id,message,full_picture,created_time,permalink_url,is_published,attachments{media_type,media,subattachments}&limit=${limit}&access_token=${token}`,
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
  }

  console.log(`[fetch-organic-posts] Found ${posts.length} Meta posts`);
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

  const posts: OrganicPost[] = [];

  // If looking up a specific post by ID or URL
  if (postIdOrUrl) {
    const itemId = extractTikTokPostId(postIdOrUrl);
    if (itemId && resolvedAdvertiserId) {
      const post = await fetchTikTokPostById(accessToken, resolvedAdvertiserId, itemId);
      if (post) posts.push(post);
    }
    return new Response(
      JSON.stringify({ posts }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // If identityId provided, fetch authorized posts for Spark Ads
  if (identityId && resolvedAdvertiserId) {
    try {
      // Strategy 1: Use identity/video/list to get videos for the identity
      const identityVideoUrl = `https://business-api.tiktok.com/open_api/v1.3/identity/video/list/`;
      const identityVideoBody = {
        advertiser_id: resolvedAdvertiserId,
        identity_id: identityId,
        identity_type: "TT_USER",
      };
      
      console.log(`[fetch-organic-posts] Fetching TikTok identity videos for identity ${identityId}`);
      
      const identityResponse = await fetch(identityVideoUrl, {
        method: "POST",
        headers: {
          "Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(identityVideoBody),
      });

      const identityData = await readJsonSafe(identityResponse);
      console.log(`[fetch-organic-posts] TikTok identity/video/list response code: ${identityData.code}, message: ${identityData.message || 'none'}, videos count: ${identityData.data?.video_list?.length || 0}`);

      if (identityData.code === 0 && identityData.data?.video_list) {
        for (const video of identityData.data.video_list.slice(0, limit)) {
          posts.push({
            id: video.item_id || video.video_id,
            platform: 'tiktok',
            postId: video.item_id || video.video_id,
            identityId,
            caption: video.display_name || video.video_text || '',
            thumbnailUrl: video.video_cover_url || video.poster_url,
            mediaType: 'video',
            createdTime: video.create_time ? new Date(video.create_time * 1000).toISOString() : undefined,
            isSparkEligible: true,
            permalink: video.item_id ? `https://www.tiktok.com/@user/video/${video.item_id}` : undefined,
          });
        }
      }

      // Strategy 2: If no videos found, try bc/asset/get for TT_ACCOUNT assets
      if (posts.length === 0) {
        const bcId = platform.metadata?.bc_id;
        if (bcId) {
          console.log(`[fetch-organic-posts] Trying BC asset fetch for bc_id ${bcId}`);
          const bcAssetUrl = `https://business-api.tiktok.com/open_api/v1.3/bc/asset/get/`;
          const bcAssetBody = {
            bc_id: bcId,
            asset_type: "TT_ACCOUNT",
            page: 1,
            page_size: limit,
          };
          
          const bcResponse = await fetch(bcAssetUrl, {
            method: "POST",
            headers: {
              "Access-Token": accessToken,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(bcAssetBody),
          });

          const bcData = await readJsonSafe(bcResponse);
          console.log(`[fetch-organic-posts] TikTok bc/asset/get response code: ${bcData.code}, assets: ${bcData.data?.list?.length || 0}`);
          
          // This returns TikTok accounts, not videos - we'd need to fetch videos for each
        }
      }

      // Strategy 3: Try spark_ad authorized post list
      if (posts.length === 0) {
        console.log(`[fetch-organic-posts] Trying Spark Ad authorized posts for advertiser ${resolvedAdvertiserId}`);
        const sparkAuthUrl = `https://business-api.tiktok.com/open_api/v1.3/creative/spark_ads/authorized_posts/get/`;
        const sparkAuthBody = {
          advertiser_id: resolvedAdvertiserId,
          page: 1,
          page_size: limit,
        };
        
        const sparkResponse = await fetch(sparkAuthUrl, {
          method: "POST",
          headers: {
            "Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sparkAuthBody),
        });

        const sparkData = await readJsonSafe(sparkResponse);
        console.log(`[fetch-organic-posts] TikTok spark_ads/authorized_posts response code: ${sparkData.code}, posts: ${sparkData.data?.authorized_posts?.length || 0}`);

        if (sparkData.code === 0 && sparkData.data?.authorized_posts) {
          for (const post of sparkData.data.authorized_posts.slice(0, limit)) {
            posts.push({
              id: post.item_id || post.video_id,
              platform: 'tiktok',
              postId: post.item_id || post.video_id,
              identityId: post.tt_account_id || identityId,
              caption: post.video_info?.video_text || post.caption || '',
              thumbnailUrl: post.video_info?.video_cover_url || post.cover_image_url,
              mediaType: 'video',
              createdTime: post.create_time ? new Date(post.create_time * 1000).toISOString() : undefined,
              isSparkEligible: true,
            });
          }
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
      `https://graph.facebook.com/v22.0/${postId}?fields=id,message,full_picture,created_time,permalink_url,from{id,name},attachments{media_type,media,subattachments}&access_token=${accessToken}`,
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
  
  if (post.attachments?.data?.[0]) {
    const attachment = post.attachments.data[0];
    if (attachment.media_type === 'video') {
      mediaType = 'video';
    } else if (attachment.subattachments?.data?.length > 1) {
      mediaType = 'carousel';
    }
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
  };
}
