/**
 * Comando `fabroku deploy` — Dispara redeploy de um app.
 *
 * Fluxo:
 *   1. Detecta o git remote do diretório atual
 *   2. Busca o app correspondente na API (por URL do repo)
 *   3. Roda `verify` antes do deploy
 *   4. Dispara redeploy via API
 *   5. Acompanha progresso até concluir
 */

import { execSync } from "node:child_process";
import chalk from "chalk";

import { FabrokuAPI, APIError } from "../api.js";
import { isAuthenticated } from "../config.js";
import { verify } from "./verify.js";

/**
 * Normaliza URL do git para comparação.
 * Remove .git, protocolo, trailing slashes.
 */
function normalizeGitUrl(url) {
  return url
    .replace(/\.git$/, "")
    .replace(/\/$/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^git@github\.com:/, "github.com/")
    .toLowerCase();
}

/**
 * Obtém o remote URL do repositório git no diretório atual.
 */
function getGitRemoteUrl(dir) {
  try {
    const url = execSync("git remote get-url origin", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return url;
  } catch {
    return null;
  }
}

/**
 * Obtém a branch atual do repositório git.
 */
function getGitBranch(dir) {
  try {
    return execSync("git branch --show-current", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Busca o app que corresponde ao remote URL do diretório.
 */
async function findAppByGitUrl(api, gitUrl) {
  const data = await api.listApps();
  const apps = data.results || [];
  const normalizedLocal = normalizeGitUrl(gitUrl);

  return apps.find((app) => normalizeGitUrl(app.git) === normalizedLocal);
}

/**
 * Acompanha o progresso do deploy via polling.
 */
async function pollDeployStatus(api, appId, taskId) {
  const MAX_POLLS = 120; // 10 min (5s * 120)
  const INTERVAL = 5000;

  let lastProgress = 0;
  let lastStatus = "";

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, INTERVAL));

    let data;
    try {
      data = await api.getAppStatus(appId);
    } catch {
      continue; // ignora erros transitórios
    }

    const state = data.state;
    const progress = data.current || 0;
    const statusMsg = data.status || "";

    // Mostra progresso se mudou
    if (progress !== lastProgress || statusMsg !== lastStatus) {
      const bar = progressBar(progress);
      process.stdout.write(`\r   ${bar} ${statusMsg}`);
      lastProgress = progress;
      lastStatus = statusMsg;
    }

    if (state === "SUCCESS") {
      process.stdout.write("\n");
      return { success: true };
    }

    if (state === "FAILURE") {
      process.stdout.write("\n");
      return { success: false, error: statusMsg || data.status };
    }
  }

  process.stdout.write("\n");
  return {
    success: false,
    error: "Timeout — deploy demorou mais de 10 minutos",
  };
}

function progressBar(percent) {
  const width = 20;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(empty));
  return `[${bar}] ${String(percent).padStart(3)}%`;
}

export async function deploy(options) {
  // 1. Verifica autenticação
  if (!isAuthenticated()) {
    console.log(chalk.red("❌ Você precisa fazer login primeiro."));
    console.log(`   Use: ${chalk.bold("fabroku login")}`);
    process.exit(1);
  }

  const dir = options.dir || ".";
  const api = new FabrokuAPI();

  // 2. Se --app foi passado, busca direto por nome
  let app;
  if (options.app) {
    try {
      const data = await api.listApps();
      const apps = data.results || [];
      app = apps.find(
        (a) => a.name === options.app || String(a.id) === String(options.app),
      );
      if (!app) {
        console.log(chalk.red(`❌ App "${options.app}" não encontrado.`));
        console.log(
          `   Use ${chalk.bold("fabroku apps")} para listar seus apps.`,
        );
        process.exit(1);
      }
    } catch (e) {
      handleApiError(e);
    }
  } else {
    // 3. Detecta via git remote
    const gitUrl = getGitRemoteUrl(dir);
    if (!gitUrl) {
      console.log(
        chalk.red(
          "❌ Não foi possível detectar o repositório git neste diretório.",
        ),
      );
      console.log("   Certifique-se de estar na raiz de um repositório git,");
      console.log(
        `   ou use ${chalk.bold("fabroku deploy --app <nome>")} para especificar o app.`,
      );
      process.exit(1);
    }

    const branch = getGitBranch(dir);
    console.log(`\n📦 Repositório detectado: ${chalk.cyan(gitUrl)}`);
    if (branch) console.log(`   Branch: ${chalk.cyan(branch)}`);

    try {
      app = await findAppByGitUrl(api, gitUrl);
    } catch (e) {
      handleApiError(e);
    }

    if (!app) {
      console.log(
        chalk.red("\n❌ Nenhum app encontrado com este repositório."),
      );
      console.log(
        `   Use ${chalk.bold("fabroku apps")} para listar seus apps.`,
      );
      console.log(
        `   Ou crie um novo app no painel: ${chalk.dim("https://fabroku.fabricadesoftware.ifc.edu.br")}`,
      );
      process.exit(1);
    }
  }

  console.log(
    `\n🚀 App: ${chalk.bold(app.name)} (${chalk.dim(app.status || "unknown")})`,
  );

  // 4. Roda verify antes (a menos que --skip-verify)
  if (!options.skipVerify) {
    console.log(chalk.dim("\n── Verificação de arquivos ──"));
    const code = verify({ dir, quiet: true });
    if (code) {
      console.log(
        chalk.red(
          "\n❌ Verificação falhou. Corrija os problemas antes do deploy.",
        ),
      );
      console.log(
        `   Use ${chalk.bold("fabroku verify --fix")} para gerar os arquivos faltantes.`,
      );
      process.exit(1);
    }
    console.log(chalk.green("   ✓ Arquivos de deploy OK\n"));
  }

  // 5. Dispara redeploy
  console.log(chalk.dim("── Deploy ──"));
  console.log(`   Disparando redeploy de ${chalk.bold(app.name)}...`);

  let result;
  try {
    result = await api.redeployApp(app.id);
  } catch (e) {
    if (e instanceof APIError) {
      if (e.statusCode === 409) {
        console.log(chalk.yellow(`\n⚠️  ${e.detail}`));
        process.exit(1);
      }
      if (e.statusCode === 400) {
        console.log(chalk.red(`\n❌ ${e.detail}`));
        process.exit(1);
      }
    }
    handleApiError(e);
  }

  const taskId = result.task_id;
  console.log(
    `   Deploy iniciado! ${chalk.dim(`(task: ${taskId.slice(0, 8)}...)`)}`,
  );

  // 6. Acompanha progresso (a menos que --no-wait)
  if (options.noWait) {
    console.log(
      `\n   Acompanhe o progresso no painel ou com: ${chalk.bold(`fabroku status --app ${app.name}`)}`,
    );
    return;
  }

  console.log(chalk.dim("   Acompanhando progresso...\n"));
  const deployResult = await pollDeployStatus(api, app.id, taskId);

  if (deployResult.success) {
    console.log(chalk.green.bold("\n✅ Deploy concluído com sucesso!"));
    if (app.domain) {
      console.log(`   🌐 ${chalk.cyan(`https://${app.domain}`)}`);
    }
  } else {
    console.log(
      chalk.red(
        `\n❌ Deploy falhou: ${deployResult.error || "erro desconhecido"}`,
      ),
    );
    process.exit(1);
  }
}

function handleApiError(e) {
  if (e instanceof APIError && e.statusCode === 401) {
    console.log(
      chalk.red("❌ Token expirado ou inválido. Faça login novamente."),
    );
    console.log(`   Use: ${chalk.bold("fabroku login")}`);
  } else {
    console.log(chalk.red(`❌ Erro na API: ${e.message}`));
  }
  process.exit(1);
}
