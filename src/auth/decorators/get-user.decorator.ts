import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

export const GetUser = createParamDecorator((data, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  const user = req.user;
  console.log(data);

  if (!user) throw new InternalServerErrorException('User not found (request)');
  if (data == 'email') return user.email;

  return user;
});
