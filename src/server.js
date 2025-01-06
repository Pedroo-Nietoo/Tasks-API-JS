import http from 'node:http';
import { json } from './middlewares/json.js';
import { routes } from './routes.js';
import { extractQueryParams } from './utils/extract-query-params.js';
import fs from 'node:fs';
import path from 'node:path';

const uploadDir = './uploads';

// Cria o diretório de uploads caso ele não exista
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const parseMultipartData = async (req) => {
  const boundary = req.headers['content-type'].split('boundary=')[1];
  const rawData = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
    req.on('error', (err) => reject(err));
  });

  const parts = rawData.split(`--${boundary}`);
  const parsedData = {};

  for (const part of parts) {
    if (part.includes('Content-Disposition')) {
      const [header, body] = part.split('\r\n\r\n');
      const contentDisposition = header.split('\r\n')[0];

      // Extrai o nome do campo e o nome do arquivo (se houver)
      const nameMatch = contentDisposition.match(/name="([^"]+)"/);
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);

      if (nameMatch) {
        const fieldName = nameMatch[1];

        if (filenameMatch) {
          const filename = filenameMatch[1];
          const fileData = body.split('\r\n')[0]; // Remove o \r\n extra no final do arquivo
          const filePath = path.join(uploadDir, filename);

          // Salva o arquivo no sistema
          fs.writeFileSync(filePath, fileData, 'binary');
          parsedData[fieldName] = { filename, path: filePath };
        } else {
          // Adiciona o valor do campo de texto
          parsedData[fieldName] = body.trim();
        }
      }
    }
  }

  return parsedData;
};

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  if (req.headers['content-type']?.startsWith('multipart/form-data')) {
    req.body = await parseMultipartData(req);
  } else {
    await json(req, res);
  }

  const route = routes.find((route) => {
    return route.method === method && route.path.test(url);
  });

  if (route) {
    const routeParams = req.url.match(route.path);
    const { query, ...params } = routeParams.groups;

    req.params = params;
    req.query = query ? extractQueryParams(query) : {};

    return route.handler(req, res);
  }

  return res.writeHead(404).end('Not Found');
});

server.listen(3333, () => {
  console.log('Server running on http://localhost:3333');
});
