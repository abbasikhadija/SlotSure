import { Router } from 'express';
import { requireUser, requireCustomer } from '../middleware/auth.js';

export function bookingsRouter({ pool, service }) {
  const router = Router();
  router.post('/', requireUser(pool), requireCustomer, async (req, res) => {
    const booking = await service.book(req.user.id, req.body);
    res.status(201).json({ booking });
  });
  return router;
}
