# Backend Aguiar

API do catálogo, loja e geração de PDF.

## Banco de dados

- **Sem `DATABASE_URL`**: usa **SQLite** em `data/catalog.db` (desenvolvimento/local).
- **Com `DATABASE_URL`**: usa **PostgreSQL** (ex.: Supabase em produção).

### Migração para Supabase (PostgreSQL)

1. Crie um projeto no [Supabase](https://supabase.com) e copie a **Connection string** (URI) em *Settings → Database*.
2. No Railway (ou seu host), defina a variável de ambiente:
   ```bash
   DATABASE_URL=postgresql://postgres.[ref]:[senha]@aws-0-[regiao].pooler.supabase.com:6543/postgres?sslmode=require
   ```
3. Na primeira subida, o backend cria as tabelas (`products`, `settings`, `orders`) automaticamente no Postgres.
4. Se você já tem dados no SQLite e quer levá-los para o Supabase, use um script de migração de dados (export/import) ou migre manualmente; o schema é compatível.

## Variáveis de ambiente

| Variável | Uso |
|----------|-----|
| `PORT` | Porta do servidor (padrão 4000). |
| `DATABASE_URL` | URI do PostgreSQL; se definida, usa Postgres em vez de SQLite. |
| `DB_DIR` / `DB_PATH` | Caminho do SQLite (só quando `DATABASE_URL` não está definida). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Envio de e-mail (notificação de pedidos). |
| `ORDER_NOTIFY_TO` | Destinatário do e-mail de pedido (opcional). |

Copie `.env.example` para `.env` e preencha conforme o ambiente.
