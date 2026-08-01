# Changelog

## [Unreleased]

### Added

- Arquitetura assíncrona de providers com contratos separados para client, parser e provider.
- Modelo interno de streams e adaptador de saída para o protocolo Stremio.
- Pipeline local de demonstração com fixtures e testes isolados.
- Provider HTTP de demonstração com servidor local e parser puro.
- Provider experimental do Internet Archive para filmes declarados como domínio público.
- Timeout e cancelamento por provider.

### Changed

- Composição dos providers padrão movida para o bootstrap da aplicação.
- Validação de configuração e typecheck ampliados para incluir os testes.

### Fixed

- Isolamento de falhas para impedir que um provider com erro ou timeout derrube os demais.
- Validação estrita da porta configurada por ambiente.
