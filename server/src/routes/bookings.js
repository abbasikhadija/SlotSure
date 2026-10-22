import { Router } from 'express';
import { requireUser, requireCustomer } from '../middleware/auth.js';

export function bookingsRouter({ pool, service, management, confirmation }) {
  const router = Router();
  router.get(
    '/:id/confirmation.pdf',
    requireUser(pool),
    requireCustomer,
    async (req, res) => {
      const { filename, buffer } = await confirmation.download(
        req.user.id,
        req.params.id,
      );
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="${filename}"`);
      res.set('X-Content-Type-Options', 'nosniff');
      res.send(buffer);
    },
  );
  router.get('/my', requireUser(pool), requireCustomer, async (req, res) => {
    res.json(await management.list(req.user, req.query));
  });
  router.patch('/:id/cancel', requireUser(pool), async (req, res) => {
    res.json(await management.cancel(req.user.id, req.params.id, req.body));
  });
  router.post('/', requireUser(pool), requireCustomer, async (req, res) => {
    const booking = await service.book(req.user.id, req.body);
    res.status(201).json({ booking });
  });
  return router;
}
