import * as path from 'node:path';
import request from 'supertest';
import { BASE_URL } from './setup/test-app';
import { state, TEST_FILES } from './setup/test-state';

const httpServer = BASE_URL;

describe('Files', () => {
  describe('GET /api/files', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).get('/api/files').expect(401);
    });
  });

  describe('POST /api/files/upload', () => {
    it('should return 401 without auth', () => {
      return request(httpServer).post('/api/files/upload').expect(401);
    });
  });

  describe('Upload test files via backend', () => {
    it.each(TEST_FILES)('should upload $name', async ({ name }) => {
      const filePath = path.join(__dirname, 'input-files', name);

      const res = await request(httpServer)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .field('channelId', state.agentId)
        .attach('file', filePath)
        .expect(201);

      const body = res.body as {
        id: string;
        filename: string;
        storageKey: string;
      };
      expect(body.id).toBeDefined();
      expect(body.filename).toBe(name);
      expect(body.storageKey).toMatch(/^uploads\//);

      state.uploadedFileIds.push(body.id);
    });
  });

  describe('GET /api/files (after upload)', () => {
    it('should list uploaded files', async () => {
      const res = await request(httpServer)
        .get('/api/files')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as {
        data: { id: string }[];
        nextCursor: string | null;
      };
      expect(body.data.length).toBeGreaterThanOrEqual(TEST_FILES.length);

      // All uploaded files should be present
      const ids = body.data.map((f) => f.id);
      for (const fileId of state.uploadedFileIds) {
        expect(ids).toContain(fileId);
      }
    });

    it('should filter by search term', async () => {
      const res = await request(httpServer)
        .get('/api/files?search=jpeg_example')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as { data: { filename: string }[] };
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0].filename).toContain('jpeg_example');
    });

    it('should filter by MIME type prefix', async () => {
      const res = await request(httpServer)
        .get('/api/files?type=image')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as { data: { mimeType: string }[] };
      expect(body.data.length).toBeGreaterThanOrEqual(2); // jpg + png
      for (const file of body.data) {
        expect(file.mimeType).toMatch(/^image\//);
      }
    });
  });

  describe('GET /api/files/:id/download', () => {
    it('should stream file content with correct headers', async () => {
      // Download the first uploaded file (jpg)
      const res = await request(httpServer)
        .get(`/api/files/${state.uploadedFileIds[0]}/download`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200)
        .buffer(true);

      expect(res.headers['content-type']).toContain('image/jpeg');
      expect(res.headers['content-disposition']).toContain('jpeg_example');
      expect((res.body as Buffer).length).toBeGreaterThan(0);
    });

    it('should download PDF with correct content type', async () => {
      // Find the PDF attachment (3rd file uploaded)
      const pdfId = state.uploadedFileIds[2];
      const res = await request(httpServer)
        .get(`/api/files/${pdfId}/download`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200)
        .buffer(true);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect((res.body as Buffer).length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent file', () => {
      return request(httpServer)
        .get('/api/files/nonexistent/download')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(404);
    });
  });

  describe('POST /api/files/bulk-download', () => {
    it('should return a ZIP archive of selected files', async () => {
      const ids = state.uploadedFileIds.slice(0, 2); // first two files
      const res = await request(httpServer)
        .post('/api/files/bulk-download')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ ids })
        .expect(200)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });

      expect(res.headers['content-type']).toContain('application/zip');
      expect(res.headers['content-disposition']).toContain('files.zip');
      const body = res.body as Buffer;
      expect(body.length).toBeGreaterThan(0);
      // ZIP magic number: PK (0x50 0x4B)
      expect(body[0]).toBe(0x50);
      expect(body[1]).toBe(0x4b);
    });
  });

  describe('GET /api/files/:id/share + GET /api/share/:token', () => {
    it('should return 401 for share without auth', () => {
      return request(httpServer)
        .get(`/api/files/${state.uploadedFileIds[0]}/share`)
        .expect(401);
    });

    it('should generate a share link with full URL and expiry', async () => {
      const res = await request(httpServer)
        .get(`/api/files/${state.uploadedFileIds[0]}/share`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const body = res.body as { url: string; expiresIn: number };
      expect(body.url).toMatch(/\/api\/share\//);
      expect(body.expiresIn).toBe(3600);
    });

    it('should download file via share link without auth', async () => {
      // Generate share link
      const shareRes = await request(httpServer)
        .get(`/api/files/${state.uploadedFileIds[0]}/share`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      const { url } = shareRes.body as { url: string };
      // Extract path from full URL (strip origin)
      const sharePath = new URL(url).pathname;

      // Download without any auth header
      const dlRes = await request(httpServer)
        .get(sharePath)
        .expect(200)
        .buffer(true);

      expect(dlRes.headers['content-type']).toContain('image/jpeg');
      expect(dlRes.headers['content-disposition']).toContain('jpeg_example');
      expect((dlRes.body as Buffer).length).toBeGreaterThan(0);
    });

    it('should return 404 for invalid share token', () => {
      return request(httpServer).get('/api/share/invalidtoken').expect(404);
    });

    it('should return 404 for non-existent file share', () => {
      return request(httpServer)
        .get(`/api/files/nonexistent/share`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(404);
    });
  });

  describe('POST /api/files/store (orphan file)', () => {
    let storedFileId: string;

    it('should return 401 without auth', () => {
      return request(httpServer).post('/api/files/store').expect(401);
    });

    it('should store a file without creating a message', async () => {
      const filePath = path.join(__dirname, 'input-files', 'csv_example.csv');
      const res = await request(httpServer)
        .post('/api/files/store')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .field('channelId', state.agentId)
        .attach('file', filePath)
        .expect(201);

      const body = res.body as { id: string; filename: string };
      expect(body.id).toBeDefined();
      expect(body.filename).toBe('csv_example.csv');
      storedFileId = body.id;
    });

    it('should delete the stored file', async () => {
      const res = await request(httpServer)
        .delete(`/api/files/${storedFileId}`)
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(200);

      expect((res.body as { message: string }).message).toBe('Deleted');
    });
  });

  describe('DELETE /api/files/:id', () => {
    it('should return 401 without auth', () => {
      return request(httpServer)
        .delete(`/api/files/${state.uploadedFileIds[0]}`)
        .expect(401);
    });

    it('should return 404 for non-existent file', () => {
      return request(httpServer)
        .delete('/api/files/nonexistent')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .expect(404);
    });
  });

  describe('POST /api/files/bulk-delete', () => {
    let bulkDeleteIds: string[];

    it('should upload two temp files for bulk delete', async () => {
      bulkDeleteIds = [];
      for (const name of ['csv_example.csv', 'html_example.html']) {
        const filePath = path.join(__dirname, 'input-files', name);
        const res = await request(httpServer)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${state.accessToken}`)
          .field('channelId', state.agentId)
          .attach('file', filePath)
          .expect(201);
        bulkDeleteIds.push((res.body as { id: string }).id);
      }
      expect(bulkDeleteIds).toHaveLength(2);
    });

    it('should return 401 without auth', () => {
      return request(httpServer)
        .post('/api/files/bulk-delete')
        .send({ ids: bulkDeleteIds })
        .expect(401);
    });

    it('should bulk delete files', async () => {
      const res = await request(httpServer)
        .post('/api/files/bulk-delete')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ ids: bulkDeleteIds })
        .expect(201);

      expect((res.body as { message: string }).message).toContain('Deleted');
    });
  });
});
