import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import 'auth_controller.dart';

/// Активация приглашения по коду (ADR-0014).
///
/// Ссылку-приглашение в зале открывать неудобно: тренер ставит приложение и
/// вводит 8 символов, которые передал суперадмин. Роль приходит из приглашения —
/// выбрать её здесь нельзя, иначе тренерский доступ получил бы любой.
class InviteCodeScreen extends StatefulWidget {
  const InviteCodeScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  State<InviteCodeScreen> createState() => _InviteCodeScreenState();
}

class _InviteCodeScreenState extends State<InviteCodeScreen> {
  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    _email.dispose();
    _password.dispose();
    _firstName.dispose();
    _lastName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }

    final ok = await widget.auth.acceptInviteCode(
      code: _code.text,
      email: _email.text,
      password: _password.text,
      firstName: _firstName.text,
      lastName: _lastName.text,
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
      appBar: AppBar(title: const Text('У меня есть код')),
      body: ListenableBuilder(
        listenable: widget.auth,
        builder: (context, _) {
          return Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                const Text(
                  'Введите код, который выдал администратор клуба, и заполните профиль.',
                ),
                const SizedBox(height: AppSpacing.lg),
                TextFormField(
                  controller: _code,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                    labelText: 'Код',
                    hintText: 'K7M2P4QX',
                  ),
                  validator: (value) =>
                      (value ?? '').trim().length < 6 ? 'Код слишком короткий' : null,
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Электронная почта'),
                  validator: (value) =>
                      (value ?? '').contains('@') ? null : 'Укажите email, на который выдан код',
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
                if (widget.auth.error != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  Text(widget.auth.error!, style: const TextStyle(color: Colors.red)),
                ],
                const SizedBox(height: AppSpacing.lg),
                FilledButton(
                  onPressed: widget.auth.busy ? null : _submit,
                  child: Text(widget.auth.busy ? 'Активируем…' : 'Активировать'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
