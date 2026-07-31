# Agent Guidelines

Regras para desenvolvimento neste repositório:

- **Providers independentes** — cada provider deve ser autocontido e não depender de implementações internas de outros providers.
- **Isolamento de falhas** — a falha de um provider não pode derrubar os demais; erros devem ser tratados e isolados por provider.
- **Separação de responsabilidades** — parsing deve ficar separado da obtenção dos dados (fetch/scrape/download).
- **Sem secrets no repositório** — nunca armazenar credenciais, tokens ou secrets no código ou em arquivos versionados; usar variáveis de ambiente localmente.
- **Testabilidade** — novas integrações devem ser testáveis isoladamente, sem acoplar testes a múltiplos providers ao mesmo tempo.
- **Dependências mínimas** — evitar dependências desnecessárias; preferir soluções nativas ou bibliotecas essenciais e bem justificadas.
