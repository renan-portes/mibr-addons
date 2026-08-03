# Real-Debrid runtime laboratory

Laboratório manual, autenticado e descartável para validar o transporte HTTPS e,
em uma fase separada, o resolver de candidatos. Nada aqui registra o provider no
bootstrap, habilita a feature flag ou publica portas.

A primeira tentativa no docker-server falhou ainda no build, antes da execução:
o `WORKDIR` pertencia a root e o usuário `node` não podia criar `node_modules`
durante `npm ci`. O diretório agora recebe ownership `node:node` antes da troca de
usuário. Nenhuma chamada à API ou tentativa de autenticação ocorreu; uma nova
validação runtime ainda estava pendente naquele ponto.

Na tentativa seguinte, o build passou, mas a execução terminou antes do HTTP:
o launcher POSIX, executado como root, havia criado o segredo como `root:root 0600`,
enquanto o container usa `1000:1000`. O arquivo montado não era legível. O script
agora aplica `umask 077`, ownership `1000:1000`, diretório `0700` e segredo `0400`,
validando tipo, tamanho, UID, GID e modos antes do Compose. A execução anterior
registrou HTTP 0, duração 0 e cleanup completo; nenhuma autenticação ou chamada
externa ocorreu. Uma nova validação runtime ainda estava pendente naquele ponto.

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

### Validação concluída

O modo `account` foi validado no docker-server com o commit
`e13652b6dedfd77b77cd02cfe22af492ad8869d2`: exatamente um `GET /user`, sem
retry, retornou HTTP 200 em 796 ms, `authenticated: SIM`, conta `premium`, campos
de expiração e premium presentes, categoria `SUCCESS` e código final 0. O token
permaneceu no `.env` local ignorado e no segredo efêmero read-only; nenhum dado
pessoal ou token foi emitido. O cleanup removeu container, rede e temporários.

## Modo candidate

É opcional, separado e nunca automático. Exige `REAL_DEBRID_TEST_MODE=candidate`,
`REAL_DEBRID_CANDIDATE_AUTHORIZED=true` e quatro variáveis temporárias com magnet,
hash, path e bytes de um arquivo público, próprio ou autorizado. Nenhuma entrada
real existe no repositório. O modo executa uma única cadeia do resolver, sem retry,
e relata somente status, nomes genéricos de etapas, duração, validade da URL final,
cleanup e categoria. Magnet, hash, filename, URL e payload não são impressos.

As etapas candidate são incluídas por allowlist somente depois de confirmadas;
retorno parcial ou erro não antecipa etapas futuras. Os códigos são: `0` sucesso,
`1` falha e `2` validação parcial. O modo `candidate` foi executado uma única vez
com uma obra aberta/autorizada. A autenticação e `addMagnet` concluíram, mas a
execução falhou antes de `file_selected`, com `INVALID_RESPONSE`, em 1366 ms e
código 1. `unrestrict` não foi chamado, não houve repetição e o cleanup terminou
sem resíduos. A causa específica permaneceu inconclusiva nessa execução; nenhum
valor do conteúdo ou da conta foi registrado. Não há teste no Stremio nem no
Nuvio ou validação de playback.

Entre `magnet_added` e `file_selected`, o relatório agora distingue falha HTTP ou
JSON do `GET info`, resposta estrutural inválida, status desconhecido/terminal,
lista ausente/inválida, ID inválido e correspondência autorizada ausente,
divergente em tamanho ou ambígua. Metadados adicionais são apenas flags e um
bucket de cardinalidade; nunca incluem valores. A entrada autorizada é comparada
por path completo e tamanho exatos depois de uma única normalização contratual na
fronteira: a API deve fornecer exatamente uma barra inicial, que o decoder remove
antes de aplicar a política interna defensiva. Não há fallback por basename.

A terceira execução única alcançou `file_selected` e terminou depois da seleção,
em aproximadamente 2899 ms, com `TIMEOUT`, código 1 e cleanup completo. A
configuração anterior era o default do resolver: até três snapshots `GET info`
por fase, sem delay intencional e deadline total de 20 s. Isso é compatível com
esgotamento rápido do polling, mas o diagnóstico anterior agregava polling,
deadline global e timeout do GET/delay.

Uma execução posterior confirmou `DOWNLOADING`, bucket `MANY`, limite de 10 GETs
atingido, deadline global não atingido, `POLLING_EXHAUSTED`, duração de 17766 ms,
código 1 e cleanup completo. Não houve falha estrutural nem URL final.

Para a próxima validação controlada, somente este laboratório usa até 20
snapshots por fase, 1500 ms entre GETs e deadline total de 45 s. Os defaults do
produto permanecem inalterados. O relatório diferencia `GLOBAL_TIMEOUT`,
`POLLING_EXHAUSTED`, `POLLING_DELAY_TIMEOUT`, `INFO_REQUEST_TIMEOUT`, `CANCELED` e
`TERMINAL_TORRENT_STATUS`, acrescentando apenas buckets e flags allowlisted. O
código final de polling esgotado permanece `1`; não há retry de POST, segunda
cadeia ou emissão de status bruto e dados do conteúdo.

Uma segunda execução única concluiu `GET info`, confirmou a presença de `files` e
terminou com `FILE_LIST_INVALID`, em 1349 ms e código 1, ainda antes de
`file_selected`. A causa provável, fortemente sustentada pelo contrato oficial,
era a barra inicial obrigatória rejeitada pelo decoder anterior. O cleanup foi
completo, sem repetição. A correção permanece pendente de validação runtime;
nenhum valor de conteúdo ou conta foi registrado e nenhum playback ocorreu.

## Isolamento

- imagem `node:24.4.1-bookworm-slim`, dependências por `npm ci --ignore-scripts`;
- usuário 1000:1000, root filesystem read-only e `/tmp` em tmpfs;
- `cap_drop: ALL`, `no-new-privileges`, sem privileged, socket ou host network;
- CPU, memória e PIDs limitados, rede bridge dedicada e nenhuma porta publicada;
- container `--rm`, sem volumes persistentes e cleanup obrigatório.

No POSIX, `INT`, `TERM` e `TSTP` possuem traps explícitos. ACL exclusiva no host
Windows não comprova que um bind mount seja legível pelo UID Linux 1000; por isso,
o launcher PowerShell falha de forma fechada e permanece pendente de validação
runtime específica, sem tornar o segredo world-readable. O cleanup continua
idempotente e best-effort: sua falha não substitui o código principal.
