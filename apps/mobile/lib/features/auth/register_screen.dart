import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import 'auth_controller.dart';

/// Самостоятельная регистрация родителя (ADR-0015).
///
/// Аккаунт создаётся без детей: после входа человек видит новости клуба и может
/// привязать ребёнка кодом от тренера или заявкой. Это убирает тупик «попросите
/// администратора отправить приглашение» на первом запуске.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _phone = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _firstName.dispose();
    _lastName.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }

    final ok = await widget.auth.register(
      email: _email.text,
      password: _password.text,
      firstName: _firstName.text,
      lastName: _lastName.text,
      phone: _phone.text,
    );

    if (!mounted) {
      return;
    }

    if (ok) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Регистрация')),
      body: ListenableBuilder(
        listenable: widget.auth,
        builder: (context, _) {
          return Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                const Text(
                  'Создайте аккаунт. После регистрации вы сможете привязать ребёнка '
                  'по коду от тренера или оставить заявку.',
                ),
                const SizedBox(height: AppSpacing.lg),
                TextFormField(
                  controller: _lastName,
                  decoration: const InputDecoration(labelText: 'Фамилия'),
                  validator: (value) =>
                      (value ?? '').trim().isEmpty ? 'Укажите фамилию' : null,
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _firstName,
                  decoration: const InputDecoration(labelText: 'Имя'),
                  validator: (value) => (value ?? '').trim().isEmpty ? 'Укажите имя' : null,
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Электронная почта'),
                  validator: (value) =>
                      (value ?? '').contains('@') ? null : 'Укажите корректный email',
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _password,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Пароль'),
                  validator: (value) =>
                      (value ?? '').length < 8 ? 'Пароль короче 8 символов' : null,
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Телефон (необязательно)'),
                ),
                if (widget.auth.error != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  Text(widget.auth.error!, style: const TextStyle(color: Colors.red)),
                ],
                const SizedBox(height: AppSpacing.lg),
                FilledButton(
                  onPressed: widget.auth.busy ? null : _submit,
                  child: Text(widget.auth.busy ? 'Создаём…' : 'Зарегистрироваться'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
