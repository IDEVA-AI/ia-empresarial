# IA Empresarial

Site institucional estatico para consultoria empresarial em inteligencia artificial.

## Publicacao

O projeto e um site HTML/CSS/JS estatico. Abra `index.html` localmente ou publique a pasta em qualquer hospedagem estatica.

## Banco de clientes

O cadastro de clientes usa uma API serverless da Vercel em `api/clientes.js` e requer um banco Postgres.

Configure estas variaveis no projeto da Vercel:

- `DATABASE_URL`: string de conexao Postgres, como Supabase, Neon ou Vercel Postgres.
- `ADMIN_TOKEN`: token privado usado pela tela `clientes.html` para acessar a API.

A API cria automaticamente a tabela `clientes` no primeiro acesso.
