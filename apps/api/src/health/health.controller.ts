import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';

import { HealthService, type LivenessReport, type ReadinessReport } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ description: 'Процесс API жив' })
  liveness(): LivenessReport {
    return this.health.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe: проверка зависимостей (PostgreSQL)' })
  @ApiOkResponse({ description: 'Все зависимости доступны' })
  @ApiServiceUnavailableResponse({ description: 'Зависимость недоступна' })
  async readiness(): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException({
        message: 'Service dependencies are not ready',
        details: { checks: report.checks },
      });
    }
    return report;
  }
}
