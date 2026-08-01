# Laboratório self-host do torrent-indexer

Avaliação preparada em 31 de julho de 2026 e posteriormente executada no
docker-server. Nenhum indexador, tracker, torrent, magnet ou serviço público foi
consultado.

## Revisão upstream

- Repositório: <https://github.com/felipemarinho97/torrent-indexer>
- Branch consultada: `main`
- Commit fixado: `0ba84b16c63a4add68534d1abba7c21660a8e959`
- Data do commit: 2026-04-02 22:42:21 -03:00
- Título: `Fix/vacatorrent new format (#79)`
- Licença: GPL-3.0

Esse SHA continua sendo a ponta de `main` em 31 de julho de 2026. Foi escolhido
por ser a revisão atual auditada, incluir as correções recentes dos indexers e
coincidir com a base da pesquisa anterior. Não há divergência conhecida em
relação à branch principal atual nessa data. Qualquer avanço posterior de `main`
deverá gerar nova revisão e novo SHA do laboratório.

## Processo de build

O serviço usa o próprio Dockerfile do upstream por meio de contexto Git remoto:

```text
https://github.com/felipemarinho97/torrent-indexer.git#0ba84b16c63a4add68534d1abba7c21660a8e959
```

O build clona somente a revisão fixada, baixa módulos Go, compila um binário
estático e cria uma imagem Alpine. O primeiro build requer acesso ao GitHub,
registries das imagens-base e fontes dos módulos Go. O runtime do laboratório usa
uma rede Docker `internal` e não tem egress.

Limitação de reprodutibilidade: o Dockerfile upstream referencia `golang:1.24` e
`alpine:latest`, sem digest. O código da aplicação está fixado, mas as camadas de
base podem mudar. Corrigir isso exigiria manter um Dockerfile derivado; não foi
feito nesta milestone para evitar copiar/modificar código GPL no MIBR Addons.

## Containers e recursos configurados

| Container | Origem | CPU | Memória | PIDs | Restart |
|---|---|---:|---:|---:|---|
| `torrent-indexer` | build do SHA fixado | 0,50 | 256 MiB | 128 | `on-failure:3` |
| `redis` | `redis:7.4.2-alpine` | 0,25 | 128 MiB | 64 | `on-failure:3` |

Os limites são tetos configurados. No smoke test concluído, o snapshot de
recursos mostrou:

| Container | CPU observada | Memória observada | PIDs observados |
|---|---:|---:|---:|
| `redis` | 0,40% | 3,449 MiB | 6 |
| `torrent-indexer` | 0,00% | 3,328 MiB | 7 |

Esses valores são uma medição pontual do laboratório ocioso, não uma estimativa
de consumo durante consultas reais.

Ambos usam filesystem read-only, `tmpfs`, `no-new-privileges`, todas as Linux
capabilities removidas, healthcheck e período de encerramento. Não existem
containers privileged, Docker socket, host network ou volumes persistentes.

Redis roda como usuário `redis`. Seu `protected-mode` fica desabilitado apenas
para aceitar a aplicação na rede Docker; a compensação é a rede `internal` e a
ausência total de porta publicada. Essa configuração não é apropriada fora do
laboratório.

O binário upstream roda como root porque está armazenado em `/root/app` e a
imagem não declara `USER`. Forçar um UID não privilegiado sem alterar a imagem
pode impedir a execução. A limitação está documentada; `no-new-privileges`,
capabilities removidas e filesystem read-only reduzem, mas não eliminam, o risco.

## Rede, portas e volumes

- Rede: bridge própria `lab-internal`, marcada como `internal`.
- Aplicação no container: TCP `7006`.
- Métricas no container: TCP `8081`.
- Bindings no host: nenhum para aplicação, métricas ou Redis.
- Redis: TCP `6379` somente na rede Docker, sem publicação no host.
- Persistência: nenhuma; Redis usa `/data` em tmpfs e sem AOF/snapshots.
- Temporários da aplicação: `/tmp` em tmpfs.

No runtime observado, a rede `internal` funcionou e as portas anteriormente
declaradas no Compose não receberam bindings: `NetworkSettings.Ports` mostrou
somente `7006/tcp` e `8081/tcp` internos. Os bindings foram removidos do Compose
por serem desnecessários ao laboratório isolado.

## Configuração

O upstream não declara variáveis formalmente obrigatórias, mas `REDIS_HOST` é
operacionalmente necessário para cache e rotas que o utilizam. O laboratório
define:

- `PORT=7006`
- `METRICS_PORT=8081`
- `REDIS_HOST=redis`
- `LOG_LEVEL=1`
- `LOG_FORMAT=json`
- `REQUEST_TIMEOUT_MILLISECONDS=2000`
- caches curto/longo de 5 minutos e 1 hora
- pool FlareSolverr limitado a 1, sem endereço configurado
- fallback inseguro de título desabilitado
- Magnet Metadata API desabilitada

MeiliSearch, FlareSolverr e Magnet Metadata API não são implantados. Não há
credenciais reais ou placeholders que pareçam válidos.

A revisão fixada ainda tenta listar sessões de FlareSolverr quando nenhuma URL
foi configurada e registra `Failed to list existing FlareSolverr sessions` e
`Post "/v1": unsupported protocol scheme ""`. Não foi encontrada no código ou
na documentação dessa revisão uma variável oficial para desativar completamente
essa inicialização. O ruído é preservado e documentado; não foi adicionada URL
dummy, instância FlareSolverr ou egress.

## Logs

Com `LOG_FORMAT=json`, o upstream usa zerolog e deve emitir logs estruturados. Os
smoke tests procuram pares semelhantes a senha, token, secret ou cookie. Essa
checagem é apenas defensiva: URLs, queries, info hashes e erros de serviços podem
aparecer em logs se rotas reais forem usadas. Por isso o laboratório não chama
essas rotas e um deployment futuro precisaria de política explícita de redação.

## Endpoints seguros

Endpoints identificados como seguros para smoke test:

| Endpoint | Resultado esperado |
|---|---|
| `GET /` | `200`, JSON de descoberta com build, indexers e endpoints |
| `GET /search/health` | `503` e JSON válido sem MeiliSearch; `200` se futuramente configurado |
| `GET :8081/metrics` | `200`, formato Prometheus |

O health do container consulta somente o root local. O health de `/search/health`
com endereço MeiliSearch vazio falha na criação da requisição e não consulta uma
fonte externa.

O runtime final no docker-server confirmou o build do commit
`0ba84b16c63a4add68534d1abba7c21660a8e959`, Redis e torrent-indexer healthy,
rede `internal` ativa, zero bindings no host e `GET /` com HTTP `200`.
`GET /search/health` retornou HTTP `503` com JSON válido, resultado esperado sem
MeiliSearch. `GET /metrics` retornou HTTP `200` com conteúdo Prometheus válido.
Os logs não continham credenciais, o cleanup removeu containers e rede, e nenhum
endpoint de scraping ou indexação foi chamado.

## Endpoints deliberadamente não chamados

- `GET /indexers/bludv`
- `GET /indexers/comando_torrents`
- `GET /indexers/rede_torrent`
- `GET /indexers/starck-filmes`
- `GET /indexers/torrent-dos-filmes`
- `GET /indexers/vaca_torrent`
- `GET /search`
- `GET /search/stats`
- `GET|POST /indexers/manual`

As rotas `/indexers/*` podem fazer scraping e consultas de trackers. `/search`
e `/search/stats` dependem de MeiliSearch. A rota manual manipula magnets e Redis.

## Superfície de rede futura

Com buscas reais habilitadas e a rede deixando de ser `internal`, o serviço pode
tentar acessar:

- os seis sites de conteúdo configurados pelo upstream;
- trackers UDP presentes nos magnets e listas dinâmicas de trackers;
- FlareSolverr, se configurado;
- MeiliSearch, se configurado;
- Magnet Metadata API, se habilitada;
- GitHub/registries/proxies Go apenas durante o build.

Esses destinos não são necessários nem alcançáveis no runtime deste laboratório.

## Contrato versus documentação MIBR

Comparação com `docs/research/torrent-indexer.md` e
`docs/providers/torrent-indexer.md`:

- `/indexers/{indexer}` e os parâmetros do cliente permanecem coerentes com o
  código da revisão.
- O envelope esperado continua `results`, `count` e `indexed_count` opcional.
- Os itens continuam expondo metadata de descoberta, magnet/info hash e não uma
  URL HTTP/HTTPS de playback.
- O root lista `filme_torrent`, mas não existe handler correspondente registrado
  em `main.go`; isso é uma inconsistência documental do upstream.
- Não existe health geral da aplicação. `/search/health` mede apenas MeiliSearch.
- Paths desconhecidos podem cair no handler `/` do `http.ServeMux`, portanto um
  `200` não prova que uma rota específica existe.

Compatibilidade estimada com o cliente defensivo: **parcial**. O contrato de
indexer é compatível por inspeção, mas os endpoints de indexação não foram nem
serão exercitados neste laboratório e não há playback.

## Smoke tests e limpeza

Os scripts PowerShell e POSIX:

1. constroem e iniciam os dois containers;
2. confirmam containers em execução e `PONG` do Redis;
3. confirmam por `docker inspect` que nenhum dos containers possui porta publicada;
4. validam root, health MeiliSearch e métricas por `docker compose exec -T`,
   usando apenas loopback dentro do container; health aceita somente `200` ou
   `503` com JSON válido, e métricas exige `200` com texto Prometheus;
5. coletam um snapshot de `docker stats`;
6. examinam logs sem imprimir dados de resultados;
7. executam `docker compose down --remove-orphans` em bloco de limpeza.

Não são criados volumes nomeados. A imagem construída permanece no cache e pode
ser removida manualmente após revisão. Os scripts não removem imagens para evitar
uma operação destrutiva implícita.

## Riscos e recomendação

Riscos restantes:

- processo roda como root no container;
- imagens-base do Dockerfile upstream não são fixadas por digest;
- API sem autenticação/rate limit e sem health geral;
- dependência operacional de Redis;
- scrapers e trackers ampliam a superfície quando egress for habilitado;
- contrato não versionado;
- o consumo durante consultas reais permanece desconhecido e fora do escopo.

Recomendação: laboratório isolado **concluído e aprovado** para build, startup,
health, métricas, isolamento, observação de recursos e cleanup. Isso não aprova
consulta real a indexadores nem uso em produção. O serviço deve permanecer
interno, sem bootstrap e sem egress até aprovação específica para fontes reais;
debrid e playback continuam fora do escopo.
