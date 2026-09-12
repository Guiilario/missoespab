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
index.html            dashboard "Hoje" (protegida)
ranking.html           ranking (protegida)
perfil.html            perfil (protegida)
assets/avatar-default.svg  ícone padrão usado para todos os usuários (substitua por este mesmo caminho quando tiver o ícone final)
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

## Missões do dia

Todo usuário vê, todo dia:

- **Missão permanente** — "Convide um amigo" (`convide-um-amigo`), fixa no código
  em `js/pages/dashboard.js` (constante `PERMANENT_MISSION`). Vale 200 XP por
  padrão — mude o `xpReward` ali se quiser outro valor. Diferente das outras
  missões, ela **não** completa com um clique: o botão copia (ou abre o menu
  de compartilhar) um link único do tipo `convite.html?u=SEU_UID`. A missão só
  é marcada como concluída quando **a própria pessoa convidada** abre esse
  link e preenche o formulário de "Seja voluntário" com o nome dela (e
  WhatsApp, se quiser) — é ela quem digita os próprios dados, com consentimento
  próprio, não o usuário reportando dado de terceiro.
  - A cada voluntário cadastrado, o registro fica salvo na coleção
    `volunteers` do Firestore, vinculado ao `inviterUid` de quem convidou.
  - O usuário vê a lista de quem ele já indicou na tela **Perfil** ("Voluntários
    que você indicou").
- **Missões extras do dia** — vêm do Firestore (`dailyAssignments` +
  `missions`), pensadas pra serem geradas por um CMS de administrador que
  ainda vamos construir. Enquanto o CMS não existe, você pode popular esses
  documentos manualmente pelo Console do Firebase ou com o script
  `scripts/seed-missions.mjs`. Se não houver nenhuma, o usuário só vê a
  missão permanente.

A contagem "X de Y concluídas" e a barra de progresso do dia já somam a
missão permanente + o que o admin adicionar.

### Sobre a página `convite.html`

É a única página do app que não exige login — qualquer pessoa com o link
consegue abri-la e se cadastrar como voluntária. Isso é proposital (é assim
que a pessoa convidada dá o próprio consentimento), mas também significa que
é um formulário público sujeito a spam/abuso, já que não há autenticação
bloqueando o envio. As regras do Firestore (`firestore.rules`) limitam o que
pode ser escrito (só `name`, `whatsapp`, `inviterUid`, `date`, `createdAt`,
com tamanho máximo), mas não impedem alguém de enviar várias vezes. Se isso
virar problema na prática, dá pra adicionar Firebase App Check ou um captcha
nessa página depois.

## Antes de usar

1. **Ative o Authentication por E-mail/Senha** no Firebase Console do projeto
   `appmissoespab` (Authentication → Sign-in method → Email/Password).
2. **Crie o Firestore** (modo produção) se ainda não existir.
3. **Publique as regras de segurança** de `firestore.rules`:
   ```bash
   firebase deploy --only firestore:rules
   ```
   (ou cole o conteúdo do arquivo direto no Console → Firestore → Regras).
4. **Crie as contas dos usuários manualmente** — não existe mais tela de
   cadastro no app; toda conta é criada pelo administrador:
   - No Console do Firebase → Authentication → Add user, crie o e-mail/senha.
   - Copie o UID gerado e crie o documento correspondente em
     `users/{uid}` no Firestore com os campos `name`, `username`, `email`,
     `totalXp: 0`, `completedMissionsCount: 0`, `currentStreak: 0`,
     `daysCompleted: 0`, `lastCompletedDay: null` (veja
     `createUserProfile` em `js/firestore.js` para o formato exato).
   - Passe e-mail e senha para o usuário; ele só usa a tela `entrar.html`
     (login). Não existe tela de "esqueci minha senha" — se um usuário
     esquecer a senha, ele fala direto com você (o administrador) pra
     redefinir (pelo Console do Firebase → Authentication → esse usuário →
     Reset password, ou apagando/recriando a senha).
5. **Crie missões de teste** para ver o fluxo "Hoje" funcionando. Duas formas:
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

## Sobre o ícone de perfil

Não há upload de foto por usuário — todo mundo usa o mesmo ícone padrão em
`assets/avatar-default.svg`. Quando você tiver o ícone definitivo, é só
substituir esse arquivo (mesmo nome e caminho) que ele aparece automaticamente
no dashboard, no ranking e no perfil. Pode ser `.svg`, `.png` ou `.jpg` — só
ajuste a extensão referenciada nos três lugares (`index.html`, `perfil.html`
e `js/pages/ranking.js`) se trocar o formato do arquivo.

## Sobre as contas

Não existe autocadastro nem edição de perfil/senha pelo usuário: a tela de
perfil só mostra dados e o botão "Sair". Toda conta é criada pelo
administrador (ver passo 4 acima) e entregue pronta ao usuário — ele só faz
login. Se esquecer a senha, o contato é direto com o administrador.

## Responsividade

- Mobile é o layout padrão (regras "base" do CSS); breakpoints em
  `768px` mudam a navegação de barra inferior para barra superior e ajustam
  larguras/paddings.
- Inputs usam `font-size: 16px` para não disparar o zoom automático do
  Safari/iOS ao focar em um campo.
- Botões e itens de navegação têm altura mínima de toque de 44–48px.
- Um ajuste extra em `max-width: 380px` reduz paddings para telas bem
  estreitas (ex: iPhone SE).
