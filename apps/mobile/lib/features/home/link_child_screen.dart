import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import 'onboarding_repository.dart';

/// Привязка ребёнка (ADR-0015).
///
/// Два пути на одном экране: код от тренера — быстрый, заявка — когда кода нет.
/// Оба до подтверждения не открывают данные ребёнка, поэтому экран не обещает
/// мгновенного доступа: при заявке он честно говорит «ждём решения».
class LinkChildScreen extends StatefulWidget {
  const LinkChildScreen({
    super.key,
    required this.onboarding,
    required this.auth,
    this.onLinked,
  });

  final OnboardingRepository onboarding;
  final AuthController auth;
  final VoidCallback? onLinked;

  @override
  State<LinkChildScreen> createState() => _LinkChildScreenState();
}

class _LinkChildScreenState extends State<LinkChildScreen> {
  final _codeFormKey = GlobalKey<FormState>();
  final _requestFormKey = GlobalKey<FormState>();

  final _code = TextEditingController();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _birthDate = TextEditingController();
  final _phone = TextEditingController();

  bool _busy = false;
  String? _error;
  String? _message;
  List<LinkRequest> _requests = const [];

  @override
  void initState() {
    super.initState();
    _loadRequests();
  }

  @override
  void dispose() {
    _code.dispose();
    _firstName.dispose();
    _lastName.dispose();
    _birthDate.dispose();
    _phone.dispose();
    super.dispose();
  }

  String get _token => widget.auth.session?.accessToken ?? '';

  Future<void> _loadRequests() async {
    if (_token.isEmpty) {
      return;
    }

    try {
      final requests = await widget.onboarding.myRequests(token: _token);
      if (mounted) {
        setState(() => _requests = requests);
      }
    } catch (_) {
      // Список заявок — вспомогательный: его отсутствие не мешает ввести код.
    }
  }

  Future<void> _acceptCode() async {
    if (!(_codeFormKey.currentState?.validate() ?? false)) {
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });

    try {
      await widget.onboarding.acceptLinkCode(_code.text, token: _token);
      widget.onLinked?.call();

      if (!mounted) {
        return;
      }

      setState(() {
        _message = 'Ребёнок привязан';
        _code.clear();
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() => _error = _describe(error));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _createRequest() async {
    if (!(_requestFormKey.currentState?.validate() ?? false)) {
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });

    try {
      await widget.onboarding.createRequest(
        firstName: _firstName.text,
        lastName: _lastName.text,
        birthDate: _birthDate.text.trim(),
        phone: _phone.text,
        token: _token,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _message = 'Заявка отправлена. Администратор проверит её и привяжет ребёнка.';
        _firstName.clear();
        _lastName.clear();
        _birthDate.clear();
        _phone.clear();
      });
      await _loadRequests();
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() => _error = _describe(error));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  String _describe(Object error) {
    final text = error.toString();
    if (text.contains('LINK_CODE_INVALID')) {
      return 'Код недействителен или истёк. Попросите тренера выдать новый.';
    }
    if (text.contains('LINK_CODE_ALREADY_LINKED')) {
      return 'Этот ребёнок уже привязан к вашему аккаунту.';
    }
    if (text.contains('LINK_REQUEST_ALREADY_PENDING')) {
      return 'Заявка на этого ребёнка уже ожидает решения.';
    }

    return 'Не удалось выполнить действие. Проверьте соединение и попробуйте ещё раз.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Добавить ребёнка')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          if (_message != null)
            _Banner(text: _message!, tone: _Tone.success),
          if (_error != null) _Banner(text: _error!, tone: _Tone.error),

          Text('Код от тренера', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.xs),
          const Text(
            'Тренер или администратор клуба выдаёт код из 8 символов. '
            'Введите его — ребёнок появится сразу.',
          ),
          const SizedBox(height: AppSpacing.md),
          Form(
            key: _codeFormKey,
            child: Column(
              children: [
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
                FilledButton(
                  onPressed: _busy ? null : _acceptCode,
                  child: const Text('Привязать по коду'),
                ),
              ],
            ),
          ),

          const SizedBox(height: AppSpacing.xl),
          const Divider(),
          const SizedBox(height: AppSpacing.md),

          Text('Заявка вместо кода', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.xs),
          const Text(
            'Если кода нет, расскажите о ребёнке. Администратор найдёт карточку '
            'и подтвердит — до этого данные ребёнка вам не видны.',
          ),
          const SizedBox(height: AppSpacing.md),
          Form(
            key: _requestFormKey,
            child: Column(
              children: [
                TextFormField(
                  controller: _lastName,
                  decoration: const InputDecoration(labelText: 'Фамилия ребёнка'),
                  validator: (value) =>
                      (value ?? '').trim().isEmpty ? 'Укажите фамилию' : null,
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _firstName,
                  decoration: const InputDecoration(labelText: 'Имя ребёнка'),
                  validator: (value) => (value ?? '').trim().isEmpty ? 'Укажите имя' : null,
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _birthDate,
                  decoration: const InputDecoration(
                    labelText: 'Дата рождения (необязательно)',
                    hintText: '2020-08-24',
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Телефон (необязательно)'),
                ),
                const SizedBox(height: AppSpacing.md),
                OutlinedButton(
                  onPressed: _busy ? null : _createRequest,
                  child: const Text('Отправить заявку'),
                ),
              ],
            ),
          ),

          if (_requests.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xl),
            Text('Мои заявки', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            ..._requests.map(
              (request) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${request.lastName} ${request.firstName}'),
                subtitle: Text(
                  request.isRejected
                      ? 'Отклонена: ${request.rejectReason ?? 'без причины'}'
                      : request.isPending
                          ? 'Ожидает решения администратора'
                          : 'Подтверждена',
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

enum _Tone { success, error }

class _Banner extends StatelessWidget {
  const _Banner({required this.text, required this.tone});

  final String text;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    final success = tone == _Tone.success;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: success ? const Color(0xFFE8F5EE) : const Color(0xFFFDECEC),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        style: TextStyle(color: success ? const Color(0xFF2E9E5B) : const Color(0xFFC62828)),
      ),
    );
  }
}
