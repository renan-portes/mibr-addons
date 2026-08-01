# Pesquisa: torrent-indexer

Pesquisa realizada em 31 de julho de 2026, exclusivamente a partir do código
público dos repositórios. Nenhum indexer, tracker, magnet, torrent ou instância
pública foi consultado.

## Escopo e fontes

- Fork: <https://github.com/Thanegche/torrent-indexerteste>, commit analisado
  `7a19553d4da13c23bcd235c8511bc32950e6af46` (29/10/2024).
- Upstream: <https://github.com/felipemarinho97/torrent-indexer>, commit analisado
  `0ba84b16c63a4add68534d1abba7c21660a8e959` (02/04/2026).
- Licença em ambos: GNU GPL v3.0.
- Nyaa: documentação pública de busca/RSS e implementações públicas disponíveis;
  nenhum feed ou resultado foi consultado.

O fork declara o mesmo módulo Go do upstream. No histórico observado, possui 32
commits e uma alteração própria posterior ao ponto de fork (`Update audio.go`).
O upstream possui 79 commits e continuou evoluindo depois do último commit do
fork. A comparação de código mostra mais de cinco mil linhas adicionadas ou
alteradas no upstream, portanto o fork está materialmente defasado.

## Contrato HTTP estimado

Não há OpenAPI, versionamento de rota ou tipos de cliente publicados. O contrato
abaixo foi inferido dos handlers e structs Go.

### Rotas do fork

| Método | Rota | Parâmetros/corpo | Resposta esperada |
|---|---|---|---|
| `GET` | `/` | nenhum | descoberta de endpoints e horário |
| `GET` | `/indexers/bludv` | `q` opcional; `filter_results` é tratado como ativo quando não vazio, apenas se houver mais de 20 resultados e busca não vazia | envelope de resultados |
| `GET` | `/indexers/comando_torrents` | igual a BluDV | envelope de resultados |
| `GET` | `/indexers/manual` | nenhum | entradas manuais em cache |
| `POST` | `/indexers/manual` | JSON com `magnetLink` | entrada manual adicionada por 12 horas |
| `GET` | `/metrics` | nenhum; porta separada `8081` | métricas Prometheus |

O servidor do fork escuta fixamente em `7006`; seu Compose publica `8081:7006`.

### Rotas adicionais/evoluídas do upstream

O upstream mantém as rotas acima e acrescenta:

- `GET /indexers/rede_torrent`
- `GET /indexers/starck-filmes`
- `GET /indexers/torrent-dos-filmes`
- `GET /indexers/vaca_torrent`
- `GET /search?q={texto}&limit={n}` (somente com MeiliSearch configurado)
- `GET /search/health`
- `GET /search/stats`
- `GET /ui/`

Os indexers do upstream aceitam `q`, `page`, `filter_results`, `limit`, `sortBy`,
`sortDirection`, `audio`, `year` e `imdb`. `imdb` apenas filtra os resultados já
coletados; o próprio endpoint raiz orienta usar `q` para buscar. Valores válidos
de `sortBy` declarados: `title`, `original_title`, `year`, `date`, `seed_count`,
`leech_count`, `size` e `similarity`. `sortDirection` aceita `asc` ou `desc`.

### Envelope de sucesso

```json
{
  "results": [],
  "count": 0,
  "indexed_count": 0
}
```

`indexed_count` existe apenas no upstream atual e é omitido quando zero. No
fork, o envelope contém somente `results` e `count`.

### Item de resultado

| Campo | Tipo estimado | Obrigatoriedade no JSON | Observação |
|---|---|---|---|
| `title` | string | presente | pode estar vazio se o parsing falhar |
| `original_title` | string | presente | título da página/post |
| `details` | string | presente | URL da página de origem |
| `year` | string | presente | pode estar vazio |
| `imdb` | string | presente | URL IMDb no código legado; pode estar vazia |
| `audio` | string[] ou null | presente | valores derivados de texto/arquivo |
| `magnet_link` | string | presente | dado sensível para um consumidor real; omitido nas fixtures desta pesquisa |
| `date` | string RFC 3339 | presente | pode ser a data zero de Go |
| `info_hash` | string | presente | hash hexadecimal; sintético nas fixtures |
| `trackers` | string[] ou null | presente | não deve ser registrado em logs do cliente |
| `size` | string | presente | texto não normalizado, pode estar vazio |
| `files` | objeto[] | somente upstream | `path` e `size`; omitido quando vazio |
| `leech_count` | number | presente | zero também representa falha/ausência de dado |
| `seed_count` | number | presente | idem |
| `similarity` | number | presente | Jaccard calculado após a coleta |

Apesar de os campos serem sempre serializados pela struct, quase todos podem
conter valores vazios ou zero. Um futuro cliente deve validar o envelope, cada
item e limites de tamanho, e nunca considerar esses campos semanticamente
obrigatórios sem validação adicional.

### Erros e códigos HTTP

- `200`: raiz e respostas normais, inclusive lista vazia.
- `400`: corpo inválido na rota manual (upstream/fork).
- `405`: rotas de busca MeiliSearch do upstream quando o método não é aceito.
- `500`: falha de HTTP externo, parse, Redis ou codificação nos handlers de
  indexer/manual. Normalmente o corpo é `{"error":"mensagem"}`.
- `503`: health/stats quando MeiliSearch está indisponível.
- Não há resposta `404` estruturada nem middleware uniforme de erros; o
  `http.ServeMux` pode encaminhar caminhos desconhecidos ao handler `/`, que
  responde `200`.
- Mensagens internas podem ser expostas diretamente ao cliente. Content-Type não
  é definido consistentemente antes de todas as respostas de erro.

Exemplos sintéticos estão em `tests/fixtures/torrent-indexer/`. Eles não contêm
magnet real, tracker ou conteúdo obtido dos sites.

## BluDV

O fluxo busca uma página, seleciona posts, abre cada detalhe, extrai links e
metadados textuais e consulta trackers UDP para seeders/leechers. No fork, os
principais seletores são `.post`, `div.title > a`, `.title > h1`, `div.content`,
`div.content p` e links `magnet`. O upstream já alterou parte desse fluxo para
acompanhar redirecionadores e proteção anti-bot.

Viabilidade: baixa no fork e moderada no upstream, sempre como serviço isolado.
Os seletores dependem diretamente do tema/HTML do site, a extração de áudio e
tamanho depende de texto em português, e mudanças de domínio/anti-bot exigem
manutenção frequente. O histórico recente do upstream contém correções explícitas
para mudanças e domínios do BluDV, evidenciando essa fragilidade.

## Comando Torrents

O fork usa `article`, `h2.entry-title > a`, `.entry-title`,
`div.entry-content`, `div[itemprop=datePublished]` e links `magnet`. A data é
interpretada por expressão regular com nomes de meses em português. Assim como
no BluDV, cada página de resultado dispara busca concorrente dos detalhes e,
depois, consultas de trackers.

Viabilidade: baixa no fork e moderada no upstream. A implementação original é
mais longa e duplicada; o upstream moveu lógica comum e pós-processamento para
arquivos compartilhados, mas continua dependente de HTML e convenções editoriais
sem contrato. O único teste do fork é focado no Comando e não constitui teste de
contrato completo.

## Componentes operacionais

### Requester, timeout e cancelamento

O contexto da requisição HTTP é propagado para as requisições de páginas. O fork
usa cliente HTTP com timeout fixo e FlareSolverr com timeout de 60 segundos. O
upstream torna configuráveis `REQUEST_TIMEOUT_MILLISECONDS` (5 s),
`FLARESOLVERR_TIMEOUT_SECONDS` (30 s) e o pool de sessões (5).

Não há um orçamento global claramente aplicado a toda a operação do indexer. Uma
requisição pode envolver busca, muitos detalhes, FlareSolverr e trackers. Os
trackers têm deadlines próprias, mas goroutines que tentam enviar para canais
sem buffer após retorno antecipado podem permanecer bloqueadas. Timeout e
cancelamento existem em partes do fluxo, não como garantia fim a fim.

### Concorrência

Posts, magnets e trackers são processados em goroutines. Não há limite explícito
para posts/magnets. A ordem final reflete a ordem de conclusão, não a ordem da
fonte. O helper `ParallelFlatMap` do upstream e o código equivalente do fork
podem enviar um erro e depois também um resultado para o mesmo item, enquanto o
coletor recebe apenas uma mensagem por entrada. Isso pode perder resultado e
deixar uma goroutine bloqueada. O upstream limita apenas sessões FlareSolverr
por pool.

### Redis e cache

Redis é iniciado pelo Compose e usado sem fallback local para páginas, entradas
manuais e dados de peers. O fork não suporta senha Redis e usa sete dias como
expiração padrão, 24 horas para peers e cache de páginas. O upstream aceita
`REDIS_PASSWORD`, separa cache curto (30 min) de páginas de busca e longo (7 dias)
de detalhes, ambos configuráveis. Chaves derivadas de URL e info hash podem
revelar hábitos/itens se Redis ou logs forem expostos.

### Docker, métricas e dependências

Ambos fornecem Dockerfile e Compose com aplicação + Redis. O upstream documenta
MeiliSearch e Magnet Metadata API opcionais; esta última é explicitamente
desaconselhada em clouds e não seria necessária para um cliente MIBR. Métricas
Prometheus ficam em porta separada, mas o Compose não configura autenticação,
TLS, healthcheck, limites de recursos ou persistência do Redis.

Dependências centrais: Go, goquery/Cascadia para HTML, go-edlib para similaridade,
go-redis e Prometheus. O upstream acrescenta zerolog, descompressão HTTP, parsing
de duração e integrações opcionais. O fork usa Go 1.22; o upstream, Go 1.24.1 com
toolchain 1.24.5.

### Segurança

- API sem autenticação, rate limit ou limite explícito de tamanho de resposta.
- `q` é escapado para a origem, mas continua permitindo induzir trabalho caro.
- rota manual aceita magnets e grava no Redis; não deveria ser exposta
  publicamente sem autenticação e limites.
- URLs de detalhes vêm do HTML externo e são requisitadas pelo servidor; faltam
  allowlist e validação robusta contra redirecionamento/SSRF.
- erros podem expor URLs e detalhes internos; logs incluem URLs e hashes.
- Redis/metrics não devem ser publicados externamente.
- dependência de FlareSolverr aumenta superfície e custo operacional.
- magnets, info hashes e trackers devem ser tratados como dados não confiáveis e
  potencialmente sensíveis.

## Comparação

| Critério | Fork | Upstream |
|---|---|---|
| Indexers | BluDV, Comando | BluDV, Comando, Rede Torrent, Starck Filmes, Torrent dos Filmes, Vaca Torrent |
| Manutenção | último commit em 2024; materialmente defasado | ativo até abril de 2026; correções frequentes de sites |
| Docker | app + Redis; imagem do fork; porta externa 8081 | app + Redis; opcionais MeiliSearch/magnet metadata documentados |
| Cache | Redis, configuração rígida, sem senha | Redis com senha e TTLs curto/longo configuráveis |
| API estável | baixa; sem versão/schema formal | baixa a moderada; mais filtros, mas sem versionamento/OpenAPI |
| Testes | 1 arquivo de teste | 4 arquivos; cobertura ainda limitada frente a 6 scrapers |
| Segurança | baixa; defaults rígidos e API aberta | baixa a moderada; timeouts/logs melhores, mas API aberta e scraping não confiável |
| Viabilidade | não recomendado | viável apenas self-hostado, isolado e endurecido |

## Avaliação de arquiteturas

Notas: 10 é melhor. Em `risco de quebra`, 10 significa menor risco.

| Arquitetura | Confiabilidade | Facilidade | Manutenção | Isolamento | Risco de quebra | Adequação |
|---|---:|---:|---:|---:|---:|---:|
| A. Consumir instância pública | 2 | 8 | 4 | 8 | 2 | 3 |
| B. Self-hostar upstream separado | 6 | 5 | 6 | 9 | 5 | 7 |
| C. Reimplementar no MIBR Addons | 4 | 2 | 2 | 3 | 3 | 3 |

Recomendação: **B**, se houver autorização jurídica/operacional para as fontes e
aceitação do custo contínuo. Um serviço separado preserva o isolamento de falhas,
permite fixar uma revisão auditada e mantém código GPL fora do processo Node. A
instância pública é declaradamente pessoal, sem disponibilidade garantida e pode
bloquear consumidores. Reimplementar scrapers no MIBR duplicaria fragilidade,
misturaria ciclos de release e ampliaria a superfície de segurança.

Mesmo na opção B, antes de integração seriam necessários: proxy/autenticação,
rate limiting, restrição de rotas, limites de concorrência/resposta, timeouts fim
a fim, healthchecks, observabilidade sem dados sensíveis, contrato JSON próprio e
testes com fixtures.

## Licença GPL-3.0

Esta seção é uma análise técnica, não aconselhamento jurídico.

- **Indexador modificado distribuído:** deve permanecer sob GPL-3.0, preservar
  avisos/licença e oferecer o código-fonte correspondente completo, inclusive as
  modificações e material necessário para construir/instalar a versão entregue.
- **Imagem Docker derivada distribuída:** distribuir a imagem é distribuir
  código objeto. Deve acompanhar uma forma compatível de obter o fonte
  correspondente daquela imagem, além da licença e avisos. O uso de container
  não muda a análise de obra combinada versus programas separados.
- **Somente serviço hospedado:** GPL-3.0, diferentemente da AGPL, em geral não
  obriga publicar modificações apenas porque usuários acessam o programa pela
  rede, enquanto não houver distribuição de cópias.
- **Cliente próprio via API HTTP:** um cliente escrito do zero, sem copiar ou
  vincular código GPL, comunicando-se por HTTP/JSON como processo separado é
  normalmente uma obra separada. A GPL do servidor não se transfere
  automaticamente ao cliente. Distribuir ambos juntos ainda exige cumprir a GPL
  para o indexador e apresentá-los claramente como componentes separados.

Referências: texto `LICENSE` dos dois projetos, [GPLv3](https://www.gnu.org/licenses/gpl-3.0.html)
e [FAQ oficial GNU GPL](https://www.gnu.org/licenses/gpl-faq.html), especialmente
as seções sobre agregação, comunicação entre programas, containers, fonte
correspondente e modificações usadas apenas em servidor.

Não foi copiado código dos projetos GPL para o MIBR Addons.

## Nyaa

O Nyaa oferece RSS público derivado de buscas. O padrão observado em documentação
pública usa a página de busca com `page=rss`, `q` (texto), `c` (categoria) e `f`
(filtro de confiança); filtros por usuário e ordenação podem variar conforme a
instância. RSS 2.0 normalmente contém título, link da página, data, categoria e
campos namespaced do Nyaa como torrent URL, magnet URI, tamanho, info hash,
seeders, leechers e downloads. Esses campos devem ser tratados como contrato de
feed comunitário, não como API oficial versionada.

Não foi encontrada uma API JSON oficial e estável. Um provider RSS isolado é
tecnicamente possível, com parser XML testado por fixtures, timeout, limite de
tamanho, allowlist de host e validação estrita. Porém ele ainda dependeria da
disponibilidade/política do site e exporia referências a torrents.

Nyaa é voltado a mídia do leste asiático e suas categorias distinguem traduções,
mas não provam idioma PT-BR. Termos como `dual`/`dub` não demonstram português
brasileiro: podem indicar inglês, espanhol ou outro idioma. Sem amostra oficial,
metadado de idioma inequívoco ou grupo PT-BR verificado, a evidência de PT-BR é
**não comprovada**. Não houve consulta ao feed nesta pesquisa.

## Conclusão

O upstream pode funcionar como serviço externo experimental, mas não deve ser
tratado como API confiável pronta para produção. O fork não é uma base adequada
devido à defasagem. Uma futura prova de conceito deveria consumir apenas um
gateway self-hostado do upstream, usando respostas capturadas autorizadas e um
adaptador defensivo no MIBR, sem incorporar código GPL nem registrar o serviço no
bootstrap padrão.
