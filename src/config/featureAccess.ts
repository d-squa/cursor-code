// Feature access configuration mapping features to subscription tiers
import { SubscriptionTier, tierHasAccess } from './subscriptionTiers';

// All features in the system
export type Feature =
  // Campaign/ActiPlan Management
  | 'create_actiplans'
  | 'edit_actiplans'
  | 'delete_actiplans'
  | 'duplicate_actiplans'
  | 'campaign_status_tracking'
  | 'change_history_dialog'
  
  // Media Plan Creation
  | 'guided_media_plan_wizard'
  | 'ai_auto_generate_strategy'
  | 'total_budget_allocation'
  | 'platform_budget_splits'
  | 'market_budget_splits'
  | 'phase_budget_splits'
  | 'hierarchical_timeline_scheduler'
  
  // Platform Integrations
  | 'meta_oauth_connection'
  | 'tiktok_oauth_connection'
  | 'multiple_connections_per_platform'
  | 'ad_account_syncing'
  | 'google_ads_forecast'
  
  // Client Management
  | 'client_management'
  | 'assign_clients_to_teams'
  | 'client_default_targeting'
  | 'link_multiple_ad_accounts'
  | 'client_market_configuration'
  | 'client_platform_selection'
  
  // Ad Account Defaults Configuration
  | 'bid_strategy_defaults'
  | 'budget_type_defaults'
  | 'optimization_location_defaults'
  | 'pixel_event_defaults'
  | 'page_instagram_defaults'
  | 'app_defaults'
  | 'catalog_product_set_defaults'
  | 'placement_defaults'
  | 'conversion_window_defaults'
  | 'billing_event_defaults'
  | 'attribution_window_defaults'
  | 'messaging_channel_defaults'
  
  // Taxonomy System
  | 'taxonomy_templates'
  | 'custom_taxonomy_building'
  | 'auto_generated_taxonomy_names'
  | 'taxonomy_timestamp_suffix'
  | 'taxonomy_preview'
  
  // Targeting Features
  | 'unified_targeting_search'
  | 'basic_targeting'
  | 'interest_targeting'
  | 'tiktok_targeting'
  | 'broad_targeting_toggle'
  | 'override_campaign_targeting'
  | 'bulk_targeting_selection'
  | 'targeting_type_auto_detection'
  
  // Audience Features
  | 'retargeting_audience'
  | 'lookalike_audience'
  | 'custom_audience'
  | 'audience_recommendation_preview'
  
  // Forecasting
  | 'meta_rf_prediction'
  | 'tiktok_rf_forecast'
  | 'google_ads_forecast_feature'
  | 'benchmark_forecasting'
  | 'forecast_data_display'
  
  // Campaign Activation
  | 'pre_push_validation'
  | 'push_to_meta'
  | 'push_to_tiktok'
  | 'launch_status_view'
  | 'validation_error_display'
  | 'retry_failed_pushes'
  | 'partially_pushed_tracking'
  
  // Performance Reporting
  | 'performance_dashboard'
  | 'metric_scorecards'
  | 'period_comparison'
  | 'time_series_charts'
  | 'budget_pacing_chart'
  | 'coverage_evolution_chart'
  | 'dimension_breakdown_charts'
  | 'cost_rate_metrics'
  | 'multi_dimensional_filtering'
  | 'download_charts_csv'
  
  // Approval Workflow
  | 'request_modifications'
  | 'modification_request_dialog'
  | 'modification_status_tracking'
  | 'status_history_logging'
  | 'email_notifications_approvers'
  | 'assigned_approvers_selection'
  
  // Team Management
  | 'team_management'
  | 'team_descriptions'
  | 'assign_clients_teams'
  | 'view_team_campaigns'
  
  // User/Activator Management
  | 'user_management'
  | 'invite_team_members'
  | 'role_assignment'
  | 'accept_invitation'
  | 'remove_team_members'
  
  // Billing & Subscription (available to all)
  | 'plan_selection'
  | 'monthly_yearly_toggle'
  | 'stripe_checkout'
  | 'customer_portal'
  | 'plan_upgrade_downgrade'
  
  // Account Settings (available to all)
  | 'company_name_config'
  | 'account_deletion'
  | 'billing_management'
  
  // Bug Reporting (available to all)
  | 'bug_report_button'
  | 'bug_report_navbar'
  | 'screenshot_capture'
  | 'description_input'
  | 'email_submission'
  
  // Onboarding (available to all)
  | 'onboarding_survey'
  | 'company_role_collection'
  | 'familiarity_assessment'
  | 'discovery_tracking'
  
  // ActiPlan Deliverables
  | 'pdf_export'
  | 'excel_export';

// Minimum tier required for each feature
const FEATURE_TIERS: Record<Feature, SubscriptionTier> = {
  // Campaign/ActiPlan Management
  create_actiplans: 'trial',
  edit_actiplans: 'trial',
  delete_actiplans: 'trial',
  duplicate_actiplans: 'freelancer',
  campaign_status_tracking: 'trial',
  change_history_dialog: 'trial',
  
  // Media Plan Creation
  guided_media_plan_wizard: 'freelancer',
  ai_auto_generate_strategy: 'trial',
  total_budget_allocation: 'trial',
  platform_budget_splits: 'trial',
  market_budget_splits: 'trial',
  phase_budget_splits: 'trial',
  hierarchical_timeline_scheduler: 'trial',
  
  // Platform Integrations
  meta_oauth_connection: 'trial',
  tiktok_oauth_connection: 'trial',
  multiple_connections_per_platform: 'enterprise',
  ad_account_syncing: 'trial',
  google_ads_forecast: 'trial',
  
  // Client Management
  client_management: 'enterprise',
  assign_clients_to_teams: 'enterprise',
  client_default_targeting: 'enterprise',
  link_multiple_ad_accounts: 'enterprise',
  client_market_configuration: 'enterprise',
  client_platform_selection: 'enterprise',
  
  // Ad Account Defaults Configuration
  bid_strategy_defaults: 'enterprise',
  budget_type_defaults: 'enterprise',
  optimization_location_defaults: 'enterprise',
  pixel_event_defaults: 'enterprise',
  page_instagram_defaults: 'enterprise',
  app_defaults: 'enterprise',
  catalog_product_set_defaults: 'enterprise',
  placement_defaults: 'enterprise',
  conversion_window_defaults: 'enterprise',
  billing_event_defaults: 'enterprise',
  attribution_window_defaults: 'enterprise',
  messaging_channel_defaults: 'enterprise',
  
  // Taxonomy System
  taxonomy_templates: 'enterprise',
  custom_taxonomy_building: 'enterprise',
  auto_generated_taxonomy_names: 'trial',
  taxonomy_timestamp_suffix: 'trial',
  taxonomy_preview: 'trial',
  
  // Targeting Features
  unified_targeting_search: 'trial',
  basic_targeting: 'trial',
  interest_targeting: 'trial',
  tiktok_targeting: 'trial',
  broad_targeting_toggle: 'trial',
  override_campaign_targeting: 'trial',
  bulk_targeting_selection: 'trial',
  targeting_type_auto_detection: 'trial',
  
  // Audience Features
  retargeting_audience: 'trial',
  lookalike_audience: 'trial',
  custom_audience: 'trial',
  audience_recommendation_preview: 'trial',
  
  // Forecasting
  meta_rf_prediction: 'trial',
  tiktok_rf_forecast: 'trial',
  google_ads_forecast_feature: 'trial',
  benchmark_forecasting: 'freelancer',
  forecast_data_display: 'trial',
  
  // Campaign Activation
  pre_push_validation: 'trial',
  push_to_meta: 'trial',
  push_to_tiktok: 'trial',
  launch_status_view: 'trial',
  validation_error_display: 'trial',
  retry_failed_pushes: 'trial',
  partially_pushed_tracking: 'trial',
  
  // Performance Reporting
  performance_dashboard: 'trial',
  metric_scorecards: 'trial',
  period_comparison: 'trial',
  time_series_charts: 'enterprise',
  budget_pacing_chart: 'enterprise',
  coverage_evolution_chart: 'enterprise',
  dimension_breakdown_charts: 'trial',
  cost_rate_metrics: 'trial',
  multi_dimensional_filtering: 'enterprise',
  download_charts_csv: 'enterprise',
  
  // Approval Workflow
  request_modifications: 'enterprise',
  modification_request_dialog: 'enterprise',
  modification_status_tracking: 'enterprise',
  status_history_logging: 'enterprise',
  email_notifications_approvers: 'enterprise',
  assigned_approvers_selection: 'enterprise',
  
  // Team Management
  team_management: 'enterprise',
  team_descriptions: 'enterprise',
  assign_clients_teams: 'enterprise',
  view_team_campaigns: 'enterprise',
  
  // User/Activator Management
  user_management: 'enterprise',
  invite_team_members: 'enterprise',
  role_assignment: 'enterprise',
  accept_invitation: 'enterprise',
  remove_team_members: 'enterprise',
  
  // Billing & Subscription
  plan_selection: 'trial',
  monthly_yearly_toggle: 'trial',
  stripe_checkout: 'trial',
  customer_portal: 'trial',
  plan_upgrade_downgrade: 'trial',
  
  // Account Settings
  company_name_config: 'trial',
  account_deletion: 'trial',
  billing_management: 'trial',
  
  // Bug Reporting
  bug_report_button: 'trial',
  bug_report_navbar: 'trial',
  screenshot_capture: 'trial',
  description_input: 'trial',
  email_submission: 'trial',
  
  // Onboarding
  onboarding_survey: 'trial',
  company_role_collection: 'trial',
  familiarity_assessment: 'trial',
  discovery_tracking: 'trial',
  
  // ActiPlan Deliverables
  pdf_export: 'enterprise',
  excel_export: 'enterprise',
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
