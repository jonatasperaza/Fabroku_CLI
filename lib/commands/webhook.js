/**
 * Comando: fabroku webhook
 * Diagnostica e configura webhooks do GitHub para commit status.
 */

import chalk from "chalk";
import { FabrokuAPI } from "../api.js";

/**
 * Exibe checklist com ícone ✓/✗ e mensagem.
 */
function check(label, result) {
  const icon = result.ok ? chalk.green("✓") : chalk.red("✗");
  const msg = result.message || "";
  console.log(`  ${icon} ${chalk.bold(label)}: ${msg}`);
  // Detalhes extras
  if (!result.ok && result.value) {
    console.log(`    ${chalk.dim("Valor atual:")} ${result.value}`);
  }
  if (result.expected_url) {
    console.log(`    ${chalk.dim("URL esperada:")} ${result.expected_url}`);
  }
  if (result.all_hooks && result.all_hooks.length > 0) {
    console.log(`    ${chalk.dim("Webhooks no repo:")}`);
    for (const h of result.all_hooks) {
      const active = h.active ? chalk.green("ativo") : chalk.red("inativo");
      console.log(`      - ID ${h.id}: ${h.url} [${active}]`);
    }
  }
  if (result.fabroku_statuses && result.fabroku_statuses.length > 0) {
    console.log(`    ${chalk.dim("Últimos status fabroku/deploy:")}`);
    for (const s of result.fabroku_statuses) {
      const stateColor =
        s.state === "success"
          ? chalk.green
          : s.state === "pending"
            ? chalk.yellow
            : chalk.red;
      console.log(
        `      - ${stateColor(s.state)} ${s.description} (${s.created_at})`,
      );
    }
  }
}

export async function webhook(appId, options) {
  const api = new FabrokuAPI();

  if (!appId) {
    // Listar apps para o usuário escolher
    console.log(chalk.cyan("Buscando apps..."));
    try {
      const data = await api.listApps();
      const apps = data.results || data;
      if (!apps.length) {
        console.log(chalk.yellow("Nenhum app encontrado."));
        return;
      }
      console.log(chalk.bold("\nSeus apps:"));
      for (const app of apps) {
        console.log(
          `  ${chalk.cyan(app.id)} - ${app.name} (${app.git || "sem git"})`,
        );
      }
      console.log(
        chalk.dim("\nUse: fabroku webhook <app_id>  para diagnosticar"),
      );
      return;
    } catch (err) {
      console.error(chalk.red(`Erro: ${err.message}`));
      process.exit(1);
    }
  }

  // Diagnóstico
  console.log(chalk.cyan.bold(`\n🔍 Diagnóstico do webhook — App #${appId}\n`));

  try {
    const diag = await api.diagnoseWebhook(appId);

    console.log(
      chalk.bold("App:"),
      `${diag.app.name} (${diag.app.git || "N/A"})`,
    );
    console.log(chalk.bold("Branch:"), diag.app.branch);
    console.log(chalk.bold("Webhook URL:"), diag.webhook_url);
    console.log();

    const checks = diag.checks;
    check("BACKEND_URL público", checks.backend_url_public);
    check("Seu git_token", checks.user_git_token);
    check("Token do projeto", checks.project_git_token);
    check("URL Git parseável", checks.git_url_parseable);

    if (checks.webhook_exists) {
      check("Webhook no GitHub", checks.webhook_exists);
    }
    if (checks.last_commit) {
      check("Último commit", checks.last_commit);
      if (checks.last_commit.sha) {
        console.log(`    ${chalk.dim("SHA:")} ${checks.last_commit.sha}`);
      }
    }

    // Resumo e ações sugeridas
    const allOk = Object.values(checks).every((c) => c.ok);
    console.log();

    if (allOk) {
      console.log(
        chalk.green.bold("✓ Tudo parece OK!"),
        "Se o status ainda não aparece, verifique os logs do Celery no servidor.",
      );
    } else {
      console.log(chalk.yellow.bold("⚠ Problemas encontrados:"));

      if (!checks.backend_url_public?.ok) {
        console.log(
          chalk.yellow(
            "  → BACKEND_URL está como localhost. Defina a variável de ambiente BACKEND_URL com a URL pública do backend.",
          ),
        );
      }
      if (!checks.user_git_token?.ok) {
        console.log(
          chalk.yellow(
            "  → Faça login novamente no Fabroku para obter um token GitHub válido.",
          ),
        );
      }
      if (!checks.project_git_token?.ok) {
        console.log(
          chalk.yellow(
            "  → Nenhum usuário do projeto tem token GitHub. Pelo menos 1 membro precisa fazer login.",
          ),
        );
      }
      if (checks.webhook_exists && !checks.webhook_exists.ok) {
        console.log(
          chalk.yellow(
            "  → Webhook não encontrado. Criando automaticamente...",
          ),
        );
        await setupWebhook(api, appId);
      }
      if (
        checks.last_commit &&
        !checks.last_commit.ok &&
        checks.last_commit.message
      ) {
        console.log(chalk.yellow(`  → ${checks.last_commit.message}`));
      }
    }

    // Se --setup foi passado
    if (options.setup) {
      console.log();
      await setupWebhook(api, appId);
    }
  } catch (err) {
    console.error(chalk.red(`Erro: ${err.message}`));
    process.exit(1);
  }
}

async function setupWebhook(api, appId) {
  console.log(chalk.cyan("Configurando webhook..."));
  try {
    const result = await api.setupWebhook(appId);
    if (result.status === "webhook criado") {
      console.log(chalk.green.bold("✓ Webhook criado com sucesso!"));
      console.log(chalk.dim(`  URL: ${result.webhook_url}`));
      console.log(chalk.dim(`  Hook ID: ${result.hook_id}`));
    } else if (result.status === "webhook já existe") {
      console.log(chalk.green("✓ Webhook já está configurado."));
      console.log(chalk.dim(`  Hook ID: ${result.hook_id}`));
    } else {
      console.log(chalk.yellow(`Status: ${result.status}`));
    }
  } catch (err) {
    console.error(chalk.red(`Erro ao criar webhook: ${err.message}`));
  }
}
