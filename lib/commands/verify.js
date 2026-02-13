/**
 * Comando `fabroku verify` — Verifica arquivos necessários para deploy.
 *
 * Lógica:
 *   - Não-fábrica → detecta tipo (frontend/backend) → verifica arquivos
 *   - Fábrica → pode usar config personalizada
 *
 * Frontend: .buildpacks, .static, static.json
 * Backend:  Procfile, requirements.txt, runtime.txt
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve as pathResolve } from "node:path";
import chalk from "chalk";

const FRONTEND_FILES = {
  ".buildpacks": {
    description: "Lista de buildpacks para deploy estático",
    content:
      "https://github.com/heroku/heroku-buildpack-nodejs\nhttps://github.com/dokku/buildpack-nginx\n",
  },
  ".static": {
    description: "Marcador para build estática",
    content: "",
  },
  "static.json": {
    description: "Configuração do servidor estático (rotas SPA)",
    content:
      JSON.stringify(
        {
          root: "dist/",
          clean_urls: true,
          routes: { "/**": "index.html" },
          headers: {
            "/**": { "Cache-Control": "public, max-age=0, must-revalidate" },
            "/assets/**": {
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          },
        },
        null,
        2,
      ) + "\n",
  },
};

const BACKEND_FILES = {
  Procfile: {
    description: "Define o comando de execução do servidor",
    content: "web: gunicorn config.wsgi --bind 0.0.0.0:$PORT\n",
  },
  "requirements.txt": {
    description: "Dependências Python do projeto",
    content: null, // Não gera automaticamente
  },
  "runtime.txt": {
    description: "Versão do Python para deploy",
    content: "python-3.13.2\n",
  },
};

/**
 * Detecta o tipo de aplicação pelo diretório.
 */
function detectType(dir) {
  // Frontend: tem package.json
  if (existsSync(join(dir, "package.json"))) {
    // Verifica se não é um backend Node (tem Procfile com "node")
    const procfilePath = join(dir, "Procfile");
    if (existsSync(procfilePath)) {
      const content = readFileSync(procfilePath, "utf-8");
      if (content.includes("node") || content.includes("npm")) {
        return "backend";
      }
    }
    return "frontend";
  }

  // Backend Python: manage.py ou requirements.txt ou setup.py ou pyproject.toml
  const backendMarkers = [
    "manage.py",
    "requirements.txt",
    "setup.py",
    "pyproject.toml",
    "Pipfile",
  ];
  if (backendMarkers.some((f) => existsSync(join(dir, f)))) {
    return "backend";
  }

  return null;
}

export function verify(options) {
  const dir = pathResolve(options.dir || ".");
  const forceType = options.type || null;
  const fix = options.fix || false;

  console.log(`\n📂 Verificando: ${chalk.bold(dir)}\n`);

  // Detecta ou usa tipo forçado
  let type = forceType;
  if (!type) {
    type = detectType(dir);
    if (!type) {
      console.log(
        chalk.yellow("⚠️  Não foi possível detectar o tipo da aplicação."),
      );
      console.log(
        `   Use ${chalk.bold("--type frontend")} ou ${chalk.bold("--type backend")}\n`,
      );
      process.exit(1);
    }
  }

  const typeName = type === "frontend" ? "FrontEnd" : "BackEnd";
  const typeDesc =
    type === "frontend"
      ? "Aplicação SPA/estática (Vue, React, etc.)"
      : "Aplicação Python (Django, Flask, etc.)";

  console.log(`🔍 Tipo detectado: ${chalk.cyan.bold(typeName)}`);
  console.log(`   ${typeDesc}\n`);

  const requiredFiles = type === "frontend" ? FRONTEND_FILES : BACKEND_FILES;
  let missing = 0;
  let fixed = 0;

  for (const [filename, info] of Object.entries(requiredFiles)) {
    const filePath = join(dir, filename);
    const exists = existsSync(filePath);

    if (exists) {
      console.log(`  ${chalk.green("✅")} ${filename}`);
    } else {
      console.log(
        `  ${chalk.red("❌")} ${filename} — ${chalk.dim("faltando")}`,
      );
      missing++;

      if (fix && info.content !== null) {
        writeFileSync(filePath, info.content);
        console.log(`     ${chalk.yellow("→")} Gerado com conteúdo padrão`);
        fixed++;
      }
    }
  }

  console.log();

  if (missing === 0) {
    console.log(chalk.green("🚀 Projeto pronto para deploy!\n"));
  } else if (fix && fixed > 0) {
    const remaining = missing - fixed;
    console.log(chalk.yellow(`🔧 ${fixed} arquivo(s) gerado(s).`));
    if (remaining > 0) {
      console.log(
        chalk.red(
          `   ${remaining} arquivo(s) precisam ser criados manualmente.`,
        ),
      );
    } else {
      console.log(chalk.green("🚀 Projeto pronto para deploy!\n"));
    }
  } else {
    console.log(
      chalk.yellow(`⚠️  ${missing} arquivo(s) faltando para deploy.`),
    );
    console.log(
      `   Use ${chalk.bold("fabroku verify --fix")} para gerar automaticamente.\n`,
    );
  }

  return missing === 0 || (fix && missing - fixed === 0) ? 0 : 1;
}
