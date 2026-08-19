import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return '¡Despliegue automático OK!';
  }
}

// Estoy tratanso de hacer un cambio para probar el despliegue automático
