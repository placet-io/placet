import { Test, TestingModule } from '@nestjs/testing';
import { PluginRegistryService } from './plugin-registry.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PluginRegistryService', () => {
  let service: PluginRegistryService;
  let tmpDir: string;

  const validManifest = {
    name: 'test-plugin',
    displayName: 'Test Plugin',
    version: '1.0.0',
  };

  const validHtml = '<div>Hello from plugin</div>';

  beforeEach(async () => {
    // Create a temp plugins directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-plugins-'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [PluginRegistryService],
    }).compile();

    service = module.get<PluginRegistryService>(PluginRegistryService);

    // Override getPluginsDir to use tmpDir
    (service as any).getPluginsDir = () => tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should discover plugins with valid manifest', async () => {
    const pluginDir = path.join(tmpDir, 'test-plugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(validManifest),
    );
    fs.writeFileSync(path.join(pluginDir, 'render.html'), validHtml);

    await service.discover();

    expect(service.isRegistered('test-plugin')).toBe(true);
    expect(service.getManifests()).toHaveLength(1);
    expect(service.getManifests()[0].name).toBe('test-plugin');
    expect(service.getRenderHtml('test-plugin')).toBe(validHtml);
  });

  it('should skip directories without plugin.json', async () => {
    const pluginDir = path.join(tmpDir, 'no-manifest');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'render.html'), validHtml);

    await service.discover();

    expect(service.getAllPlugins()).toHaveLength(0);
  });

  it('should skip invalid manifest files', async () => {
    const pluginDir = path.join(tmpDir, 'bad-plugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({ invalid: true }),
    );

    await service.discover();

    expect(service.getAllPlugins()).toHaveLength(0);
  });

  it('should handle plugin without render.html gracefully', async () => {
    const pluginDir = path.join(tmpDir, 'no-html');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(validManifest),
    );

    await service.discover();

    expect(service.isRegistered('test-plugin')).toBe(true);
    expect(service.getRenderHtml('test-plugin')).toBe('');
  });

  it('should discover multiple plugins', async () => {
    const plugin1Dir = path.join(tmpDir, 'plugin-a');
    const plugin2Dir = path.join(tmpDir, 'plugin-b');
    fs.mkdirSync(plugin1Dir);
    fs.mkdirSync(plugin2Dir);

    fs.writeFileSync(
      path.join(plugin1Dir, 'plugin.json'),
      JSON.stringify({ ...validManifest, name: 'plugin-a' }),
    );
    fs.writeFileSync(
      path.join(plugin2Dir, 'plugin.json'),
      JSON.stringify({ ...validManifest, name: 'plugin-b' }),
    );

    await service.discover();

    expect(service.getAllPlugins()).toHaveLength(2);
    expect(service.isRegistered('plugin-a')).toBe(true);
    expect(service.isRegistered('plugin-b')).toBe(true);
  });

  it('should return undefined for unknown plugin', () => {
    expect(service.getPlugin('nonexistent')).toBeUndefined();
    expect(service.getRenderHtml('nonexistent')).toBeUndefined();
    expect(service.isRegistered('nonexistent')).toBe(false);
  });

  it('should handle empty plugins directory', async () => {
    await service.discover();
    expect(service.getAllPlugins()).toHaveLength(0);
  });

  it('should handle nonexistent plugins directory', async () => {
    (service as any).getPluginsDir = () => '/nonexistent/path';

    await service.discover();
    expect(service.getAllPlugins()).toHaveLength(0);
  });

  it('should return full plugin details with getPlugin', async () => {
    const pluginDir = path.join(tmpDir, 'full-plugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(validManifest),
    );
    fs.writeFileSync(path.join(pluginDir, 'render.html'), validHtml);

    await service.discover();

    const plugin = service.getPlugin('test-plugin');
    expect(plugin).toBeDefined();
    expect(plugin!.manifest.name).toBe('test-plugin');
    expect(plugin!.manifest.displayName).toBe('Test Plugin');
    expect(plugin!.manifest.version).toBe('1.0.0');
    expect(plugin!.renderHtml).toBe(validHtml);
    expect(plugin!.directory).toBe(pluginDir);
  });
});
