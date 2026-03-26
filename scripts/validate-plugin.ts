#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// HumanProxy – Plugin Validator
// ---------------------------------------------------------------------------
// Validates one or all plugins in packages/plugins/.
//
// Usage:
//   npx tsx scripts/validate-plugin.ts                  # validate all
//   npx tsx scripts/validate-plugin.ts form-submit      # validate one
//   npx tsx scripts/validate-plugin.ts --json           # JSON output
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { PluginManifestSchema } from '@humanproxy/shared';

interface ValidationError {
  plugin: string;
  errors: string[];
}

interface ValidationResult {
  valid: boolean;
  plugins: { name: string; version: string; valid: boolean; errors: string[] }[];
}

function validatePlugin(pluginDir: string, dirName: string): string[] {
  const errors: string[] = [];
  const manifestPath = path.join(pluginDir, 'plugin.json');
  const renderPath = path.join(pluginDir, 'render.html');

  // 1. plugin.json must exist
  if (!fs.existsSync(manifestPath)) {
    errors.push('Missing plugin.json');
    return errors;
  }

  // 2. plugin.json must be valid JSON
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    errors.push(`Invalid JSON in plugin.json: ${err instanceof Error ? err.message : err}`);
    return errors;
  }

  // 3. plugin.json must pass schema validation
  const result = PluginManifestSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      errors.push(`Schema error at "${path}": ${issue.message}`);
    }
    return errors;
  }

  const manifest = result.data;

  // 4. Plugin name must match directory name
  if (manifest.name !== dirName) {
    errors.push(`Plugin name "${manifest.name}" does not match directory name "${dirName}"`);
  }

  // 5. render.html must exist
  if (!fs.existsSync(renderPath)) {
    errors.push('Missing render.html');
  }

  // 6. If icon references a file (starts with ./), it must exist
  if (manifest.icon && manifest.icon.startsWith('./')) {
    const iconPath = path.join(pluginDir, manifest.icon);
    if (!fs.existsSync(iconPath)) {
      errors.push(`Icon file not found: ${manifest.icon}`);
    }
  }

  // 7. Env keys must be unique
  if (manifest.env && manifest.env.length > 0) {
    const keys = manifest.env.map((e) => e.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
      errors.push(`Duplicate env keys: ${[...new Set(dupes)].join(', ')}`);
    }
  }

  // 8. Version must be valid semver-like (basic check)
  if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push(`Version "${manifest.version}" is not a valid semver format`);
  }

  return errors;
}

function run(): ValidationResult {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const jsonOutput = process.argv.includes('--json');
  const pluginName = args[0] || null;

  const pluginsDir = path.resolve(__dirname, '..', 'packages', 'plugins');

  if (!fs.existsSync(pluginsDir)) {
    const result: ValidationResult = { valid: false, plugins: [] };
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('✗ Plugins directory not found:', pluginsDir);
    }
    process.exit(1);
  }

  let dirs: string[];

  if (pluginName) {
    const specificDir = path.join(pluginsDir, pluginName);
    if (!fs.existsSync(specificDir) || !fs.statSync(specificDir).isDirectory()) {
      const result: ValidationResult = {
        valid: false,
        plugins: [
          {
            name: pluginName,
            version: '',
            valid: false,
            errors: [`Plugin directory "${pluginName}" not found`],
          },
        ],
      };
      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.error(`✗ Plugin directory not found: ${pluginName}`);
      }
      process.exit(1);
    }
    dirs = [pluginName];
  } else {
    dirs = fs
      .readdirSync(pluginsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  const results: ValidationResult = { valid: true, plugins: [] };

  for (const dirName of dirs) {
    const pluginDir = path.join(pluginsDir, dirName);
    const errors = validatePlugin(pluginDir, dirName);
    const isValid = errors.length === 0;

    let version = '';
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf-8'));
      version = raw.version || '';
    } catch {
      // ignore
    }

    results.plugins.push({ name: dirName, version, valid: isValid, errors });

    if (!isValid) results.valid = false;
  }

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const p of results.plugins) {
      if (p.valid) {
        console.log(`✓ ${p.name} (v${p.version})`);
      } else {
        console.log(`✗ ${p.name}`);
        for (const err of p.errors) {
          console.log(`  - ${err}`);
        }
      }
    }

    console.log('');
    if (results.valid) {
      console.log(`✅ All ${results.plugins.length} plugin(s) valid`);
    } else {
      const failed = results.plugins.filter((p) => !p.valid).length;
      console.log(`❌ ${failed} plugin(s) failed validation`);
    }
  }

  return results;
}

const result = run();
process.exit(result.valid ? 0 : 1);
