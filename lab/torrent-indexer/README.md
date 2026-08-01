# Laboratório local do torrent-indexer

Ambiente descartável para avaliar o upstream sem integrar o serviço ao MIBR
Addons e sem consultar indexadores, trackers ou torrents.

## Revisão fixada

- Repositório: <https://github.com/felipemarinho97/torrent-indexer>
- Commit: `0ba84b16c63a4add68534d1abba7c21660a8e959`
- Data: 2026-04-02

O Compose usa o repositório Git remoto como contexto de build fixado no SHA. O
código GPL não é copiado para este repositório. O Dockerfile usado é o do próprio
upstream nessa revisão.

## Controles do laboratório

- rede bridge própria marcada como `internal`, sem egress no runtime;
- Redis acessível apenas dentro da rede e sem porta publicada;
- nenhuma porta da aplicação, das métricas ou do Redis publicada no host;
- filesystem read-only e `tmpfs` para `/tmp` e `/data`;
- todas as capabilities removidas e `no-new-privileges` habilitado;
- limites de CPU, memória e PIDs;
- healthchecks, init e restart apenas em caso de falha;
- nenhum Docker socket, host network, volume persistente ou credencial.

O Redis desativa `protected-mode` porque precisa aceitar a conexão do outro
container, mas roda como usuário `redis` e só existe na rede interna sem porta no
host. Não use esta configuração fora deste laboratório isolado.

O upstream executa o binário como root dentro da imagem e usa `golang:1.24` e
`alpine:latest` no Dockerfile. Como corrigir isso exigiria manter um Dockerfile
derivado GPL, esta milestone apenas documenta a limitação. O commit da aplicação
está fixado, mas as imagens-base do build não são reprodutíveis por digest.

## Validação estática

```sh
docker compose --env-file lab/torrent-indexer/.env.example \
  -f lab/torrent-indexer/compose.yml config
```

## Execução manual autorizada

O `.env.example` documenta que não há configuração de portas. Não adicione
secrets: nenhum serviço é publicado e o laboratório não configura autenticação.

PowerShell:

```powershell
./lab/torrent-indexer/scripts/smoke-test.ps1
```

POSIX shell:

```sh
./lab/torrent-indexer/scripts/smoke-test.sh
```

Os scripts constroem e sobem o ambiente, verificam containers, Redis e a ausência
de bindings via `docker inspect`; `/`, `/search/health` e `/metrics` são consultados
por `docker compose exec -T torrent-indexer`, dentro do container. As sondagens
capturam separadamente status e corpo por uma requisição HTTP interna, sem
depender de como `wget` trata respostas de erro. No shell POSIX, a validação
JSON requer `jq` ou `python3` no host. Também examinam logs por valores semelhantes a
credenciais, coletam um snapshot de `docker stats` e sempre executam
`docker compose down --remove-orphans`.

No primeiro teste no docker-server, o build terminou, ambos os containers ficaram
healthy e a rede `internal` impediu a publicação das portas declaradas. O smoke
test falhou porque dependia de `docker compose port`, que nessa versão retornou
`invalid IP:0`. Os recursos foram removidos pelo cleanup. A versão atual não usa
esse comando nem requer acesso pelo host.

Na execução seguinte no docker-server, o commit upstream fixado
`0ba84b16c63a4add68534d1abba7c21660a8e959` compilou com sucesso, Redis e
torrent-indexer ficaram healthy, não houve bindings no host, `GET /` retornou
`200` e `GET /search/health` retornou `503` porque MeiliSearch não estava
configurado. O cleanup terminou por completo e nenhum endpoint de scraping foi
chamado. O script anterior não conseguiu validar o JSON do `503` porque o `wget`
encerrou sem exibir o corpo; esta versão captura status e corpo diretamente.

Sem URL de FlareSolverr, o upstream registra `Failed to list existing
FlareSolverr sessions` e `Post "/v1": unsupported protocol scheme ""` durante a
inicialização. A revisão fixada não documenta uma variável oficial para desativar
completamente essa inicialização. O laboratório preserva o comportamento, sem
adicionar FlareSolverr, egress ou URL dummy.

Eles deliberadamente não chamam `/search`, `/indexers/*` ou `/indexers/manual`.

## Limpeza manual

```sh
docker compose --env-file lab/torrent-indexer/.env.example \
  -f lab/torrent-indexer/compose.yml down --remove-orphans
```

A imagem local `mibr-lab/torrent-indexer:0ba84b16c63a` permanece no cache Docker
até ser removida manualmente. Nenhum volume nomeado é criado.
