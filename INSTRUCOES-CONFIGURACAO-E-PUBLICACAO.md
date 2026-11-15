# Instruções de Configuração, Publicação e Backend — Técnico de Refrigeração em Santa Luzia MG

## 1. Visão Geral da Estrutura
- `index.html`: Página inicial completa com 10 seções e interligação para todo o site.
- `BAIRROS E REGIÕES/`: 20 páginas individuais para bairros e regiões de Santa Luzia – MG.
- `SERVIÇOS/`: 8 páginas de serviços técnicos de refrigeração.
- `EQUIPAMENTOS/`: 7 páginas específicas de equipamentos residenciais e comerciais.
- `INSTITUCIONAL/`: Sobre, Contato, Política de Privacidade, Política de Cookies e Termos de Uso.
- `ADMINISTRAÇÃO/admin-leads.htm`: Painel administrativo privado (`noindex, nofollow`).
- `ARQUIVOS SEO/`: `sitemap.xml`, `robots.txt` e `favicon.ico`.
- `assets/`: `css/style.css`, `js/script.js` e `imagens/*.webp`.

---

## 2. Configuração do Domínio Canônico e Sitemap
Antes de publicar em seu domínio definitivo, substitua `https://tecnicoderefrigeracaosantaluziamg.com.br` pela URL final do seu site em:
1. Tags `<link rel="canonical">`, `og:url`, `og:image` e JSON-LD nos arquivos `.html`.
2. `ARQUIVOS SEO/sitemap.xml`.
3. `ARQUIVOS SEO/robots.txt`.

Caso utilize subpasta no GitHub Pages (ex.: `https://usuario.github.io/repositorio/`), utilize essa URL base completa como prefixo no sitemap e nas tags canônicas.

---

## 3. Publicação no GitHub Pages (Conteúdo Estático)
1. Crie um repositório no GitHub e envie **o conteúdo interno** da pasta `tecnico-de-refrigeracao-santa-luzia-mg/` para a raiz do repositório (de modo que `index.html` fique na raiz da branch `main`).
2. Acesse **Settings → Pages** no repositório do GitHub.
3. Em **Build and deployment**, selecione **Deploy from a branch**, escolha a branch `main` e a pasta `/ (root)`.
4. Aguarde a publicação e confirme se `sitemap.xml` e `robots.txt` também estão acessíveis caso mova uma cópia para a raiz, ou referencie `/ARQUIVOS%20SEO/sitemap.xml` no Google Search Console.

> **Importante sobre GitHub Pages + Formulários / Painel Administrativo:**
> O GitHub Pages hospeda apenas arquivos estáticos (HTML, CSS e JS) e não executa código Node.js nem armazena leads em servidor privado. Sem um backend conectado, a senha administrativa e o salvamento de orçamentos não devem ser simulados no navegador por segurança.

---

## 4. Conectando o Backend Real (Formulários, Rastreamento e Painel Administrativo)

### Opção A — Servidor Node.js / Express incluído no projeto (`server.ts`)
Este projeto acompanha um servidor Express pronto com:
- `POST /api/leads`: validação anti-spam (honeypot + campos obrigatórios) e gravação privada fora da pasta pública (`private-data/leads.json`).
- `POST /api/track`: registro de cliques nos botões do WhatsApp (`whatsapp_click`), início de formulário (`form_start`) e envio concluído (`form_submit`) por página.
- `POST /api/admin/login` e `POST /api/admin/logout`: autenticação server-side com cookie `HttpOnly`.
- `GET /api/admin/dashboard`, `DELETE /api/admin/leads/:id` e `GET /api/admin/export.csv`: painel protegido, filtros, exclusão e exportação CSV.

#### Variáveis de ambiente recomendadas em produção:
- `ADMIN_PASSWORD`: defina uma senha forte no servidor (no ambiente inicial, se não configurada, é validada via hash no backend).
- `SESSION_SECRET`: segredo aleatório longo para assinatura da sessão administrativa.
- `ALLOWED_ORIGIN`: origem do seu site no GitHub Pages caso publique o frontend separado do servidor Node (ex.: `https://seuusuario.github.io`).

### Opção B — Frontend no GitHub Pages + Backend Express em nuvem (Cloud Run, Render, Railway, VPS)
1. Publique o backend Express no provedor de sua preferência (com CORS habilitado para o domínio do GitHub Pages).
2. Nas páginas HTML (ou em um pequeno snippet antes de `assets/js/script.js` e em `ADMINISTRAÇÃO/admin-leads.htm`), defina:
   ```html
   <meta name="api-base" content="https://api.seudominio.com.br" />
   ```
   ou via JavaScript:
   ```html
   <script>window.REFRIGERACAO_API_BASE = "https://api.seudominio.com.br";</script>
   ```
3. Dessa forma, os formulários do site estático e o painel `admin-leads.htm` passam a gravar e consultar leads diretamente no servidor seguro.

---

## 5. Verificação Pós-Publicação
- Teste o envio de um orçamento real no formulário e confirme o registro em `/ADMINISTRAÇÃO/admin-leads.htm`.
- Confirme que os cliques nos botões de WhatsApp abrem `https://wa.me/553136417297` com a mensagem contextual da página.
- Valide no Google Search Console o envio de `ARQUIVOS SEO/sitemap.xml` e confirme que `/ADMINISTRAÇÃO/admin-leads.htm` está bloqueado no `robots.txt` e com `noindex, nofollow`.
