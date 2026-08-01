# Diagnóstico A/B de inicialização do FlareSolverr

Este laboratório investiga somente o start do FlareSolverr e seu teste interno
do Chromium. Ele não contém torrent-indexer, não faz `POST /v1`, não acessa BluDV
ou outro indexer e não publica portas. Cada execução usa um projeto e uma rede
Docker descartáveis, espera no máximo 120 segundos e executa cleanup ao sair.

Execute exatamente um cenário por vez:

```sh
sh ./lab/torrent-indexer-runtime/diagnostics/run-scenario.sh A
```

Ordem condicional:

1. Execute `A`, imagem oficial sem hardening adicional.
2. Se `A` funcionar, execute `B`, derivada read-only sem `cap_drop` e com
   `no-new-privileges`.
3. Se `B` funcionar, execute `C-cap-drop` para recolocar somente `cap_drop: ALL`.
4. Se `B` falhar, execute `C-no-nnp` para retirar somente
   `no-new-privileges` em relação a `B`.
5. Execute `D` somente se ainda for necessário isolar `read_only`; ele mantém o
   usuário não-root, não adiciona capabilities e conserva
   `no-new-privileges`.

O resumo contém apenas cenário, start, resultado do teste interno do browser,
resposta interna da API, status, exit code, duração, `RestartCount` e categoria
provável. Evidências de suporte ficam em um diretório temporário informado no
resumo: logs de inicialização (incluindo stderr disponível), `docker inspect`,
lista de processos e `/proc/<pid>/status` dos processos Chromium/ChromeDriver.
Revise-as localmente e remova o diretório após registrar o resultado sanitizado.

O executor não habilita restart automático; assim cada cenário representa uma
única inicialização e `RestartCount` deve permanecer zero. Não execute os
scripts de contrato ou qualquer requisição de conteúdo durante este diagnóstico.
