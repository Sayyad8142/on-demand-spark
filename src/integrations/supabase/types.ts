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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      academy_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      academy_certificates: {
        Row: {
          created_at: string
          criteria: Json
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      academy_lesson_targets: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          target_type: Database["public"]["Enums"]["academy_target_type"]
          target_value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          target_type: Database["public"]["Enums"]["academy_target_type"]
          target_value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          target_type?: Database["public"]["Enums"]["academy_target_type"]
          target_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academy_lesson_targets_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "academy_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_lessons: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          difficulty: Database["public"]["Enums"]["academy_difficulty"]
          display_order: number
          duration_seconds: number | null
          id: string
          is_mandatory: boolean
          language: string | null
          service_type: string | null
          status: Database["public"]["Enums"]["academy_status"]
          thumbnail_url: string | null
          title: string
          updated_at: string
          youtube_url: string
          youtube_video_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          difficulty?: Database["public"]["Enums"]["academy_difficulty"]
          display_order?: number
          duration_seconds?: number | null
          id?: string
          is_mandatory?: boolean
          language?: string | null
          service_type?: string | null
          status?: Database["public"]["Enums"]["academy_status"]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          youtube_url: string
          youtube_video_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          difficulty?: Database["public"]["Enums"]["academy_difficulty"]
          display_order?: number
          duration_seconds?: number | null
          id?: string
          is_mandatory?: boolean
          language?: string | null
          service_type?: string | null
          status?: Database["public"]["Enums"]["academy_status"]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          youtube_url?: string
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academy_lessons_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "academy_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_quiz_questions: {
        Row: {
          correct_option: string
          created_at: string
          display_order: number
          id: string
          lesson_id: string
          option_a_image_url: string | null
          option_b_image_url: string | null
          question_image_url: string | null
          question_text: string | null
          updated_at: string
          voice_explanation_url: string | null
        }
        Insert: {
          correct_option?: string
          created_at?: string
          display_order?: number
          id?: string
          lesson_id: string
          option_a_image_url?: string | null
          option_b_image_url?: string | null
          question_image_url?: string | null
          question_text?: string | null
          updated_at?: string
          voice_explanation_url?: string | null
        }
        Update: {
          correct_option?: string
          created_at?: string
          display_order?: number
          id?: string
          lesson_id?: string
          option_a_image_url?: string | null
          option_b_image_url?: string | null
          question_image_url?: string | null
          question_text?: string | null
          updated_at?: string
          voice_explanation_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academy_quiz_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "academy_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_settings: {
        Row: {
          badges_config: Json
          created_at: string
          id: string
          languages: Json
          updated_at: string
          xp_config: Json
          youtube_embed: Json
        }
        Insert: {
          badges_config?: Json
          created_at?: string
          id?: string
          languages?: Json
          updated_at?: string
          xp_config?: Json
          youtube_embed?: Json
        }
        Update: {
          badges_config?: Json
          created_at?: string
          id?: string
          languages?: Json
          updated_at?: string
          xp_config?: Json
          youtube_embed?: Json
        }
        Relationships: []
      }
      academy_worker_certificates: {
        Row: {
          certificate_id: string
          id: string
          issued_at: string
          worker_id: string
        }
        Insert: {
          certificate_id: string
          id?: string
          issued_at?: string
          worker_id: string
        }
        Update: {
          certificate_id?: string
          id?: string
          issued_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_worker_certificates_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "academy_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_worker_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          last_activity_at: string
          lesson_id: string
          quiz_score: number | null
          started_at: string
          status: Database["public"]["Enums"]["academy_progress_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          lesson_id: string
          quiz_score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["academy_progress_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          lesson_id?: string
          quiz_score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["academy_progress_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_worker_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "academy_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_fcm_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_info: string | null
          id: string
          last_seen_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_info?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_info?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_bundles: {
        Row: {
          app_id: string
          bundle_url: string
          channel: string
          created_at: string
          id: string
          is_mandatory: boolean
          message: string | null
          platform: string
          sha256: string | null
          size_bytes: number | null
          version: string
        }
        Insert: {
          app_id?: string
          bundle_url: string
          channel?: string
          created_at?: string
          id?: string
          is_mandatory?: boolean
          message?: string | null
          platform?: string
          sha256?: string | null
          size_bytes?: number | null
          version: string
        }
        Update: {
          app_id?: string
          bundle_url?: string
          channel?: string
          created_at?: string
          id?: string
          is_mandatory?: boolean
          message?: string | null
          platform?: string
          sha256?: string | null
          size_bytes?: number | null
          version?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          bypass_worker_freshness_gate: boolean
          created_at: string | null
          disable_online_payments: boolean
          enable_bank_payout_details: boolean
          enable_pay_after_service: boolean
          force_update: boolean
          id: string
          ios_store_url: string
          ios_store_url_worker: string
          latest_version_name: string
          latest_worker_version_name: string
          min_user_version_code: number
          min_user_version_name: string
          min_worker_version_code: number
          min_worker_version_name: string
          play_store_url_user: string
          play_store_url_worker: string
          release_notes: string | null
          soft_update_enabled: boolean
          soft_update_message: string
          support_phone: string
          update_title: string
          updated_at: string
          user_update_message: string
          worker_hard_update_enabled: boolean
          worker_release_notes: string
          worker_soft_update_enabled: boolean
          worker_support_phone: string
          worker_update_message: string
          worker_update_title: string
        }
        Insert: {
          bypass_worker_freshness_gate?: boolean
          created_at?: string | null
          disable_online_payments?: boolean
          enable_bank_payout_details?: boolean
          enable_pay_after_service?: boolean
          force_update?: boolean
          id?: string
          ios_store_url?: string
          ios_store_url_worker?: string
          latest_version_name?: string
          latest_worker_version_name?: string
          min_user_version_code?: number
          min_user_version_name?: string
          min_worker_version_code?: number
          min_worker_version_name?: string
          play_store_url_user?: string
          play_store_url_worker?: string
          release_notes?: string | null
          soft_update_enabled?: boolean
          soft_update_message?: string
          support_phone?: string
          update_title?: string
          updated_at?: string
          user_update_message?: string
          worker_hard_update_enabled?: boolean
          worker_release_notes?: string
          worker_soft_update_enabled?: boolean
          worker_support_phone?: string
          worker_update_message?: string
          worker_update_title?: string
        }
        Update: {
          bypass_worker_freshness_gate?: boolean
          created_at?: string | null
          disable_online_payments?: boolean
          enable_bank_payout_details?: boolean
          enable_pay_after_service?: boolean
          force_update?: boolean
          id?: string
          ios_store_url?: string
          ios_store_url_worker?: string
          latest_version_name?: string
          latest_worker_version_name?: string
          min_user_version_code?: number
          min_user_version_name?: string
          min_worker_version_code?: number
          min_worker_version_name?: string
          play_store_url_user?: string
          play_store_url_worker?: string
          release_notes?: string | null
          soft_update_enabled?: boolean
          soft_update_message?: string
          support_phone?: string
          update_title?: string
          updated_at?: string
          user_update_message?: string
          worker_hard_update_enabled?: boolean
          worker_release_notes?: string
          worker_soft_update_enabled?: boolean
          worker_support_phone?: string
          worker_update_message?: string
          worker_update_title?: string
        }
        Relationships: []
      }
      app_config_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          field_name: string
          id: string
          new_value: string | null
          note: string | null
          old_value: string | null
          scope: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          field_name: string
          id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          scope?: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          field_name?: string
          id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          scope?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          notes: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          created_at: string
          cta_href: string | null
          cta_label: string | null
          id: string
          image_url: string | null
          is_active: boolean
          sort_order: number
          subtitle: string | null
          title: string
        }
        Insert: {
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          subtitle?: string | null
          title: string
        }
        Update: {
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          subtitle?: string | null
          title?: string
        }
        Relationships: []
      }
      bathroom_pricing_settings: {
        Row: {
          community: string
          glass_partition_price_inr: number
          unit_price_inr: number
          updated_at: string
        }
        Insert: {
          community?: string
          glass_partition_price_inr?: number
          unit_price_inr?: number
          updated_at?: string
        }
        Update: {
          community?: string
          glass_partition_price_inr?: number
          unit_price_inr?: number
          updated_at?: string
        }
        Relationships: []
      }
      booking_assignments: {
        Row: {
          assigned_at: string
          assignment_order: number
          booking_id: string
          created_at: string
          expires_at: string
          id: string
          response_at: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          assigned_at?: string
          assignment_order: number
          booking_id: string
          created_at?: string
          expires_at: string
          id?: string
          response_at?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          assigned_at?: string
          assignment_order?: number
          booking_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          response_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          meta: Json | null
          type: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          meta?: Json | null
          type: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          meta?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_issues: {
        Row: {
          booking_id: string
          created_at: string
          description: string | null
          id: string
          issue_type: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
          user_id: string
          worker_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          description?: string | null
          id?: string
          issue_type: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
          worker_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          description?: string | null
          id?: string
          issue_type?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_issues_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_issues_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_issues_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_messages: {
        Row: {
          body: string
          booking_id: string
          created_at: string
          id: string
          sender_id: string
          sender_name: string | null
          sender_role: string
        }
        Insert: {
          body: string
          booking_id: string
          created_at?: string
          id?: string
          sender_id: string
          sender_name?: string | null
          sender_role: string
        }
        Update: {
          body?: string
          booking_id?: string
          created_at?: string
          id?: string
          sender_id?: string
          sender_name?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_request_delivery_events: {
        Row: {
          app_state: string | null
          app_version: string | null
          booking_id: string
          booking_request_id: string | null
          created_at: string
          device_id: string | null
          id: string
          opened_at: string | null
          received_at: string | null
          received_on_device: boolean
          worker_id: string
        }
        Insert: {
          app_state?: string | null
          app_version?: string | null
          booking_id: string
          booking_request_id?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          opened_at?: string | null
          received_at?: string | null
          received_on_device?: boolean
          worker_id: string
        }
        Update: {
          app_state?: string | null
          app_version?: string | null
          booking_id?: string
          booking_request_id?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          opened_at?: string | null
          received_at?: string | null
          received_on_device?: boolean
          worker_id?: string
        }
        Relationships: []
      }
      booking_requests: {
        Row: {
          alert_attempt_count: number
          alert_last_error: string | null
          booking_id: string
          created_at: string | null
          device_ack_status: string | null
          device_app_version: string | null
          device_info: Json | null
          device_opened_at: string | null
          device_received_at: string | null
          failure_reason: string | null
          failure_reported_at: string | null
          fallback_sms_count: number
          fallback_sms_sent_at: string | null
          id: string
          last_alert_channel: string | null
          notification_status: string
          notified_at: string | null
          offered_at: string | null
          order_sequence: number
          popup_shown_at: string | null
          push_delivered_at: string | null
          push_sent_at: string | null
          responded_at: string | null
          status: string | null
          timeout_at: string
          worker_id: string
          worker_seen_at: string | null
        }
        Insert: {
          alert_attempt_count?: number
          alert_last_error?: string | null
          booking_id: string
          created_at?: string | null
          device_ack_status?: string | null
          device_app_version?: string | null
          device_info?: Json | null
          device_opened_at?: string | null
          device_received_at?: string | null
          failure_reason?: string | null
          failure_reported_at?: string | null
          fallback_sms_count?: number
          fallback_sms_sent_at?: string | null
          id?: string
          last_alert_channel?: string | null
          notification_status?: string
          notified_at?: string | null
          offered_at?: string | null
          order_sequence: number
          popup_shown_at?: string | null
          push_delivered_at?: string | null
          push_sent_at?: string | null
          responded_at?: string | null
          status?: string | null
          timeout_at?: string
          worker_id: string
          worker_seen_at?: string | null
        }
        Update: {
          alert_attempt_count?: number
          alert_last_error?: string | null
          booking_id?: string
          created_at?: string | null
          device_ack_status?: string | null
          device_app_version?: string | null
          device_info?: Json | null
          device_opened_at?: string | null
          device_received_at?: string | null
          failure_reason?: string | null
          failure_reported_at?: string | null
          fallback_sms_count?: number
          fallback_sms_sent_at?: string | null
          id?: string
          last_alert_channel?: string | null
          notification_status?: string
          notified_at?: string | null
          offered_at?: string | null
          order_sequence?: number
          popup_shown_at?: string | null
          push_delivered_at?: string | null
          push_sent_at?: string | null
          responded_at?: string | null
          status?: string | null
          timeout_at?: string
          worker_id?: string
          worker_seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_history: {
        Row: {
          booking_id: string
          changed_by: string | null
          completed_at: string | null
          completed_by: string | null
          completion_source: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          otp_verified_at: string | null
          to_status: string | null
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_source?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          otp_verified_at?: string | null
          to_status?: string | null
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_source?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          otp_verified_at?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_worker_movement_checks: {
        Row: {
          accepted_at: string
          baseline_step_value: number | null
          booking_id: string
          checked_at: string | null
          created_at: string
          error_message: string | null
          final_step_value: number | null
          id: string
          low_movement_flag: boolean
          low_movement_reason: string | null
          min_required_steps: number
          monitoring_window_seconds: number
          movement_status: string
          permission_granted: boolean
          raw_meta: Json | null
          sensor_available: boolean | null
          sensor_supported: boolean
          sensor_type_used: string | null
          steps_counted: number | null
          steps_in_window: number | null
          worker_id: string
        }
        Insert: {
          accepted_at?: string
          baseline_step_value?: number | null
          booking_id: string
          checked_at?: string | null
          created_at?: string
          error_message?: string | null
          final_step_value?: number | null
          id?: string
          low_movement_flag?: boolean
          low_movement_reason?: string | null
          min_required_steps?: number
          monitoring_window_seconds?: number
          movement_status?: string
          permission_granted?: boolean
          raw_meta?: Json | null
          sensor_available?: boolean | null
          sensor_supported?: boolean
          sensor_type_used?: string | null
          steps_counted?: number | null
          steps_in_window?: number | null
          worker_id: string
        }
        Update: {
          accepted_at?: string
          baseline_step_value?: number | null
          booking_id?: string
          checked_at?: string | null
          created_at?: string
          error_message?: string | null
          final_step_value?: number | null
          id?: string
          low_movement_flag?: boolean
          low_movement_reason?: string | null
          min_required_steps?: number
          monitoring_window_seconds?: number
          movement_status?: string
          permission_granted?: boolean
          raw_meta?: Json | null
          sensor_available?: boolean | null
          sensor_supported?: boolean
          sensor_type_used?: string | null
          steps_counted?: number | null
          steps_in_window?: number | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_worker_movement_checks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_worker_movement_checks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_worker_movement_checks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_by_admin: boolean
          assignment_method: string
          assignment_reason: string | null
          auto_complete_after_minutes: number | null
          auto_complete_at: string | null
          base_price_inr: number | null
          bathroom_count: number | null
          booking_type: string
          can_cancel_until: string | null
          cancel_fault_party: string | null
          cancel_reason: string | null
          cancel_reason_code: string | null
          cancel_source: string | null
          cancelled_at: string | null
          community: string
          completed_at: string | null
          completed_by: string | null
          completed_count_at_booking: number | null
          completion_otp: string | null
          completion_source: string | null
          confirmed_at: string | null
          cook_cuisine_pref: string | null
          cook_gender_pref: string | null
          created_at: string
          cust_name: string
          cust_phone: string
          discount_inr: number
          discount_reason: string | null
          dish_intensity: string | null
          dish_intensity_extra_inr: number | null
          dispatch_anomaly: string | null
          dispatch_anomaly_at: string | null
          dispatch_attempts: number
          dispatch_expires_at: string | null
          dispatch_lock_until: string | null
          dispatch_started_at: string | null
          dispatch_status: string
          family_count: number | null
          flat_no: string
          flat_size: string | null
          food_pref: string | null
          glass_partition_fee: number | null
          has_glass_partition: boolean | null
          id: string
          is_demo: boolean
          last_dispatch_at: string | null
          loyalty_surcharge_inr: number
          loyalty_surge_amount: number
          loyalty_tier_id: string | null
          maid_tasks: Database["public"]["Enums"]["maid_task"][] | null
          notes: string | null
          on_the_way_at: string | null
          otp_verified_at: string | null
          paid_confirmed_at: string | null
          paid_confirmed_by_user: boolean | null
          pay_enabled_at: string | null
          payment_method: string | null
          payment_status: string | null
          payout_amount: number | null
          prealert_sent: boolean
          preferred_worker_id: string | null
          previous_booking_id: string | null
          price_inr: number | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          reach_confirmed_at: string | null
          reach_confirmed_by: string | null
          reach_status: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          service_type: string
          slot_surge_amount: number
          slot_surge_time: string | null
          started_at: string | null
          status: string
          surcharge_amount: number | null
          surcharge_reason: string | null
          updated_at: string
          user_id: string
          user_marked_paid_at: string | null
          user_payment_utr: string | null
          user_reminder_sent: boolean | null
          waiting_busy_worker_count: number | null
          waiting_started_at: string | null
          waiting_until: string | null
          worker_collected_at: string | null
          worker_collected_payment: boolean | null
          worker_collection_method: string | null
          worker_id: string | null
          worker_name: string | null
          worker_phone: string | null
          worker_photo_url: string | null
          worker_rejected_count: number
          worker_upi: string | null
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string | null
          assigned_by_admin?: boolean
          assignment_method?: string
          assignment_reason?: string | null
          auto_complete_after_minutes?: number | null
          auto_complete_at?: string | null
          base_price_inr?: number | null
          bathroom_count?: number | null
          booking_type: string
          can_cancel_until?: string | null
          cancel_fault_party?: string | null
          cancel_reason?: string | null
          cancel_reason_code?: string | null
          cancel_source?: string | null
          cancelled_at?: string | null
          community: string
          completed_at?: string | null
          completed_by?: string | null
          completed_count_at_booking?: number | null
          completion_otp?: string | null
          completion_source?: string | null
          confirmed_at?: string | null
          cook_cuisine_pref?: string | null
          cook_gender_pref?: string | null
          created_at?: string
          cust_name: string
          cust_phone: string
          discount_inr?: number
          discount_reason?: string | null
          dish_intensity?: string | null
          dish_intensity_extra_inr?: number | null
          dispatch_anomaly?: string | null
          dispatch_anomaly_at?: string | null
          dispatch_attempts?: number
          dispatch_expires_at?: string | null
          dispatch_lock_until?: string | null
          dispatch_started_at?: string | null
          dispatch_status?: string
          family_count?: number | null
          flat_no: string
          flat_size?: string | null
          food_pref?: string | null
          glass_partition_fee?: number | null
          has_glass_partition?: boolean | null
          id?: string
          is_demo?: boolean
          last_dispatch_at?: string | null
          loyalty_surcharge_inr?: number
          loyalty_surge_amount?: number
          loyalty_tier_id?: string | null
          maid_tasks?: Database["public"]["Enums"]["maid_task"][] | null
          notes?: string | null
          on_the_way_at?: string | null
          otp_verified_at?: string | null
          paid_confirmed_at?: string | null
          paid_confirmed_by_user?: boolean | null
          pay_enabled_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payout_amount?: number | null
          prealert_sent?: boolean
          preferred_worker_id?: string | null
          previous_booking_id?: string | null
          price_inr?: number | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          reach_confirmed_at?: string | null
          reach_confirmed_by?: string | null
          reach_status?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_type: string
          slot_surge_amount?: number
          slot_surge_time?: string | null
          started_at?: string | null
          status?: string
          surcharge_amount?: number | null
          surcharge_reason?: string | null
          updated_at?: string
          user_id: string
          user_marked_paid_at?: string | null
          user_payment_utr?: string | null
          user_reminder_sent?: boolean | null
          waiting_busy_worker_count?: number | null
          waiting_started_at?: string | null
          waiting_until?: string | null
          worker_collected_at?: string | null
          worker_collected_payment?: boolean | null
          worker_collection_method?: string | null
          worker_id?: string | null
          worker_name?: string | null
          worker_phone?: string | null
          worker_photo_url?: string | null
          worker_rejected_count?: number
          worker_upi?: string | null
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string | null
          assigned_by_admin?: boolean
          assignment_method?: string
          assignment_reason?: string | null
          auto_complete_after_minutes?: number | null
          auto_complete_at?: string | null
          base_price_inr?: number | null
          bathroom_count?: number | null
          booking_type?: string
          can_cancel_until?: string | null
          cancel_fault_party?: string | null
          cancel_reason?: string | null
          cancel_reason_code?: string | null
          cancel_source?: string | null
          cancelled_at?: string | null
          community?: string
          completed_at?: string | null
          completed_by?: string | null
          completed_count_at_booking?: number | null
          completion_otp?: string | null
          completion_source?: string | null
          confirmed_at?: string | null
          cook_cuisine_pref?: string | null
          cook_gender_pref?: string | null
          created_at?: string
          cust_name?: string
          cust_phone?: string
          discount_inr?: number
          discount_reason?: string | null
          dish_intensity?: string | null
          dish_intensity_extra_inr?: number | null
          dispatch_anomaly?: string | null
          dispatch_anomaly_at?: string | null
          dispatch_attempts?: number
          dispatch_expires_at?: string | null
          dispatch_lock_until?: string | null
          dispatch_started_at?: string | null
          dispatch_status?: string
          family_count?: number | null
          flat_no?: string
          flat_size?: string | null
          food_pref?: string | null
          glass_partition_fee?: number | null
          has_glass_partition?: boolean | null
          id?: string
          is_demo?: boolean
          last_dispatch_at?: string | null
          loyalty_surcharge_inr?: number
          loyalty_surge_amount?: number
          loyalty_tier_id?: string | null
          maid_tasks?: Database["public"]["Enums"]["maid_task"][] | null
          notes?: string | null
          on_the_way_at?: string | null
          otp_verified_at?: string | null
          paid_confirmed_at?: string | null
          paid_confirmed_by_user?: boolean | null
          pay_enabled_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payout_amount?: number | null
          prealert_sent?: boolean
          preferred_worker_id?: string | null
          previous_booking_id?: string | null
          price_inr?: number | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          reach_confirmed_at?: string | null
          reach_confirmed_by?: string | null
          reach_status?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_type?: string
          slot_surge_amount?: number
          slot_surge_time?: string | null
          started_at?: string | null
          status?: string
          surcharge_amount?: number | null
          surcharge_reason?: string | null
          updated_at?: string
          user_id?: string
          user_marked_paid_at?: string | null
          user_payment_utr?: string | null
          user_reminder_sent?: boolean | null
          waiting_busy_worker_count?: number | null
          waiting_started_at?: string | null
          waiting_until?: string | null
          worker_collected_at?: string | null
          worker_collected_payment?: boolean | null
          worker_collection_method?: string | null
          worker_id?: string | null
          worker_name?: string | null
          worker_phone?: string | null
          worker_photo_url?: string | null
          worker_rejected_count?: number
          worker_upi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_loyalty_tier_id_fkey"
            columns: ["loyalty_tier_id"]
            isOneToOne: false
            referencedRelation: "dynamic_pricing_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_preferred_worker_id_fkey"
            columns: ["preferred_worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_preferred_worker_id_fkey"
            columns: ["preferred_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_previous_booking_id_fkey"
            columns: ["previous_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          community_id: string
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          community_id: string
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          community_id?: string
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buildings_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      callback_requests: {
        Row: {
          best_time: string | null
          created_at: string
          id: string
          ip: string | null
          name: string
          notes: string | null
          phone: string
          status: string
          user_agent: string | null
        }
        Insert: {
          best_time?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          name: string
          notes?: string | null
          phone: string
          status?: string
          user_agent?: string | null
        }
        Update: {
          best_time?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          name?: string
          notes?: string | null
          phone?: string
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      communities: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          city: string | null
          created_at: string
          flat_format: string | null
          id: string
          is_active: boolean
          name: string
          platform_fee_percent: number
          radius_m: number | null
          updated_at: string
          value: string
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          city?: string | null
          created_at?: string
          flat_format?: string | null
          id?: string
          is_active?: boolean
          name: string
          platform_fee_percent?: number
          radius_m?: number | null
          updated_at?: string
          value: string
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          city?: string | null
          created_at?: string
          flat_format?: string | null
          id?: string
          is_active?: boolean
          name?: string
          platform_fee_percent?: number
          radius_m?: number | null
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      contact_leads: {
        Row: {
          created_at: string | null
          email: string
          id: string
          message: string
          name: string
          phone: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          message: string
          name: string
          phone: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cook_pricing_settings: {
        Row: {
          base_price_inr: number
          community: string
          non_veg_extra_inr: number
          per_extra_person_inr: number
          updated_at: string
        }
        Insert: {
          base_price_inr?: number
          community?: string
          non_veg_extra_inr?: number
          per_extra_person_inr?: number
          updated_at?: string
        }
        Update: {
          base_price_inr?: number
          community?: string
          non_veg_extra_inr?: number
          per_extra_person_inr?: number
          updated_at?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string | null
          platform: string
          token: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          platform: string
          token: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          platform?: string
          token?: string
          user_id?: string | null
        }
        Relationships: []
      }
      dish_intensity_pricing: {
        Row: {
          community: string
          description: string
          extra_inr: number
          id: string
          intensity: string
          label: string
          updated_at: string
        }
        Insert: {
          community?: string
          description?: string
          extra_inr?: number
          id?: string
          intensity: string
          label?: string
          updated_at?: string
        }
        Update: {
          community?: string
          description?: string
          extra_inr?: number
          id?: string
          intensity?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      dispatch_config: {
        Row: {
          booking_type: string
          community: string
          created_at: string
          dispatch_cooldown_seconds: number
          first_batch_size: number
          id: string
          instant_expiry_minutes: number
          is_active: boolean
          max_consecutive_timeouts: number
          max_dispatch_attempts: number
          max_total_requests: number
          max_wait_for_worker_minutes: number
          no_ack_fallback_enabled: boolean
          no_ack_fallback_seconds: number
          retry_batch_size: number
          service_type: string
          updated_at: string
          worker_ttl_seconds: number
        }
        Insert: {
          booking_type?: string
          community?: string
          created_at?: string
          dispatch_cooldown_seconds?: number
          first_batch_size?: number
          id?: string
          instant_expiry_minutes?: number
          is_active?: boolean
          max_consecutive_timeouts?: number
          max_dispatch_attempts?: number
          max_total_requests?: number
          max_wait_for_worker_minutes?: number
          no_ack_fallback_enabled?: boolean
          no_ack_fallback_seconds?: number
          retry_batch_size?: number
          service_type?: string
          updated_at?: string
          worker_ttl_seconds?: number
        }
        Update: {
          booking_type?: string
          community?: string
          created_at?: string
          dispatch_cooldown_seconds?: number
          first_batch_size?: number
          id?: string
          instant_expiry_minutes?: number
          is_active?: boolean
          max_consecutive_timeouts?: number
          max_dispatch_attempts?: number
          max_total_requests?: number
          max_wait_for_worker_minutes?: number
          no_ack_fallback_enabled?: boolean
          no_ack_fallback_seconds?: number
          retry_batch_size?: number
          service_type?: string
          updated_at?: string
          worker_ttl_seconds?: number
        }
        Relationships: []
      }
      dispatch_health: {
        Row: {
          checked_at: string
          checks: Json
          deployed_version: string | null
          drift: boolean
          errors: Json
          expected_version: string | null
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          latency_ms: number | null
          ok: boolean
          queue_length: number | null
          requests_last_minute: number | null
          stale_pending: number | null
        }
        Insert: {
          checked_at?: string
          checks?: Json
          deployed_version?: string | null
          drift?: boolean
          errors?: Json
          expected_version?: string | null
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          latency_ms?: number | null
          ok: boolean
          queue_length?: number | null
          requests_last_minute?: number | null
          stale_pending?: number | null
        }
        Update: {
          checked_at?: string
          checks?: Json
          deployed_version?: string | null
          drift?: boolean
          errors?: Json
          expected_version?: string | null
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          latency_ms?: number | null
          ok?: boolean
          queue_length?: number | null
          requests_last_minute?: number | null
          stale_pending?: number | null
        }
        Relationships: []
      }
      dispatch_reachability_audit: {
        Row: {
          ack_status: string | null
          app_version: string | null
          attempted_at: string
          booking_id: string | null
          eligible_after: boolean | null
          eligible_before: boolean | null
          extra: Json | null
          fcm_status: string | null
          heartbeat_age_s: number | null
          id: string
          is_available: boolean | null
          is_busy: boolean | null
          pool_type: string | null
          reason_dropped: string | null
          suppressed_until: string | null
          suppression_active: boolean | null
          worker_id: string | null
        }
        Insert: {
          ack_status?: string | null
          app_version?: string | null
          attempted_at?: string
          booking_id?: string | null
          eligible_after?: boolean | null
          eligible_before?: boolean | null
          extra?: Json | null
          fcm_status?: string | null
          heartbeat_age_s?: number | null
          id?: string
          is_available?: boolean | null
          is_busy?: boolean | null
          pool_type?: string | null
          reason_dropped?: string | null
          suppressed_until?: string | null
          suppression_active?: boolean | null
          worker_id?: string | null
        }
        Update: {
          ack_status?: string | null
          app_version?: string | null
          attempted_at?: string
          booking_id?: string | null
          eligible_after?: boolean | null
          eligible_before?: boolean | null
          extra?: Json | null
          fcm_status?: string | null
          heartbeat_age_s?: number | null
          id?: string
          is_available?: boolean | null
          is_busy?: boolean | null
          pool_type?: string | null
          reason_dropped?: string | null
          suppressed_until?: string | null
          suppression_active?: boolean | null
          worker_id?: string | null
        }
        Relationships: []
      }
      dispatch_run_workers: {
        Row: {
          created_at: string
          decision: string
          exclusion_reason: string | null
          fcm_result: string | null
          fcm_token_present: boolean | null
          id: string
          predictive_score: number | null
          reachability_tier: string | null
          run_id: string
          worker_id: string
          worker_name: string | null
        }
        Insert: {
          created_at?: string
          decision?: string
          exclusion_reason?: string | null
          fcm_result?: string | null
          fcm_token_present?: boolean | null
          id?: string
          predictive_score?: number | null
          reachability_tier?: string | null
          run_id: string
          worker_id: string
          worker_name?: string | null
        }
        Update: {
          created_at?: string
          decision?: string
          exclusion_reason?: string | null
          fcm_result?: string | null
          fcm_token_present?: boolean | null
          id?: string
          predictive_score?: number | null
          reachability_tier?: string | null
          run_id?: string
          worker_id?: string
          worker_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_run_workers_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "dispatch_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_runs: {
        Row: {
          attempt_number: number
          booking_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          meta: Json | null
          outcome: string
          started_at: string
          trigger_source: string
          workers_eligible: number
          workers_evaluated: number
          workers_failed: number
          workers_notified: number
          workers_push_ready: number
          workers_selected: number
          workers_skipped: number
        }
        Insert: {
          attempt_number?: number
          booking_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          meta?: Json | null
          outcome?: string
          started_at?: string
          trigger_source?: string
          workers_eligible?: number
          workers_evaluated?: number
          workers_failed?: number
          workers_notified?: number
          workers_push_ready?: number
          workers_selected?: number
          workers_skipped?: number
        }
        Update: {
          attempt_number?: number
          booking_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          meta?: Json | null
          outcome?: string
          started_at?: string
          trigger_source?: string
          workers_eligible?: number
          workers_evaluated?: number
          workers_failed?: number
          workers_notified?: number
          workers_push_ready?: number
          workers_selected?: number
          workers_skipped?: number
        }
        Relationships: []
      }
      dispatch_self_test_runs: {
        Row: {
          checks: Json
          function_version: string | null
          id: string
          pass: boolean
          ran_at: string
          run_by: string | null
        }
        Insert: {
          checks: Json
          function_version?: string | null
          id?: string
          pass: boolean
          ran_at?: string
          run_by?: string | null
        }
        Update: {
          checks?: Json
          function_version?: string | null
          id?: string
          pass?: boolean
          ran_at?: string
          run_by?: string | null
        }
        Relationships: []
      }
      dispatch_simulation_logs: {
        Row: {
          accepted_at: string | null
          accepted_worker_id: string | null
          booking_id: string
          candidate_count: number
          created_at: string
          dispatched_at: string
          id: string
          outcome: string
          outcome_at: string | null
          same_top: boolean | null
          top_worker_v2_id: string | null
          top_worker_v2_score: number | null
          top_worker_v3_id: string | null
          top_worker_v3_score: number | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_worker_id?: string | null
          booking_id: string
          candidate_count?: number
          created_at?: string
          dispatched_at?: string
          id?: string
          outcome?: string
          outcome_at?: string | null
          same_top?: boolean | null
          top_worker_v2_id?: string | null
          top_worker_v2_score?: number | null
          top_worker_v3_id?: string | null
          top_worker_v3_score?: number | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_worker_id?: string | null
          booking_id?: string
          candidate_count?: number
          created_at?: string
          dispatched_at?: string
          id?: string
          outcome?: string
          outcome_at?: string | null
          same_top?: boolean | null
          top_worker_v2_id?: string | null
          top_worker_v2_score?: number | null
          top_worker_v3_id?: string | null
          top_worker_v3_score?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      dynamic_pricing_tiers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          max_completed: number | null
          min_completed: number
          surcharge_inr: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_completed?: number | null
          min_completed: number
          surcharge_inr?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_completed?: number | null
          min_completed?: number
          surcharge_inr?: number
          updated_at?: string
        }
        Relationships: []
      }
      events_ingestion: {
        Row: {
          error_count: number | null
          event_time: string | null
          id: string
          new_count: number | null
          notes: string | null
          source: string
          updated_count: number | null
        }
        Insert: {
          error_count?: number | null
          event_time?: string | null
          id?: string
          new_count?: number | null
          notes?: string | null
          source: string
          updated_count?: number | null
        }
        Update: {
          error_count?: number | null
          event_time?: string | null
          id?: string
          new_count?: number | null
          notes?: string | null
          source?: string
          updated_count?: number | null
        }
        Relationships: []
      }
      expert_schedules: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          expert_id: string
          id: string
          is_active: boolean | null
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          expert_id: string
          id?: string
          is_active?: boolean | null
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          expert_id?: string
          id?: string
          is_active?: boolean | null
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expert_schedules_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "experts"
            referencedColumns: ["id"]
          },
        ]
      }
      experts: {
        Row: {
          auto_accept_bookings: boolean | null
          availability_status: string | null
          community: string
          created_at: string | null
          email: string
          fcm_token: string | null
          full_name: string
          id: string
          is_active: boolean | null
          is_available: boolean | null
          last_active_at: string | null
          max_concurrent_bookings: number | null
          phone: string
          rating: number | null
          service: string
          total_bookings: number | null
          total_ratings: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auto_accept_bookings?: boolean | null
          availability_status?: string | null
          community: string
          created_at?: string | null
          email: string
          fcm_token?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          is_available?: boolean | null
          last_active_at?: string | null
          max_concurrent_bookings?: number | null
          phone: string
          rating?: number | null
          service: string
          total_bookings?: number | null
          total_ratings?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auto_accept_bookings?: boolean | null
          availability_status?: string | null
          community?: string
          created_at?: string | null
          email?: string
          fcm_token?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          is_available?: boolean | null
          last_active_at?: string | null
          max_concurrent_bookings?: number | null
          phone?: string
          rating?: number | null
          service?: string
          total_bookings?: number | null
          total_ratings?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      faq_feedback: {
        Row: {
          comment: string | null
          created_at: string
          helpful: boolean
          id: string
          question_key: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          helpful: boolean
          id?: string
          question_key: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          helpful?: boolean
          id?: string
          question_key?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      fcm_tokens: {
        Row: {
          app_version: string | null
          last_seen_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          last_seen_at?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          last_seen_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          booking_id: string | null
          category: string
          created_at: string
          id: string
          message: string
          rating: number | null
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          category: string
          created_at?: string
          id?: string
          message: string
          rating?: number | null
          user_id: string
        }
        Update: {
          booking_id?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string
          rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flats: {
        Row: {
          building_id: string | null
          community_id: string
          created_at: string | null
          display_name: string | null
          door: number | null
          flat_no: string
          flat_size: string | null
          floor: number | null
          id: string
          tower: number | null
          updated_at: string | null
        }
        Insert: {
          building_id?: string | null
          community_id: string
          created_at?: string | null
          display_name?: string | null
          door?: number | null
          flat_no: string
          flat_size?: string | null
          floor?: number | null
          id?: string
          tower?: number | null
          updated_at?: string | null
        }
        Update: {
          building_id?: string | null
          community_id?: string
          created_at?: string | null
          display_name?: string | null
          door?: number | null
          flat_no?: string
          flat_size?: string | null
          floor?: number | null
          id?: string
          tower?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flats_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flats_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_inr: number
          booking_id: string
          created_at: string
          generated_by: string | null
          id: string
          invoice_no: string
          invoice_type: string
          payload: Json
          updated_at: string
        }
        Insert: {
          amount_inr?: number
          booking_id: string
          created_at?: string
          generated_by?: string | null
          id?: string
          invoice_no: string
          invoice_type: string
          payload?: Json
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          booking_id?: string
          created_at?: string
          generated_by?: string | null
          id?: string
          invoice_no?: string
          invoice_type?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_properties: {
        Row: {
          id: string
          landlord_id: string
          property_id: string
        }
        Insert: {
          id?: string
          landlord_id: string
          property_id: string
        }
        Update: {
          id?: string
          landlord_id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "landlord_properties_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      landlords: {
        Row: {
          company_name: string | null
          created_at: string | null
          gstin: string | null
          id: string
          note: string | null
          profile_id: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          gstin?: string | null
          id?: string
          note?: string | null
          profile_id?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          gstin?: string | null
          id?: string
          note?: string | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landlords_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string | null
          name: string
          phone: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      leases: {
        Row: {
          created_at: string | null
          end_date: string | null
          file_url: string | null
          id: string
          notice_period_days: number | null
          property_id: string
          start_date: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          file_url?: string | null
          id?: string
          notice_period_days?: number | null
          property_id: string
          start_date: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          file_url?: string | null
          id?: string
          notice_period_days?: number | null
          property_id?: string
          start_date?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          address_raw: string | null
          amenities: Json | null
          bathrooms: number | null
          bedrooms: number | null
          bhk: number | null
          carpet_sqft: number | null
          city: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          deposit_amount_inr: number | null
          description: string | null
          first_seen_at: string | null
          floor_no: number | null
          furnishing: string | null
          id: string
          images: Json | null
          last_seen_at: string | null
          lat: number | null
          listing_date: string | null
          locality: string | null
          lon: number | null
          maintenance_inr: number | null
          parking: boolean | null
          pets_allowed: boolean | null
          pincode: string | null
          quality_score: number | null
          rent_amount_inr: number | null
          source: string
          source_url: string
          status: string | null
          super_builtup_sqft: number | null
          title: string | null
          total_floors: number | null
          updated_at: string | null
        }
        Insert: {
          address_raw?: string | null
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          bhk?: number | null
          carpet_sqft?: number | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deposit_amount_inr?: number | null
          description?: string | null
          first_seen_at?: string | null
          floor_no?: number | null
          furnishing?: string | null
          id?: string
          images?: Json | null
          last_seen_at?: string | null
          lat?: number | null
          listing_date?: string | null
          locality?: string | null
          lon?: number | null
          maintenance_inr?: number | null
          parking?: boolean | null
          pets_allowed?: boolean | null
          pincode?: string | null
          quality_score?: number | null
          rent_amount_inr?: number | null
          source: string
          source_url: string
          status?: string | null
          super_builtup_sqft?: number | null
          title?: string | null
          total_floors?: number | null
          updated_at?: string | null
        }
        Update: {
          address_raw?: string | null
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          bhk?: number | null
          carpet_sqft?: number | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deposit_amount_inr?: number | null
          description?: string | null
          first_seen_at?: string | null
          floor_no?: number | null
          furnishing?: string | null
          id?: string
          images?: Json | null
          last_seen_at?: string | null
          lat?: number | null
          listing_date?: string | null
          locality?: string | null
          lon?: number | null
          maintenance_inr?: number | null
          parking?: boolean | null
          pets_allowed?: boolean | null
          pincode?: string | null
          quality_score?: number | null
          rent_amount_inr?: number | null
          source?: string
          source_url?: string
          status?: string | null
          super_builtup_sqft?: number | null
          title?: string | null
          total_floors?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      listings_hashes: {
        Row: {
          address_norm_hash: string | null
          created_at: string | null
          id: string
          image_phash: string | null
          listing_id: string | null
          url_hash: string | null
        }
        Insert: {
          address_norm_hash?: string | null
          created_at?: string | null
          id?: string
          image_phash?: string | null
          listing_id?: string | null
          url_hash?: string | null
        }
        Update: {
          address_norm_hash?: string | null
          created_at?: string | null
          id?: string
          image_phash?: string | null
          listing_id?: string | null
          url_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_hashes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      maid_pricing_tasks: {
        Row: {
          active: boolean
          community: string
          created_at: string
          flat_size: string
          id: number
          price_inr: number
          task: Database["public"]["Enums"]["maid_task"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          community?: string
          created_at?: string
          flat_size: string
          id?: never
          price_inr: number
          task: Database["public"]["Enums"]["maid_task"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          community?: string
          created_at?: string
          flat_size?: string
          id?: never
          price_inr?: number
          task?: Database["public"]["Enums"]["maid_task"]
          updated_at?: string
        }
        Relationships: []
      }
      notification_delivery_events: {
        Row: {
          booking_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          worker_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          worker_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          booking_id: string | null
          created_at: string | null
          delivered_at: string | null
          error_code: string | null
          fcm_message_id: string | null
          fcm_status: string | null
          id: string
          notification_type: string
          opened_at: string | null
          response_action: string | null
          response_at: string | null
          retry_attempt: number | null
          sent_at: string | null
          token_source: string | null
          token_used: string | null
          worker_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_code?: string | null
          fcm_message_id?: string | null
          fcm_status?: string | null
          id?: string
          notification_type: string
          opened_at?: string | null
          response_action?: string | null
          response_at?: string | null
          retry_attempt?: number | null
          sent_at?: string | null
          token_source?: string | null
          token_used?: string | null
          worker_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_code?: string | null
          fcm_message_id?: string | null
          fcm_status?: string | null
          id?: string
          notification_type?: string
          opened_at?: string | null
          response_action?: string | null
          response_at?: string | null
          retry_attempt?: number | null
          sent_at?: string | null
          token_source?: string | null
          token_used?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          body: string
          booking_id: string | null
          created_at: string | null
          data: Json | null
          id: string
          notification_type: string
          sent_at: string | null
          status: string | null
          target_user_id: string | null
          title: string
        }
        Insert: {
          body: string
          booking_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          notification_type: string
          sent_at?: string | null
          status?: string | null
          target_user_id?: string | null
          title: string
        }
        Update: {
          body?: string
          booking_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          notification_type?: string
          sent_at?: string | null
          status?: string | null
          target_user_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_alerts: {
        Row: {
          alert_type: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          message: string
          metadata: Json | null
          recommended_action: string | null
          resolved_at: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          message: string
          metadata?: Json | null
          recommended_action?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          message?: string
          metadata?: Json | null
          recommended_action?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ops_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      otp_rate_limits: {
        Row: {
          created_at: string
          id: string
          ip: string | null
          phone: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: string | null
          phone: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string | null
          phone?: string
        }
        Relationships: []
      }
      otp_reminder_events: {
        Row: {
          booking_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          user_id: string | null
          worker_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
          worker_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
          worker_id?: string | null
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          amount_inr: number
          booking_data: Json
          created_at: string
          expires_at: string
          id: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          amount_inr: number
          booking_data: Json
          created_at?: string
          expires_at?: string
          id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          amount_inr?: number
          booking_data?: Json
          created_at?: string
          expires_at?: string
          id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      payment_wallet_issue_resolutions: {
        Row: {
          assigned_to: string | null
          booking_id: string | null
          created_at: string
          id: string
          internal_notes: string | null
          issue_type: string
          payment_intent_id: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          user_id: string | null
          wallet_transaction_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          internal_notes?: string | null
          issue_type: string
          payment_intent_id?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          user_id?: string | null
          wallet_transaction_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          internal_notes?: string | null
          issue_type?: string
          payment_intent_id?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          user_id?: string | null
          wallet_transaction_id?: string | null
        }
        Relationships: []
      }
      payout_provider_config: {
        Row: {
          active_payout_provider: string
          allow_provider_fallback: boolean
          bank_transfer_provider: string
          cashfree_enabled: boolean
          created_at: string
          id: number
          notes: string | null
          payout_auto_enabled: boolean
          payout_mode_preference: string
          razorpayx_enabled: boolean
          updated_at: string
          updated_by: string | null
          upi_provider: string
        }
        Insert: {
          active_payout_provider?: string
          allow_provider_fallback?: boolean
          bank_transfer_provider?: string
          cashfree_enabled?: boolean
          created_at?: string
          id?: number
          notes?: string | null
          payout_auto_enabled?: boolean
          payout_mode_preference?: string
          razorpayx_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          upi_provider?: string
        }
        Update: {
          active_payout_provider?: string
          allow_provider_fallback?: boolean
          bank_transfer_provider?: string
          cashfree_enabled?: boolean
          created_at?: string
          id?: number
          notes?: string | null
          payout_auto_enabled?: boolean
          payout_mode_preference?: string
          razorpayx_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          upi_provider?: string
        }
        Relationships: []
      }
      payout_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string | null
          external_payout_id: string | null
          http_status: number | null
          id: string
          payout_id: string | null
          provider: string
          raw_body: Json | null
          raw_headers: Json | null
          signature_valid: boolean | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          external_payout_id?: string | null
          http_status?: number | null
          id?: string
          payout_id?: string | null
          provider: string
          raw_body?: Json | null
          raw_headers?: Json | null
          signature_valid?: boolean | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          external_payout_id?: string | null
          http_status?: number | null
          id?: string
          payout_id?: string | null
          provider?: string
          raw_body?: Json | null
          raw_headers?: Json | null
          signature_valid?: boolean | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_webhook_events_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "worker_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_bookings: {
        Row: {
          amount_inr: number
          booking_data: Json
          booking_id: string | null
          consumed_at: string | null
          created_at: string
          last_checked_at: string | null
          last_error: string | null
          payment_type: string
          razorpay_order_id: string
          request_id: string
          status: string
          user_id: string
          wallet_amount: number | null
        }
        Insert: {
          amount_inr: number
          booking_data: Json
          booking_id?: string | null
          consumed_at?: string | null
          created_at?: string
          last_checked_at?: string | null
          last_error?: string | null
          payment_type: string
          razorpay_order_id: string
          request_id: string
          status?: string
          user_id: string
          wallet_amount?: number | null
        }
        Update: {
          amount_inr?: number
          booking_data?: Json
          booking_id?: string | null
          consumed_at?: string | null
          created_at?: string
          last_checked_at?: string | null
          last_error?: string | null
          payment_type?: string
          razorpay_order_id?: string
          request_id?: string
          status?: string
          user_id?: string
          wallet_amount?: number | null
        }
        Relationships: []
      }
      pricing: {
        Row: {
          active: boolean
          community: string | null
          created_at: string
          effective_from: string | null
          flat_size: string
          id: number
          price_inr: number
          service_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          community?: string | null
          created_at?: string
          effective_from?: string | null
          flat_size: string
          id?: number
          price_inr: number
          service_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          community?: string | null
          created_at?: string
          effective_from?: string | null
          flat_size?: string
          id?: number
          price_inr?: number
          service_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          blocked_at: string | null
          blocked_reason: string | null
          building_id: string | null
          community: string
          community_id: string | null
          completed_bookings_count: number
          created_at: string
          firebase_uid: string | null
          flat_id: string | null
          flat_no: string
          full_name: string
          id: string
          is_admin: boolean
          is_blocked: boolean | null
          is_flat_locked: boolean
          legal_version: string | null
          phone: string
          privacy_accepted_at: string | null
          tos_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          blocked_at?: string | null
          blocked_reason?: string | null
          building_id?: string | null
          community: string
          community_id?: string | null
          completed_bookings_count?: number
          created_at?: string
          firebase_uid?: string | null
          flat_id?: string | null
          flat_no: string
          full_name: string
          id?: string
          is_admin?: boolean
          is_blocked?: boolean | null
          is_flat_locked?: boolean
          legal_version?: string | null
          phone: string
          privacy_accepted_at?: string | null
          tos_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          blocked_at?: string | null
          blocked_reason?: string | null
          building_id?: string | null
          community?: string
          community_id?: string | null
          completed_bookings_count?: number
          created_at?: string
          firebase_uid?: string | null
          flat_id?: string | null
          flat_no?: string
          full_name?: string
          id?: string
          is_admin?: boolean
          is_blocked?: boolean | null
          is_flat_locked?: boolean
          legal_version?: string | null
          phone?: string
          privacy_accepted_at?: string | null
          tos_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          area_sqft: number | null
          city: string | null
          code: string | null
          created_at: string | null
          id: string
          name: string
          photos: Json | null
          pincode: string | null
          type: string | null
        }
        Insert: {
          address?: string | null
          area_sqft?: number | null
          city?: string | null
          code?: string | null
          created_at?: string | null
          id?: string
          name: string
          photos?: Json | null
          pincode?: string | null
          type?: string | null
        }
        Update: {
          address?: string | null
          area_sqft?: number | null
          city?: string | null
          code?: string | null
          created_at?: string | null
          id?: string
          name?: string
          photos?: Json | null
          pincode?: string | null
          type?: string | null
        }
        Relationships: []
      }
      pushcut_debug_log: {
        Row: {
          created_at: string
          error: string | null
          http_status: number | null
          id: string
          info: Json | null
          message_id: string | null
          stage: string
          thread_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          info?: Json | null
          message_id?: string | null
          stage: string
          thread_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          info?: Json | null
          message_id?: string | null
          stage?: string
          thread_id?: string | null
        }
        Relationships: []
      }
      rent_invoices: {
        Row: {
          amount: number
          created_at: string | null
          due_date: string
          id: string
          lease_id: string | null
          notes: string | null
          paid_on: string | null
          payment_ref: string | null
          period_end: string
          period_start: string
          property_id: string
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          due_date: string
          id?: string
          lease_id?: string | null
          notes?: string | null
          paid_on?: string | null
          payment_ref?: string | null
          period_end: string
          period_start: string
          property_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          due_date?: string
          id?: string
          lease_id?: string | null
          notes?: string | null
          paid_on?: string | null
          payment_ref?: string | null
          period_end?: string
          period_start?: string
          property_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_invoices_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rtc_calls: {
        Row: {
          booking_id: string
          callee_id: string
          callee_token: string | null
          caller_id: string
          caller_token: string | null
          created_at: string
          duration_sec: number | null
          ended_at: string | null
          id: string
          room_id: string
          started_at: string | null
          status: string
          updated_at: string
          vendor: string
        }
        Insert: {
          booking_id: string
          callee_id: string
          callee_token?: string | null
          caller_id: string
          caller_token?: string | null
          created_at?: string
          duration_sec?: number | null
          ended_at?: string | null
          id?: string
          room_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
          vendor?: string
        }
        Update: {
          booking_id?: string
          callee_id?: string
          callee_token?: string | null
          caller_id?: string
          caller_token?: string | null
          created_at?: string
          duration_sec?: number | null
          ended_at?: string | null
          id?: string
          room_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "rtc_calls_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          bhk: number | null
          city: string | null
          created_at: string | null
          email_alerts: boolean | null
          furnishing: string | null
          has_parking: boolean | null
          id: string
          last_sent_at: string | null
          locality: string[] | null
          max_distance_m: number | null
          max_rent: number | null
          min_rent: number | null
          pets_allowed: boolean | null
          schedule: string | null
          telegram_alerts: boolean | null
          user_id: string | null
        }
        Insert: {
          bhk?: number | null
          city?: string | null
          created_at?: string | null
          email_alerts?: boolean | null
          furnishing?: string | null
          has_parking?: boolean | null
          id?: string
          last_sent_at?: string | null
          locality?: string[] | null
          max_distance_m?: number | null
          max_rent?: number | null
          min_rent?: number | null
          pets_allowed?: boolean | null
          schedule?: string | null
          telegram_alerts?: boolean | null
          user_id?: string | null
        }
        Update: {
          bhk?: number | null
          city?: string | null
          created_at?: string | null
          email_alerts?: boolean | null
          furnishing?: string | null
          has_parking?: boolean | null
          id?: string
          last_sent_at?: string | null
          locality?: string[] | null
          max_distance_m?: number | null
          max_rent?: number | null
          min_rent?: number | null
          pets_allowed?: boolean | null
          schedule?: string | null
          telegram_alerts?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string | null
          id: string
          label: string
        }
        Insert: {
          created_at?: string | null
          id: string
          label: string
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          auto_cancel_minutes: number
          cleaning_enabled: boolean
          cook_enabled: boolean
          id: number
          maid_enabled: boolean
          operating_end_time: string
          operating_start_time: string
          scheduled_dispatch_minutes: number
          updated_at: string | null
        }
        Insert: {
          auto_cancel_minutes?: number
          cleaning_enabled?: boolean
          cook_enabled?: boolean
          id?: number
          maid_enabled?: boolean
          operating_end_time?: string
          operating_start_time?: string
          scheduled_dispatch_minutes?: number
          updated_at?: string | null
        }
        Update: {
          auto_cancel_minutes?: number
          cleaning_enabled?: boolean
          cook_enabled?: boolean
          id?: number
          maid_enabled?: boolean
          operating_end_time?: string
          operating_start_time?: string
          scheduled_dispatch_minutes?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      slot_surge_pricing: {
        Row: {
          community_id: string
          id: string
          is_active: boolean
          service_key: string
          slot_period: string
          slot_time: string
          surge_amount: number
          updated_at: string
        }
        Insert: {
          community_id: string
          id?: string
          is_active?: boolean
          service_key?: string
          slot_period: string
          slot_time: string
          surge_amount?: number
          updated_at?: string
        }
        Update: {
          community_id?: string
          id?: string
          is_active?: boolean
          service_key?: string
          slot_period?: string
          slot_time?: string
          surge_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_surge_pricing_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          seen: boolean
          seen_at: string | null
          sender: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          seen?: boolean
          seen_at?: string | null
          sender: string
          thread_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          seen?: boolean
          seen_at?: string | null
          sender?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_pushcut_throttle: {
        Row: {
          last_notified_at: string
          thread_id: string
        }
        Insert: {
          last_notified_at?: string
          thread_id: string
        }
        Update: {
          last_notified_at?: string
          thread_id?: string
        }
        Relationships: []
      }
      support_threads: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          last_message: string | null
          last_sender: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_sender?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_sender?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_threads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      surge_pricing_rules: {
        Row: {
          community: string | null
          created_at: string
          day_of_week: number
          hour: number
          id: string
          is_active: boolean
          multiplier: number
          service_type: string | null
          updated_at: string
        }
        Insert: {
          community?: string | null
          created_at?: string
          day_of_week: number
          hour: number
          id?: string
          is_active?: boolean
          multiplier?: number
          service_type?: string | null
          updated_at?: string
        }
        Update: {
          community?: string | null
          created_at?: string
          day_of_week?: number
          hour?: number
          id?: string
          is_active?: boolean
          multiplier?: number
          service_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          active: boolean | null
          created_at: string | null
          deposit: number | null
          due_day: number
          email: string | null
          end_date: string | null
          full_name: string
          id: string
          monthly_rent: number
          phone: string | null
          property_id: string
          start_date: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          deposit?: number | null
          due_day?: number
          email?: string | null
          end_date?: string | null
          full_name: string
          id?: string
          monthly_rent?: number
          phone?: string | null
          property_id: string
          start_date?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          deposit?: number | null
          due_day?: number
          email?: string | null
          end_date?: string | null
          full_name?: string
          id?: string
          monthly_rent?: number
          phone?: string | null
          property_id?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          avatar_url: string | null
          community: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          quote: string
          rating: number | null
          sort_order: number
        }
        Insert: {
          avatar_url?: string | null
          community?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          quote: string
          rating?: number | null
          sort_order?: number
        }
        Update: {
          avatar_url?: string | null
          community?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          quote?: string
          rating?: number | null
          sort_order?: number
        }
        Relationships: []
      }
      token_repair_events: {
        Row: {
          created_at: string
          detail: Json | null
          event_type: string
          id: string
          new_status: string | null
          previous_status: string | null
          source: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          event_type: string
          id?: string
          new_status?: string | null
          previous_status?: string | null
          source: string
          worker_id: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          event_type?: string
          id?: string
          new_status?: string | null
          previous_status?: string | null
          source?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_repair_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_repair_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_fcm_tokens: {
        Row: {
          app_version: string | null
          created_at: string | null
          device_info: Json | null
          id: string
          last_seen_at: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string | null
          device_info?: Json | null
          id?: string
          last_seen_at?: string
          platform?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string | null
          device_info?: Json | null
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_fcm_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_wallets: {
        Row: {
          balance_inr: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_inr?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_inr?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          profile_image_url: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          phone?: string | null
          profile_image_url?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          profile_image_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      vm_addresses: {
        Row: {
          address_line: string
          city: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string
          landmark: string | null
          pincode: string | null
          state: string | null
          user_id: string
        }
        Insert: {
          address_line: string
          city: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          pincode?: string | null
          state?: string | null
          user_id: string
        }
        Update: {
          address_line?: string
          city?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          pincode?: string | null
          state?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vm_banners: {
        Row: {
          bg_color: string | null
          created_at: string
          cta_link: string | null
          cta_text: string | null
          display_order: number
          id: string
          is_active: boolean
          subtitle: string | null
          title: string
        }
        Insert: {
          bg_color?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          subtitle?: string | null
          title: string
        }
        Update: {
          bg_color?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          subtitle?: string | null
          title?: string
        }
        Relationships: []
      }
      vm_categories: {
        Row: {
          created_at: string
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      vm_order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          order_id: string
          price: number
          product_id: string | null
          product_name: string
          quantity: number
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          order_id: string
          price: number
          product_id?: string | null
          product_name: string
          quantity: number
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          price?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "vm_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "vm_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vm_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vm_products"
            referencedColumns: ["id"]
          },
        ]
      }
      vm_orders: {
        Row: {
          admin_notes: string | null
          business_name: string | null
          created_at: string
          customer_name: string | null
          delivery_address: string
          delivery_notes: string | null
          id: string
          mobile: string | null
          order_number: string
          payment_method: Database["public"]["Enums"]["vm_payment_method"]
          payment_status: string
          status: Database["public"]["Enums"]["vm_order_status"]
          subtotal: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          business_name?: string | null
          created_at?: string
          customer_name?: string | null
          delivery_address: string
          delivery_notes?: string | null
          id?: string
          mobile?: string | null
          order_number?: string
          payment_method?: Database["public"]["Enums"]["vm_payment_method"]
          payment_status?: string
          status?: Database["public"]["Enums"]["vm_order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          business_name?: string | null
          created_at?: string
          customer_name?: string | null
          delivery_address?: string
          delivery_notes?: string | null
          id?: string
          mobile?: string | null
          order_number?: string
          payment_method?: Database["public"]["Enums"]["vm_payment_method"]
          payment_status?: string
          status?: Database["public"]["Enums"]["vm_order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vm_products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          freshness_note: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          is_out_of_stock: boolean
          min_order_qty: number
          name: string
          price: number
          stock: number
          unit: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          freshness_note?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_out_of_stock?: boolean
          min_order_qty?: number
          name: string
          price: number
          stock?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          freshness_note?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_out_of_stock?: boolean
          min_order_qty?: number
          name?: string
          price?: number
          stock?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vm_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vm_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      vm_profiles: {
        Row: {
          business_name: string | null
          business_type: Database["public"]["Enums"]["vm_business_type"] | null
          created_at: string
          email: string | null
          full_name: string | null
          gst_number: string | null
          id: string
          internal_remarks: string | null
          is_active: boolean
          mobile: string | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          business_name?: string | null
          business_type?: Database["public"]["Enums"]["vm_business_type"] | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gst_number?: string | null
          id?: string
          internal_remarks?: string | null
          is_active?: boolean
          mobile?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          business_name?: string | null
          business_type?: Database["public"]["Enums"]["vm_business_type"] | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gst_number?: string | null
          id?: string
          internal_remarks?: string | null
          is_active?: boolean
          mobile?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vm_settings: {
        Row: {
          business_name: string | null
          contact_phone: string | null
          id: string
          updated_at: string
          welcome_text: string | null
        }
        Insert: {
          business_name?: string | null
          contact_phone?: string | null
          id?: string
          updated_at?: string
          welcome_text?: string | null
        }
        Update: {
          business_name?: string | null
          contact_phone?: string | null
          id?: string
          updated_at?: string
          welcome_text?: string | null
        }
        Relationships: []
      }
      voice_calls: {
        Row: {
          agora_channel: string
          booking_id: string
          created_at: string | null
          customer_id: string
          ended_at: string | null
          id: string
          started_at: string | null
          status: string | null
          worker_id: string
        }
        Insert: {
          agora_channel: string
          booking_id: string
          created_at?: string | null
          customer_id: string
          ended_at?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          worker_id: string
        }
        Update: {
          agora_channel?: string
          booking_id?: string
          created_at?: string | null
          customer_id?: string
          ended_at?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          worker_id?: string
        }
        Relationships: []
      }
      voice_conversations: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          language: string | null
          started_at: string
          turn_count: number
          user_id: string
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          language?: string | null
          started_at?: string
          turn_count?: number
          user_id: string
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          language?: string | null
          started_at?: string
          turn_count?: number
          user_id?: string
          worker_id?: string | null
        }
        Relationships: []
      }
      voice_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          user_id: string
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          user_id: string
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          user_id?: string
          worker_id?: string | null
        }
        Relationships: []
      }
      voice_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          language: string | null
          role: string
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          language?: string | null
          role: string
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          language?: string | null
          role?: string
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "voice_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount_inr: number
          booking_id: string | null
          created_at: string
          id: string
          performed_by: string | null
          reason: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount_inr: number
          booking_id?: string | null
          created_at?: string
          id?: string
          performed_by?: string | null
          reason?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount_inr?: number
          booking_id?: string | null
          created_at?: string
          id?: string
          performed_by?: string | null
          reason?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      web_push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          p256dh: string
          user_id: string | null
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          p256dh: string
          user_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          p256dh?: string
          user_id?: string | null
        }
        Relationships: []
      }
      worker_archive: {
        Row: {
          archived_at: string
          archived_by: string | null
          bank_account_number: string | null
          bank_name: string | null
          cashfree_beneficiary_id: string | null
          communities: string[] | null
          community: string | null
          deletion_reason: string | null
          first_seen_at: string | null
          full_name: string | null
          id: string
          last_seen_at: string | null
          phone: string | null
          razorpay_bank_fund_account_id: string | null
          razorpay_contact_id: string | null
          razorpay_fund_account_id: string | null
          razorpay_vpa_fund_account_id: string | null
          snapshot: Json | null
          upi_id: string | null
        }
        Insert: {
          archived_at?: string
          archived_by?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          cashfree_beneficiary_id?: string | null
          communities?: string[] | null
          community?: string | null
          deletion_reason?: string | null
          first_seen_at?: string | null
          full_name?: string | null
          id: string
          last_seen_at?: string | null
          phone?: string | null
          razorpay_bank_fund_account_id?: string | null
          razorpay_contact_id?: string | null
          razorpay_fund_account_id?: string | null
          razorpay_vpa_fund_account_id?: string | null
          snapshot?: Json | null
          upi_id?: string | null
        }
        Update: {
          archived_at?: string
          archived_by?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          cashfree_beneficiary_id?: string | null
          communities?: string[] | null
          community?: string | null
          deletion_reason?: string | null
          first_seen_at?: string | null
          full_name?: string | null
          id?: string
          last_seen_at?: string | null
          phone?: string | null
          razorpay_bank_fund_account_id?: string | null
          razorpay_contact_id?: string | null
          razorpay_fund_account_id?: string | null
          razorpay_vpa_fund_account_id?: string | null
          snapshot?: Json | null
          upi_id?: string | null
        }
        Relationships: []
      }
      worker_availability: {
        Row: {
          day_of_week: number
          id: string
          slots: string[]
          updated_at: string
          worker_id: string
        }
        Insert: {
          day_of_week: number
          id?: string
          slots: string[]
          updated_at?: string
          worker_id: string
        }
        Update: {
          day_of_week?: number
          id?: string
          slots?: string[]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_availability_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_availability_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_blackouts: {
        Row: {
          date: string
          id: string
          reason: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          date: string
          id?: string
          reason?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          date?: string
          id?: string
          reason?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_blackouts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_blackouts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_busy_log: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          new_value: boolean
          old_value: boolean | null
          source: string
          worker_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          new_value: boolean
          old_value?: boolean | null
          source: string
          worker_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          new_value?: boolean
          old_value?: boolean | null
          source?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_busy_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_busy_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_busy_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_contact_access_log: {
        Row: {
          accessed_at: string
          accessed_by: string | null
          booking_id: string | null
          id: string
          ip_address: string | null
        }
        Insert: {
          accessed_at?: string
          accessed_by?: string | null
          booking_id?: string | null
          id?: string
          ip_address?: string | null
        }
        Update: {
          accessed_at?: string
          accessed_by?: string | null
          booking_id?: string | null
          id?: string
          ip_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_contact_access_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_deletion_audit: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          deleted_by_email: string | null
          id: string
          month_end: string | null
          month_start: string | null
          reason: string
          snapshot: Json | null
          worker_community: string | null
          worker_id: string
          worker_name: string | null
          worker_phone: string | null
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_email?: string | null
          id?: string
          month_end?: string | null
          month_start?: string | null
          reason?: string
          snapshot?: Json | null
          worker_community?: string | null
          worker_id: string
          worker_name?: string | null
          worker_phone?: string | null
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_email?: string | null
          id?: string
          month_end?: string | null
          month_start?: string | null
          reason?: string
          snapshot?: Json | null
          worker_community?: string | null
          worker_id?: string
          worker_name?: string | null
          worker_phone?: string | null
        }
        Relationships: []
      }
      worker_emergency_pause: {
        Row: {
          id: string
          paused_at: string
          paused_by: string | null
          prev_is_available: boolean | null
          reason: string | null
          released_at: string | null
          released_by: string | null
          worker_id: string
        }
        Insert: {
          id?: string
          paused_at?: string
          paused_by?: string | null
          prev_is_available?: boolean | null
          reason?: string | null
          released_at?: string | null
          released_by?: string | null
          worker_id: string
        }
        Update: {
          id?: string
          paused_at?: string
          paused_by?: string | null
          prev_is_available?: boolean | null
          reason?: string | null
          released_at?: string | null
          released_by?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_emergency_pause_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_emergency_pause_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_fault_events: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          note: string | null
          reason_code: string
          source: string
          triggered_by: string | null
          worker_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reason_code: string
          source: string
          triggered_by?: string | null
          worker_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reason_code?: string
          source?: string
          triggered_by?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_fault_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_fault_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_fault_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_fix_followups: {
        Row: {
          call_outcome: string | null
          created_at: string
          created_by: string | null
          id: string
          next_followup_at: string | null
          ops_note: string | null
          reason_code: string
          resolved_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
          worker_id: string
        }
        Insert: {
          call_outcome?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          next_followup_at?: string | null
          ops_note?: string | null
          reason_code: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          worker_id: string
        }
        Update: {
          call_outcome?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          next_followup_at?: string | null
          ops_note?: string | null
          reason_code?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          worker_id?: string
        }
        Relationships: []
      }
      worker_heartbeats: {
        Row: {
          app_state: string | null
          app_version: string | null
          battery_level: number | null
          heartbeat_at: string
          id: string
          network_type: string | null
          worker_id: string
        }
        Insert: {
          app_state?: string | null
          app_version?: string | null
          battery_level?: number | null
          heartbeat_at?: string
          id?: string
          network_type?: string | null
          worker_id: string
        }
        Update: {
          app_state?: string | null
          app_version?: string | null
          battery_level?: number | null
          heartbeat_at?: string
          id?: string
          network_type?: string | null
          worker_id?: string
        }
        Relationships: []
      }
      worker_issue_contacts: {
        Row: {
          contacted_at: string
          contacted_by: string | null
          contacted_by_name: string | null
          created_at: string
          id: string
          issue_keys: string[]
          note: string | null
          outcome: string | null
          worker_id: string
        }
        Insert: {
          contacted_at?: string
          contacted_by?: string | null
          contacted_by_name?: string | null
          created_at?: string
          id?: string
          issue_keys?: string[]
          note?: string | null
          outcome?: string | null
          worker_id: string
        }
        Update: {
          contacted_at?: string
          contacted_by?: string | null
          contacted_by_name?: string | null
          created_at?: string
          id?: string
          issue_keys?: string[]
          note?: string | null
          outcome?: string | null
          worker_id?: string
        }
        Relationships: []
      }
      worker_live_steps: {
        Row: {
          booking_id: string
          created_at: string
          device_info: Json | null
          last_step_at: string
          motion_status: string
          step_count: number
          updated_at: string
          worker_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          device_info?: Json | null
          last_step_at?: string
          motion_status?: string
          step_count?: number
          updated_at?: string
          worker_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          device_info?: Json | null
          last_step_at?: string
          motion_status?: string
          step_count?: number
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_live_steps_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_missed_booking_diagnostics: {
        Row: {
          app_state: string | null
          app_version: string | null
          battery_optimized: boolean | null
          booking_id: string | null
          booking_request_id: string | null
          created_at: string
          extra: Json | null
          fcm_token_present: boolean | null
          fcm_token_status: string | null
          id: string
          is_online_toggle: boolean | null
          last_heartbeat_at: string | null
          last_notification_at: string | null
          manufacturer: string | null
          model: string | null
          network_online: boolean | null
          notification_permission: string | null
          overlay_granted: boolean | null
          platform: string | null
          reason: string
          sdk: number | null
          user_id: string | null
          worker_id: string | null
        }
        Insert: {
          app_state?: string | null
          app_version?: string | null
          battery_optimized?: boolean | null
          booking_id?: string | null
          booking_request_id?: string | null
          created_at?: string
          extra?: Json | null
          fcm_token_present?: boolean | null
          fcm_token_status?: string | null
          id?: string
          is_online_toggle?: boolean | null
          last_heartbeat_at?: string | null
          last_notification_at?: string | null
          manufacturer?: string | null
          model?: string | null
          network_online?: boolean | null
          notification_permission?: string | null
          overlay_granted?: boolean | null
          platform?: string | null
          reason: string
          sdk?: number | null
          user_id?: string | null
          worker_id?: string | null
        }
        Update: {
          app_state?: string | null
          app_version?: string | null
          battery_optimized?: boolean | null
          booking_id?: string | null
          booking_request_id?: string | null
          created_at?: string
          extra?: Json | null
          fcm_token_present?: boolean | null
          fcm_token_status?: string | null
          id?: string
          is_online_toggle?: boolean | null
          last_heartbeat_at?: string | null
          last_notification_at?: string | null
          manufacturer?: string | null
          model?: string | null
          network_online?: boolean | null
          notification_permission?: string | null
          overlay_granted?: boolean | null
          platform?: string | null
          reason?: string
          sdk?: number | null
          user_id?: string | null
          worker_id?: string | null
        }
        Relationships: []
      }
      worker_ops_case_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          case_id: string
          created_at: string
          event_type: string
          id: string
          message: string | null
          payload: Json | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          case_id: string
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          payload?: Json | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          case_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_ops_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "worker_ops_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_ops_cases: {
        Row: {
          all_issue_keys: string[]
          assigned_at: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          auto_resolved: boolean
          case_number: number
          category: string | null
          community: string | null
          created_at: string
          downtime_seconds: number | null
          escalation: string
          first_response_at: string | null
          id: string
          issue_key: string
          issue_label: string | null
          last_reminder_at: string | null
          reminders_sent: number
          resolution_code: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_name: string | null
          service: string | null
          severity: string
          sla_breached_at: string | null
          sla_due_at: string
          sla_target_minutes: number
          status: string
          updated_at: string
          worker_id: string
          worker_name: string | null
          worker_phone: string | null
        }
        Insert: {
          all_issue_keys?: string[]
          assigned_at?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          auto_resolved?: boolean
          case_number?: number
          category?: string | null
          community?: string | null
          created_at?: string
          downtime_seconds?: number | null
          escalation?: string
          first_response_at?: string | null
          id?: string
          issue_key: string
          issue_label?: string | null
          last_reminder_at?: string | null
          reminders_sent?: number
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          service?: string | null
          severity?: string
          sla_breached_at?: string | null
          sla_due_at?: string
          sla_target_minutes?: number
          status?: string
          updated_at?: string
          worker_id: string
          worker_name?: string | null
          worker_phone?: string | null
        }
        Update: {
          all_issue_keys?: string[]
          assigned_at?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          auto_resolved?: boolean
          case_number?: number
          category?: string | null
          community?: string | null
          created_at?: string
          downtime_seconds?: number | null
          escalation?: string
          first_response_at?: string | null
          id?: string
          issue_key?: string
          issue_label?: string | null
          last_reminder_at?: string | null
          reminders_sent?: number
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          service?: string | null
          severity?: string
          sla_breached_at?: string | null
          sla_due_at?: string
          sla_target_minutes?: number
          status?: string
          updated_at?: string
          worker_id?: string
          worker_name?: string | null
          worker_phone?: string | null
        }
        Relationships: []
      }
      worker_ops_resolution_codes: {
        Row: {
          category: string | null
          code: string
          is_success: boolean
          label: string
          sort_order: number
        }
        Insert: {
          category?: string | null
          code: string
          is_success?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          category?: string | null
          code?: string
          is_success?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      worker_passive_movement: {
        Row: {
          created_at: string
          id: string
          is_moving: boolean
          previous_step_count: number
          sampled_at: string
          sensor_type: string | null
          source: string | null
          step_count: number
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_moving?: boolean
          previous_step_count?: number
          sampled_at?: string
          sensor_type?: string | null
          source?: string | null
          step_count?: number
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_moving?: boolean
          previous_step_count?: number
          sampled_at?: string
          sensor_type?: string | null
          source?: string | null
          step_count?: number
          worker_id?: string
        }
        Relationships: []
      }
      worker_payout_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
          updated_by_admin_id: string | null
          worker_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
          updated_by_admin_id?: string | null
          worker_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
          updated_by_admin_id?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payout_audit_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payout_audit_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payout_beneficiaries: {
        Row: {
          bank_account_number_hash: string
          bank_ifsc: string
          beneficiary_id: string
          created_at: string
          id: string
          is_shared: boolean
          provider: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          bank_account_number_hash: string
          bank_ifsc: string
          beneficiary_id: string
          created_at?: string
          id?: string
          is_shared?: boolean
          provider?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          bank_account_number_hash?: string
          bank_ifsc?: string
          beneficiary_id?: string
          created_at?: string
          id?: string
          is_shared?: boolean
          provider?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payout_beneficiaries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payout_beneficiaries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payout_events: {
        Row: {
          created_at: string
          event_type: string | null
          from_status: string | null
          id: string
          metadata: Json
          notes: string | null
          payout_id: string
          performed_by: string | null
          to_status: string
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          from_status?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          payout_id: string
          performed_by?: string | null
          to_status: string
        }
        Update: {
          created_at?: string
          event_type?: string | null
          from_status?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          payout_id?: string
          performed_by?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payout_events_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "worker_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payouts: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          auto_retry_enabled: boolean
          booking_id: string
          created_at: string
          currency: string
          external_reference: string | null
          failed_at: string | null
          failure_category: string | null
          failure_reason: string | null
          gross_amount: number
          held_at: string | null
          hold_reason: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          last_retry_at: string | null
          manual_utr: string | null
          next_retry_at: string | null
          paid_at: string | null
          payout_amount: number
          payout_method: string | null
          payout_source: string
          platform_fee: number
          processed_at: string | null
          processed_by_admin_id: string | null
          provider: string | null
          raw_response: Json | null
          razorpay_payout_id: string | null
          reference_id: string | null
          retry_count: number
          retry_stage: string | null
          reversed_at: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          auto_retry_enabled?: boolean
          booking_id: string
          created_at?: string
          currency?: string
          external_reference?: string | null
          failed_at?: string | null
          failure_category?: string | null
          failure_reason?: string | null
          gross_amount: number
          held_at?: string | null
          hold_reason?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          last_retry_at?: string | null
          manual_utr?: string | null
          next_retry_at?: string | null
          paid_at?: string | null
          payout_amount: number
          payout_method?: string | null
          payout_source?: string
          platform_fee?: number
          processed_at?: string | null
          processed_by_admin_id?: string | null
          provider?: string | null
          raw_response?: Json | null
          razorpay_payout_id?: string | null
          reference_id?: string | null
          retry_count?: number
          retry_stage?: string | null
          reversed_at?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          auto_retry_enabled?: boolean
          booking_id?: string
          created_at?: string
          currency?: string
          external_reference?: string | null
          failed_at?: string | null
          failure_category?: string | null
          failure_reason?: string | null
          gross_amount?: number
          held_at?: string | null
          hold_reason?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          last_retry_at?: string | null
          manual_utr?: string | null
          next_retry_at?: string | null
          paid_at?: string | null
          payout_amount?: number
          payout_method?: string | null
          payout_source?: string
          platform_fee?: number
          processed_at?: string | null
          processed_by_admin_id?: string | null
          provider?: string | null
          raw_response?: Json | null
          razorpay_payout_id?: string | null
          reference_id?: string | null
          retry_count?: number
          retry_stage?: string | null
          reversed_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payouts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payouts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payouts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_presence_logs: {
        Row: {
          community: string | null
          created_at: string
          id: string
          service: string | null
          status: string
          worker_id: string
        }
        Insert: {
          community?: string | null
          created_at?: string
          id?: string
          service?: string | null
          status: string
          worker_id: string
        }
        Update: {
          community?: string | null
          created_at?: string
          id?: string
          service?: string | null
          status?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_presence_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_presence_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_presence_snapshots: {
        Row: {
          community: string | null
          created_at: string
          id: string
          is_available: boolean | null
          is_busy: boolean | null
          last_seen_at: string | null
          service_type: string | null
          worker_id: string
        }
        Insert: {
          community?: string | null
          created_at?: string
          id?: string
          is_available?: boolean | null
          is_busy?: boolean | null
          last_seen_at?: string | null
          service_type?: string | null
          worker_id: string
        }
        Update: {
          community?: string | null
          created_at?: string
          id?: string
          is_available?: boolean | null
          is_busy?: boolean | null
          last_seen_at?: string | null
          service_type?: string | null
          worker_id?: string
        }
        Relationships: []
      }
      worker_ratings: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          user_id: string
          worker_id: string | null
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          user_id: string
          worker_id?: string | null
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_ratings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_reach_events: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          note: string | null
          reach_outcome: string
          source: string
          user_id: string | null
          worker_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          note?: string | null
          reach_outcome: string
          source?: string
          user_id?: string | null
          worker_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          note?: string | null
          reach_outcome?: string
          source?: string
          user_id?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_reach_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_reach_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_reach_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_registration_requests: {
        Row: {
          community: string
          created_at: string
          full_name: string
          id: string
          phone: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_types: string[]
          status: string
          updated_at: string
          upi_id: string
        }
        Insert: {
          community: string
          created_at?: string
          full_name: string
          id?: string
          phone: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_types: string[]
          status?: string
          updated_at?: string
          upi_id: string
        }
        Update: {
          community?: string
          created_at?: string
          full_name?: string
          id?: string
          phone?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_types?: string[]
          status?: string
          updated_at?: string
          upi_id?: string
        }
        Relationships: []
      }
      worker_reviews: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          rating: number
          updated_at: string
          worker_id: string
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          rating: number
          updated_at?: string
          worker_id: string
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          rating?: number
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_status_history: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_state: Json | null
          prev_state: Json | null
          reason: string | null
          worker_id: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_state?: Json | null
          prev_state?: Json | null
          reason?: string | null
          worker_id: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_state?: Json | null
          prev_state?: Json | null
          reason?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_status_history_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_status_history_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_telemetry_probes: {
        Row: {
          created_at: string
          created_by: string | null
          device_received_at: string | null
          fcm_send_error: string | null
          fcm_send_ok: boolean | null
          id: string
          notes: string | null
          popup_shown_at: string | null
          started_at: string
          worker_action: string | null
          worker_id: string
          worker_seen_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          device_received_at?: string | null
          fcm_send_error?: string | null
          fcm_send_ok?: boolean | null
          id?: string
          notes?: string | null
          popup_shown_at?: string | null
          started_at?: string
          worker_action?: string | null
          worker_id: string
          worker_seen_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          device_received_at?: string | null
          fcm_send_error?: string | null
          fcm_send_ok?: boolean | null
          id?: string
          notes?: string | null
          popup_shown_at?: string | null
          started_at?: string
          worker_action?: string | null
          worker_id?: string
          worker_seen_at?: string | null
        }
        Relationships: []
      }
      workers: {
        Row: {
          acceptance_rate_7d: number | null
          account_holder_name: string | null
          admin_fault_7d: number
          admin_override_rating: number | null
          app_platform: string | null
          app_standby_bucket: string | null
          app_state: string | null
          app_version: string | null
          archived_provider_snapshot: Json | null
          auto_pause_notified_at: string | null
          auto_paused_at: string | null
          auto_paused_reason: string | null
          auto_paused_restored_at: string | null
          auto_paused_source: string | null
          availability_last_changed_at: string | null
          availability_last_reason: string | null
          availability_last_source: string | null
          availability_state: string
          bank_account_number: string | null
          bank_details_source: string | null
          bank_details_verified: boolean
          bank_name: string | null
          bank_verification_notes: string | null
          bank_verification_status: string
          bank_verified_at: string | null
          battery_hint_shown_at: string | null
          battery_optimization_disabled: boolean | null
          battery_optimization_status: string | null
          battery_optimized: boolean | null
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          blocked_until: string | null
          build_number: string | null
          cashfree_beneficiary_address: string | null
          cashfree_beneficiary_email: string | null
          cashfree_beneficiary_id: string | null
          cashfree_beneficiary_last_attempt_at: string | null
          cashfree_beneficiary_last_error: string | null
          cashfree_beneficiary_next_retry_at: string | null
          cashfree_beneficiary_retry_count: number
          cashfree_beneficiary_status: string
          cashfree_beneficiary_synced_at: string | null
          communities: string[] | null
          community: string | null
          consecutive_delivery_failures: number
          cook_cuisine_tags: string[]
          created_at: string
          daily_duty_started_at: string | null
          daily_streak_count: number
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          device_info: Json | null
          device_manufacturer: string | null
          dispatch_cooldown_until: string | null
          fcm_last_fail_at: string | null
          fcm_last_fail_reason: string | null
          fcm_last_send_at: string | null
          fcm_token: string | null
          fcm_token_platform: string | null
          fcm_token_status: string
          fcm_token_updated_at: string | null
          first_booking_completed_at: string | null
          full_name: string
          id: string
          ifsc_code: string | null
          in_geofence: boolean | null
          is_active: boolean
          is_available: boolean | null
          is_blocked: boolean
          is_busy: boolean | null
          is_core_worker: boolean
          last_7_days_completed_bookings: number
          last_7_days_online_hours: number
          last_acknowledged_booking_at: string | null
          last_active_at: string | null
          last_app_opened_at: string | null
          last_booking_completed_at: string | null
          last_boot_android_version: string | null
          last_boot_at: string | null
          last_boot_oem: string | null
          last_device_ack_at: string | null
          last_fcm_success_at: string | null
          last_fcm_token_refresh_at: string | null
          last_heartbeat_at: string | null
          last_keepalive_ack_at: string | null
          last_keepalive_sent_at: string | null
          last_lat: number | null
          last_lng: number | null
          last_notification_received_at: string | null
          last_offer_at: string | null
          last_popup_ack_at: string | null
          last_push_error_at: string | null
          last_push_error_code: string | null
          last_push_success_at: string | null
          last_seen_at: string | null
          last_streak_date: string | null
          location_enabled: boolean | null
          no_ack_count: number | null
          not_reached_7d: number
          notification_health: string
          notification_health_score: number
          notification_health_updated_at: string | null
          notification_permission: string | null
          notification_permission_granted: boolean | null
          notification_repair_failures: number
          overlay_permission: string | null
          overlay_permission_granted: boolean | null
          overlay_permission_updated_at: string | null
          passbook_url: string | null
          payout_address: string | null
          payout_email: string | null
          payout_last_error: string | null
          payout_provider_preference: string | null
          payout_ready: boolean
          payout_verified_at: string | null
          pending_permanent_delete_at: string | null
          permissions_onboarded_at: string | null
          phone: string
          photo_url: string | null
          preferred_payout_method: string | null
          priority_score: number
          priority_score_updated_at: string | null
          push_block_reason: string | null
          push_deprioritized_until: string | null
          push_health_status: string
          rating: number | null
          rating_bucket: string
          razorpay_bank_fund_account_id: string | null
          razorpay_contact_id: string | null
          razorpay_fund_account_id: string | null
          razorpay_vpa_fund_account_id: string | null
          reachability_score: number | null
          reachability_status: string | null
          reliability_score: number
          respect_availability: boolean | null
          score_reason: string | null
          selected_community_id: string | null
          service_types: string[]
          stale_device: boolean
          stale_since: string | null
          timezone: string | null
          total_bookings_completed: number
          total_earnings: number | null
          total_ratings: number | null
          total_requests_7d: number
          updated_at: string
          upi_id: string | null
          upi_qr_payload: string | null
          upi_qr_uploaded_at: string | null
          upi_qr_url: string | null
          user_id: string | null
        }
        Insert: {
          acceptance_rate_7d?: number | null
          account_holder_name?: string | null
          admin_fault_7d?: number
          admin_override_rating?: number | null
          app_platform?: string | null
          app_standby_bucket?: string | null
          app_state?: string | null
          app_version?: string | null
          archived_provider_snapshot?: Json | null
          auto_pause_notified_at?: string | null
          auto_paused_at?: string | null
          auto_paused_reason?: string | null
          auto_paused_restored_at?: string | null
          auto_paused_source?: string | null
          availability_last_changed_at?: string | null
          availability_last_reason?: string | null
          availability_last_source?: string | null
          availability_state?: string
          bank_account_number?: string | null
          bank_details_source?: string | null
          bank_details_verified?: boolean
          bank_name?: string | null
          bank_verification_notes?: string | null
          bank_verification_status?: string
          bank_verified_at?: string | null
          battery_hint_shown_at?: string | null
          battery_optimization_disabled?: boolean | null
          battery_optimization_status?: string | null
          battery_optimized?: boolean | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          blocked_until?: string | null
          build_number?: string | null
          cashfree_beneficiary_address?: string | null
          cashfree_beneficiary_email?: string | null
          cashfree_beneficiary_id?: string | null
          cashfree_beneficiary_last_attempt_at?: string | null
          cashfree_beneficiary_last_error?: string | null
          cashfree_beneficiary_next_retry_at?: string | null
          cashfree_beneficiary_retry_count?: number
          cashfree_beneficiary_status?: string
          cashfree_beneficiary_synced_at?: string | null
          communities?: string[] | null
          community?: string | null
          consecutive_delivery_failures?: number
          cook_cuisine_tags?: string[]
          created_at?: string
          daily_duty_started_at?: string | null
          daily_streak_count?: number
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          device_info?: Json | null
          device_manufacturer?: string | null
          dispatch_cooldown_until?: string | null
          fcm_last_fail_at?: string | null
          fcm_last_fail_reason?: string | null
          fcm_last_send_at?: string | null
          fcm_token?: string | null
          fcm_token_platform?: string | null
          fcm_token_status?: string
          fcm_token_updated_at?: string | null
          first_booking_completed_at?: string | null
          full_name: string
          id?: string
          ifsc_code?: string | null
          in_geofence?: boolean | null
          is_active?: boolean
          is_available?: boolean | null
          is_blocked?: boolean
          is_busy?: boolean | null
          is_core_worker?: boolean
          last_7_days_completed_bookings?: number
          last_7_days_online_hours?: number
          last_acknowledged_booking_at?: string | null
          last_active_at?: string | null
          last_app_opened_at?: string | null
          last_booking_completed_at?: string | null
          last_boot_android_version?: string | null
          last_boot_at?: string | null
          last_boot_oem?: string | null
          last_device_ack_at?: string | null
          last_fcm_success_at?: string | null
          last_fcm_token_refresh_at?: string | null
          last_heartbeat_at?: string | null
          last_keepalive_ack_at?: string | null
          last_keepalive_sent_at?: string | null
          last_lat?: number | null
          last_lng?: number | null
          last_notification_received_at?: string | null
          last_offer_at?: string | null
          last_popup_ack_at?: string | null
          last_push_error_at?: string | null
          last_push_error_code?: string | null
          last_push_success_at?: string | null
          last_seen_at?: string | null
          last_streak_date?: string | null
          location_enabled?: boolean | null
          no_ack_count?: number | null
          not_reached_7d?: number
          notification_health?: string
          notification_health_score?: number
          notification_health_updated_at?: string | null
          notification_permission?: string | null
          notification_permission_granted?: boolean | null
          notification_repair_failures?: number
          overlay_permission?: string | null
          overlay_permission_granted?: boolean | null
          overlay_permission_updated_at?: string | null
          passbook_url?: string | null
          payout_address?: string | null
          payout_email?: string | null
          payout_last_error?: string | null
          payout_provider_preference?: string | null
          payout_ready?: boolean
          payout_verified_at?: string | null
          pending_permanent_delete_at?: string | null
          permissions_onboarded_at?: string | null
          phone: string
          photo_url?: string | null
          preferred_payout_method?: string | null
          priority_score?: number
          priority_score_updated_at?: string | null
          push_block_reason?: string | null
          push_deprioritized_until?: string | null
          push_health_status?: string
          rating?: number | null
          rating_bucket?: string
          razorpay_bank_fund_account_id?: string | null
          razorpay_contact_id?: string | null
          razorpay_fund_account_id?: string | null
          razorpay_vpa_fund_account_id?: string | null
          reachability_score?: number | null
          reachability_status?: string | null
          reliability_score?: number
          respect_availability?: boolean | null
          score_reason?: string | null
          selected_community_id?: string | null
          service_types?: string[]
          stale_device?: boolean
          stale_since?: string | null
          timezone?: string | null
          total_bookings_completed?: number
          total_earnings?: number | null
          total_ratings?: number | null
          total_requests_7d?: number
          updated_at?: string
          upi_id?: string | null
          upi_qr_payload?: string | null
          upi_qr_uploaded_at?: string | null
          upi_qr_url?: string | null
          user_id?: string | null
        }
        Update: {
          acceptance_rate_7d?: number | null
          account_holder_name?: string | null
          admin_fault_7d?: number
          admin_override_rating?: number | null
          app_platform?: string | null
          app_standby_bucket?: string | null
          app_state?: string | null
          app_version?: string | null
          archived_provider_snapshot?: Json | null
          auto_pause_notified_at?: string | null
          auto_paused_at?: string | null
          auto_paused_reason?: string | null
          auto_paused_restored_at?: string | null
          auto_paused_source?: string | null
          availability_last_changed_at?: string | null
          availability_last_reason?: string | null
          availability_last_source?: string | null
          availability_state?: string
          bank_account_number?: string | null
          bank_details_source?: string | null
          bank_details_verified?: boolean
          bank_name?: string | null
          bank_verification_notes?: string | null
          bank_verification_status?: string
          bank_verified_at?: string | null
          battery_hint_shown_at?: string | null
          battery_optimization_disabled?: boolean | null
          battery_optimization_status?: string | null
          battery_optimized?: boolean | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          blocked_until?: string | null
          build_number?: string | null
          cashfree_beneficiary_address?: string | null
          cashfree_beneficiary_email?: string | null
          cashfree_beneficiary_id?: string | null
          cashfree_beneficiary_last_attempt_at?: string | null
          cashfree_beneficiary_last_error?: string | null
          cashfree_beneficiary_next_retry_at?: string | null
          cashfree_beneficiary_retry_count?: number
          cashfree_beneficiary_status?: string
          cashfree_beneficiary_synced_at?: string | null
          communities?: string[] | null
          community?: string | null
          consecutive_delivery_failures?: number
          cook_cuisine_tags?: string[]
          created_at?: string
          daily_duty_started_at?: string | null
          daily_streak_count?: number
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          device_info?: Json | null
          device_manufacturer?: string | null
          dispatch_cooldown_until?: string | null
          fcm_last_fail_at?: string | null
          fcm_last_fail_reason?: string | null
          fcm_last_send_at?: string | null
          fcm_token?: string | null
          fcm_token_platform?: string | null
          fcm_token_status?: string
          fcm_token_updated_at?: string | null
          first_booking_completed_at?: string | null
          full_name?: string
          id?: string
          ifsc_code?: string | null
          in_geofence?: boolean | null
          is_active?: boolean
          is_available?: boolean | null
          is_blocked?: boolean
          is_busy?: boolean | null
          is_core_worker?: boolean
          last_7_days_completed_bookings?: number
          last_7_days_online_hours?: number
          last_acknowledged_booking_at?: string | null
          last_active_at?: string | null
          last_app_opened_at?: string | null
          last_booking_completed_at?: string | null
          last_boot_android_version?: string | null
          last_boot_at?: string | null
          last_boot_oem?: string | null
          last_device_ack_at?: string | null
          last_fcm_success_at?: string | null
          last_fcm_token_refresh_at?: string | null
          last_heartbeat_at?: string | null
          last_keepalive_ack_at?: string | null
          last_keepalive_sent_at?: string | null
          last_lat?: number | null
          last_lng?: number | null
          last_notification_received_at?: string | null
          last_offer_at?: string | null
          last_popup_ack_at?: string | null
          last_push_error_at?: string | null
          last_push_error_code?: string | null
          last_push_success_at?: string | null
          last_seen_at?: string | null
          last_streak_date?: string | null
          location_enabled?: boolean | null
          no_ack_count?: number | null
          not_reached_7d?: number
          notification_health?: string
          notification_health_score?: number
          notification_health_updated_at?: string | null
          notification_permission?: string | null
          notification_permission_granted?: boolean | null
          notification_repair_failures?: number
          overlay_permission?: string | null
          overlay_permission_granted?: boolean | null
          overlay_permission_updated_at?: string | null
          passbook_url?: string | null
          payout_address?: string | null
          payout_email?: string | null
          payout_last_error?: string | null
          payout_provider_preference?: string | null
          payout_ready?: boolean
          payout_verified_at?: string | null
          pending_permanent_delete_at?: string | null
          permissions_onboarded_at?: string | null
          phone?: string
          photo_url?: string | null
          preferred_payout_method?: string | null
          priority_score?: number
          priority_score_updated_at?: string | null
          push_block_reason?: string | null
          push_deprioritized_until?: string | null
          push_health_status?: string
          rating?: number | null
          rating_bucket?: string
          razorpay_bank_fund_account_id?: string | null
          razorpay_contact_id?: string | null
          razorpay_fund_account_id?: string | null
          razorpay_vpa_fund_account_id?: string | null
          reachability_score?: number | null
          reachability_status?: string | null
          reliability_score?: number
          respect_availability?: boolean | null
          score_reason?: string | null
          selected_community_id?: string | null
          service_types?: string[]
          stale_device?: boolean
          stale_since?: string | null
          timezone?: string | null
          total_bookings_completed?: number
          total_earnings?: number | null
          total_ratings?: number | null
          total_requests_7d?: number
          updated_at?: string
          upi_id?: string | null
          upi_qr_payload?: string | null
          upi_qr_uploaded_at?: string | null
          upi_qr_url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_selected_community_id_fkey"
            columns: ["selected_community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      community_hourly_availability: {
        Row: {
          community: string | null
          computed_at: string | null
          failed_bookings: number | null
          fulfilled_bookings: number | null
          fulfillment_rate: number | null
          hour_of_day: number | null
          service_type: string | null
          total_bookings: number | null
        }
        Relationships: []
      }
      v_payment_wallet_issues: {
        Row: {
          booking_id: string | null
          details: Json | null
          error_summary: string | null
          issue_type: string | null
          payment_intent_id: string | null
          severity: string | null
          user_id: string | null
          wallet_transaction_id: string | null
        }
        Relationships: []
      }
      worker_rating_stats: {
        Row: {
          avg_rating: number | null
          ratings_count: number | null
          worker_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_reliability_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_reliability_v: {
        Row: {
          app_standby_bucket: string | null
          availability_state: string | null
          battery_optimized: boolean | null
          consecutive_delivery_failures: number | null
          dispatch_cooldown_until: string | null
          fcm_token_platform: string | null
          fcm_token_status: string | null
          fcm_token_updated_at: string | null
          full_name: string | null
          id: string | null
          is_available: boolean | null
          last_active_at: string | null
          last_boot_android_version: string | null
          last_boot_at: string | null
          last_boot_oem: string | null
          last_fcm_token_refresh_at: string | null
          last_keepalive_ack_at: string | null
          last_keepalive_sent_at: string | null
          last_notification_received_at: string | null
          last_seen_at: string | null
          notification_permission: string | null
          phone: string | null
          reliability_score: number | null
          user_id: string | null
        }
        Insert: {
          app_standby_bucket?: string | null
          availability_state?: string | null
          battery_optimized?: boolean | null
          consecutive_delivery_failures?: number | null
          dispatch_cooldown_until?: string | null
          fcm_token_platform?: string | null
          fcm_token_status?: string | null
          fcm_token_updated_at?: string | null
          full_name?: string | null
          id?: string | null
          is_available?: boolean | null
          last_active_at?: string | null
          last_boot_android_version?: string | null
          last_boot_at?: string | null
          last_boot_oem?: string | null
          last_fcm_token_refresh_at?: string | null
          last_keepalive_ack_at?: string | null
          last_keepalive_sent_at?: string | null
          last_notification_received_at?: string | null
          last_seen_at?: string | null
          notification_permission?: string | null
          phone?: string | null
          reliability_score?: number | null
          user_id?: string | null
        }
        Update: {
          app_standby_bucket?: string | null
          availability_state?: string | null
          battery_optimized?: boolean | null
          consecutive_delivery_failures?: number | null
          dispatch_cooldown_until?: string | null
          fcm_token_platform?: string | null
          fcm_token_status?: string | null
          fcm_token_updated_at?: string | null
          full_name?: string | null
          id?: string | null
          is_available?: boolean | null
          last_active_at?: string | null
          last_boot_android_version?: string | null
          last_boot_at?: string | null
          last_boot_oem?: string | null
          last_fcm_token_refresh_at?: string | null
          last_keepalive_ack_at?: string | null
          last_keepalive_sent_at?: string | null
          last_notification_received_at?: string | null
          last_seen_at?: string | null
          notification_permission?: string | null
          phone?: string | null
          reliability_score?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _get_int_setting: {
        Args: { default_val: number; k: string }
        Returns: number
      }
      _is_admin_message: { Args: { rec: unknown }; Returns: boolean }
      _sla_core_work: { Args: never; Returns: undefined }
      _woc_sla_minutes: { Args: { p_esc: string }; Returns: number }
      academy_dashboard_stats: { Args: never; Returns: Json }
      accept_booking: { Args: { p_booking_id: string }; Returns: Json }
      admin_ack_chain_for_booking: {
        Args: { p_booking_id: string }
        Returns: {
          app_version: string
          break_stage: string
          delivered_at: string
          device_ack_at: string
          fcm_error_code: string
          fcm_send_status: string
          fcm_status: string
          last_heartbeat_at: string
          offered_at: string
          popup_opened_at: string
          request_status: string
          responded_at: string
          response_action: string
          worker_id: string
          worker_name: string
          worker_phone: string
        }[]
      }
      admin_approve_worker_registration: {
        Args: { p_photo_url?: string; p_request_id: string }
        Returns: undefined
      }
      admin_assign_case: {
        Args: { p_assignee: string; p_assignee_name: string; p_case: string }
        Returns: undefined
      }
      admin_audit_inactive_worker: {
        Args: { p_worker_id: string }
        Returns: Json
      }
      admin_audit_worker_eligibility: {
        Args: {
          p_booking_id?: string
          p_community?: string
          p_service?: string
        }
        Returns: {
          already_attempted: boolean
          app_version: string
          attempt_status: string
          bypass_active: boolean
          client_tier: string
          communities: string[]
          community_match: boolean
          dispatch_eligible: boolean
          exclusion_reasons: string[]
          fcm_token_status: string
          freshness_ok: boolean
          full_name: string
          has_fcm_token: boolean
          in_availability_slot: boolean
          is_active: boolean
          is_available: boolean
          is_blocked: boolean
          is_busy: boolean
          last_app_opened_at: string
          last_heartbeat_at: string
          last_seen_at: string
          no_ack_count: number
          notification_health: string
          online: boolean
          phone: string
          reachable: boolean
          service_match: boolean
          service_types: string[]
          stale_device: boolean
          worker_id: string
        }[]
      }
      admin_auto_resolve_healthy_cases: {
        Args: { p_still_open?: Json }
        Returns: number
      }
      admin_beneficiary_health: { Args: never; Returns: Json }
      admin_beneficiary_pending_workers: {
        Args: never
        Returns: {
          full_name: string
          last_attempt_at: string
          last_error: string
          minutes_pending: number
          next_retry_at: string
          phone: string
          retry_count: number
          status: string
          worker_created_at: string
          worker_id: string
        }[]
      }
      admin_block_worker_bank: {
        Args: { _reason: string; _worker_id: string }
        Returns: undefined
      }
      admin_booking_dispatch_analytics: {
        Args: {
          _community?: string
          _from?: string
          _limit?: number
          _service?: string
          _status?: string
          _to?: string
        }
        Returns: {
          assigned_at: string
          booking_id: string
          community: string
          created_at: string
          eligible_workers: number
          filter_reasons: Json
          filtered_workers: number
          first_ack_at: string
          last_ack_at: string
          offers_accepted: number
          offers_rejected: number
          offers_sent: number
          offers_timed_out: number
          scheduled_time: string
          service_type: string
          status: string
        }[]
      }
      admin_booking_opportunity_audit: {
        Args: { _day?: string }
        Returns: Json
      }
      admin_cancel_booking: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: undefined
      }
      admin_capacity_trends: {
        Args: { _days?: number }
        Returns: {
          cancelled: number
          community: string
          completed: number
          demand: number
          recommended_workers: number
          slot_hour: number
        }[]
      }
      admin_classify_inactive_worker: {
        Args: { p_worker_id: string }
        Returns: string
      }
      admin_clear_stale_requests: { Args: never; Returns: Json }
      admin_clear_worker_bank_block: {
        Args: { _worker_id: string }
        Returns: undefined
      }
      admin_clear_worker_rating: {
        Args: { p_worker_id: string }
        Returns: undefined
      }
      admin_complete_booking_with_otp: {
        Args: { p_booking_id: string; p_otp: string }
        Returns: Json
      }
      admin_credit_wallet: {
        Args: {
          p_amount: number
          p_booking_id?: string
          p_reason?: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_debit_wallet: {
        Args: {
          p_amount: number
          p_booking_id?: string
          p_reason?: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_delete_inactive_worker: {
        Args: { p_worker_id: string }
        Returns: Json
      }
      admin_dismiss_all_failed_payouts: {
        Args: { p_note?: string }
        Returns: number
      }
      admin_dismiss_failed_payout: {
        Args: { p_note?: string; p_payout_id: string }
        Returns: undefined
      }
      admin_dispatch_health_snapshot: { Args: never; Returns: Json }
      admin_emergency_manual_assign: {
        Args: { p_admin_id?: string; p_booking_id: string; p_worker_id: string }
        Returns: Json
      }
      admin_emergency_undo_pauses: {
        Args: { p_admin_id?: string }
        Returns: Json
      }
      admin_find_worker_duplicates: {
        Args: { p_worker_id: string }
        Returns: {
          full_name: string
          id: string
          match_reason: string
          phone: string
        }[]
      }
      admin_force_dispatch_now: { Args: never; Returns: Json }
      admin_get_legal_pdfs: {
        Args: never
        Returns: {
          privacy_url: string
          terms_url: string
        }[]
      }
      admin_get_web_version: {
        Args: never
        Returns: {
          force: boolean
          web_version: string
        }[]
      }
      admin_list_admins_for_assignment: {
        Args: never
        Returns: {
          name: string
          user_id: string
        }[]
      }
      admin_list_archive_candidates: {
        Args: { p_community?: string; p_service?: string }
        Returns: {
          accepted_this_month: number
          archive_reasons: string[]
          completed_this_month: number
          fcm_status: string
          full_name: string
          has_active_booking: boolean
          has_pending_payout: boolean
          is_available: boolean
          last_seen_at: string
          offers_this_month: number
          phone: string
          worker_id: string
        }[]
      }
      admin_list_inactive_workers: {
        Args: never
        Returns: {
          accepted_this_month: number
          app_version: string
          assigned_this_month: number
          cashfree_beneficiary_status: string
          classification: string
          communities: string[]
          community: string
          completed_this_month: number
          created_at: string
          deleted_at: string
          device_acks_this_month: number
          eligible: boolean
          fcm_token_count: number
          full_name: string
          has_active_booking: boolean
          has_duplicates: boolean
          has_processing_payout: boolean
          id: string
          is_active: boolean
          is_available: boolean
          is_blocked: boolean
          last_app_opened_at: string
          last_booking_assigned_at: string
          last_booking_offer_at: string
          last_completed_booking_at: string
          last_fcm_token_refresh_at: string
          last_heartbeat_at: string
          offers_received_this_month: number
          pending_permanent_delete_at: string
          phone: string
          skip_reason: string
          status: string
        }[]
      }
      admin_log_worker_fault: {
        Args: {
          p_booking_id: string
          p_note?: string
          p_reason_code: string
          p_source: string
          p_worker_id: string
        }
        Returns: string
      }
      admin_log_worker_reach: {
        Args: { p_booking_id: string; p_note?: string; p_outcome: string }
        Returns: string
      }
      admin_mark_booking_failed_no_worker: {
        Args: { p_admin_id: string; p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      admin_mark_worker_payout_ready: {
        Args: { p_worker_id: string }
        Returns: Json
      }
      admin_offline_worker_forensics: {
        Args: { p_community?: string; p_service?: string }
        Returns: {
          app_version: string
          availability_last_changed_at: string
          availability_last_reason: string
          availability_last_source: string
          fcm_status: string
          full_name: string
          is_active: boolean
          is_available: boolean
          last_availability_on: string
          last_heartbeat_at: string
          last_seen_at: string
          last_toggle_by: string
          last_toggle_reason: string
          phone: string
          worker_id: string
        }[]
      }
      admin_ops_alerts_live: {
        Args: never
        Returns: {
          created_at: string
          key: string
          message: string
          severity: string
          title: string
          value: number
        }[]
      }
      admin_ops_case_analytics: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      admin_ops_case_dashboard: { Args: never; Returns: Json }
      admin_permanent_delete_worker: {
        Args: { p_force?: boolean; p_worker_id: string }
        Returns: Json
      }
      admin_process_case_reminders: { Args: never; Returns: number }
      admin_push_health_daily_metrics: {
        Args: { p_day?: string }
        Returns: Json
      }
      admin_quick_stats: { Args: never; Returns: Json }
      admin_recreate_cancelled_booking: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      admin_reject_worker_bank: {
        Args: { _reason: string; _worker_id: string }
        Returns: undefined
      }
      admin_reject_worker_registration: {
        Args: { p_rejection_reason: string; p_request_id: string }
        Returns: undefined
      }
      admin_resolve_case: {
        Args: {
          p_case: string
          p_closed_unresolved?: boolean
          p_code: string
          p_note: string
        }
        Returns: undefined
      }
      admin_restart_dispatch_engine: { Args: never; Returns: Json }
      admin_restore_worker: { Args: { p_worker_id: string }; Returns: Json }
      admin_retry_failed_dispatch: { Args: never; Returns: Json }
      admin_revoke_worker_payout_ready: {
        Args: { p_reason?: string; p_worker_id: string }
        Returns: Json
      }
      admin_run_dispatch_self_test: { Args: never; Returns: Json }
      admin_save_worker_payout_details: {
        Args: {
          p_account_holder_name: string
          p_bank_account_number: string
          p_bank_name?: string
          p_ifsc_code: string
          p_mark_ready?: boolean
          p_upi_id?: string
          p_worker_id: string
        }
        Returns: Json
      }
      admin_set_booking_status: {
        Args: { p_booking_id: string; p_new_status: string; p_note?: string }
        Returns: undefined
      }
      admin_set_legal_pdf: {
        Args: { kind: string; url: string }
        Returns: undefined
      }
      admin_set_web_version: {
        Args: { force?: boolean; new_version: string }
        Returns: undefined
      }
      admin_set_worker_rating: {
        Args: { p_rating: number; p_worker_id: string }
        Returns: undefined
      }
      admin_slot_supply_breakdown: {
        Args: { p_community?: string; p_slot_start: string }
        Returns: Json
      }
      admin_slot_supply_demand: {
        Args: { _date?: string }
        Returns: {
          assigned: number
          available_workers: number
          bookings_received: number
          busy_workers: number
          cancel_rate: number
          cancelled: number
          completed: number
          fill_rate: number
          health: string
          pending: number
          reachable_workers: number
          required_workers: number
          slot_start: string
          supply_gap: number
        }[]
      }
      admin_soft_delete_worker: {
        Args: { p_reason?: string; p_worker_id: string }
        Returns: Json
      }
      admin_sync_worker_cases: {
        Args: { p_rows: Json }
        Returns: {
          case_id: string
          created: boolean
        }[]
      }
      admin_update_case_status: {
        Args: { p_case: string; p_note: string; p_status: string }
        Returns: undefined
      }
      admin_upsert_worker:
        | {
            Args: {
              p_community: string
              p_full_name: string
              p_is_active?: boolean
              p_phone: string
              p_photo_url?: string
              p_service_types: string[]
              p_upi_id: string
            }
            Returns: {
              acceptance_rate_7d: number | null
              account_holder_name: string | null
              admin_fault_7d: number
              admin_override_rating: number | null
              app_platform: string | null
              app_standby_bucket: string | null
              app_state: string | null
              app_version: string | null
              archived_provider_snapshot: Json | null
              auto_pause_notified_at: string | null
              auto_paused_at: string | null
              auto_paused_reason: string | null
              auto_paused_restored_at: string | null
              auto_paused_source: string | null
              availability_last_changed_at: string | null
              availability_last_reason: string | null
              availability_last_source: string | null
              availability_state: string
              bank_account_number: string | null
              bank_details_source: string | null
              bank_details_verified: boolean
              bank_name: string | null
              bank_verification_notes: string | null
              bank_verification_status: string
              bank_verified_at: string | null
              battery_hint_shown_at: string | null
              battery_optimization_disabled: boolean | null
              battery_optimization_status: string | null
              battery_optimized: boolean | null
              blocked_at: string | null
              blocked_by: string | null
              blocked_reason: string | null
              blocked_until: string | null
              build_number: string | null
              cashfree_beneficiary_address: string | null
              cashfree_beneficiary_email: string | null
              cashfree_beneficiary_id: string | null
              cashfree_beneficiary_last_attempt_at: string | null
              cashfree_beneficiary_last_error: string | null
              cashfree_beneficiary_next_retry_at: string | null
              cashfree_beneficiary_retry_count: number
              cashfree_beneficiary_status: string
              cashfree_beneficiary_synced_at: string | null
              communities: string[] | null
              community: string | null
              consecutive_delivery_failures: number
              cook_cuisine_tags: string[]
              created_at: string
              daily_duty_started_at: string | null
              daily_streak_count: number
              deleted_at: string | null
              deleted_by: string | null
              deletion_reason: string | null
              device_info: Json | null
              device_manufacturer: string | null
              dispatch_cooldown_until: string | null
              fcm_last_fail_at: string | null
              fcm_last_fail_reason: string | null
              fcm_last_send_at: string | null
              fcm_token: string | null
              fcm_token_platform: string | null
              fcm_token_status: string
              fcm_token_updated_at: string | null
              first_booking_completed_at: string | null
              full_name: string
              id: string
              ifsc_code: string | null
              in_geofence: boolean | null
              is_active: boolean
              is_available: boolean | null
              is_blocked: boolean
              is_busy: boolean | null
              is_core_worker: boolean
              last_7_days_completed_bookings: number
              last_7_days_online_hours: number
              last_acknowledged_booking_at: string | null
              last_active_at: string | null
              last_app_opened_at: string | null
              last_booking_completed_at: string | null
              last_boot_android_version: string | null
              last_boot_at: string | null
              last_boot_oem: string | null
              last_device_ack_at: string | null
              last_fcm_success_at: string | null
              last_fcm_token_refresh_at: string | null
              last_heartbeat_at: string | null
              last_keepalive_ack_at: string | null
              last_keepalive_sent_at: string | null
              last_lat: number | null
              last_lng: number | null
              last_notification_received_at: string | null
              last_offer_at: string | null
              last_popup_ack_at: string | null
              last_push_error_at: string | null
              last_push_error_code: string | null
              last_push_success_at: string | null
              last_seen_at: string | null
              last_streak_date: string | null
              location_enabled: boolean | null
              no_ack_count: number | null
              not_reached_7d: number
              notification_health: string
              notification_health_score: number
              notification_health_updated_at: string | null
              notification_permission: string | null
              notification_permission_granted: boolean | null
              notification_repair_failures: number
              overlay_permission: string | null
              overlay_permission_granted: boolean | null
              overlay_permission_updated_at: string | null
              passbook_url: string | null
              payout_address: string | null
              payout_email: string | null
              payout_last_error: string | null
              payout_provider_preference: string | null
              payout_ready: boolean
              payout_verified_at: string | null
              pending_permanent_delete_at: string | null
              permissions_onboarded_at: string | null
              phone: string
              photo_url: string | null
              preferred_payout_method: string | null
              priority_score: number
              priority_score_updated_at: string | null
              push_block_reason: string | null
              push_deprioritized_until: string | null
              push_health_status: string
              rating: number | null
              rating_bucket: string
              razorpay_bank_fund_account_id: string | null
              razorpay_contact_id: string | null
              razorpay_fund_account_id: string | null
              razorpay_vpa_fund_account_id: string | null
              reachability_score: number | null
              reachability_status: string | null
              reliability_score: number
              respect_availability: boolean | null
              score_reason: string | null
              selected_community_id: string | null
              service_types: string[]
              stale_device: boolean
              stale_since: string | null
              timezone: string | null
              total_bookings_completed: number
              total_earnings: number | null
              total_ratings: number | null
              total_requests_7d: number
              updated_at: string
              upi_id: string | null
              upi_qr_payload: string | null
              upi_qr_uploaded_at: string | null
              upi_qr_url: string | null
              user_id: string | null
            }
            SetofOptions: {
              from: "*"
              to: "workers"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { p_worker: Json }
            Returns: {
              acceptance_rate_7d: number | null
              account_holder_name: string | null
              admin_fault_7d: number
              admin_override_rating: number | null
              app_platform: string | null
              app_standby_bucket: string | null
              app_state: string | null
              app_version: string | null
              archived_provider_snapshot: Json | null
              auto_pause_notified_at: string | null
              auto_paused_at: string | null
              auto_paused_reason: string | null
              auto_paused_restored_at: string | null
              auto_paused_source: string | null
              availability_last_changed_at: string | null
              availability_last_reason: string | null
              availability_last_source: string | null
              availability_state: string
              bank_account_number: string | null
              bank_details_source: string | null
              bank_details_verified: boolean
              bank_name: string | null
              bank_verification_notes: string | null
              bank_verification_status: string
              bank_verified_at: string | null
              battery_hint_shown_at: string | null
              battery_optimization_disabled: boolean | null
              battery_optimization_status: string | null
              battery_optimized: boolean | null
              blocked_at: string | null
              blocked_by: string | null
              blocked_reason: string | null
              blocked_until: string | null
              build_number: string | null
              cashfree_beneficiary_address: string | null
              cashfree_beneficiary_email: string | null
              cashfree_beneficiary_id: string | null
              cashfree_beneficiary_last_attempt_at: string | null
              cashfree_beneficiary_last_error: string | null
              cashfree_beneficiary_next_retry_at: string | null
              cashfree_beneficiary_retry_count: number
              cashfree_beneficiary_status: string
              cashfree_beneficiary_synced_at: string | null
              communities: string[] | null
              community: string | null
              consecutive_delivery_failures: number
              cook_cuisine_tags: string[]
              created_at: string
              daily_duty_started_at: string | null
              daily_streak_count: number
              deleted_at: string | null
              deleted_by: string | null
              deletion_reason: string | null
              device_info: Json | null
              device_manufacturer: string | null
              dispatch_cooldown_until: string | null
              fcm_last_fail_at: string | null
              fcm_last_fail_reason: string | null
              fcm_last_send_at: string | null
              fcm_token: string | null
              fcm_token_platform: string | null
              fcm_token_status: string
              fcm_token_updated_at: string | null
              first_booking_completed_at: string | null
              full_name: string
              id: string
              ifsc_code: string | null
              in_geofence: boolean | null
              is_active: boolean
              is_available: boolean | null
              is_blocked: boolean
              is_busy: boolean | null
              is_core_worker: boolean
              last_7_days_completed_bookings: number
              last_7_days_online_hours: number
              last_acknowledged_booking_at: string | null
              last_active_at: string | null
              last_app_opened_at: string | null
              last_booking_completed_at: string | null
              last_boot_android_version: string | null
              last_boot_at: string | null
              last_boot_oem: string | null
              last_device_ack_at: string | null
              last_fcm_success_at: string | null
              last_fcm_token_refresh_at: string | null
              last_heartbeat_at: string | null
              last_keepalive_ack_at: string | null
              last_keepalive_sent_at: string | null
              last_lat: number | null
              last_lng: number | null
              last_notification_received_at: string | null
              last_offer_at: string | null
              last_popup_ack_at: string | null
              last_push_error_at: string | null
              last_push_error_code: string | null
              last_push_success_at: string | null
              last_seen_at: string | null
              last_streak_date: string | null
              location_enabled: boolean | null
              no_ack_count: number | null
              not_reached_7d: number
              notification_health: string
              notification_health_score: number
              notification_health_updated_at: string | null
              notification_permission: string | null
              notification_permission_granted: boolean | null
              notification_repair_failures: number
              overlay_permission: string | null
              overlay_permission_granted: boolean | null
              overlay_permission_updated_at: string | null
              passbook_url: string | null
              payout_address: string | null
              payout_email: string | null
              payout_last_error: string | null
              payout_provider_preference: string | null
              payout_ready: boolean
              payout_verified_at: string | null
              pending_permanent_delete_at: string | null
              permissions_onboarded_at: string | null
              phone: string
              photo_url: string | null
              preferred_payout_method: string | null
              priority_score: number
              priority_score_updated_at: string | null
              push_block_reason: string | null
              push_deprioritized_until: string | null
              push_health_status: string
              rating: number | null
              rating_bucket: string
              razorpay_bank_fund_account_id: string | null
              razorpay_contact_id: string | null
              razorpay_fund_account_id: string | null
              razorpay_vpa_fund_account_id: string | null
              reachability_score: number | null
              reachability_status: string | null
              reliability_score: number
              respect_availability: boolean | null
              score_reason: string | null
              selected_community_id: string | null
              service_types: string[]
              stale_device: boolean
              stale_since: string | null
              timezone: string | null
              total_bookings_completed: number
              total_earnings: number | null
              total_ratings: number | null
              total_requests_7d: number
              updated_at: string
              upi_id: string | null
              upi_qr_payload: string | null
              upi_qr_uploaded_at: string | null
              upi_qr_url: string | null
              user_id: string | null
            }
            SetofOptions: {
              from: "*"
              to: "workers"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      admin_worker_health_buckets: { Args: never; Returns: Json }
      admin_worker_issue_daily_analytics: { Args: never; Returns: Json }
      admin_worker_issue_impact: {
        Args: { p_worker_ids: string[] }
        Returns: {
          estimated_revenue_lost: number
          last_accepted_at: string
          last_completed_at: string
          last_contact_note: string
          last_contact_outcome: string
          last_contacted_at: string
          last_contacted_by_name: string
          missed_7d: number
          missed_today: number
          worker_id: string
        }[]
      }
      admin_worker_push_health: {
        Args: never
        Returns: {
          accepts_last_24h: number
          android_version: string
          app_version: string
          consecutive_no_ack_count: number
          device_manufacturer: string
          device_model: string
          full_name: string
          has_fcm_token: boolean
          last_acknowledged_booking_at: string
          last_device_ack_at: string
          last_heartbeat_at: string
          last_notification_received_at: string
          last_push_error_at: string
          last_push_error_code: string
          last_push_success_at: string
          needs_battery_config: boolean
          no_ack_last_24h: number
          offers_last_24h: number
          phone: string
          push_deprioritized_until: string
          push_health_status: string
          worker_id: string
        }[]
      }
      admin_worker_reach_audit: {
        Args: never
        Returns: {
          app_version: string
          battery_optimization_disabled: boolean
          category: string
          communities: string[]
          device_manufacturer: string
          evidence: string
          fcm_token_present: boolean
          fcm_token_status: string
          full_name: string
          is_active: boolean
          is_available: boolean
          is_blocked: boolean
          is_busy: boolean
          is_dispatch_eligible: boolean
          is_online: boolean
          is_reachable: boolean
          last_acknowledged_booking_at: string
          last_app_opened_at: string
          last_booking_completed_at: string
          last_heartbeat_at: string
          last_offer_at: string
          last_seen_at: string
          no_ack_count: number
          notification_permission_granted: boolean
          offers_accepted_today: number
          offers_no_ack_today: number
          offers_rejected_today: number
          offers_timeout_today: number
          offers_today: number
          phone: string
          primary_reason: string
          push_health_status: string
          reachability_score: number
          reachability_status: string
          recommended_fix: string
          service_types: string[]
          worker_id: string
        }[]
      }
      admin_worker_reach_audit_counts: { Args: never; Returns: Json }
      admin_worker_status_counts: { Args: never; Returns: Json }
      admin_worker_status_list: {
        Args: {
          _community?: string
          _search?: string
          _service?: string
          _tab?: string
        }
        Returns: {
          app_version: string
          communities: string[]
          current_booking_id: string
          fcm_token_present: boolean
          full_name: string
          is_active: boolean
          is_available: boolean
          is_busy: boolean
          issue_flags: Json
          last_device_ack_at: string
          last_heartbeat_at: string
          no_ack_count: number
          phone: string
          push_deprioritized_until: string
          reachable: boolean
          services: string[]
          status: string
          today_completed: number
          worker_id: string
        }[]
      }
      approve_worker_payout: {
        Args: { p_admin_notes?: string; p_payout_id: string }
        Returns: Json
      }
      assign_booking_to_next_worker: {
        Args: { p_booking_id: string }
        Returns: Record<string, unknown>
      }
      assign_to_next_worker: { Args: { p_booking_id: string }; Returns: Json }
      assign_worker: {
        Args: { p_booking_id: string; p_worker_id: string }
        Returns: undefined
      }
      assign_worker_to_booking:
        | { Args: { p_booking_id: string; p_worker_id: string }; Returns: Json }
        | {
            Args: {
              p_assigned_by?: string
              p_booking_id: string
              p_worker_id: string
            }
            Returns: {
              accepted_at: string | null
              assigned_at: string | null
              assigned_by_admin: boolean
              assignment_method: string
              assignment_reason: string | null
              auto_complete_after_minutes: number | null
              auto_complete_at: string | null
              base_price_inr: number | null
              bathroom_count: number | null
              booking_type: string
              can_cancel_until: string | null
              cancel_fault_party: string | null
              cancel_reason: string | null
              cancel_reason_code: string | null
              cancel_source: string | null
              cancelled_at: string | null
              community: string
              completed_at: string | null
              completed_by: string | null
              completed_count_at_booking: number | null
              completion_otp: string | null
              completion_source: string | null
              confirmed_at: string | null
              cook_cuisine_pref: string | null
              cook_gender_pref: string | null
              created_at: string
              cust_name: string
              cust_phone: string
              discount_inr: number
              discount_reason: string | null
              dish_intensity: string | null
              dish_intensity_extra_inr: number | null
              dispatch_anomaly: string | null
              dispatch_anomaly_at: string | null
              dispatch_attempts: number
              dispatch_expires_at: string | null
              dispatch_lock_until: string | null
              dispatch_started_at: string | null
              dispatch_status: string
              family_count: number | null
              flat_no: string
              flat_size: string | null
              food_pref: string | null
              glass_partition_fee: number | null
              has_glass_partition: boolean | null
              id: string
              is_demo: boolean
              last_dispatch_at: string | null
              loyalty_surcharge_inr: number
              loyalty_surge_amount: number
              loyalty_tier_id: string | null
              maid_tasks: Database["public"]["Enums"]["maid_task"][] | null
              notes: string | null
              on_the_way_at: string | null
              otp_verified_at: string | null
              paid_confirmed_at: string | null
              paid_confirmed_by_user: boolean | null
              pay_enabled_at: string | null
              payment_method: string | null
              payment_status: string | null
              payout_amount: number | null
              prealert_sent: boolean
              preferred_worker_id: string | null
              previous_booking_id: string | null
              price_inr: number | null
              razorpay_order_id: string | null
              razorpay_payment_id: string | null
              razorpay_signature: string | null
              reach_confirmed_at: string | null
              reach_confirmed_by: string | null
              reach_status: string | null
              scheduled_date: string | null
              scheduled_time: string | null
              service_type: string
              slot_surge_amount: number
              slot_surge_time: string | null
              started_at: string | null
              status: string
              surcharge_amount: number | null
              surcharge_reason: string | null
              updated_at: string
              user_id: string
              user_marked_paid_at: string | null
              user_payment_utr: string | null
              user_reminder_sent: boolean | null
              waiting_busy_worker_count: number | null
              waiting_started_at: string | null
              waiting_until: string | null
              worker_collected_at: string | null
              worker_collected_payment: boolean | null
              worker_collection_method: string | null
              worker_id: string | null
              worker_name: string | null
              worker_phone: string | null
              worker_photo_url: string | null
              worker_rejected_count: number
              worker_upi: string | null
            }
            SetofOptions: {
              from: "*"
              to: "bookings"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      atomic_accept_booking: {
        Args: {
          p_booking_id: string
          p_worker_id: string
          p_worker_name?: string
          p_worker_phone?: string
        }
        Returns: {
          accepted: boolean
          message: string
        }[]
      }
      auto_cancel_stale_instant_bookings: { Args: never; Returns: number }
      auto_complete_assigned: { Args: never; Returns: undefined }
      auto_enable_stale_offline_workers: {
        Args: never
        Returns: {
          hours_offline: number
          worker_id: string
        }[]
      }
      auto_handle_overdue_bookings: { Args: never; Returns: number }
      auto_heal_stale_worker_busy: {
        Args: never
        Returns: {
          was_fixed: boolean
          worker_id: string
          worker_name: string
        }[]
      }
      auto_offline_stale_heartbeat_workers: { Args: never; Returns: number }
      auto_unblock_expired_workers: { Args: never; Returns: undefined }
      bath_total_price: {
        Args: { p_community?: string; p_count: number }
        Returns: number
      }
      bytea_to_text: { Args: { data: string }; Returns: string }
      check_dispatch_stuck_bookings: { Args: never; Returns: undefined }
      check_expired_assignments: { Args: never; Returns: Json }
      check_instant_supply: { Args: { p_community: string }; Returns: number }
      check_instant_supply_for_service: {
        Args: { p_community: string; p_service_type: string }
        Returns: number
      }
      check_payout_eligibility: { Args: { p_payout_id: string }; Returns: Json }
      cleanup_old_booking_requests: { Args: never; Returns: undefined }
      cleanup_old_heartbeats: { Args: never; Returns: number }
      cleanup_old_presence_snapshots: { Args: never; Returns: number }
      cleanup_old_support_chats: { Args: never; Returns: undefined }
      cleanup_old_worker_busy_logs: { Args: never; Returns: undefined }
      cleanup_payment_intents: { Args: never; Returns: undefined }
      cleanup_stale_worker_busy_flags: {
        Args: never
        Returns: {
          was_busy: boolean
          worker_id: string
          worker_name: string
        }[]
      }
      compute_worker_availability_state: {
        Args: { _worker_id: string }
        Returns: string
      }
      compute_worker_reachability: {
        Args: { p_worker_id: string }
        Returns: string
      }
      count_matching_busy_workers: {
        Args: { p_booking_id: string }
        Returns: {
          busy_count: number
          worker_ids: string[]
        }[]
      }
      create_admin_email_user: { Args: never; Returns: undefined }
      create_wallet_booking: {
        Args: { p_amount_inr: number; p_booking: Json; p_user_id: string }
        Returns: Json
      }
      create_worker_payout_on_completion_for: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      credit_wallet_on_cancel: {
        Args: {
          p_booking_id: string
          p_reason?: string
          p_skip_booking_update?: boolean
        }
        Returns: Json
      }
      current_worker_id: { Args: never; Returns: string }
      debit_wallet_for_booking: {
        Args: { p_amount: number; p_booking_id: string }
        Returns: undefined
      }
      delete_my_data: { Args: never; Returns: undefined }
      delete_worker_cascade: {
        Args: { p_worker_id: string }
        Returns: undefined
      }
      detect_and_suppress_silent_workers: {
        Args: never
        Returns: {
          suppressed_until: string
          worker_id: string
        }[]
      }
      dispatch_booking: { Args: { p_booking_id: string }; Returns: undefined }
      dispatch_health_probe: { Args: never; Returns: undefined }
      ensure_worker_profile: { Args: never; Returns: Json }
      escalate_overdue_bookings: { Args: never; Returns: undefined }
      export_my_data: { Args: never; Returns: Json }
      filter_reachable_workers: {
        Args: { p_worker_ids: string[] }
        Returns: {
          reachable: boolean
          reason: string
          worker_id: string
        }[]
      }
      generate_worker_payout_address: {
        Args: { _community: string }
        Returns: string
      }
      get_active_booking_statuses: { Args: never; Returns: string[] }
      get_app_setting: { Args: { k: string }; Returns: string }
      get_assigned_worker_info: {
        Args: { booking_id: string }
        Returns: {
          is_active: boolean
          service_types: string[]
          worker_id: string
          worker_name: string
        }[]
      }
      get_assigned_worker_safe_info: {
        Args: { p_booking_id: string }
        Returns: {
          worker_id: string
          worker_name: string
          worker_photo_url: string
          worker_rating: number
          worker_total_ratings: number
        }[]
      }
      get_auto_cancel_audit: {
        Args: {
          p_community?: string
          p_from?: string
          p_limit?: number
          p_reason?: string
          p_service?: string
          p_to?: string
          p_under_minutes?: number
          p_wrong_only?: boolean
        }
        Returns: {
          age_minutes: number
          booking_id: string
          booking_type: string
          cancel_reason: string
          cancel_source: string
          cancellation_function: string
          cancelled_at: string
          community: string
          created_at: string
          cust_name: string
          cust_phone: string
          decision_explanation: string
          dispatch_attempts: number
          flat_size: string
          is_wrong_cancellation: boolean
          last_offer_at: string
          matching_busy_workers_count: number
          service_type: string
          waiting_until: string
          was_waiting_for_worker: boolean
          workers_failed: number
          workers_notified: number
          workers_rejected: number
          workers_timedout: number
        }[]
      }
      get_availability_forecast: {
        Args: { p_community: string; p_service: string }
        Returns: {
          availability_pct: number
          bucket: string
          failed_bookings: number
          fulfilled_bookings: number
          hour_of_day: number
          total_bookings: number
        }[]
      }
      get_available_experts_for_booking: {
        Args: {
          p_booking_time?: string
          p_community: string
          p_service_type: string
        }
        Returns: {
          expert_id: string
          expert_name: string
          expert_phone: string
          expert_rating: number
          fcm_token: string
          priority_score: number
        }[]
      }
      get_available_workers_by_rating: {
        Args: { p_community?: string; p_service_type: string }
        Returns: {
          fcm_token: string
          full_name: string
          phone: string
          rating: number
          total_ratings: number
          worker_id: string
        }[]
      }
      get_available_workers_safe: {
        Args: { p_community?: string; p_service_type?: string }
        Returns: {
          full_name: string
          id: string
          photo_url: string
          rating: number
          service_types: string[]
          total_ratings: number
        }[]
      }
      get_booking_assignment_status: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      get_booking_dispatch_audit: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      get_booking_participants: {
        Args: { p_booking_id: string }
        Returns: {
          user_id: string
          worker_id: string
        }[]
      }
      get_booking_starvation_audit: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      get_booking_status: { Args: { p_booking_id: string }; Returns: Json }
      get_cancel_reason_breakdown:
        | {
            Args: {
              p_community?: string
              p_end: string
              p_service?: string
              p_start: string
            }
            Returns: {
              count: number
              reason: string
            }[]
          }
        | {
            Args: {
              p_cancel_source?: string
              p_community?: string
              p_end: string
              p_service?: string
              p_start: string
            }
            Returns: {
              count: number
              reason: string
            }[]
          }
      get_cancellation_analytics: {
        Args: {
          p_cancelled_by?: string
          p_community?: string
          p_end: string
          p_service?: string
          p_start: string
          p_type?: string
        }
        Returns: Json
      }
      get_cancelled_booking_audit: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      get_community_platform_fee_percent: {
        Args: { _community: string }
        Returns: number
      }
      get_dispatch_config:
        | {
            Args: { p_community: string; p_service_type: string }
            Returns: {
              dispatch_cooldown_seconds: number
              first_batch_size: number
              instant_expiry_minutes: number
              max_consecutive_timeouts: number
              max_dispatch_attempts: number
              max_total_requests: number
              retry_batch_size: number
              worker_ttl_seconds: number
            }[]
          }
        | {
            Args: {
              p_booking_type?: string
              p_community: string
              p_service_type: string
            }
            Returns: {
              dispatch_cooldown_seconds: number
              first_batch_size: number
              instant_expiry_minutes: number
              max_consecutive_timeouts: number
              max_dispatch_attempts: number
              max_total_requests: number
              retry_batch_size: number
              worker_ttl_seconds: number
            }[]
          }
      get_dispatch_health: { Args: never; Returns: Json }
      get_dispatch_simulation_summary: {
        Args: { p_days?: number }
        Returns: Json
      }
      get_edge_function_versions: {
        Args: never
        Returns: {
          events_last_hour: number
          function_name: string
          last_seen_at: string
          observed_version: string
        }[]
      }
      get_eligible_workers: {
        Args: { p_community: string; p_limit?: number; p_service: string }
        Returns: {
          completed_bookings_count: number
          full_name: string
          last_seen_at: string
          photo_url: string
          rating_avg: number
          rating_count: number
          worker_id: string
        }[]
      }
      get_emergency_pending_view: {
        Args: never
        Returns: {
          age_minutes: number
          attempted_workers: Json
          booking_id: string
          booking_type: string
          community: string
          created_at: string
          cust_name: string
          cust_phone: string
          dispatch_attempts: number
          flat_no: string
          flat_size: string
          scheduled_date: string
          scheduled_time: string
          service_type: string
          status: string
        }[]
      }
      get_favorite_workers:
        | {
            Args: { p_community: string; p_service: string }
            Returns: {
              completed_bookings_count: number
              full_name: string
              is_online: boolean
              last_booking_at: string
              last_seen_at: string
              photo_url: string
              rating_avg: number
              rating_count: number
              worker_id: string
            }[]
          }
        | {
            Args: { p_community: string; p_service: string; p_user_id?: string }
            Returns: {
              completed_bookings_count: number
              full_name: string
              is_online: boolean
              last_booking_at: string
              last_seen_at: string
              photo_url: string
              rating_avg: number
              rating_count: number
              worker_id: string
            }[]
          }
      get_hourly_supply_demand: {
        Args: {
          p_booking_type?: string
          p_community?: string
          p_end_ts: string
          p_service_type?: string
          p_start_ts: string
        }
        Returns: {
          bookings_assigned: number
          bookings_completed: number
          bookings_created: number
          busy_workers: number
          hour_label: string
          hour_ts: string
          online_workers: number
          shortage_score: number
          total_active_workers: number
          utilization_pct: number
        }[]
      }
      get_hourly_worker_online_metrics: {
        Args: never
        Returns: {
          hour: string
          workers_active_count: number
          workers_available_count: number
          workers_busy_count: number
          workers_online_count: number
        }[]
      }
      get_legal_pdfs: {
        Args: never
        Returns: {
          privacy_url: string
          terms_url: string
        }[]
      }
      get_loyalty_tier_for_count: {
        Args: { p_count: number }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          max_completed: number | null
          min_completed: number
          surcharge_inr: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dynamic_pricing_tiers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_wallet_balance: {
        Args: never
        Returns: {
          balance_inr: number
        }[]
      }
      get_my_wallet_transactions: {
        Args: never
        Returns: {
          amount_inr: number
          booking_id: string
          created_at: string
          id: string
          reason: string
          type: string
        }[]
      }
      get_online_workers_count: {
        Args: { p_community: string }
        Returns: {
          online_count: number
          service: string
        }[]
      }
      get_ops_hourly_metrics: {
        Args: {
          p_community?: string
          p_end: string
          p_service?: string
          p_start: string
        }
        Returns: {
          acceptance_rate_pct: number
          assigned_auto_count: number
          assigned_manual_count: number
          avg_response_time_seconds: number
          bookings_instant: number
          bookings_scheduled: number
          bookings_total: number
          cancel_by_user_count: number
          cancel_by_worker_count: number
          cancel_total: number
          hour_label: string
          hour_start: string
          not_assigned_count: number
          rejection_count: number
          risk_score: number
          workers_available_count: number
          workers_busy_count: number
          workers_online_count: number
        }[]
      }
      get_ops_setting: { Args: { p_key: string }; Returns: string }
      get_or_create_invoice: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_invoice_type: string
          p_payload: Json
        }
        Returns: {
          amount_inr: number
          booking_id: string
          created_at: string
          generated_by: string | null
          id: string
          invoice_no: string
          invoice_type: string
          payload: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_payout_health_today: { Args: never; Returns: Json }
      get_payout_reliability_metrics: { Args: never; Returns: Json }
      get_payout_summary: { Args: never; Returns: Json }
      get_priority_shadow_comparison: {
        Args: never
        Returns: {
          community: string
          completed_bookings: number
          diff: number
          full_name: string
          is_active: boolean
          rank_change: number
          rank_v2: number
          rank_v3: number
          score_v2: number
          score_v3: number
          v3_updated_at: string
          worker_id: string
        }[]
      }
      get_profile_id: { Args: never; Returns: string }
      get_realtime_active_workers: {
        Args: { p_community?: string; p_service?: string }
        Returns: {
          active_workers: number
          available_workers: number
          busy_workers: number
          offline_workers: number
        }[]
      }
      get_scheduled_slot_availability: {
        Args: { p_community: string; p_date: string; p_service_type: string }
        Returns: {
          slot_time: string
          worker_count: number
        }[]
      }
      get_setting: {
        Args: { p_default: string; p_key: string }
        Returns: string
      }
      get_setting_int: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      get_shared_bank_workers: {
        Args: { _worker_id: string }
        Returns: {
          beneficiary_id: string
          full_name: string
          worker_id: string
        }[]
      }
      get_slot_bookings_drilldown: {
        Args: {
          p_community: string
          p_end_date: string
          p_service_type: string
          p_slot_time: string
          p_start_date: string
        }
        Returns: {
          booking_id: string
          booking_type: string
          cancel_reason: string
          cancel_source: string
          created_at: string
          cust_name: string
          cust_phone: string
          scheduled_date: string
          scheduled_time: string
          status: string
          worker_id: string
          worker_name: string
        }[]
      }
      get_slot_demand_analytics: {
        Args: {
          p_community: string
          p_end_date: string
          p_service_type: string
          p_start_date: string
        }
        Returns: {
          bookings_cancelled: number
          bookings_completed: number
          bookings_created: number
          cancel_reasons: Json
          slot_time: string
        }[]
      }
      get_stuck_pending_bookings: {
        Args: { p_threshold_minutes?: number }
        Returns: {
          age_minutes: number
          booking_id: string
          booking_type: string
          community: string
          created_at: string
          cust_name: string
          dispatch_attempts: number
          dispatch_expires_at: string
          dispatch_status: string
          last_dispatch_event: string
          last_dispatch_event_at: string
          service_type: string
          workers_pending: number
          workers_rejected: number
          workers_timed_out: number
          workers_tried: number
        }[]
      }
      get_supply_gap_analysis: {
        Args: never
        Returns: {
          acceptance_pct: number
          accepted: number
          hour_ist: number
          missed: number
          rejected: number
          total_requests: number
        }[]
      }
      get_user_post_launch_completed_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_surge_amount: {
        Args: { p_user_id: string }
        Returns: {
          booking_count: number
          next_surge_amount: number
          next_tier_booking: number
          surge_amount: number
          tier_number: number
        }[]
      }
      get_worker_contact: { Args: { p_booking_id: string }; Returns: Json }
      get_worker_dispatch_scores: {
        Args: { p_worker_ids: string[] }
        Returns: {
          acceptance_rate: number
          accepted_count: number
          last_accepted_at: string
          last_completed_at: string
          predictive_score: number
          push_success_rate: number
          rejected_count: number
          rejection_rate: number
          timed_out_count: number
          timeout_rate: number
          total_requests: number
          worker_id: string
        }[]
      }
      get_worker_live_stats: {
        Args: never
        Returns: {
          completed_7d: number
          live_priority_score: number
          worker_id: string
        }[]
      }
      get_worker_online_hourly: {
        Args: { p_community?: string; p_date: string }
        Returns: {
          available_workers_count: number
          busy_workers_count: number
          demand_count: number
          hour_label: string
          hour_start: string
          offline_workers_count: number
          online_workers_count: number
        }[]
      }
      get_worker_performance_summary: {
        Args: never
        Returns: {
          acceptance_rate: number
          accepted: number
          community: string
          completed: number
          completion_rate: number
          full_name: string
          id: string
          is_active: boolean
          is_available: boolean
          is_busy: boolean
          last_seen_at: string
          missed: number
          rating: number
          rejected: number
          req_accepted: number
          service_types: string[]
          total_earnings: number
          total_ratings: number
        }[]
      }
      get_worker_rating_distribution: {
        Args: never
        Returns: {
          rating_range: string
          worker_count: number
        }[]
      }
      get_worker_score_debug: {
        Args: { p_community?: string; p_service_type?: string }
        Returns: {
          completed_7d: number
          effective_rating: number
          final_rank: number
          is_active: boolean
          is_available: boolean
          is_busy: boolean
          last_seen_at: string
          not_reached_7d: number
          priority_score: number
          rating_bucket: string
          score_reason: string
          score_updated_at: string
          worker_fault_7d: number
          worker_id: string
          worker_name: string
        }[]
      }
      get_worker_slot_supply: {
        Args: {
          p_community: string
          p_day_of_week: number
          p_service_type: string
        }
        Returns: {
          slot_time: string
          worker_count: number
        }[]
      }
      get_worker_supply_health: {
        Args: never
        Returns: {
          total_workers: number
          workers_active_last_3_days: number
          workers_active_last_7_days: number
          workers_active_today: number
          workers_available_now: number
          workers_busy_now: number
          workers_inactive_over_7_days: number
          workers_never_received_booking: number
          workers_offline_now: number
          workers_with_atleast_1_booking: number
        }[]
      }
      get_worker_upcoming_scheduled_bookings: {
        Args: { p_limit?: number }
        Returns: {
          booking_id: string
          community: string
          payout_amount: number
          price_inr: number
          scheduled_date: string
          scheduled_time: string
          service_type: string
          status: string
        }[]
      }
      get_workers_for_notification: {
        Args: { p_community: string; p_service_type: string }
        Returns: {
          fcm_token: string
          worker_id: string
        }[]
      }
      get_workers_for_slot: {
        Args: {
          p_community: string
          p_day_of_week: number
          p_service_type: string
          p_slot_time: string
        }
        Returns: {
          communities: string[]
          full_name: string
          id: string
          is_available: boolean
          is_busy: boolean
          phone: string
          photo_url: string
          rating: number
          service_types: string[]
        }[]
      }
      get_workers_never_received_booking: {
        Args: never
        Returns: {
          communities: string[]
          created_at: string
          earnings: number
          is_active: boolean
          is_available: boolean
          last_seen_at: string
          name: string
          phone: string
          rating: number
          service_types: string[]
          total_bookings_completed: number
          worker_id: string
        }[]
      }
      handle_assignment_timeout: {
        Args: { p_assignment_id: string }
        Returns: Json
      }
      handle_assignment_timeouts: { Args: never; Returns: Json }
      handle_expert_booking_response: {
        Args: {
          p_assignment_id: string
          p_expert_id: string
          p_response: string
        }
        Returns: Json
      }
      handle_expired_assignments: {
        Args: never
        Returns: {
          booking_id: string
          expired_worker_id: string
          next_assignment_id: string
          next_worker_fcm_token: string
          next_worker_id: string
          next_worker_name: string
        }[]
      }
      handle_worker_response: {
        Args: {
          p_assignment_id: string
          p_response: string
          p_worker_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      haversine_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      heal_black_hole_bookings: { Args: never; Returns: Json }
      heal_stuck_busy_workers: { Args: never; Returns: number }
      hold_worker_payout: {
        Args: {
          p_admin_notes?: string
          p_hold_reason: string
          p_payout_id: string
        }
        Returns: Json
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      increment_worker_failure: {
        Args: { _cooldown_until: string; _worker_id: string }
        Returns: undefined
      }
      initiate_booking_assignment: {
        Args: {
          p_booking_id: string
          p_community: string
          p_service_type: string
        }
        Returns: Json
      }
      instant_limit_for_service: {
        Args: { p_service_type: string }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
      is_worker_available_at_time: {
        Args: { p_timestamp: string; p_worker_id: string }
        Returns: boolean
      }
      is_worker_reachable: { Args: { p_worker_id: string }; Returns: boolean }
      list_payment_wallet_issues: {
        Args: {
          p_booking_status?: string
          p_community?: string
          p_from?: string
          p_issue_type?: string
          p_limit?: number
          p_payment_method?: string
          p_payment_status?: string
          p_resolution_status?: string
          p_search?: string
          p_service_type?: string
          p_severity?: string
          p_to?: string
        }
        Returns: {
          booking_created_at: string
          booking_id: string
          booking_status: string
          community: string
          cust_name: string
          cust_phone: string
          details: Json
          error_summary: string
          internal_notes: string
          issue_type: string
          payment_intent_id: string
          payment_method: string
          payment_status: string
          price_inr: number
          resolution_id: string
          resolution_status: string
          resolved_at: string
          resolved_by: string
          reviewed_at: string
          reviewed_by: string
          service_type: string
          severity: string
          user_id: string
          wallet_transaction_id: string
        }[]
      }
      log_dispatch_reachability: { Args: { p_rows: Json }; Returns: number }
      log_otp_reminder_event: {
        Args: { p_booking_id: string; p_event_type: string; p_metadata?: Json }
        Returns: string
      }
      log_payout_event: {
        Args: {
          p_event_type: string
          p_metadata?: Json
          p_notes?: string
          p_payout_id: string
          p_to_status: string
        }
        Returns: string
      }
      maid_total_price: {
        Args: {
          p_community?: string
          p_flat: string
          p_tasks: Database["public"]["Enums"]["maid_task"][]
        }
        Returns: number
      }
      mark_stale_push_tokens: {
        Args: { p_stale_days?: number }
        Returns: number
      }
      mark_support_messages_as_seen: {
        Args: { p_thread_id: string }
        Returns: undefined
      }
      mark_worker_payout_failed: {
        Args: {
          p_admin_notes?: string
          p_failure_reason: string
          p_payout_id: string
        }
        Returns: Json
      }
      mark_worker_payout_paid: {
        Args: {
          p_admin_notes?: string
          p_external_reference?: string
          p_payout_id: string
          p_payout_method?: string
        }
        Returns: Json
      }
      mark_worker_payout_processing: {
        Args: { p_admin_notes?: string; p_payout_id: string }
        Returns: Json
      }
      mark_worker_push_health: {
        Args: {
          p_block_reason?: string
          p_error_code?: string
          p_status: string
          p_worker_id: string
        }
        Returns: undefined
      }
      norm_phone: { Args: { p: string }; Returns: string }
      notify_next_worker: { Args: { p_booking_id: string }; Returns: Json }
      p2_is_reachable: {
        Args: { _w: Database["public"]["Tables"]["workers"]["Row"] }
        Returns: boolean
      }
      p2_issue_flags: {
        Args: { _w: Database["public"]["Tables"]["workers"]["Row"] }
        Returns: Json
      }
      payment_wallet_issues_summary: { Args: never; Returns: Json }
      pending_sla_minutes: { Args: never; Returns: number }
      pg_advisory_unlock_booking: {
        Args: { p_booking_id: string }
        Returns: boolean
      }
      pg_advisory_unlock_dispatch: { Args: never; Returns: boolean }
      pg_try_advisory_lock_booking: {
        Args: { p_booking_id: string }
        Returns: boolean
      }
      pg_try_advisory_lock_dispatch: { Args: never; Returns: boolean }
      preview_worker_update_impact: {
        Args: { p_min_version_name: string }
        Returns: {
          blocked_workers: number
          total_workers: number
          unknown_version_workers: number
        }[]
      }
      prune_dispatch_reachability_audit: { Args: never; Returns: number }
      pushcut_notify_support:
        | {
            Args: {
              p_community: string
              p_message_id: number
              p_preview: string
              p_service: string
              p_thread_id: string
              p_user_name: string
              p_user_phone: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_community: string
              p_message_id: string
              p_preview: string
              p_service: string
              p_thread_id: string
              p_user_name: string
              p_user_phone: string
            }
            Returns: undefined
          }
      pushcut_notify_support_direct: {
        Args: {
          p_message_id: string
          p_open_url: string
          p_text: string
          p_thread_id: string
          p_title: string
        }
        Returns: undefined
      }
      raise_stuck_pending_booking_alerts: { Args: never; Returns: number }
      recalc_worker_priority_score_one: {
        Args: { p_worker_id: string }
        Returns: undefined
      }
      recalc_worker_priority_scores: { Args: never; Returns: undefined }
      recalc_worker_rating: {
        Args: { p_worker_id: string }
        Returns: undefined
      }
      recompute_all_workers_notification_health: {
        Args: never
        Returns: number
      }
      recompute_worker_busy: {
        Args: { p_booking_id?: string; p_source?: string; p_worker_id: string }
        Returns: undefined
      }
      recompute_worker_notification_health: {
        Args: { p_worker_id: string }
        Returns: undefined
      }
      redispatch_booking: { Args: { p_booking_id: string }; Returns: undefined }
      refresh_community_hourly_availability: { Args: never; Returns: undefined }
      register_worker: {
        Args: {
          p_community: string
          p_full_name: string
          p_phone: string
          p_service_types: string[]
          p_upi_id: string
        }
        Returns: Json
      }
      register_worker_request: {
        Args: {
          p_community: string
          p_full_name: string
          p_phone: string
          p_service_types: string[]
          p_upi_id: string
        }
        Returns: Json
      }
      reject_booking_request: {
        Args: { p_booking_id: string; p_worker_id: string }
        Returns: Json
      }
      release_worker_payout: {
        Args: { p_admin_notes?: string; p_payout_id: string }
        Returns: Json
      }
      repair_worker_push_health: {
        Args: { p_new_token: string; p_worker_id: string }
        Returns: undefined
      }
      respond_to_booking_assignment: {
        Args: { p_assignment_id: string; p_response: string }
        Returns: {
          booking_id: string
          message: string
          success: boolean
          worker_id: string
        }[]
      }
      run_scheduled_prealerts: {
        Args: { p_window_minutes?: number }
        Returns: undefined
      }
      run_sla_with_secret: { Args: { p_secret: string }; Returns: undefined }
      safe_wallet_increment: {
        Args: {
          p_amount_delta: number
          p_min_balance?: number
          p_user_id: string
        }
        Returns: Json
      }
      schedule_assignment_timeout: {
        Args: { p_assignment_id: string; p_expires_at: string }
        Returns: undefined
      }
      seed_worker_availability: {
        Args: { p_worker_id: string }
        Returns: undefined
      }
      semver_lt: { Args: { a: string; b: string }; Returns: boolean }
      send_demo_notification: {
        Args: {
          p_customer_name?: string
          p_location?: string
          p_service_type?: string
        }
        Returns: {
          message: string
          notification_data: Json
          success: boolean
        }[]
      }
      send_fcm_notification: {
        Args: {
          p_body: string
          p_booking_id: string
          p_data: Json
          p_notification_type: string
          p_title: string
          p_worker_id: string
        }
        Returns: Json
      }
      send_fcm_to_worker: {
        Args: {
          p_booking_id: string
          p_community: string
          p_customer_name: string
          p_fcm_token: string
          p_flat_no: string
          p_service_type: string
        }
        Returns: boolean
      }
      send_real_fcm_notification: {
        Args: {
          p_body?: string
          p_data?: Json
          p_title?: string
          p_worker_id: string
        }
        Returns: Json
      }
      set_worker_availability: {
        Args: {
          p_changed_by?: string
          p_is_available: boolean
          p_reason?: string
          p_source: string
          p_worker_id: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simple_assign_to_next_worker: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      start_daily_duty: {
        Args: { _worker_user_id: string }
        Returns: {
          started_at: string
          streak: number
        }[]
      }
      support_get_or_create_thread: {
        Args: { p_booking_id?: string }
        Returns: {
          booking_id: string | null
          created_at: string
          id: string
          last_message: string | null
          last_sender: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "support_threads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      support_mark_seen: { Args: { p_thread: string }; Returns: undefined }
      sweep_preferred_timeouts: { Args: never; Returns: number }
      test_booking_assignment_system: {
        Args: {
          p_community?: string
          p_customer_name?: string
          p_service_type?: string
        }
        Returns: Json
      }
      test_complete_booking_system: {
        Args: {
          p_community?: string
          p_customer_name?: string
          p_service_type?: string
        }
        Returns: Json
      }
      test_fcm_notification: {
        Args: { p_body?: string; p_title?: string; p_worker_id?: string }
        Returns: Json
      }
      test_worker_notification: {
        Args: {
          p_customer_name?: string
          p_location?: string
          p_service_type?: string
        }
        Returns: {
          assignment_id: string
          booking_id: string
          message: string
          worker_name: string
        }[]
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      timeout_expired_booking_requests: { Args: never; Returns: number }
      try_accept_booking: { Args: { p_booking_id: string }; Returns: Json }
      try_accept_pending: {
        Args: { p_booking_id: string }
        Returns: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_by_admin: boolean
          assignment_method: string
          assignment_reason: string | null
          auto_complete_after_minutes: number | null
          auto_complete_at: string | null
          base_price_inr: number | null
          bathroom_count: number | null
          booking_type: string
          can_cancel_until: string | null
          cancel_fault_party: string | null
          cancel_reason: string | null
          cancel_reason_code: string | null
          cancel_source: string | null
          cancelled_at: string | null
          community: string
          completed_at: string | null
          completed_by: string | null
          completed_count_at_booking: number | null
          completion_otp: string | null
          completion_source: string | null
          confirmed_at: string | null
          cook_cuisine_pref: string | null
          cook_gender_pref: string | null
          created_at: string
          cust_name: string
          cust_phone: string
          discount_inr: number
          discount_reason: string | null
          dish_intensity: string | null
          dish_intensity_extra_inr: number | null
          dispatch_anomaly: string | null
          dispatch_anomaly_at: string | null
          dispatch_attempts: number
          dispatch_expires_at: string | null
          dispatch_lock_until: string | null
          dispatch_started_at: string | null
          dispatch_status: string
          family_count: number | null
          flat_no: string
          flat_size: string | null
          food_pref: string | null
          glass_partition_fee: number | null
          has_glass_partition: boolean | null
          id: string
          is_demo: boolean
          last_dispatch_at: string | null
          loyalty_surcharge_inr: number
          loyalty_surge_amount: number
          loyalty_tier_id: string | null
          maid_tasks: Database["public"]["Enums"]["maid_task"][] | null
          notes: string | null
          on_the_way_at: string | null
          otp_verified_at: string | null
          paid_confirmed_at: string | null
          paid_confirmed_by_user: boolean | null
          pay_enabled_at: string | null
          payment_method: string | null
          payment_status: string | null
          payout_amount: number | null
          prealert_sent: boolean
          preferred_worker_id: string | null
          previous_booking_id: string | null
          price_inr: number | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          reach_confirmed_at: string | null
          reach_confirmed_by: string | null
          reach_status: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          service_type: string
          slot_surge_amount: number
          slot_surge_time: string | null
          started_at: string | null
          status: string
          surcharge_amount: number | null
          surcharge_reason: string | null
          updated_at: string
          user_id: string
          user_marked_paid_at: string | null
          user_payment_utr: string | null
          user_reminder_sent: boolean | null
          waiting_busy_worker_count: number | null
          waiting_started_at: string | null
          waiting_until: string | null
          worker_collected_at: string | null
          worker_collected_payment: boolean | null
          worker_collection_method: string | null
          worker_id: string | null
          worker_name: string | null
          worker_phone: string | null
          worker_photo_url: string | null
          worker_rejected_count: number
          worker_upi: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      try_enter_waiting_for_worker: {
        Args: { p_booking_id: string; p_max_wait_minutes?: number }
        Returns: {
          busy_count: number
          entered: boolean
          waiting_until: string
        }[]
      }
      update_booking_status: {
        Args: { p_booking_id: string; p_status: string }
        Returns: Json
      }
      update_expert_availability: {
        Args: {
          p_availability_status: string
          p_expert_id: string
          p_is_available?: boolean
        }
        Returns: Json
      }
      update_worker_availability:
        | { Args: { p_is_available: boolean }; Returns: Json }
        | {
            Args: { is_available_param: boolean; worker_id_param: string }
            Returns: boolean
          }
      update_worker_fcm_token: {
        Args: { p_fcm_token: string; p_worker_id: string }
        Returns: Json
      }
      update_worker_location: {
        Args: { p_lat: number; p_lng: number }
        Returns: Json
      }
      upsert_payment_wallet_resolution: {
        Args: {
          p_booking_id: string
          p_internal_notes?: string
          p_issue_type: string
          p_resolution_status: string
        }
        Returns: string
      }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      user_can_see_booking: {
        Args: { booking_row: Database["public"]["Tables"]["bookings"]["Row"] }
        Returns: boolean
      }
      user_cancel_booking: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: undefined
      }
      worker_collect_payment: {
        Args: { p_booking_id: string; p_method: string }
        Returns: Json
      }
      worker_has_valid_payout_details: {
        Args: {
          _account_holder_name: string
          _bank_account_number: string
          _ifsc_code: string
        }
        Returns: boolean
      }
      worker_phone_exists: { Args: { _phone: string }; Returns: boolean }
      worker_respond_to_booking: {
        Args: {
          p_assignment_id: string
          p_response: string
          p_worker_id: string
        }
        Returns: Json
      }
      worker_set_booking_status: {
        Args: { p_booking_id: string; p_new_status: string }
        Returns: Json
      }
      worker_system_payout_email: {
        Args: { worker_uuid: string }
        Returns: string
      }
    }
    Enums: {
      academy_difficulty: "beginner" | "intermediate" | "advanced"
      academy_progress_status: "started" | "completed"
      academy_status: "active" | "inactive"
      academy_target_type: "all" | "service" | "community" | "worker" | "city"
      app_role: "admin" | "worker" | "customer"
      maid_task: "floor_cleaning" | "dish_washing"
      payment_status: "pending" | "paid" | "partial" | "overdue" | "cancelled"
      user_role: "admin" | "staff" | "landlord"
      vm_business_type:
        | "restaurant"
        | "hotel"
        | "cloud_kitchen"
        | "caterer"
        | "other"
      vm_order_status:
        | "pending"
        | "confirmed"
        | "packed"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      vm_payment_method: "cod" | "pay_later" | "online_transfer"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
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
      academy_difficulty: ["beginner", "intermediate", "advanced"],
      academy_progress_status: ["started", "completed"],
      academy_status: ["active", "inactive"],
      academy_target_type: ["all", "service", "community", "worker", "city"],
      app_role: ["admin", "worker", "customer"],
      maid_task: ["floor_cleaning", "dish_washing"],
      payment_status: ["pending", "paid", "partial", "overdue", "cancelled"],
      user_role: ["admin", "staff", "landlord"],
      vm_business_type: [
        "restaurant",
        "hotel",
        "cloud_kitchen",
        "caterer",
        "other",
      ],
      vm_order_status: [
        "pending",
        "confirmed",
        "packed",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      vm_payment_method: ["cod", "pay_later", "online_transfer"],
    },
  },
} as const
