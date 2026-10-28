import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { NewsCommentsController, NewsController } from './news.controller';
import { NewsRepository, PrismaNewsRepository } from './news.repository';
import { NewsImagesService } from './news-images.service';
import { NewsService } from './news.service';

/**
 * Новости клуба и комментарии (эпик G, BR-011, ADR-0011).
 *
 * Спецификация: docs/22-erd.md (NewsPost, NewsComment),
 * docs/04-roles-permissions.md (`news.create/edit/delete/moderate`).
 *
 * `IdentityModule` нужен, чтобы узнать эффективные права вызывающего: видимость
 * чужого черновика зависит от `news.edit` и `news.moderate`, а права
 * вычисляются на каждом запросе (ADR-0006), а не читаются из токена.
 */
@Module({
  imports: [IdentityModule],
  controllers: [NewsController, NewsCommentsController],
  providers: [
    NewsService,
    NewsImagesService,
    PrismaNewsRepository,
    { provide: NewsRepository, useExisting: PrismaNewsRepository },
  ],
  exports: [NewsService],
})
export class NewsModule {}
