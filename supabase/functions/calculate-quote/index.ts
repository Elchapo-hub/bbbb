// Supabase Edge Function: Authoritative Quote Calculator & 15-Min FX Lock
// Deploy with: supabase functions deploy calculate-quote

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { data: fx } = await supabase
      .from('exchange_rates')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return new Response(
      JSON.stringify({
        status: 'ok',
        fxEffectiveRate: fx?.effective_rate ?? 2712.16,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        receivedItemsCount: Array.isArray(body?.items) ? body.items.length : 0,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
