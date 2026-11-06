import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../auth/auth_controller.dart';

/// Список спортсменов клуба для владельца.
///
/// Отличается от тренерского «Ученики» тем, что показывает всех спортсменов,
/// а не только назначенных: владелец видит клуб целиком. Данные — `/athletes`.
class OwnerAthletesScreen extends StatefulWidget {
  const OwnerAthletesScreen({super.key, required this.auth, required this.client});

  final AuthController auth;
  final ApiClient client;

  @override
  State<OwnerAthletesScreen> createState() => _OwnerAthletesScreenState();
}

class _OwnerAthletesScreenState extends State<OwnerAthletesScreen> {
  static const _pageSize = 30;

  final _searchController = TextEditingController();
  final _scrollController = ScrollController();

  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  String _query = '';
  int _total = 0;
  final List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 240 &&
        !_loadingMore &&
        _items.length < _total) {
      _loadMore();
    }
  }

  Future<void> _load() async {
    final token = widget.auth.session?.accessToken;
    if (token == null) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await widget.client.getJson(
        '/athletes?page=1&limit=$_pageSize'
        '${_query.isEmpty ? '' : '&search=${Uri.encodeQueryComponent(_query)}'}',
        token: token,
      );
      final items = ((response['items'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();
      if (!mounted) {
        return;
      }
      setState(() {
        _items
          ..clear()
          ..addAll(items);
        _total = (response['total'] as num?)?.toInt() ?? items.length;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Не удалось загрузить спортсменов');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    final token = widget.auth.session?.accessToken;
    if (token == null) {
      return;
    }
    setState(() => _loadingMore = true);
    final page = (_items.length ~/ _pageSize) + 1;
    try {
      final response = await widget.client.getJson(
        '/athletes?page=$page&limit=$_pageSize'
        '${_query.isEmpty ? '' : '&search=${Uri.encodeQueryComponent(_query)}'}',
        token: token,
      );
      final items = ((response['items'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();
      if (!mounted) {
        return;
      }
      setState(() => _items.addAll(items));
    } catch (_) {
      // Тихо: пользователь может повторить прокруткой.
    } finally {
      if (mounted) {
        setState(() => _loadingMore = false);
      }
    }
  }

  void _onSearchChanged(String value) {
    setState(() => _query = value.trim());
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Спортсмены',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(
                _total == 0 ? 'Загрузка…' : '$_total в клубе',
                style: const TextStyle(color: AppColors.textSecondary),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _searchController,
                onSubmitted: _onSearchChanged,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Поиск по имени или телефону',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  isDense: true,
                  filled: true,
                  fillColor: AppColors.surfaceMuted,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadius.control),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: 6,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, _) => Container(
          height: 56,
          decoration: BoxDecoration(
            color: AppColors.surfaceMuted,
            borderRadius: BorderRadius.circular(AppRadius.card),
          ),
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off, color: AppColors.danger, size: 40),
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: const Text('Повторить')),
            ],
          ),
        ),
      );
    }

    if (_items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _query.isEmpty ? 'Спортсменов нет' : 'Ничего не найдено',
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
              ),
              const SizedBox(height: 6),
              Text(
                _query.isEmpty
                    ? 'Добавьте первого спортсмена в веб-админке'
                    : 'По запросу «$_query» нет совпадений',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: _items.length + (_loadingMore ? 1 : 0),
        separatorBuilder: (_, _) => const Divider(height: 1),
        itemBuilder: (context, index) {
          if (index >= _items.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }
          return _AthleteTile(athlete: _items[index]);
        },
      ),
    );
  }
}

class _AthleteTile extends StatelessWidget {
  const _AthleteTile({required this.athlete});

  final Map<String, dynamic> athlete;

  @override
  Widget build(BuildContext context) {
    final firstName = athlete['firstName'] as String? ?? '';
    final lastName = athlete['lastName'] as String? ?? '';
    final initials =
        '${firstName.isNotEmpty ? firstName[0] : ''}${lastName.isNotEmpty ? lastName[0] : ''}'
            .toUpperCase();
    final group = athlete['groupName'] as String?;
    final birth = athlete['birthDate'] as String?;
    final status = athlete['status'] as String?;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: 4),
      leading: CircleAvatar(
        backgroundColor: AppColors.accentSoft,
        foregroundColor: AppColors.accentDark,
        child: Text(initials.isEmpty ? '?' : initials,
            style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      title: Text(
        '$lastName $firstName'.trim(),
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        [
          if (group != null && group.isNotEmpty) group,
          if (birth != null && birth.length >= 4) birth.substring(0, 4),
        ].join(' · '),
        style: const TextStyle(fontSize: 12),
      ),
      trailing: _StatusPill(status: status),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});

  final String? status;

  @override
  Widget build(BuildContext context) {
    final (label, color, background) = switch (status) {
      'FROZEN' => ('заморожен', AppColors.warning, const Color(0xFFFFF3E0)),
      'ARCHIVED' => ('архив', AppColors.textSecondary, AppColors.surfaceMuted),
      _ => ('активен', AppColors.success, const Color(0xFFE8F5EE)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }
}
