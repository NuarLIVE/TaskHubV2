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

    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { amount, currency } = await req.json();

    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, balance, stripe_account_id, stripe_payouts_enabled")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile.stripe_account_id) {
      return new Response(
        JSON.stringify({ error: "Stripe account not connected. Please connect your Stripe account first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile.stripe_payouts_enabled) {
      return new Response(
        JSON.stringify({ error: "Payouts not enabled on your Stripe account. Please complete onboarding." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, balance, currency")
      .eq("user_id", user.id)
      .maybeSingle();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: "Wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (wallet.balance < amount) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const withdrawalCurrency = currency || wallet.currency || "usd";

    const { data: transaction, error: txInsertError } = await supabase
      .from("transactions")
      .insert({
        wallet_id: wallet.id,
        type: "withdrawal",
        amount: amount,
        status: "processing",
        description: `Вывод средств на Stripe аккаунт`,
        provider: "stripe_connect",
        provider_status: "processing",
      })
      .select()
      .single();

    if (txInsertError || !transaction) {
      console.error("Failed to create transaction:", txInsertError);
      throw new Error("Failed to create transaction");
    }

    console.log("Transaction created:", transaction.id);

    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: withdrawalCurrency.toLowerCase(),
        destination: profile.stripe_account_id,
        metadata: {
          user_id: user.id,
          wallet_id: wallet.id,
          transaction_id: transaction.id,
          type: "wallet_withdrawal",
        },
      });

      console.log("Stripe transfer created:", transfer.id);

      const { error: txUpdateError } = await supabase
        .from("transactions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          provider_payment_id: transfer.id,
          provider_status: transfer.status || "completed",
        })
        .eq("id", transaction.id);

      if (txUpdateError) {
        console.error("Failed to update transaction status:", txUpdateError);
      }

      const newWalletBalance = parseFloat(wallet.balance) - amount;
      const { error: walletUpdateError } = await supabase
        .from("wallets")
        .update({
          balance: newWalletBalance,
          total_withdrawn: supabase.rpc("increment_total_withdrawn", {
            wallet_id: wallet.id,
            amount: amount,
          }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", wallet.id);

      if (walletUpdateError) {
        console.error("Failed to update wallet:", walletUpdateError);
      }

      const newProfileBalance = parseFloat(profile.balance) - amount;
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({
          balance: newProfileBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (profileUpdateError) {
        console.error("Failed to update profile balance:", profileUpdateError);
      }

      console.log("Withdrawal completed successfully");

      return new Response(
        JSON.stringify({
          success: true,
          transaction_id: transaction.id,
          transfer_id: transfer.id,
          amount: amount,
          currency: withdrawalCurrency,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (stripeError: any) {
      console.error("Stripe transfer failed:", stripeError);

      const { error: txFailError } = await supabase
        .from("transactions")
        .update({
          status: "failed",
          provider_status: "error",
          description: `Вывод средств на Stripe аккаунт (ошибка: ${stripeError.message})`,
        })
        .eq("id", transaction.id);

      if (txFailError) {
        console.error("Failed to mark transaction as failed:", txFailError);
      }

      return new Response(
        JSON.stringify({
          error: "Transfer failed: " + stripeError.message,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (error) {
    console.error("Error creating withdrawal:", error);
    return new Response(
      JSON.stringify({
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