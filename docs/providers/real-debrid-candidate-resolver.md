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
- `RealDebridHttpTransport` é a única fronteira HTTP e não usa `fetch` global;
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
