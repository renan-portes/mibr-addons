# Real-Debrid runtime laboratory research

Esta milestone prepara um laboratório autenticado manual, mas não executa a API.
O token será inserido somente no docker-server em `.env` ignorado e protegido. O
script o copia para arquivo 0600 em diretório temporário externo e monta esse
arquivo read-only por override temporário que contém somente o pathname. O
Compose versionado e seu `docker compose config` não conhecem o valor; o container
recebe apenas `REAL_DEBRID_TOKEN_FILE`, nunca o token no environment. Não há
credencial, payload real ou configuração operacional versionada.

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

No POSIX existem traps para INT, TERM e TSTP. O PowerShell trata CancelKeyPress,
timeout e encerramento explícito da árvore local, mas Windows não oferece
equivalência direta para SIGTERM ou SIGTSTP; não se presume paridade.

O provider continua fora do bootstrap e a feature flag permanece `false`. Ainda
não há teste no Stremio nem no Nuvio, playback público, credencial operacional,
validação runtime executada ou acesso a conteúdo comercial. O modo account deve
passar antes do candidate, que permanece manual, separado e restrito a conteúdo
próprio, público ou autorizado. A execução real deve ocorrer
separadamente e somente no servidor autorizado.
