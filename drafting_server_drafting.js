const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const DATA_DIR = process.env.DATA_DIR || '/home/jd2117/private/jit';
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 100 * 1024 * 1024); // 100 MB max request body

const SAVE_ENDPOINT = '/save-jit';
const CHUNK_ENDPOINT = '/save-jit/gaze-chunk';

function safeText(value) {
  return String(value || 'unknown')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/__+/g, '_')
    .slice(0, 128);
}

function getCorsHeaders(req) {
  const origin = req.headers.origin;
  const allowOrigin = ALLOWED_ORIGIN === '*' ? '*' : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function send(res, statusCode, data, type = 'application/json', req = null) {
  const headers = { 'Content-Type': type, ...getCorsHeaders(req) };
  res.writeHead(statusCode, headers);
  res.end(data);
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytesRead = 0;

    req.on('data', (chunk) => {
      bytesRead += chunk.length;
      if (bytesRead > MAX_BODY_BYTES) {
        req.destroy();
        return reject(new Error('request body too large'));
      }
      body += chunk;
    });

    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

function getSessionKey(body) {
  const sessionId = body.participantIDs?.session_id;
  const studyId = body.participantIDs?.study_id;
  const prolificId = body.participantIDs?.prolific_pid;
  const fallback = body.participantId;
  return safeText(sessionId || studyId || prolificId || fallback || 'unknown');
}

async function writeJsonFile(filepath, json) {
  await ensureDir(path.dirname(filepath));
  await fs.promises.writeFile(filepath, JSON.stringify(json, null, 2), 'utf8');
}

async function collectChunkFiles(sessionDir) {
  const chunkDir = path.join(sessionDir, 'chunks');
  try {
    const files = await fs.promises.readdir(chunkDir);
    return files.filter((name) => name.endsWith('.json')).sort();
  } catch (err) {
    return [];
  }
}

async function mergeChunkGaze(body, sessionDir) {
  const chunkFiles = await collectChunkFiles(sessionDir);
  if (!chunkFiles.length) {
    return body;
  }

  const mergedGaze = [];
  for (const filename of chunkFiles) {
    const filepath = path.join(sessionDir, 'chunks', filename);
    try {
      const raw = await fs.promises.readFile(filepath, 'utf8');
      const chunkBody = JSON.parse(raw);
      if (Array.isArray(chunkBody.gazeLog)) {
        mergedGaze.push(...chunkBody.gazeLog);
      }
    } catch (err) {
      console.error('Failed to read chunk file for merge:', filepath, err.message);
    }
  }

  if (Array.isArray(body.gazeLog)) {
    mergedGaze.push(...body.gazeLog);
  }

  body.gazeLog = mergedGaze;
  body._mergedFromChunks = true;
  body._mergedChunkFiles = chunkFiles;
  return body;
}

function getQuerySessionKey(searchParams) {
  const sessionId = searchParams.get('session_id') || searchParams.get('sessionId');
  const studyId = searchParams.get('study_id') || searchParams.get('studyId');
  const prolificId = searchParams.get('prolific_pid') || searchParams.get('prolificPid');
  const participantId = searchParams.get('participantId') || searchParams.get('participant_id');
  return safeText(sessionId || studyId || prolificId || participantId || 'unknown');
}

async function readLatestSessionPayload(sessionDir) {
  try {
    const files = await fs.promises.readdir(sessionDir);
    const sessionFiles = files
      .filter((name) => name.startsWith('session-') && name.endsWith('.json'))
      .sort();
    if (!sessionFiles.length) return null;
    const latestFile = sessionFiles[sessionFiles.length - 1];
    return await fs.promises.readFile(path.join(sessionDir, latestFile), 'utf8');
  } catch (err) {
    return null;
  }
}

async function handleSessionFetch(req, res, searchParams) {
  const sessionKey = getQuerySessionKey(searchParams);
  const queryDebug = Object.fromEntries(searchParams.entries());
  if (!sessionKey || sessionKey === 'unknown') {
    console.warn('Compiled session fetch missing query identifier', queryDebug);
    return send(res, 400, JSON.stringify({ success: false, error: 'missing session identifier', query: queryDebug }), 'application/json', req);
  }

  const sessionDir = path.join(DATA_DIR, sessionKey);
  const payload = await readLatestSessionPayload(sessionDir);
  if (!payload) {
    console.warn('Compiled session fetch could not find session directory', { sessionKey, query: queryDebug });
    return send(res, 404, JSON.stringify({ success: false, error: 'session not found', sessionKey }), 'application/json', req);
  }

  console.log('Serving compiled session payload:', { sessionKey, query: queryDebug });
  send(res, 200, payload, 'application/json', req);
}


async function handleSavePayload(req, res, body) {
  const sessionKey = getSessionKey(body);
  const sessionDir = path.join(DATA_DIR, sessionKey);
  await ensureDir(sessionDir);

  const mergedBody = await mergeChunkGaze(body, sessionDir);
  const filename = `session-${Date.now()}.json`;
  const filepath = path.join(sessionDir, filename);
  await writeJsonFile(filepath, mergedBody);

  console.log('Saved final session payload:', { sessionKey, file: path.relative(DATA_DIR, filepath), chunksMerged: mergedBody._mergedChunkFiles?.length || 0 });
  send(res, 200, JSON.stringify({ success: true, file: path.relative(DATA_DIR, filepath), chunksMerged: mergedBody._mergedChunkFiles?.length || 0 }), 'application/json', req);
}

async function handleChunkUpload(req, res, body) {
  const sessionKey = getSessionKey(body);
  const chunkSequence = Number.isInteger(body.chunk_sequence) ? body.chunk_sequence : Date.now();
  const chunkStart = Number.isInteger(body.chunk_start_index) ? body.chunk_start_index : 0;
  const sessionDir = path.join(DATA_DIR, sessionKey);
  const chunkDir = path.join(sessionDir, 'chunks');

  await ensureDir(chunkDir);

  const filename = `chunk-${String(chunkSequence).padStart(4, '0')}-${String(chunkStart).padStart(6, '0')}-${Date.now()}.json`;
  const filepath = path.join(chunkDir, filename);
  await writeJsonFile(filepath, body);

  console.log('Saved gaze chunk:', { sessionKey, chunkSequence, chunkStart, file: path.relative(DATA_DIR, filepath) });
  send(res, 200, JSON.stringify({ success: true, file: path.relative(DATA_DIR, filepath) }), 'application/json', req);
}

function isStaticFileRequest(pathname) {
  return pathname === '/' || pathname.startsWith('/assets/') || pathname.startsWith('/web/') || pathname.endsWith('.html') || pathname.endsWith('.js') || pathname.endsWith('.css') || pathname.endsWith('.json') || pathname.endsWith('.svg') || pathname.endsWith('.png') || pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || pathname.endsWith('.bin');
}

function getMimeType(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  return (
    ext === '.js' ? 'application/javascript' :
    ext === '.mjs' ? 'application/javascript' :
    ext === '.css' ? 'text/css' :
    ext === '.json' ? 'application/json' :
    ext === '.svg' ? 'image/svg+xml' :
    ext === '.png' ? 'image/png' :
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
    ext === '.bin' ? 'application/octet-stream' :
    'text/html'
  );
}

async function serveStaticFile(req, res, pathname) {
  const distRoot = path.join(__dirname, 'dist');
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const finalPath = path.join(distRoot, requestPath);

  if (!finalPath.startsWith(distRoot)) {
    return send(res, 403, 'Forbidden', 'text/plain', req);
  }

  try {
    const data = await fs.promises.readFile(finalPath);
    const mime = getMimeType(finalPath);
    send(res, 200, data, mime, req);
  } catch (err) {
    send(res, 404, 'Not found', 'text/plain', req);
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    return send(res, 204, '', 'text/plain', req);
  }

  if (req.method === 'POST' && pathname === SAVE_ENDPOINT) {
    try {
      const body = await readJsonBody(req);
      return await handleSavePayload(req, res, body);
    } catch (err) {
      if (err instanceof Error && err.message === 'request body too large') {
        return send(res, 413, JSON.stringify({ success: false, error: 'request body too large' }), 'application/json', req);
      }
      return send(res, 400, JSON.stringify({ success: false, error: 'invalid json' }), 'application/json', req);
    }
  }

  if (req.method === 'POST' && pathname === CHUNK_ENDPOINT) {
    try {
      const body = await readJsonBody(req);
      return await handleChunkUpload(req, res, body);
    } catch (err) {
      if (err instanceof Error && err.message === 'request body too large') {
        return send(res, 413, JSON.stringify({ success: false, error: 'request body too large' }), 'application/json', req);
      }
      return send(res, 400, JSON.stringify({ success: false, error: 'invalid json' }), 'application/json', req);
    }
  }

  if (req.method === 'GET' && pathname === `${SAVE_ENDPOINT}/session`) {
    return await handleSessionFetch(req, res, parsedUrl.searchParams);
  }

  if (req.method === 'GET' && isStaticFileRequest(pathname)) {
    return serveStaticFile(req, res, pathname);
  }

  if (req.method === 'HEAD' && isStaticFileRequest(pathname)) {
    const distRoot = path.join(__dirname, 'dist');
    const requestPath = pathname === '/' ? '/index.html' : pathname;
    const finalPath = path.join(distRoot, requestPath);
    if (!finalPath.startsWith(distRoot)) {
      return send(res, 403, 'Forbidden', 'text/plain', req);
    }
    try {
      await fs.promises.access(finalPath, fs.constants.R_OK);
      return send(res, 200, '', 'text/plain', req);
    } catch {
      return send(res, 404, 'Not found', 'text/plain', req);
    }
  }

  return send(res, 404, 'Not found', 'text/plain', req);
});

(async () => {
  await ensureDir(DATA_DIR);
  server.listen(PORT, HOST, () => {
    console.log(`Listening on ${HOST}:${PORT}`);
    console.log(`DATA_DIR=${DATA_DIR}`);
    console.log(`ALLOWED_ORIGIN=${ALLOWED_ORIGIN}`);
    console.log(`POST ${SAVE_ENDPOINT} to save final payload`);
    console.log(`POST ${CHUNK_ENDPOINT} to save gaze chunk payload`);
  });
})();
