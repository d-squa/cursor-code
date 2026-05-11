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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      actiplan_time_sessions: {
        Row: {
          active_seconds: number
          campaign_id: string
          created_at: string
          id: string
          is_active: boolean
          session_end: string | null
          session_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_seconds?: number
          campaign_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          session_end?: string | null
          session_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_seconds?: number
          campaign_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          session_end?: string | null
          session_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actiplan_time_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actiplan_time_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action_type: string
          actual_hours: number | null
          affected_markets: string[] | null
          affected_phases: string[] | null
          affected_platforms: string[] | null
          campaign_id: string
          created_at: string | null
          description: string | null
          estimated_hours: number | null
          id: string
          is_sample: boolean
          metadata: Json | null
          title: string
          user_id: string
        }
        Insert: {
          action_type: string
          actual_hours?: number | null
          affected_markets?: string[] | null
          affected_phases?: string[] | null
          affected_platforms?: string[] | null
          campaign_id: string
          created_at?: string | null
          description?: string | null
          estimated_hours?: number | null
          id?: string
          is_sample?: boolean
          metadata?: Json | null
          title: string
          user_id: string
        }
        Update: {
          action_type?: string
          actual_hours?: number | null
          affected_markets?: string[] | null
          affected_phases?: string[] | null
          affected_platforms?: string[] | null
          campaign_id?: string
          created_at?: string | null
          description?: string | null
          estimated_hours?: number | null
          id?: string
          is_sample?: boolean
          metadata?: Json | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_account_swap_logs: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          new_account_id: string
          platform: string
          previous_account_id: string
          swap_type: string
          team_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          new_account_id: string
          platform: string
          previous_account_id: string
          swap_type?: string
          team_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          new_account_id?: string
          platform?: string
          previous_account_id?: string
          swap_type?: string
          team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_account_swap_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_push_configurations: {
        Row: {
          ad_name: string
          ad_text: string | null
          adgroup_id: string | null
          advertiser_id: string
          call_to_action: string | null
          campaign_id: string | null
          created_at: string | null
          creative_asset_id: string
          display_name: string | null
          dsp_ad_id: string | null
          dsp_ad_status: string | null
          id: string
          identity_id: string | null
          is_spark_ad: boolean | null
          landing_page_url: string | null
          platform: string
          push_attempts: number | null
          push_error: string | null
          push_status: string | null
          pushed_at: string | null
          team_id: string | null
          updated_at: string | null
          user_id: string
          validated_at: string | null
          validation_errors: Json | null
          validation_status: string | null
        }
        Insert: {
          ad_name: string
          ad_text?: string | null
          adgroup_id?: string | null
          advertiser_id: string
          call_to_action?: string | null
          campaign_id?: string | null
          created_at?: string | null
          creative_asset_id: string
          display_name?: string | null
          dsp_ad_id?: string | null
          dsp_ad_status?: string | null
          id?: string
          identity_id?: string | null
          is_spark_ad?: boolean | null
          landing_page_url?: string | null
          platform: string
          push_attempts?: number | null
          push_error?: string | null
          push_status?: string | null
          pushed_at?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id: string
          validated_at?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Update: {
          ad_name?: string
          ad_text?: string | null
          adgroup_id?: string | null
          advertiser_id?: string
          call_to_action?: string | null
          campaign_id?: string | null
          created_at?: string | null
          creative_asset_id?: string
          display_name?: string | null
          dsp_ad_id?: string | null
          dsp_ad_status?: string | null
          id?: string
          identity_id?: string | null
          is_spark_ad?: boolean | null
          landing_page_url?: string | null
          platform?: string
          push_attempts?: number | null
          push_error?: string | null
          push_status?: string | null
          pushed_at?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string
          validated_at?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_push_configurations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_push_configurations_creative_asset_id_fkey"
            columns: ["creative_asset_id"]
            isOneToOne: false
            referencedRelation: "creative_library_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_push_configurations_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "platform_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_push_configurations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_push_logs: {
        Row: {
          action: string
          ad_config_id: string | null
          created_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          request_payload: Json | null
          response_payload: Json | null
          status: string
          user_id: string
        }
        Insert: {
          action: string
          ad_config_id?: string | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status: string
          user_id: string
        }
        Update: {
          action?: string
          ad_config_id?: string | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_push_logs_ad_config_id_fkey"
            columns: ["ad_config_id"]
            isOneToOne: false
            referencedRelation: "ad_push_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversation_shares: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          share_token: string
          shared_by: string
          shared_with: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          share_token?: string
          shared_by: string
          shared_with?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          share_token?: string
          shared_by?: string
          shared_with?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_shares_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversation_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversation_shares_shared_with_fkey"
            columns: ["shared_with"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          context_campaign_id: string | null
          context_type: string | null
          created_at: string
          id: string
          team_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context_campaign_id?: string | null
          context_type?: string | null
          created_at?: string
          id?: string
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context_campaign_id?: string | null
          context_type?: string | null
          created_at?: string
          id?: string
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_context_campaign_id_fkey"
            columns: ["context_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_customization_group_members: {
        Row: {
          aspect_ratio: string | null
          assignment_id: string
          created_at: string
          creative_id: string
          delivery_bucket: string
          group_id: string
          id: string
          language: string | null
          mapped_placements: Json | null
          position: number | null
        }
        Insert: {
          aspect_ratio?: string | null
          assignment_id: string
          created_at?: string
          creative_id: string
          delivery_bucket: string
          group_id: string
          id?: string
          language?: string | null
          mapped_placements?: Json | null
          position?: number | null
        }
        Update: {
          aspect_ratio?: string | null
          assignment_id?: string
          created_at?: string
          creative_id?: string
          delivery_bucket?: string
          group_id?: string
          id?: string
          language?: string | null
          mapped_placements?: Json | null
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_customization_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "asset_customization_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_customization_groups: {
        Row: {
          ad_set_name: string | null
          asset_feed_spec: Json | null
          campaign_id: string
          created_at: string
          customization_rules: Json | null
          customization_type: string
          default_language: string | null
          group_name: string
          id: string
          language_mappings: Json | null
          market: string | null
          phase_name: string | null
          platform: string
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
          validation_errors: Json | null
        }
        Insert: {
          ad_set_name?: string | null
          asset_feed_spec?: Json | null
          campaign_id: string
          created_at?: string
          customization_rules?: Json | null
          customization_type: string
          default_language?: string | null
          group_name: string
          id?: string
          language_mappings?: Json | null
          market?: string | null
          phase_name?: string | null
          platform?: string
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
          validation_errors?: Json | null
        }
        Update: {
          ad_set_name?: string | null
          asset_feed_spec?: Json | null
          campaign_id?: string
          created_at?: string
          customization_rules?: Json | null
          customization_type?: string
          default_language?: string | null
          group_name?: string
          id?: string
          language_mappings?: Json | null
          market?: string | null
          phase_name?: string | null
          platform?: string
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_customization_groups_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_customization_groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          created_at: string
          email: string
          id: string
          stripe_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          stripe_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          stripe_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_change_history: {
        Row: {
          action: string
          campaign_id: string
          change_type: string | null
          created_at: string | null
          description: string | null
          id: string
          is_sample: boolean
          user_id: string
        }
        Insert: {
          action: string
          campaign_id: string
          change_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_sample?: boolean
          user_id: string
        }
        Update: {
          action?: string
          campaign_id?: string
          change_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_sample?: boolean
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
          is_sample: boolean
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
          is_sample?: boolean
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
          is_sample?: boolean
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
      campaign_launch_status: {
        Row: {
          campaign_id: string
          created_at: string
          dsp_entity_id: string | null
          dsp_status: string | null
          entity_name: string | null
          entity_type: string
          error_details: Json | null
          error_message: string | null
          id: string
          is_sample: boolean
          last_checked_at: string | null
          market: string
          phase_name: string | null
          planned_budget: number | null
          planned_clicks: number | null
          planned_conversions: number | null
          planned_impressions: number | null
          planned_reach: number | null
          platform: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          dsp_entity_id?: string | null
          dsp_status?: string | null
          entity_name?: string | null
          entity_type: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          is_sample?: boolean
          last_checked_at?: string | null
          market: string
          phase_name?: string | null
          planned_budget?: number | null
          planned_clicks?: number | null
          planned_conversions?: number | null
          planned_impressions?: number | null
          planned_reach?: number | null
          platform: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          dsp_entity_id?: string | null
          dsp_status?: string | null
          entity_name?: string | null
          entity_type?: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          is_sample?: boolean
          last_checked_at?: string | null
          market?: string
          phase_name?: string | null
          planned_budget?: number | null
          planned_clicks?: number | null
          planned_conversions?: number | null
          planned_impressions?: number | null
          planned_reach?: number | null
          platform?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_launch_status_campaign_id_fkey"
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
          clicks: number | null
          created_at: string
          date_range_end: string
          date_range_start: string
          id: string
          impressions: number
          industry: string | null
          landing_page_views: number | null
          link_clicks: number | null
          market: string
          optimization_goal: string
          platform: string
          revenue: number | null
          total_results: number
          total_spend: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_cost_per_result?: number | null
          campaign_count?: number
          clicks?: number | null
          created_at?: string
          date_range_end: string
          date_range_start: string
          id?: string
          impressions?: number
          industry?: string | null
          landing_page_views?: number | null
          link_clicks?: number | null
          market: string
          optimization_goal: string
          platform?: string
          revenue?: number | null
          total_results?: number
          total_spend?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_cost_per_result?: number | null
          campaign_count?: number
          clicks?: number | null
          created_at?: string
          date_range_end?: string
          date_range_start?: string
          id?: string
          impressions?: number
          industry?: string | null
          landing_page_views?: number | null
          link_clicks?: number | null
          market?: string
          optimization_goal?: string
          platform?: string
          revenue?: number | null
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
          is_sample: boolean
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
          is_sample?: boolean
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
          is_sample?: boolean
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
      client_operation_defaults: {
        Row: {
          client_id: string
          created_at: string
          estimated_hours: number
          id: string
          operation_subtype: string
          operation_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          estimated_hours?: number
          id?: string
          operation_subtype: string
          operation_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          estimated_hours?: number
          id?: string
          operation_subtype?: string
          operation_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_operation_defaults_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_qc_checklists: {
        Row: {
          client_id: string
          created_at: string | null
          entity_type: string
          id: string
          items: Json
          platform: string
          team_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          entity_type: string
          id?: string
          items?: Json
          platform: string
          team_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          entity_type?: string
          id?: string
          items?: Json
          platform?: string
          team_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_qc_checklists_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_qc_checklists_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          agency_logo_url: string | null
          app_name: string | null
          brand_background_color: string | null
          brand_font_color: string | null
          brand_foreground_color: string | null
          business_objective: string
          client_logo_url: string | null
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
          qc_enforce_individual: boolean
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          agency_logo_url?: string | null
          app_name?: string | null
          brand_background_color?: string | null
          brand_font_color?: string | null
          brand_foreground_color?: string | null
          business_objective: string
          client_logo_url?: string | null
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
          qc_enforce_individual?: boolean
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          agency_logo_url?: string | null
          app_name?: string | null
          brand_background_color?: string | null
          brand_font_color?: string | null
          brand_foreground_color?: string | null
          business_objective?: string
          client_logo_url?: string | null
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
          qc_enforce_individual?: boolean
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      competitor_history: {
        Row: {
          ad_count: number | null
          checked_at: string
          competitor_tracking_id: string | null
          created_at: string
          id: string
          was_live: boolean
        }
        Insert: {
          ad_count?: number | null
          checked_at?: string
          competitor_tracking_id?: string | null
          created_at?: string
          id?: string
          was_live: boolean
        }
        Update: {
          ad_count?: number | null
          checked_at?: string
          competitor_tracking_id?: string | null
          created_at?: string
          id?: string
          was_live?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "competitor_history_competitor_tracking_id_fkey"
            columns: ["competitor_tracking_id"]
            isOneToOne: false
            referencedRelation: "competitor_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_tracking: {
        Row: {
          active_ad_count: number | null
          ad_details: Json | null
          client_id: string | null
          competitor_name: string
          created_at: string
          first_seen_at: string
          id: string
          is_live: boolean
          last_checked_at: string
          market: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_ad_count?: number | null
          ad_details?: Json | null
          client_id?: string | null
          competitor_name: string
          created_at?: string
          first_seen_at?: string
          id?: string
          is_live?: boolean
          last_checked_at?: string
          market: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_ad_count?: number | null
          ad_details?: Json | null
          client_id?: string | null
          competitor_name?: string
          created_at?: string
          first_seen_at?: string
          id?: string
          is_live?: boolean
          last_checked_at?: string
          market?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_tracking_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
          is_sample: boolean
          metadata: Json | null
          platform_name: string
          platform_type: string
          refresh_token: string | null
          team_id: string | null
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
          is_sample?: boolean
          metadata?: Json | null
          platform_name: string
          platform_type: string
          refresh_token?: string | null
          team_id?: string | null
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
          is_sample?: boolean
          metadata?: Json | null
          platform_name?: string
          platform_type?: string
          refresh_token?: string | null
          team_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_platforms_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_assignments: {
        Row: {
          ad_group_name: string | null
          ad_set_id: string | null
          ad_set_name: string
          ad_strategy: string | null
          advantage_plus_enhance_cta: boolean | null
          advantage_plus_optimize_text_per_person: boolean | null
          advantage_plus_product_tags: boolean | null
          advantage_plus_products: boolean | null
          advantage_plus_relevant_comments: boolean | null
          advantage_plus_reveal_details: boolean | null
          advantage_plus_show_spotlights: boolean | null
          advantage_plus_sitelinks: boolean | null
          advantage_plus_text_improvements: boolean | null
          advantage_plus_video_effects: boolean | null
          advantage_plus_video_touchups: boolean | null
          assigned_at: string
          assigned_by: string | null
          brand_name: string | null
          business_name: string | null
          call_to_action: string | null
          campaign_id: string
          carousel_card_cta: string | null
          carousel_card_description: string | null
          carousel_card_headline: string | null
          carousel_card_website_url: string | null
          carousel_group_id: string | null
          creative_id: string
          description: string | null
          description_2: string | null
          description_3: string | null
          description_4: string | null
          description_5: string | null
          description_pins: Json | null
          destination_url: string | null
          display_name: string | null
          dsp_creative_id: string | null
          error_message: string | null
          final_url_suffix: string | null
          headline: string | null
          headline_2: string | null
          headline_3: string | null
          headline_4: string | null
          headline_5: string | null
          headline_pins: Json | null
          id: string
          is_sample: boolean
          long_headline_1: string | null
          long_headline_2: string | null
          long_headline_3: string | null
          long_headline_4: string | null
          long_headline_5: string | null
          market: string
          path_1: string | null
          path_2: string | null
          phase_name: string
          platform: string
          position: number | null
          primary_text: string | null
          primary_text_2: string | null
          primary_text_3: string | null
          primary_text_4: string | null
          primary_text_5: string | null
          sitelink_display_label: string | null
          sitelink_source_url: string | null
          sitelink_thumbnail: string | null
          sitelink_url: string | null
          status: string | null
          url_parameters: string | null
          utm_mode: string | null
        }
        Insert: {
          ad_group_name?: string | null
          ad_set_id?: string | null
          ad_set_name?: string
          ad_strategy?: string | null
          advantage_plus_enhance_cta?: boolean | null
          advantage_plus_optimize_text_per_person?: boolean | null
          advantage_plus_product_tags?: boolean | null
          advantage_plus_products?: boolean | null
          advantage_plus_relevant_comments?: boolean | null
          advantage_plus_reveal_details?: boolean | null
          advantage_plus_show_spotlights?: boolean | null
          advantage_plus_sitelinks?: boolean | null
          advantage_plus_text_improvements?: boolean | null
          advantage_plus_video_effects?: boolean | null
          advantage_plus_video_touchups?: boolean | null
          assigned_at?: string
          assigned_by?: string | null
          brand_name?: string | null
          business_name?: string | null
          call_to_action?: string | null
          campaign_id: string
          carousel_card_cta?: string | null
          carousel_card_description?: string | null
          carousel_card_headline?: string | null
          carousel_card_website_url?: string | null
          carousel_group_id?: string | null
          creative_id: string
          description?: string | null
          description_2?: string | null
          description_3?: string | null
          description_4?: string | null
          description_5?: string | null
          description_pins?: Json | null
          destination_url?: string | null
          display_name?: string | null
          dsp_creative_id?: string | null
          error_message?: string | null
          final_url_suffix?: string | null
          headline?: string | null
          headline_2?: string | null
          headline_3?: string | null
          headline_4?: string | null
          headline_5?: string | null
          headline_pins?: Json | null
          id?: string
          is_sample?: boolean
          long_headline_1?: string | null
          long_headline_2?: string | null
          long_headline_3?: string | null
          long_headline_4?: string | null
          long_headline_5?: string | null
          market: string
          path_1?: string | null
          path_2?: string | null
          phase_name: string
          platform: string
          position?: number | null
          primary_text?: string | null
          primary_text_2?: string | null
          primary_text_3?: string | null
          primary_text_4?: string | null
          primary_text_5?: string | null
          sitelink_display_label?: string | null
          sitelink_source_url?: string | null
          sitelink_thumbnail?: string | null
          sitelink_url?: string | null
          status?: string | null
          url_parameters?: string | null
          utm_mode?: string | null
        }
        Update: {
          ad_group_name?: string | null
          ad_set_id?: string | null
          ad_set_name?: string
          ad_strategy?: string | null
          advantage_plus_enhance_cta?: boolean | null
          advantage_plus_optimize_text_per_person?: boolean | null
          advantage_plus_product_tags?: boolean | null
          advantage_plus_products?: boolean | null
          advantage_plus_relevant_comments?: boolean | null
          advantage_plus_reveal_details?: boolean | null
          advantage_plus_show_spotlights?: boolean | null
          advantage_plus_sitelinks?: boolean | null
          advantage_plus_text_improvements?: boolean | null
          advantage_plus_video_effects?: boolean | null
          advantage_plus_video_touchups?: boolean | null
          assigned_at?: string
          assigned_by?: string | null
          brand_name?: string | null
          business_name?: string | null
          call_to_action?: string | null
          campaign_id?: string
          carousel_card_cta?: string | null
          carousel_card_description?: string | null
          carousel_card_headline?: string | null
          carousel_card_website_url?: string | null
          carousel_group_id?: string | null
          creative_id?: string
          description?: string | null
          description_2?: string | null
          description_3?: string | null
          description_4?: string | null
          description_5?: string | null
          description_pins?: Json | null
          destination_url?: string | null
          display_name?: string | null
          dsp_creative_id?: string | null
          error_message?: string | null
          final_url_suffix?: string | null
          headline?: string | null
          headline_2?: string | null
          headline_3?: string | null
          headline_4?: string | null
          headline_5?: string | null
          headline_pins?: Json | null
          id?: string
          is_sample?: boolean
          long_headline_1?: string | null
          long_headline_2?: string | null
          long_headline_3?: string | null
          long_headline_4?: string | null
          long_headline_5?: string | null
          market?: string
          path_1?: string | null
          path_2?: string | null
          phase_name?: string
          platform?: string
          position?: number | null
          primary_text?: string | null
          primary_text_2?: string | null
          primary_text_3?: string | null
          primary_text_4?: string | null
          primary_text_5?: string | null
          sitelink_display_label?: string | null
          sitelink_source_url?: string | null
          sitelink_thumbnail?: string | null
          sitelink_url?: string | null
          status?: string | null
          url_parameters?: string | null
          utm_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_assignments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_assignments_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          error_log: Json | null
          failed_items: number | null
          id: string
          import_type: string
          source_filename: string | null
          status: string | null
          successful_items: number | null
          total_items: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_log?: Json | null
          failed_items?: number | null
          id?: string
          import_type: string
          source_filename?: string | null
          status?: string | null
          successful_items?: number | null
          total_items?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_log?: Json | null
          failed_items?: number | null
          id?: string
          import_type?: string
          source_filename?: string | null
          status?: string | null
          successful_items?: number | null
          total_items?: number | null
          user_id?: string
        }
        Relationships: []
      }
      creative_library_assets: {
        Row: {
          advertiser_id: string
          approval_status: string | null
          aspect_ratio: string | null
          asset_name: string | null
          asset_type: string
          created_at: string | null
          creative_origin: string | null
          duration_seconds: number | null
          file_size_bytes: number | null
          height: number | null
          id: string
          is_sample: boolean
          is_usable: boolean | null
          platform: string
          platform_asset_id: string
          platform_metadata: Json | null
          preview_url: string | null
          spark_eligible: boolean | null
          synced_at: string | null
          team_id: string | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
          width: number | null
        }
        Insert: {
          advertiser_id: string
          approval_status?: string | null
          aspect_ratio?: string | null
          asset_name?: string | null
          asset_type: string
          created_at?: string | null
          creative_origin?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_sample?: boolean
          is_usable?: boolean | null
          platform: string
          platform_asset_id: string
          platform_metadata?: Json | null
          preview_url?: string | null
          spark_eligible?: boolean | null
          synced_at?: string | null
          team_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id: string
          width?: number | null
        }
        Update: {
          advertiser_id?: string
          approval_status?: string | null
          aspect_ratio?: string | null
          asset_name?: string | null
          asset_type?: string
          created_at?: string | null
          creative_origin?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_sample?: boolean
          is_usable?: boolean | null
          platform?: string
          platform_asset_id?: string
          platform_metadata?: Json | null
          preview_url?: string | null
          spark_eligible?: boolean | null
          synced_at?: string | null
          team_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_library_assets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_push_jobs: {
        Row: {
          campaign_id: string
          created_at: string
          error_message: string | null
          failed_count: number | null
          id: string
          last_processed_at: string | null
          max_retries: number | null
          pushed_count: number | null
          retry_count: number | null
          status: string
          total_assignments: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          error_message?: string | null
          failed_count?: number | null
          id?: string
          last_processed_at?: string | null
          max_retries?: number | null
          pushed_count?: number | null
          retry_count?: number | null
          status?: string
          total_assignments?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          error_message?: string | null
          failed_count?: number | null
          id?: string
          last_processed_at?: string | null
          max_retries?: number | null
          pushed_count?: number | null
          retry_count?: number | null
          status?: string
          total_assignments?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_push_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      creatives: {
        Row: {
          ad_end_time: string | null
          ad_start_time: string | null
          ad_type: string | null
          app_link: string | null
          approval_status: string | null
          aspect_ratio: string | null
          assets_link: string | null
          assigned_to: string | null
          brand_name: string | null
          call_to_action: string | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_theme: string | null
          caption: string | null
          caption_ar: string | null
          carousel_cards: Json | null
          catalog_id: string | null
          client_id: string | null
          content_pillar: string | null
          created_at: string
          creative_origin: string | null
          creative_type: Database["public"]["Enums"]["creative_type"]
          deeplink_url: string | null
          delivery_deadline: string | null
          description: string | null
          description_2: string | null
          description_3: string | null
          description_4: string | null
          description_5: string | null
          description_ar: string | null
          destination_url: string | null
          disable_creative_enhancements: boolean | null
          disable_multi_advertiser_ads: boolean | null
          dsp_upload_error: string | null
          dsp_upload_status: string | null
          dsp_uploaded_at: string | null
          duration_seconds: number | null
          external_account_name: string | null
          external_page_id: string | null
          external_post_id: string | null
          file_size_bytes: number | null
          flight_end_date: string | null
          flight_start_date: string | null
          folder_path: string | null
          funnel_stage: string | null
          headline: string | null
          headline_2: string | null
          headline_3: string | null
          headline_4: string | null
          headline_5: string | null
          headline_ar: string | null
          height: number | null
          id: string
          import_batch_id: string | null
          instant_experience_id: string | null
          is_valid: boolean | null
          language: string | null
          lead_form_id: string | null
          market: string | null
          media_type: string | null
          media_urls: string[] | null
          name: string
          optimization_goal: string | null
          original_filename: string | null
          phase_name: string | null
          placement: string | null
          platform: string
          platform_image_hash: string | null
          platform_metadata: Json | null
          platform_thumbnail_id: string | null
          platform_video_id: string | null
          primary_text: string | null
          primary_text_2: string | null
          primary_text_3: string | null
          primary_text_4: string | null
          primary_text_5: string | null
          primary_text_ar: string | null
          priority: string | null
          product_category: string | null
          product_set_id: string | null
          right_column_image_url: string | null
          specs_link: string | null
          spreadsheet_row_number: number | null
          status: Database["public"]["Enums"]["creative_status"]
          story_image_url: string | null
          team_id: string | null
          thumbnail_url: string | null
          tiktok_ad_format: string | null
          tiktok_asset_advertiser_id: string | null
          tiktok_display_name: string | null
          tiktok_identity_id: string | null
          updated_at: string
          url_parameters: string | null
          user_id: string
          validation_errors: string[] | null
          width: number | null
        }
        Insert: {
          ad_end_time?: string | null
          ad_start_time?: string | null
          ad_type?: string | null
          app_link?: string | null
          approval_status?: string | null
          aspect_ratio?: string | null
          assets_link?: string | null
          assigned_to?: string | null
          brand_name?: string | null
          call_to_action?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          campaign_theme?: string | null
          caption?: string | null
          caption_ar?: string | null
          carousel_cards?: Json | null
          catalog_id?: string | null
          client_id?: string | null
          content_pillar?: string | null
          created_at?: string
          creative_origin?: string | null
          creative_type?: Database["public"]["Enums"]["creative_type"]
          deeplink_url?: string | null
          delivery_deadline?: string | null
          description?: string | null
          description_2?: string | null
          description_3?: string | null
          description_4?: string | null
          description_5?: string | null
          description_ar?: string | null
          destination_url?: string | null
          disable_creative_enhancements?: boolean | null
          disable_multi_advertiser_ads?: boolean | null
          dsp_upload_error?: string | null
          dsp_upload_status?: string | null
          dsp_uploaded_at?: string | null
          duration_seconds?: number | null
          external_account_name?: string | null
          external_page_id?: string | null
          external_post_id?: string | null
          file_size_bytes?: number | null
          flight_end_date?: string | null
          flight_start_date?: string | null
          folder_path?: string | null
          funnel_stage?: string | null
          headline?: string | null
          headline_2?: string | null
          headline_3?: string | null
          headline_4?: string | null
          headline_5?: string | null
          headline_ar?: string | null
          height?: number | null
          id?: string
          import_batch_id?: string | null
          instant_experience_id?: string | null
          is_valid?: boolean | null
          language?: string | null
          lead_form_id?: string | null
          market?: string | null
          media_type?: string | null
          media_urls?: string[] | null
          name: string
          optimization_goal?: string | null
          original_filename?: string | null
          phase_name?: string | null
          placement?: string | null
          platform: string
          platform_image_hash?: string | null
          platform_metadata?: Json | null
          platform_thumbnail_id?: string | null
          platform_video_id?: string | null
          primary_text?: string | null
          primary_text_2?: string | null
          primary_text_3?: string | null
          primary_text_4?: string | null
          primary_text_5?: string | null
          primary_text_ar?: string | null
          priority?: string | null
          product_category?: string | null
          product_set_id?: string | null
          right_column_image_url?: string | null
          specs_link?: string | null
          spreadsheet_row_number?: number | null
          status?: Database["public"]["Enums"]["creative_status"]
          story_image_url?: string | null
          team_id?: string | null
          thumbnail_url?: string | null
          tiktok_ad_format?: string | null
          tiktok_asset_advertiser_id?: string | null
          tiktok_display_name?: string | null
          tiktok_identity_id?: string | null
          updated_at?: string
          url_parameters?: string | null
          user_id: string
          validation_errors?: string[] | null
          width?: number | null
        }
        Update: {
          ad_end_time?: string | null
          ad_start_time?: string | null
          ad_type?: string | null
          app_link?: string | null
          approval_status?: string | null
          aspect_ratio?: string | null
          assets_link?: string | null
          assigned_to?: string | null
          brand_name?: string | null
          call_to_action?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          campaign_theme?: string | null
          caption?: string | null
          caption_ar?: string | null
          carousel_cards?: Json | null
          catalog_id?: string | null
          client_id?: string | null
          content_pillar?: string | null
          created_at?: string
          creative_origin?: string | null
          creative_type?: Database["public"]["Enums"]["creative_type"]
          deeplink_url?: string | null
          delivery_deadline?: string | null
          description?: string | null
          description_2?: string | null
          description_3?: string | null
          description_4?: string | null
          description_5?: string | null
          description_ar?: string | null
          destination_url?: string | null
          disable_creative_enhancements?: boolean | null
          disable_multi_advertiser_ads?: boolean | null
          dsp_upload_error?: string | null
          dsp_upload_status?: string | null
          dsp_uploaded_at?: string | null
          duration_seconds?: number | null
          external_account_name?: string | null
          external_page_id?: string | null
          external_post_id?: string | null
          file_size_bytes?: number | null
          flight_end_date?: string | null
          flight_start_date?: string | null
          folder_path?: string | null
          funnel_stage?: string | null
          headline?: string | null
          headline_2?: string | null
          headline_3?: string | null
          headline_4?: string | null
          headline_5?: string | null
          headline_ar?: string | null
          height?: number | null
          id?: string
          import_batch_id?: string | null
          instant_experience_id?: string | null
          is_valid?: boolean | null
          language?: string | null
          lead_form_id?: string | null
          market?: string | null
          media_type?: string | null
          media_urls?: string[] | null
          name?: string
          optimization_goal?: string | null
          original_filename?: string | null
          phase_name?: string | null
          placement?: string | null
          platform?: string
          platform_image_hash?: string | null
          platform_metadata?: Json | null
          platform_thumbnail_id?: string | null
          platform_video_id?: string | null
          primary_text?: string | null
          primary_text_2?: string | null
          primary_text_3?: string | null
          primary_text_4?: string | null
          primary_text_5?: string | null
          primary_text_ar?: string | null
          priority?: string | null
          product_category?: string | null
          product_set_id?: string | null
          right_column_image_url?: string | null
          specs_link?: string | null
          spreadsheet_row_number?: number | null
          status?: Database["public"]["Enums"]["creative_status"]
          story_image_url?: string | null
          team_id?: string | null
          thumbnail_url?: string | null
          tiktok_ad_format?: string | null
          tiktok_asset_advertiser_id?: string | null
          tiktok_display_name?: string | null
          tiktok_identity_id?: string | null
          updated_at?: string
          url_parameters?: string | null
          user_id?: string
          validation_errors?: string[] | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creatives_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creatives_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      dsp_config_changes: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          actiplan_value: string | null
          campaign_id: string
          change_category: string
          created_at: string
          detected_at: string
          dsp_entity_id: string
          dsp_value: string | null
          entity_name: string | null
          entity_type: string
          field_label: string | null
          field_name: string
          id: string
          is_acknowledged: boolean
          market: string | null
          phase_name: string | null
          platform: string
          synced_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          actiplan_value?: string | null
          campaign_id: string
          change_category: string
          created_at?: string
          detected_at?: string
          dsp_entity_id: string
          dsp_value?: string | null
          entity_name?: string | null
          entity_type: string
          field_label?: string | null
          field_name: string
          id?: string
          is_acknowledged?: boolean
          market?: string | null
          phase_name?: string | null
          platform: string
          synced_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          actiplan_value?: string | null
          campaign_id?: string
          change_category?: string
          created_at?: string
          detected_at?: string
          dsp_entity_id?: string
          dsp_value?: string | null
          entity_name?: string | null
          entity_type?: string
          field_label?: string | null
          field_name?: string
          id?: string
          is_acknowledged?: boolean
          market?: string | null
          phase_name?: string | null
          platform?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dsp_config_changes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_versions: {
        Row: {
          campaign_id: string
          created_at: string
          description: string | null
          forecast_data: Json
          id: string
          label: string | null
          platforms_snapshot: Json
          total_budget: number
          user_id: string
          version_number: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          description?: string | null
          forecast_data: Json
          id?: string
          label?: string | null
          platforms_snapshot: Json
          total_budget: number
          user_id: string
          version_number?: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          description?: string | null
          forecast_data?: Json
          id?: string
          label?: string | null
          platforms_snapshot?: Json
          total_budget?: number
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecast_versions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      google_ad_accounts: {
        Row: {
          account_id: string
          account_name: string
          account_status: string | null
          client_id: string | null
          created_at: string | null
          currency: string | null
          customer_id: string
          default_ai_max: boolean | null
          default_ai_max_options: Json | null
          default_bid_strategy: string | null
          default_brand_guidelines: boolean | null
          default_business_name: string | null
          default_campaign_objective: string | null
          default_campaign_subtype: string | null
          default_campaign_type: string | null
          default_conversion_budget_type: string | null
          default_customer_acquisition: string | null
          default_display_network: boolean | null
          default_feed_label: string | null
          default_inventory_type: string | null
          default_landing_page_url: string | null
          default_location_targeting: string | null
          default_max_cpc_bid: number | null
          default_merchant_center_id: string | null
          default_non_conversion_budget_type: string | null
          default_optimized_targeting: boolean | null
          default_placements: Json | null
          default_search_partner: boolean | null
          default_target_cpa: number | null
          default_target_roas: number | null
          default_url_parameters: string | null
          default_utm_mode: string | null
          descriptive_name: string | null
          id: string
          is_sample: boolean
          main_markets: Json | null
          manager_customer_id: string | null
          platform_id: string | null
          team_id: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          account_name: string
          account_status?: string | null
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id: string
          default_ai_max?: boolean | null
          default_ai_max_options?: Json | null
          default_bid_strategy?: string | null
          default_brand_guidelines?: boolean | null
          default_business_name?: string | null
          default_campaign_objective?: string | null
          default_campaign_subtype?: string | null
          default_campaign_type?: string | null
          default_conversion_budget_type?: string | null
          default_customer_acquisition?: string | null
          default_display_network?: boolean | null
          default_feed_label?: string | null
          default_inventory_type?: string | null
          default_landing_page_url?: string | null
          default_location_targeting?: string | null
          default_max_cpc_bid?: number | null
          default_merchant_center_id?: string | null
          default_non_conversion_budget_type?: string | null
          default_optimized_targeting?: boolean | null
          default_placements?: Json | null
          default_search_partner?: boolean | null
          default_target_cpa?: number | null
          default_target_roas?: number | null
          default_url_parameters?: string | null
          default_utm_mode?: string | null
          descriptive_name?: string | null
          id?: string
          is_sample?: boolean
          main_markets?: Json | null
          manager_customer_id?: string | null
          platform_id?: string | null
          team_id?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          account_name?: string
          account_status?: string | null
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id?: string
          default_ai_max?: boolean | null
          default_ai_max_options?: Json | null
          default_bid_strategy?: string | null
          default_brand_guidelines?: boolean | null
          default_business_name?: string | null
          default_campaign_objective?: string | null
          default_campaign_subtype?: string | null
          default_campaign_type?: string | null
          default_conversion_budget_type?: string | null
          default_customer_acquisition?: string | null
          default_display_network?: boolean | null
          default_feed_label?: string | null
          default_inventory_type?: string | null
          default_landing_page_url?: string | null
          default_location_targeting?: string | null
          default_max_cpc_bid?: number | null
          default_merchant_center_id?: string | null
          default_non_conversion_budget_type?: string | null
          default_optimized_targeting?: boolean | null
          default_placements?: Json | null
          default_search_partner?: boolean | null
          default_target_cpa?: number | null
          default_target_roas?: number | null
          default_url_parameters?: string | null
          default_utm_mode?: string | null
          descriptive_name?: string | null
          id?: string
          is_sample?: boolean
          main_markets?: Json | null
          manager_customer_id?: string | null
          platform_id?: string | null
          team_id?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_ad_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_ad_accounts_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "connected_platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_ad_accounts_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "connected_platforms_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_ad_accounts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      google_conversion_actions: {
        Row: {
          category: string | null
          conversion_action_id: string
          conversion_action_name: string
          conversion_type: string | null
          created_at: string | null
          customer_id: string
          id: string
          status: string | null
          synced_at: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          conversion_action_id: string
          conversion_action_name: string
          conversion_type?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          status?: string | null
          synced_at?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          conversion_action_id?: string
          conversion_action_name?: string
          conversion_type?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          status?: string | null
          synced_at?: string | null
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          account_id: string
          account_name: string
          account_status: string | null
          advantage_plus_enhance_cta: boolean | null
          advantage_plus_optimize_text_per_person: boolean | null
          advantage_plus_product_tags: boolean | null
          advantage_plus_products: boolean | null
          advantage_plus_relevant_comments: boolean | null
          advantage_plus_reveal_details: boolean | null
          advantage_plus_show_spotlights: boolean | null
          advantage_plus_sitelinks: boolean | null
          advantage_plus_text_improvements: boolean | null
          advantage_plus_video_effects: boolean | null
          advantage_plus_video_touchups: boolean | null
          client_id: string | null
          created_at: string
          currency: string | null
          default_advantage_plus_audience: boolean | null
          default_advantage_plus_campaign: boolean | null
          default_advantage_plus_creative: boolean | null
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
          default_conversion_count: string | null
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
          default_url_parameters: string | null
          default_utm_mode: string | null
          default_view_window: number | null
          default_whatsapp_enabled: boolean | null
          default_whatsapp_number: string | null
          id: string
          is_sample: boolean
          main_markets: Json | null
          platform_id: string | null
          synced_at: string
          team_id: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          account_name: string
          account_status?: string | null
          advantage_plus_enhance_cta?: boolean | null
          advantage_plus_optimize_text_per_person?: boolean | null
          advantage_plus_product_tags?: boolean | null
          advantage_plus_products?: boolean | null
          advantage_plus_relevant_comments?: boolean | null
          advantage_plus_reveal_details?: boolean | null
          advantage_plus_show_spotlights?: boolean | null
          advantage_plus_sitelinks?: boolean | null
          advantage_plus_text_improvements?: boolean | null
          advantage_plus_video_effects?: boolean | null
          advantage_plus_video_touchups?: boolean | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          default_advantage_plus_audience?: boolean | null
          default_advantage_plus_campaign?: boolean | null
          default_advantage_plus_creative?: boolean | null
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
          default_conversion_count?: string | null
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
          default_url_parameters?: string | null
          default_utm_mode?: string | null
          default_view_window?: number | null
          default_whatsapp_enabled?: boolean | null
          default_whatsapp_number?: string | null
          id?: string
          is_sample?: boolean
          main_markets?: Json | null
          platform_id?: string | null
          synced_at?: string
          team_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          account_name?: string
          account_status?: string | null
          advantage_plus_enhance_cta?: boolean | null
          advantage_plus_optimize_text_per_person?: boolean | null
          advantage_plus_product_tags?: boolean | null
          advantage_plus_products?: boolean | null
          advantage_plus_relevant_comments?: boolean | null
          advantage_plus_reveal_details?: boolean | null
          advantage_plus_show_spotlights?: boolean | null
          advantage_plus_sitelinks?: boolean | null
          advantage_plus_text_improvements?: boolean | null
          advantage_plus_video_effects?: boolean | null
          advantage_plus_video_touchups?: boolean | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          default_advantage_plus_audience?: boolean | null
          default_advantage_plus_campaign?: boolean | null
          default_advantage_plus_creative?: boolean | null
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
          default_conversion_count?: string | null
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
          default_url_parameters?: string | null
          default_utm_mode?: string | null
          default_view_window?: number | null
          default_whatsapp_enabled?: boolean | null
          default_whatsapp_number?: string | null
          id?: string
          is_sample?: boolean
          main_markets?: Json | null
          platform_id?: string | null
          synced_at?: string
          team_id?: string | null
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
          {
            foreignKeyName: "meta_ad_accounts_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "connected_platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_accounts_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "connected_platforms_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_accounts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_catalogs: {
        Row: {
          ad_account_id: string | null
          catalog_id: string
          catalog_name: string
          created_at: string
          id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          catalog_id: string
          catalog_name: string
          created_at?: string
          id?: string
          synced_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
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
          ad_account_id: string | null
          created_at: string
          event_name: string
          event_type: string | null
          id: string
          pixel_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          created_at?: string
          event_name: string
          event_type?: string | null
          id?: string
          pixel_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
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
          ad_account_id: string | null
          created_at: string
          id: string
          instagram_account_id: string
          synced_at: string
          user_id: string
          username: string
        }
        Insert: {
          ad_account_id?: string | null
          created_at?: string
          id?: string
          instagram_account_id: string
          synced_at?: string
          user_id: string
          username: string
        }
        Update: {
          ad_account_id?: string | null
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
          ad_account_id: string | null
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
          ad_account_id?: string | null
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
          ad_account_id?: string | null
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
          ad_account_id: string | null
          catalog_id: string
          created_at: string
          id: string
          product_set_id: string
          product_set_name: string
          synced_at: string
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          catalog_id: string
          created_at?: string
          id?: string
          product_set_id: string
          product_set_name: string
          synced_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
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
          actual_hours: number | null
          assigned_to: string[] | null
          campaign_id: string
          change_type: string
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          description: string
          estimated_hours: number | null
          id: string
          notify_all_team: boolean | null
          requester_id: string
          status: string
          status_history: Json | null
          updated_at: string | null
        }
        Insert: {
          actual_hours?: number | null
          assigned_to?: string[] | null
          campaign_id: string
          change_type: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description: string
          estimated_hours?: number | null
          id?: string
          notify_all_team?: boolean | null
          requester_id: string
          status?: string
          status_history?: Json | null
          updated_at?: string | null
        }
        Update: {
          actual_hours?: number | null
          assigned_to?: string[] | null
          campaign_id?: string
          change_type?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string
          estimated_hours?: number | null
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
            foreignKeyName: "modification_requests_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      platform_identities: {
        Row: {
          advertiser_id: string
          created_at: string | null
          display_name: string | null
          id: string
          identity_id: string
          identity_type: string
          is_active: boolean | null
          is_brand_owned: boolean | null
          platform: string
          platform_metadata: Json | null
          profile_image_url: string | null
          requires_authorization: boolean | null
          synced_at: string | null
          team_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          advertiser_id: string
          created_at?: string | null
          display_name?: string | null
          id?: string
          identity_id: string
          identity_type: string
          is_active?: boolean | null
          is_brand_owned?: boolean | null
          platform: string
          platform_metadata?: Json | null
          profile_image_url?: string | null
          requires_authorization?: boolean | null
          synced_at?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          advertiser_id?: string
          created_at?: string | null
          display_name?: string | null
          id?: string
          identity_id?: string
          identity_type?: string
          is_active?: boolean | null
          is_brand_owned?: boolean | null
          platform?: string
          platform_metadata?: Json | null
          profile_image_url?: string | null
          requires_authorization?: boolean | null
          synced_at?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_identities_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
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
      pmax_asset_groups: {
        Row: {
          ad_group_name: string
          business_name: string | null
          call_to_action: string | null
          campaign_id: string
          created_at: string
          dsp_entity_id: string | null
          error_message: string | null
          final_url: string | null
          group_name: string | null
          id: string
          is_sample: boolean
          market: string
          phase_name: string
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_group_name: string
          business_name?: string | null
          call_to_action?: string | null
          campaign_id: string
          created_at?: string
          dsp_entity_id?: string | null
          error_message?: string | null
          final_url?: string | null
          group_name?: string | null
          id?: string
          is_sample?: boolean
          market: string
          phase_name: string
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_group_name?: string
          business_name?: string | null
          call_to_action?: string | null
          campaign_id?: string
          created_at?: string
          dsp_entity_id?: string | null
          error_message?: string | null
          final_url?: string | null
          group_name?: string | null
          id?: string
          is_sample?: boolean
          market?: string
          phase_name?: string
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pmax_asset_groups_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pmax_asset_groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      pmax_creative_assets: {
        Row: {
          asset_group_id: string
          bucket: string
          created_at: string
          creative_id: string
          id: string
          position: number
        }
        Insert: {
          asset_group_id: string
          bucket: string
          created_at?: string
          creative_id: string
          id?: string
          position?: number
        }
        Update: {
          asset_group_id?: string
          bucket?: string
          created_at?: string
          creative_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pmax_creative_assets_asset_group_id_fkey"
            columns: ["asset_group_id"]
            isOneToOne: false
            referencedRelation: "pmax_asset_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pmax_creative_assets_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      pmax_text_assets: {
        Row: {
          asset_group_id: string
          asset_type: string
          content: string
          created_at: string
          id: string
          position: number
        }
        Insert: {
          asset_group_id: string
          asset_type: string
          content: string
          created_at?: string
          id?: string
          position?: number
        }
        Update: {
          asset_group_id?: string
          asset_type?: string
          content?: string
          created_at?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pmax_text_assets_asset_group_id_fkey"
            columns: ["asset_group_id"]
            isOneToOne: false
            referencedRelation: "pmax_asset_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_line1: string | null
          address_postal_code: string | null
          address_state: string | null
          adlibrary_authorized: boolean | null
          adlibrary_authorized_at: string | null
          company_name: string | null
          created_at: string
          discovery_source: string | null
          email: string
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          onboarding_completed_at: string | null
          paid_media_experience: string | null
          phone: string | null
          role: string | null
          team_size: string | null
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          adlibrary_authorized?: boolean | null
          adlibrary_authorized_at?: string | null
          company_name?: string | null
          created_at?: string
          discovery_source?: string | null
          email: string
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          onboarding_completed_at?: string | null
          paid_media_experience?: string | null
          phone?: string | null
          role?: string | null
          team_size?: string | null
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          adlibrary_authorized?: boolean | null
          adlibrary_authorized_at?: string | null
          company_name?: string | null
          created_at?: string
          discovery_source?: string | null
          email?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed_at?: string | null
          paid_media_experience?: string | null
          phone?: string | null
          role?: string | null
          team_size?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qc_checklist_completions: {
        Row: {
          check_method: string
          checked_at: string | null
          checked_by: string | null
          created_at: string | null
          id: string
          is_checked: boolean | null
          item_key: string
          notes: string | null
          qc_tracking_id: string
        }
        Insert: {
          check_method?: string
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string | null
          id?: string
          is_checked?: boolean | null
          item_key: string
          notes?: string | null
          qc_tracking_id: string
        }
        Update: {
          check_method?: string
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string | null
          id?: string
          is_checked?: boolean | null
          item_key?: string
          notes?: string | null
          qc_tracking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_checklist_completions_qc_tracking_id_fkey"
            columns: ["qc_tracking_id"]
            isOneToOne: false
            referencedRelation: "qc_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_state_transitions: {
        Row: {
          campaign_id: string
          detected_via: string | null
          from_state: Database["public"]["Enums"]["qc_state"] | null
          id: string
          impressions_at_transition: number | null
          metadata: Json | null
          qc_tracking_id: string
          to_state: Database["public"]["Enums"]["qc_state"]
          transitioned_at: string | null
        }
        Insert: {
          campaign_id: string
          detected_via?: string | null
          from_state?: Database["public"]["Enums"]["qc_state"] | null
          id?: string
          impressions_at_transition?: number | null
          metadata?: Json | null
          qc_tracking_id: string
          to_state: Database["public"]["Enums"]["qc_state"]
          transitioned_at?: string | null
        }
        Update: {
          campaign_id?: string
          detected_via?: string | null
          from_state?: Database["public"]["Enums"]["qc_state"] | null
          id?: string
          impressions_at_transition?: number | null
          metadata?: Json | null
          qc_tracking_id?: string
          to_state?: Database["public"]["Enums"]["qc_state"]
          transitioned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_state_transitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_state_transitions_qc_tracking_id_fkey"
            columns: ["qc_tracking_id"]
            isOneToOne: false
            referencedRelation: "qc_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_tracking: {
        Row: {
          ad_set_name: string | null
          auto_completed: boolean | null
          auto_completed_at: string | null
          campaign_id: string
          created_at: string | null
          current_state: Database["public"]["Enums"]["qc_state"]
          dsp_entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          impressions_count: number | null
          is_valid: boolean | null
          market: string | null
          phase_name: string | null
          platform: string
          previous_state: Database["public"]["Enums"]["qc_state"] | null
          qc_parameter_raw: string | null
          qc_removed_at: string | null
          qc_removed_from_dsp: boolean | null
          state_history: Json | null
          team_id: string | null
          updated_at: string | null
          user_id: string
          validation_error: string | null
        }
        Insert: {
          ad_set_name?: string | null
          auto_completed?: boolean | null
          auto_completed_at?: string | null
          campaign_id: string
          created_at?: string | null
          current_state?: Database["public"]["Enums"]["qc_state"]
          dsp_entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          impressions_count?: number | null
          is_valid?: boolean | null
          market?: string | null
          phase_name?: string | null
          platform: string
          previous_state?: Database["public"]["Enums"]["qc_state"] | null
          qc_parameter_raw?: string | null
          qc_removed_at?: string | null
          qc_removed_from_dsp?: boolean | null
          state_history?: Json | null
          team_id?: string | null
          updated_at?: string | null
          user_id: string
          validation_error?: string | null
        }
        Update: {
          ad_set_name?: string | null
          auto_completed?: boolean | null
          auto_completed_at?: string | null
          campaign_id?: string
          created_at?: string | null
          current_state?: Database["public"]["Enums"]["qc_state"]
          dsp_entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          impressions_count?: number | null
          is_valid?: boolean | null
          market?: string | null
          phase_name?: string | null
          platform?: string
          previous_state?: Database["public"]["Enums"]["qc_state"] | null
          qc_parameter_raw?: string | null
          qc_removed_at?: string | null
          qc_removed_from_dsp?: boolean | null
          state_history?: Json | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string
          validation_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_tracking_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_tracking_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      request_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          request_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          request_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "modification_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_insights_analyses: {
        Row: {
          analysis_result: string
          breakdowns: string[]
          campaign_id: string | null
          campaign_name: string
          created_at: string
          id: string
          platforms: string[]
          raw_data: Json | null
          time_comparison: string
          user_id: string
        }
        Insert: {
          analysis_result: string
          breakdowns?: string[]
          campaign_id?: string | null
          campaign_name: string
          created_at?: string
          id?: string
          platforms?: string[]
          raw_data?: Json | null
          time_comparison: string
          user_id: string
        }
        Update: {
          analysis_result?: string
          breakdowns?: string[]
          campaign_id?: string | null
          campaign_name?: string
          created_at?: string
          id?: string
          platforms?: string[]
          raw_data?: Json | null
          time_comparison?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_insights_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_mistakes: {
        Row: {
          ad_name: string | null
          ad_set_name: string | null
          campaign_id: string
          created_at: string
          created_by: string
          description: string | null
          entity_type: string | null
          id: string
          market: string | null
          metadata: Json | null
          phase_name: string | null
          platform: string | null
          qc_tracking_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ad_name?: string | null
          ad_set_name?: string | null
          campaign_id: string
          created_at?: string
          created_by: string
          description?: string | null
          entity_type?: string | null
          id?: string
          market?: string | null
          metadata?: Json | null
          phase_name?: string | null
          platform?: string | null
          qc_tracking_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ad_name?: string | null
          ad_set_name?: string | null
          campaign_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          entity_type?: string | null
          id?: string
          market?: string | null
          metadata?: Json | null
          phase_name?: string | null
          platform?: string | null
          qc_tracking_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setup_mistakes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setup_mistakes_qc_tracking_id_fkey"
            columns: ["qc_tracking_id"]
            isOneToOne: false
            referencedRelation: "qc_tracking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setup_mistakes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      snapchat_ad_accounts: {
        Row: {
          account_id: string
          account_name: string
          account_status: string | null
          advertiser_id: string
          client_id: string | null
          created_at: string
          currency: string | null
          id: string
          is_sample: boolean
          metadata: Json | null
          organization_id: string | null
          team_id: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          account_name?: string
          account_status?: string | null
          advertiser_id: string
          client_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          is_sample?: boolean
          metadata?: Json | null
          organization_id?: string | null
          team_id?: string | null
          timezone?: string | null
          updated_at?: string
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
          id?: string
          is_sample?: boolean
          metadata?: Json | null
          organization_id?: string | null
          team_id?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapchat_ad_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snapchat_ad_accounts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_overrides: {
        Row: {
          billing_period: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_period?: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_period?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
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
          is_default: boolean
          name: string
          owner_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          owner_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          default_team_id: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_team_id?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_team_id?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_default_team_fk"
            columns: ["default_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
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
          default_conversion_count: string | null
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
          default_url_parameters: string | null
          default_utm_mode: string | null
          default_view_window: number | null
          default_whatsapp_number: string | null
          default_zalo_account_id: string | null
          id: string
          is_sample: boolean
          main_markets: Json | null
          platform_id: string | null
          synced_at: string
          team_id: string | null
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
          default_conversion_count?: string | null
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
          default_url_parameters?: string | null
          default_utm_mode?: string | null
          default_view_window?: number | null
          default_whatsapp_number?: string | null
          default_zalo_account_id?: string | null
          id?: string
          is_sample?: boolean
          main_markets?: Json | null
          platform_id?: string | null
          synced_at?: string
          team_id?: string | null
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
          default_conversion_count?: string | null
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
          default_url_parameters?: string | null
          default_utm_mode?: string | null
          default_view_window?: number | null
          default_whatsapp_number?: string | null
          default_zalo_account_id?: string | null
          id?: string
          is_sample?: boolean
          main_markets?: Json | null
          platform_id?: string | null
          synced_at?: string
          team_id?: string | null
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
          {
            foreignKeyName: "tiktok_ad_accounts_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "connected_platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiktok_ad_accounts_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "connected_platforms_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiktok_ad_accounts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
      tiktok_apps: {
        Row: {
          advertiser_id: string
          app_id: string
          app_name: string
          app_type: string | null
          created_at: string
          download_url: string | null
          id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          advertiser_id: string
          app_id: string
          app_name: string
          app_type?: string | null
          created_at?: string
          download_url?: string | null
          id?: string
          synced_at?: string
          user_id: string
        }
        Update: {
          advertiser_id?: string
          app_id?: string
          app_name?: string
          app_type?: string | null
          created_at?: string
          download_url?: string | null
          id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
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
          bc_id: string | null
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
          bc_id?: string | null
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
          bc_id?: string | null
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
      tour_data_state: {
        Row: {
          created_at: string
          id: string
          is_seeded: boolean
          is_visible: boolean
          seeded_at: string | null
          seeded_campaign_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_seeded?: boolean
          is_visible?: boolean
          seeded_at?: string | null
          seeded_campaign_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_seeded?: boolean
          is_visible?: boolean
          seeded_at?: string | null
          seeded_campaign_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_data_state_seeded_campaign_id_fkey"
            columns: ["seeded_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
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
      user_sessions: {
        Row: {
          created_at: string
          device_info: string | null
          id: string
          ip_address: string | null
          last_active_at: string
          session_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          last_active_at?: string
          session_token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          last_active_at?: string
          session_token?: string
          user_id?: string
        }
        Relationships: []
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
      can_view_roles_in_team: {
        Args: { _team_id: string; _viewer_id: string }
        Returns: boolean
      }
      count_linked_ad_accounts: {
        Args: { _platform: string; _user_id: string }
        Returns: number
      }
      count_swaps_in_billing_period: {
        Args: {
          _billing_anchor_date?: string
          _platform: string
          _team_id?: string
          _user_id: string
        }
        Returns: number
      }
      count_swaps_this_month: {
        Args: { _platform: string; _team_id?: string; _user_id: string }
        Returns: number
      }
      ensure_user_workspace: { Args: never; Returns: string }
      get_adlibrary_token: { Args: { user_id_param: string }; Returns: string }
      get_platform_token: {
        Args: { platform_id: string; token_type?: string }
        Returns: string
      }
      get_user_highest_role: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
      is_team_owner: { Args: { _user_id: string }; Returns: boolean }
      is_team_owner_or_admin: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      migrate_tokens_to_vault: { Args: never; Returns: undefined }
      remove_member_from_workspace: {
        Args: { p_target_user_id: string; p_workspace_id: string }
        Returns: number
      }
      update_member_role_in_workspace: {
        Args: {
          p_new_role: Database["public"]["Enums"]["app_role"];
          p_target_user_id: string;
          p_workspace_id: string;
        };
        Returns: number;
      }
      get_workspace_member_summaries: {
        Args: { p_workspace_id: string }
        Returns: {
          id: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
          company_name: string | null
          created_at: string
        }[]
      }
      store_adlibrary_token: {
        Args: { token_value: string; user_id_param: string }
        Returns: undefined
      }
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
      creative_status:
        | "draft"
        | "ready"
        | "needs_review"
        | "error"
        | "published"
      creative_type:
        | "dark_post"
        | "existing_post"
        | "image"
        | "video"
        | "carousel"
        | "collection"
        | "instant_experience"
      qc_state: "waiting_for_final_qc" | "qc" | "pushed_live" | "delivering"
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
      creative_status: ["draft", "ready", "needs_review", "error", "published"],
      creative_type: [
        "dark_post",
        "existing_post",
        "image",
        "video",
        "carousel",
        "collection",
        "instant_experience",
      ],
      qc_state: ["waiting_for_final_qc", "qc", "pushed_live", "delivering"],
    },
  },
} as const
