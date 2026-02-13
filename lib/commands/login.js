/**
 * Comando `fabroku login` — Autenticação via GitHub OAuth.
 *
 * Abre o browser, recebe o token via servidor HTTP local.
 */

import { createServer } from "node:http";
import { URL } from "node:url";
import chalk from "chalk";
import open from "open";

import {
  clearCredentials,
  getApiUrl,
  isAuthenticated,
  setCredentials,
} from "../config.js";

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function htmlPage(title, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;justify-content:center;
  align-items:center;min-height:100vh;margin:0;background:#1a1a2e;color:#eee}
  div{text-align:center;padding:2rem}
  h1{margin-bottom:1rem}
</style></head>
<body><div>${body}</div></body></html>`;
}

export async function login(options) {
  if (isAuthenticated()) {
    const readline = await import("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await new Promise((resolve) => {
      rl.question(
        "Você já está autenticado. Deseja fazer login novamente? (s/N) ",
        resolve,
      );
    });
    rl.close();
    if (answer.toLowerCase() !== "s") return;
  }

  const baseUrl = options.apiUrl || getApiUrl();
  const port = await findFreePort();
  const loginUrl = `${baseUrl}/api/auth/cli/login/?port=${port}`;

  console.log(`\n🔐 Abrindo browser para autenticação...`);
  console.log(`   URL: ${chalk.dim(loginUrl)}`);
  console.log(`   Aguardando callback na porta ${port}...\n`);

  // Abre o browser
  await open(loginUrl);

  // Servidor local que espera o callback
  return new Promise((resolve) => {
    const connections = new Set();

    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname === "/callback") {
        const token = url.searchParams.get("token");
        const user = url.searchParams.get("user");
        const error = url.searchParams.get("error");
        const message = url.searchParams.get("message");

        if (token) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            htmlPage(
              "Fabroku CLI — Autenticado",
              "<h1>✅ Login realizado com sucesso!</h1><p>Pode fechar esta janela e voltar para o terminal.</p>",
            ),
          );

          setCredentials(token, user || "unknown", baseUrl);
          console.log(`✅ Autenticado como ${chalk.green.bold(user)}`);
          console.log(`   Token salvo em ~/.fabroku/config.json\n`);

          shutdown();
          resolve();
        } else {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            htmlPage(
              "Fabroku CLI — Erro",
              `<h1>❌ Erro na autenticação</h1><p>${message || error || "Erro desconhecido"}</p>`,
            ),
          );

          console.log(
            chalk.red(`❌ Erro: ${error}: ${message || "Erro desconhecido"}`),
          );

          shutdown();
          resolve();
        }
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(htmlPage("Fabroku CLI", "<p>Aguardando callback...</p>"));
      }
    });

    // Rastreia conexões para poder destruí-las ao encerrar
    server.on("connection", (socket) => {
      connections.add(socket);
      socket.on("close", () => connections.delete(socket));
    });

    function shutdown() {
      clearTimeout(timer);
      server.close();
      for (const socket of connections) socket.destroy();
    }

    server.listen(port);

    // Timeout de 2 minutos
    const timer = setTimeout(() => {
      console.log(
        chalk.red("❌ Timeout: autenticação não foi concluída em 2 minutos."),
      );
      shutdown();
      resolve();
    }, 120_000);
  });
}

export function logout() {
  if (!isAuthenticated()) {
    console.log("Você não está autenticado.");
    return;
  }
  clearCredentials();
  console.log("👋 Sessão encerrada com sucesso.");
}
