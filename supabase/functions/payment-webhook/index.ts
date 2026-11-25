// Supabase Edge Function: Payment Webhook Verification & Escrow State Update
// Deploy with: supabase functions deploy payment-webhook

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const signature = req.headers.get('x-corelink-signature');
  const expectedSecret = Deno.env.get('WEBHOOK_SIGNING_SECRET');
  if (expectedSecret && signature !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), { status: 401 });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { paymentId, status, providerReference } = await req.json();

    const { error } = await supabase
      .from('payments')
      .update({ status, provider_reference: providerReference, updated_at: new Date().toISOString() })
      .eq('id', paymentId);

    if (error) throw error;

    return new Response(JSON.stringify({ acknowledged: true, paymentId, status }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
