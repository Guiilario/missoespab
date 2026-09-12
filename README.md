# Missões — HTML + CSS + JavaScript puro

Mesma plataforma de comunidade gamificada (login, XP, níveis, missões diárias,
ranking), agora **sem React, sem build, sem npm** para rodar o app. Só HTML,
CSS e JavaScript (ES Modules), com Firebase carregado direto do CDN. Feito
**mobile-first**: layout, tamanhos de toque e tipografia priorizam a tela de
celular, com o desktop como um aprimoramento (nav superior, larguras maiores).

## Como rodar

Como o app usa ES Modules (`<script type="module">`), o navegador exige que
os arquivos venham de um servidor HTTP — abrir o `index.html` direto pelo
`file://` não funciona (bloqueio de CORS dos módulos). Use qualquer servidor
estático simples, por exemplo:

```bash
# opção 1 — Python (já vem em quase todo sistema)
python3 -m http.server 8080

# opção 2 — Node, sem instalar nada globalmente
npx serve .
```

Depois abra `http://localhost:8080/entrar.html` (ou a porta que o comando
mostrar).

Para publicar de verdade, qualquer hospedagem de arquivo estático serve:
Firebase Hosting, Netlify, Vercel, GitHub Pages, etc. — é só subir a pasta
inteira.

## Estrutura

```
entrar.html          tela de login
cadastro.html         tela de cadastro
index.html            dashboard "Hoje" (protegida)
ranking.html           ranking (protegida)
perfil.html            perfil (protegida)
css/style.css          todo o visual (tokens de cor, tipografia, componentes)
js/firebase.js         inicialização do Firebase (config do projeto appmissoespab)
js/xp.js                cálculo de nível/XP
js/firestore.js         acesso a dados (perfil, missões, ranking, conclusão atômica)
js/auth-guard.js        protege páginas: redireciona pra entrar.html se não logado
js/nav.js               monta a navegação (topo no desktop, embaixo no celular)
js/mission-card.js       gera o HTML de cada card de missão
js/pages/*.js            lógica específica de cada tela
```

Não tem bundler, TypeScript nem framework — cada página HTML carrega seu
próprio script como módulo nativo do navegador, que importa só o que precisa
dos outros arquivos `.js`.

## Antes de usar

1. **Ative o Authentication por E-mail/Senha** no Firebase Console do projeto
   `appmissoespab` (Authentication → Sign-in method → Email/Password).
2. **Crie o Firestore** (modo produção) se ainda não existir.
3. **Publique as regras de segurança** de `firestore.rules`:
   ```bash
   firebase deploy --only firestore:rules
   ```
   (ou cole o conteúdo do arquivo direto no Console → Firestore → Regras).
4. **Crie missões de teste** para ver o fluxo "Hoje" funcionando. Duas formas:
   - Direto no Console do Firebase, criando os documentos manualmente conforme
     a estrutura de dados abaixo; ou
   - Rodando o script opcional `scripts/seed-missions.mjs` (esse sim precisa
     de Node + `npm install firebase`, mas é só uma ferramenta de apoio —
     não faz parte do app):
     ```bash
     npm install firebase
     node scripts/seed-missions.mjs SEU_UID_DE_TESTE
     ```
     O UID aparece em Authentication → Users depois de criar uma conta pela
     tela de cadastro. As regras atuais bloqueiam escrita direta em
     `missions`/`dailyAssignments` pelo cliente — relaxe temporariamente essas
     regras pra rodar o seed, ou use o Admin SDK/Console em produção.

## Estrutura de dados (Firestore)

- `users/{uid}` — perfil, `totalXp`, `currentStreak`, `daysCompleted`, etc.
- `missions/{missionId}` — catálogo de missões (`title`, `description`,
  `xpReward`, `difficulty`, `imageUrl`).
- `dailyAssignments/{uid}_{YYYY-MM-DD}` — as 3 missões do dia de cada usuário
  (`missionIds: [...]`).
- `missionCompletions/{uid}_{missionId}_{YYYY-MM-DD}` — registro de conclusão;
  o id determinístico evita XP duplicado mesmo com cliques repetidos ou
  reconexões (a transação em `js/firestore.js` garante atomicidade).

## Sobre as imagens

O campo `imageUrl` de cada missão já está pronto pra receber uma URL do
Pexels (ou de qualquer fonte) — a busca/seleção de imagem em si fica pro CMS,
fora do escopo desta área do usuário.

## Responsividade

- Mobile é o layout padrão (regras "base" do CSS); breakpoints em
  `768px` mudam a navegação de barra inferior para barra superior e ajustam
  larguras/paddings.
- Inputs usam `font-size: 16px` para não disparar o zoom automático do
  Safari/iOS ao focar em um campo.
- Botões e itens de navegação têm altura mínima de toque de 44–48px.
- Um ajuste extra em `max-width: 380px` reduz paddings para telas bem
  estreitas (ex: iPhone SE).
