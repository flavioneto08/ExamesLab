---
description: Roda build, commita arquivos modificados e dá push para origin para disparar deploy
allowed-tools: Bash(npm run build), Bash(git status), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git rev-parse:*)
---

Execute o deploy do projeto seguindo estes passos em ordem. Se qualquer passo falhar, pare e reporte o erro — não tente contornar com flags como `--no-verify` ou `--force`.

## Passo 1 — Inspecionar estado

Rode em paralelo:
- `git status` — ver arquivos modificados/staged/untracked
- `git diff` — ver mudanças não-staged
- `git diff --staged` — ver mudanças já staged
- `git log -5 --oneline` — pegar o estilo de commit recente
- `git rev-parse --abbrev-ref HEAD` — confirmar branch atual

Se não houver mudanças (working tree clean e nada staged), avise que não há nada para deployar e pare.

## Passo 2 — Validar build

Rode `npm run build`. Se falhar, **pare aqui** — não commite código quebrado. Reporte o erro para eu corrigir antes.

## Passo 3 — Stage seletivo

Faça `git add` **apenas nos arquivos relacionados à mudança atual** (não use `git add -A` ou `git add .` — pode pegar coisas indesejadas como `pdfs/`, `dist/`, arquivos de teste temporários).

Se houver arquivos novos relevantes ao trabalho (ex.: novos componentes, novos utils), inclua. Se houver arquivos suspeitos (`.env`, credenciais, builds, dumps), **não commite e pergunte primeiro**.

## Passo 4 — Commit

Crie um commit com mensagem que reflita o **porquê** da mudança, seguindo o estilo dos commits recentes (geralmente `feat:`, `fix:`, ou `chore:` seguido de descrição em português, sem emoji).

Use HEREDOC para a mensagem:

```bash
git commit -m "$(cat <<'EOF'
feat: descrição curta da mudança

Detalhes opcionais sobre o porquê.
EOF
)"
```

**Não** adicione co-authored-by linhas nem assinaturas extras — não é o estilo deste projeto (veja o git log).

## Passo 5 — Push

Faça `git push` para a branch remota correspondente. Se a branch atual for `main`, isso dispara o deploy automático.

**Nunca** use `--force` ou `--force-with-lease` para main. Se o push for rejeitado por estar atrás do remoto, **pare e me avise** — não tente resolver sozinho.

## Passo 6 — Reportar

Em uma frase: confirme o hash do commit, o branch, e que o push foi feito. Ex.: `Deploy: abc1234 → origin/main ✓`.
