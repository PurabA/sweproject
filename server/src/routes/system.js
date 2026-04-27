import { Router } from 'express';
import { HMIS_SERVICE_CATEGORIES, HMIS_STAKEHOLDERS, HMIS_TOTAL_SERVICES } from '../data/hmisServicesCatalog.js';

const router = Router();

router.get('/stakeholders', (_req, res) => {
  res.json({ stakeholders: HMIS_STAKEHOLDERS });
});

router.get('/services', (_req, res) => {
  res.json({
    totalServices: HMIS_TOTAL_SERVICES,
    stakeholders: HMIS_STAKEHOLDERS,
    categories: HMIS_SERVICE_CATEGORIES,
  });
});

export default router;
