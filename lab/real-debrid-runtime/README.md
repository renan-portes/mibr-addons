# Real-Debrid runtime laboratory

Laboratório manual, autenticado e descartável para validar o transporte HTTPS e,
em uma fase separada, o resolver de candidatos. Nada aqui registra o provider no
bootstrap, habilita a feature flag ou publica portas.

## Preparação no servidor

1. Copie `.env.example` para `.env` e restrinja o arquivo ao usuário operador
   (`chmod 600 .env` em POSIX; ACL exclusiva ao operador no Windows).
2. Defina `REAL_DEBRID_AUTHORIZED=true` e insira o token manualmente. Nunca passe
   o token como argumento nem publique a saída do ambiente.
3. Mantenha `REAL_DEBRID_TEST_MODE=account` na primeira execução.
4. Execute `scripts/runtime-test.sh` ou `scripts/runtime-test.ps1`.

O `.env` é ignorado pelo Git. O script copia a credencial para um arquivo secreto
temporário 0600 fora do repositório e gera um override temporário contendo somente
seu pathname. O arquivo é montado read-only em
`/run/secrets/real_debrid_token`; o container recebe apenas
`REAL_DEBRID_TOKEN_FILE`, nunca o valor no environment. O Compose versionado não
conhece ou interpola o token, portanto seu `docker compose config` não revela o
valor. A credencial não entra na imagem, URL, argumentos ou relatório. O
repositório é montado read-only; temporários ficam em `tmpfs`. O script aplica um
timeout global de 60 segundos e sempre executa `docker compose down` por trap ou
`finally`, inclusive em falha e sinais.

## Modo account

É a primeira validação e realiza exatamente um `GET /user`, sem retry. Não toca
endpoints de torrent, magnet ou unrestrict. O JSON de saída contém apenas
`authenticated`, tipo de conta sanitizado, presença de expiração/premium, HTTP,
duração e categoria. Username, email, ID, avatar, pontos, token, headers e payload
bruto nunca são emitidos.

## Modo candidate

É opcional, separado e nunca automático. Exige `REAL_DEBRID_TEST_MODE=candidate`,
`REAL_DEBRID_CANDIDATE_AUTHORIZED=true` e quatro variáveis temporárias com magnet,
hash, path e bytes de um arquivo público, próprio ou autorizado. Nenhuma entrada
real existe no repositório. O modo executa uma única cadeia do resolver, sem retry,
e relata somente status, nomes genéricos de etapas, duração, validade da URL final,
cleanup e categoria. Magnet, hash, filename, URL e payload não são impressos.

As etapas candidate são incluídas por allowlist somente depois de confirmadas;
retorno parcial ou erro não antecipa etapas futuras. Os códigos são: `0` sucesso,
`1` falha e `2` validação parcial. Não foi executada nenhuma chamada real nesta
implementação. Não há teste no Stremio nem no Nuvio, playback público ou validação
de conteúdo comercial.

## Isolamento

- imagem `node:24.4.1-bookworm-slim`, dependências por `npm ci --ignore-scripts`;
- usuário 1000:1000, root filesystem read-only e `/tmp` em tmpfs;
- `cap_drop: ALL`, `no-new-privileges`, sem privileged, socket ou host network;
- CPU, memória e PIDs limitados, rede bridge dedicada e nenhuma porta publicada;
- container `--rm`, sem volumes persistentes e cleanup obrigatório.

No POSIX, `INT`, `TERM` e `TSTP` possuem traps explícitos. No Windows, o script
PowerShell trata `CancelKeyPress`, timeout e encerramento explícito da árvore com
`taskkill /T`; Windows/PowerShell não possuem equivalência direta para SIGTERM e
SIGTSTP. Em ambos, cleanup é idempotente e best-effort: sua falha não substitui o
código principal.
