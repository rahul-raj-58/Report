import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import catalogRouter from './routes/catalog';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS ?? '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
}));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/v1/catalog-management', catalogRouter);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`catalog-api listening on http://localhost:${PORT}`);
  console.log('  GET /health');
  console.log('  GET /v1/catalog-management');
  console.log('  GET /v1/catalog-management?granularity=day');
  console.log('  GET /v1/catalog-management?granularity=month');
});
