import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://paywwbuqycovjopryele.supabase.co";
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, serviceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = new Date().toISOString();
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`🕐 check-scheduled-bookings: Starting at ${startTime}`);
    console.log("═══════════════════════════════════════════════════════════");

    // Find pending scheduled bookings not yet alerted
    const { data: bookings, error: fetchError } = await supabase
      .from('bookings')
      .select('id, scheduled_date, scheduled_time, service_type, community, cust_name, flat_no, price_inr')
      .eq('status', 'pending')
      .eq('prealert_sent', false)
      .not('scheduled_date', 'is', null)
      .not('scheduled_time', 'is', null);

    if (fetchError) {
      console.error('❌ Error fetching bookings:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch bookings', details: fetchError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!bookings || bookings.length === 0) {
      console.log('📭 No scheduled bookings pending pre-alert');
      return new Response(
        JSON.stringify({ message: 'No bookings to process', count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${bookings.length} scheduled bookings to check`);

    const now = new Date();
    let workerAlertCount = 0;
    let userReminderCount = 0;
    const results: Array<{ booking_id: string; status: string; detail?: string }> = [];

    for (const booking of bookings) {
      // Parse scheduled time in IST and convert to UTC
      const scheduledDateTimeStr = `${booking.scheduled_date}T${booking.scheduled_time}`;
      const [datePart, timePart] = scheduledDateTimeStr.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes, seconds] = timePart.split(':').map(Number);
      
      // IST = UTC + 5:30
      const istDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds || 0));
      const scheduledDateTime = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));
      const alertTime = new Date(scheduledDateTime.getTime() - 10 * 60 * 1000);
      
      const shouldAlert = now >= alertTime;
      const minutesUntilAlert = Math.round((alertTime.getTime() - now.getTime()) / 60000);

      if (!shouldAlert) {
        console.log(`⏳ Booking ${booking.id}: ${minutesUntilAlert}min until pre-alert (${booking.scheduled_time} IST)`);
        results.push({ booking_id: booking.id, status: "waiting", detail: `${minutesUntilAlert}min remaining` });
        continue;
      }

      console.log("───────────────────────────────────────────────────────");
      console.log(`🚨 TRIGGERING pre-alert for booking ${booking.id}`);
      console.log(`   Service: ${booking.service_type} | Community: ${booking.community}`);
      console.log(`   Scheduled: ${booking.scheduled_date} ${booking.scheduled_time} IST`);
      console.log(`   Customer: ${booking.cust_name} | Flat: ${booking.flat_no} | ₹${booking.price_inr}`);

      try {
        const { error: prealertError } = await supabase
          .from('bookings')
          .update({ prealert_sent: true })
          .eq('id', booking.id);

        if (prealertError) {
          console.error(`❌ Failed to set prealert_sent before dispatch for ${booking.id}:`, prealertError);
          results.push({ booking_id: booking.id, status: "error", detail: "prealert_update_failed" });
          continue;
        }

        const notifyResponse = await fetch(`${SUPABASE_URL}/functions/v1/booking-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ booking_id: booking.id }),
        });

        const responseText = await notifyResponse.text();

        if (!notifyResponse.ok) {
          console.error(`❌ booking-notifications returned ${notifyResponse.status} for ${booking.id}: ${responseText}`);
          results.push({ booking_id: booking.id, status: "error", detail: `HTTP ${notifyResponse.status}` });
          continue;
        }

        // Parse and log the result
        let notifyResult: any = {};
        try {
          notifyResult = JSON.parse(responseText);
        } catch { /* non-JSON response */ }

        const sent = notifyResult?.result?.sent ?? notifyResult?.sent ?? "?";
        const failed = notifyResult?.result?.failed ?? "?";
        const firebaseProject = notifyResult?.result?.firebase_project ?? "unknown";

        console.log(`✅ Notification sent for ${booking.id}: sent=${sent}, failed=${failed}, firebase_project=${firebaseProject}`);
        
        // Check for SENDER_ID_MISMATCH in results
        if (notifyResult?.result?.results) {
          const senderMismatchCount = notifyResult.result.results.filter(
            (r: any) => r.error_code === "SENDER_ID_MISMATCH"
          ).length;
          if (senderMismatchCount > 0) {
            console.error(`⚠️ SENDER_ID_MISMATCH detected for ${senderMismatchCount} workers — Firebase service account project does NOT match worker app!`);
          }
        }

        workerAlertCount++;
        results.push({ booking_id: booking.id, status: "sent", detail: `sent=${sent}, failed=${failed}` });
      } catch (notifyError) {
        console.error(`❌ Exception calling booking-notifications for ${booking.id}:`, notifyError);
        results.push({ booking_id: booking.id, status: "exception", detail: String(notifyError) });
        continue;
      }

      // prealert_sent is marked before dispatch so every worker-side path can
      // safely require it before showing scheduled offers.
    }

    const endTime = Date.now() - new Date(startTime).getTime();
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`✅ Completed in ${endTime}ms, worker_alerts=${workerAlertCount}, user_reminders=${userReminderCount}`);
    console.log("═══════════════════════════════════════════════════════════");

    return new Response(
      JSON.stringify({
        message: 'Scheduled bookings check complete',
        checked: bookings.length,
        alerts_sent: workerAlertCount,
        duration_ms: endTime,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in check-scheduled-bookings:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
