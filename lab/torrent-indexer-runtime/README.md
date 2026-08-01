# Laboratório de contrato runtime do torrent-indexer

Variante manual e descartável para executar exatamente uma consulta controlada
e comparar o envelope JSON real com `TorrentIndexerParser`. Ela não substitui nem
modifica o laboratório isolado em `lab/torrent-indexer/`.

## Escopo fixado

- upstream: `felipemarinho97/torrent-indexer`;
- commit: `0ba84b16c63a4add68534d1abba7c21660a8e959`;
- indexer: `bludv`;
- termo autorizado: `Big Buck Bunny`, curta licenciado para redistribuição;
- limite fixo: 1 resultado; qualquer outro valor é rejeitado;
- timeout global fixo da consulta: 20 segundos; qualquer outro valor é rejeitado;
- resposta máxima fixa: 1 MiB; qualquer outro valor é rejeitado;
- tentativas: exatamente uma, sem retry.

Zero resultados é um resultado válido e deve ser registrado sem uma segunda
consulta. Não substitua o termo por obra comercial e não execute buscas em massa.

## Isolamento e egress

Redis e torrent-indexer não publicam portas no host. O serviço é acessado somente
com `docker compose exec`. A rede bridge `runtime-contract` permite egress
exclusivamente porque a consulta aprovada precisa alcançar o indexer; ela não é
`internal`, ao contrário do laboratório puramente isolado.

Os containers mantêm filesystem read-only, tmpfs, limites de CPU/memória/PIDs,
`no-new-privileges` e todas as capabilities removidas. Não há privileged, Docker
socket, host network, volumes persistentes, credenciais ou exposição pública.

## Execução manual

1. Revise este documento e os scripts.
2. Copie `.env.example` para `.env`.
3. Altere somente `CONTRACT_TEST_AUTHORIZED=false` para `true`.
4. Execute um dos scripts uma única vez:

```sh
./lab/torrent-indexer-runtime/scripts/contract-test.sh
```

```powershell
./lab/torrent-indexer-runtime/scripts/contract-test.ps1
```

O script rejeita termo, indexer, limite, timeout e tamanho fora da política. Ele
confirma zero bindings, realiza uma única requisição HTTP dentro do container e
registra somente código, duração, tamanho e relatório sanitizado.

Códigos de saída:

- `0`: contrato validado com pelo menos um resultado;
- `1`: falha técnica, de configuração, timeout, HTTP, tamanho ou parsing;
- `2`: validação parcial porque a resposta válida teve zero resultados.

O código `2` encerra sem trocar termo/indexer e sem segunda consulta. Cleanup é
executado para os três códigos e também em `INT`/`TERM`.

O JSON bruto e a resposta HTTP existem apenas em arquivos temporários. A
ferramenta TypeScript reutiliza `TorrentIndexerParser`, informa itens aceitos e
rejeitados, chaves, tipos e valores vazios, e apaga o JSON em `finally`. O cleanup
do script também remove todos os temporários, containers e rede em sucesso ou
falha.

## Dados que nunca devem aparecer

O relatório não inclui valores de títulos, `magnet_link`, `info_hash`, trackers,
arquivos, detalhes ou URLs. O script não segue campos da resposta, não abre
magnets, não consulta trackers manualmente e não baixa torrent ou vídeo.

Os logs do upstream são deliberadamente não exibidos durante a consulta para
evitar que metadata ou partes do payload sejam reveladas no terminal.

Não publique `.env`, payloads temporários ou saídas brutas. Não redirecione a
resposta para arquivos dentro do repositório.
