# Agent Guidelines

Regras para desenvolvimento neste repositório:

- **Providers independentes** — cada provider deve ser autocontido e não depender de implementações internas de outros providers.
- **Isolamento de falhas** — a falha de um provider não pode derrubar os demais; erros devem ser tratados e isolados por provider.
- **Separação de responsabilidades** — parsing deve ficar separado da obtenção dos dados (fetch/scrape/download).
- **Sem secrets no repositório** — nunca armazenar credenciais, tokens ou secrets no código ou em arquivos versionados; usar variáveis de ambiente localmente.
- **Testabilidade** — novas integrações devem ser testáveis isoladamente, sem acoplar testes a múltiplos providers ao mesmo tempo.
- **Dependências mínimas** — evitar dependências desnecessárias; preferir soluções nativas ou bibliotecas essenciais e bem justificadas.

## Fluxo de Trabalho e Produção

### 1. Escopo e Implementação
- Trabalhar estritamente com base em escopos bem definidos e arquivos autorizados.
- **Desenvolvimento Pragmático/Lean**: Implementar o mínimo necessário → validar o fluxo real → corrigir bloqueadores reais → endurecer o código posteriormente.

### 2. Estratégia de Branching
- Usar **feature branches** (`feature/<nome-da-feature>`) para mudanças funcionais maiores. Manter a `master` sempre estável.
- Estrutura: `master` ➔ `feature/<nome>` (implementação/testes/validação) ➔ `merge` ➔ `master`.
- **Merge**: Fazer merge explícito após validação. Em caso de conflito, parar e reportar ao operador sem resolver automaticamente.

### 3. Suíte de Validação Pré-Commit
Antes de realizar qualquer commit, executar rigorosamente no ambiente local:
1. Testes unitários/integrados relevantes (`npm test`).
2. Build de produção (`npm run build`).
3. Checagem de tipos (`npm run typecheck`).
4. Verificação de formatação/diff (`git diff --check`).
5. Status do repositório (`git status` — verificar se apenas os arquivos autorizados foram modificados).

### 4. Commit e Push
- `git add` seletivo apenas nos arquivos explicitamente autorizados/esperados.
- Commits pequenos, atômicos e focados.
- Em caso de falha de conexão no push, reportar ao operador.

### 5. Documentação pós-Validação Real
- Quando uma validação real no ambiente (ex: Docker/LXC) for concluída, criar commits **separados** dedicados exclusivamente à documentação (`CHANGELOG.md`, `ROADMAP.md`, `README.md`, etc.), mantendo código e evidências operacionais isolados.
