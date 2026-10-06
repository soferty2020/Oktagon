import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type ConversationDetails,
  type ConversationView,
  type MessageView,
} from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard } from '../../shared/permissions.guard';
import { CreateConversationDto, ListMessagesQueryDto, SendMessageDto } from './chat.dto';
import { ChatService } from './chat.service';

/**
 * Диалоги: групповые чаты и личные переписки (BR-012, ADR-0011, ADR-0012).
 *
 * Спецификация: BR-012, docs/05-user-stories.md («написать тренеру», «участвовать
 * в групповом чате»), docs/21-permission-matrix.md («Chat: own conversations» для
 * MEMBER, «assigned conversations» для STAFF).
 *
 * **Права на доступ к чатам не требуются.** Матрица прав описывает чат как
 * ресурс («own conversations» / «assigned conversations»), а не как capability:
 * доступ определяется участием в диалоге, и проверяется сервисом на каждом
 * запросе. Требование `chat.use` здесь противоречило бы матрице: у роли MEMBER
 * базовых прав нет, и родитель не смог бы написать тренеру, хотя BR-012 это
 * прямо разрешает. `chat.use` остается в каталоге как индивидуальная выдача для
 * STAFF, но доступ к переписке выражает не он.
 */
@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Диалоги пользователя с числом непрочитанных' })
  @ApiOkResponse({ description: 'Групповые чаты своих групп и личные переписки' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ConversationView[]> {
    return this.chat.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Открыть диалог: чат группы или личную переписку' })
  @ApiCreatedResponse({
    description: 'Существующий диалог, если он уже был: повторный не создается',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationView> {
    return this.chat.create(user.id, {
      groupId: dto.groupId,
      participantIds: dto.participantIds,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'История диалога' })
  @ApiOkResponse({
    description: 'Сообщения от старых к новым; чтение сдвигает отметку о прочитанном',
  })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<ConversationDetails> {
    return this.chat.get(user.id, id, query.olderThan);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Отправить сообщение' })
  @ApiCreatedResponse({ description: 'Сообщение отправлено' })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageView> {
    return this.chat.sendMessage(user.id, id, { body: dto.body });
  }
}

/**
 * Сообщения: удаление.
 *
 * Отдельный контроллер и корневой путь `/messages`, а не
 * `DELETE /conversations/messages/{id}`: вложенный маршрут перехватывался бы
 * `GET /conversations/{id}`, и «messages» уходил бы как идентификатор диалога.
 * Та же причина, по которой комментарии новостей живут на `/news-comments`.
 *
 * Права не требуются по той же причине, что и в `ChatController`: доступ
 * определяется участием в диалоге, а удалять можно только свои сообщения.
 */
@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly chat: ChatService) {}

  @Delete(':messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Удалить свое сообщение (мягкое удаление)' })
  @ApiOkResponse({ description: 'Сообщение помечено удаленным; текст больше не отдается' })
  deleteMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
  ): Promise<{ id: string; isDeleted: true }> {
    return this.chat.deleteMessage(user.id, messageId);
  }
}
