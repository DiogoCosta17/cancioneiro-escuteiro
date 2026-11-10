# ⚜️ Cancioneiro Escuteiro — Agrupamento 488 (Mafra)

[![CI](https://github.com/DiogoCosta17/cancioneiro-escuteiro/actions/workflows/ci.yml/badge.svg)](https://github.com/DiogoCosta17/cancioneiro-escuteiro/actions/workflows/ci.yml)

Cancioneiro online do Agrupamento 488: cânticos com acordes, missas e eventos, funciona sem rede e instala-se como app.

> **EN:** An offline-first songbook web app for a Portuguese scout group — songs with chords and transposition, Mass planning by liturgical season, printable song sheets and an admin area. Built with React, TypeScript and Supabase, with over 1,000 automated tests.

**Produção:** [cancioneiro488.vercel.app](https://cancioneiro488.vercel.app)

---

## 🚀 Funcionalidades

- **Cânticos:** pesquisa por título, artista, letra e etiquetas; temáticas por secção; favoritos e recentes.
- **Para quem toca:** transposição, capo com sugestão, notação Dó-Ré-Mi ou C-D-E, diagramas para guitarra, ukulele e cavaquinho, metrónomo, auto-scroll, afinador e Modo Palco (pedais Bluetooth e swipe).
- **Missas:** página da Eucaristia com o tempo litúrgico e uma proposta de cânticos para cada momento da missa; Liturgia Diária; eventos com leitores e cânticos; impressão/PDF.
- **Offline:** PWA instalável; os eventos podem ser guardados para usar sem rede (acampamentos).
- **Partilha:** listas e cânticos por QR code.
- **Área de dirigentes:** editor de cânticos, conversor de fotos/links com IA, eventos, sugestões, histórico de alterações, backup e restauro.

## 🧱 Tecnologias

| Camada | O que usa |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, Tailwind CSS |
| Backend | Supabase: PostgreSQL com Row Level Security, Auth por convite, Edge Functions |
| Offline | PWA com service worker (Workbox), IndexedDB e `localStorage` |
| IA | Google Gemini, chamado só através de uma Edge Function (a chave nunca chega ao browser) |
| Testes | Vitest e Testing Library: 43 ficheiros, mais de 1 000 testes |
| Deploy | Vercel, com CI no GitHub Actions |

---

## 🛠️ Desenvolvimento

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # verificação de tipos + build de produção
npm test             # testes (corre depois do build: alguns verificam o dist/sw.js)
```

Para correr a app, cria um `.env` a partir do `.env.example` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Os testes não precisam do `.env`: o Supabase é sempre simulado.

**Nunca** coloques outras chaves em variáveis `VITE_` (ficam públicas no site); a chave do Gemini é um secret das Edge Functions do Supabase.

## 🗄️ Base de dados

Supabase (PostgreSQL + Auth + Edge Functions). O esquema completo e sempre atualizado está em [`supabase/schema.sql`](./supabase/schema.sql). As alterações são aplicadas à mão no SQL Editor do Supabase.

### Montar a tua própria instância

1. **Projeto Supabase:** cria um projeto e corre o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql) no SQL Editor.
2. **Autenticação** (Authentication → Sign In / Providers e URL Configuration):
   - desativa os registos públicos (*Allow new users to sign up* desligado) e mantém *Confirm email* ligado: os dirigentes só entram por convite;
   - adiciona o URL do site e `<site>/set-password` aos *Redirect URLs*.
3. **Edge Functions:** com a [Supabase CLI](https://supabase.com/docs/guides/cli), faz `supabase functions deploy invite-admin` e `supabase functions deploy gemini-vision`, e define a chave do Gemini com `supabase secrets set GEMINI_API_KEY=...`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente pelo Supabase.
4. **Primeiro super admin:** cria o utilizador em Authentication → Users (*Add user* ou *Invite user*) e, no SQL Editor, regista-o como dirigente:

   ```sql
   insert into public.admins (user_id, email, name, role)
   values ('<uuid do utilizador>', '<email>', '<nome>', 'super_admin');
   ```

   A partir daí, os restantes dirigentes são convidados pela própria app (área de dirigentes).
5. **Frontend:** cria o `.env` a partir do `.env.example` (`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`) e corre `npm run dev`.

**Alterações à base de dados:** altera o `supabase/schema.sql` (que tem de continuar a criar a BD de raiz) e corre só a parte alterada no SQL Editor da BD existente.

**Privacidade:** a importação de cânticos "a partir de link" na área de dirigentes pode enviar o URL colado a serviços públicos de leitura/proxy (`r.jina.ai`, `api.allorigins.win` e `api.codetabs.com`). Não coles links privados ou com informação sensível.

## 📦 Deploy

O Vercel publica automaticamente cada push para `main`. O GitHub Actions corre o lint, a verificação de tipos, o build e os testes em cada push e pull request.

## 📄 Licença

O código está sob a [licença MIT](./LICENSE).

O logótipo, a fotografia de grupo e os restantes elementos de identidade do Agrupamento 488 (Mafra) em `public/` **não** estão abrangidos pela licença: pertencem ao Agrupamento e não podem ser reutilizados sem autorização. As letras e cifras dos cânticos ficam na base de dados e não fazem parte deste repositório.
