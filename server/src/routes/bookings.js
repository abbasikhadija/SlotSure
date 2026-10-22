import { Router } from 'express';
import { requireUser, requireCustomer } from '../middleware/auth.js';

export function bookingsRouter({ pool, service, management }) {
  const router = Router();
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
