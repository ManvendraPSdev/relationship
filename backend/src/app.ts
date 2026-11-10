import cors from 'cors';
import express from 'express';
import { healthController } from './controllers/health.controller';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { videoRouter } from './routes/video.routes';

export const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '10kb' }));

app.get('/api/v1/health', healthController);
app.use('/api/v1/videos', videoRouter);

app.use(notFoundHandler);
app.use(errorHandler);
