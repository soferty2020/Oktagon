import { Module } from '@nestjs/common';

import { NewsService } from './news.service';

/**
 * Модуль news.
 *
 * Спецификация: BR-011, docs/22-erd.md (NewsPost, NewsComment).
 * Публичный контракт и бизнес-логика добавляются отдельным issue
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Module({
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
