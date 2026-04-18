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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_analyses: {
        Row: {
          created_at: string
          game_slug: string
          id: string
          model_used: string
          narration: string
          score: number
          stats_hash: string
          tournament_id: number | null
          user_address: string
        }
        Insert: {
          created_at?: string
          game_slug: string
          id?: string
          model_used?: string
          narration: string
          score: number
          stats_hash: string
          tournament_id?: number | null
          user_address: string
        }
        Update: {
          created_at?: string
          game_slug?: string
          id?: string
          model_used?: string
          narration?: string
          score?: number
          stats_hash?: string
          tournament_id?: number | null
          user_address?: string
        }
        Relationships: []
      }
      daily_aggregates: {
        Row: {
          category: string | null
          computed_at: string
          day: string
          games_played: number
          id: string
          multi_game_bonus_applied: boolean
          rank: number | null
          scope: string
          total_points: number
          user_address: string
        }
        Insert: {
          category?: string | null
          computed_at?: string
          day: string
          games_played: number
          id?: string
          multi_game_bonus_applied?: boolean
          rank?: number | null
          scope: string
          total_points: number
          user_address: string
        }
        Update: {
          category?: string | null
          computed_at?: string
          day?: string
          games_played?: number
          id?: string
          multi_game_bonus_applied?: boolean
          rank?: number | null
          scope?: string
          total_points?: number
          user_address?: string
        }
        Relationships: []
      }
      daily_challenges: {
        Row: {
          ai_description: string
          challenge_data: Json
          challenge_date: string
          created_at: string
          game_slug: string
          id: string
          model_used: string
          theme: string
        }
        Insert: {
          ai_description: string
          challenge_data: Json
          challenge_date: string
          created_at?: string
          game_slug: string
          id?: string
          model_used?: string
          theme: string
        }
        Update: {
          ai_description?: string
          challenge_data?: Json
          challenge_date?: string
          created_at?: string
          game_slug?: string
          id?: string
          model_used?: string
          theme?: string
        }
        Relationships: []
      }
      daily_ranks: {
        Row: {
          best_score: number
          computed_at: string
          day: string
          game_slug: string
          id: string
          rank: number
          rank_points: number
          user_address: string
        }
        Insert: {
          best_score: number
          computed_at?: string
          day: string
          game_slug: string
          id?: string
          rank: number
          rank_points: number
          user_address: string
        }
        Update: {
          best_score?: number
          computed_at?: string
          day?: string
          game_slug?: string
          id?: string
          rank?: number
          rank_points?: number
          user_address?: string
        }
        Relationships: []
      }
      game_scores: {
        Row: {
          day: string | null
          game_data: Json | null
          game_slug: string
          id: string
          score: number
          submitted_at: string
          tournament_id: number | null
          user_address: string
        }
        Insert: {
          day?: string | null
          game_data?: Json | null
          game_slug: string
          id?: string
          score: number
          submitted_at?: string
          tournament_id?: number | null
          user_address: string
        }
        Update: {
          day?: string | null
          game_data?: Json | null
          game_slug?: string
          id?: string
          score?: number
          submitted_at?: string
          tournament_id?: number | null
          user_address?: string
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          created_at: string
          duration_ms: number
          grid: Json | null
          id: string
          max_tile: number
          moves: number
          score: number
          user_id: string
          won: boolean
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          grid?: Json | null
          id?: string
          max_tile?: number
          moves?: number
          score?: number
          user_id: string
          won?: boolean
        }
        Update: {
          created_at?: string
          duration_ms?: number
          grid?: Json | null
          id?: string
          max_tile?: number
          moves?: number
          score?: number
          user_id?: string
          won?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "game_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_usdc: number
          category: string | null
          created_at: string
          day: string
          failure_reason: string | null
          game_slug: string | null
          id: string
          rank: number | null
          scope: string
          sent_at: string | null
          status: string
          tx_hash: string | null
          user_address: string
        }
        Insert: {
          amount_usdc: number
          category?: string | null
          created_at?: string
          day: string
          failure_reason?: string | null
          game_slug?: string | null
          id?: string
          rank?: number | null
          scope: string
          sent_at?: string | null
          status?: string
          tx_hash?: string | null
          user_address: string
        }
        Update: {
          amount_usdc?: number
          category?: string | null
          created_at?: string
          day?: string
          failure_reason?: string | null
          game_slug?: string | null
          id?: string
          rank?: number | null
          scope?: string
          sent_at?: string | null
          status?: string
          tx_hash?: string | null
          user_address?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          display_name: string | null
          fid: number | null
          id: string
          last_seen_at: string
          pfp_url: string | null
          username: string | null
          wallet_address: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          fid?: number | null
          id?: string
          last_seen_at?: string
          pfp_url?: string | null
          username?: string | null
          wallet_address: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          fid?: number | null
          id?: string
          last_seen_at?: string
          pfp_url?: string | null
          username?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
    }
    Views: {
      leaderboard: {
        Row: {
          best_score: number | null
          best_tile: number | null
          display_name: string | null
          ever_won: boolean | null
          fid: number | null
          games_played: number | null
          last_played_at: string | null
          pfp_url: string | null
          user_id: string | null
          username: string | null
          wallet_address: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_best_scores_for_day: {
        Args: { p_day: string; p_game: string }
        Returns: {
          best_score: number
          submissions: number
          user_address: string
        }[]
      }
      get_unique_games_for_day: {
        Args: { p_day: string }
        Returns: {
          game_slug: string
          submissions: number
        }[]
      }
      get_users_with_activity_on_day: {
        Args: { p_day: string }
        Returns: {
          games_played: number
          user_address: string
        }[]
      }
      upsert_user: {
        Args: {
          p_display_name?: string
          p_fid?: number
          p_pfp_url?: string
          p_username?: string
          p_wallet: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
