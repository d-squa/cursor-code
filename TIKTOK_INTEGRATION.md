# TikTok Platform Integration Documentation

## Overview
TikTok has been integrated as an additional advertising platform in ActiPlan following the existing Meta architecture. This integration maintains 100% isolation from Meta code while providing the same high-level capabilities.

## Architecture

### Platform Abstraction Layer
Location: `supabase/functions/_shared/platform-adapter.ts`

All platforms implement the `PlatformAdapter` interface:
- `createCampaign()` - Creates campaigns
- `updateCampaign()` - Updates campaign settings
- `createAdGroup()` - Creates ad groups/ad sets
- `createCreative()` - Creates ads/creatives
- `fetchMetrics()` - Retrieves performance data
- `handleWebhook()` - Processes platform webhooks (optional)

### Objective Mapping Service
Location: `supabase/functions/_shared/objective-mapper.ts`

Handles translation between platform objectives using database mappings with intelligent fallbacks.

## Database Schema

### TikTok Tables
- `tiktok_ad_accounts` - Connected TikTok advertiser accounts
- `tiktok_campaigns` - Created campaigns
- `tiktok_ad_groups` - Ad groups within campaigns
- `tiktok_creatives` - Individual ads
- `tiktok_metrics` - Daily performance metrics

### Mapping Tables
- `platform_objective_mapping` - Objective translations (Meta → TikTok)
- `platform_placement_mapping` - Placement mappings
- `platform_targeting_mapping` - Interest/targeting mappings
- `platform_capability_gaps` - Feature support tracking

## Meta → TikTok Mappings

### Objectives
| Meta | TikTok | Notes |
|------|--------|-------|
| OUTCOME_AWARENESS | REACH | Awareness campaigns |
| OUTCOME_TRAFFIC | TRAFFIC | Website traffic |
| OUTCOME_ENGAGEMENT | VIDEO_VIEWS | Engagement via video |
| OUTCOME_LEADS | LEAD_GENERATION | Lead generation |
| OUTCOME_SALES | CONVERSIONS | Conversions/sales |
| OUTCOME_APP_PROMOTION | APP_PROMOTION | App installs |

### Placements
| Meta | TikTok | Supported |
|------|--------|-----------|
| feed | PLACEMENT_TIKTOK | ✅ |
| story | PLACEMENT_TIKTOK | ✅ |
| reels | PLACEMENT_TIKTOK | ✅ |
| audience_network | PLACEMENT_PANGLE | ✅ |
| marketplace | - | ❌ Not supported |
| messenger | - | ❌ Not supported |

### Optimization Goals
| Meta | TikTok |
|------|--------|
| REACH | REACH |
| LINK_CLICKS | CLICK |
| LANDING_PAGE_VIEWS | LANDING_PAGE |
| CONVERSIONS | CONVERT |
| VIDEO_VIEWS | VIDEO_VIEW |
| APP_INSTALLS | INSTALL |

## Platform Capability Gaps

### Unsupported Features
1. **Facebook Marketplace** - TikTok has no equivalent
   - Fallback: Exclude placement
   - Impact: Low

2. **Messenger** - TikTok has no messaging platform
   - Fallback: Exclude placement
   - Impact: Low

3. **Carousel Ads** - TikTok primarily supports single video
   - Fallback: Use single video format
   - Impact: Medium

4. **Collection Ads** - No direct equivalent
   - Fallback: Use video with product links
   - Impact: Medium

## Edge Functions

### TikTok OAuth Callback
Location: `supabase/functions/tiktok-oauth-callback/index.ts`

Handles TikTok OAuth flow:
1. Exchanges authorization code for access token
2. Fetches advertiser account details
3. Stores connection in `connected_platforms`
4. Inserts accounts into `tiktok_ad_accounts`

Required Secrets:
- `TIKTOK_APP_ID`
- `TIKTOK_APP_SECRET`

### Campaign Publishing
Location: `supabase/functions/push-campaign-to-dsp/index.ts`

Enhanced to support TikTok via `pushToTikTok()`:
1. Maps Meta objectives to TikTok objectives
2. Creates TikTok campaigns via adapter
3. Maps placements and targeting
4. Creates ad groups with targeting
5. Stores all entities in database

### Metrics Sync
Location: `supabase/functions/sync-tiktok-metrics/index.ts`

Daily sync of TikTok performance metrics:
- Fetches campaign and ad group metrics
- Normalizes to standard format
- Stores in `tiktok_metrics` table
- Scheduled via cron job (recommended)

## Configuration

### Platform Config
Location: `src/config/platforms.ts`

```typescript
tiktok: {
  appId: import.meta.env.VITE_TIKTOK_APP_ID || "",
  oauthScopes: "ad_management,user.info.basic",
  authEndpoint: "https://business-api.tiktok.com/portal/auth",
  tokenEndpoint: "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
  apiVersion: "v1.3",
  responseType: "code"
}
```

### Environment Variables
Required secrets (to be added):
- `TIKTOK_APP_ID` - TikTok app ID
- `TIKTOK_APP_SECRET` - TikTok app secret

## Testing Requirements

### Unit Tests
- Objective mapping logic
- Placement mapping logic
- Age group mapping
- Gender mapping
- Budget calculations

### Integration Tests
1. OAuth flow end-to-end
2. Campaign creation with all objective types
3. Ad group creation with targeting
4. Metrics fetch and normalization
5. Error handling for invalid inputs

### Regression Tests
- Verify Meta campaigns still work identically
- Verify Google Ads (if implemented) unaffected
- Verify no cross-contamination of data

## Error Handling

All TikTok operations are wrapped in try-catch blocks with:
- Detailed error logging
- Capability gap tracking for unsupported features
- Graceful fallbacks (never block workflow)
- User-friendly error messages

## Future Enhancements

1. **Creative Management** - Upload and manage TikTok video assets
2. **Custom Audiences** - Sync custom audience lists
3. **Lookalike Audiences** - Create TikTok lookalike audiences
4. **Spark Ads** - Support for organic post boosting
5. **Shopping Ads** - Product catalog integration
6. **Webhook Handler** - Real-time event processing

## Maintenance

### Adding New Platforms
1. Create platform-specific tables
2. Implement `PlatformAdapter` interface
3. Add mappings to database
4. Update `push-campaign-to-dsp` function
5. Create metrics sync function
6. Add OAuth callback handler

### Updating Mappings
All mappings are in database tables and can be updated via SQL:
```sql
INSERT INTO platform_objective_mapping 
(source_platform, source_objective, target_platform, target_objective)
VALUES ('meta', 'NEW_OBJECTIVE', 'tiktok', 'TIKTOK_EQUIVALENT');
```

## Security Considerations

- All TikTok tables have RLS policies
- Access tokens stored encrypted
- Service role required for metrics sync
- User can only access their own data
- JWT verification enabled for all functions
