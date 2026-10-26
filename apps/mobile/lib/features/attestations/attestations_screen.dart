import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import 'attestation_controller.dart';
import 'attestation_models.dart';
import 'attestation_screen.dart';

/// Список аттестаций: рабочая часть тренера и администратора.
///
/// Родителю сюда не нужно — он видит опубликованные результаты во вкладке
/// «Спорт». Здесь — мероприятия, где нужно отметить допуск и итог.
class AttestationsScreen extends StatefulWidget {
  const AttestationsScreen({super.key, required this.auth, required this.controller});

  final AuthController auth;
  final AttestationController controller;

  @override
  State<AttestationsScreen> createState() => _AttestationsScreenState();
}

class _AttestationsScreenState extends State<AttestationsScreen> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
    _reload();
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

  Future<void> _reload() async {
    final token = widget.auth.session?.accessToken;
    if (token != null) {
      await widget.controller.loadEvents(token);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Аттестации'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), tooltip: 'Обновить', onPressed: _reload),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            if (controller.loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (controller.error != null)
              _Message(text: controller.error!, icon: Icons.error_outline)
            else if (controller.events.isEmpty)
              const _Message(
                text: 'Мероприятий нет. Их создаёт руководитель клуба в веб-админке.',
                icon: Icons.event_busy,
              )
            else
              ...controller.events.map(
                (event) => _EventCard(
                  event: event,
                  onOpen: () => _open(event),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _open(AttestationEvent event) async {
    final token = widget.auth.session?.accessToken;
    if (token == null) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => AttestationScreen(
          auth: widget.auth,
          controller: widget.controller,
          event: event,
        ),
      ),
    );

    await _reload();
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event, required this.onOpen});

  final AttestationEvent event;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: ListTile(
        onTap: onOpen,
        title: Text(event.title),
        subtitle: Text(
          '${_formatDate(event.scheduledAt)}'
          '${event.location == null ? '' : ' · ${event.location}'}'
          ' · участников ${event.participantsCount}',
        ),
        trailing: Text(_statusLabel(event.status)),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text, required this.icon});

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
      child: Column(
        children: [
          Icon(icon, size: 40),
          const SizedBox(height: AppSpacing.sm),
          Text(text, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

String _statusLabel(String status) {
  return switch (status) {
    'DRAFT' => 'Черновик',
    'PLANNED' => 'Запланировано',
    'IN_PROGRESS' => 'Идёт',
    'COMPLETED' => 'Завершено',
    'PUBLISHED' => 'Опубликовано',
    'CANCELLED' => 'Отменено',
    _ => status,
  };
}

String _formatDate(DateTime value) {
  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];

  return '${value.day} ${months[value.month - 1]} ${value.year}';
}
