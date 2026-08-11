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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      edge_rate_limits: {
        Row: {
          bucket: string
          key_hash: string
          request_count: number
          window_started_at: string
        }
        Insert: {
          bucket: string
          key_hash: string
          request_count?: number
          window_started_at?: string
        }
        Update: {
          bucket?: string
          key_hash?: string
          request_count?: number
          window_started_at?: string
        }
        Relationships: []
      }
      email_validations: {
        Row: {
          can_connect_smtp: boolean | null
          created_at: string
          domain: string | null
          email: string
          has_inbox_full: boolean | null
          id: string
          is_catch_all: boolean | null
          is_deliverable: boolean | null
          is_disabled: boolean | null
          is_disposable: boolean | null
          is_free_email: boolean | null
          is_role_account: boolean | null
          is_safe_to_send: boolean | null
          is_spamtrap: boolean | null
          is_valid_syntax: boolean | null
          mx_accepts_mail: boolean | null
          mx_records: Json | null
          overall_score: number
          raw_response: Json | null
          status: string
          updated_at: string
          username: string | null
          verification_mode: string | null
        }
        Insert: {
          can_connect_smtp?: boolean | null
          created_at?: string
          domain?: string | null
          email: string
          has_inbox_full?: boolean | null
          id?: string
          is_catch_all?: boolean | null
          is_deliverable?: boolean | null
          is_disabled?: boolean | null
          is_disposable?: boolean | null
          is_free_email?: boolean | null
          is_role_account?: boolean | null
          is_safe_to_send?: boolean | null
          is_spamtrap?: boolean | null
          is_valid_syntax?: boolean | null
          mx_accepts_mail?: boolean | null
          mx_records?: Json | null
          overall_score?: number
          raw_response?: Json | null
          status: string
          updated_at?: string
          username?: string | null
          verification_mode?: string | null
        }
        Update: {
          can_connect_smtp?: boolean | null
          created_at?: string
          domain?: string | null
          email?: string
          has_inbox_full?: boolean | null
          id?: string
          is_catch_all?: boolean | null
          is_deliverable?: boolean | null
          is_disabled?: boolean | null
          is_disposable?: boolean | null
          is_free_email?: boolean | null
          is_role_account?: boolean | null
          is_safe_to_send?: boolean | null
          is_spamtrap?: boolean | null
          is_valid_syntax?: boolean | null
          mx_accepts_mail?: boolean | null
          mx_records?: Json | null
          overall_score?: number
          raw_response?: Json | null
          status?: string
          updated_at?: string
          username?: string | null
          verification_mode?: string | null
        }
        Relationships: []
      }
      folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_folder_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_folder_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_folder_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      form_page_events: {
        Row: {
          answer_char_count: number | null
          created_at: string
          event_type: string
          form_id: string
          hesitation_ms: number | null
          id: string
          interaction_count: number | null
          page_id: string | null
          page_index: number | null
          page_title: string | null
          response_id: string
          session_id: string | null
          time_on_page_ms: number | null
        }
        Insert: {
          answer_char_count?: number | null
          created_at?: string
          event_type: string
          form_id: string
          hesitation_ms?: number | null
          id?: string
          interaction_count?: number | null
          page_id?: string | null
          page_index?: number | null
          page_title?: string | null
          response_id: string
          session_id?: string | null
          time_on_page_ms?: number | null
        }
        Update: {
          answer_char_count?: number | null
          created_at?: string
          event_type?: string
          form_id?: string
          hesitation_ms?: number | null
          id?: string
          interaction_count?: number | null
          page_id?: string | null
          page_index?: number | null
          page_title?: string | null
          response_id?: string
          session_id?: string | null
          time_on_page_ms?: number | null
        }
        Relationships: []
      }
      form_response_deliveries: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          dead_lettered_at: string | null
          delivered_at: string | null
          delivery_type: string
          destination: string | null
          destination_key: string
          form_id: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          next_attempt_at: string | null
          response_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          dead_lettered_at?: string | null
          delivered_at?: string | null
          delivery_type: string
          destination?: string | null
          destination_key: string
          form_id: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          next_attempt_at?: string | null
          response_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          dead_lettered_at?: string | null
          delivered_at?: string | null
          delivery_type?: string
          destination?: string | null
          destination_key?: string
          form_id?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          next_attempt_at?: string | null
          response_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_response_deliveries_response_fk"
            columns: ["form_id", "response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["form_id", "response_id"]
          },
        ]
      }
      form_responses: {
        Row: {
          answers: Json
          completed_at: string | null
          created_at: string
          form_id: string
          id: string
          metadata: Json | null
          pages_visited: number | null
          response_id: string
          session_id: string | null
          total_time_ms: number | null
        }
        Insert: {
          answers?: Json
          completed_at?: string | null
          created_at?: string
          form_id: string
          id?: string
          metadata?: Json | null
          pages_visited?: number | null
          response_id: string
          session_id?: string | null
          total_time_ms?: number | null
        }
        Update: {
          answers?: Json
          completed_at?: string | null
          created_at?: string
          form_id?: string
          id?: string
          metadata?: Json | null
          pages_visited?: number | null
          response_id?: string
          session_id?: string | null
          total_time_ms?: number | null
        }
        Relationships: []
      }
      form_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          current_page_index: number | null
          form_id: string
          id: string
          ip_address: string | null
          last_seen_at: string
          pages_visited: number | null
          query_params: Json | null
          referrer: string | null
          response_id: string
          source_url: string | null
          started_at: string
          status: string
          total_pages: number | null
          user_agent: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_page_index?: number | null
          form_id: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          pages_visited?: number | null
          query_params?: Json | null
          referrer?: string | null
          response_id: string
          source_url?: string | null
          started_at?: string
          status?: string
          total_pages?: number | null
          user_agent?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_page_index?: number | null
          form_id?: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          pages_visited?: number | null
          query_params?: Json | null
          referrer?: string | null
          response_id?: string
          source_url?: string | null
          started_at?: string
          status?: string
          total_pages?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      form_tags: {
        Row: {
          created_at: string
          form_id: string
          id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          tag_id: string
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_tags_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      form_workflow_executions: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          form_id: string
          id: string
          last_error: string | null
          lease_until: string | null
          node_key: string
          response_id: string
          result: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          form_id: string
          id?: string
          last_error?: string | null
          lease_until?: string | null
          node_key: string
          response_id: string
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          form_id?: string
          id?: string
          last_error?: string | null
          lease_until?: string | null
          node_key?: string
          response_id?: string
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      forms: {
        Row: {
          created_at: string
          data: Json
          folder_id: string | null
          id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          folder_id?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          folder_id?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_files: {
        Row: {
          created_at: string
          file_size: number
          file_type: string
          folder_id: string | null
          id: string
          name: string
          path: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_size?: number
          file_type?: string
          folder_id?: string | null
          id?: string
          name: string
          path: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_size?: number
          file_type?: string
          folder_id?: string | null
          id?: string
          name?: string
          path?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "gallery_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_folder_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_folder_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_folder_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "gallery_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          config: Json
          created_at: string
          id: string
          integration_type: string
          is_active: boolean
          label: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          integration_type: string
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          integration_type?: string
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      pixel_events_log: {
        Row: {
          created_at: string
          custom_params: Json | null
          event_id: string | null
          event_name: string
          fired_client: boolean | null
          fired_server: boolean | null
          form_id: string
          id: string
          platform: string
          response_id: string | null
          server_response: Json | null
          source_url: string | null
          trigger_type: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          custom_params?: Json | null
          event_id?: string | null
          event_name: string
          fired_client?: boolean | null
          fired_server?: boolean | null
          form_id: string
          id?: string
          platform: string
          response_id?: string | null
          server_response?: Json | null
          source_url?: string | null
          trigger_type?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          custom_params?: Json | null
          event_id?: string | null
          event_name?: string
          fired_client?: boolean | null
          fired_server?: boolean | null
          form_id?: string
          id?: string
          platform?: string
          response_id?: string | null
          server_response?: Json | null
          source_url?: string | null
          trigger_type?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_form_response_deliveries: {
        Args: {
          p_batch_size?: number
          p_lease_seconds?: number
          p_max_attempts?: number
        }
        Returns: {
          attempts: number
          claimed_at: string | null
          created_at: string
          dead_lettered_at: string | null
          delivered_at: string | null
          delivery_type: string
          destination: string | null
          destination_key: string
          form_id: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          next_attempt_at: string | null
          response_id: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "form_response_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      configure_form_response_delivery_worker_schedule: {
        Args: never
        Returns: number
      }
      consume_edge_rate_limit: {
        Args: {
          p_bucket: string
          p_key_hash: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      get_analytics_dashboard: {
        Args: {
          p_form_ids: string[]
          p_since: string
          p_timezone?: string
          p_until?: string
        }
        Returns: Json
      }
      get_admin_users: {
        Args: {
          p_after_created_at?: string
          p_after_user_id?: string
          p_limit?: number
        }
        Returns: {
          created_at: string
          display_name: string
          email: string
          is_active: boolean
          role: string
          user_id: string
        }[]
      }
      get_form_page_dropoff: {
        Args: {
          p_form_id: string
        }
        Returns: {
          dropoff_percent: number
          dropoffs: number
          page_id: string | null
          page_index: number | null
          page_title: string | null
          reached: number
        }[]
      }
      get_forms_home_summary: {
        Args: {
          p_days?: number
        }
        Returns: {
          bucket_dates: string[]
          dropoffs_by_day: number[]
          form_id: string
          response_count: number
          responses_by_day: number[]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
