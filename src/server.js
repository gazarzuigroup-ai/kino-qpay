import 'dotenv/config';
import express from 'express';
import { cookieParser } from './utils/identity.js';
import manychatRoutes from './routes/manychat.js';
import qpayRoutes from './routes/qpay.js';
import watchRoutes from './routes/watch.js';
import buyRoutes from './routes/buy.js';
import orderRoutes from './routes/order.js';
import myRoutes from './routes/my.js';
import messengerRoutes from './routes/messenger.js';
import catalogRoutes from './routes/catalog.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser);

app.get('/', (_req, res) => res.send('OK'));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/manychat', manychatRoutes);
app.use('/api/qpay', qpayRoutes);
app.use('/api/order', orderRoutes);
app.use('/buy', buyRoutes);
app.use('/my-movies', myRoutes);
app.use('/movies', catalogRoutes);
app.use('/watch', watchRoutes);
app.use('/webhook', messengerRoutes);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`kino-qpay сервер :${port} дээр ажиллаж байна`);
});
