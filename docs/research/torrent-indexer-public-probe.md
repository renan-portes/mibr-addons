# Sondagem da instância pública do torrent-indexer

## Objetivo e limites

A raiz pública informou revisão `0ba84b1`, versão `0.15.2` e os indexers
disponíveis. Esta ferramenta prepara uma verificação operacional mínima, manual e
sanitizada. Nenhuma consulta real foi executada durante sua implementação.

Cada execução exige exatamente um indexer permitido e produz no máximo uma
requisição, sem loop, retry ou fallback. A consulta é fixa em `Big Buck Bunny`,
`filter_results=true`, `limit=1`, timeout de 20 segundos e resposta máxima de
1 MiB. `/search`, `/indexers/manual` e `/ui` não são chamados.

## Saída e categorias

Somente indexer, HTTP, duração, bytes, validade JSON, `count`, `indexed_count`,
quantidade de results e categoria são emitidos:

- `OK_RESULT`: HTTP 2xx, JSON válido e pelo menos um resultado;
- `OK_ZERO_RESULTS`: HTTP 2xx, JSON válido e results vazio;
- `HTTP_ERROR`: status não 2xx, falha de transporte ou redirect;
- `TIMEOUT`: limite de 20 segundos atingido;
- `INVALID_JSON`: HTTP 2xx sem JSON/envelope de results válido.
- `RESPONSE_TOO_LARGE`: leitura ultrapassou 1 MiB e foi interrompida.

Falhas de transporte antes de uma resposta usam `http: null`. Se o status já foi
recebido, ele é preservado. O tamanho registra os bytes efetivamente observados;
isso inclui o primeiro chunk que comprova o excesso em `RESPONSE_TOO_LARGE`.
Nenhuma categoria dispara retry ou uma segunda consulta.

O payload é lido em memória e descartado. A ferramenta não imprime nem segue
títulos, magnets, hashes, trackers, files ou URLs da resposta.

## Pública versus self-host

| Aspecto | Instância pública | Self-host validado |
|---|---|---|
| Operação | Mantida por terceiro e sujeita a limites/mudanças | Revisão e recursos controlados localmente |
| Isolamento | Cliente defensivo, sem controle do servidor | Containers e rede sob controle do operador |
| FlareSolverr | Pode já estar configurado pelo operador público | O upstream fixado consome `FLARESOLVERR_ADDRESS`; `FLARESOLVERR_URL` não é consumida nessa revisão. A configuração incorreta foi corrigida posteriormente no runtime-contract |
| Diagnóstico | Erro pode refletir serviço, bloqueio ou indexer | Permite separar configuração local, egress e falha do scraper |

Um indexer quebrado na instância pública não prova sozinho defeito do código:
pode haver bloqueio, rate limit, configuração ou dependência ambiental. A
“ausência de URL” foi uma hipótese histórica de um estado intermediário do
self-host: a variável operacional correta é `FLARESOLVERR_ADDRESS`, e sua
configuração foi corrigida posteriormente no runtime-contract. Ela não representa
um problema atual. A comparação dos resultados, cada um autorizado separadamente,
deve ser usada apenas como evidência operacional pontual.

No estado consolidado do self-host, FlareSolverr, Redis e torrent-indexer ficaram
healthy. A consulta única retornou HTTP `200`, `PARTIAL_ZERO_RESULTS` e código final
`2`. Esse resultado valida a infraestrutura parcialmente, sem comprovar resultado
positivo com item real.

## Resultados controlados

- `bludv`: HTTP `200`, JSON válido, `OK_ZERO_RESULTS`, aproximadamente 4,1 s;
- `torrent-dos-filmes`: HTTP `200`, JSON válido, `OK_ZERO_RESULTS`, aproximadamente 2,1 s;
- `comando_torrents`: HTTP `500`, JSON válido, `HTTP_ERROR`, aproximadamente 302 ms.

Cada resultado veio de uma execução separada e única, sem retry. Nenhum payload
ou valor sensível foi persistido. A associação do HTTP `500` do self-host com
ambiente ou configuração pertence ao estado intermediário da investigação e foi
superada pela validação runtime consolidada descrita acima.
