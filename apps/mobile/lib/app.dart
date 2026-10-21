import 'package:flutter/material.dart';

import '../features/auth/auth_controller.dart';
import '../features/auth/login_screen.dart';
import 'app_theme.dart';

/// Корневой виджет приложения.
///
/// Показывает экран входа или основную часть в зависимости от состояния сессии.
/// Проверка сохраненной сессии идет при запуске: если токены есть и живы,
/// человек не должен вводить пароль каждый раз.
class OctagonApp extends StatelessWidget {
  const OctagonApp({super.key, required this.authController});

  final AuthController authController;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'OCTAGON',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: ListenableBuilder(
        listenable: authController,
        builder: (context, _) {
          return switch (authController.status) {
            AuthStatus.checking => const _SplashScreen(),
            AuthStatus.unauthenticated => LoginScreen(controller: authController),
            AuthStatus.authenticated => HomeScreen(controller: authController),
          };
        },
      ),
    );
  }
}

/// Заставка на время проверки сессии.
class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'OCTAGON',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: 2),
            ),
            SizedBox(height: 24),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

/// Временная главная после входа.
///
/// Заглушка до H2–H3 (переключатель спортсменов и домашний экран по роли). Уже
/// здесь показываются роль и действующие права: по ним видно, что вход прошел с
/// теми правами, которые выданы на сервере, а не теми, что ожидались.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.controller});

  final AuthController controller;

  @override
  Widget build(BuildContext context) {
    final user = controller.user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('OCTAGON'),
        actions: [
          IconButton(
            tooltip: 'Выйти',
            icon: const Icon(Icons.logout),
            onPressed: controller.busy ? null : controller.logout,
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Здравствуйте, ${user?.displayName ?? ''}',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      user?.email ?? '',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: const Color(0xFF777777),
                          ),
                    ),
                    const SizedBox(height: 12),
                    _InfoRow(label: 'Роль', value: _roleLabel(user?.role)),
                    const SizedBox(height: 8),
                    _InfoRow(label: 'Права', value: '${user?.permissions.length ?? 0}'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Что дальше', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    const Text(
                      'Главная, расписание, посещаемость, новости и чат появятся в '
                      'следующих шагах. Сейчас проверен вход и хранение сессии.',
                      style: TextStyle(color: Color(0xFF666666)),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _roleLabel(String? role) {
    return switch (role) {
      'MEMBER' => 'Участник клуба',
      'STAFF' => 'Сотрудник',
      'SUPERADMIN' => 'Суперадминистратор',
      _ => role ?? 'неизвестно',
    };
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 110,
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF888888),
                ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
        ),
      ],
    );
  }
}
