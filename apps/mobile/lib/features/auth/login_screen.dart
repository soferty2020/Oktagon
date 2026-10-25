import 'package:flutter/material.dart';

import 'auth_controller.dart';

/// Экран входа (H1).
///
/// Одно приложение для всех ролей (docs/10-mobile-app.md), поэтому после входа
/// приложение показывает разделы по правам, а не по выбору роли: роль задана на
/// сервере, и выбирать ее вручную было бы лишним шагом.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.controller});

  final AuthController controller;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _passwordVisible = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }

    final success = await widget.controller.login(
      email: _emailController.text,
      password: _passwordController.text,
    );

    // Ошибка показывается через состояние контроллера; здесь ничего не делаем.
    if (!success) {
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final error = widget.controller.error;
        final busy = widget.controller.busy;

        return Scaffold(
          body: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 32),
                        Text(
                          'OCTAGON',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                                fontWeight: FontWeight.w800,
                                letterSpacing: 2,
                              ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Вход для участников и тренеров клуба',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: const Color(0xFF666666),
                              ),
                        ),
                        const SizedBox(height: 32),
                        TextFormField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          textInputAction: TextInputAction.next,
                          enabled: !busy,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            prefixIcon: Icon(Icons.mail_outline),
                          ),
                          validator: (value) {
                            final email = (value ?? '').trim();
                            if (email.isEmpty) {
                              return 'Укажите почту';
                            }
                            // Проверка на клиенте только для опечаток: настоящая
                            // валидация — на сервере.
                            if (!email.contains('@') || !email.contains('.')) {
                              return 'Похоже, в адресе почты опечатка';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _passwordController,
                          obscureText: !_passwordVisible,
                          enabled: !busy,
                          textInputAction: TextInputAction.done,
                          onFieldSubmitted: (_) => _submit(),
                          decoration: InputDecoration(
                            labelText: 'Пароль',
                            prefixIcon: const Icon(Icons.lock_outline),
                            suffixIcon: IconButton(
                              tooltip: _passwordVisible ? 'Скрыть пароль' : 'Показать пароль',
                              icon: Icon(
                                _passwordVisible ? Icons.visibility_off : Icons.visibility,
                              ),
                              onPressed: () => setState(
                                () => _passwordVisible = !_passwordVisible,
                              ),
                            ),
                          ),
                          validator: (value) {
                            if ((value ?? '').isEmpty) {
                              return 'Укажите пароль';
                            }
                            return null;
                          },
                        ),
                        if (error != null) ...[
                          const SizedBox(height: 16),
                          _ErrorBanner(message: error),
                        ],
                        const SizedBox(height: 24),
                        FilledButton(
                          onPressed: busy ? null : _submit,
                          child: busy
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text('Войти'),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Нет доступа? Попросите администратора клуба отправить приглашение.',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: const Color(0xFF888888),
                              ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Плашка ошибки. `Semantics(liveRegion)` — чтобы экранный диктор прочитал
/// сообщение: иначе человек с нарушением зрения не узнает, что вход не удался.
class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFEDED),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.error_outline, color: Color(0xFFB3261E), size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(color: Color(0xFFB3261E), fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
