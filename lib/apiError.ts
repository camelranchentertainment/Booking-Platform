import type { NextApiRequest, NextApiResponse } from 'next';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

export function withHandler(handler: ApiHandler): ApiHandler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof AppError && err.isOperational) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('[API Error]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
