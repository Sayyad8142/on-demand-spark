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
      admin_fcm_tokens: {
        Row: {
          created_at: string
          device_info: string | null
          id: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          id?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          id?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          created_at: string | null
          id: string
          min_worker_version_code: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          min_worker_version_code?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          min_worker_version_code?: number
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
          unit_price_inr: number
          updated_at: string
        }
        Insert: {
          community?: string
          unit_price_inr?: number
          updated_at?: string
        }
        Update: {
          community?: string
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
      booking_requests: {
        Row: {
          booking_id: string
          created_at: string | null
          id: string
          offered_at: string | null
          order_sequence: number
          responded_at: string | null
          status: string | null
          timeout_at: string | null
          worker_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          id?: string
          offered_at?: string | null
          order_sequence: number
          responded_at?: string | null
          status?: string | null
          timeout_at?: string | null
          worker_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          id?: string
          offered_at?: string | null
          order_sequence?: number
          responded_at?: string | null
          status?: string | null
          timeout_at?: string | null
          worker_id?: string
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
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_history: {
        Row: {
          booking_id: string
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string | null
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string | null
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
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
      bookings: {
        Row: {
          accepted_at: string | null
          assigned_at: string | null
          auto_complete_after_minutes: number | null
          auto_complete_at: string | null
          bathroom_count: number | null
          booking_type: string
          can_cancel_until: string | null
          cancel_reason: string | null
          cancel_source: string | null
          cancelled_at: string | null
          community: string
          completed_at: string | null
          confirmed_at: string | null
          cook_cuisine_pref: string | null
          cook_gender_pref: string | null
          created_at: string
          cust_name: string
          cust_phone: string
          family_count: number | null
          flat_no: string
          flat_size: string | null
          food_pref: string | null
          id: string
          is_demo: boolean
          maid_tasks: Database["public"]["Enums"]["maid_task"][] | null
          notes: string | null
          on_the_way_at: string | null
          paid_confirmed_at: string | null
          paid_confirmed_by_user: boolean | null
          pay_enabled_at: string | null
          payment_method: string | null
          payment_status: string | null
          payout_amount: number | null
          prealert_sent: boolean
          price_inr: number | null
          reach_confirmed_at: string | null
          reach_confirmed_by: string | null
          reach_status: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          service_type: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
          user_marked_paid_at: string | null
          user_payment_utr: string | null
          worker_id: string | null
          worker_name: string | null
          worker_phone: string | null
          worker_photo_url: string | null
          worker_upi: string | null
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string | null
          auto_complete_after_minutes?: number | null
          auto_complete_at?: string | null
          bathroom_count?: number | null
          booking_type: string
          can_cancel_until?: string | null
          cancel_reason?: string | null
          cancel_source?: string | null
          cancelled_at?: string | null
          community: string
          completed_at?: string | null
          confirmed_at?: string | null
          cook_cuisine_pref?: string | null
          cook_gender_pref?: string | null
          created_at?: string
          cust_name: string
          cust_phone: string
          family_count?: number | null
          flat_no: string
          flat_size?: string | null
          food_pref?: string | null
          id?: string
          is_demo?: boolean
          maid_tasks?: Database["public"]["Enums"]["maid_task"][] | null
          notes?: string | null
          on_the_way_at?: string | null
          paid_confirmed_at?: string | null
          paid_confirmed_by_user?: boolean | null
          pay_enabled_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payout_amount?: number | null
          prealert_sent?: boolean
          price_inr?: number | null
          reach_confirmed_at?: string | null
          reach_confirmed_by?: string | null
          reach_status?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_type: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          user_marked_paid_at?: string | null
          user_payment_utr?: string | null
          worker_id?: string | null
          worker_name?: string | null
          worker_phone?: string | null
          worker_photo_url?: string | null
          worker_upi?: string | null
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string | null
          auto_complete_after_minutes?: number | null
          auto_complete_at?: string | null
          bathroom_count?: number | null
          booking_type?: string
          can_cancel_until?: string | null
          cancel_reason?: string | null
          cancel_source?: string | null
          cancelled_at?: string | null
          community?: string
          completed_at?: string | null
          confirmed_at?: string | null
          cook_cuisine_pref?: string | null
          cook_gender_pref?: string | null
          created_at?: string
          cust_name?: string
          cust_phone?: string
          family_count?: number | null
          flat_no?: string
          flat_size?: string | null
          food_pref?: string | null
          id?: string
          is_demo?: boolean
          maid_tasks?: Database["public"]["Enums"]["maid_task"][] | null
          notes?: string | null
          on_the_way_at?: string | null
          paid_confirmed_at?: string | null
          paid_confirmed_by_user?: boolean | null
          pay_enabled_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payout_amount?: number | null
          prealert_sent?: boolean
          price_inr?: number | null
          reach_confirmed_at?: string | null
          reach_confirmed_by?: string | null
          reach_status?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_type?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          user_marked_paid_at?: string | null
          user_payment_utr?: string | null
          worker_id?: string | null
          worker_name?: string | null
          worker_phone?: string | null
          worker_photo_url?: string | null
          worker_upi?: string | null
        }
        Relationships: [
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
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
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
      notification_logs: {
        Row: {
          booking_id: string | null
          created_at: string | null
          delivered_at: string | null
          fcm_message_id: string | null
          id: string
          notification_type: string
          opened_at: string | null
          response_action: string | null
          response_at: string | null
          sent_at: string | null
          worker_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          fcm_message_id?: string | null
          id?: string
          notification_type: string
          opened_at?: string | null
          response_action?: string | null
          response_at?: string | null
          sent_at?: string | null
          worker_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          fcm_message_id?: string | null
          id?: string
          notification_type?: string
          opened_at?: string | null
          response_action?: string | null
          response_at?: string | null
          sent_at?: string | null
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
          created_at: string
          firebase_uid: string | null
          flat_id: string | null
          flat_no: string
          full_name: string
          id: string
          is_admin: boolean
          is_blocked: boolean | null
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
          created_at?: string
          firebase_uid?: string | null
          flat_id?: string | null
          flat_no: string
          full_name: string
          id?: string
          is_admin?: boolean
          is_blocked?: boolean | null
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
          created_at?: string
          firebase_uid?: string | null
          flat_id?: string | null
          flat_no?: string
          full_name?: string
          id?: string
          is_admin?: boolean
          is_blocked?: boolean | null
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
        ]
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
      user_fcm_tokens: {
        Row: {
          created_at: string | null
          device_info: Json | null
          id: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_info?: Json | null
          id?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_info?: Json | null
          id?: string
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
      workers: {
        Row: {
          communities: string[] | null
          community: string | null
          cook_cuisine_tags: string[]
          created_at: string
          fcm_token: string | null
          full_name: string
          id: string
          in_geofence: boolean | null
          is_active: boolean
          is_available: boolean | null
          is_busy: boolean | null
          last_active_at: string | null
          last_lat: number | null
          last_lng: number | null
          last_seen_at: string | null
          location_enabled: boolean | null
          phone: string
          photo_url: string | null
          rating: number | null
          respect_availability: boolean | null
          selected_community_id: string | null
          service_types: string[]
          timezone: string | null
          total_earnings: number | null
          total_ratings: number | null
          updated_at: string
          upi_id: string | null
          upi_qr_payload: string | null
          upi_qr_uploaded_at: string | null
          upi_qr_url: string | null
          user_id: string | null
        }
        Insert: {
          communities?: string[] | null
          community?: string | null
          cook_cuisine_tags?: string[]
          created_at?: string
          fcm_token?: string | null
          full_name: string
          id?: string
          in_geofence?: boolean | null
          is_active?: boolean
          is_available?: boolean | null
          is_busy?: boolean | null
          last_active_at?: string | null
          last_lat?: number | null
          last_lng?: number | null
          last_seen_at?: string | null
          location_enabled?: boolean | null
          phone: string
          photo_url?: string | null
          rating?: number | null
          respect_availability?: boolean | null
          selected_community_id?: string | null
          service_types?: string[]
          timezone?: string | null
          total_earnings?: number | null
          total_ratings?: number | null
          updated_at?: string
          upi_id?: string | null
          upi_qr_payload?: string | null
          upi_qr_uploaded_at?: string | null
          upi_qr_url?: string | null
          user_id?: string | null
        }
        Update: {
          communities?: string[] | null
          community?: string | null
          cook_cuisine_tags?: string[]
          created_at?: string
          fcm_token?: string | null
          full_name?: string
          id?: string
          in_geofence?: boolean | null
          is_active?: boolean
          is_available?: boolean | null
          is_busy?: boolean | null
          last_active_at?: string | null
          last_lat?: number | null
          last_lng?: number | null
          last_seen_at?: string | null
          location_enabled?: boolean | null
          phone?: string
          photo_url?: string | null
          rating?: number | null
          respect_availability?: boolean | null
          selected_community_id?: string | null
          service_types?: string[]
          timezone?: string | null
          total_earnings?: number | null
          total_ratings?: number | null
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
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _get_int_setting: {
        Args: { default_val: number; k: string }
        Returns: number
      }
      _is_admin_message: { Args: { rec: unknown }; Returns: boolean }
      _sla_core_work: { Args: never; Returns: undefined }
      accept_booking: { Args: { p_booking_id: string }; Returns: Json }
      admin_approve_worker_registration: {
        Args: { p_photo_url?: string; p_request_id: string }
        Returns: undefined
      }
      admin_cancel_booking: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: undefined
      }
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
      admin_reject_worker_registration: {
        Args: { p_rejection_reason: string; p_request_id: string }
        Returns: undefined
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
              communities: string[] | null
              community: string | null
              cook_cuisine_tags: string[]
              created_at: string
              fcm_token: string | null
              full_name: string
              id: string
              in_geofence: boolean | null
              is_active: boolean
              is_available: boolean | null
              is_busy: boolean | null
              last_active_at: string | null
              last_lat: number | null
              last_lng: number | null
              last_seen_at: string | null
              location_enabled: boolean | null
              phone: string
              photo_url: string | null
              rating: number | null
              respect_availability: boolean | null
              selected_community_id: string | null
              service_types: string[]
              timezone: string | null
              total_earnings: number | null
              total_ratings: number | null
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
              communities: string[] | null
              community: string | null
              cook_cuisine_tags: string[]
              created_at: string
              fcm_token: string | null
              full_name: string
              id: string
              in_geofence: boolean | null
              is_active: boolean
              is_available: boolean | null
              is_busy: boolean | null
              last_active_at: string | null
              last_lat: number | null
              last_lng: number | null
              last_seen_at: string | null
              location_enabled: boolean | null
              phone: string
              photo_url: string | null
              rating: number | null
              respect_availability: boolean | null
              selected_community_id: string | null
              service_types: string[]
              timezone: string | null
              total_earnings: number | null
              total_ratings: number | null
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
      assign_booking_to_next_worker: {
        Args: { p_booking_id: string }
        Returns: {
          assignment_id: string
          assignment_order: number
          expires_at: string
          worker_fcm_token: string
          worker_id: string
          worker_name: string
          worker_phone: string
        }[]
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
              auto_complete_after_minutes: number | null
              auto_complete_at: string | null
              bathroom_count: number | null
              booking_type: string
              can_cancel_until: string | null
              cancel_reason: string | null
              cancel_source: string | null
              cancelled_at: string | null
              community: string
              completed_at: string | null
              confirmed_at: string | null
              cook_cuisine_pref: string | null
              cook_gender_pref: string | null
              created_at: string
              cust_name: string
              cust_phone: string
              family_count: number | null
              flat_no: string
              flat_size: string | null
              food_pref: string | null
              id: string
              is_demo: boolean
              maid_tasks: Database["public"]["Enums"]["maid_task"][] | null
              notes: string | null
              on_the_way_at: string | null
              paid_confirmed_at: string | null
              paid_confirmed_by_user: boolean | null
              pay_enabled_at: string | null
              payment_method: string | null
              payment_status: string | null
              payout_amount: number | null
              prealert_sent: boolean
              price_inr: number | null
              reach_confirmed_at: string | null
              reach_confirmed_by: string | null
              reach_status: string | null
              scheduled_date: string | null
              scheduled_time: string | null
              service_type: string
              started_at: string | null
              status: string
              updated_at: string
              user_id: string
              user_marked_paid_at: string | null
              user_payment_utr: string | null
              worker_id: string | null
              worker_name: string | null
              worker_phone: string | null
              worker_photo_url: string | null
              worker_upi: string | null
            }
            SetofOptions: {
              from: "*"
              to: "bookings"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      auto_complete_assigned: { Args: never; Returns: undefined }
      auto_handle_overdue_bookings: { Args: never; Returns: number }
      bath_total_price: {
        Args: { p_community?: string; p_count: number }
        Returns: number
      }
      bytea_to_text: { Args: { data: string }; Returns: string }
      check_expired_assignments: { Args: never; Returns: Json }
      cleanup_old_support_chats: { Args: never; Returns: undefined }
      cleanup_stale_worker_busy_flags: {
        Args: never
        Returns: {
          was_busy: boolean
          worker_id: string
          worker_name: string
        }[]
      }
      create_admin_email_user: { Args: never; Returns: undefined }
      delete_my_data: { Args: never; Returns: undefined }
      ensure_worker_profile: { Args: never; Returns: Json }
      escalate_overdue_bookings: { Args: never; Returns: undefined }
      export_my_data: { Args: never; Returns: Json }
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
      get_booking_participants: {
        Args: { p_booking_id: string }
        Returns: {
          user_id: string
          worker_id: string
        }[]
      }
      get_booking_status: { Args: { p_booking_id: string }; Returns: Json }
      get_legal_pdfs: {
        Args: never
        Returns: {
          privacy_url: string
          terms_url: string
        }[]
      }
      get_ops_setting: { Args: { p_key: string }; Returns: string }
      get_profile_id: { Args: never; Returns: string }
      get_setting: {
        Args: { p_default: string; p_key: string }
        Returns: string
      }
      get_setting_int: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      get_worker_contact: { Args: { p_booking_id: string }; Returns: Json }
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
      initiate_booking_assignment: {
        Args: {
          p_booking_id: string
          p_community: string
          p_service_type: string
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_worker_available_at_time: {
        Args: { p_timestamp: string; p_worker_id: string }
        Returns: boolean
      }
      maid_total_price: {
        Args: {
          p_community?: string
          p_flat: string
          p_tasks: Database["public"]["Enums"]["maid_task"][]
        }
        Returns: number
      }
      mark_support_messages_as_seen: {
        Args: { p_thread_id: string }
        Returns: undefined
      }
      norm_phone: { Args: { p: string }; Returns: string }
      notify_next_worker: { Args: { p_booking_id: string }; Returns: Json }
      pending_sla_minutes: { Args: never; Returns: number }
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
      schedule_assignment_timeout: {
        Args: { p_assignment_id: string; p_expires_at: string }
        Returns: undefined
      }
      seed_worker_availability: {
        Args: { p_worker_id: string }
        Returns: undefined
      }
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
          p_body?: string
          p_booking_id?: string
          p_data?: Json
          p_notification_type?: string
          p_title?: string
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simple_assign_to_next_worker: {
        Args: { p_booking_id: string }
        Returns: Json
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
      try_accept_booking: { Args: { p_booking_id: string }; Returns: Json }
      try_accept_pending: {
        Args: { p_booking_id: string }
        Returns: {
          accepted_at: string | null
          assigned_at: string | null
          auto_complete_after_minutes: number | null
          auto_complete_at: string | null
          bathroom_count: number | null
          booking_type: string
          can_cancel_until: string | null
          cancel_reason: string | null
          cancel_source: string | null
          cancelled_at: string | null
          community: string
          completed_at: string | null
          confirmed_at: string | null
          cook_cuisine_pref: string | null
          cook_gender_pref: string | null
          created_at: string
          cust_name: string
          cust_phone: string
          family_count: number | null
          flat_no: string
          flat_size: string | null
          food_pref: string | null
          id: string
          is_demo: boolean
          maid_tasks: Database["public"]["Enums"]["maid_task"][] | null
          notes: string | null
          on_the_way_at: string | null
          paid_confirmed_at: string | null
          paid_confirmed_by_user: boolean | null
          pay_enabled_at: string | null
          payment_method: string | null
          payment_status: string | null
          payout_amount: number | null
          prealert_sent: boolean
          price_inr: number | null
          reach_confirmed_at: string | null
          reach_confirmed_by: string | null
          reach_status: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          service_type: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
          user_marked_paid_at: string | null
          user_payment_utr: string | null
          worker_id: string | null
          worker_name: string | null
          worker_phone: string | null
          worker_photo_url: string | null
          worker_upi: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
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
      worker_respond_to_booking: {
        Args: {
          p_assignment_id: string
          p_response: string
          p_worker_id: string
        }
        Returns: Json
      }
      worker_set_booking_status: {
        Args: { booking_id_param: string; new_status_param: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "worker" | "customer"
      maid_task: "floor_cleaning" | "dish_washing"
      payment_status: "pending" | "paid" | "partial" | "overdue" | "cancelled"
      user_role: "admin" | "staff" | "landlord"
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
      app_role: ["admin", "worker", "customer"],
      maid_task: ["floor_cleaning", "dish_washing"],
      payment_status: ["pending", "paid", "partial", "overdue", "cancelled"],
      user_role: ["admin", "staff", "landlord"],
    },
  },
} as const
