import { type Request, type Response, type NextFunction } from 'express';
import { DataSource } from 'typeorm';
import SettingsEntity from '../entities/settings.entity.js';

/**
 * Express middleware that enforces GitHub authentication on protected routes.
 * Returns 401 if the user is not authenticated (no GitHub token stored).
 */
export function requireAuth(dataSource: DataSource) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repository = dataSource.getRepository(SettingsEntity);
      const settings = await repository.findOneBy({ id: 1 });

      if (!settings?.githubToken) {
        return res
          .status(401)
          .json({ error: 'Authentication required. Please connect your GitHub account.' });
      }

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ error: 'Failed to verify authentication' });
    }
  };
}
