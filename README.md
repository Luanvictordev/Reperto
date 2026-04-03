# Repertório

Aplicativo desktop para montar, organizar e imprimir repertórios musicais com foco em uso simples no dia a dia.

## O que faz

- cria e salva repertórios localmente
- importa texto bruto e separa músicas por blocos
- permite editar blocos e músicas com drag and drop
- gera preview em A4
- exporta PDF
- abre impressão a partir de um PDF gerado pelo app

## Stack

- Tauri 2
- React + TypeScript + Vite
- Zustand
- SQLite local
- `@dnd-kit`
- `printpdf`

## Rodando em desenvolvimento

```bash
npm install
npm run tauri:dev
```

## Build

```bash
npm run tauri -- build
```

## Estrutura

```text
src/        frontend React
src-tauri/  backend Rust + empacotamento desktop
```

## Status

Projeto em desenvolvimento ativo. Feedback e contribuições são bem-vindos.
