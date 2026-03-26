import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PluginManifestSchema } from '@humanproxy/shared';
import type { PluginManifest } from '@humanproxy/shared';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';

export interface RegisteredPlugin {
  manifest: PluginManifest;
  renderHtml: string;
  directory: string;
}

@Injectable()
export class PluginsService implements OnModuleInit {
  private readonly logger = new Logger(PluginsService.name);
  private readonly plugins = new Map<string, RegisteredPlugin>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.discover();
  }

  discover() {
    const pluginsDir = this.getPluginsDir();

    if (!fs.existsSync(pluginsDir)) {
      this.logger.warn(`Plugins directory not found: ${pluginsDir}`);
      return;
    }

    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    const errors: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginDir = path.join(pluginsDir, entry.name);
      const pluginErrors = this.validatePlugin(pluginDir, entry.name);

      if (pluginErrors.length > 0) {
        for (const err of pluginErrors) {
          errors.push(`${entry.name}: ${err}`);
          this.logger.error(`Plugin validation failed [${entry.name}]: ${err}`);
        }
        continue;
      }

      const manifestPath = path.join(pluginDir, 'plugin.json');
      const renderPath = path.join(pluginDir, 'render.html');
      const raw: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const manifest = PluginManifestSchema.parse(raw);
      const renderHtml = fs.readFileSync(renderPath, 'utf-8');

      this.plugins.set(manifest.name, {
        manifest,
        renderHtml,
        directory: pluginDir,
      });

      this.logger.log(
        `Registered plugin: ${manifest.name} v${manifest.version}`,
      );
    }

    if (errors.length > 0) {
      throw new Error(
        `Plugin validation failed for ${errors.length} issue(s):\n  - ${errors.join('\n  - ')}`,
      );
    }

    this.logger.log(`Plugin discovery complete: ${this.plugins.size} plugins`);
  }

  private validatePlugin(pluginDir: string, dirName: string): string[] {
    const errors: string[] = [];
    const manifestPath = path.join(pluginDir, 'plugin.json');
    const renderPath = path.join(pluginDir, 'render.html');

    if (!fs.existsSync(manifestPath)) {
      errors.push('Missing plugin.json');
      return errors;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (err) {
      errors.push(
        `Invalid JSON in plugin.json: ${err instanceof Error ? err.message : err}`,
      );
      return errors;
    }

    const result = PluginManifestSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const p = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        errors.push(`Schema error at "${p}": ${issue.message}`);
      }
      return errors;
    }

    const manifest = result.data;

    if (manifest.name !== dirName) {
      errors.push(
        `Plugin name "${manifest.name}" does not match directory name "${dirName}"`,
      );
    }

    if (!fs.existsSync(renderPath)) {
      errors.push('Missing render.html');
    }

    if (manifest.icon && manifest.icon.startsWith('./')) {
      const iconPath = path.join(pluginDir, manifest.icon);
      if (!fs.existsSync(iconPath)) {
        errors.push(`Icon file not found: ${manifest.icon}`);
      }
    }

    if (manifest.env && manifest.env.length > 0) {
      const keys = manifest.env.map((e) => e.key);
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      if (dupes.length > 0) {
        errors.push(`Duplicate env keys: ${[...new Set(dupes)].join(', ')}`);
      }
    }

    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      errors.push(`Version "${manifest.version}" is not a valid semver format`);
    }

    return errors;
  }

  getPlugin(name: string): RegisteredPlugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): RegisteredPlugin[] {
    return [...this.plugins.values()];
  }

  getManifests(): PluginManifest[] {
    return [...this.plugins.values()].map((p) => p.manifest);
  }

  getRenderHtml(name: string): string | undefined {
    return this.plugins.get(name)?.renderHtml;
  }

  isRegistered(name: string): boolean {
    return this.plugins.has(name);
  }

  private getPluginsDir(): string {
    // In development: packages/plugins/ (monorepo root)
    // In Docker: /app/packages/plugins/
    const candidates = [
      path.resolve(process.cwd(), '../../packages/plugins'),
      path.resolve(process.cwd(), 'packages/plugins'),
      '/app/packages/plugins',
    ];

    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        return dir;
      }
    }

    return candidates[0];
  }

  // ── Config Methods ──────────────────────────────────────────────────────

  async getConfig(
    name: string,
  ): Promise<{ envValues: Record<string, string>; enabled: boolean } | null> {
    const plugin = this.plugins.get(name);
    if (!plugin) return null;

    const config = await this.prisma.pluginConfig.findUnique({
      where: {
        pluginName_version: {
          pluginName: name,
          version: plugin.manifest.version,
        },
      },
    });

    if (!config) {
      // Return defaults from manifest env schema
      const defaults: Record<string, string> = {};
      for (const envVar of plugin.manifest.env ?? []) {
        if (envVar.default !== undefined) {
          defaults[envVar.key] = envVar.default;
        }
      }
      return { envValues: defaults, enabled: true };
    }

    return {
      envValues: config.envValues as Record<string, string>,
      enabled: config.enabled,
    };
  }

  async setConfig(
    name: string,
    envValues: Record<string, string>,
    enabled?: boolean,
  ): Promise<{ envValues: Record<string, string>; enabled: boolean }> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin "${name}" not found`);
    }

    const data: { envValues: Record<string, string>; enabled?: boolean } = {
      envValues,
    };
    if (enabled !== undefined) {
      data.enabled = enabled;
    }

    const config = await this.prisma.pluginConfig.upsert({
      where: {
        pluginName_version: {
          pluginName: name,
          version: plugin.manifest.version,
        },
      },
      update: data,
      create: {
        pluginName: name,
        version: plugin.manifest.version,
        envValues,
        enabled: enabled ?? true,
      },
    });

    return {
      envValues: config.envValues as Record<string, string>,
      enabled: config.enabled,
    };
  }

  getIconPath(name: string): string | null {
    const plugin = this.plugins.get(name);
    if (!plugin) return null;

    const icon = plugin.manifest.icon;
    if (!icon || !icon.startsWith('./')) return null;

    const iconPath = path.resolve(plugin.directory, icon);

    // Prevent path traversal — resolved path must stay inside the plugin dir
    if (!iconPath.startsWith(plugin.directory + path.sep)) return null;

    if (!fs.existsSync(iconPath)) return null;

    return iconPath;
  }

  async getResolvedEnv(name: string): Promise<Record<string, string>> {
    const config = await this.getConfig(name);
    return config?.envValues ?? {};
  }
}
