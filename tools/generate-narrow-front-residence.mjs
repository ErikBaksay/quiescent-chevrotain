import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generator = path.join(projectRoot, 'tools', 'blender', 'narrow_front_residence.py');
const outputRoot =
  process.argv[2] ?? path.join(projectRoot, '.artifacts', 'blender', 'narrow-front-residence');
const knownBlender = '/home/erikbaksay/My Files/Apps/blender-5.1.1-linux-x64/blender';

async function executable(candidate) {
  if (!candidate) return false;
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findBlender() {
  const configured = process.env.BLENDER_BIN;
  if (await executable(configured)) return configured;
  if (await executable(knownBlender)) return knownBlender;
  return 'blender';
}

const blender = await findBlender();
await new Promise((resolve, reject) => {
  const child = spawn(
    blender,
    ['--background', '--python', generator, '--', '--output-root', outputRoot],
    { cwd: projectRoot, stdio: 'inherit' },
  );
  child.once('error', (error) => {
    reject(
      new Error(
        `Blender is required to generate Narrow-front Residence Set. Set BLENDER_BIN to a Blender executable. ${error.message}`,
      ),
    );
  });
  child.once('close', (code) => {
    if (code === 0) resolve();
    else
      reject(new Error(`Blender residence generation failed with exit code ${code ?? 'unknown'}.`));
  });
});

console.log(`Generated canonical Blender package in ${outputRoot}`);
