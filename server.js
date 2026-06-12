const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 5050;
const DB_FILE = path.join(__dirname, 'data', 'spools.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');
const LOG_FILE = path.join(__dirname, 'data', 'spoolkeep.log');
const PRINT_FILES_FILE = path.join(__dirname, 'data', 'print_files.json');
const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.ensureDir(UPLOADS_DIR);
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB file size limit

// Log to both console and file
function logMsg(level, message, error = null) {
  const timestamp = new Date().toISOString();
  const errorSuffix = error ? ` | Error: ${error.stack || error.message || error}` : '';
  const logLine = `[${timestamp}] [${level}] ${message}${errorSuffix}\n`;
  console.log(logLine.trim());
  
  fs.appendFile(LOG_FILE, logLine).catch(err => {
    console.error('Logging to file failed:', err.message);
  });
}

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase JSON body limit for photo upload base64 payloads

// Request logger middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logMsg('INFO', `${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Ensure Database File Exists
async function initDb() {
  await fs.ensureDir(path.dirname(DB_FILE));
  await fs.ensureDir(UPLOADS_DIR);
  
  if (!(await fs.pathExists(DB_FILE))) {
    await fs.writeJson(DB_FILE, []);
  } else {
    // Migrate existing spools from colorHex to colourHex
    try {
      const spools = await fs.readJson(DB_FILE);
      let migrated = false;
      spools.forEach(spool => {
        if (spool.colorHex !== undefined && spool.colourHex === undefined) {
          spool.colourHex = spool.colorHex;
          delete spool.colorHex;
          migrated = true;
        }
      });
      if (migrated) {
        await fs.writeJson(DB_FILE, spools);
        logMsg('INFO', 'Database migrated to use Canadian spelling (colourHex)');
      }
    } catch (err) {
      logMsg('ERROR', 'Failed to migrate database to colourHex', err);
    }
  }

  if (!(await fs.pathExists(PRINT_FILES_FILE))) {
    await fs.writeJson(PRINT_FILES_FILE, []);
  }

  if (!(await fs.pathExists(SETTINGS_FILE))) {
    await fs.writeJson(SETTINGS_FILE, { geminiApiKey: '' });
  }
}

// Encryption/Decryption Helpers for secure settings storage
function encryptKey(text) {
  if (!text) return '';
  try {
    const algorithm = 'aes-256-gcm';
    // ENCRYPTION_KEY should be set in .env for any internet-accessible deployment.
    // The fallback is intentional for zero-config LAN use; it provides no security
    // against an attacker who already has filesystem access.
    const secret = process.env.ENCRYPTION_KEY || 'spoolkeep-default-secret-salt-key-32chars';
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    logMsg('ERROR', 'Symmetric encryption failed', error);
    return text;
  }
}

function decryptKey(cipherText) {
  if (!cipherText) return '';
  if (!cipherText.startsWith('enc:')) {
    return cipherText; // older plaintext version
  }
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 4) return cipherText;
    
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encrypted = parts[3];
    
    const algorithm = 'aes-256-gcm';
    // ENCRYPTION_KEY should be set in .env for any internet-accessible deployment.
    // The fallback is intentional for zero-config LAN use; it provides no security
    // against an attacker who already has filesystem access.
    const secret = process.env.ENCRYPTION_KEY || 'spoolkeep-default-secret-salt-key-32chars';
    const key = crypto.createHash('sha256').update(secret).digest();
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    logMsg('ERROR', 'Symmetric decryption failed. Check ENCRYPTION_KEY.', error);
    return '';
  }
}

// Generate Alphanumeric Spool ID
function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `sp_${result}`;
}

function extractFilamentDetails(html, url) {
  const $ = cheerio.load(html);

  let name = '';
  let brand = '';
  let type = '';
  let colourHex = '#7f8c8d';
  let minTemp = 200;
  let maxTemp = 220;
  let bedMinTemp = 50;
  let bedMaxTemp = 60;

  const pageText = $('body').text().replace(/\s+/g, ' ');
  const pageTitle = $('title').text().trim();

  const isAmazon = url.includes('amazon.');
  const is3dFilamentProfiles = url.includes('3dfilamentprofiles.com');

  if (isAmazon) {
    name = $('#productTitle').text().trim() || pageTitle;
    const brandText = $('#bylineInfo').text().trim() || '';
    const brandMatch = brandText.match(/(?:Visit the\s+)?([^ ]+)(?:\s+Store)?/i);
    brand = brandMatch ? brandMatch[1] : '';
  } else if (is3dFilamentProfiles) {
    name = pageTitle.replace('| 3D Filament Profiles', '').trim();
    brand = $('dt:contains("Brand"), th:contains("Brand")').next().text().trim() || '';
    if (!brand) {
      const match = pageText.match(/Brand:\s*([^\n|]+)/i);
      if (match) brand = match[1].trim();
    }
  } else {
    name = $('h1').first().text().trim() || pageTitle;
    try {
      const urlObj = new URL(url);
      const hostParts = urlObj.hostname.replace('www.', '').split('.');
      brand = hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1);
    } catch (e) {
      brand = '';
    }
  }

  if (!brand && name) {
    const commonBrands = ['eSun', 'Polymaker', 'Prusament', 'Hatchbox', 'Overture', 'Sunlu', 'Amolen', 'Creality', 'Elegoo', 'GeeeTech', 'Flashforge', ' Inland', 'Prusa', ' Bambu Lab', 'FormFutura', 'Fillamentum', 'Proto-Pasta'];
    for (const b of commonBrands) {
      if (name.toLowerCase().includes(b.toLowerCase())) { brand = b; break; }
    }
  }

  const types = ['PLA\\+', 'PLA Pro', 'PLA-CF', 'PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PA', 'PC', 'PVA', 'PET', 'HIPS'];
  for (const t of types) {
    const regex = new RegExp(`\\b${t}\\b`, 'i');
    if (name.match(regex) || pageText.match(regex)) {
      type = t.replace('\\', '');
      break;
    }
  }
  if (!type) type = 'PLA';

  const nozzleRegexes = [
    /(?:print|printing|nozzle|hotend|extruder|extrusion)\s*(?:temp|temperature)?\s*(?:range)?\s*[:\-\s]*\s*(\d{3})\s*(?:-|to|~)\s*(\d{3})/i,
    /(\d{3})\s*-\s*(\d{3})\s*°?[CC]\b/i,
    /(\d{3})\s*(?:to|~)\s*(\d{3})\s*(?:degrees)?\s*°?[CC]\b/i
  ];
  let tempMatch = null;
  for (const regex of nozzleRegexes) {
    const match = pageText.match(regex);
    if (match) {
      const t1 = parseInt(match[1]);
      const t2 = parseInt(match[2]);
      // Sanity-check: valid 3D printing nozzle range is 150–320°C
      if (t1 >= 150 && t1 <= 320 && t2 >= 150 && t2 <= 320) { tempMatch = [t1, t2]; break; }
    }
  }
  if (tempMatch) {
    minTemp = Math.min(tempMatch[0], tempMatch[1]);
    maxTemp = Math.max(tempMatch[0], tempMatch[1]);
  } else {
    if (type.includes('PETG')) { minTemp = 220; maxTemp = 250; }
    else if (type.includes('ABS') || type.includes('ASA')) { minTemp = 230; maxTemp = 260; }
    else if (type.includes('TPU')) { minTemp = 200; maxTemp = 230; }
    else if (type.includes('Nylon') || type.includes('PA')) { minTemp = 240; maxTemp = 270; }
    else if (type.includes('PC')) { minTemp = 250; maxTemp = 285; }
    else { minTemp = 190; maxTemp = 220; }
  }

  const bedRegexes = [
    /(?:bed|platform|heated bed|table)\s*(?:temp|temperature)?\s*(?:range)?\s*[:\-\s]*\s*(\d{2,3})\s*(?:-|to|~)\s*(\d{2,3})/i,
    /(?:bed|heated\s+bed|platform)\s*(?:temp|temperature)?\s*[:\s]*(\d{2,3})/i
  ];
  let bedMatch = null;
  for (const regex of bedRegexes) {
    const match = pageText.match(regex);
    if (match) {
      const t1 = parseInt(match[1]);
      const t2 = match[2] ? parseInt(match[2]) : t1;
      // Sanity-check: valid bed range is 0–120°C
      if (t1 >= 0 && t1 <= 120 && t2 >= 0 && t2 <= 120) { bedMatch = [t1, t2]; break; }
    }
  }
  if (bedMatch) {
    bedMinTemp = Math.min(bedMatch[0], bedMatch[1]);
    bedMaxTemp = Math.max(bedMatch[0], bedMatch[1]);
  } else {
    if (type.includes('PETG')) { bedMinTemp = 70; bedMaxTemp = 80; }
    else if (type.includes('ABS') || type.includes('ASA')) { bedMinTemp = 90; bedMaxTemp = 110; }
    else if (type.includes('TPU')) { bedMinTemp = 30; bedMaxTemp = 60; }
    else if (type.includes('Nylon') || type.includes('PA')) { bedMinTemp = 70; bedMaxTemp = 90; }
    else if (type.includes('PC')) { bedMinTemp = 90; bedMaxTemp = 110; }
    else { bedMinTemp = 50; bedMaxTemp = 60; }
  }

  const colourMap = {
    'black': '#1e272e', 'white': '#f5f6fa', 'grey': '#718093', 'gray': '#718093',
    'silver': '#dcdde1', 'gold': '#f5cd79', 'bronze': '#cd7f32', 'copper': '#b87333',
    'red': '#e84118', 'blue': '#0097e6', 'green': '#44bd32', 'yellow': '#e1b12c',
    'orange': '#e67e22', 'purple': '#9b59b6', 'pink': '#fd79a8', 'brown': '#8d6e63',
    'clear': '#dff9fb', 'transparent': '#dff9fb', 'natural': '#f5f6fa', 'neon green': '#2ecc71',
    'neon yellow': '#f1c40f', 'teal': '#00a8ff', 'cyan': '#9c88ff', 'magenta': '#e056fd',
    'olive': '#55efc4'
  };

  let colourName = '';
  const nameLower = name.toLowerCase();
  for (const [cName, cHex] of Object.entries(colourMap)) {
    if (nameLower.includes(cName)) {
      colourHex = cHex;
      const wordMatch = name.match(new RegExp(`(?:(\\b\\w+\\b)\\s+)?\\b${cName}\\b`, 'i'));
      if (wordMatch) {
        const adjective = wordMatch[1];
        const commonDescriptors = ['silk', 'matte', 'ultra', 'glossy', 'magic', 'galaxy', 'rainbow', 'glow', 'wood', 'marble', 'twinkling', 'glitter', 'sparkle', 'translucent', 'semi-translucent', 'transparent', 'clear', 'natural', 'super'];
        if (adjective && commonDescriptors.includes(adjective.toLowerCase())) {
          colourName = `${adjective.charAt(0).toUpperCase() + adjective.slice(1).toLowerCase()} ${cName.charAt(0).toUpperCase() + cName.slice(1)}`;
        } else {
          colourName = cName.charAt(0).toUpperCase() + cName.slice(1);
        }
      } else {
        colourName = cName.charAt(0).toUpperCase() + cName.slice(1);
      }
      break;
    }
  }
  if (!colourName) colourName = 'Generic';
  const cleanName = `${colourName} ${type}`;

  let td = null;
  const tdMatch = pageText.match(/(?:transmission\s*distance|td)\s*[:\-\s]*\s*(\d+(?:\.\d+)?)/i);
  if (tdMatch) {
    const val = parseFloat(tdMatch[1]);
    if (val >= 0 && val <= 50) td = val;
  }

  return { name: cleanName, brand: brand.trim() || 'Generic', type, colourHex, minTemp, maxTemp, bedMinTemp, bedMaxTemp, td, notes: '' };
}

// REST APIs

// 1. Spools CRUD
app.get('/api/spools', async (_req, res) => {
  try {
    const spools = await fs.readJson(DB_FILE);
    res.json(spools);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read spools database' });
  }
});

app.post('/api/spools', async (req, res) => {
  try {
    const spools = await fs.readJson(DB_FILE);
    const newSpool = {
      id: req.body.id || generateId(),
      name: req.body.name || 'Unnamed Spool',
      brand: req.body.brand || 'Generic',
      type: req.body.type || 'PLA',
      colourHex: req.body.colourHex || req.body.colorHex || '#7f8c8d',
      minTemp: parseInt(req.body.minTemp) || 200,
      maxTemp: parseInt(req.body.maxTemp) || 220,
      bedMinTemp: parseInt(req.body.bedMinTemp) || 50,
      bedMaxTemp: parseInt(req.body.bedMaxTemp) || 60,
      usedPercentage: parseInt(req.body.usedPercentage) || 0,
      rfidLinked: req.body.rfidLinked || false,
      rfidId: req.body.rfidId || null,
      exportedToOrca: req.body.exportedToOrca || false,
      td: req.body.td !== undefined && req.body.td !== null && req.body.td !== '' ? parseFloat(req.body.td) : null,
      notes: req.body.notes || '',
      stock: req.body.stock !== undefined ? parseInt(req.body.stock) : 1,
      opened: req.body.opened !== undefined ? !!req.body.opened : false,
      dateOpened: req.body.dateOpened || null,
      dateAdded: req.body.dateAdded || new Date().toISOString()
    };
    spools.push(newSpool);
    await fs.writeJson(DB_FILE, spools);
    res.status(201).json(newSpool);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save spool' });
  }
});

app.put('/api/spools/:id', async (req, res) => {
  try {
    const spools = await fs.readJson(DB_FILE);
    const index = spools.findIndex(s => s.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Spool not found' });
    }

    spools[index] = {
      ...spools[index],
      name: req.body.name || spools[index].name,
      brand: req.body.brand || spools[index].brand,
      type: req.body.type || spools[index].type,
      colourHex: req.body.colourHex !== undefined ? req.body.colourHex : (req.body.colorHex !== undefined ? req.body.colorHex : (spools[index].colourHex || spools[index].colorHex)),
      minTemp: req.body.minTemp !== undefined ? parseInt(req.body.minTemp) : spools[index].minTemp,
      maxTemp: req.body.maxTemp !== undefined ? parseInt(req.body.maxTemp) : spools[index].maxTemp,
      bedMinTemp: req.body.bedMinTemp !== undefined ? parseInt(req.body.bedMinTemp) : spools[index].bedMinTemp,
      bedMaxTemp: req.body.bedMaxTemp !== undefined ? parseInt(req.body.bedMaxTemp) : spools[index].bedMaxTemp,
      usedPercentage: req.body.usedPercentage !== undefined ? parseInt(req.body.usedPercentage) : spools[index].usedPercentage,
      rfidLinked: req.body.rfidLinked !== undefined ? req.body.rfidLinked : spools[index].rfidLinked,
      rfidId: req.body.rfidId !== undefined ? req.body.rfidId : spools[index].rfidId,
      exportedToOrca: req.body.exportedToOrca !== undefined ? req.body.exportedToOrca : spools[index].exportedToOrca,
      td: req.body.td !== undefined ? (req.body.td !== null && req.body.td !== '' ? parseFloat(req.body.td) : null) : spools[index].td,
      notes: req.body.notes !== undefined ? req.body.notes : spools[index].notes,
      stock: req.body.stock !== undefined ? parseInt(req.body.stock) : (spools[index].stock !== undefined ? spools[index].stock : 1),
      opened: req.body.opened !== undefined ? !!req.body.opened : (spools[index].opened !== undefined ? !!spools[index].opened : false),
      dateOpened: req.body.dateOpened !== undefined ? req.body.dateOpened : (spools[index].dateOpened || null),
      dateAdded: req.body.dateAdded !== undefined ? req.body.dateAdded : (spools[index].dateAdded || new Date().toISOString())
    };

    await fs.writeJson(DB_FILE, spools);
    res.json(spools[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update spool' });
  }
});

app.delete('/api/spools/:id', async (req, res) => {
  try {
    let spools = await fs.readJson(DB_FILE);
    const initialLength = spools.length;
    spools = spools.filter(s => s.id !== req.params.id);
    if (spools.length === initialLength) {
      return res.status(404).json({ error: 'Spool not found' });
    }
    await fs.writeJson(DB_FILE, spools);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete spool' });
  }
});

app.post('/api/spools/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'IDs must be an array' });
    }
    let spools = await fs.readJson(DB_FILE);
    spools = spools.filter(s => !ids.includes(s.id));
    await fs.writeJson(DB_FILE, spools);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to bulk delete spools' });
  }
});

// 2. Web Scraper
app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 10000
    });

    const details = extractFilamentDetails(response.data, url);
    res.json(details);
  } catch (error) {
    logMsg('ERROR', 'Scrape error', error);
    res.status(500).json({ 
      error: 'Failed to scrape website. The target site might be protected or offline.', 
      details: error.message 
    });
  }
});

// 2.5 Settings, Web Search, and Photo OCR APIs
app.get('/api/settings', async (_req, res) => {
  try {
    const settings = await fs.readJson(SETTINGS_FILE);
    const envKey = process.env.GEMINI_API_KEY;
    const decryptedKey = decryptKey(settings.geminiApiKey);
    const hasGeminiKey = !!(envKey || decryptedKey);
    const isEnvOverridden = !!envKey;
    
    let maskedKey = '';
    if (envKey) {
      maskedKey = envKey.length > 8 
        ? envKey.substring(0, 6) + '...' + envKey.slice(-4) 
        : 'Configured via Environment';
    } else if (decryptedKey) {
      maskedKey = decryptedKey.length > 8 
        ? decryptedKey.substring(0, 6) + '...' + decryptedKey.slice(-4) 
        : '...';
    }

    res.json({
      geminiApiKey: maskedKey,
      hasGeminiKey,
      isEnvOverridden,
      defaultSpoolSort: settings.defaultSpoolSort || 'colour',
      defaultFilesSort: settings.defaultFilesSort || 'dateAddedNewest',
      td1sEnabled: settings.td1sEnabled || false,
      dataFolderSize: await getDataDirSize(path.join(__dirname, 'data'))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settings = await fs.readJson(SETTINGS_FILE);
    const envKey = process.env.GEMINI_API_KEY;
    const isEnvOverridden = !!envKey;
    
    if (!isEnvOverridden) {
      const newKey = req.body.geminiApiKey;
      if (newKey !== undefined) {
        if (newKey === '') {
          settings.geminiApiKey = '';
        } else if (!newKey.includes('...')) {
          settings.geminiApiKey = encryptKey(newKey);
        }
      }
      await fs.writeJson(SETTINGS_FILE, settings);
    }

    if (req.body.defaultSpoolSort !== undefined) {
      settings.defaultSpoolSort = req.body.defaultSpoolSort;
      await fs.writeJson(SETTINGS_FILE, settings);
    }
    if (req.body.defaultFilesSort !== undefined) {
      settings.defaultFilesSort = req.body.defaultFilesSort;
      await fs.writeJson(SETTINGS_FILE, settings);
    }
    if (req.body.td1sEnabled !== undefined) {
      settings.td1sEnabled = !!req.body.td1sEnabled;
      await fs.writeJson(SETTINGS_FILE, settings);
    }

    const decryptedKey = decryptKey(settings.geminiApiKey);
    const activeKey = envKey || decryptedKey;
    const maskedKey = activeKey 
      ? (activeKey.length > 8 
          ? activeKey.substring(0, 6) + '...' + activeKey.slice(-4) 
          : '...') 
      : '';

    res.json({
      success: true,
      geminiApiKey: maskedKey,
      hasGeminiKey: !!activeKey,
      isEnvOverridden,
      defaultSpoolSort: settings.defaultSpoolSort || 'colour',
      defaultFilesSort: settings.defaultFilesSort || 'dateAddedNewest',
      td1sEnabled: settings.td1sEnabled || false
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    const response = await axios.get('https://search.yahoo.com/search', {
      params: { p: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);
    const results = [];

    $('h3').each((_, el) => {
      const h3 = $(el);
      const h3Class = h3.attr('class') || '';
      if (!h3Class.includes('title')) return;

      const a = h3.closest('a');
      if (a.length === 0) return;

      const title = h3.text().trim();
      const rawUrl = a.attr('href');
      let targetUrl = rawUrl;

      if (rawUrl && rawUrl.includes('/RU=')) {
        try {
          const ruPart = rawUrl.split('/RU=')[1];
          const cleanPart = ruPart.split('/RK=')[0];
          targetUrl = decodeURIComponent(cleanPart);
        } catch (e) {
          // Keep raw targetUrl
        }
      }

      const container = a.parent();
      const snippet = container.find('.compText, .compText p, .compText span').text().trim() ||
                      container.nextAll('.compText, .compText p, .compText span').first().text().trim() ||
                      container.closest('li').find('.compText').text().trim();

      if (title && targetUrl && !targetUrl.includes('yahoo.com') && !targetUrl.includes('search.yahoo.com') && !results.some(r => r.url === targetUrl)) {
        results.push({ title, url: targetUrl, snippet });
      }
    });

    res.json(results.slice(0, 10));
  } catch (error) {
    logMsg('ERROR', 'Search proxy error', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

app.post('/api/ocr', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Image data is required' });
  }

  try {
    const settings = await fs.readJson(SETTINGS_FILE);
    const apiKey = process.env.GEMINI_API_KEY || decryptKey(settings.geminiApiKey);
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API Key is not set.', needsApiKey: true });
    }



    let base64Data = image;
    let mimeType = 'image/jpeg';
    if (image.startsWith('data:')) {
      const parts = image.split(';base64,');
      base64Data = parts[1];
      mimeType = parts[0].split('data:')[1].split(';')[0];
    }

    const prompt = `Identify the filament manufacturer/brand, filament material type (e.g. PLA, PETG, ABS, TPU), color name, transmission distance / TD value (a decimal number, often labeled as TD or Transmission Distance), and optimal print/bed temperature ranges if visible. Return the details in JSON format like this:
{
  "searchQuery": "brand name color type",
  "brand": "brand name",
  "type": "PLA",
  "color": "color name",
  "minTemp": 190,
  "maxTemp": 220,
  "bedMinTemp": 50,
  "bedMaxTemp": 60,
  "td": 4.5
}
If certain fields are not visible or can't be inferred, set them to null. Return ONLY the raw JSON object, no markdown codeblocks, no explanations.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ]
    };

    const geminiRes = await axios.post(geminiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 25000
    });

    const candidateText = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini API returned an empty response.');
    }

    let result;
    try {
      result = JSON.parse(candidateText.trim());
    } catch (err) {
      const jsonMatch = candidateText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0].trim());
      } else {
        throw new Error('Failed to parse Gemini response as JSON.');
      }
    }

    res.json(result);
  } catch (error) {
    logMsg('ERROR', 'OCR error. Response data: ' + JSON.stringify(error.response?.data), error);
    const errorDetails = error.response?.data?.error?.message || error.message;
    res.status(500).json({ error: 'OCR analysis failed', details: errorDetails });
  }
});

// 3. Open Filament Database Proxy API
app.get('/api/openfilament/brands', async (_req, res) => {
  try {
    const response = await axios.get('https://openfilamentcollective.github.io/open-filament-database/api/v1/brands/index.json');
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Open Filament DB brands', details: error.message });
  }
});

let ofdbCache = null;

async function getOfdbData() {
  if (ofdbCache) return ofdbCache;
  try {
    const response = await axios.get('https://api.openfilamentdatabase.org/json/all.json');
    ofdbCache = response.data;
    logMsg('INFO', `Open Filament Database cached successfully. Brands: ${ofdbCache.brands.length}, Filaments: ${ofdbCache.filaments.length}, Variants: ${ofdbCache.variants.length}`);
    return ofdbCache;
  } catch (error) {
    logMsg('ERROR', 'Failed to cache Open Filament DB data', error);
    throw error;
  }
}

app.get('/api/openfilament/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    const db = await getOfdbData();
    const qLower = query.toLowerCase();
    
    // Create maps for fast O(1) lookups
    const brandsMap = new Map(db.brands.map(b => [b.id, b]));
    const filamentsMap = new Map(db.filaments.map(f => [f.id, f]));

    const matches = [];
    for (const v of db.variants) {
      const filament = filamentsMap.get(v.filament_id);
      if (!filament) continue;
      
      const brand = brandsMap.get(filament.brand_id);
      if (!brand) continue;

      const fullName = `${brand.name} ${filament.name} (${v.name})`;
      if (fullName.toLowerCase().includes(qLower)) {
        matches.push({
          name: fullName,
          colorName: v.name,
          brand: brand.name,
          type: filament.material,
          colourHex: v.color_hex ? (v.color_hex.startsWith('#') ? v.color_hex : `#${v.color_hex}`) : '#337150',
          minTemp: filament.min_print_temperature || 200,
          maxTemp: filament.max_print_temperature || 220,
          bedMinTemp: filament.min_bed_temperature || 50,
          bedMaxTemp: filament.max_bed_temperature || 60
        });

        if (matches.length >= 50) break; // Cap at 50 results
      }
    }

    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: 'Global search failed', details: error.message });
  }
});

app.get('/api/openfilament/brand/:slug', async (req, res) => {
  try {
    const response = await axios.get(`https://openfilamentcollective.github.io/open-filament-database/api/v1/brands/${req.params.slug}/index.json`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: `Failed to fetch brand ${req.params.slug} details`, details: error.message });
  }
});

app.get('/api/openfilament/brand/:slug/material/:materialSlug', async (req, res) => {
  try {
    const response = await axios.get(`https://openfilamentcollective.github.io/open-filament-database/api/v1/brands/${req.params.slug}/materials/${req.params.materialSlug}/index.json`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: `Failed to fetch material ${req.params.materialSlug} details`, details: error.message });
  }
});

app.get('/api/openfilament/brand/:slug/material/:materialSlug/filament/:filamentSlug', async (req, res) => {
  try {
    const response = await axios.get(`https://openfilamentcollective.github.io/open-filament-database/api/v1/brands/${req.params.slug}/materials/${req.params.materialSlug}/filaments/${req.params.filamentSlug}/index.json`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: `Failed to fetch filament ${req.params.filamentSlug} details`, details: error.message });
  }
});


async function getDataDirSize(dir) {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await getDataDirSize(full);
      } else {
        try { total += (await fs.stat(full)).size; } catch {}
      }
    }
  } catch {}
  return total;
}

async function apply3MFColourPatch(zip, cv, spoolsDb) {
  const modelEntry = zip.getEntry('3D/3dmodel.model');
  if (modelEntry) {
    const $ = cheerio.load(modelEntry.getData().toString('utf8'), { xmlMode: true });
    const colourValues = cv.filaments.map(f => f.colorHex.replace('#', '')).join(';');
    const typeValues   = cv.filaments.map(f => f.type).join(';');
    let colourFound = false, typeFound = false;
    $('metadata').each((_, elem) => {
      const n = $(elem).attr('name')?.toLowerCase();
      if (n === 'filament_colour') { $(elem).text(colourValues); colourFound = true; }
      if (n === 'filament_type')   { $(elem).text(typeValues);   typeFound  = true; }
    });
    if (!colourFound) $('model').append(`<metadata name="filament_colour">${colourValues}</metadata>`);
    if (!typeFound)   $('model').append(`<metadata name="filament_type">${typeValues}</metadata>`);
    zip.updateFile('3D/3dmodel.model', Buffer.from($.xml()));
  }

  const psEntry = zip.getEntry('Metadata/project_settings.config');
  if (psEntry) {
    try {
      const config = JSON.parse(psEntry.getData().toString('utf8'));

      // Strip machine/gcode/temperature keys — these belong to the user's slicer profile,
      // not the model. Leaving them in causes OrcaSlicer to apply the wrong printer or
      // fail to resolve preset IDs from a different installation.
      const STRIP_KEYS = [
        'machine_start_gcode', 'machine_end_gcode', 'before_layer_change_gcode',
        'after_layer_change_gcode', 'layer_change_gcode', 'time_lapse_gcode',
        'change_filament_gcode', 'default_print_bed_model', 'default_print_bed_object',
        'printer_settings_id', 'print_settings_id', 'printer_model', 'printer_variant',
        'nozzle_diameter', 'printable_area', 'bed_shape', 'extruder_type', 'extruder_count',
        'single_extruder_multi_material', 'nozzle_temperature', 'nozzle_temperature_initial_layer',
        'hot_plate_temp', 'hot_plate_temp_initial_layer', 'bed_temperature',
        'bed_temperature_initial_layer', 'default_filament_profile', 'default_print_profile',
      ];
      for (const key of STRIP_KEYS) delete config[key];

      const filamentColours = [], filamentTypes = [], filamentSettingsIds = [], filamentVendors = [];

      for (const fil of cv.filaments) {
        const spool = fil.matchedSpoolId ? spoolsDb.find(s => s.id === fil.matchedSpoolId) : null;
        const hex   = fil.colorHex.startsWith('#') ? fil.colorHex : `#${fil.colorHex}`;
        const type  = spool?.type  || fil.type  || 'PLA';
        const brand = spool?.brand || fil.brand || 'Generic';
        const spoolName  = spool?.name || fil.name || `Generic ${type}`;
        const presetName = fil.isGeneric ? `Generic ${type}` : `${brand} ${spoolName}`;

        const baseType = type.toUpperCase().replace(/\+/g, '');
        let inheritsParent = 'Generic PLA';
        if (baseType.includes('PETG'))                              inheritsParent = 'Generic PETG';
        else if (baseType.includes('ABS'))                          inheritsParent = 'Generic ABS';
        else if (baseType.includes('ASA'))                          inheritsParent = 'Generic ASA';
        else if (baseType.includes('TPU'))                          inheritsParent = 'Generic TPU';
        else if (baseType.includes('NYLON') || baseType.includes('PA')) inheritsParent = 'Generic PA';
        else if (baseType.includes('PC'))                           inheritsParent = 'Generic PC';

        filamentColours.push(hex);
        filamentTypes.push(type);
        filamentSettingsIds.push(presetName);
        filamentVendors.push(brand);

        const filamentPreset = {
          name: presetName,
          from: 'User',
          inherits: inheritsParent,
          is_custom_defined_filament: '1',
          filament_settings_id: [presetName],
          filament_colour: [hex],
          default_filament_colour: [hex],
          filament_type: [type],
          filament_vendor: [brand],
        };
        const presetPath = `Metadata/filament_${fil.slot}.config`;
        const presetBuf  = Buffer.from(JSON.stringify(filamentPreset, null, 2));
        zip.getEntry(presetPath) ? zip.updateFile(presetPath, presetBuf) : zip.addFile(presetPath, presetBuf, '', 0);
      }

      config.filament_colour      = filamentColours;
      config.filament_type        = filamentTypes;
      config.filament_settings_id = filamentSettingsIds;
      config.filament_vendor      = filamentVendors;
      zip.updateFile('Metadata/project_settings.config', Buffer.from(JSON.stringify(config, null, 2)));
    } catch (err) {
      logMsg('WARNING', 'Could not patch project_settings.config — skipping', err);
    }
  }
  return zip;
}

async function extractFilamentsFrom3MF(filePath) {
  const filaments = [];
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    const modelEntry = entries.find(e => e.entryName === '3D/3dmodel.model');
    if (modelEntry) {
      const $ = cheerio.load(modelEntry.getData().toString('utf8'), { xmlMode: true });
      let colorsText = '', typesText = '';
      $('metadata').each((_, elem) => {
        const n = ($(elem).attr('name') || '').toLowerCase();
        if (n === 'filament_colour' || n === 'filament_color') colorsText = $(elem).text() || $(elem).attr('value') || '';
        else if (n === 'filament_type') typesText = $(elem).text() || $(elem).attr('value') || '';
      });
      if (colorsText) {
        const colors = colorsText.split(';').map(c => c.trim());
        const types  = typesText ? typesText.split(';').map(t => t.trim()) : [];
        for (let i = 0; i < colors.length; i++) filaments.push({ colorHex: colors[i] || '#7f8c8d', type: types[i] || 'PLA' });
      }
      if (filaments.length === 0) {
        $('color, m\\:color').each((i, elem) => {
          let hex = $(elem).attr('color') || '';
          if (!hex.startsWith('#')) hex = '#' + hex;
          if (hex.length === 9) hex = hex.slice(0, 7);
          if (hex.length === 7) filaments.push({ colorHex: hex, type: 'PLA', role: $(elem).attr('name') || `Color ${i + 1}` });
        });
      }
      if (filaments.length === 0) {
        $('base, m\\:base').each((i, elem) => {
          let hex = $(elem).attr('displaycolor') || $(elem).attr('color') || '';
          if (!hex.startsWith('#')) hex = '#' + hex;
          if (hex.length === 9) hex = hex.slice(0, 7);
          if (hex.length === 7) filaments.push({ colorHex: hex, type: 'PLA', role: $(elem).attr('name') || `Material ${i + 1}` });
        });
      }
    }

    if (filaments.length === 0) {
      const psEntry = entries.find(e => e.entryName === 'Metadata/project_settings.config');
      if (psEntry) {
        try {
          const config = JSON.parse(psEntry.getData().toString('utf8'));
          const colors = config.filament_colour || config.filament_color;
          const types  = config.filament_type;
          const names  = config.filament_settings_id || config.filament_preset_name;
          if (Array.isArray(colors)) {
            for (let i = 0; i < colors.length; i++) {
              if (colors[i]) filaments.push({ colorHex: colors[i], type: (types && types[i]) || 'PLA', role: (names && names[i]) || '' });
            }
          }
        } catch (err) {
          logMsg('WARNING', 'Failed to parse project_settings.config', err);
        }
      }
    }

    if (filaments.length === 0) {
      for (const entry of entries) {
        const n = entry.entryName.toLowerCase();
        if (n.endsWith('.config') || n.endsWith('.ini') || n.endsWith('.gcode')) {
          const text = entry.getData().toString('utf8');
          const cm = text.match(/filament_colou?r\s*=\s*([^\r\n]+)/);
          const tm = text.match(/filament_type\s*=\s*([^\r\n]+)/);
          if (cm) {
            const colors = cm[1].split(';').map(c => c.trim());
            const types  = tm ? tm[1].split(';').map(t => t.trim()) : [];
            for (let i = 0; i < colors.length; i++) filaments.push({ colorHex: colors[i] || '#7f8c8d', type: types[i] || 'PLA' });
            break;
          }
        }
      }
    }

    const seen = new Set();
    const unique = filaments.filter(f => {
      const k = `${f.colorHex.toLowerCase()}_${(f.type || 'PLA').toLowerCase()}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });
    filaments.length = 0;
    filaments.push(...unique);

  } catch (err) {
    logMsg('WARNING', 'Error extracting filaments from 3MF ZIP', err);
  }
  return filaments;
}

async function matchFilamentToInventory(colorHex, type) {
  try {
    const spools = await fs.readJson(DB_FILE);
    if (!spools?.length) return null;

    let hex = colorHex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    if (hex.length !== 6) return null;

    const r1 = parseInt(hex.slice(0,2), 16);
    const g1 = parseInt(hex.slice(2,4), 16);
    const b1 = parseInt(hex.slice(4,6), 16);

    let bestSpool = null;
    let minDistance = 255 * 3;
    const targetType = (type || 'PLA').toUpperCase().replace(/\+/g, '');

    for (const spool of spools) {
      if ((spool.type || 'PLA').toUpperCase().replace(/\+/g, '') !== targetType) continue;
      let sHex = (spool.colourHex || spool.colorHex || '').replace('#', '');
      if (sHex.length === 3) sHex = sHex[0]+sHex[0]+sHex[1]+sHex[1]+sHex[2]+sHex[2];
      if (sHex.length !== 6) continue;
      const r2 = parseInt(sHex.slice(0,2), 16);
      const g2 = parseInt(sHex.slice(2,4), 16);
      const b2 = parseInt(sHex.slice(4,6), 16);
      const distance = Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
      if (distance < minDistance) { minDistance = distance; bestSpool = spool; }
    }

    if (bestSpool && minDistance < 60) {
      return { id: bestSpool.id, name: bestSpool.name, brand: bestSpool.brand, type: bestSpool.type, colourHex: bestSpool.colourHex };
    }
  } catch (error) {
    logMsg('ERROR', 'Error matching filament to inventory', error);
  }
  return null;
}

// Helper to guess a generic color name from hex code
function getGenericColorName(hex) {
  const colourMap = {
    'black': '#1e272e', 'white': '#f5f6fa', 'grey': '#718093', 'gray': '#718093',
    'silver': '#dcdde1', 'gold': '#f5cd79', 'bronze': '#cd7f32', 'copper': '#b87333',
    'red': '#e84118', 'blue': '#0097e6', 'green': '#44bd32', 'yellow': '#e1b12c',
    'orange': '#e67e22', 'purple': '#9b59b6', 'pink': '#fd79a8', 'brown': '#8d6e63',
    'clear': '#dff9fb', 'teal': '#00a8ff', 'cyan': '#9c88ff', 'magenta': '#e056fd',
    'olive': '#55efc4'
  };

  let hexClean = hex.replace('#', '').toLowerCase();
  if (hexClean.length === 3) {
    hexClean = hexClean[0] + hexClean[0] + hexClean[1] + hexClean[1] + hexClean[2] + hexClean[2];
  }
  if (hexClean.length !== 6) return 'Generic';

  const r1 = parseInt(hexClean.slice(0, 2), 16);
  const g1 = parseInt(hexClean.slice(2, 4), 16);
  const b1 = parseInt(hexClean.slice(4, 6), 16);

  let closestName = 'Generic';
  let minDistance = 255 * 3;

  for (const [name, targetHex] of Object.entries(colourMap)) {
    const tHex = targetHex.replace('#', '');
    const r2 = parseInt(tHex.slice(0, 2), 16);
    const g2 = parseInt(tHex.slice(2, 4), 16);
    const b2 = parseInt(tHex.slice(4, 6), 16);

    const distance = Math.sqrt(
      Math.pow(r1 - r2, 2) +
      Math.pow(g1 - g2, 2) +
      Math.pow(b1 - b2, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestName = name.charAt(0).toUpperCase() + name.slice(1);
    }
  }

  return closestName;
}

// Get all print files
app.get('/api/print-files', async (_req, res) => {
  try {
    const files = await fs.readJson(PRINT_FILES_FILE);
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read print files database' });
  }
});

// Upload new model — accepts stlFile and/or threeMfFile
app.post('/api/print-files', upload.fields([
  { name: 'stlFile', maxCount: 1 },
  { name: 'threeMfFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const stlFileObj = req.files?.['stlFile']?.[0] || null;
    const threeMfFileObj = req.files?.['threeMfFile']?.[0] || null;

    if (!stlFileObj && !threeMfFileObj) {
      return res.status(400).json({ error: 'At least one file (STL or 3MF) must be uploaded.' });
    }
    if (stlFileObj && path.extname(stlFileObj.originalname).toLowerCase() !== '.stl') {
      await fs.remove(stlFileObj.path);
      return res.status(400).json({ error: 'STL file must have .stl extension.' });
    }
    if (threeMfFileObj && path.extname(threeMfFileObj.originalname).toLowerCase() !== '.3mf') {
      if (stlFileObj) await fs.remove(stlFileObj.path);
      await fs.remove(threeMfFileObj.path);
      return res.status(400).json({ error: '3MF file must have .3mf extension.' });
    }

    const { name, description, sourceUrl, thumbnail } = req.body;
    const finalModelId = `pm_${crypto.randomBytes(6).toString('hex')}`;

    let stlFileData = null;
    if (stlFileObj) {
      stlFileData = {
        fileName: stlFileObj.originalname,
        filePath: path.relative(__dirname, stlFileObj.path).replace(/\\/g, '/'),
        fileSize: stlFileObj.size,
        uploadedAt: new Date().toISOString()
      };
    }

    let threeMfFileData = null;
    let extractedThumbnails = [];

    if (threeMfFileObj) {
      const parsedFilaments = await extractFilamentsFrom3MF(threeMfFileObj.path);
      const baseSlots = parsedFilaments.map((fil, i) => ({
        slot: i + 1,
        colorHex: fil.colorHex,
        type: fil.type || 'PLA',
        role: fil.role || ''
      }));

      threeMfFileData = {
        fileName: threeMfFileObj.originalname,
        filePath: path.relative(__dirname, threeMfFileObj.path).replace(/\\/g, '/'),
        fileSize: threeMfFileObj.size,
        uploadedAt: new Date().toISOString(),
        baseSlots
      };

      try {
        const zip = new AdmZip(threeMfFileObj.path);
        const entries = zip.getEntries();
        const thumbEntries = entries.filter(entry => {
          const eName = entry.entryName.toLowerCase();
          if (!eName.startsWith('metadata/')) return false;
          if (!eName.endsWith('.png') && !eName.endsWith('.jpg') && !eName.endsWith('.jpeg')) return false;
          return /^metadata\/plate_\d+\.(png|jpg|jpeg)$/.test(eName) ||
                 /^metadata\/thumbnail\.(png|jpg|jpeg)$/.test(eName);
        });
        thumbEntries.sort((a, b) => {
          const na = a.entryName.toLowerCase();
          const nb = b.entryName.toLowerCase();
          if (na.includes('thumbnail')) return -1;
          if (nb.includes('thumbnail')) return 1;
          return na.localeCompare(nb);
        });
        for (let idx = 0; idx < thumbEntries.length; idx++) {
          const entry = thumbEntries[idx];
          const buf = entry.getData();
          const ext = path.extname(entry.entryName);
          const thumbPath = `data/uploads/${finalModelId}_thumb_${idx}${ext}`;
          await fs.outputFile(path.join(__dirname, thumbPath), buf);
          extractedThumbnails.push(thumbPath);
        }
      } catch (err) {
        logMsg('WARNING', 'Failed to extract 3MF thumbnails', err);
      }
    }

    let coverThumbnailPath = extractedThumbnails[0] || null;
    if (!coverThumbnailPath && thumbnail && thumbnail.startsWith('data:image/jpeg;base64,')) {
      const base64Data = thumbnail.replace(/^data:image\/jpeg;base64,/, '');
      coverThumbnailPath = `data/uploads/${finalModelId}_thumb_0.jpg`;
      await fs.outputFile(path.join(__dirname, coverThumbnailPath), base64Data, 'base64');
      extractedThumbnails = [coverThumbnailPath];
    }

    const colourVersions = [];
    const baseSlots = threeMfFileData?.baseSlots || [];
    if (baseSlots.length > 0) {
      const cvFilaments = [];
      for (const slot of baseSlots) {
        const match = await matchFilamentToInventory(slot.colorHex, slot.type);
        if (match) {
          cvFilaments.push({
            slot: slot.slot,
            colorHex: match.colourHex,
            matchedSpoolId: match.id,
            brand: match.brand,
            type: match.type,
            name: match.name,
            isGeneric: false,
            role: slot.role
          });
        } else {
          const colorName = getGenericColorName(slot.colorHex);
          cvFilaments.push({
            slot: slot.slot,
            colorHex: slot.colorHex,
            matchedSpoolId: null,
            brand: 'Generic',
            type: slot.type,
            name: `Generic ${colorName} ${slot.type}`,
            isGeneric: true,
            role: slot.role
          });
        }
      }
      colourVersions.push({
        id: `cv_${crypto.randomBytes(6).toString('hex')}`,
        versionNumber: 1,
        name: 'Colour Version 1',
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        filaments: cvFilaments
      });
    }

    const modelName = name ||
      (stlFileData ? stlFileData.fileName.replace(/\.stl$/i, '') :
       threeMfFileData.fileName.replace(/\.3mf$/i, ''));

    const newModel = {
      id: finalModelId,
      name: modelName,
      description: description || '',
      sourceUrl: sourceUrl || '',
      dateAdded: new Date().toISOString(),
      thumbnail: coverThumbnailPath || null,
      thumbnails: extractedThumbnails,
      stlFile: stlFileData,
      threeMfFile: threeMfFileData,
      colourVersions
    };

    const filesDb = await fs.readJson(PRINT_FILES_FILE);
    filesDb.push(newModel);
    await fs.writeJson(PRINT_FILES_FILE, filesDb);
    res.status(201).json(newModel);
  } catch (error) {
    logMsg('ERROR', 'Error uploading print file', error);
    res.status(500).json({ error: 'Failed to process and save print file upload' });
  }
});

// Download raw STL
app.get('/api/print-files/download/:id/stl', async (req, res) => {
  try {
    const filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.id);
    if (!model?.stlFile) return res.status(404).json({ error: 'STL file not found' });
    const absPath = path.join(__dirname, model.stlFile.filePath);
    if (!(await fs.pathExists(absPath))) return res.status(404).json({ error: 'STL file not found on disk' });
    res.download(absPath, model.stlFile.fileName);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download STL file' });
  }
});


// Download raw 3MF
app.get('/api/print-files/download/:id/3mf', async (req, res) => {
  try {
    const filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.id);
    if (!model?.threeMfFile) return res.status(404).json({ error: '3MF file not found' });
    const absPath = path.join(__dirname, model.threeMfFile.filePath);
    if (!(await fs.pathExists(absPath))) return res.status(404).json({ error: '3MF file not found on disk' });
    res.download(absPath, model.threeMfFile.fileName);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download 3MF file' });
  }
});

// Download colour-patched 3MF
app.get('/api/print-files/download/:id/3mf/:cvId', async (req, res) => {
  try {
    const filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.id);
    if (!model?.threeMfFile) return res.status(404).json({ error: '3MF file not found' });
    const cv = (model.colourVersions || []).find(c => c.id === req.params.cvId);
    if (!cv) return res.status(404).json({ error: 'Colour version not found' });

    const absPath = path.join(__dirname, model.threeMfFile.filePath);
    if (!(await fs.pathExists(absPath))) return res.status(404).json({ error: '3MF file not found on disk' });

    const spoolsDb = await fs.readJson(DB_FILE);
    const zip = await apply3MFColourPatch(new AdmZip(absPath), cv, spoolsDb);
    const patchedBuffer = zip.toBuffer();
    const safeModelName = model.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeModelName}_cv${cv.versionNumber}.3mf"`,
      'Content-Length': patchedBuffer.length
    });
    res.send(patchedBuffer);
  } catch (error) {
    logMsg('ERROR', 'Error patching 3MF', error);
    res.status(500).json({ error: 'Failed to generate patched 3MF' });
  }
});

// Attach a 3MF to an existing print file (Feature 1)
app.post('/api/print-files/:id/attach-3mf', upload.single('threeMfFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (path.extname(req.file.originalname).toLowerCase() !== '.3mf') {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'File must have .3mf extension.' });
    }

    const filesDb = await fs.readJson(PRINT_FILES_FILE);
    const index = filesDb.findIndex(m => m.id === req.params.id);
    if (index === -1) {
      await fs.remove(req.file.path);
      return res.status(404).json({ error: 'Model not found.' });
    }
    const model = filesDb[index];

    if (model.threeMfFile?.filePath) {
      await fs.remove(path.join(__dirname, model.threeMfFile.filePath)).catch(() => {});
    }

    const parsedFilaments = await extractFilamentsFrom3MF(req.file.path);
    const baseSlots = parsedFilaments.map((fil, i) => ({
      slot: i + 1, colorHex: fil.colorHex, type: fil.type || 'PLA', role: fil.role || ''
    }));

    if (!model.thumbnails?.length) {
      try {
        const zip = new AdmZip(req.file.path);
        const thumbEntries = zip.getEntries().filter(e => {
          const n = e.entryName.toLowerCase();
          return n.startsWith('metadata/') &&
            (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg')) &&
            (/^metadata\/plate_\d+\.(png|jpg|jpeg)$/.test(n) || /^metadata\/thumbnail\.(png|jpg|jpeg)$/.test(n));
        }).sort((a, b) => {
          const na = a.entryName.toLowerCase(), nb = b.entryName.toLowerCase();
          if (na.includes('thumbnail')) return -1;
          if (nb.includes('thumbnail')) return 1;
          return na.localeCompare(nb);
        });
        const extracted = [];
        for (let i = 0; i < thumbEntries.length; i++) {
          const ext = path.extname(thumbEntries[i].entryName);
          const thumbPath = `data/uploads/${model.id}_thumb_${i}${ext}`;
          await fs.outputFile(path.join(__dirname, thumbPath), thumbEntries[i].getData());
          extracted.push(thumbPath);
        }
        if (extracted.length) filesDb[index].thumbnails = extracted;
      } catch (thumbErr) {
        logMsg('WARNING', 'Could not extract thumbnails from attached 3MF', thumbErr);
      }
    }

    filesDb[index].threeMfFile = {
      fileName: req.file.originalname,
      filePath: path.relative(__dirname, req.file.path).replace(/\\/g, '/'),
      fileSize: req.file.size,
      uploadedAt: new Date().toISOString(),
      baseSlots
    };
    await fs.writeJson(PRINT_FILES_FILE, filesDb);
    res.json(filesDb[index]);
  } catch (error) {
    if (req.file) await fs.remove(req.file.path).catch(() => {});
    logMsg('ERROR', 'Error attaching 3MF', error);
    res.status(500).json({ error: 'Failed to attach 3MF file.' });
  }
});

app.get('/api/print-files/:id/colour-versions/:cvId/orca-export', async (req, res) => {
  try {
    const filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found.' });
    const cv = (model.colourVersions || []).find(c => c.id === req.params.cvId);
    if (!cv) return res.status(404).json({ error: 'Colour version not found.' });
    if (!cv.filaments?.length) return res.status(400).json({ error: 'Colour version has no filament assignments.' });

    const TYPE_INHERITS = {
      PLA: 'Generic PLA', PLAPLUS: 'Generic PLA+', 'PLA+': 'Generic PLA+',
      PETG: 'Generic PETG', PETGCF: 'Generic PETG-CF', 'PETG-CF': 'Generic PETG-CF',
      ABS: 'Generic ABS', ASA: 'Generic ASA',
      TPU: 'Generic TPU', 'TPU95A': 'Generic TPU', 'TPU98A': 'Generic TPU',
      PA: 'Generic PA', NYLON: 'Generic PA', 'PA-CF': 'Generic PA-CF', PACF: 'Generic PA-CF',
      PC: 'Generic PC', PVA: 'Generic PVA', HIPS: 'Generic HIPS', PP: 'Generic PP',
    };

    const zip = new AdmZip();
    const slotLines = [];

    for (const fil of cv.filaments) {
      const typeKey = (fil.type || 'PLA').toUpperCase().replace(/[\s+]/g, '');
      const inherits = TYPE_INHERITS[typeKey] || `Generic ${fil.type || 'PLA'}`;
      const presetName = `SK ${fil.brand} ${fil.name}`.slice(0, 64);
      const preset = {
        name: presetName,
        from: 'User',
        is_custom_defined: '1',
        inherits,
        filament_colour: [fil.colorHex || '#FFFFFF'],
        filament_type: [fil.type || 'PLA'],
        filament_vendor: [fil.brand || 'Generic'],
      };
      const filename = presetName.replace(/[/\\:*?"<>|]/g, '_') + '.json';
      zip.addFile(filename, Buffer.from(JSON.stringify(preset, null, 2)));
      slotLines.push(`  Slot ${fil.slot}: ${fil.brand} ${fil.name} (${fil.type}) — ${fil.colorHex}`);
    }

    const readme = [
      'SpoolKeep OrcaSlicer Colour Export',
      `Model: ${model.name}`,
      `Colour Version: ${cv.name || `v${cv.versionNumber}`}`,
      '',
      'To use these filament presets in OrcaSlicer:',
      '  1. Copy the .json files to your OrcaSlicer user filaments folder:',
      '       Windows : %AppData%\\OrcaSlicer\\user\\default\\filament\\',
      '       macOS   : ~/Library/Application Support/OrcaSlicer/user/default/filament/',
      '       Linux   : ~/.config/OrcaSlicer/user/default/filament/',
      '  2. Restart OrcaSlicer',
      '  3. Assign each preset to the matching filament slot when setting up your print',
      '',
      'Slot assignments:',
      ...slotLines,
    ].join('\n');
    zip.addFile('README.txt', Buffer.from(readme));

    if (model.stlFile) {
      const stlPath = path.join(__dirname, model.stlFile);
      if (await fs.pathExists(stlPath)) {
        zip.addLocalFile(stlPath, '', path.basename(model.stlFile));
      }
    }

    const safe = model.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}_cv${cv.versionNumber}_orca.zip"`);
    res.send(zip.toBuffer());
  } catch (error) {
    logMsg('ERROR', 'Error generating OrcaSlicer export', error);
    res.status(500).json({ error: 'Failed to generate OrcaSlicer export.' });
  }
});

// Serve cover thumbnail
app.get('/api/print-files/thumbnail/:modelId/plate/:index', async (req, res) => {
  try {
    const filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.modelId);
    const idx = parseInt(req.params.index);
    if (!model?.thumbnails || isNaN(idx) || !model.thumbnails[idx]) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    const absPath = path.join(__dirname, model.thumbnails[idx]);
    if (!(await fs.pathExists(absPath))) return res.status(404).json({ error: 'Thumbnail not found on disk' });
    res.sendFile(absPath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve plate thumbnail' });
  }
});

app.get('/api/print-files/thumbnail/:modelId', async (req, res) => {
  try {
    const filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.modelId);
    if (!model?.thumbnail) return res.status(404).json({ error: 'Thumbnail not found' });
    const absPath = path.join(__dirname, model.thumbnail);
    if (!(await fs.pathExists(absPath))) return res.status(404).json({ error: 'Thumbnail not found on disk' });
    res.sendFile(absPath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

// Edit model metadata
app.put('/api/print-files/:id', async (req, res) => {
  try {
    const filesDb = await fs.readJson(PRINT_FILES_FILE);
    const index = filesDb.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Model not found' });
    if (req.body.name !== undefined) filesDb[index].name = req.body.name;
    if (req.body.description !== undefined) filesDb[index].description = req.body.description;
    if (req.body.sourceUrl !== undefined) filesDb[index].sourceUrl = req.body.sourceUrl;
    await fs.writeJson(PRINT_FILES_FILE, filesDb);
    res.json(filesDb[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update print file' });
  }
});

// Delete model + all files on disk
app.delete('/api/print-files/:id', async (req, res) => {
  try {
    let filesDb = await fs.readJson(PRINT_FILES_FILE);
    const modelIndex = filesDb.findIndex(m => m.id === req.params.id);
    if (modelIndex === -1) return res.status(404).json({ error: 'Model not found' });

    const model = filesDb[modelIndex];

    if (model.stlFile) {
      await fs.remove(path.join(__dirname, model.stlFile.filePath))
        .catch(err => logMsg('WARNING', `Could not delete STL ${model.stlFile.filePath}`, err));
    }
    if (model.threeMfFile) {
      await fs.remove(path.join(__dirname, model.threeMfFile.filePath))
        .catch(err => logMsg('WARNING', `Could not delete 3MF ${model.threeMfFile.filePath}`, err));
    }
    for (const tp of (model.thumbnails || [])) {
      await fs.remove(path.join(__dirname, tp))
        .catch(err => logMsg('WARNING', `Could not delete thumbnail ${tp}`, err));
    }

    filesDb = filesDb.filter(m => m.id !== req.params.id);
    await fs.writeJson(PRINT_FILES_FILE, filesDb);
    res.json({ success: true });
  } catch (error) {
    logMsg('ERROR', 'Error deleting print file model', error);
    res.status(500).json({ error: 'Failed to delete print file' });
  }
});

// Gemini color recommendations → writes to latest colour version (creates one if none)
app.post('/api/print-files/:id/recommend-colors', async (req, res) => {
  try {
    const settings = await fs.readJson(SETTINGS_FILE);
    const apiKey = process.env.GEMINI_API_KEY || decryptKey(settings.geminiApiKey);
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API Key is not set. Go to Settings and configure it.', needsApiKey: true });
    }

    let filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const currentSpools = await fs.readJson(DB_FILE);

    const prompt = `You are a 3D printing assistant. The user uploaded an STL model named "${model.name}" (${model.description || 'No description provided'}).
Since STL files do not have built-in color information, you need to recommend up to 4 individual colors/filaments from their inventory that would look great when printing this model.

Here is their current filament inventory:
${JSON.stringify(currentSpools.map(s => ({ id: s.id, name: s.name, brand: s.brand, type: s.type, colourHex: s.colourHex })))}

Recommend a cohesive color scheme. For example, if it's a dinosaur, recommend greens/browns. If it's a desk organizer, recommend neat office colors (grey, black, blue). If it's a cartoon character, match the character's typical colors.
If their inventory is empty or none of their spools match the model's theme, you can recommend generic colors (set "spoolId" to null, "brand" to "Generic", and provide the standard name/hex).

Return a JSON object with a single key "recommendations" containing an array of up to 4 objects. Each object must have:
- spoolId: string (the matched spool ID from inventory, or null if it's a generic recommendation)
- name: string (spool name or generic name, e.g. "Generic Orange PLA")
- brand: string (spool brand or "Generic")
- type: string (spool type, e.g. "PLA")
- colorHex: string (the hex color code)
- role: string (what this color should be used for, e.g. "Main Body", "Base", "Accent", "Highlights")

Return ONLY the raw JSON. Do not wrap in markdown code blocks.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    if (model.thumbnail) {
      const absThumbPath = path.join(__dirname, model.thumbnail);
      if (await fs.pathExists(absThumbPath)) {
        const base64Image = (await fs.readFile(absThumbPath)).toString('base64');
        payload.contents[0].parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Image } });
      }
    }

    const geminiRes = await axios.post(geminiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 25000
    });

    const candidateText = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) throw new Error('Gemini API returned an empty response.');

    let parsedResult;
    try {
      parsedResult = JSON.parse(candidateText.trim());
    } catch {
      const jsonMatch = candidateText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsedResult = JSON.parse(jsonMatch[0].trim());
      else throw new Error('Failed to parse Gemini response as JSON.');
    }

    if (!parsedResult.recommendations || !Array.isArray(parsedResult.recommendations)) {
      throw new Error('Invalid JSON format returned from Gemini.');
    }

    const recommendedFilaments = parsedResult.recommendations.map((rec, index) => ({
      slot: index + 1,
      colorHex: rec.colorHex || '#7f8c8d',
      matchedSpoolId: rec.spoolId || null,
      brand: rec.brand || 'Generic',
      type: rec.type || 'PLA',
      name: rec.name || 'Generic Filament',
      isGeneric: !rec.spoolId,
      role: rec.role || ''
    }));

    if (!model.colourVersions || model.colourVersions.length === 0) {
      model.colourVersions = [{
        id: `cv_${crypto.randomBytes(6).toString('hex')}`,
        versionNumber: 1,
        name: 'Colour Version 1',
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        filaments: recommendedFilaments
      }];
    } else {
      model.colourVersions[model.colourVersions.length - 1].filaments = recommendedFilaments;
    }

    await fs.writeJson(PRINT_FILES_FILE, filesDb);
    res.json(model);
  } catch (error) {
    logMsg('ERROR', 'Gemini recommendation error', error);
    const errorDetails = error.response?.data?.error?.message || error.message;
    res.status(500).json({ error: 'Gemini recommendation failed', details: errorDetails });
  }
});

// Add colour version
app.post('/api/print-files/:id/colour-versions', async (req, res) => {
  try {
    const { name, date, filaments } = req.body;
    let filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    if (!model.colourVersions) model.colourVersions = [];
    const versionNumber = model.colourVersions.length + 1;

    model.colourVersions.push({
      id: `cv_${crypto.randomBytes(6).toString('hex')}`,
      versionNumber,
      name: name || `Colour Version ${versionNumber}`,
      date: date || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      filaments: filaments || []
    });

    await fs.writeJson(PRINT_FILES_FILE, filesDb);
    res.status(201).json(model);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add colour version' });
  }
});

// Update colour version (rename, re-date, update filaments)
app.put('/api/print-files/:id/colour-versions/:cvId', async (req, res) => {
  try {
    let filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const cv = (model.colourVersions || []).find(c => c.id === req.params.cvId);
    if (!cv) return res.status(404).json({ error: 'Colour version not found' });

    if (req.body.name !== undefined) cv.name = req.body.name;
    if (req.body.date !== undefined) cv.date = req.body.date;
    if (req.body.filaments !== undefined) cv.filaments = req.body.filaments;

    await fs.writeJson(PRINT_FILES_FILE, filesDb);
    res.json(model);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update colour version' });
  }
});

// Delete colour version
app.delete('/api/print-files/:id/colour-versions/:cvId', async (req, res) => {
  try {
    let filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    model.colourVersions = (model.colourVersions || []).filter(c => c.id !== req.params.cvId);
    await fs.writeJson(PRINT_FILES_FILE, filesDb);
    res.json(model);
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete colour version' });
  }
});

// Re-check inventory match for a colour version
app.post('/api/print-files/:id/colour-versions/:cvId/match-spools', async (req, res) => {
  try {
    let filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const cv = (model.colourVersions || []).find(c => c.id === req.params.cvId);
    if (!cv) return res.status(404).json({ error: 'Colour version not found' });

    for (const fil of cv.filaments) {
      const match = await matchFilamentToInventory(fil.colorHex, fil.type);
      if (match) {
        fil.matchedSpoolId = match.id;
        fil.brand = match.brand;
        fil.name = match.name;
        fil.isGeneric = false;
      } else {
        fil.matchedSpoolId = null;
        fil.isGeneric = true;
      }
    }

    await fs.writeJson(PRINT_FILES_FILE, filesDb);
    res.json(model);
  } catch (error) {
    res.status(500).json({ error: 'Failed to re-match filaments' });
  }
});

// Disable browser caching for service worker to prevent stale code issues
// Mark a print file as printed right now
app.put('/api/print-files/:id/last-printed', async (req, res) => {
  try {
    const filesDb = await fs.readJson(PRINT_FILES_FILE);
    const model = filesDb.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Print file not found' });
    if (req.body && 'date' in req.body) {
      model.lastPrinted = req.body.date ? new Date(req.body.date).toISOString() : null;
    } else {
      model.lastPrinted = new Date().toISOString();
    }
    await fs.writeJson(PRINT_FILES_FILE, filesDb, { spaces: 2 });
    res.json(model);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update last printed date' });
  }
});

app.use((req, res, next) => {
  if (req.path === '/sw.js') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Serve static files from the React frontend app in production
const distPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start Server
initDb().then(() => {
  logMsg('INFO', 'Database initialized successfully');
  app.listen(PORT, () => {
    logMsg('INFO', `SpoolKeep Backend running on port ${PORT}`);
  });
}).catch(err => {
  logMsg('ERROR', 'Database initialization error', err);
});
