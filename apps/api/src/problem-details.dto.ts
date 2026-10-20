import { ApiProperty } from '@nestjs/swagger';

export class ProblemDetailsDto {
  @ApiProperty({ type: String, example: 'about:blank' })
  type!: string;

  @ApiProperty({ type: String, example: 'Not Found' })
  title!: string;

  @ApiProperty({ type: Number, example: 404 })
  status!: number;

  @ApiProperty({ type: String, example: 'NOT_FOUND' })
  code!: string;

  @ApiProperty({ type: String, example: 'The request could not be processed.' })
  detail!: string;

  @ApiProperty({ type: String, example: '0123456789abcdef0123456789abcdef' })
  traceId!: string;
}
