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

O diagnóstico self-host posterior confirmou a causa: HTTP `500`, payload JSON
com erro de challenge, categoria `FLARESOLVERR`, `FLARESOLVERR_URL` ausente,
DNS/egress disponíveis e Redis funcional. O laboratório runtime agora inclui
`ghcr.io/flaresolverr/flaresolverr:v3.3.21` na mesma rede, sem porta publicada, e
configura `FLARESOLVERR_URL=http://flaresolverr:8191`. O torrent-indexer aguarda o
healthcheck desse serviço antes de iniciar.

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
`nosuid`, `nodev`, limite, ownership e `read_only` do restante permanecem. A
validação runtime dessa segunda correção ainda está pendente e nenhuma consulta
real foi executada.

Em HTTP diferente de `200`, o laboratório agora produz somente diagnóstico
sanitizado. O corpo é classificado como JSON ou texto, apenas as chaves raiz
`error`, `message`, `status`, `code` e `type` podem aparecer, e a mensagem é
mascarada e limitada a 200 caracteres. Conteúdo inseguro vira
`upstream returned an opaque error payload.`

Somente logs `error`/`fatal` são considerados e classificados como
`FLARESOLVERR`, `DNS_NETWORK`, `EXTERNAL_HTTP`, `TIMEOUT`, `PARSER_SCRAPER`,
`REDIS`, `CONFIGURATION` ou `UNKNOWN`. Variáveis relevantes são registradas
apenas como `PRESENT`/`ABSENT`, com atenção a `FLARESOLVERR_URL`. DNS e egress são
checados sem nova busca: resolução do host público e `wget --spider` somente na
raiz `https://torrent-indexer.darklyn.org/`. Nenhuma página de resultados é
acessada, a consulta `bludv` continua única e todos os temporários são apagados.

`logErrors` nunca reutiliza a linha original: prefixo do container, JSON,
timestamp, IP, path, user-agent e query são descartados. Cada entrada contém
somente categoria e uma mensagem curta normalizada.
