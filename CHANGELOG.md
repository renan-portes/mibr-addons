# Changelog

- Recorded the successful offline Docker dry-run for the isolated Real-Debrid addon runtime and added its secret-safe, single-shot POSIX launcher.

- Added an isolated offline experimental HTTP addon runtime surface and loopback-only launcher; the standard bootstrap, manifest, and router remain unchanged.

- Added an isolated, opt-in experimental addon-runtime composition for the torrent indexer and Real-Debrid resolver; the standard bootstrap and public addon surface remain unchanged.

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
- Laboratório descartável preparado offline para validação runtime manual do transporte Real-Debrid, com modo inicial de conta sanitizado e modo de candidato separado e explicitamente autorizado, sem credencial versionada.
- Modo `account` do laboratório Real-Debrid validado no docker-server com transporte HTTPS real, segredo efêmero read-only, resposta HTTP 200 sanitizada e cleanup completo; playback permanece não testado.
- Primeira execução única do modo `candidate` registrada: autenticação e `addMagnet` concluídos, falha sanitizada antes de `file_selected`, cleanup completo e diagnóstico estrutural offline mais preciso, sem expor entrada ou resposta.
- Segunda execução única do modo `candidate` registrada com `GET info` concluído e `FILE_LIST_INVALID`; decoder ajustado ao slash inicial contratual sem relaxar a comparação autorizada, com nova validação runtime ainda pendente.
- Terceira execução única de `candidate` registrada após `file_selected`, com `TIMEOUT` em aproximadamente 2899 ms e cleanup completo; polling do laboratório ampliado de forma limitada e categorias sanitizadas separadas sem alterar os defaults do produto.
- Execução controlada posterior confirmou `DOWNLOADING` e esgotamento dos 10 GETs sem deadline global; somente o laboratório passa a permitir 20 GETs, delay de 1500 ms e timeout total de 45 s para uma nova validação única.
- Modo `candidate` validado com sucesso na base `0b5381c0321b8d9626981cd5383cb692e990eb9f`: cadeia completa em 2271 ms, código 0, URL final validada sem exposição e cleanup sem resíduos, usando somente conteúdo aberto/autorizado pré-carregado manualmente.
- Composição interna opt-in adicionada para conectar transporte, cliente e resolver Real-Debrid ao `TorrentIndexerProvider`, sem bootstrap, configuração operacional, credencial ou ativação por padrão.
- Timeout e cancelamento por provider.

### Changed

- Composição dos providers padrão movida para o bootstrap da aplicação.
- Validação de configuração e typecheck ampliados para incluir os testes.
- Smoke tests do laboratório ajustados para rede interna sem portas publicadas e para o health `503` esperado sem MeiliSearch.

### Fixed

- Ownership do diretório de trabalho da imagem de ferramentas do laboratório Real-Debrid ajustado antes do `npm ci` não-root; nova validação runtime ainda pendente.
- Segredo efêmero do laboratório Real-Debrid preparado e validado como `1000:1000` com modos restritos antes do Compose, evitando falha de leitura pré-HTTP pelo container não-root.
- Correspondência do arquivo autorizado no resolver Real-Debrid tornada exata por path completo e tamanho, com falhas estruturais e de seleção discriminadas sem dados sensíveis.
- Decoder de arquivos Real-Debrid separado do formato interno: exige e remove exatamente uma barra inicial da API, rejeita demais formas inseguras e reconhece `compressing`/`uploading` como estados transitórios limitados.
- Isolamento de falhas para impedir que um provider com erro ou timeout derrube os demais.
- Validação estrita da porta configurada por ambiente.
- Inicialização do FlareSolverr v3.3.21 com ChromeDriver efêmero e exceção `read_only: false` restrita ao serviço.
- Endereço interno do FlareSolverr configurado pela variável upstream correta, `FLARESOLVERR_ADDRESS`.
- Cliente bruto `printf | nc` substituído por cliente Python que lê até EOF, eliminando o cancelamento prematuro de `r.Context()` no teste runtime.
