import request from 'supertest';
import { BASE_URL } from './setup/test-app';
import { state } from './setup/test-state';

const httpServer = BASE_URL;

describe('Plugins', () => {
  describe('GET /api/plugins', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).get('/api/plugins').expect(401);
    });

    it('should return plugins list', async () => {
      const res = await request(httpServer)
        .get('/api/plugins')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/plugins/:name', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).get('/api/plugins/form-submit').expect(401);
    });

    it('should return 404 for non-existent plugin', () => {
      return request(httpServer)
        .get('/api/plugins/nonexistent-plugin')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(404);
    });

    it('should return plugin details for existing plugin', async () => {
      // First get the list to find a real plugin name
      const listRes = await request(httpServer)
        .get('/api/plugins')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const plugins = listRes.body as { name: string }[];
      if (plugins.length === 0) return; // skip if no plugins installed

      const pluginName = plugins[0].name;
      const res = await request(httpServer)
        .get(`/api/plugins/${pluginName}`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as { name: string };
      expect(body.name).toBe(pluginName);
    });
  });

  describe('GET /api/plugins/:name/render', () => {
    it('should return 401 without auth', () => {
      return request(httpServer)
        .get('/api/plugins/form-submit/render')
        .expect(401);
    });

    it('should return 404 for non-existent plugin', () => {
      return request(httpServer)
        .get('/api/plugins/nonexistent-plugin/render')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(404);
    });

    it('should return render HTML for existing plugin', async () => {
      const listRes = await request(httpServer)
        .get('/api/plugins')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const plugins = listRes.body as { name: string }[];
      if (plugins.length === 0) return;

      const pluginName = plugins[0].name;
      const res = await request(httpServer)
        .get(`/api/plugins/${pluginName}/render`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as { html: string; env: Record<string, string> };
      expect(body.html).toBeDefined();
      expect(typeof body.html).toBe('string');
    });
  });

  describe('GET /api/plugins/:name/config', () => {
    it('should return 401 without auth', () => {
      return request(httpServer)
        .get('/api/plugins/form-submit/config')
        .expect(401);
    });

    it('should return 404 for non-existent plugin', () => {
      return request(httpServer)
        .get('/api/plugins/nonexistent-plugin/config')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(404);
    });

    it('should return config for existing plugin', async () => {
      const listRes = await request(httpServer)
        .get('/api/plugins')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const plugins = listRes.body as { name: string }[];
      if (plugins.length === 0) return;

      const pluginName = plugins[0].name;
      const res = await request(httpServer)
        .get(`/api/plugins/${pluginName}/config`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as { envSchema: unknown[] };
      expect(body).toHaveProperty('envSchema');
    });
  });

  describe('PUT /api/plugins/:name/config', () => {
    it('should return 401 without auth', () => {
      return request(httpServer)
        .put('/api/plugins/form-submit/config')
        .send({ envValues: {}, enabled: true })
        .expect(401);
    });

    it('should return 404 for non-existent plugin', () => {
      return request(httpServer)
        .put('/api/plugins/nonexistent-plugin/config')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ envValues: {}, enabled: true })
        .expect(404);
    });

    it('should update config for existing plugin', async () => {
      const listRes = await request(httpServer)
        .get('/api/plugins')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const plugins = listRes.body as { name: string }[];
      if (plugins.length === 0) return;

      const pluginName = plugins[0].name;
      const res = await request(httpServer)
        .put(`/api/plugins/${pluginName}/config`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ envValues: {}, enabled: true })
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });

  describe('POST /api/plugins/:name/fetch', () => {
    it('should return 404 for non-existent plugin', () => {
      return request(httpServer)
        .post('/api/plugins/nonexistent-plugin/fetch')
        .send({ url: 'https://example.com' })
        .expect(404);
    });
  });

  describe('GET /api/plugins/:name/icon', () => {
    it('should return 404 for non-existent plugin', () => {
      return request(httpServer)
        .get('/api/plugins/nonexistent-plugin/icon')
        .expect(404);
    });
  });
});
