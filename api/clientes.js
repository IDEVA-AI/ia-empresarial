import pg from "pg";

const { Pool } = pg;

let pool;
let ready;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL nao configurada.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
}

async function ensureSchema() {
  if (!ready) {
    ready = getPool().query(`
      create table if not exists clientes (
        id uuid primary key default gen_random_uuid(),
        nome text not null,
        empresa text not null,
        email text not null,
        telefone text,
        segmento text,
        responsavel text,
        status text not null default 'lead',
        observacoes text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists clientes_created_at_idx on clientes (created_at desc);
      create index if not exists clientes_status_idx on clientes (status);
    `);
  }

  return ready;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function authorize(req) {
  const configuredToken = process.env.ADMIN_TOKEN;
  if (!configuredToken) {
    return { ok: false, status: 503, error: "ADMIN_TOKEN nao configurado na Vercel." };
  }

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (token !== configuredToken) {
    return { ok: false, status: 401, error: "Acesso nao autorizado." };
  }

  return { ok: true };
}

function validateCliente(body) {
  const required = ["nome", "empresa", "email"];
  const missing = required.filter((key) => !String(body[key] || "").trim());

  if (missing.length) {
    return `Campos obrigatorios ausentes: ${missing.join(", ")}.`;
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const auth = authorize(req);
  if (!auth.ok) {
    send(res, auth.status, { error: auth.error });
    return;
  }

  try {
    await ensureSchema();
    const db = getPool();

    if (req.method === "GET") {
      const { rows } = await db.query(`
        select id, nome, empresa, email, telefone, segmento, responsavel, status, observacoes, created_at, updated_at
        from clientes
        order by created_at desc
      `);
      send(res, 200, { clientes: rows });
      return;
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const error = validateCliente(body);
      if (error) {
        send(res, 400, { error });
        return;
      }

      const { rows } = await db.query(
        `
          insert into clientes (nome, empresa, email, telefone, segmento, responsavel, status, observacoes)
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning *
        `,
        [
          body.nome.trim(),
          body.empresa.trim(),
          body.email.trim(),
          body.telefone?.trim() || null,
          body.segmento?.trim() || null,
          body.responsavel?.trim() || null,
          body.status?.trim() || "lead",
          body.observacoes?.trim() || null,
        ],
      );

      send(res, 201, { cliente: rows[0] });
      return;
    }

    if (req.method === "PATCH") {
      const body = await readJson(req);
      if (!body.id) {
        send(res, 400, { error: "ID do cliente e obrigatorio." });
        return;
      }

      const { rows } = await db.query(
        `
          update clientes
          set status = coalesce($2, status),
              responsavel = coalesce($3, responsavel),
              observacoes = coalesce($4, observacoes),
              updated_at = now()
          where id = $1
          returning *
        `,
        [body.id, body.status || null, body.responsavel || null, body.observacoes || null],
      );

      if (!rows[0]) {
        send(res, 404, { error: "Cliente nao encontrado." });
        return;
      }

      send(res, 200, { cliente: rows[0] });
      return;
    }

    if (req.method === "DELETE") {
      const body = await readJson(req);
      if (!body.id) {
        send(res, 400, { error: "ID do cliente e obrigatorio." });
        return;
      }

      await db.query("delete from clientes where id = $1", [body.id]);
      send(res, 200, { ok: true });
      return;
    }

    send(res, 405, { error: "Metodo nao permitido." });
  } catch (error) {
    send(res, 500, { error: error.message || "Erro interno." });
  }
}
