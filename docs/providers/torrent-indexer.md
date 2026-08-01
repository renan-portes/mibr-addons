# Torrent Indexer Provider (experimental)

## Status

Este provider valida o consumo defensivo da API JSON do `torrent-indexer` usando
somente fixtures sintéticas e servidor HTTP local nos testes. Ele permanece fora
do bootstrap e não realiza playback nesta fase.

Nenhum código do projeto GPL foi copiado. A implementação é um cliente original
e independente que se comunica com um serviço externo por HTTP/JSON.

## Arquitetura

```text
HttpDataClient
  -> TorrentIndexerDataClient
  -> TorrentIndexerParser
  -> TorrentIndexerProvider
  -> StreamResult[]
```

- `HttpDataClient` aplica timeout, cancelamento, limite de resposta e erros HTTP.
- `TorrentIndexerDataClient` constrói somente
  `/indexers/{indexer}` a partir de uma base configurada e allowlist explícita.
- `TorrentIndexerParser` recebe `unknown`, descarta entradas inválidas e produz
  modelos internos normalizados.
- `TorrentIndexerProvider` aplica as regras de consulta e playback. Ele usa o ID
  completo como busca e o IMDb base como filtro.

## Contrato consumido

Endpoint: `GET /indexers/{indexer}`.

Parâmetros inicialmente suportados:

- `q`
- `filter_results`
- `limit`
- `sortBy`
- `sortDirection`
- `audio`
- `year`
- `imdb`

O cliente não aceita o nome do indexer vindo de uma resposta. A instância que o
constrói deve informar tanto o indexer selecionado quanto a allowlist. Nomes são
limitados a letras ASCII minúsculas, números, `_` e `-`.

Esta implementação foi testada sinteticamente com os nomes `bludv` e
`comando_torrents`, mas nenhum desses serviços foi acessado. A lista efetivamente
permitida é sempre definida pelo chamador.

## Parsing e normalização

O parser exige apenas um título não vazio. Campos opcionais são validados quando
presentes: IMDb, info hash, contagens de peers, áudio, trackers, arquivos, tamanho
e magnet. Hashes válidos são normalizados para hexadecimal minúsculo. Entradas
com IMDb, hash ou contagens explicitamente inválidos são descartadas; elementos
inválidos dentro de arrays são ignorados sem derrubar os demais resultados.

Campos desconhecidos não são preservados. Nenhuma URL encontrada na resposta é
seguida pelo cliente ou provider.

## Playback

O contrato pesquisado contém magnet e info hash, mas não uma URL HTTP/HTTPS de
vídeo reproduzível. Por isso o provider atualmente retorna `[]`, mesmo quando a
descoberta encontra itens válidos.

Ele não:

- converte magnet em URL;
- expõe magnet como `StreamResult.url`;
- consulta trackers;
- resolve metadata BitTorrent;
- usa debrid;
- inventa uma URL de playback.

Uma futura evolução só poderá produzir `StreamResult` após aprovação de uma
origem de playback explícita, autorizada e documentada.

## Segurança

- base URL e indexer são configurações locais; nunca vêm da resposta;
- apenas `http` e `https` são aceitos como protocolo da base;
- credenciais embutidas, query e fragmento na base são rejeitados;
- indexers exigem allowlist e formato restrito;
- resposta tem limite configurado pelo `HttpDataClient`;
- timeout e `AbortSignal` são propagados;
- magnets não são logados nem expostos ao Stremio;
- URLs, trackers e arquivos retornados são tratados apenas como dados;
- não há cache, retry, redirect customizado, autenticação ou acesso externo nos
  testes.

Riscos restantes: o `fetch` nativo mantém seu comportamento padrão de redirects
para a requisição configurada; um deployment futuro deve fixar e proteger a
`baseUrl`, limitar acesso de rede/egress, autenticar o serviço self-hosted e
observar respostas sem registrar campos sensíveis.

## Licença e isolamento

O serviço analisado usa GPL-3.0. Este cliente não vincula, importa nem copia seu
código; consome somente um contrato HTTP estimado. Se o indexador ou uma imagem
derivada forem distribuídos futuramente, suas obrigações GPL devem ser tratadas
separadamente, conforme `docs/research/torrent-indexer.md`.

## Limitações

- provider experimental e não registrado no bootstrap;
- nenhuma instância real foi validada;
- API externa não possui OpenAPI ou versão formal;
- sem playback, debrid, cache, retry ou autenticação;
- filtro de séries preserva o ID completo na busca, mas usa somente o IMDb base
  para correspondência nesta fase.
