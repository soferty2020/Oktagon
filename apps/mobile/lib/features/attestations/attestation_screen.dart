import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import 'attestation_controller.dart';
import 'attestation_models.dart';

/// Карточка аттестации: участники, допуск и итог — то, что делают в зале.
///
/// Индивидуальный переход через несколько ступеней здесь недоступен намеренно:
/// это решение комиссии, и его место — веб-админка с обоснованием. В зале
/// нажимают «сдал» по целевой ступени.
class AttestationScreen extends StatefulWidget {
  const AttestationScreen({
    super.key,
    required this.auth,
    required this.controller,
    required this.event,
  });

  final AuthController auth;
  final AttestationController controller;
  final AttestationEvent event;

  @override
  State<AttestationScreen> createState() => _AttestationScreenState();
}

class _AttestationScreenState extends State<AttestationScreen> {
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
    final token = widget.auth.session?.accessToken;
    if (token != null) {
      widget.controller.loadParticipants(token, widget.event.id);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  bool get _editable => widget.event.isEditable;

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;

    return Scaffold(
      appBar: AppBar(title: Text(widget.event.title)),
      body: RefreshIndicator(
        onRefresh: () async {
          final token = widget.auth.session?.accessToken;
          if (token != null) {
            await controller.loadParticipants(token, widget.event.id);
          }
        },
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            if (!_editable)
              const Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(
                  'Мероприятие не в работе: допуск и итоги меняются только в веб-админке.',
                ),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            if (controller.loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (controller.participants.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Text('Участников нет.', textAlign: TextAlign.center),
              )
            else
              ...controller.participants.map(_buildParticipant),
          ],
        ),
      ),
    );
  }

  Widget _buildParticipant(AttestationParticipant participant) {
    final token = widget.auth.session?.accessToken;

    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(participant.athleteName, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 2),
            Text(
              'Цель: ${participant.targetRankLabel} · ${_admissionLabel(participant.admission)}'
              '${participant.paymentStatus == 'PAID' ? ' · оплачено' : ''}',
              style: const TextStyle(color: AppColors.textSecondary),
            ),
            if (participant.result != 'PENDING')
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  participant.result == 'PASSED'
                      ? 'Сдал: ${participant.awardedRankLabel ?? participant.targetRankLabel}'
                      : _resultLabel(participant.result),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            if (_editable && token != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    OutlinedButton(
                      onPressed: () => _setAdmission(token, participant, 'ADMITTED'),
                      child: const Text('Допустить'),
                    ),
                    OutlinedButton(
                      onPressed: () => _setAdmission(token, participant, 'REJECTED'),
                      child: const Text('Не допускать'),
                    ),
                    FilledButton(
                      onPressed: () => _recordResult(token, participant, 'PASSED'),
                      child: const Text('Сдал'),
                    ),
                    OutlinedButton(
                      onPressed: () => _recordResult(token, participant, 'FAILED'),
                      child: const Text('Не сдал'),
                    ),
                    OutlinedButton(
                      onPressed: () => _recordResult(token, participant, 'NO_SHOW'),
                      child: const Text('Не явился'),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _setAdmission(
    String token,
    AttestationParticipant participant,
    String admission,
  ) async {
    final error = await widget.controller.setAdmission(
      token,
      widget.event.id,
      participant.athleteId,
      admission,
    );

    if (mounted) {
      setState(() => _error = error);
    }
  }

  Future<void> _recordResult(
    String token,
    AttestationParticipant participant,
    String result,
  ) async {
    String? reason;

    // Итог уже был — исправление требует причины, иначе история версий теряет
    // смысл. Спрашиваем здесь, а не отправляем и получаем 400.
    if (participant.hasResult) {
      reason = await _askReason();
      if (reason == null) {
        return;
      }
    }

    final error = await widget.controller.recordResult(
      token,
      widget.event.id,
      participant.athleteId,
      result: result,
      reason: reason,
    );

    if (mounted) {
      setState(() => _error = error);
    }
  }

  Future<String?> _askReason() async {
    final controller = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Причина исправления'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Например: ошибка в протоколе'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Сохранить')),
        ],
      ),
    );

    if (confirmed != true || controller.text.trim().isEmpty) {
      return null;
    }

    return controller.text.trim();
  }
}

String _admissionLabel(String admission) {
  return switch (admission) {
    'ADMITTED' => 'допущен',
    'REJECTED' => 'не допущен',
    _ => 'допуск не отмечен',
  };
}

String _resultLabel(String result) {
  return switch (result) {
    'FAILED' => 'Не сдал',
    'NO_SHOW' => 'Не явился',
    'PASSED' => 'Сдал',
    _ => 'Нет итога',
  };
}
