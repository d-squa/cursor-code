// Feature access configuration mapping features to subscription tiers
import { SubscriptionTier, tierHasAccess } from './subscriptionTiers';

// All features in the system
export type Feature =
  // Core Campaign Management (Trial+)
  | 'campaign_create'
  | 'campaign_edit'
  | 'campaign_delete'
  | 'campaign_status'
  | 'client_management'
  | 'bo_number'
  // Multi-Platform Support (Trial+)
  | 'platform_connections'
  | 'platform_meta'
  | 'platform_tiktok'
  | 'platform_sync'
  // Targeting & Audiences (Trial+)
  | 'basic_targeting'
  | 'unified_targeting_search'
  | 'custom_audiences'
  | 'lookalike_audiences'
  | 'retargeting'
  | 'broad_targeting'
  | 'phase_targeting_override'
  // Budget & Allocation (Trial+)
  | 'budget_configuration'
  | 'platform_budget_splits'
  | 'market_budget_allocation'
  | 'phase_budget_distribution'
  | 'budget_type_cbo_abo'
  // Campaign Configuration (Trial+)
  | 'objective_selection'
  | 'auto_generate_strategy'
  | 'phase_funnel_config'
  | 'ad_format_selection'
  | 'conversion_location'
  | 'bid_strategy'
  | 'taxonomy_builder'
  // Forecasting (Trial+)
  | 'basic_forecast'
  | 'meta_rf_prediction'
  | 'tiktok_rf_forecast'
  // Import/Export (Trial+)
  | 'excel_import'
  | 'pdf_export'
  | 'excel_export'
  // Launch & Activation (Trial+)
  | 'campaign_validation'
  | 'push_to_dsp'
  | 'launch_status'
  | 'retry_failed'
  // Basic Reporting (Trial+)
  | 'topline_reports'
  | 'campaign_insights_basic'
  // Account Management (Trial+)
  | 'profile_settings'
  | 'account_deletion'
  | 'bug_reporting'
  // Visual Dashboard (Basic+)
  | 'visual_dashboard'
  | 'interactive_charts'
  | 'scorecards'
  | 'time_series_charts'
  | 'budget_pacing'
  | 'coverage_evolution'
  // Approval Workflow (Enterprise+)
  | 'approval_workflow'
  | 'approval_dialog'
  // Modification Requests (Enterprise+)
  | 'modification_requests'
  | 'modification_notifications'
  // Change History (Enterprise+)
  | 'change_history'
  | 'audit_log'
  // Team Management (Enterprise+)
  | 'team_management'
  | 'team_creation'
  | 'member_invitations'
  | 'role_assignment'
  | 'user_management'
  // User Permissions (Enterprise+)
  | 'user_permissions'
  | 'role_based_access'
  // HawkView Reports (Enterprise+)
  | 'hawkview_reports'
  | 'dimension_breakdown'
  | 'heatmap_tables'
  | 'phase_filter'
  // Admin Features (Agency)
  | 'admin_role'
  | 'unlimited_actiplans';

// Minimum tier required for each feature
const FEATURE_TIERS: Record<Feature, SubscriptionTier> = {
  // Core Campaign Management - Trial+
  campaign_create: 'trial',
  campaign_edit: 'trial',
  campaign_delete: 'trial',
  campaign_status: 'trial',
  client_management: 'enterprise',
  bo_number: 'trial',
  
  // Multi-Platform Support - Trial+
  platform_connections: 'trial',
  platform_meta: 'trial',
  platform_tiktok: 'trial',
  platform_sync: 'trial',
  
  // Targeting & Audiences - Trial+
  basic_targeting: 'trial',
  unified_targeting_search: 'trial',
  custom_audiences: 'trial',
  lookalike_audiences: 'trial',
  retargeting: 'trial',
  broad_targeting: 'trial',
  phase_targeting_override: 'trial',
  
  // Budget & Allocation - Trial+
  budget_configuration: 'trial',
  platform_budget_splits: 'trial',
  market_budget_allocation: 'trial',
  phase_budget_distribution: 'trial',
  budget_type_cbo_abo: 'trial',
  
  // Campaign Configuration - Trial+
  objective_selection: 'trial',
  auto_generate_strategy: 'trial',
  phase_funnel_config: 'trial',
  ad_format_selection: 'trial',
  conversion_location: 'trial',
  bid_strategy: 'trial',
  taxonomy_builder: 'trial',
  
  // Forecasting - Trial+
  basic_forecast: 'trial',
  meta_rf_prediction: 'trial',
  tiktok_rf_forecast: 'trial',
  
  // Import/Export - Trial+
  excel_import: 'trial',
  pdf_export: 'trial',
  excel_export: 'trial',
  
  // Launch & Activation - Trial+
  campaign_validation: 'trial',
  push_to_dsp: 'trial',
  launch_status: 'trial',
  retry_failed: 'trial',
  
  // Basic Reporting - Trial+
  topline_reports: 'trial',
  campaign_insights_basic: 'trial',
  
  // Account Management - Trial+
  profile_settings: 'trial',
  account_deletion: 'trial',
  bug_reporting: 'trial',
  
  // Visual Dashboard - Basic+
  visual_dashboard: 'basic',
  interactive_charts: 'basic',
  scorecards: 'basic',
  time_series_charts: 'basic',
  budget_pacing: 'basic',
  coverage_evolution: 'basic',
  
  // Approval Workflow - Enterprise+
  approval_workflow: 'enterprise',
  approval_dialog: 'enterprise',
  
  // Modification Requests - Enterprise+
  modification_requests: 'enterprise',
  modification_notifications: 'enterprise',
  
  // Change History - Enterprise+
  change_history: 'enterprise',
  audit_log: 'enterprise',
  
  // Team Management - Enterprise+
  team_management: 'enterprise',
  team_creation: 'enterprise',
  member_invitations: 'enterprise',
  role_assignment: 'enterprise',
  user_management: 'enterprise',
  
  // User Permissions - Enterprise+
  user_permissions: 'enterprise',
  role_based_access: 'enterprise',
  
  // HawkView Reports - Enterprise+
  hawkview_reports: 'enterprise',
  dimension_breakdown: 'enterprise',
  heatmap_tables: 'enterprise',
  phase_filter: 'enterprise',
  
  // Admin Features - Agency only
  admin_role: 'agency',
  unlimited_actiplans: 'agency',
};

// Check if a user has access to a feature
export function hasFeatureAccess(userTier: SubscriptionTier, feature: Feature): boolean {
  const requiredTier = FEATURE_TIERS[feature];
  return tierHasAccess(userTier, requiredTier);
}

// Get the minimum tier required for a feature
export function getRequiredTier(feature: Feature): SubscriptionTier {
  return FEATURE_TIERS[feature];
}

// Get all features available for a tier
export function getFeaturesForTier(tier: SubscriptionTier): Feature[] {
  return (Object.entries(FEATURE_TIERS) as [Feature, SubscriptionTier][])
    .filter(([_, requiredTier]) => tierHasAccess(tier, requiredTier))
    .map(([feature]) => feature);
}

// Get features that would be unlocked by upgrading to a tier
export function getUpgradeFeatures(currentTier: SubscriptionTier, targetTier: SubscriptionTier): Feature[] {
  const currentFeatures = new Set(getFeaturesForTier(currentTier));
  const targetFeatures = getFeaturesForTier(targetTier);
  return targetFeatures.filter(f => !currentFeatures.has(f));
}
