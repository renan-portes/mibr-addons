# Roadmap

- [x] Validate the isolated experimental addon HTTP runtime on the docker-server: runtime base `b9c9be61b7dc29df8ff0418bfd43447b457107ab` returned code `0` after health, manifest and offline stream validation with loopback-only publication and complete cleanup.

- [x] Prepare a separate offline/fake launcher for temporary experimental-manifest access with strict loopback/LAN authorization; the standard addon remains unchanged.
- [x] Bound that launcher to one explicit unoccupied port in `1024..65535` and an optional maximum lifetime of 3600 seconds, with executable cleanup and failure coverage.

- [x] Runtime-validate controlled LAN client access on `0214d8d`: normalized `eth0`, one explicit private TCP publication, health and experimental manifest reachable from a second LAN device, Docker bridges rejected, expected interrupt code `130`, and complete cleanup without firewall, WAN, DNS, tunnel, addon installation, `/stream`, or playback.
- [x] Runtime-validate controlled LOOPBACK startup of the separately authorized experimental Real-Debrid client mode on `dd7c9a6`: file-only token, health and experimental manifest passed; manual interruption returned `130` with complete cleanup and no `/stream` query.
- [x] Perform one controlled `/stream` request with one legally authorized candidate, one exact allowlisted IMDb ID, one coherent magnet/info-hash pair, no discovery, no non-idempotent retry, no playback, and mandatory cleanup.

- [ ] Start the isolated Real-Debrid addon runtime lab on the docker-server and validate its experimental manifest before any Stremio or Nuvio installation.

## Infraestrutura

- [x] Projeto TypeScript
- [x] MVP Stremio
- [x] Arquitetura de providers
- [x] Timeout e cancelamento por provider
- [x] HttpDataClient

## Providers

- [x] FixtureProvider
- [x] HttpFixtureProvider
- [x] Internet Archive Provider experimental (filmes)
- [x] Pesquisa arquitetural do torrent-indexer
- [x] Cliente/provider experimental do torrent-indexer (somente descoberta local)
- [x] Laboratório self-host isolado do torrent-indexer
- [x] Validação controlada do contrato runtime do torrent-indexer (HTTP 200 e `PARTIAL_ZERO_RESULTS`)
- [x] Sondagem operacional sanitizada da instância pública executada manualmente:
  - `bludv`: HTTP `200` / `OK_ZERO_RESULTS`;
  - `torrent-dos-filmes`: HTTP `200` / `OK_ZERO_RESULTS`;
  - `comando_torrents`: HTTP `500` / `HTTP_ERROR`;
  - nenhuma nova sondagem está pendente nesta milestone; não houve consulta em massa, fallback ou troca automática de indexer.
- [x] Contrato offline para resolver sequencialmente candidatos validados em URLs HTTP/HTTPS (fake local; timeout efetivo; limites por rejeição; desabilitado por padrão)
- [x] Adaptador Real-Debrid exclusivamente offline sobre transporte fake (associação 1:1 pós-seleção; sem token ou chamada real; desabilitado)
- [x] Transporte HTTPS Real-Debrid offline com fetch/DNS injetados (base fixa, sem redirects ou retries, limites e validação DNS pré-conexão; ainda sem configuração/runtime real)
- [x] Laboratório autenticado descartável do Real-Debrid preparado para execução manual (`account` primeiro; `candidate` separado; sem token ou chamada real no desenvolvimento)
  - primeira tentativa falhou no build por ownership do `WORKDIR`, antes de autenticação ou chamada à API; correção aplicada e nova execução pendente.
  - tentativa seguinte falhou antes do HTTP porque o segredo `root:root 0600` era ilegível pelo container `1000:1000`; ownership POSIX e diagnóstico pré-HTTP corrigidos, com nova execução pendente.
  - modo `account` validado no commit `e13652b6dedfd77b77cd02cfe22af492ad8869d2`: um `GET /user`, HTTP 200, `SUCCESS`, código 0, sanitização e cleanup completos; conteúdo e playback não testados nessa fase.
  - primeira execução única de `candidate`: autenticação e `addMagnet` validados; falha `INVALID_RESPONSE` antes de `file_selected`, em 1366 ms, código 1 e cleanup completo. Diagnóstico estrutural foi refinado offline; causa específica e representação do path raiz continuam pendentes, sem nova execução.
  - segunda execução única de `candidate`: `GET info` e presença de `files` confirmados; `FILE_LIST_INVALID` antes de `file_selected`, em 1349 ms, código 1 e cleanup completo. A incompatibilidade provável com o slash inicial contratual foi corrigida offline; nova validação runtime permanece pendente.
  - terceira execução única de `candidate`: autenticação, arquivo autorizado e `selectFiles` validados; `TIMEOUT` após `file_selected`, em aproximadamente 2899 ms, código 1 e cleanup completo. O laboratório agora distingue deadline, polling, delay e GET, usando até 10 snapshots, delay de 1500 ms e deadline de 30 s; nova execução permanece pendente.
  - execução seguinte alcançou `DOWNLOADING` e esgotou 10 GETs em 17766 ms, sem atingir o deadline global, sem falha estrutural ou URL final; janela exclusiva do laboratório ajustada para até 20 GETs, 1500 ms e 45 s, com nova execução única pendente.
  - primeira execução bem-sucedida de `candidate` na base `0b5381c0321b8d9626981cd5383cb692e990eb9f`: fluxo completo, `SUCCESS`, código 0, 2271 ms, URL final validada sem exposição e cleanup completo; conteúdo aberto/autorizado foi pré-carregado manualmente, sem obra comercial ou repetição automática.
- [ ] Integração com resolver autorizado real e validação de rede/DNS por hop
- [ ] Resultado positivo com item real no self-host (não comprovado pela validação parcial)
- [ ] Consultas funcionais a conteúdo comercial (fora de escopo)
- [ ] Self-host de produção do torrent-indexer
- [ ] Integração de playback/debrid
- [x] Wiring interno opt-in do resolver Real-Debrid para o `TorrentIndexerProvider` (sem bootstrap ou configuração operacional; desativado por padrão)
- [ ] Configuração operacional isolada e teste do addon com autorização explícita
- [x] BluDV
- [x] Conexão do `BluDVProvider` com o `RealDebridCandidateResolver`
- [x] Torrentio
- [ ] Outros providers externos

## Recursos

- [ ] Cache
- [ ] Configuração
- [ ] Docker
- [ ] Logs estruturados
- [ ] Healthcheck

## Releases

- [ ] v0.1.0
