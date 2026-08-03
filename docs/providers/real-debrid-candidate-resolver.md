# Real-Debrid candidate resolver

## Escopo offline

Esta milestone implementa apenas um adaptador interno e offline compatível com
`TorrentCandidateResolver`. Todo o fluxo usa transporte fake injetado, fixtures
sintéticas e domínios `.invalid`. Nenhum token real, chamada ao serviço, magnet,
tracker, torrent, conteúdo, URL reproduzida ou playback integra esta etapa.

O provider permanece fora do bootstrap e a feature flag continua `false`. Não há
configuração operacional ou `.env` novo.

## Arquitetura e credencial

- `RealDebridCandidateResolver` orquestra estados, seleção, deadlines e cleanup;
- `RealDebridApiClient` modela os cinco endpoints e decodifica respostas;
- `RealDebridHttpTransport` é a única fronteira HTTP;
- `RealDebridFetchTransport` é a implementação HTTPS concreta, ainda usada
  somente com `fetch` e DNS injetados nos testes offline;
- `FakeRealDebridTransport` mantém fila estrita e isolada, sem rede;
- `RealDebridResolverError` expõe somente códigos internos sanitizados.

A credencial é privada no cliente. Testes usam apenas
`test-token-not-a-real-secret`. Uma integração futura deverá usar exclusivamente
`Authorization: Bearer`, com a credencial fora do repositório. Token nunca entra
em URL, query, body, calls sanitizadas, erros ou resultados.

## Fluxo, associação e estados

O fluxo é: `addMagnet`; `GET info` pré-seleção; escolher um arquivo;
`selectFiles` com um único ID; `GET info` pós-seleção obrigatório; polling
limitado; `unrestrict/link`; validação da URL final; cleanup `DELETE` best-effort.

O snapshot anterior nunca é reutilizado após `selectFiles`, mesmo se já estiver
`downloaded`. O snapshot final exige exatamente um arquivo selecionado com o ID
original e exatamente um link. O único link é associado ao único arquivo sem
posição, path, nome ou tamanho. Qualquer cardinalidade ou ID ambíguo é rejeitado.

Estados em allowlist:

- transitórios: `magnet_conversion`, `waiting_files_selection`, `queued`,
  `downloading`;
- sucesso: `downloaded`;
- terminais: `magnet_error`, `error`, `virus`, `dead`.

Status desconhecido, vazio, uppercase ou com espaços é rejeitado. Links não
inferem sucesso. Polling tem três tentativas por padrão, máximo dez, e não repete
POSTs. Apenas `GET info` pode ser repetido.

## Timeout, cancelamento e cleanup

O timeout total padrão é 20 segundos, máximo 60. Transporte e delay disputam a
mesma race reutilizável contra o signal; operações tardias são consumidas. O
cancelamento global é revalidado após cada await e imediatamente antes do retorno.

Cleanup é configurável e habilitado por padrão. Quando existe ID validado,
`DELETE` é tentado no máximo uma vez com controller próprio, timeout padrão de 2
segundos e máximo de 5. Falha/timeout ficam observáveis como `cleanup_failed` sem
mascarar sucesso ou erro principal; cancelamento global sempre prevalece.

## Seleção e validação

Arquivos exigem ID inteiro positivo, bytes inteiros entre zero e 10 TiB, path
relativo seguro e extensão de vídeo plausível. São rejeitados traversal, paths
absolutos, drives, UNC, backslash, qualquer `%`, controles, separadores Unicode,
segmentos vazios ou terminados em ponto/espaço, path total acima de 1024, segmento
acima de 255 e arrays acima de 100. `sample`, `trailer` e `extra` são excluídos.

Filmes preferem o maior arquivo, com desempate por path e ID. Séries exigem
exatamente um marcador `SxxExx` correspondente no basename; marcador apenas no
diretório e episódios duplos são rejeitados.

## HTTP e erros

POSTs são `application/x-www-form-urlencoded`. O request interno contém base HTTPS
oficial fixa e `redirect: error`, sem configuração pelo usuário. JSON é exigido
nos endpoints JSON, o corpo é limitado a 1 MiB e DELETE aceita 204 vazio.

Erros discriminam configuração, cancelamento, timeout, transporte, HTTP,
Content-Type, JSON, tamanho, decode, status desconhecido/terminal, arquivo,
seleção, link, URL final e cleanup. Nenhum erro inclui token, magnet, ID, path,
link, payload ou mensagem arbitrária do transporte.

Uma integração real ainda exigirá autenticação operacional, rate limiting,
observabilidade sanitizada, validação runtime, DNS/anti-rebinding e validação de
cada redirect no momento da conexão. O uso deverá ser restrito a conteúdo
autorizado. Nenhuma URL foi acessada ou reproduzida nesta milestone.

## Transporte HTTPS concreto (offline)

O transporte fixa `https://api.real-debrid.com/rest/1.0`, usa o token somente no
header `Authorization: Bearer`, define redirects como `error`, limita cada corpo
a 1 MiB e possui timeout próprio padrão de 10 segundos (máximo 60). Cancelamento
do chamador e timeout vencem inclusive `fetch`, leitura ou DNS não cooperativos;
o cancelamento do body reader é best-effort e limitado a 250 ms; listeners e
timers são removidos. O cancelamento externo é revalidado antes de qualquer
retorno: timeout e cancelamento limitam DNS, fetch, leitura e cleanup do reader,
mesmo quando a operação ignora o `AbortSignal`. Não existe retry: POST e DELETE nunca são
repetidos. HTTP 429 é classificado separadamente para que um futuro chamador
possa tratar rate limiting de GET, mas esta milestone não implementa loop.

Antes do `fetch`, todas as respostas DNS são validadas e endereços privados,
loopback, link-local, multicast, documentação e especiais IPv4/IPv6 são
rejeitados. Como o `fetch` nativo pode resolver o hostname novamente, esta
checagem isolada ainda tem janela TOCTOU e não constitui proteção completa contra
DNS rebinding. Uma integração operacional deverá fixar a conexão ao endereço
validado e revalidar DNS e destino em cada hop. Redirects permanecem desabilitados;
se forem suportados no futuro, cada hop deverá ser validado novamente.

O pathname não é uma URL livre: somente os cinco formatos de endpoint modelados
são aceitos, com IDs conservadores e sem query, fragmento, percent-encoding,
traversal, controles, backslash ou host/protocolo embutido. O limite do corpo é
aplicado por bytes durante o streaming; 1 MiB é aceito e o byte seguinte encerra
a leitura sem materializar o restante.

Todos os testes do transporte usam mocks injetados; nenhuma chamada externa,
credencial real, configuração operacional ou playback foi ativado. O provider
continua fora do bootstrap e a feature flag permanece `false`.

## Composição interna opt-in

`createRealDebridProviderWiring` compõe `RealDebridFetchTransport`,
`RealDebridApiClient` e `RealDebridCandidateResolver` somente quando recebe
`enabled: true`, token explícito válido e opções limitadas. Com `enabled: false`,
nenhum transporte, cliente ou resolver é construído. A factory retorna apenas o
resolver e opções sanitizadas do provider; nunca retorna token, base configurável
ou detalhes HTTP. Erros de configuração/construção são opacos e não copiam
mensagens arbitrárias.

`createRealDebridTorrentIndexerProvider` entrega esse wiring ao
`TorrentIndexerProvider`, mas não é chamado pelo bootstrap. A feature flag segue
`false` por padrão e o comportamento sem ativação continua discovery-only com
`[]`. A base HTTPS permanece fixa, DNS e redirects mantêm a política defensiva do
transporte, o `AbortSignal` continua propagado e o provider apenas devolve
`StreamResult` validado sem acessar a URL final.

Esta composição foi validada exclusivamente com transportes e resolvers fake.
Nenhum `.env`, token real ou configuração operacional foi adicionado. O runtime
manual do Real-Debrid já validou a cadeia autorizada, mas integração operacional
isolada, teste do addon, playback, Stremio e Nuvio permanecem para milestones
posteriores.
## Experimental addon runtime composition

The validated Real-Debrid runtime flow and the internal opt-in wiring are now available to an **isolated experimental composition** only. `src/runtime/experimentalRealDebridAddonRuntime.ts` creates a new `ProviderManager`, registers one injected `TorrentIndexerProvider`, and builds the resolver chain only for `enabled === true` with a non-empty token. It performs no DNS, fetch, or other I/O during construction and never changes the default bootstrap.

`lab/real-debrid-addon-runtime/` provides an offline dry-run and a hardened, no-port Compose definition. No real configuration or token is versioned. The lab has not started Docker, accessed a service, exposed an experimental manifest, or tested Stremio, Nuvio, or playback. Those checks remain a separately authorized next step.

The first offline Docker dry-run was validated on `cf94968d6d7f641985e42bef6336408b63d4e907`: it rendered Compose, built the tools image, returned `DRY_RUN_OK` with code 0, kept resolution disabled, and used only an empty disposable placeholder. No DNS, fetch, Real-Debrid, Stremio, Nuvio, playback, or token access occurred. The project network required explicit `compose down` and was then removed without residue. The POSIX launcher now codifies that flow; an experimental HTTP manifest still does not exist.
