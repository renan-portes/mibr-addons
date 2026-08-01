# Laboratório de contrato runtime do torrent-indexer

Variante manual e descartável para executar exatamente uma consulta controlada
e comparar o envelope JSON real com `TorrentIndexerParser`. Ela não substitui nem
modifica o laboratório isolado em `lab/torrent-indexer/`.

## Escopo fixado

- upstream: `felipemarinho97/torrent-indexer`;
- commit: `0ba84b16c63a4add68534d1abba7c21660a8e959`;
- indexer: `bludv`;
- termo autorizado: `Big Buck Bunny`, curta licenciado para redistribuição;
- limite fixo: 1 resultado; qualquer outro valor é rejeitado;
- timeout global fixo da consulta: 20 segundos; qualquer outro valor é rejeitado;
- resposta máxima fixa: 1 MiB; qualquer outro valor é rejeitado;
- tentativas: exatamente uma, sem retry.

Zero resultados é um resultado válido e deve ser registrado sem uma segunda
consulta. Não substitua o termo por obra comercial e não execute buscas em massa.

## Isolamento e egress

Redis e torrent-indexer não publicam portas no host. O serviço é acessado somente
com `docker compose exec`. A rede bridge `runtime-contract` permite egress
exclusivamente porque a consulta aprovada precisa alcançar o indexer; ela não é
`internal`, ao contrário do laboratório puramente isolado.

Redis e torrent-indexer mantêm filesystem read-only. Todos os serviços preservam
tmpfs, limites de CPU/memória/PIDs, `no-new-privileges` e todas as capabilities
removidas. Não há privileged, Docker socket, host network, volumes persistentes,
credenciais ou exposição pública. Somente o FlareSolverr usa `read_only: false`,
pela necessidade runtime confirmada abaixo.

O primeiro start do FlareSolverr no docker-server confirmou a falha
`Read-only file system: '/app/.local'`: o Chromium era encontrado e iniciado,
mas o processo encerrava com código `1` ao tentar gravar nesse diretório. A causa
era o `read_only: true`, inicialmente mantido. A primeira correção adicionou
somente `/app/.local` como tmpfs não persistente, privado (`mode=0700`) e com
`uid=1000,gid=1000`, correspondentes ao usuário `flaresolverr` criado pela imagem.
Não foram adicionados tmpfs para caches ou homes sem evidência de necessidade.

Essa montagem resolveu a primeira escrita. O start seguinte avançou até o
`undetected-chromedriver` tentar modificar `/app/chromedriver` in-place e falhar
com `Read-only file system`. Na imagem oficial `v3.3.21`, esse caminho é fixo e
não há variável ou configuração oficial para redirecioná-lo ou impedir o patch.
Por isso, o laboratório constrói uma derivação mínima de
`ghcr.io/flaresolverr/flaresolverr:v3.3.21`: o binário imutável é preservado como
`/app/chromedriver.original`, `/app/chromedriver` vira um symlink para
`/app/.local/chromedriver`, e um entrypoint não-root repõe uma cópia limpa no
tmpfs a cada inicialização antes de executar o `dumb-init` e comando Python
originais com `exec`. O tmpfs permite execução porque agora contém o binário; ele
continua privado, limitado, `nosuid`, `nodev` e desaparece com o container.

A matriz diagnóstica fechou a causa sem acessar indexers: `A` (imagem oficial,
sem hardening adicional) foi funcional; `B` (derivada, read-only,
`no-new-privileges`, sem `cap_drop`) falhou; `C-no-nnp` (derivada, read-only, sem
`no-new-privileges` e sem `cap_drop`) também falhou; e `D` (derivada,
`read_only: false`, usuário não-root e `no-new-privileges`) foi funcional. Isso
isola `read_only` como bloqueador e exclui `no-new-privileges`, o wrapper e a
cópia efêmera do ChromeDriver como causas. O Chromium da `v3.3.21` requer outras
escritas no root filesystem além dos tmpfs identificados. A exceção mínima é
`read_only: false` somente no FlareSolverr; usuário `1000:1000`, tmpfs,
`no-new-privileges`, `cap_drop: ALL` e os demais controles continuam ativos.

A execução runtime posterior confirmou os três serviços `healthy`, o teste do
browser e a API interna do FlareSolverr ativos, `FLARESOLVERR_URL=PRESENT`, DNS e
egress disponíveis e zero bindings. A única consulta retornou HTTP `500` em 117
ms com `{"error":"response is a challange"}`, seguida de cleanup sem repetição.
Logo, a infraestrutura deixou de ser o bloqueador e o diagnóstico anterior de
URL ausente era um falso positivo. Esse registro é histórico: a variável não é
consumida pelo upstream fixado.

No commit upstream fixado, a mensagem é criada em `requester/requester.go`, na
função `Requster.GetDocument`, quando a resposta final ainda é detectada como
challenge, está vazia ou não é HTML válido após o caminho do FlareSolverr.
`api/bludv.go::HandlerBluDVIndexer` recebe esse erro e responde HTTP `500`. O
fallback chama `requester/flaresolverr.go::FlareSolverr.Get`, que usa sessão e
faz `request.get` em `/v1`. A grafia `challange` é literal do torrent-indexer,
não do site nem do FlareSolverr. Também foi constatado que `main.go` lê
`FLARESOLVERR_ADDRESS`. O laboratório agora fornece exatamente
`FLARESOLVERR_ADDRESS=http://flaresolverr:8191`; o diagnóstico ambiental acompanha
essa variável, `FLARESOLVERR_POOL_SIZE`, `REDIS_HOST` e
`REQUEST_TIMEOUT_MILLISECONDS` apenas como presença.

O diagnóstico agora classifica esse payload como
`FLARESOLVERR_CHALLENGE_UNRESOLVED`. Antes da consulta única, os scripts registram
um marcador UTC e coletam separadamente os logs dos dois serviços com
`--since <marcador> --timestamps`. O relatório retém apenas eventos estruturados
de sessão, chamada interna e resolução de challenge, com resultado, status HTTP
e duração quando observáveis. No formato real da `v3.3.21`, `Response in <n> s`
é associado, dentro do mesmo serviço e da mesma janela, ao `Incoming request =>
POST /v1` pendente; segundos são convertidos para milissegundos inteiros. URLs,
query, cookies, HTML, headers e demais dados sensíveis nunca são reproduzidos.
Linhas antigas, sem timestamp ou com timestamp inválido são ignoradas.

Uma auditoria posterior do erro `context canceled` confirmou que o handler BluDV
repassa diretamente `r.Context()` ao GET e ao FlareSolverr; não há cancelador ou
deadline explícito nesse caminho. O erro é encapsulado por
`Requster.GetDocument` depois que `FlareSolverr.Get` recebe o contexto cancelado.
O método de fallback pode ser invocado sem que o POST alcance `/v1`, explicando
uma correlação vazia. O harness offline `contextCancellationProbe.ts` reproduz
esse comportamento com servidores locais e marcadores totalmente sanitizados.
O encerramento do lado de envio pelo cliente HTTP/1.0 `printf | nc` é a causa
provável a confirmar em runtime; nenhuma consulta adicional foi executada.

O runtime inclui FlareSolverr `v3.3.21` somente na rede Docker, sem host port. O
torrent-indexer recebe o endereço interno por `FLARESOLVERR_ADDRESS` e aguarda
seu healthcheck. Essa
dependência corrige a causa confirmada do challenge HTTP `500` do BluDV no
self-host; não altera o laboratório isolado anterior.

## Execução manual

O host requer somente Docker com o plugin Docker Compose. Node.js, npm, npx e
tsx não são instalados nem exigidos no host.

As ferramentas TypeScript rodam em `contract-tools`, uma imagem auxiliar baseada
em `node:24.4.1-bookworm-slim`. A imagem instala uma vez, em camada cacheável, as
dependências exatas de `package-lock.json`; não executa `npm install` a cada
comando. O serviço usa `docker compose run --rm`, não permanece ativo, não tem
rede nem portas, monta o repositório read-only e recebe como único mount gravável
o diretório temporário da execução.

1. Revise este documento e os scripts.
2. Copie `.env.example` para `.env`.
3. Altere somente `CONTRACT_TEST_AUTHORIZED=false` para `true`.
4. Execute um dos scripts uma única vez:

```sh
./lab/torrent-indexer-runtime/scripts/contract-test.sh
```

```powershell
./lab/torrent-indexer-runtime/scripts/contract-test.ps1
```

O script rejeita termo, indexer, limite, timeout e tamanho fora da política. Ele
confirma zero bindings, realiza uma única requisição HTTP dentro do container e
registra somente código, duração, tamanho e relatório sanitizado.

Códigos de saída:

- `0`: contrato validado com pelo menos um resultado;
- `1`: falha técnica, de configuração, timeout, HTTP, tamanho ou parsing;
- `2`: validação parcial porque a resposta válida teve zero resultados.

O código `2` encerra sem trocar termo/indexer e sem segunda consulta. Cleanup é
executado para os três códigos e também em `INT`, `TERM` e `TSTP`. No POSIX, a
consulta roda em um grupo de processos dedicado; ao completar 20 segundos, o
grupo local e o container do indexer são encerrados antes do cleanup. A mensagem
`consulta excedeu 20 segundos` identifica esse caso, que retorna `1`.

O JSON bruto e a resposta HTTP existem apenas em arquivos temporários. A
ferramenta TypeScript reutiliza `TorrentIndexerParser`, informa itens aceitos e
rejeitados, chaves, tipos e valores vazios, e apaga o JSON em `finally`. O cleanup
do script também remove todos os temporários, containers e rede em sucesso ou
falha.

O primeiro teste no docker-server encerrou antes da consulta com `npx: not
found`. Isso confirmou que a versão anterior dependia indevidamente de tooling no
host. Após essa correção, uma única execução real chegou à consulta, mas ficou
presa até ser suspensa manualmente. O código `148` veio de `SIGTSTP`, não do
indexer. O cleanup posterior removeu containers e rede, não houve repetição nem
payload persistido, mas o contrato real ainda não foi validado.

O serviço `contract-tools` fica em `compose.tools.yml`; assim o Compose principal
não depende de `CONTRACT_TEMP_DIR`. Recuperação manual segura, inclusive após a
perda do diretório temporário:

```sh
docker compose -f lab/torrent-indexer-runtime/compose.yml down --remove-orphans
```

Essa execução precisa ser repetida no docker-server após revisão do novo timeout.
Ela também deve validar o start do FlareSolverr com a exceção de filesystem já
isolada pela matriz; isso não autoriza uma consulta adicional.

## Dados que nunca devem aparecer

O relatório não inclui valores de títulos, `magnet_link`, `info_hash`, trackers,
arquivos, detalhes ou URLs. O script não segue campos da resposta, não abre
magnets, não consulta trackers manualmente e não baixa torrent ou vídeo.

Os logs do upstream são deliberadamente não exibidos durante a consulta para
evitar que metadata ou partes do payload sejam reveladas no terminal.

Não publique `.env`, payloads temporários ou saídas brutas. Não redirecione a
resposta para arquivos dentro do repositório.
