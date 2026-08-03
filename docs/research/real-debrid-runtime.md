# Real-Debrid runtime laboratory research

Esta milestone prepara um laboratório autenticado manual, mas não executa a API.
O token será inserido somente no docker-server em `.env` ignorado e protegido. O
script o copia para arquivo 0600 em diretório temporário externo e monta esse
arquivo read-only por override temporário que contém somente o pathname. O
Compose versionado e seu `docker compose config` não conhecem o valor; o container
recebe apenas `REAL_DEBRID_TOKEN_FILE`, nunca o token no environment. Não há
credencial, payload real ou configuração operacional versionada.

A primeira tentativa runtime falhou no build, antes de iniciar o container: o
diretório de trabalho criado como root não permitia que o usuário `node` criasse
`node_modules` no `npm ci`. O build agora transfere o ownership do diretório antes
de trocar de usuário. Nenhuma chamada à API ou autenticação foi tentada, e a nova
execução runtime continua pendente.

Depois da correção do build, a execução ainda terminou antes do transporte. A
causa confirmada foi o segredo de origem `root:root 0600` montado em um container
`1000:1000`, portanto ilegível pelo processo não-root. O resultado sanitizado foi
HTTP 0, duração 0 e cleanup completo; nenhuma autenticação ou chamada externa
ocorreu. O launcher POSIX agora prepara e valida diretório `1000:1000 0700` e
arquivo regular não vazio `1000:1000 0400` antes do Compose. Uma nova execução
permanece pendente.

A primeira fase, `account`, limita-se a uma chamada idempotente `GET /user` e
produz relatório por allowlist, sem dados pessoais. A segunda, `candidate`, é
separada, exige autorização adicional e entrada temporária de conteúdo público,
próprio ou autorizado, e executa no máximo uma cadeia sem retry. Ela não é chamada
automaticamente pela primeira fase.

O laboratório usa imagem Node fixada, repositório read-only, tmpfs, usuário sem
root, capabilities removidas, `no-new-privileges`, limites de recursos, rede
dedicada sem portas e cleanup com timeout. Token, Authorization, URLs, magnet,
hash, filename, links, dados de conta e payload bruto não fazem parte dos
relatórios.

No POSIX existem traps para INT, TERM e TSTP. No Windows, uma ACL exclusiva do
operador não garante ownership ou leitura pelo UID Linux 1000 no bind mount. O
launcher PowerShell permanece bloqueado, pendente de validação runtime específica;
não se presume paridade nem se amplia a leitura do segredo para group/others.

O provider continua fora do bootstrap e a feature flag permanece `false`. Ainda
não há teste no Stremio nem no Nuvio, playback público, credencial operacional,
validação runtime executada ou acesso a conteúdo comercial. O modo account deve
passar antes do candidate, que permanece manual, separado e restrito a conteúdo
próprio, público ou autorizado. A execução real deve ocorrer
separadamente e somente no servidor autorizado.
