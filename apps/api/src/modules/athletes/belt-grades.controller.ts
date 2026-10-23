import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BELT_GRADES, type BeltGradeView } from '@octagon/contracts';

import { AuthGuard } from '../../shared/auth-stub';

/**
 * Справочник поясов (K3, BR-015).
 *
 * Только чтение. Эндпоинтов создания, изменения и удаления нет намеренно:
 * набор фиксирован, и acceptance требует, чтобы мутации отклонялись — их
 * попросту не существует.
 *
 * Доступно всем аутентифицированным: справочник нужен и админке (выбор пояса), и
 * мобильному приложению (отображение), и не содержит персональных данных.
 */
@ApiTags('belt-grades')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('belt-grades')
export class BeltGradesController {
  @Get()
  @ApiOperation({ summary: 'Фиксированный справочник поясов' })
  @ApiOkResponse({ description: 'Пояса по возрастанию ступени, с подписями и цветами' })
  list(): readonly BeltGradeView[] {
    return BELT_GRADES;
  }
}
