import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

export const GetRawHeaders = createParamDecorator(
  (data, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();

    const raw = req.rawHeaders;
    console.log(raw);

    if (!raw)
      throw new InternalServerErrorException('User not found (request)');

    return raw;
  },
);
