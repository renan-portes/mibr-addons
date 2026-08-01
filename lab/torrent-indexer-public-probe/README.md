# Sondagem pública do torrent-indexer

Ferramenta manual para observar um único indexer da instância oficial
`https://torrent-indexer.darklyn.org` por execução. Ela não altera nem substitui
os laboratórios self-host existentes.

Escolha explicitamente um destes valores: `comando_torrents`, `bludv`,
`torrent-dos-filmes`, `rede_torrent`, `vaca_torrent` ou `starck-filmes`.

```sh
./lab/torrent-indexer-public-probe/scripts/probe.sh bludv
```

```powershell
./lab/torrent-indexer-public-probe/scripts/probe.ps1 bludv
```

Cada invocação executa exatamente uma requisição, sem retry, para
`/indexers/{indexer}?q=Big+Buck+Bunny&filter_results=true&limit=1`, com timeout
de 20 segundos e limite de 1 MiB. Para sondar outro indexer, o operador precisa
executar novamente o script e confirmar conscientemente a nova chamada.

O payload existe somente em memória. A saída contém apenas indexer, HTTP,
duração, tamanho, validade JSON, `count`, `indexed_count`, quantidade de resultados
e uma categoria. Títulos, magnets, hashes, trackers, files, URLs e payload bruto
nunca são impressos ou persistidos.

As categorias são `OK_RESULT`, `OK_ZERO_RESULTS`, `HTTP_ERROR`, `TIMEOUT`,
`INVALID_JSON` e `RESPONSE_TOO_LARGE`. Falha de transporte sem resposta usa HTTP
`null`; status e bytes já observados são preservados. Nenhuma categoria causa
retry.
