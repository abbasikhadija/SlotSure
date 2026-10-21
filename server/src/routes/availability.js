import { Router } from 'express';

export function providerAvailabilityRouter(service) {
  const router = Router();
  router.get('/hours', async (_req, res) => res.json(await service.getHours()));
  router.put('/hours', async (req, res) =>
    res.json(await service.setHours(req.body)),
  );
  router.get('/blocks', async (_req, res) =>
    res.json(await service.getBlocks()),
  );
  router.post('/blocks', async (req, res) =>
    res.status(201).json(await service.block(req.body)),
  );
  router.delete('/blocks/:id', async (req, res) =>
    res.json(await service.unblock(req.params.id)),
  );
  return router;
}
