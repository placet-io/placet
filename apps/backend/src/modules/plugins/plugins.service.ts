import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PluginManifestSchema } from '@humanproxy/shared';
import type { PluginManifest } from '@humanproxy/shared';
import * as fs from 'fs';
import * as path from 'path';

export interface RegisteredPlugin {
  manifest: PluginManifest;
  renderHtml: string;
  directory: string;
}

@Injectable()
export class PluginsService implements OnModuleInit {
  private readonly logger = new Logger(PluginsService.name);
  private readonly plugins = new Map<string, RegisteredPlugin>();

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

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginDir = path.join(pluginsDir, entry.name);
      const manifestPath = path.join(pluginDir, 'plugin.json');
      const renderPath = path.join(pluginDir, 'render.html');

      if (!fs.existsSync(manifestPath)) {
        this.logger.warn(`No plugin.json in ${entry.name}, skipping`);
        continue;
      }

      try {
        const raw: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const manifest = PluginManifestSchema.parse(raw);

        const renderHtml = fs.existsSync(renderPath)
          ? fs.readFileSync(renderPath, 'utf-8')
          : '';

        this.plugins.set(manifest.name, {
          manifest,
          renderHtml,
          directory: pluginDir,
        });

        this.logger.log(
          `Registered plugin: ${manifest.name} v${manifest.version}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to load plugin ${entry.name}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    this.logger.log(`Plugin discovery complete: ${this.plugins.size} plugins`);
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
}
