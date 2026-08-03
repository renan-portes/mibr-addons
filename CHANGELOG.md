# Changelog

## [Unreleased]

### Added

- Arquitetura assíncrona de providers com contratos separados para client, parser e provider.
- Modelo interno de streams e adaptador de saída para o protocolo Stremio.
- Pipeline local de demonstração com fixtures e testes isolados.
- Provider HTTP de demonstração com servidor local e parser puro.
- Provider experimental do Internet Archive para filmes declarados como domínio público.
- Cliente e provider experimental, em modo descoberta, para a API JSON do torrent-indexer.
- Parsing defensivo e fixtures sintéticas para respostas do torrent-indexer.
- Laboratório Docker isolado e descartável do torrent-indexer, validado em runtime sem consultas a indexadores.
- Laboratório manual para comparação sanitizada e controlada do contrato runtime do torrent-indexer.
- Infraestrutura do laboratório runtime-contract validada no docker-server com FlareSolverr, Redis e torrent-indexer healthy, zero portas publicadas e resposta HTTP 200 válida com zero resultados.
- Sondagem manual sanitizada, de uma chamada por execução, para a instância pública oficial do torrent-indexer.
- Contrato offline e fake local para resolução sequencial e opcional de candidatos do torrent-indexer em URLs HTTP/HTTPS defensivamente validadas, com timeout efetivo, prioridade final do cancelamento e limites de entrada por rejeição, desabilitado por padrão.
- Adaptador interno offline do contrato de candidatos para o subconjunto necessário da API Real-Debrid, com associação 1:1 pós-seleção, deadlines canceláveis e cleanup limitado, exercitado exclusivamente por transporte fake e sem credencial ou serviço real.
- Transporte HTTPS concreto do adaptador Real-Debrid com base fixa, redirects desabilitados, limite de 1 MiB, timeout/cancelamento efetivos e validação DNS defensiva, testado somente com dependências injetadas e sem rede real.
- Laboratório descartável para validação runtime manual do transporte Real-Debrid, com modo inicial de conta sanitizado e modo de candidato separado e explicitamente autorizado, sem credencial versionada ou execução real nesta milestone.
- Timeout e cancelamento por provider.

### Changed

- Composição dos providers padrão movida para o bootstrap da aplicação.
- Validação de configuração e typecheck ampliados para incluir os testes.
- Smoke tests do laboratório ajustados para rede interna sem portas publicadas e para o health `503` esperado sem MeiliSearch.

### Fixed

- Ownership do diretório de trabalho da imagem de ferramentas do laboratório Real-Debrid ajustado antes do `npm ci` não-root; nova validação runtime ainda pendente.
- Segredo efêmero do laboratório Real-Debrid preparado e validado como `1000:1000` com modos restritos antes do Compose, evitando falha de leitura pré-HTTP pelo container não-root.
- Isolamento de falhas para impedir que um provider com erro ou timeout derrube os demais.
- Validação estrita da porta configurada por ambiente.
- Inicialização do FlareSolverr v3.3.21 com ChromeDriver efêmero e exceção `read_only: false` restrita ao serviço.
- Endereço interno do FlareSolverr configurado pela variável upstream correta, `FLARESOLVERR_ADDRESS`.
- Cliente bruto `printf | nc` substituído por cliente Python que lê até EOF, eliminando o cancelamento prematuro de `r.Context()` no teste runtime.
