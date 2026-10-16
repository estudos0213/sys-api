# sys-api

Monólito modular NestJS com PostgreSQL, Drizzle ORM, autenticação JWT com `@nestjs/jwt` e isolamento de tenants por RLS. O login recebe somente email e senha. O tenant vem do cadastro do usuário e é incluído no JWT assinado; as rotas de notas obtêm `tenantId` exclusivamente desse token.

## Rodar localmente

Requisitos: Node.js 20 ou superior, npm e Docker com Compose.

```bash
cp .env.example .env
npm ci
```

Gere um segredo e salve o resultado em `JWT_SECRET` no arquivo `.env`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

A aplicação exige um segredo com pelo menos 32 bytes. Depois:

```bash
docker compose up -d --wait
npm run db:migrate
npm run build
npm run typecheck
npm test
```

## Criar um usuário

O provisionamento usa `MIGRATION_DATABASE_URL`, com a role administrativa. Não há cadastro público: o tenant é atribuído pelo administrador ao criar a conta. Emails são normalizados para minúsculas e são únicos globalmente, pois o login não recebe um tenant.

Após o build, execute em um terminal Bash:

```bash
read -rs -p 'Senha do novo usuário: ' USER_PASSWORD
export USER_PASSWORD
USER_EMAIL=alice@example.com \
USER_TENANT_ID=11111111-1111-4111-8111-111111111111 \
npm run user:create
unset USER_PASSWORD
```

A senha deve ter de 1 a 128 caracteres e é armazenada como hash scrypt com salt aleatório. O comando exibe somente ID, email e tenant. Para mais usuários do mesmo tenant, repita com o mesmo UUID; para outro tenant, use outro UUID.

```bash
npm run start:dev
```

## Login e CRUD

```bash
curl -sS -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","password":"sua senha"}'
```

A resposta contém `access_token`, `token_type: "Bearer"`, `expires_in: 3600` e `user: { id, email, tenantId }`. A senha e seu hash nunca são retornados. Credenciais incorretas retornam `401`; enviar `tenantId` ou outros campos extras no login retorna `400`.

Copie o `access_token` para `TOKEN`:

```bash
TOKEN='cole o access_token aqui'
curl -sS -X POST http://localhost:3000/notes \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Primeira nota"}'
curl -sS http://localhost:3000/notes -H "Authorization: Bearer $TOKEN"
```

Use `GET /notes/:id`, `PATCH /notes/:id` com `{"title":"Novo título"}` e `DELETE /notes/:id` para as demais operações. O identificador precisa ser um UUID. A API retorna `404` para um ID de outro tenant e `401` quando falta um token válido. `x-tenant-id` é ignorado e não altera o tenant autenticado.

Os tokens usam HS256, issuer e audience `sys-api` e expiram em uma hora. Após expirar, faça login novamente. Alterações no tenant ou na senha de uma conta não revogam tokens já emitidos; eles mantêm sua validade até expirar. Trocar `JWT_SECRET` invalida os tokens anteriores.

## Contexto do tenant e RLS

1. `POST /auth/login` consulta a tabela de credenciais `users` pelo email e verifica a senha antes de conhecer o tenant autenticado. A role `app_user` pode somente ler essa tabela; o provisionamento usa a role administrativa.
2. `JwtAuthGuard` valida assinatura, algoritmo, expiração, issuer, audience e os identificadores do JWT. Depois define `request.user` e `request.tenantId` com os claims verificados.
3. `@TenantId()` passa o tenant autenticado ao serviço. Cada operação abre uma transação e executa uma consulta parametrizada equivalente a:

   ```sql
   SELECT set_config('app.tenant_id', $1, true);
   ```

4. As consultas de notas usam a mesma transação. A policy `notes_tenant_isolation`, declarada com `pgPolicy` em `src/database/schema.ts`, exige o tenant ativo tanto em `USING` quanto em `WITH CHECK`:

   ```sql
   tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
   ```

O parâmetro `true` mantém o contexto somente até o commit ou rollback, evitando vazamento entre conexões reutilizadas pelo pool. Sem contexto, o PostgreSQL oculta notas e rejeita inserções. A migration também aplica `FORCE ROW LEVEL SECURITY` e cria um índice em `(tenant_id, created_at)`. Preserve uma role de aplicação sem privilégios de superusuário ou `BYPASSRLS`, separada da role de migração. A migration de permissões usa a role `app_user` criada pelo ambiente local; adapte o nome para outra role de implantação.

## Verificação

`npm test` executa testes de integração com o PostgreSQL local já iniciado e migrado. Eles criam contas temporárias, fazem login, verificam credenciais e tokens inválidos, exercitam o CRUD entre dois tenants e requisições simultâneas, e validam o RLS diretamente no banco. Também verificam a rejeição de alterações de tenant, a limpeza do contexto após commit e rollback e as permissões da tabela de credenciais. Os dados criados pelo teste são removidos ao terminar.

O banco do Compose usa um volume persistente. Use `docker compose down` para parar; `down -v` remove os dados. O script `docker/init.sql` cria a role de aplicação apenas na primeira inicialização do volume. As senhas do PostgreSQL em `compose.yaml` e `.env.example` servem somente ao ambiente local.
