import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

export const GetRawHeaders = createParamDecorator(
  (data, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();

    /// No registrar: incluye Authorization (JWT) y cookies.
    const raw = req.rawHeaders;

    if (!raw)
      throw new InternalServerErrorException('User not found (request)');

    return raw;
  },
);
