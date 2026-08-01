# Internet Archive Provider

Provider experimental para filmes públicos do Internet Archive. Ele não usa scraping, autenticação,
torrents ou endpoints privados.

## APIs oficiais

- Advanced Search: `GET https://archive.org/advancedsearch.php`, com `output=json`, `q`, `fl[]`,
  `rows` e `page`. A busca inicial restringe `mediatype:movies` e procura uma correspondência exata
  de `external-identifier` no formato experimental `urn:imdb:tt...`.
- Metadata Read: `GET https://archive.org/metadata/{identifier}`. A resposta contém metadados do
  item em `metadata` e metadados de arquivos em `files`.
- Download arquivístico: `https://archive.org/download/{identifier}/{filename}`. Essa URL estável é
  usada em vez dos hosts de armazenamento numerados, que podem mudar.

Documentação oficial consultada:

- https://archive.org/advancedsearch.php
- https://archive.org/developers/metadata.html
- https://archive.org/developers/md-read.html
- https://archive.org/developers/metadata-schema/index.html
- https://archive.org/developers/items.html
- https://archive.org/developers/internetarchive/cli.html

## Formato esperado

A busca deve retornar `response.docs[]` com `identifier`, `title`, `mediatype` e
`external-identifier`. O metadata deve conter `metadata.identifier`, `metadata.title`,
`metadata.mediatype`, `metadata.external-identifier`, `metadata.licenseurl` e `files[]`. Para arquivos
são usados `name`, `format`, `source`, `width`, `height` e `size` quando disponíveis.

A correspondência `urn:imdb:{id}` deve estar presente tanto no resultado de busca quanto no metadata
atual do item. Em ambos os endpoints o campo pode ser uma string ou uma coleção de strings.

## Seleção de arquivos

- somente itens com `mediatype=movies` e uma das seguintes declarações oficiais:
  - `http[s]://[www.]creativecommons.org/publicdomain/mark/1.0[/]`;
  - `http[s]://[www.]creativecommons.org/publicdomain/zero/1.0[/]`;
  - as mesmas URLs seguidas por uma página oficial `deed` ou `deed.<locale>`, com trailing slash
    opcional;
- somente MP4 com formato MPEG4/H.264 ou WebM identificado como WebM;
- tamanho mínimo padrão de 1 MiB (`1.048.576` bytes), configurável no construtor;
- arquivos sem `size` numérico válido são descartados, pois não podem ser validados com segurança;
- preferência por MP4, seguida de WebM;
- dentro do mesmo formato, preferência por maior altura, largura e tamanho declarado;
- thumbnails, metadata, legendas, torrents e formatos desconhecidos são ignorados;
- nomes absolutos, traversal (`..`) ou nomes que já pareçam URLs são rejeitados;
- arquivos e URLs duplicados são removidos.

## Limitações

- somente `MediaType="movie"`; séries retornam lista vazia sem acessar a API;
- o Internet Archive não oferece uma garantia geral de cobertura IMDb. O provider só aceita a
  convenção exata `urn:imdb:{id}` presente no metadata de busca e nunca faz fallback por título;
- um item encontrado ainda é descartado se o metadata não confirmar filme, identificador,
  declaração de domínio público e arquivo reproduzível;
- sem cache ou retry; falhas são isoladas pelo `ProviderManager` quando usado no pipeline normal;
- o provider não é registrado no bootstrap e permanece experimental.

Exemplo de busca, sem depender de um item real:

```text
q=external-identifier:"urn:imdb:tt0000001" AND mediatype:movies
fl[]=identifier&fl[]=title&fl[]=mediatype&fl[]=external-identifier&output=json
```
