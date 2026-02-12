const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 4000;

// Paths
// Raiz do backend (pasta "backend")
const ROOT_DIR = path.resolve(__dirname, '..');

// Caminho do banco:
// - Em produção (Railway, etc.): use DB_PATH se definido
// - Caso contrário, usa "catalog.db" em um diretório local de dados
const DEFAULT_DB_DIR =
  (process.env.DB_DIR && process.env.DB_DIR.trim() !== '')
    ? process.env.DB_DIR
    : path.join(ROOT_DIR, 'data');

const DB_PATH =
  process.env.DB_PATH && process.env.DB_PATH.trim() !== ''
    ? process.env.DB_PATH
    : path.join(DEFAULT_DB_DIR, 'catalog.db');

// Diretório para uploads (dentro do backend)
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

// Caminho da logo usada no PDF (opcional).
// Em ambientes onde o frontend não está no mesmo filesystem, simplesmente não haverá logo.
const LOGO_PATH = path.join(
  ROOT_DIR,
  '..',
  'frontend',
  'src',
  'assets',
  'logo-aguiar-moderna.png',
);

// Garante que diretórios de dados existem
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

console.log('Usando banco SQLite em:', DB_PATH);

// Middleware - CORS
// Permite:
// - localhost/127.0.0.1 (desenvolvimento)
// - domínio de produção na HostGator
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedHostgatorDomain =
    'https://eduardogenesvieira1770888471160.2552165.meusitehostgator.com.br';

  const isAllowedOrigin =
    !origin ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin === allowedHostgatorDomain;

  if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'false');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({ storage });

// SQLite setup
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price_cents INTEGER NOT NULL,
      image_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  );

  // Migração leve para novos campos comerciais
  db.all('PRAGMA table_info(products)', (err, rows) => {
    if (err) {
      console.error('Erro ao ler metadados da tabela products', err);
      return;
    }
    const cols = rows.map((r) => r.name);
    const missingAlters = [];
    if (!cols.includes('category')) {
      missingAlters.push(
        "ALTER TABLE products ADD COLUMN category TEXT DEFAULT ''",
      );
    }
    if (!cols.includes('sku')) {
      missingAlters.push(
        "ALTER TABLE products ADD COLUMN sku TEXT DEFAULT ''",
      );
    }
    if (!cols.includes('promotional')) {
      missingAlters.push(
        'ALTER TABLE products ADD COLUMN promotional INTEGER NOT NULL DEFAULT 0',
      );
    }

    missingAlters.forEach((sql) => {
      db.run(sql, (alterErr) => {
        if (alterErr) {
          console.error('Erro ao aplicar migração em products', alterErr);
        }
      });
    });
  });
});

function getLayoutConfig(callback) {
  db.get(
    'SELECT value FROM settings WHERE key = ?',
    ['layout_config'],
    (err, row) => {
      if (err) return callback(err);
      if (!row) {
        return callback(null, {
          title: 'Catálogo de Produtos',
          subtitle: 'Gerado automaticamente',
          showLogo: true,
          footerText: '',
        });
      }
      try {
        const parsed = JSON.parse(row.value);
        callback(null, parsed);
      } catch (e) {
        callback(null, {
          title: 'Catálogo de Produtos',
          subtitle: 'Gerado automaticamente',
          showLogo: true,
          footerText: '',
        });
      }
    },
  );
}

function saveLayoutConfig(config, callback) {
  const value = JSON.stringify(config);
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ['layout_config', value],
    callback,
  );
}

function generateSku(callback) {
  db.get('SELECT MAX(id) as maxId FROM products', [], (err, row) => {
    if (err) {
      return callback(err);
    }
    let nextId = (row?.maxId || 0) + 1;
    const trySku = () => {
      const sku = `AG-${String(nextId).padStart(4, '0')}`;
      db.get('SELECT id FROM products WHERE sku = ?', [sku], (checkErr, existing) => {
        if (checkErr) {
          return callback(checkErr);
        }
        if (existing) {
          nextId++;
          trySku();
        } else {
          callback(null, sku);
        }
      });
    };
    trySku();
  });
}

function decimalToCents(decimalString) {
  if (decimalString == null) return 0;
  const normalized = String(decimalString).replace(',', '.').trim();
  const parts = normalized.split('.');
  const integerPart = parts[0] || '0';
  const decimalPart = (parts[1] || '0').padEnd(2, '0').slice(0, 2);
  const value = parseInt(integerPart, 10) * 100 + parseInt(decimalPart, 10);
  return Number.isNaN(value) ? 0 : value;
}

function centsToDecimalString(cents) {
  if (cents == null) return '0,00';
  const intCents = parseInt(cents, 10);
  const integerPart = Math.trunc(intCents / 100);
  const decimalPart = Math.abs(intCents % 100)
    .toString()
    .padStart(2, '0');
  return `${integerPart},${decimalPart}`;
}

// Helpers to map DB rows to API model
function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: centsToDecimalString(row.price_cents),
    imageUrl: row.image_path ? `/uploads/${path.basename(row.image_path)}` : null,
    category: row.category || '',
    sku: row.sku || '',
    promotional: row.promotional === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/layout-config', (req, res) => {
  getLayoutConfig((err, config) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Erro ao carregar configuração de layout.' });
    }
    res.json(config);
  });
});

app.put('/layout-config', (req, res) => {
  const { title, subtitle, showLogo, footerText } = req.body || {};
  const config = {
    title: title || 'Catálogo de Produtos',
    subtitle: subtitle || 'Gerado automaticamente',
    showLogo: showLogo !== false,
    footerText: footerText || '',
  };

  saveLayoutConfig(config, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Erro ao salvar configuração de layout.' });
    }
    res.json(config);
  });
});

// List products com filtros comerciais
app.get('/products', (req, res) => {
  const { category, onlyPromotional, orderBy } = req.query;

  const whereParts = [];
  const params = [];

  if (category) {
    whereParts.push('category = ?');
    params.push(String(category));
  }
  if (onlyPromotional === 'true') {
    whereParts.push('promotional = 1');
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  let orderSql = 'ORDER BY created_at DESC';
  if (orderBy === 'priceAsc') {
    orderSql = 'ORDER BY price_cents ASC';
  } else if (orderBy === 'priceDesc') {
    orderSql = 'ORDER BY price_cents DESC';
  } else if (orderBy === 'nameAsc') {
    orderSql = 'ORDER BY name ASC';
  }

  const sql = `SELECT * FROM products ${whereSql} ${orderSql}`;

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Erro ao listar produtos.' });
    }
    res.json(rows.map(mapProduct));
  });
});

// Create product
app.post('/products', upload.single('image'), (req, res) => {
  const { name, description, price, category, sku, promotional } = req.body;

  if (!name || !price) {
    return res.status(400).json({ message: 'Nome e valor são obrigatórios.' });
  }

  const priceCents = decimalToCents(price);
  const now = new Date().toISOString();
  const imagePath = req.file ? req.file.path : null;
  const isPromotional = promotional === 'true' || promotional === 'on' ? 1 : 0;

  const finalSku = sku && sku.trim() ? sku.trim() : null;

  if (finalSku) {
    // SKU fornecido, usar diretamente
    const sql =
      'INSERT INTO products (name, description, price_cents, image_path, category, sku, promotional, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const params = [
      name,
      description || '',
      priceCents,
      imagePath,
      category || '',
      finalSku,
      isPromotional,
      now,
      now,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao criar produto.' });
      }

      db.get('SELECT * FROM products WHERE id = ?', [this.lastID], (err2, row) => {
        if (err2) {
          console.error(err2);
          return res.status(500).json({ message: 'Erro ao carregar produto criado.' });
        }
        res.status(201).json(mapProduct(row));
      });
    });
  } else {
    // SKU não fornecido, gerar automaticamente
    generateSku((skuErr, autoSku) => {
      if (skuErr) {
        console.error(skuErr);
        return res.status(500).json({ message: 'Erro ao gerar SKU automático.' });
      }

      const sql =
        'INSERT INTO products (name, description, price_cents, image_path, category, sku, promotional, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
      const params = [
        name,
        description || '',
        priceCents,
        imagePath,
        category || '',
        autoSku,
        isPromotional,
        now,
        now,
      ];

      db.run(sql, params, function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Erro ao criar produto.' });
        }

        db.get('SELECT * FROM products WHERE id = ?', [this.lastID], (err2, row) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ message: 'Erro ao carregar produto criado.' });
          }
          res.status(201).json(mapProduct(row));
        });
      });
    });
  }
});

// Update product
app.put('/products/:id', upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { name, description, price, category, sku, promotional } = req.body;

  if (!name || !price) {
    return res.status(400).json({ message: 'Nome e valor são obrigatórios.' });
  }

  const priceCents = decimalToCents(price);
  const now = new Date().toISOString();
  const newImagePath = req.file ? req.file.path : null;
  const isPromotional = promotional === 'true' || promotional === 'on' ? 1 : 0;

  db.get('SELECT * FROM products WHERE id = ?', [id], (err, existing) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Erro ao buscar produto.' });
    }
    if (!existing) {
      return res.status(404).json({ message: 'Produto não encontrado.' });
    }

    let finalImagePath = existing.image_path;
    if (newImagePath) {
      finalImagePath = newImagePath;
    }

    const sql =
      'UPDATE products SET name = ?, description = ?, price_cents = ?, image_path = ?, category = ?, sku = ?, promotional = ?, updated_at = ? WHERE id = ?';
    const params = [
      name,
      description || '',
      priceCents,
      finalImagePath,
      category || '',
      sku || '',
      isPromotional,
      now,
      id,
    ];

    db.run(sql, params, function (err2) {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ message: 'Erro ao atualizar produto.' });
      }

      db.get('SELECT * FROM products WHERE id = ?', [id], (err3, row) => {
        if (err3) {
          console.error(err3);
          return res.status(500).json({ message: 'Erro ao carregar produto atualizado.' });
        }
        res.json(mapProduct(row));
      });
    });
  });
});

// Delete product
app.delete('/products/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM products WHERE id = ?', [id], (err, existing) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Erro ao buscar produto.' });
    }
    if (!existing) {
      return res.status(404).json({ message: 'Produto não encontrado.' });
    }

    const sql = 'DELETE FROM products WHERE id = ?';
    db.run(sql, [id], function (err2) {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ message: 'Erro ao excluir produto.' });
      }

      if (existing.image_path && fs.existsSync(existing.image_path)) {
        fs.unlink(existing.image_path, () => {});
      }

      res.status(204).send();
    });
  });
});

// Generate PDF catalog
app.get('/catalog/pdf', async (req, res) => {
  const { category, onlyPromotional, orderBy, productIds } = req.query;

  const whereParts = [];
  const params = [];

  if (category) {
    whereParts.push('category = ?');
    params.push(String(category));
  }
  if (onlyPromotional === 'true') {
    whereParts.push('promotional = 1');
  }

  let orderSql = 'ORDER BY name ASC';
  if (productIds) {
    // Ordem customizada: usar a ordem dos IDs fornecidos
    const ids = String(productIds)
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      whereParts.push(`id IN (${placeholders})`);
      params.push(...ids);
      // Ordenar pela ordem dos IDs usando CASE
      const caseOrder = ids.map((id, index) => `WHEN ${id} THEN ${index}`).join(' ');
      orderSql = `ORDER BY CASE id ${caseOrder} END`;
    }
  } else if (orderBy === 'priceAsc') {
    orderSql = 'ORDER BY price_cents ASC';
  } else if (orderBy === 'priceDesc') {
    orderSql = 'ORDER BY price_cents DESC';
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const sql = `SELECT * FROM products ${whereSql} ${orderSql}`;

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Erro ao carregar produtos para o catálogo.' });
    }

    const products = rows.map(mapProduct);

    getLayoutConfig((cfgErr, layoutConfig) => {
      if (cfgErr) {
        console.error(cfgErr);
      }

      const cfg =
        layoutConfig || {
          title: 'Catálogo de Produtos',
          subtitle: 'Gerado automaticamente',
          showLogo: true,
          footerText: '',
        };

      // Converter logo para base64 se existir
      let logoBase64 = '';
      if (cfg.showLogo && fs.existsSync(LOGO_PATH)) {
        try {
          const logoBuffer = fs.readFileSync(LOGO_PATH);
          const logoExt = path.extname(LOGO_PATH).toLowerCase();
          const mimeType = logoExt === '.png' ? 'image/png' : logoExt === '.jpg' || logoExt === '.jpeg' ? 'image/jpeg' : 'image/png';
          logoBase64 = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
        } catch (logoErr) {
          console.error('Erro ao ler logo:', logoErr);
        }
      }

      (async () => {

      const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Catálogo de Produtos</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background: #05070a;
              color: #e5e7eb;
            }
            .page {
              padding: 32px 32px 24px;
              page-break-after: always;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 16px 20px;
              border-radius: 16px;
              background: radial-gradient(circle at top left, #1d9bf0 0, #0050a5 40%, #020617 100%);
              margin-bottom: 20px;
              box-shadow: 0 18px 45px -28px rgba(15, 23, 42, 0.9);
            }
            .brand {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .brand-logo {
              height: 40px;
            }
            .brand-text {
              display: flex;
              flex-direction: column;
              line-height: 1.1;
            }
            .brand-name {
              font-weight: bold;
              font-size: 15px;
            }
            .brand-subtitle {
              font-size: 8px;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: #bfdbfe;
            }
            .title-block {
              text-align: right;
              font-size: 11px;
            }
            .title-block h1 {
              margin: 0 0 4px;
              font-size: 16px;
            }
            .title-block span {
              font-size: 9px;
              color: #cbd5f5;
            }
            .footer {
              margin-top: 18px;
              padding-top: 8px;
              border-top: 1px solid #111827;
              font-size: 8px;
              color: #6b7280;
              display: flex;
              justify-content: space-between;
            }
            .grid {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
            }
            .card {
              border-radius: 10px;
              padding: 10px;
              width: 31.5%;
              box-sizing: border-box;
              background: #020617;
              border: 1px solid #111827;
              height: 200px;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }
            .card img {
              width: 100%;
              height: 100px;
              object-fit: contain;
              display: block;
              margin-bottom: 6px;
              flex-shrink: 0;
            }
            .name {
              font-weight: bold;
              margin-bottom: 2px;
              font-size: 11px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              line-height: 1.2;
            }
            .sku {
              font-size: 9px;
              color: #9ca3af;
              font-family: monospace;
              margin-bottom: 2px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .description {
              font-size: 9px;
              color: #9ca3af;
              margin-top: 2px;
              margin-bottom: 2px;
              overflow: hidden;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              line-height: 1.3;
              flex: 1;
              min-height: 2.6em;
            }
            .category {
              font-size: 9px;
              color: #bfdbfe;
              margin-bottom: 2px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .price {
              color: #22c55e;
              font-weight: bold;
              margin-top: auto;
              padding-top: 4px;
              font-size: 11px;
              flex-shrink: 0;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              ${
                cfg.showLogo && logoBase64
                  ? `<div class="brand">
                      <img class="brand-logo" src="${logoBase64}" alt="Aguiar Acessórios" />
                      <div class="brand-text">
                        <span class="brand-name">aguiar</span>
                        <span class="brand-subtitle">acessórios</span>
                      </div>
                    </div>`
                  : '<div></div>'
              }
              <div class="title-block">
                <h1>${cfg.title}</h1>
                <span>${cfg.subtitle}</span>
              </div>
            </div>
            <div class="grid">
            ${products
              .map((p) => {
                let imgTag = '';
                if (p.imageUrl) {
                  const imgPath = path.join(UPLOADS_DIR, path.basename(p.imageUrl));
                  if (fs.existsSync(imgPath)) {
                    try {
                      const imgBuffer = fs.readFileSync(imgPath);
                      const imgExt = path.extname(imgPath).toLowerCase();
                      const mimeType = imgExt === '.png' ? 'image/png' : imgExt === '.jpg' || imgExt === '.jpeg' ? 'image/jpeg' : 'image/png';
                      const imgBase64 = `data:${mimeType};base64,${imgBuffer.toString('base64')}`;
                      imgTag = `<img src="${imgBase64}" alt="${p.name}" />`;
                    } catch (imgErr) {
                      console.error('Erro ao ler imagem do produto:', imgErr);
                    }
                  }
                }
                return `
                  <div class="card">
                    ${imgTag}
                    <div class="name">${p.name}</div>
                    ${p.sku ? `<div class="sku">${p.sku}</div>` : ''}
                    <div class="description">${p.description || ''}</div>
                    ${p.category ? `<div class="category">${p.category}${p.promotional ? ' <span style="color: #fed7aa; font-size: 8px;">Promoção</span>' : ''}</div>` : ''}
                    <div class="price">R$ ${p.price}</div>
                  </div>
                `;
              })
              .join('')}
            </div>
            ${
              cfg.footerText
                ? `<div class="footer">
                     <span>${cfg.footerText}</span>
                     <span>Gerado em ${new Date().toLocaleDateString('pt-BR')}</span>
                   </div>`
                : `<div class="footer">
                     <span></span>
                     <span>Gerado em ${new Date().toLocaleDateString('pt-BR')}</span>
                   </div>`
            }
          </div>
        </body>
      </html>
    `;

        try {
          const browser = await puppeteer.launch({ headless: 'new' });
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle0' });
          const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
          await browser.close();

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename=\"catalogo.pdf\"');
          res.send(pdfBuffer);
        } catch (e) {
          console.error(e);
          res.status(500).json({ message: 'Erro ao gerar PDF do catálogo.' });
        }
      })();
    });
  });
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Backend ouvindo em http://localhost:${PORT}`);
});

