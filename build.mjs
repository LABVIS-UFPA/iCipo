import { build } from 'vite';
import { targets, pageConfig } from './vite.config.mjs';

const targetArg = process.argv[2];

async function run() {
  const selectedTargets = targetArg && targets[targetArg]
    ? [targetArg]
    : targetArg === 'all' || !targetArg
    ? Object.keys(targets)
    : null;

  if (!selectedTargets) {
    console.error(`Alvo desconhecido: "${targetArg}". Escolha entre: ${Object.keys(targets).join(', ')}`);
    process.exit(1);
  }

  for (const t of selectedTargets) {
    const cfg = targets[t];
    console.log(`\n🔨 Construindo UI: ${t}...`);
    try {
      await build({
        ...pageConfig(cfg.name, cfg.input, cfg.outDir),
        configFile: false
      });
      console.log(`✅ [${t}] construído com sucesso!`);
    } catch (err) {
      console.error(`❌ Erro ao construir [${t}]:`, err);
      process.exit(1);
    }
  }
}

run();
