import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrorCode,
  PermissionCode,
  type NewsCommentView,
  type NewsPostDetails,
  type NewsPostView,
} from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { ApiException } from '../../shared/api-exception';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import {
  CreateNewsCommentDto,
  CreateNewsPostDto,
  ListNewsQueryDto,
  UpdateNewsPostDto,
} from './news.dto';
import { MAX_IMAGE_BYTES, NewsImagesService, type UploadedImage } from './news-images.service';
import { NewsService } from './news.service';

/**
 * Новости клуба и комментарии (BR-011, ADR-0011).
 *
 * Спецификация: BR-011 («новости и комментарии видны всем пользователям клуба»),
 * docs/05-user-stories.md («тренер с правом публикует новости»),
 * docs/04-roles-permissions.md (`news.create/edit/delete/moderate`).
 *
 * Обратите внимание на распределение прав: **чтение не требует права**. Список и
 * комментарии доступны любому аутентифицированному пользователю, потому что
 * BR-011 говорит «всем», а права на чтение в каталоге нет. Права нужны на
 * действия:
 *
 * - `news.create` — создать новость и вести свой черновик;
 * - `news.edit` — править и публиковать чужое;
 * - `news.delete` — архивировать;
 * - `news.moderate` — удалять чужие комментарии и видеть чужие черновики.
 *
 * Тренеру по роли ни одно из них не выдается: публикация — индивидуальная выдача
 * (docs/05-user-stories.md).
 */
@ApiTags('news')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('news')
export class NewsController {
  constructor(
    private readonly news: NewsService,
    private readonly images: NewsImagesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Список новостей клуба' })
  @ApiOkResponse({ description: 'Опубликованные всем; черновики — автору и модератору' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNewsQueryDto,
  ): Promise<NewsPostView[]> {
    return this.news.list(user.id, {
      status: query.status,
      search: query.search,
      includeArchived: query.includeArchived,
    });
  }

  @Post()
  @RequirePermissions(PermissionCode.NewsCreate)
  @ApiOperation({ summary: 'Создать новость или черновик' })
  @ApiCreatedResponse({ description: 'Новость создана' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNewsPostDto,
  ): Promise<NewsPostView> {
    return this.news.create(user.id, {
      title: dto.title,
      body: dto.body,
      publish: dto.publish,
      isPinned: dto.isPinned,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Новость с комментариями' })
  @ApiOkResponse({ description: 'Карточка новости; чужой черновик отдает 404' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<NewsPostDetails> {
    return this.news.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить новость' })
  @ApiOkResponse({ description: 'Новость обновлена' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateNewsPostDto,
  ): Promise<NewsPostView> {
    return this.news.update(user.id, id, {
      title: dto.title,
      body: dto.body,
      isPinned: dto.isPinned,
    });
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Опубликовать новость' })
  @ApiOkResponse({ description: 'Новость опубликована' })
  publish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<NewsPostView> {
    return this.news.publish(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.NewsDelete)
  @ApiOperation({ summary: 'Архивировать новость (мягкое удаление)' })
  @ApiOkResponse({ description: 'Новость в архиве; из ленты исчезает, история сохраняется' })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<NewsPostView> {
    return this.news.archive(user.id, id);
  }

  /**
   * Фотография новости (#70).
   *
   * Файл приходит multipart-полем `file`, в памяти: 5 МБ и три штуки на новость —
   * пределы, за которыми карточка перестаёт быть читаемой. Проверка MIME — в
   * сервисе, по содержимому запроса, а не по расширению.
   */
  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  @ApiOperation({ summary: 'Загрузить фотографию новости' })
  @ApiCreatedResponse({ description: 'Фотография сохранена; не больше трёх на новость' })
  uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file?: UploadedImage,
  ) {
    if (!file) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Файл не передан в поле file',
      );
    }

    return this.images.addImage(user.id, id, file);
  }

  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить фотографию новости' })
  @ApiNoContentResponse({ description: 'Фото и файл удалены' })
  removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ): Promise<void> {
    return this.images.removeImage(user.id, id, imageId);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Прокомментировать новость' })
  @ApiCreatedResponse({ description: 'Комментарий добавлен; комментировать можно опубликованное' })
  addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateNewsCommentDto,
  ): Promise<NewsCommentView> {
    return this.news.addComment(user.id, id, { body: dto.body });
  }
}

/**
 * Комментарии: удаление.
 *
 * Отдельный контроллер, а не `DELETE /news/comments/{id}`: вложенный маршрут
 * перехватывался бы `GET /news/{id}`, и «comments» уходил бы как идентификатор
 * новости. Та же причина, по которой в финансах период открывается по паре
 * год/месяц, а изменения адресуются идентификатором периода.
 */
@ApiTags('news')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('news-comments')
export class NewsCommentsController {
  constructor(private readonly news: NewsService) {}

  @Delete(':commentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Удалить комментарий' })
  @ApiOkResponse({ description: 'Свой комментарий — автор, любой — с правом «news.moderate»' })
  deleteComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
  ): Promise<{ id: string; isDeleted: true }> {
    return this.news.deleteComment(user.id, commentId);
  }
}
