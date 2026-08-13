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
- [x] Wiring interno opt-in do resolver Real-Debrid para o `TorrentIndexerProvider` (sem bootstrap ou configuração operacional; desativado por padrão)
- [x] BluDV
- [x] Conexão do `BluDVProvider` com o `RealDebridCandidateResolver`
- [x] Torrentio
- [x] Torrent dos Filmes (PT-BR Dublado)
- [ ] Outros providers externos

## Recursos

- [ ] Cache
- [ ] Configuração
- [ ] Docker
- [ ] Logs estruturados
- [ ] Healthcheck

## Releases

- [ ] v0.1.0
