import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// Só aceita redirectTo absoluto em https (ou http://localhost em desenvolvimento); caso contrário ignora
function sanitizeRedirectTo(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
    if (url.protocol === "http:" && url.hostname === "localhost") return url.toString();
  } catch {
    // URL inválido: ignorar
  }
  return undefined;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Sessão não fornecida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller session using anon key client
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Utilizador não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller is super_admin
    const { data: adminData } = await supabaseClient
      .from("admins")
      .select("role")
      .or(`id.eq.${user.id},user_id.eq.${user.id}`)
      .maybeSingle();

    if (adminData?.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Apenas Super Administradores podem enviar convites." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse input
    const { email, name, role, redirectTo } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanRole = role ?? "editor";
    if (cleanRole !== "editor" && cleanRole !== "super_admin") {
      return new Response(JSON.stringify({ error: "Função inválida." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = typeof name === "string" && name.trim() ? name.trim() : cleanEmail.split("@")[0];

    // Admin client with service_role key to trigger the real invite email
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: inviteResult, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      cleanEmail,
      {
        data: { name: cleanName },
        redirectTo: sanitizeRedirectTo(redirectTo),
      }
    );

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = inviteResult.user.id;

    // Check if admin record exists by id/user_id, or by email (case-insensitive).
    // O email é escapado para o ILIKE: "_" e "%" são wildcards e fariam corresponder outro admin
    // (ex: "joao_silva@x.pt" corresponderia a "joao.silva@x.pt").
    const { data: byId } = await supabaseAdmin
      .from("admins")
      .select("id")
      .or(`id.eq.${newUserId},user_id.eq.${newUserId}`)
      .limit(1)
      .maybeSingle();

    let existingAdmin = byId;
    if (!existingAdmin) {
      const escapedEmail = cleanEmail.replace(/[\\%_]/g, (c: string) => `\\${c}`);
      const { data: byEmail } = await supabaseAdmin
        .from("admins")
        .select("id")
        .ilike("email", escapedEmail)
        .limit(1)
        .maybeSingle();
      existingAdmin = byEmail;
    }

    const { error: adminError } = existingAdmin
      ? await supabaseAdmin
          .from("admins")
          .update({
            user_id: newUserId,
            name: cleanName,
            role: cleanRole,
          })
          .eq("id", existingAdmin.id)
      : await supabaseAdmin.from("admins").insert({
          id: newUserId,
          user_id: newUserId,
          email: cleanEmail,
          name: cleanName,
          role: cleanRole,
          invited_by: user.id,
        });

    if (adminError) {
      return new Response(
        JSON.stringify({ error: `Convite enviado, mas falhou o registo do administrador: ${adminError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, userId: inviteResult.user?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // O erro real fica só nos logs do servidor; o cliente recebe uma mensagem genérica
    console.error("invite-admin: erro interno:", err);
    return new Response(JSON.stringify({ error: "Erro interno do servidor." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
