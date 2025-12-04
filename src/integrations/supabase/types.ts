export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      campaign_change_history: {
        Row: {
          action: string
          campaign_id: string
          change_type: string | null
          created_at: string | null
          description: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          campaign_id: string
          change_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          campaign_id?: string
          change_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_change_history_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_change_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_insights: {
        Row: {
          ad_account_id: string | null
          campaign_dsp_id: string | null
          campaign_id: string
          created_at: string
          fetched_at: string
          id: string
          metrics: Json
          platform: string
          updated_at: string
          weekly_metrics: Json
        }
        Insert: {
          ad_account_id?: string | null
          campaign_dsp_id?: string | null
          campaign_id: string
          created_at?: string
          fetched_at?: string
          id?: string
          metrics?: Json
          platform: string
          updated_at?: string
          weekly_metrics?: Json
        }
        Update: {
          ad_account_id?: string | null
          campaign_dsp_id?: string | null
          campaign_id?: string
          created_at?: string
          fetched_at?: string
          id?: string
          metrics?: Json
          platform?: string
          updated_at?: string
          weekly_metrics?: Json
        }
        Relationships: [
          {
            foreignKeyName: "campaign_insights_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_performance_benchmarks: {
        Row: {
          avg_cost_per_result: number | null
          campaign_count: number
          created_at: string
          date_range_end: string
          date_range_start: string
          id: string
          impressions: number
          industry: string | null
          market: string
          optimization_goal: string
          total_results: number
          total_spend: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_cost_per_result?: number | null
          campaign_count?: number
          created_at?: string
          date_range_end: string
          date_range_start: string
          id?: string
          impressions?: number
          industry?: string | null
          market: string
          optimization_goal: string
          total_results?: number
          total_spend?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_cost_per_result?: number | null
          campaign_count?: number
          created_at?: string
          date_range_end?: string
          date_range_start?: string
          id?: string
          impressions?: number
          industry?: string | null
          market?: string
          optimization_goal?: string
          total_results?: number
          total_spend?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          bo_number: string | null
          budget_allocation: Json
          created_at: string
          end_date: string | null
          forecast_data: Json | null
          generic_config: Json | null
          id: string
          market_splits: Json | null
          name: string
          objective: string
          pdf_url: string | null
          platforms: Json
          published_at: string | null
          start_date: string | null
          status: string | null
          team_id: string | null
          total_budget: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bo_number?: string | null
          budget_allocation?: Json
          created_at?: string
          end_date?: string | null
          forecast_data?: Json | null
          generic_config?: Json | null
          id?: string
          market_splits?: Json | null
          name: string
          objective: string
          pdf_url?: string | null
          platforms?: Json
          published_at?: string | null
          start_date?: string | null
          status?: string | null
          team_id?: string | null
          total_budget?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bo_number?: string | null
          budget_allocation?: Json
          created_at?: string
          end_date?: string | null
          forecast_data?: Json | null
          generic_config?: Json | null
          id?: string
          market_splits?: Json | null
          name?: string
          objective?: string
          pdf_url?: string | null
          platforms?: Json
          published_at?: string | null
          start_date?: string | null
          status?: string | null
          team_id?: string | null
          total_budget?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          app_name: string | null
          business_objective: string
          created_at: string
          default_age_max: number | null
          default_age_min: number | null
          default_devices: Json | null
          default_gender: string | null
          default_languages: Json | null
          id: string
          industry: string
          markets: Json | null
          name: string
          platforms: Json | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          app_name?: string | null
          business_objective: string
          created_at?: string
          default_age_max?: number | null
          default_age_min?: number | null
          default_devices?: Json | null
          default_gender?: string | null
          default_languages?: Json | null
          id?: string
          industry: string
          markets?: Json | null
          name: string
          platforms?: Json | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          app_name?: string | null
          business_objective?: string
          created_at?: string
          default_age_max?: number | null
          default_age_min?: number | null
          default_devices?: Json | null
          default_gender?: string | null
          default_languages?: Json | null
          id?: string
          industry?: string
          markets?: Json | null
          name?: string
          platforms?: Json | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      connected_platforms: {
        Row: {
          access_token: string | null
          ad_account_id: string | null
          ad_account_name: string | null
          business_manager_id: string | null
          created_at: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          platform_name: string
          platform_type: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          ad_account_id?: string | null
          ad_account_name?: string | null
          business_manager_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          platform_name: string
          platform_type: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          ad_account_id?: string | null
          ad_account_name?: string | null
          business_manager_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          platform_name?: string
          platform_type?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          team_id: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by: string
          email: string
          expires_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          team_id?: string | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          team_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          account_id: string
          account_name: string
          account_status: string | null
          client_id: string | null
          created_at: string
          currency: string | null
          default_advantage_plus_placements: boolean | null
          default_age_max: number | null
          default_age_min: number | null
          default_app_id: string | null
          default_app_store: string | null
          default_bid_amount: number | null
          default_bid_strategy: string | null
          default_billing_event: string | null
          default_catalog_id: string | null
          default_click_window: number | null
          default_conversion_budget_type: string | null
          default_conversion_event: string | null
          default_devices: Json | null
          default_gender: string | null
          default_instagram_account_id: string | null
          default_instagram_dm_enabled: boolean | null
          default_landing_page_url: string | null
          default_languages: Json | null
          default_messaging_mode: string | null
          default_messenger_enabled: boolean | null
          default_non_conversion_budget_type: string | null
          default_optimization_location: string | null
          default_page_id: string | null
          default_pixel_id: string | null
          default_positions: Json | null
          default_product_set_id: string | null
          default_publisher_platforms: Json | null
          default_view_window: number | null
          default_whatsapp_enabled: boolean | null
          default_whatsapp_number: string | null
          id: string
          main_markets: Json | null
          synced_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          account_name: string
          account_status?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          default_advantage_plus_placements?: boolean | null
          default_age_max?: number | null
          default_age_min?: number | null
          default_app_id?: string | null
          default_app_store?: string | null
          default_bid_amount?: number | null
          default_bid_strategy?: string | null
          default_billing_event?: string | null
          default_catalog_id?: string | null
          default_click_window?: number | null
          default_conversion_budget_type?: string | null
          default_conversion_event?: string | null
          default_devices?: Json | null
          default_gender?: string | null
          default_instagram_account_id?: string | null
          default_instagram_dm_enabled?: boolean | null
          default_landing_page_url?: string | null
          default_languages?: Json | null
          default_messaging_mode?: string | null
          default_messenger_enabled?: boolean | null
          default_non_conversion_budget_type?: string | null
          default_optimization_location?: string | null
          default_page_id?: string | null
          default_pixel_id?: string | null
          default_positions?: Json | null
          default_product_set_id?: string | null
          default_publisher_platforms?: Json | null
          default_view_window?: number | null
          default_whatsapp_enabled?: boolean | null
          default_whatsapp_number?: string | null
          id?: string
          main_markets?: Json | null
          synced_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          account_name?: string
          account_status?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          default_advantage_plus_placements?: boolean | null
          default_age_max?: number | null
          default_age_min?: number | null
          default_app_id?: string | null
          default_app_store?: string | null
          default_bid_amount?: number | null
          default_bid_strategy?: string | null
          default_billing_event?: string | null
          default_catalog_id?: string | null
          default_click_window?: number | null
          default_conversion_budget_type?: string | null
          default_conversion_event?: string | null
          default_devices?: Json | null
          default_gender?: string | null
          default_instagram_account_id?: string | null
          default_instagram_dm_enabled?: boolean | null
          default_landing_page_url?: string | null
          default_languages?: Json | null
          default_messaging_mode?: string | null
          default_messenger_enabled?: boolean | null
          default_non_conversion_budget_type?: string | null
          default_optimization_location?: string | null
          default_page_id?: string | null
          default_pixel_id?: string | null
          default_positions?: Json | null
          default_product_set_id?: string | null
          default_publisher_platforms?: Json | null
          default_view_window?: number | null
          default_whatsapp_enabled?: boolean | null
          default_whatsapp_number?: string | null
          id?: string
          main_markets?: Json | null
          synced_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_catalogs: {
        Row: {
          catalog_id: string
          catalog_name: string
          created_at: string
          id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          catalog_id: string
          catalog_name: string
          created_at?: string
          id?: string
          synced_at?: string
          user_id: string
        }
        Update: {
          catalog_id?: string
          catalog_name?: string
          created_at?: string
          id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meta_conversion_events: {
        Row: {
          created_at: string
          event_name: string
          event_type: string | null
          id: string
          pixel_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_name: string
          event_type?: string | null
          id?: string
          pixel_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_name?: string
          event_type?: string | null
          id?: string
          pixel_id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meta_instagram_accounts: {
        Row: {
          created_at: string
          id: string
          instagram_account_id: string
          synced_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          instagram_account_id: string
          synced_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          instagram_account_id?: string
          synced_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      meta_pages: {
        Row: {
          access_token: string | null
          category: string | null
          created_at: string
          id: string
          page_id: string
          page_name: string
          synced_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          category?: string | null
          created_at?: string
          id?: string
          page_id: string
          page_name: string
          synced_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          category?: string | null
          created_at?: string
          id?: string
          page_id?: string
          page_name?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meta_pixels: {
        Row: {
          ad_account_id: string
          created_at: string
          id: string
          pixel_id: string
          pixel_name: string
          synced_at: string
          user_id: string
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          id?: string
          pixel_id: string
          pixel_name: string
          synced_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          id?: string
          pixel_id?: string
          pixel_name?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meta_product_sets: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          product_set_id: string
          product_set_name: string
          synced_at: string
          user_id: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          product_set_id: string
          product_set_name: string
          synced_at?: string
          user_id: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          id?: string
          product_set_id?: string
          product_set_name?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      modification_requests: {
        Row: {
          assigned_to: string[] | null
          campaign_id: string
          change_type: string
          created_at: string | null
          description: string
          id: string
          notify_all_team: boolean | null
          requester_id: string
          status: string
          status_history: Json | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string[] | null
          campaign_id: string
          change_type: string
          created_at?: string | null
          description: string
          id?: string
          notify_all_team?: boolean | null
          requester_id: string
          status?: string
          status_history?: Json | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string[] | null
          campaign_id?: string
          change_type?: string
          created_at?: string | null
          description?: string
          id?: string
          notify_all_team?: boolean | null
          requester_id?: string
          status?: string
          status_history?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "modification_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modification_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_accounts: {
        Row: {
          account_id: string
          account_name: string
          account_type: string
          connected_platform_id: string
          created_at: string
          id: string
          metadata: Json | null
        }
        Insert: {
          account_id: string
          account_name: string
          account_type: string
          connected_platform_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          account_id?: string
          account_name?: string
          account_type?: string
          connected_platform_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_accounts_connected_platform_id_fkey"
            columns: ["connected_platform_id"]
            isOneToOne: false
            referencedRelation: "connected_platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_accounts_connected_platform_id_fkey"
            columns: ["connected_platform_id"]
            isOneToOne: false
            referencedRelation: "connected_platforms_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_capability_gaps: {
        Row: {
          created_at: string
          fallback_behavior: string | null
          feature_name: string
          feature_type: string
          id: string
          impact_level: string | null
          is_supported: boolean | null
          meta_equivalent: string | null
          notes: string | null
          platform: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fallback_behavior?: string | null
          feature_name: string
          feature_type: string
          id?: string
          impact_level?: string | null
          is_supported?: boolean | null
          meta_equivalent?: string | null
          notes?: string | null
          platform: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fallback_behavior?: string | null
          feature_name?: string
          feature_type?: string
          id?: string
          impact_level?: string | null
          is_supported?: boolean | null
          meta_equivalent?: string | null
          notes?: string | null
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_objective_mapping: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          source_objective: string
          source_platform: string
          target_objective: string
          target_platform: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          source_objective: string
          source_platform: string
          target_objective: string
          target_platform: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          source_objective?: string
          source_platform?: string
          target_objective?: string
          target_platform?: string
        }
        Relationships: []
      }
      platform_placement_mapping: {
        Row: {
          created_at: string
          fallback_placement: string | null
          id: string
          is_supported: boolean | null
          notes: string | null
          source_placement: string
          source_platform: string
          target_placement: string | null
          target_platform: string
        }
        Insert: {
          created_at?: string
          fallback_placement?: string | null
          id?: string
          is_supported?: boolean | null
          notes?: string | null
          source_placement: string
          source_platform: string
          target_placement?: string | null
          target_platform: string
        }
        Update: {
          created_at?: string
          fallback_placement?: string | null
          id?: string
          is_supported?: boolean | null
          notes?: string | null
          source_placement?: string
          source_platform?: string
          target_placement?: string | null
          target_platform?: string
        }
        Relationships: []
      }
      platform_targeting_mapping: {
        Row: {
          created_at: string
          fallback_strategy: string | null
          id: string
          is_supported: boolean | null
          notes: string | null
          source_platform: string
          source_targeting_id: string
          source_targeting_name: string | null
          source_targeting_type: string
          target_platform: string
          target_targeting_id: string | null
          target_targeting_name: string | null
        }
        Insert: {
          created_at?: string
          fallback_strategy?: string | null
          id?: string
          is_supported?: boolean | null
          notes?: string | null
          source_platform: string
          source_targeting_id: string
          source_targeting_name?: string | null
          source_targeting_type: string
          target_platform: string
          target_targeting_id?: string | null
          target_targeting_name?: string | null
        }
        Update: {
          created_at?: string
          fallback_strategy?: string | null
          id?: string
          is_supported?: boolean | null
          notes?: string | null
          source_platform?: string
          source_targeting_id?: string
          source_targeting_name?: string | null
          source_targeting_type?: string
          target_platform?: string
          target_targeting_id?: string | null
          target_targeting_name?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      taxonomy_templates: {
        Row: {
          ad_account_id: string
          created_at: string
          entity_type: string
          id: string
          platform: string
          template: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          entity_type: string
          id?: string
          platform: string
          template?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          entity_type?: string
          id?: string
          platform?: string
          template?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_clients: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          team_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          team_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_clients_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tiktok_ad_accounts: {
        Row: {
          account_id: string
          account_name: string
          account_status: string | null
          advertiser_id: string
          client_id: string | null
          created_at: string
          currency: string | null
          default_age_max: number | null
          default_age_min: number | null
          default_app_id: string | null
          default_app_name: string | null
          default_bid_amount: number | null
          default_bid_strategy: string | null
          default_billing_event: string | null
          default_catalog_id: string | null
          default_click_window: number | null
          default_conversion_budget_type: string | null
          default_devices: Json | null
          default_event_count_enabled: boolean | null
          default_facebook_page_id: string | null
          default_frequency_schedule: number | null
          default_gender: string | null
          default_identity_id: string | null
          default_landing_page_url: string | null
          default_languages: Json | null
          default_line_business_id: string | null
          default_message_event_set: string | null
          default_messaging_app: string | null
          default_non_conversion_budget_type: string | null
          default_optimization_event: string | null
          default_optimization_location: string | null
          default_pixel_id: string | null
          default_placement_type: string | null
          default_placements: Json | null
          default_product_set_id: string | null
          default_view_window: number | null
          default_whatsapp_number: string | null
          default_zalo_account_id: string | null
          id: string
          main_markets: Json | null
          synced_at: string
          timezone: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          account_name: string
          account_status?: string | null
          advertiser_id: string
          client_id?: string | null
          created_at?: string
          currency?: string | null
          default_age_max?: number | null
          default_age_min?: number | null
          default_app_id?: string | null
          default_app_name?: string | null
          default_bid_amount?: number | null
          default_bid_strategy?: string | null
          default_billing_event?: string | null
          default_catalog_id?: string | null
          default_click_window?: number | null
          default_conversion_budget_type?: string | null
          default_devices?: Json | null
          default_event_count_enabled?: boolean | null
          default_facebook_page_id?: string | null
          default_frequency_schedule?: number | null
          default_gender?: string | null
          default_identity_id?: string | null
          default_landing_page_url?: string | null
          default_languages?: Json | null
          default_line_business_id?: string | null
          default_message_event_set?: string | null
          default_messaging_app?: string | null
          default_non_conversion_budget_type?: string | null
          default_optimization_event?: string | null
          default_optimization_location?: string | null
          default_pixel_id?: string | null
          default_placement_type?: string | null
          default_placements?: Json | null
          default_product_set_id?: string | null
          default_view_window?: number | null
          default_whatsapp_number?: string | null
          default_zalo_account_id?: string | null
          id?: string
          main_markets?: Json | null
          synced_at?: string
          timezone?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          account_name?: string
          account_status?: string | null
          advertiser_id?: string
          client_id?: string | null
          created_at?: string
          currency?: string | null
          default_age_max?: number | null
          default_age_min?: number | null
          default_app_id?: string | null
          default_app_name?: string | null
          default_bid_amount?: number | null
          default_bid_strategy?: string | null
          default_billing_event?: string | null
          default_catalog_id?: string | null
          default_click_window?: number | null
          default_conversion_budget_type?: string | null
          default_devices?: Json | null
          default_event_count_enabled?: boolean | null
          default_facebook_page_id?: string | null
          default_frequency_schedule?: number | null
          default_gender?: string | null
          default_identity_id?: string | null
          default_landing_page_url?: string | null
          default_languages?: Json | null
          default_line_business_id?: string | null
          default_message_event_set?: string | null
          default_messaging_app?: string | null
          default_non_conversion_budget_type?: string | null
          default_optimization_event?: string | null
          default_optimization_location?: string | null
          default_pixel_id?: string | null
          default_placement_type?: string | null
          default_placements?: Json | null
          default_product_set_id?: string | null
          default_view_window?: number | null
          default_whatsapp_number?: string | null
          default_zalo_account_id?: string | null
          id?: string
          main_markets?: Json | null
          synced_at?: string
          timezone?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_ad_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_ad_groups: {
        Row: {
          ad_group_name: string
          advertiser_id: string
          budget: number | null
          budget_mode: string | null
          created_at: string
          id: string
          optimization_goal: string | null
          placement_type: string | null
          placements: Json | null
          status: string | null
          targeting: Json | null
          tiktok_ad_group_id: string
          tiktok_campaign_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_group_name: string
          advertiser_id: string
          budget?: number | null
          budget_mode?: string | null
          created_at?: string
          id?: string
          optimization_goal?: string | null
          placement_type?: string | null
          placements?: Json | null
          status?: string | null
          targeting?: Json | null
          tiktok_ad_group_id: string
          tiktok_campaign_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_group_name?: string
          advertiser_id?: string
          budget?: number | null
          budget_mode?: string | null
          created_at?: string
          id?: string
          optimization_goal?: string | null
          placement_type?: string | null
          placements?: Json | null
          status?: string | null
          targeting?: Json | null
          tiktok_ad_group_id?: string
          tiktok_campaign_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_ad_groups_tiktok_campaign_id_fkey"
            columns: ["tiktok_campaign_id"]
            isOneToOne: false
            referencedRelation: "tiktok_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_campaigns: {
        Row: {
          actiplan_campaign_id: string | null
          advertiser_id: string
          budget: number | null
          budget_mode: string | null
          campaign_name: string
          created_at: string
          id: string
          objective_type: string
          status: string | null
          tiktok_campaign_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actiplan_campaign_id?: string | null
          advertiser_id: string
          budget?: number | null
          budget_mode?: string | null
          campaign_name: string
          created_at?: string
          id?: string
          objective_type: string
          status?: string | null
          tiktok_campaign_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actiplan_campaign_id?: string | null
          advertiser_id?: string
          budget?: number | null
          budget_mode?: string | null
          campaign_name?: string
          created_at?: string
          id?: string
          objective_type?: string
          status?: string | null
          tiktok_campaign_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_campaigns_actiplan_campaign_id_fkey"
            columns: ["actiplan_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_catalogs: {
        Row: {
          advertiser_id: string
          catalog_id: string
          catalog_name: string
          created_at: string
          id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          advertiser_id: string
          catalog_id: string
          catalog_name: string
          created_at?: string
          id?: string
          synced_at?: string
          user_id: string
        }
        Update: {
          advertiser_id?: string
          catalog_id?: string
          catalog_name?: string
          created_at?: string
          id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tiktok_creatives: {
        Row: {
          ad_text: string | null
          advertiser_id: string
          call_to_action: string | null
          created_at: string
          creative_name: string
          creative_type: string | null
          id: string
          image_ids: Json | null
          landing_page_url: string | null
          status: string | null
          tiktok_ad_group_id: string | null
          tiktok_creative_id: string
          updated_at: string
          user_id: string
          video_id: string | null
        }
        Insert: {
          ad_text?: string | null
          advertiser_id: string
          call_to_action?: string | null
          created_at?: string
          creative_name: string
          creative_type?: string | null
          id?: string
          image_ids?: Json | null
          landing_page_url?: string | null
          status?: string | null
          tiktok_ad_group_id?: string | null
          tiktok_creative_id: string
          updated_at?: string
          user_id: string
          video_id?: string | null
        }
        Update: {
          ad_text?: string | null
          advertiser_id?: string
          call_to_action?: string | null
          created_at?: string
          creative_name?: string
          creative_type?: string | null
          id?: string
          image_ids?: Json | null
          landing_page_url?: string | null
          status?: string | null
          tiktok_ad_group_id?: string | null
          tiktok_creative_id?: string
          updated_at?: string
          user_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_creatives_tiktok_ad_group_id_fkey"
            columns: ["tiktok_ad_group_id"]
            isOneToOne: false
            referencedRelation: "tiktok_ad_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_identities: {
        Row: {
          advertiser_id: string
          created_at: string
          id: string
          identity_id: string
          identity_name: string
          identity_type: string | null
          synced_at: string
          user_id: string
        }
        Insert: {
          advertiser_id: string
          created_at?: string
          id?: string
          identity_id: string
          identity_name: string
          identity_type?: string | null
          synced_at?: string
          user_id: string
        }
        Update: {
          advertiser_id?: string
          created_at?: string
          id?: string
          identity_id?: string
          identity_name?: string
          identity_type?: string | null
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tiktok_metrics: {
        Row: {
          advertiser_id: string
          clicks: number | null
          conversions: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          raw_metrics: Json | null
          spend: number | null
          tiktok_ad_group_id: string | null
          tiktok_campaign_id: string | null
          updated_at: string
          user_id: string
          video_play_actions: number | null
          video_views: number | null
        }
        Insert: {
          advertiser_id: string
          clicks?: number | null
          conversions?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          raw_metrics?: Json | null
          spend?: number | null
          tiktok_ad_group_id?: string | null
          tiktok_campaign_id?: string | null
          updated_at?: string
          user_id: string
          video_play_actions?: number | null
          video_views?: number | null
        }
        Update: {
          advertiser_id?: string
          clicks?: number | null
          conversions?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          raw_metrics?: Json | null
          spend?: number | null
          tiktok_ad_group_id?: string | null
          tiktok_campaign_id?: string | null
          updated_at?: string
          user_id?: string
          video_play_actions?: number | null
          video_views?: number | null
        }
        Relationships: []
      }
      tiktok_pixels: {
        Row: {
          advertiser_id: string
          created_at: string
          id: string
          pixel_id: string
          pixel_name: string
          synced_at: string
          user_id: string
        }
        Insert: {
          advertiser_id: string
          created_at?: string
          id?: string
          pixel_id: string
          pixel_name: string
          synced_at?: string
          user_id: string
        }
        Update: {
          advertiser_id?: string
          created_at?: string
          id?: string
          pixel_id?: string
          pixel_name?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tiktok_product_sets: {
        Row: {
          advertiser_id: string
          catalog_id: string
          created_at: string | null
          id: string
          product_set_id: string
          product_set_name: string
          synced_at: string | null
          user_id: string
        }
        Insert: {
          advertiser_id: string
          catalog_id: string
          created_at?: string | null
          id?: string
          product_set_id: string
          product_set_name: string
          synced_at?: string | null
          user_id: string
        }
        Update: {
          advertiser_id?: string
          catalog_id?: string
          created_at?: string | null
          id?: string
          product_set_id?: string
          product_set_name?: string
          synced_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          team_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      connected_platforms_safe: {
        Row: {
          ad_account_id: string | null
          ad_account_name: string | null
          business_manager_id: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          metadata: Json | null
          platform_name: string | null
          platform_type: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ad_account_id?: string | null
          ad_account_name?: string | null
          business_manager_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          platform_name?: string | null
          platform_type?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ad_account_id?: string | null
          ad_account_name?: string | null
          business_manager_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          platform_name?: string | null
          platform_type?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      meta_pages_safe: {
        Row: {
          category: string | null
          created_at: string | null
          id: string | null
          page_id: string | null
          page_name: string | null
          synced_at: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string | null
          page_id?: string | null
          page_name?: string | null
          synced_at?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string | null
          page_id?: string | null
          page_name?: string | null
          synced_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_platform_token: {
        Args: { platform_id: string; token_type?: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      migrate_tokens_to_vault: { Args: never; Returns: undefined }
      store_platform_token: {
        Args: { platform_id: string; token_type?: string; token_value: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "campaign_manager"
        | "viewer"
        | "owner"
        | "collaborator"
        | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "campaign_manager",
        "viewer",
        "owner",
        "collaborator",
        "member",
      ],
    },
  },
} as const
