import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[cleanup-expired-deposits] Starting cleanup process...");

    const { data: expiredDeposits, error: selectError } = await supabase
      .from("transactions")
      .select("id, wallet_id, amount, description, created_at, expires_at")
      .eq("type", "deposit")
      .eq("provider", "stripe")
      .eq("status", "pending")
      .not("expires_at", "is", null)
      .lt("expires_at", new Date().toISOString());

    if (selectError) {
      console.error("[cleanup-expired-deposits] Error fetching expired deposits:", selectError);
      throw selectError;
    }

    const expiredCount = expiredDeposits?.length || 0;
    console.log(`[cleanup-expired-deposits] Found ${expiredCount} expired deposits`);

    if (expiredCount === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          expired_count: 0,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    for (const deposit of expiredDeposits) {
      console.log(
        `[cleanup-expired-deposits] Expiring deposit ${deposit.id}: $${deposit.amount}, created ${deposit.created_at}, expires ${deposit.expires_at}`
      );

      const newDescription = deposit.description
        ? `${deposit.description} (превышено время ожидания оплаты)`
        : "Stripe пополнение кошелька (превышено время ожидания оплаты)";

      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          status: "expired",
          provider_status: "expired",
          description: newDescription,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deposit.id);

      if (updateError) {
        console.error(`[cleanup-expired-deposits] Error updating deposit ${deposit.id}:`, updateError);
      }
    }

    console.log(`[cleanup-expired-deposits] Successfully expired ${expiredCount} deposits`);

    return new Response(
      JSON.stringify({
        success: true,
        expired_count: expiredCount,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[cleanup-expired-deposits] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
