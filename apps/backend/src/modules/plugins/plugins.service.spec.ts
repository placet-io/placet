import { Test, TestingModule } from '@nestjs/testing';
import { PluginsService } from './plugins.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PluginsService', () => {
  let service: PluginsService;
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
      providers: [
        PluginsService,
        {
          provide: PrismaService,
          useValue: {
            pluginConfig: { findUnique: jest.fn(), upsert: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<PluginsService>(PluginsService);

    // Override getPluginsDir to use tmpDir
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (service as any)['getPluginsDir'] = () => tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should discover plugins with valid manifest', () => {
    const pluginDir = path.join(tmpDir, 'test-plugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(validManifest),
    );
    fs.writeFileSync(path.join(pluginDir, 'render.html'), validHtml);

    service.discover();

    expect(service.isRegistered('test-plugin')).toBe(true);
    expect(service.getManifests()).toHaveLength(1);
    expect(service.getManifests()[0].name).toBe('test-plugin');
    expect(service.getRenderHtml('test-plugin')).toBe(validHtml);
  });

  it('should throw for directories without plugin.json', () => {
    const pluginDir = path.join(tmpDir, 'no-manifest');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'render.html'), validHtml);

    expect(() => service.discover()).toThrow('Plugin validation failed');
  });

  it('should throw for invalid manifest files', () => {
    const pluginDir = path.join(tmpDir, 'bad-plugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({ invalid: true }),
    );

    expect(() => service.discover()).toThrow('Plugin validation failed');
  });

  it('should handle plugin without render.html by throwing', () => {
    const pluginDir = path.join(tmpDir, 'test-plugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(validManifest),
    );

    expect(() => service.discover()).toThrow('Plugin validation failed');
  });

  it('should discover multiple plugins', () => {
    const plugin1Dir = path.join(tmpDir, 'plugin-a');
    const plugin2Dir = path.join(tmpDir, 'plugin-b');
    fs.mkdirSync(plugin1Dir);
    fs.mkdirSync(plugin2Dir);

    fs.writeFileSync(
      path.join(plugin1Dir, 'plugin.json'),
      JSON.stringify({ ...validManifest, name: 'plugin-a' }),
    );
    fs.writeFileSync(path.join(plugin1Dir, 'render.html'), validHtml);
    fs.writeFileSync(
      path.join(plugin2Dir, 'plugin.json'),
      JSON.stringify({ ...validManifest, name: 'plugin-b' }),
    );
    fs.writeFileSync(path.join(plugin2Dir, 'render.html'), validHtml);

    service.discover();

    expect(service.getAllPlugins()).toHaveLength(2);
    expect(service.isRegistered('plugin-a')).toBe(true);
    expect(service.isRegistered('plugin-b')).toBe(true);
  });

  it('should return undefined for unknown plugin', () => {
    expect(service.getPlugin('nonexistent')).toBeUndefined();
    expect(service.getRenderHtml('nonexistent')).toBeUndefined();
    expect(service.isRegistered('nonexistent')).toBe(false);
  });

  it('should handle empty plugins directory', () => {
    service.discover();
    expect(service.getAllPlugins()).toHaveLength(0);
  });

  it('should handle nonexistent plugins directory', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (service as any)['getPluginsDir'] = () => '/nonexistent/path';

    service.discover();
    expect(service.getAllPlugins()).toHaveLength(0);
  });

  it('should return full plugin details with getPlugin', () => {
    const pluginDir = path.join(tmpDir, 'test-plugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(validManifest),
    );
    fs.writeFileSync(path.join(pluginDir, 'render.html'), validHtml);

    service.discover();

    const plugin = service.getPlugin('test-plugin');
    expect(plugin).toBeDefined();
    expect(plugin!.manifest.name).toBe('test-plugin');
    expect(plugin!.manifest.displayName).toBe('Test Plugin');
    expect(plugin!.manifest.version).toBe('1.0.0');
    expect(plugin!.renderHtml).toBe(validHtml);
    expect(plugin!.directory).toBe(pluginDir);
  });
});
