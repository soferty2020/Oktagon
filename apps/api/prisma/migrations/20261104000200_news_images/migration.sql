-- Фотографии новостей (#70, ADR-0016).
--
-- Не больше трёх на запись; проверка количества — в API, здесь только таблица.

CREATE TABLE "news_images" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "news_images_post_id_idx" ON "news_images"("post_id");

ALTER TABLE "news_images" ADD CONSTRAINT "news_images_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "news_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
