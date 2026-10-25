import Image from 'next/image';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/server/session';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Вход — OCTAGON',
};

export default async function LoginPage() {
  // Уже вошедшего пользователя отправляем на главную: экран входа ему не нужен.
  const user = await getCurrentUser();
  if (user) {
    redirect('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-card bg-white p-8 shadow-sm">
        <div>
          {/* Логотип — оригинальный ассет клуба; alt повторяет название словами,
              чтобы скринридер не читал «octagon karate club» по буквам. */}
          <Image
            src="/brand/octagon-logo.png"
            alt="OCTAGON — каратэ-клуб"
            width={1100}
            height={307}
            className="mb-4 h-12 w-auto"
          />
          <p className="text-sm text-muted">Вход в панель управления клубом</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
