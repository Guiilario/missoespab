# Missões — plataforma de comunidade gamificada

App web mobile-first com login, XP, níveis, missões diárias e ranking, construído em
React + Vite + Tailwind + Firebase, seguindo a identidade visual azul `#0A33E1` /
branco / preto / verde.

## Rodando localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## Antes de usar

1. **Ative o Authentication por E-mail/Senha** no Firebase Console do projeto
   `appmissoespab` (Authentication → Sign-in method → Email/Password).
2. **Crie o Firestore** (modo produção) se ainda não existir.
3. **Publique as regras de segurança** em `firestore.rules`:
   ```bash
   firebase deploy --only firestore:rules
   ```
   (ou cole o conteúdo do arquivo direto no Console → Firestore → Regras).
4. **Popule missões de exemplo** para testar o fluxo "Hoje":
   ```bash
   node scripts/seed-missions.mjs SEU_UID_DE_TESTE
   ```
   O UID aparece em Authentication → Users depois que você criar uma conta pela
   tela de cadastro do app. As regras atuais bloqueiam escrita direta em
   `missions`/`dailyAssignments` pelo cliente — para rodar o script de seed,
   relaxe temporariamente essas regras ou use o Admin SDK/Console em produção.

## Estrutura de dados (Firestore)

- `users/{uid}` — perfil, `totalXp`, `currentStreak`, `daysCompleted`, etc.
- `missions/{missionId}` — catálogo de missões (`title`, `description`,
  `xpReward`, `difficulty`, `imageUrl`).
- `dailyAssignments/{uid}_{YYYY-MM-DD}` — as 3 missões do dia para cada usuário
  (`missionIds: [...]`). Pensado para ser gerado por um CMS/admin ou Cloud
  Function futuramente.
- `missionCompletions/{uid}_{missionId}_{YYYY-MM-DD}` — registro de conclusão;
  o id determinístico evita XP duplicado mesmo com cliques repetidos ou
  reconexões, e a transação em `src/lib/firestore.js` garante atomicidade.

## Sobre as imagens

As imagens de missões ficam a cargo da API do Pexels — o campo `imageUrl` em
cada missão já está preparado para receber uma URL de imagem (do Pexels ou de
qualquer outra fonte); a integração de busca/seleção de imagens no CMS não faz
parte desta etapa (área do usuário).

## Próximos passos sugeridos

- CMS/admin para gerenciar o catálogo de missões e gerar as atribuições
  diárias automaticamente (via Cloud Function agendada, por exemplo).
- Upload de imagem do usuário via Firebase Storage para missões que exigem
  comprovação visual.
- Cloud Functions para mover a lógica de XP/streak para o servidor, removendo
  de vez a necessidade de confiar no cliente para esses campos.
