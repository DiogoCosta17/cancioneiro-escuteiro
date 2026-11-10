import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Limites de entrada
const MAX_PROMPT_CHARS = 20000;
const MAX_BASE64_CHARS = 14_000_000; // ~10 MB
const MAX_FETCH_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

class BodyTooLargeError extends Error {}

// Lê o corpo da resposta em stream e aborta se ultrapassar o limite de bytes
async function readBodyWithLimit(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

// IPv4 em notação decimal com pontos: devolve true se for privado/loopback/link-local/CGNAT/reservado
function isBlockedIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast e reservado
  );
}

// IPv6 literal (sem parênteses retos): só aceita endereços globais (2000::/3), exceto 2002::/16 (6to4)
function isBlockedIPv6(host: string): boolean {
  const first = host.split(":")[0].toLowerCase();
  if (!/^[0-9a-f]{1,4}$/.test(first)) return true; // "::", "::1", "::ffff:..." e afins
  const value = parseInt(first, 16);
  if (value < 0x2000 || value > 0x3fff) return true; // fora de 2000::/3 (inclui fc00::/7 e fe80::/10)
  if (value === 0x2002) return true;
  return false;
}

// Valida o URL: http/https, portas por defeito, sem localhost/.local/.internal nem IPs privados
function parseSafeUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.port !== "") return null; // o URL normaliza as portas por defeito (80/443) para ""
  if (url.username || url.password) return null;

  let host = url.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
    if (isBlockedIPv6(host)) return null;
    return url;
  }
  host = host.replace(/\.$/, "");
  if (
    host === "" ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return null;
  }
  if (isBlockedIPv4(host)) return null;
  // Nome só com dígitos e pontos que não é um IPv4 válido: rejeitar por prudência
  if (/^[\d.]+$/.test(host) && !/^(\d{1,3})(\.\d{1,3}){3}$/.test(host)) return null;
  return url;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Chave GEMINI_API_KEY não configurada no Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Sessão não fornecida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar se o utilizador autenticado é administrador
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

    const { data: adminData } = await supabaseClient
      .from("admins")
      .select("id")
      .or(`id.eq.${user.id},user_id.eq.${user.id}`)
      .maybeSingle();

    if (!adminData) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem utilizar a conversão de partituras." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, targetUrl, prompt, base64Data, mimeType, search } = body;
    // Pesquisa Google ("grounding"): o modelo procura na web antes de responder e devolve as fontes.
    // Usada para dados que têm de ser exatos (ex.: o versículo oficial do Aleluia de um dia). Só para texto.
    const useSearch = search === true && !base64Data;

    // Suporte a leitura direta de código-fonte HTML de páginas de cifras (sem bloqueio CORS)
    if (action === "fetch-url") {
      const parsedUrl = typeof targetUrl === "string" ? parseSafeUrl(targetUrl) : null;
      if (!parsedUrl) {
        return jsonError(400, "Endereço inválido ou não permitido.");
      }
      let pageRes: Response;
      try {
        // Redirecionamentos seguidos à mão (máx. 3), validando cada destino: um site público
        // não pode reencaminhar o pedido para um endereço interno.
        const signal = AbortSignal.timeout(10000);
        let currentUrl = parsedUrl;
        let redirects = 0;
        while (true) {
          pageRes = await fetch(currentUrl.toString(), {
            signal,
            redirect: "manual",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          });
          const location = pageRes.headers.get("location");
          if (pageRes.status < 300 || pageRes.status >= 400 || !location) break;
          await pageRes.body?.cancel();
          const nextUrl = parseSafeUrl(new URL(location, currentUrl).toString());
          if (!nextUrl || ++redirects > 3) {
            return jsonError(400, "A página redireciona para um endereço não permitido.");
          }
          currentUrl = nextUrl;
        }
      } catch (err) {
        console.error("fetch-url falhou:", err);
        return jsonError(400, "Não foi possível aceder à página (tempo esgotado ou endereço inacessível).");
      }
      if (!pageRes.ok) {
        return jsonError(400, `Erro ao aceder à página (${pageRes.status}).`);
      }
      const declaredLength = Number(pageRes.headers.get("content-length") || 0);
      if (declaredLength > MAX_FETCH_BYTES) {
        return jsonError(400, "A página é demasiado grande (máximo 2 MB).");
      }
      let html: string;
      try {
        html = await readBodyWithLimit(pageRes, MAX_FETCH_BYTES);
      } catch (err) {
        if (err instanceof BodyTooLargeError) {
          return jsonError(400, "A página é demasiado grande (máximo 2 MB).");
        }
        console.error("fetch-url: erro a ler o corpo:", err);
        return jsonError(400, "Não foi possível ler a página.");
      }
      return new Response(JSON.stringify({ html }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!prompt) {
      return jsonError(400, "Dados incompletos para a conversão.");
    }
    if (typeof prompt !== "string" || prompt.length > MAX_PROMPT_CHARS) {
      return jsonError(400, "O texto enviado à IA é inválido ou demasiado longo.");
    }
    if (base64Data !== undefined && base64Data !== null && base64Data !== "") {
      if (typeof base64Data !== "string" || base64Data.length > MAX_BASE64_CHARS) {
        return jsonError(400, "A imagem enviada é inválida ou demasiado grande (máximo cerca de 10 MB).");
      }
    }
    if (mimeType !== undefined && mimeType !== null && !ALLOWED_MIME_TYPES.includes(mimeType)) {
      return jsonError(400, "Tipo de ficheiro não suportado (usa JPEG, PNG, WebP, HEIC ou PDF).");
    }

    // Modelos disponíveis na conta (painel do Google AI Studio, nov/2026). Primeiro o Flash Lite, que tem a maior
    // quota gratuita (500 pedidos/dia contra 20 nos Flash); os Flash ficam como reserva. Cada modelo tem a sua
    // quota: se um esgotar (429), passa ao seguinte. O 2.0 foi desligado pela Google.
    const models = [
      "gemini-3.1-flash-lite-preview",
      "gemini-3.8-flash",
      "gemini-3.6-flash",
      "gemini-3-flash-preview",
      "gemini-flash-latest",
    ];

    // O que correu mal em cada modelo (para uma mensagem de erro útil)
    const failures: { model: string; status: number | null; message: string }[] = [];
    let generatedText = "";
    let sources: { title: string; uri: string }[] = [];

    for (const model of models) {
      try {
        const response = await fetch(
          // Chave enviada em header (e não na query string) para não aparecer em mensagens de erro devolvidas ao cliente
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    ...(base64Data
                      ? [{ inline_data: { mime_type: mimeType || "image/jpeg", data: base64Data } }]
                      : []),
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.0,
                maxOutputTokens: 8192,
                ...(model.includes("gemini-3") || model.includes("gemini-2.5") || model.includes("flash-latest")
                  ? { thinkingConfig: { thinkingBudget: 1024 } }
                  : {}),
              },
              ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          let message = errText;
          try {
            message = JSON.parse(errText)?.error?.message || errText;
          } catch {
            // Corpo não é JSON: fica o texto
          }
          failures.push({ model, status: response.status, message: String(message).slice(0, 160) });
          if (response.status === 403) {
            break;
          }
          continue;
        }

        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const candidate = parts
          .filter((p: any) => !p.thought)
          .map((p: any) => p.text || "")
          .join("");
        if (candidate && candidate.trim()) {
          generatedText = candidate;
          if (useSearch) {
            const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            sources = chunks
              .map((c: any) => c?.web)
              .filter((w: any) => w && typeof w.uri === "string")
              .map((w: any) => ({ title: String(w.title || w.uri).slice(0, 200), uri: w.uri }))
              .slice(0, 5);
          }
          break;
        }
      } catch (err: any) {
        failures.push({ model, status: null, message: String(err?.message || err).slice(0, 160) });
      }
    }

    if (!generatedText) {
      const allRateLimited = failures.length > 0 && failures.every((f) => f.status === 429);
      const details = failures.map((f) => `${f.model}: ${f.status ?? "sem resposta"} ${f.message}`).join(" | ");
      // Com pesquisa na web o limite pode ser só o da pesquisa (quota própria): mostrar o que a Google disse
      const firstLimit = failures.find((f) => f.status === 429)?.message || "";
      const error = allRateLimited
        ? `Atingiste o limite de pedidos à IA${useSearch ? " com pesquisa na web" : ""} (por minuto ou por dia, em todos os modelos). Tenta daqui a um minuto ou amanhã. Resposta da Google: ${firstLimit}`
        : `A IA não respondeu. ${details || "Sem detalhes."}`;
      return new Response(
        JSON.stringify({ error, failures }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ text: generatedText, ...(useSearch ? { grounded: true, sources } : {}) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // O erro real fica só nos logs do servidor; o cliente recebe uma mensagem genérica
    console.error("gemini-vision: erro interno:", err);
    return jsonError(500, "Erro interno do servidor.");
  }
});
