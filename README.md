# Missões — HTML + CSS + JavaScript puro

Plataforma de comunidade gamificada (login, XP, níveis, missões diárias,
ranking) com um **painel de administrador** para criar/desativar usuários e
gerenciar a missão do dia. Tudo em **sem React, sem build, sem npm** para
rodar o app — só HTML, CSS e JavaScript (ES Modules), com Firebase carregado
direto do CDN. Feito **mobile-first**: layout, tamanhos de toque e tipografia
priorizam a tela de celular, com o desktop como um aprimoramento (nav
superior, larguras maiores).

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

⚠️ **Se você usar GitHub Pages** (ou qualquer domínio que não seja
`localhost` / `*.firebaseapp.com` / `*.web.app`), tem um passo extra
obrigatório: adicionar esse domínio em **Firebase Console → Authentication →
Settings → Authorized domains**. Sem isso, o login falha silenciosamente.

## Estrutura

```
entrar.html                tela de login
index.html                  dashboard "Hoje" (protegida)
ranking.html                 ranking (protegida)
perfil.html                  perfil (protegida)
admin.html                   painel administrativo (protegida, só p/ admins)
convite.html                 cadastro público de voluntário (sem login)
assets/avatar-default.svg    ícone padrão usado para todos os usuários
css/style.css                todo o visual (tokens de cor, tipografia, componentes)
js/firebase.js               inicialização do Firebase + truque de criar usuário sem deslogar o admin
js/xp.js                      cálculo de nível/XP
js/firestore.js               acesso a dados (perfil, missões, ranking, admin, convites)
js/auth-guard.js              protege páginas: redireciona se não logado ou se a conta foi desativada
js/nav.js                     monta a navegação (topo no desktop, embaixo no celular)
js/mission-card.js            gera o HTML de cada card de missão
js/pages/*.js                 lógica específica de cada tela
```

Não tem bundler, TypeScript nem framework — cada página HTML carrega seu
próprio script como módulo nativo do navegador, que importa só o que precisa
dos outros arquivos `.js`.

## Antes de usar

1. **Ative o Authentication por E-mail/Senha** no Firebase Console do projeto
   `appmissoespab` (Authentication → Sign-in method → Email/Password).
2. **Crie o Firestore** (modo produção) se ainda não existir.
3. **Publique as regras de segurança** de `firestore.rules` — copie e cole o
   conteúdo do arquivo direto no Console → Firestore Database → Rules →
   Publish (ou `firebase deploy --only firestore:rules` se usar o CLI).
4. **Crie o primeiro administrador (passo único, manual):**
   - Crie sua própria conta em Authentication → Add user.
   - Copie o UID gerado.
   - Em Firestore Database → Data, crie a coleção `admins` (se não existir) e
     dentro dela um documento cujo **ID seja exatamente esse UID** (o
     conteúdo do documento pode ficar vazio, ou um campo qualquer tipo
     `role: "admin"` — só a existência do documento importa).
   - Crie também o documento de perfil em `users/{uid}` com os campos `name`,
     `username`, `email`, `totalXp: 0`, `completedMissionsCount: 0`,
     `currentStreak: 0`, `daysCompleted: 0`, `lastCompletedDay: null`,
     `disabled: false`.
   - Esse é o **único** usuário que você precisa criar manualmente pelo
     Console — todos os outros, você cria direto pelo painel `/admin.html`
     depois de logar com essa conta.

Depois desse setup único, tudo mais é feito logado como admin, pela própria
interface.

## Painel administrativo (`admin.html`)

Diferente do resto do app, essa página **não reaproveita** a sessão normal de
quem já está logado — ela sempre mostra sua própria tela de login (e-mail +
senha), mesmo que a pessoa já esteja logada em outra conta no navegador.
Só libera o conteúdo depois de duas checagens em sequência:

1. A senha bate de verdade no Firebase Authentication (`signInWithEmailAndPassword`).
2. Essa conta especificamente está marcada como admin no Firestore
   (documento em `admins/{uid}` — ver setup abaixo).

Se qualquer uma das duas falhar, a pessoa nunca vê o conteúdo da página (nem
por um instante) — só o formulário de login. Quando o login funciona, aparece
um selo azul no topo "🛡️ Sessão de administrador — seu@email.com" pra deixar
claro que essa sessão tem privilégio, com um botão "Sair" ao lado.

**Conta admin sugerida:** `admin@pab.com.br`. Crie essa conta em
Authentication → Add user com a senha que você quiser (a senha nunca fica no
código-fonte — o Firebase é quem valida), e não esqueça de criar também o
documento em `admins/{uid dessa conta}` (mesmo passo do setup inicial,
repetido pra essa conta específica).

O painel tem três blocos:

- **Criar usuário** — nome, usuário, e-mail e senha; cria a conta de login
  (Firebase Authentication) *e* o documento de perfil no Firestore em um só
  clique. Por trás dos panos, isso usa uma segunda instância do Firebase só
  pra criar a conta, então o admin continua logado normalmente durante o
  processo (não é deslogado nem trocado de usuário).
- **Usuários** — lista todo mundo, com um botão Desativar/Reativar por
  pessoa. **Importante:** como o app roda inteiro no navegador (sem
  servidor), não é possível apagar de verdade o login de alguém no Firebase
  Authentication só pelo painel — isso exigiria Admin SDK/Cloud Functions.
  "Desativar" marca `disabled: true` no perfil da pessoa: na próxima vez
  (ou imediatamente, se ela estiver com o app aberto) que ela tentar acessar
  qualquer tela, o app barra e desloga ela na hora, e ela some do ranking. O
  login técnico dela continua existindo no Firebase até você mesmo apagar
  pelo Console (Authentication → Users → excluir), se quiser fazer isso
  também.
- **Missão do dia** — escolha uma data (padrão: hoje) e:
  - atribua uma missão já existente do catálogo (dropdown), ou
  - crie uma missão nova (título, descrição, XP, dificuldade) que já fica
    salva no catálogo e atribuída àquela data.
  Embaixo aparece a lista do que já está atribuído pra data escolhida, com
  botão de remover. **A missão do dia agora é global** — uma vez atribuída,
  vale pra todos os usuários que logarem naquela data (não é mais por
  pessoa).

## Missões do dia (visão do usuário)

Todo usuário vê, todo dia:

- **Missão permanente** — "Convide um amigo" (`convide-um-amigo`), fixa no
  código em `js/pages/dashboard.js` (constante `PERMANENT_MISSION`). Vale 200
  XP por padrão — mude o `xpReward` ali se quiser outro valor. Diferente das
  outras missões, ela **não** completa com um clique: o botão copia (ou abre
  o menu de compartilhar) um link único do tipo `convite.html?u=SEU_UID`. A
  missão só é marcada como concluída quando **a própria pessoa convidada**
  abre esse link e preenche o formulário de "Seja voluntário" com o nome dela
  (e WhatsApp, se quiser) — é ela quem digita os próprios dados, com
  consentimento próprio, não o usuário reportando dado de terceiro.
  - A cada voluntário cadastrado, o registro fica salvo na coleção
    `volunteers` do Firestore, vinculado ao `inviterUid` de quem convidou.
  - O usuário vê a lista de quem ele já indicou na tela **Perfil**
    ("Voluntários que você indicou").
- **Missões do dia adicionadas pelo admin** — vêm do painel `/admin.html`
  (ver acima). Se o admin não tiver adicionado nenhuma pra hoje, o usuário só
  vê a missão permanente — o app não quebra.

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

## Estrutura de dados (Firestore)

- `admins/{uid}` — existência do documento = a pessoa é admin. Sem campos
  obrigatórios. Só criável manualmente pelo Console (ver setup acima).
- `users/{uid}` — perfil (`name`, `username`, `email`, `disabled`), `totalXp`,
  `currentStreak`, `daysCompleted`, etc.
- `missions/{missionId}` — catálogo de missões (`title`, `description`,
  `xpReward`, `difficulty`, `imageUrl`), escrito só pelo admin.
- `dailyAssignments/{YYYY-MM-DD}` — as missões atribuídas pra uma data,
  **globais pra todos os usuários** (`missionIds: [...]`), escrito só pelo
  admin.
- `missionCompletions/{uid}_{missionId}_{YYYY-MM-DD}` — registro de
  conclusão; o id determinístico evita XP duplicado mesmo com cliques
  repetidos ou reconexões (a transação em `js/firestore.js` garante
  atomicidade).
- `volunteers/{autoId}` — voluntários cadastrados via `convite.html`, com
  `inviterUid` apontando pra quem convidou.

## Sobre as imagens

O campo `imageUrl` de cada missão já está pronto pra receber uma URL do
Pexels (ou de qualquer fonte) — a busca/seleção de imagem em si ainda não tem
UI no painel admin (as missões criadas por lá saem com `imageUrl: ""`), mas o
dado já existe no banco pra quando essa parte for construída.

## Sobre o ícone de perfil

Não há upload de foto por usuário — todo mundo usa o mesmo ícone padrão em
`assets/avatar-default.svg`. Quando você tiver o ícone definitivo, é só
substituir esse arquivo (mesmo nome e caminho) que ele aparece automaticamente
no dashboard, no ranking e no perfil. Pode ser `.svg`, `.png` ou `.jpg` — só
ajuste a extensão referenciada nos três lugares (`index.html`, `perfil.html`
e `js/pages/ranking.js`) se trocar o formato do arquivo.

## Sobre as contas

Não existe autocadastro nem edição de perfil/senha pelo usuário: a tela de
perfil só mostra dados e o botão "Sair". Toda conta é criada pelo admin, pelo
painel `/admin.html` — ele só faz login. Se esquecer a senha, o contato é
direto com o administrador (Console → Authentication → esse usuário → Reset
password).

## Responsividade

- Mobile é o layout padrão (regras "base" do CSS); breakpoints em
  `768px` mudam a navegação de barra inferior para barra superior e ajustam
  larguras/paddings.
- Inputs usam `font-size: 16px` para não disparar o zoom automático do
  Safari/iOS ao focar em um campo.
- Botões e itens de navegação têm altura mínima de toque de 44–48px.
- Um ajuste extra em `max-width: 380px` reduz paddings para telas bem
  estreitas (ex: iPhone SE).

## Script de seed (opcional, legado)

`scripts/seed-missions.mjs` continua funcionando (atualizado pro esquema
global de `dailyAssignments`), mas hoje o jeito normal de criar missões é
pelo painel `/admin.html`. O script só é útil se você quiser popular dados de
teste via terminal sem abrir o navegador.
