// Supabase Edge Function: Hourly Bank of Tanzania / Commercial FX Rate Sync
// Deploy with: supabase functions deploy fx-sync

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const botUrl = Deno.env.get('BOT_FX_API_URL');
    let midRate = 2680;
    let source = 'Fallback Reference Rate';
    let isFallback = true;

    if (botUrl) {
      const resp = await fetch(botUrl);
      if (resp.ok) {
        const json = await resp.json();
        if (typeof json?.usdTzs === 'number' && json.usdTzs > 0) {
          midRate = json.usdTzs;
          source = 'Bank of Tanzania Live Feed';
          isFallback = false;
        }
      }
    }

    const spreadBps = 120;
    const effectiveRate = Number((midRate * (1 + spreadBps / 10000)).toFixed(4));

    await supabase.from('exchange_rates').update({ is_active: false }).eq('is_active', true);
    await supabase.from('exchange_rates').insert({
      base_currency: 'USD',
      quote_currency: 'TZS',
      mid_rate: midRate,
      spread_bps: spreadBps,
      effective_rate: effectiveRate,
      source,
      is_fallback: isFallback,
      is_active: true,
    });

    return new Response(JSON.stringify({ midRate, effectiveRate, source, isFallback }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
