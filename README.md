# mibr-addons

Addon de mídia compatível com o protocolo de addons do Stremio, com arquitetura modular e providers independentes.

## Requisitos

- Node.js 24 LTS ou superior
- npm

## Executar localmente

Instale as dependências:

```bash
npm install
```

Desenvolvimento com reload:

```bash
npm run dev
```

Build e execução:

```bash
npm run build
npm start
```

Por padrão o servidor escuta na porta `7000`. Para alterar:

```bash
# Linux/macOS
PORT=8080 npm start

# Windows PowerShell
$env:PORT=8080; npm start
```

## Endpoints

- `GET /manifest.json` — manifest do addon Stremio
- `GET /stream/:type/:id.json` — streams mock para testes (`movie` ou `series`, ids com prefixo `tt`)

## Testar no Stremio

1. Inicie o servidor localmente.
2. No Stremio, adicione o addon pela URL: `http://127.0.0.1:7000/manifest.json`
3. Abra um filme ou série com id IMDb (`tt...`) e verifique os streams mock retornados.

## Testes

```bash
npm test
npm run typecheck
```
