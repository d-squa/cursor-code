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
      campaigns: {
        Row: {
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
          start_date: string | null
          status: string | null
          total_budget: number
          updated_at: string
          user_id: string
        }
        Insert: {
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
          start_date?: string | null
          status?: string | null
          total_budget?: number
          updated_at?: string
          user_id: string
        }
        Update: {
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
          start_date?: string | null
          status?: string | null
          total_budget?: number
          updated_at?: string
          user_id?: string
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
        ]
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
