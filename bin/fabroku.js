#!/usr/bin/env node

/**
 * 🚀 Fabroku CLI — Ferramenta de deploy para o Fabroku
 *
 * Instalação:  npm i -g fabroku
 * Uso:         fabroku <comando> [opções]
 */

import { Command } from "commander";

import { login, logout } from "../lib/commands/login.js";
import { verify } from "../lib/commands/verify.js";
import { apps } from "../lib/commands/apps.js";
import { whoami } from "../lib/commands/whoami.js";
import { deploy } from "../lib/commands/deploy.js";
import { webhook } from "../lib/commands/webhook.js";

const program = new Command();

program
  .name("fabroku")
  .description("🚀 Fabroku CLI — Ferramenta de deploy para o Fabroku")
  .version("0.1.4");

// ---- login ----
program
  .command("login")
  .description("Autenticar na plataforma Fabroku via GitHub")
  .option("--api-url <url>", "URL base da API Fabroku")
  .action(async (options) => {
    await login({ apiUrl: options.apiUrl });
  });

// ---- logout ----
program
  .command("logout")
  .description("Encerrar a sessão da CLI")
  .action(() => logout());

// ---- verify ----
program
  .command("verify")
  .description("Verificar se o projeto tem os arquivos necessários para deploy")
  .option("-d, --dir <path>", "Diretório do projeto", ".")
  .option("-t, --type <type>", "Tipo da aplicação (frontend ou backend)")
  .option("--fix", "Gerar arquivos faltantes automaticamente")
  .action((options) => {
    const code = verify(options);
    if (code) process.exit(code);
  });

// ---- apps ----
program
  .command("apps")
  .description("Listar seus apps na plataforma Fabroku")
  .option("-p, --project <id>", "Filtrar por ID do projeto")
  .action(async (options) => {
    await apps(options);
  });

// ---- deploy ----
program
  .command("deploy")
  .description("Disparar deploy/redeploy de um app")
  .option(
    "-a, --app <name>",
    "Nome ou ID do app (senão detecta pelo git remote)",
  )
  .option("-d, --dir <path>", "Diretório do projeto", ".")
  .option("--skip-verify", "Pular verificação de arquivos")
  .option("--no-wait", "Não aguardar o deploy terminar")
  .action(async (options) => {
    await deploy(options);
  });

// ---- whoami ----
program
  .command("whoami")
  .description("Verificar o usuário autenticado")
  .action(async () => {
    await whoami();
  });

// ---- webhook ----
program
  .command("webhook [appId]")
  .description("Diagnosticar e configurar webhook do GitHub para um app")
  .option("--setup", "Criar/recriar o webhook automaticamente")
  .option(
    "--test",
    "Testar se commit status funciona (cria e remove um status)",
  )
  .action(async (appId, options) => {
    await webhook(appId, options);
  });

program.parse();
