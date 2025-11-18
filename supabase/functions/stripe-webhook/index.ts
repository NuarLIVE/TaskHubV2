import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!stripeSecretKey || !webhookSecret) {
      throw new Error("Stripe keys are not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      throw new Error("Missing stripe-signature header");
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(
        JSON.stringify({ error: "Webhook signature verification failed" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      const { user_id, wallet_id, transaction_id } = session.metadata || {};

      if (!user_id || !wallet_id || !transaction_id) {
        console.error("Missing metadata in checkout session");
        return new Response(
          JSON.stringify({ error: "Missing metadata" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: transaction, error: txError } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transaction_id)
        .maybeSingle();

      if (txError || !transaction) {
        console.error("Transaction not found:", txError);
        return new Response(
          JSON.stringify({ error: "Transaction not found" }),
          { status: 404, headers: corsHeaders }
        );
      }

      if (transaction.status !== "pending") {
        console.log("Transaction already processed:", transaction.id);
        return new Response(
          JSON.stringify({ received: true, message: "Already processed" }),
          { status: 200, headers: corsHeaders }
        );
      }

      const amount = transaction.amount;

      await supabase
        .from("transactions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          provider_status: session.payment_status,
        })
        .eq("id", transaction_id);

      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance, total_earned")
        .eq("id", wallet_id)
        .single();

      if (wallet) {
        await supabase
          .from("wallets")
          .update({
            balance: wallet.balance + amount,
            total_earned: wallet.total_earned + amount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", wallet_id);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user_id)
        .single();

      if (profile) {
        await supabase
          .from("profiles")
          .update({
            balance: profile.balance + amount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user_id);
      }

      console.log(`Successfully processed deposit for user ${user_id}: $${amount}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
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