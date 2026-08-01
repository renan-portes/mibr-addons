# Torrent candidate resolver

## Escopo

Esta milestone define somente o contrato offline entre um candidato já validado
do torrent-indexer e um resolver autorizado. Não há implementação de serviço
real, acesso a indexador, magnet, tracker, torrent ou debrid. O provider não é
registrado no bootstrap padrão e o manifest público não muda.

Nenhuma URL foi acessada ou reproduzida nesta milestone. O fake resolver existe
somente no suporte de testes, usa dados sintéticos e não realiza I/O de rede.

O contrato separa descoberta de resolução: o torrent-indexer fornece metadados
defensivamente parseados; um `TorrentCandidateResolver` injetado pode, quando a
feature estiver explicitamente habilitada, transformar um candidato selecionado
em `ResolvedTorrentCandidate | null`. O título de descoberta não faz parte da
entrada e não é necessário para resolver.

## Entrada

`TorrentCandidateResolutionRequest` é somente leitura e é congelado antes da
chamada. Ele contém:

- `infoHash` hexadecimal normalizado em minúsculas;
- `magnet` opcional, exclusivamente como dado interno do resolver;
- lista congelada de arquivos de vídeo com paths normalizados e tamanho em bytes
  quando o tamanho original puder ser validado;
- contexto mínimo de media (`type` e `id`);
- `AbortSignal` filho, ligado ao cancelamento do chamador e ao timeout local.

O resolver fake fica apenas no suporte de testes, não usa rede, oferece respostas
configuráveis e contabiliza chamadas. Os testes cobrem sucesso, `null`, erro,
timeout e cancelamento.

## Saída e política de URL

Uma resolução aceita contém URL HTTP ou HTTPS, origem não sensível, nome
sanitizado opcional, tamanho inteiro positivo opcional (zero é rejeitado) e
expiração futura opcional. O
provider converte somente essa saída validada em `StreamResult`.

São rejeitados:

- `magnet:`, `file:`, `ftp:`, `data:`, `javascript:` e qualquer esquema diferente
  de HTTP/HTTPS;
- usuário ou senha embutidos;
- `localhost`, subdomínios de `localhost`, IPv4 privados/especiais, IPv6 loopback,
  link-local, unique-local e endereços IPv4 mapeados em IPv6;
- nomes com controles ou separadores de path;
- tamanho inválido ou expiração vencida/malformada;
- cadeia de redirect vazia, com destino proibido ou cujo último hop não seja a
  URL final.

A política sintática é conservadora e determinística:

- query é permitida e preservada;
- fragmento é rejeitado;
- porta explícita é permitida quando o parser de URL a considera válida;
- hostname Unicode é convertido para punycode pelo parser e continua sujeito às
  mesmas regras de hostname e endereço;
- controles são rejeitados antes do parser de URL, inclusive quando ele poderia
  removê-los silenciosamente;
- formas alternativas de IPv4, `localhost` com ponto final e ranges privados,
  especiais ou de documentação são rejeitados.

O provider não segue redirects. Um resolver futuro que os siga deve devolver a
cadeia completa para validação. Como esta validação é deliberadamente offline,
ela não resolve DNS; uma integração real deverá validar o endereço resolvido em
cada conexão e redirect para impedir DNS rebinding e mudança para rede privada.
Isso não constitui proteção SSRF completa sem resolução DNS e validação de cada
hop no momento da conexão.

## Seleção determinística

Somente itens com IMDb correspondente e `infoHash` válido chegam ao resolver.
Hashes duplicados são descartados preservando a ordem original. Quando o item
declara arquivos, pelo menos um path relativo, seguro e com extensão de vídeo
plausível é obrigatório. Paths absolutos, traversal, segmentos vazios, controles
e paths de drive são rejeitados. Paths são tratados como texto já normalizado:
qualquer `%` é rejeitado, sem decode ou encaminhamento de percent-encoding.
Double encoding, UNC, barras invertidas, separadores Unicode confundíveis e
segmentos terminados em ponto ou espaço também são rejeitados. O limite de
aceitação é de 100 arquivos; acima disso, o candidato inteiro é descartado sem
copiar ou encaminhar um subconjunto. Arquivos identificados deterministicamente como `sample` ou
`trailer` pelo basename são evitados; um item que contenha somente esses arquivos
não é enviado ao resolver.

O limite padrão é três candidatos e o máximo configurável é dez. A seleção e a
resolução são sequenciais, preservam a ordem original e param no primeiro sucesso
válido. Duplicatas usam o primeiro candidato válido depois de normalizar o hash.
Seeders, leechers, título e trackers não participam da decisão de segurança.

`null` significa ausência legítima de resolução e continua para o próximo
candidato. Erro do resolver é isolado e também continua. Timeout individual
(cinco segundos por padrão, máximo configurável de 60 segundos) aborta o signal
filho e continua mesmo se o resolver não cooperar; respostas ou rejeições tardias
são ignoradas com segurança. Cancelamento global aborta o filho, interrompe todo
o fluxo e não é convertido em timeout ou resultado vazio.

Em qualquer disputa, o cancelamento global é revalidado antes da validação e de
qualquer emissão, independentemente do primeiro evento observado pela race.

## Feature flag e compatibilidade

`TorrentIndexerResolutionOptions.enabled` tem padrão `false`. Um resolver
injetado sem `enabled: true` não é chamado. Sem resolver ou sem ativação explícita,
o comportamento permanece discovery-only e retorna `[]`. Se `enabled: true` for
configurado sem um resolver, o provider retorna `[]` antes de buscar candidatos.

`StreamProvider`, `StreamResult`, `ProviderManager`, `StreamService`, endpoints,
bootstrap e manifest permanecem inalterados. Não existe configuração operacional,
segredo ou serviço externo nesta milestone. Conteúdo real e playback continuam
fora do escopo.

Uma integração real exigirá autenticação obrigatória do resolver, rate limiting,
timeouts operacionais, sanitização de logs e erros, validação DNS/anti-rebinding
no momento da conexão e validação de todos os redirects por hop. Nenhum debrid,
magnet, torrent, conteúdo real ou playback foi acessado ou validado aqui.
