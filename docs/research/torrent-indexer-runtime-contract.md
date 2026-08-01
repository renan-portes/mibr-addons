# Validação runtime do contrato torrent-indexer

## Objetivo

Comparar uma única resposta JSON real do torrent-indexer self-hosted com o
`TorrentIndexerParser` existente, observando apenas HTTP, envelope, chaves, tipos,
valores opcionais/vazios, tempo, tamanho e aceitação pelo parser.

A revisão planejada é
`0ba84b16c63a4add68534d1abba7c21660a8e959`, a mesma validada no laboratório
self-host isolado.

## Consulta planejada

- indexer: `bludv`, somente um indexer;
- termo: `Big Buck Bunny`, obra aberta escolhida para evitar pesquisa deliberada
  por conteúdo comercial;
- endpoint: `GET /indexers/bludv` via loopback dentro do container;
- query: `q`, `filter_results=true` e `limit=1`;
- limite fixo: um resultado; outros valores são rejeitados;
- timeout global fixo: 20 segundos, incluindo o `docker compose exec`; outros
  valores são rejeitados;
- resposta máxima fixa: 1 MiB, com leitura de 1 MiB + 1 byte para detectar
  excesso; outros valores são rejeitados;
- repetição automática: nenhuma.

A consulta real não faz parte do `npm test` e não deve ser executada no Codex.
Ela exige cópia local de `.env.example` e confirmação explícita. Se retornar
zero resultados ou falhar, o operador registra o ocorrido e encerra; não troca o
termo, não tenta outro indexer e não repete aleatoriamente.

## Container de ferramentas

O docker-server requer somente Docker Compose; Node.js, npm, npx e tsx não são
requisitos do host. O primeiro runtime falhou antes de qualquer consulta com
`npx: not found`, revelando a dependência indevida.

Validação e análise agora executam pontualmente com `docker compose run --rm`
no serviço `contract-tools`, definido no override `compose.tools.yml`. Sua imagem
usa `node:24.4.1-bookworm-slim` e uma
camada cacheável criada por `npm ci --ignore-scripts` a partir do lockfile. O
container não possui rede ou portas, roda com filesystem read-only, tmpfs,
`no-new-privileges`, capabilities removidas e limites de recursos. O repositório
é montado read-only; somente o diretório temporário dedicado é gravável.

A tag Node está fixada por versão, não em `latest`. O digest da imagem-base ainda
não foi fixado e deve ser reavaliado caso o laboratório deixe de ser descartável.

## Política de sanitização

O payload bruto existe apenas em arquivo temporário fora do repositório. A
ferramenta manual informa somente:

- `count` e `indexed_count`, quando inteiros válidos;
- quantidade de elementos em `results`;
- nomes das chaves da raiz e dos resultados;
- tipos observados por chave;
- quantidade de valores nulos, strings vazias e arrays vazios;
- quantidade de itens aceitos e rejeitados por `TorrentIndexerParser`;
- nomes dos campos sensíveis omitidos.

Valores de `title`, `original_title`, `details`, `magnet_link`, `info_hash`,
`trackers`, `files` e URLs nunca entram no relatório. O arquivo JSON é removido
pela ferramenta em `finally`; o script remove novamente todos os temporários no
cleanup defensivo. Nenhum payload real deve ser versionado.

## Campos comparados

O relatório permite verificar a presença e o tipo de `results`, `count`,
`indexed_count`, `title`, `original_title`, `details`, `year`, `imdb`, `audio`,
`magnet_link`, `info_hash`, `trackers`, `size`, `files`, `seed_count` e
`leech_count`, sem mostrar seus valores sensíveis.

## Critérios

Sucesso completo exige:

- build e containers healthy;
- zero portas publicadas;
- exatamente uma requisição dentro do container;
- resposta HTTP `200`, dentro de 20 segundos e 1 MiB;
- JSON válido com envelope observável;
- relatório sanitizado produzido pelo parser real;
- temporários, containers e rede removidos.

Resposta `200` com zero resultados valida envelope e erro nulo, mas deixa a
compatibilidade de itens **parcial**. Timeout, HTTP diferente de `200`, JSON
inválido, resposta acima do limite, configuração divergente ou risco de exposição
interrompem o teste sem retry.

Convenção de saída:

- `0`: contrato validado com pelo menos um resultado;
- `1`: falha técnica ou de política;
- `2`: `PARTIAL_ZERO_RESULTS`, resposta válida com zero resultados.

O status parcial é exibido como “validação parcial: zero resultados” e encerra
imediatamente sem alterar termo/indexer ou repetir a consulta. Cleanup ocorre nos
três casos.

## Limites e riscos

- A rede dedicada permite egress durante o runtime controlado.
- O indexer upstream pode mudar seletores ou contrato sem versionamento.
- A requisição pode falhar ou retornar zero itens para a obra aberta.
- O upstream pode registrar metadados internamente; seus logs são deliberadamente
  não exibidos durante a consulta para evitar vazamento de payload.
- O teste não abre magnets, segue URLs da resposta, consulta trackers manualmente,
  baixa arquivos ou cria `StreamResult`.
- O provider continua fora do bootstrap; não há Real-Debrid ou playback.

## Cleanup

Subshell POSIX e `finally` PowerShell removem os arquivos temporários e executam
`docker compose down --remove-orphans` em sucesso, falha ou interrupção. A imagem
de build pode permanecer no cache Docker; nenhum volume nomeado é criado.

O primeiro runtime após remover a dependência de `npx` fez exatamente uma
consulta, que ficou presa e foi suspensa manualmente. O código final `148` foi
causado por `SIGTSTP`, não por uma resposta do indexer. O cleanup posterior foi
bem-sucedido: não restaram containers, rede, ferramentas ou payload, e nenhuma
segunda consulta ocorreu. Portanto, a consulta real continua **não validada**.

O timeout corrigido executa o cliente Compose em um grupo de processos dedicado.
Após 20 segundos ele envia `TERM`, escala para `KILL`, encerra explicitamente o
container do indexer e retorna `1` com `consulta excedeu 20 segundos`. `INT`,
`TERM` e `TSTP` também encerram imediatamente esse grupo e acionam uma única vez
o cleanup idempotente.

Como `contract-tools` foi separado do Compose principal, o comando abaixo não
interpola nem exige `CONTRACT_TEMP_DIR` e pode ser usado para recuperação manual:

```sh
docker compose -f lab/torrent-indexer-runtime/compose.yml down --remove-orphans
```

Uma execução real posterior chegou corretamente à consulta única. Ela terminou
em 110 ms com HTTP `400` e resposta de 103 bytes porque o script usava a request
codificada como format string de `printf`: `%20` foi interpretado localmente como
formatação. O timeout não foi acionado, o cleanup funcionou, nenhuma consulta foi
repetida e nenhum payload foi persistido. A construção foi corrigida para usar
uma format string constante, mantendo a URL somente como argumento. O contrato
real continua **não validado** até uma nova execução controlada após revisão.

## Diagnóstico sanitizado de HTTP 500

As sondagens públicas controladas, sem retry ou persistência de payload, tiveram:

- `bludv`: HTTP `200`, JSON válido, `OK_ZERO_RESULTS`, aproximadamente 4,1 s;
- `torrent-dos-filmes`: HTTP `200`, JSON válido, `OK_ZERO_RESULTS`, aproximadamente 2,1 s;
- `comando_torrents`: HTTP `500`, JSON válido, `HTTP_ERROR`, aproximadamente 302 ms.

Isso comprova operação pública do contrato para `bludv` e
`torrent-dos-filmes`. Como o `bludv` público respondeu `200`, o `500` observado
no self-host é provavelmente ambiental ou de configuração, não evidência de uma
quebra global do indexer.

O diagnóstico self-host posterior registrou HTTP `500`, payload JSON com erro de
challenge, categoria `FLARESOLVERR`, `FLARESOLVERR_URL` ausente, DNS/egress
disponíveis e Redis funcional. Esse uso de `FLARESOLVERR_URL` foi parte histórica
da investigação e depois se confirmou incompatível com o upstream fixado. O
laboratório runtime inclui `ghcr.io/flaresolverr/flaresolverr:v3.3.21` na mesma
rede, sem porta publicada, e o torrent-indexer aguarda o healthcheck desse
serviço antes de iniciar.

O start seguinte no docker-server isolou uma falha anterior à consulta: o
FlareSolverr encontrou e iniciou o Chromium, mas encerrou com código `1` ao tentar
gravar em `/app/.local`, recebendo `Read-only file system`. A causa confirmada é
o filesystem `read_only`. O hardening foi preservado e a correção mínima monta
somente `/app/.local` como tmpfs não persistente, com `mode=0700` e
`uid=1000,gid=1000` para o usuário real `flaresolverr` da imagem. Não houve
evidência técnica para adicionar `/app/.cache` ou caminhos sob
`/home/flaresolverr`. O healthcheck continua usando `python3`, presente na imagem
base Python 3.11. Uma nova validação de start no docker-server ainda está
pendente; nenhuma nova consulta foi executada nesta alteração.

A validação seguinte confirmou que `/app/.local` resolveu a primeira escrita,
mas revelou outra em `/app/chromedriver`. O `undetected-chromedriver` incluído na
imagem abre esse executável em modo de leitura e escrita para aplicar seu patch
in-place. A versão `v3.3.21` fixa esse caminho no código e não expõe variável ou
configuração oficial para redirecioná-lo ou desabilitar a alteração. Como tmpfs
não pode substituir diretamente um arquivo, foi escolhida uma imagem derivada
mínima, ainda baseada exatamente em
`ghcr.io/flaresolverr/flaresolverr:v3.3.21`, sem alterar código upstream nem
pré-aplicar o patch. No build, o driver original passa a
`/app/chromedriver.original` e o caminho esperado vira symlink para
`/app/.local/chromedriver`. Em cada start, um entrypoint executado como
`flaresolverr` (`1000:1000`) confirma o tmpfs gravável, copia o original com modo
`0755` e usa `exec` para preservar a sequência oficial
`/usr/bin/dumb-init -- /usr/local/bin/python -u /app/flaresolverr.py`. Como o
driver agora é executado no tmpfs, somente `noexec` foi retirado desse mount;
`nosuid`, `nodev`, limite e ownership permanecem.

A matriz runtime posterior isolou a restrição restante sem consultar indexers:

- `A`, imagem oficial sem hardening adicional: `FUNCTIONAL`;
- `B`, derivada com `read_only` e `no-new-privileges`, sem `cap_drop`: falha;
- `C-no-nnp`, derivada com `read_only`, sem `no-new-privileges` e sem
  `cap_drop`: falha;
- `D`, derivada com `read_only: false`, usuário não-root e
  `no-new-privileges`: `FUNCTIONAL`.

O contraste entre `B`, `C-no-nnp` e `D` confirma que `read_only` é o bloqueador;
`no-new-privileges` não é a causa, e o wrapper com ChromeDriver efêmero funciona.
Na `v3.3.21`, o Chromium precisa realizar escritas adicionais no root filesystem
que não foram cobertas pelos tmpfs estritamente identificados. A exceção mínima
define `read_only: false` somente no FlareSolverr. Redis e torrent-indexer seguem
read-only, enquanto o FlareSolverr preserva usuário `1000:1000`, tmpfs,
`no-new-privileges`, `cap_drop: ALL`, limites, rede interna e zero portas
publicadas. Nenhuma consulta real foi executada para chegar a essa conclusão.

## Origem do challenge não resolvido

A execução controlada seguinte confirmou FlareSolverr, Redis e torrent-indexer
`healthy`, browser test e API interna do FlareSolverr funcionais,
`FLARESOLVERR_URL=PRESENT`, DNS/egress disponíveis e zero host bindings. A
consulta única ao `bludv` retornou HTTP `500` em 117 ms com o payload sanitizado
`{"error":"response is a challange"}`; houve cleanup completo e nenhuma
repetição. Portanto, a infraestrutura não é mais o bloqueador, e a mensagem
anterior de URL ausente foi um falso positivo do classificador.

No torrent-indexer `0ba84b16c63a4add68534d1abba7c21660a8e959`, o fluxo é:

1. `main.go` registra `/indexers/bludv` em
   `api/bludv.go::HandlerBluDVIndexer`.
2. O handler monta a busca e chama `requester.GetDocument`.
3. `requester/requester.go::Requster.GetDocument` tenta o cliente HTTP direto;
   ao detectar challenge, chama `requester/flaresolverr.go::FlareSolverr.Get`.
4. `FlareSolverr.Get` obtém uma sessão e envia `request.get` para `/v1`. Um HTTP
   `500` interno pode acionar as tentativas recursivas implementadas pelo próprio
   upstream. A resposta `ok` fornece HTML ou, quando vazio com cookies, provoca
   uma requisição complementar usando esses cookies.
5. De volta a `GetDocument`, se o corpo final ainda casa com o regex de
   challenge, está vazio ou não é HTML válido, a função cria literalmente
   `response is a challange`.
6. `HandlerBluDVIndexer` serializa esse erro e devolve HTTP `500`.

Assim, a string vem do torrent-indexer, não diretamente do site, scraper ou
FlareSolverr. Ela prova que o caminho de obtenção não produziu um documento
aceitável, mas isoladamente não prova se uma chamada válida ao FlareSolverr
ocorreu. O código fixado ainda revela uma diferença importante: `main.go` passa
`FLARESOLVERR_ADDRESS` a `NewFlareSolverr`, enquanto o Compose e o diagnóstico
anteriores observam `FLARESOLVERR_URL`. Isso permanece como hipótese de
configuração naquele ponto da investigação. A correção posterior substituiu a
variável no Compose por `FLARESOLVERR_ADDRESS=http://flaresolverr:8191`, sem
alterar o restante do fluxo.

A categoria passou a `FLARESOLVERR_CHALLENGE_UNRESOLVED`. Ela se apoia no erro
literal e não afirma variável ausente. Imediatamente antes da única consulta, os
scripts persistem um marcador UTC; depois coletam, separadamente, logs do
torrent-indexer e FlareSolverr com timestamps e `--since` esse marcador. O
processador rejeita também qualquer linha anterior ou sem timestamp e produz
somente eventos estruturados de sessão, HTTP interno e challenge, incluindo
sucesso/falha, status e duração quando observáveis. O par de linhas real da
`v3.3.21`, `Incoming request => POST /v1` e `Response in <n> s`, é correlacionado
por serviço e por ordem dentro da janela; a duração em segundos é convertida
para milissegundos inteiros. Linhas antigas, sem timestamp ou com timestamp
inválido são rejeitadas. Texto bruto, URL externa, termo, query, cookies, HTML,
headers, títulos, magnets, hashes e trackers são omitidos e os temporários
continuam apagados no cleanup.

Em HTTP diferente de `200`, o laboratório agora produz somente diagnóstico
sanitizado. O corpo é classificado como JSON ou texto, apenas as chaves raiz
`error`, `message`, `status`, `code` e `type` podem aparecer, e a mensagem é
mascarada e limitada a 200 caracteres. Conteúdo inseguro vira
`upstream returned an opaque error payload.`

Somente logs `error`/`fatal` da janela atual são considerados e classificados
como `FLARESOLVERR_CHALLENGE_UNRESOLVED`, `FLARESOLVERR`, `DNS_NETWORK`,
`EXTERNAL_HTTP`, `TIMEOUT`, `PARSER_SCRAPER`, `REDIS`, `CONFIGURATION` ou
`UNKNOWN`. Variáveis operacionais relevantes são registradas apenas como
`PRESENT`/`ABSENT`: `FLARESOLVERR_ADDRESS`, `FLARESOLVERR_POOL_SIZE`, `REDIS_HOST`
e `REQUEST_TIMEOUT_MILLISECONDS`. Sua presença é metadado e não determina a
categoria; `FLARESOLVERR_URL` permanece apenas no histórico da investigação.
DNS e egress são
checados sem nova busca: resolução do host público e `wget --spider` somente na
raiz `https://torrent-indexer.darklyn.org/`. Nenhuma página de resultados é
acessada, a consulta `bludv` continua única e todos os temporários são apagados.

`logErrors` nunca reutiliza a linha original: prefixo do container, JSON,
timestamp, IP, path, user-agent e query são descartados. Cada entrada contém
somente categoria e uma mensagem curta normalizada.

## Auditoria do `context canceled`

O runtime com `FLARESOLVERR_ADDRESS` correto encerrou a consulta única em cerca
de 116 ms com `failed to do request for url [redacted-url] context canceled` e
sem evento correlacionado no FlareSolverr. A revisão integral do commit
`0ba84b16c63a4add68534d1abba7c21660a8e959` encontrou esta cadeia:

1. `api/bludv.go::HandlerBluDVIndexer` obtém `ctx := r.Context()` e o entrega a
   `Requster.GetDocument`. O handler não cria filho, deadline ou cancelador.
2. `requester/requester.go::GetDocument` reutiliza o mesmo contexto no Redis, no
   GET direto e em `FlareSolverr.Get`. Seu `http.Client.Timeout` é 5.000 ms,
   configurado por `REQUEST_TIMEOUT_MILLISECONDS`; não é um deadline no contexto
   pai e não explica 116 ms.
3. Uma falha de transporte no GET direto ou a detecção de challenge chama
   `FlareSolverr.Get(ctx, url, 3)`. As expressões que criam o erro observado são
   `fmt.Errorf("failed to do request for url %s: %w", url, err)` nas duas rotas
   de fallback de `GetDocument`.
4. `requester/flaresolverr.go::FlareSolverr.Get` consulta `ctx.Done()` enquanto
   espera uma sessão e usa o mesmo contexto em
   `http.NewRequestWithContext(ctx, "POST", .../v1, ...)`. Se o contexto já foi
   cancelado, `RetrieveSession` ou `http.Client.Do` devolve `context.Canceled`;
   o método Go foi invocado, mas o POST pode não chegar ao servidor. Portanto,
   `correlatedEvents: []` é compatível com esta execução.
5. O middleware de logging apenas envolve `ServeHTTP`; não cria nem cancela
   contexto. `ParallelFlatMap`, suas goroutines e channels só são alcançados
   depois que o documento inicial foi obtido, logo não participam deste erro.

Não existem `context.WithCancel`, `context.WithTimeout`, `context.WithDeadline`,
`cancel()`, `errgroup` ou helper de cancelamento compartilhado nesse caminho. O
único proprietário do contexto é o servidor `net/http`: o contexto da requisição
de entrada é cancelado quando a conexão do cliente termina, quando a requisição é
cancelada pelo protocolo ou quando `ServeHTTP` retorna. Como o handler ainda
estava executando, o limite causal restante é o encerramento/cancelamento da
conexão de entrada. O cliente do laboratório envia HTTP/1.0 por `printf | nc`;
o EOF imediato no stdin do `nc` é o mecanismo provável para o encerramento do
lado de envio. A atribuição específica dos ~116 ms a esse EOF ainda requer os
marcadores preparados abaixo em uma futura execução; não foi feita nova consulta.

O harness offline `contextCancellationProbe.ts` usa somente servidores locais e
barreiras. Ele cobre fluxo normal, cancelamento do pai durante o GET, deadline,
cancelamento entre challenge e fallback, uma única invocação do fallback,
ausência de POST recebido quando o contexto já está cancelado e fechamento de
todas as operações. O erro encapsulado e a ausência de POST foram reproduzidos.

Para uma validação futura, os marcadores sanitizados registram exclusivamente:
etapa, estado do contexto, causa equivalente a `context.Cause`, presença de
deadline, tempo restante arredondado, início do fallback, início/conclusão do
POST e duração. Não há campos para URL, termo, query, cookies, headers, HTML,
títulos, magnets, hashes ou payload. No upstream Go, os pontos correspondentes
ficam imediatamente antes/depois de `GetDocument`, antes de `FlareSolverr.Get`,
antes/depois de `httpClient.Do` e no retorno do handler.

A correção recomendada foi preparada sem alterar o servidor: o caminho de
consulta não usa mais `printf | nc`. `tools/internal-http-client.py` roda com o
`python3` já presente no FlareSolverr, conecta-se ao torrent-indexer somente pela
rede interna, envia uma única requisição HTTP/1.0 sem header `Connection: close`
e lê repetidamente até EOF antes de fechar o socket. `http.client` não segue
redirects automaticamente. O status sai separado do corpo; o corpo é mantido no
máximo até 1 MiB + 1 byte para detecção, embora toda a resposta seja drenada. O
timeout interno e o supervisor externo permanecem em 20 segundos. A validação
runtime dessa troca continua pendente e nenhuma consulta foi executada.

Não se recomenda destacar o scraper de `r.Context()` nem usar
`context.Background()`, pois isso perderia cancelamento legítimo do cliente. Uma
alteração upstream só deve ser considerada se instrumentação posterior mostrar
um cancelador diferente.

## Fechamento da milestone runtime

A validação controlada no docker-server executou o commit
`b926b710e773ec1f4b271f573593a08df110a8eb` e encerrou a milestone com o resultado
parcial esperado:

- FlareSolverr, Redis e torrent-indexer `healthy`;
- ChromeDriver efêmero funcional;
- zero portas publicadas;
- `FLARESOLVERR_ADDRESS` presente e confirmado como variável correta;
- uma única consulta autorizada ao `bludv`, sem retry ou troca de termo;
- HTTP `200` em aproximadamente 2.880 ms;
- resposta de 25 bytes, JSON válido, `count: 0` e `results: 0`;
- parser com zero itens aceitos e zero rejeitados;
- status `PARTIAL_ZERO_RESULTS` e código final `2`;
- ausência de `context canceled` e HTTP `500`;
- cleanup completo, sem container ou rede residual.

O contraste com a execução anterior confirma operacionalmente que o antigo
`printf | nc` encerrava prematuramente `r.Context()`: após o cliente Python passar
a ler até EOF, o cancelamento desapareceu sem qualquer mudança no servidor Go.
A imagem derivada e a cópia efêmera do ChromeDriver funcionaram, mas o Chromium
da FlareSolverr `v3.3.21` neste ambiente ainda exige `read_only: false`; essa
exceção permanece restrita ao serviço FlareSolverr.

HTTP `200` com zero resultados é uma validação parcial válida do transporte, da
infraestrutura e do envelope aceito pelo parser. Não comprova retorno positivo
de item real. Não houve segunda consulta nem substituição do termo autorizado.
Consultas de conteúdo comercial continuam fora do escopo e nenhuma capacidade
de playback, magnet, torrent, debrid ou reprodução foi validada.
