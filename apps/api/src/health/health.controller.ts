import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ProblemDetailsDto } from '../problem-details.dto.js';
import { HealthProbeGuard } from './health-probe.guard.js';

class HealthResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
}

@ApiTags('system')
@ApiExtraModels(ProblemDetailsDto)
@Controller('health')
@UseGuards(HealthProbeGuard)
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, type: HealthResponseDto })
  @ApiResponse({
    status: 500,
    description: 'RFC 7807 error response',
    content: {
      'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
    },
  })
  check(): HealthResponseDto {
    return { status: 'ok' };
  }
}
